import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyEdgeFade, setEdgeColor } from './edgefade';
import { FOREST_KINDS, WORLD_HALF, type City, type LocationId, type PlotId, type Rect } from '../data/city';
import { forestAt } from '../world/gen';
import { clearing, setClearing } from '../world/clearing';
import { Streamer } from './streamer';
import { VehicleLayer } from './vehicles';
import type { OwnedVehicle } from '../sim/vehicles';
import { VEHICLES } from '../data/vehicles';
import type { IssueKind } from '../data/survival';
import type { Link } from '../sim/utilities';
import { badgeTexture } from './badges';
import { daylight, hourOf } from '../sim/clock';
import { CELL, gridRectOf, isEdgeStructure, isLineStructure, STRUCTURES, type StructureDef } from '../data/structures';
import type { Grid } from '../sim/build';
import { edgePostFlags, linksAt, occupiedCells, pieceCenter } from '../sim/build';
import type { Piece } from '../sim/state';
import { animateCharacter, glassMat, lampBulbMat, makeBuilding, makeDirtRoad, makeGasCanopy, makePin, makePlayer, makePlotMarker, makeProp, type CharacterRig } from './models';
import { makeStructure } from './structures';
import { Atmosphere } from './atmosphere';
import { Traffic } from './traffic';

export type PickResult =
  | { type: 'location'; id: LocationId }
  | { type: 'plot'; id: PlotId }
  | { type: 'piece'; id: number }
  | { type: 'vehicle'; id: number };

export interface MapPoint {
  x: number;
  z: number;
}

export interface RendererHandlers {
  onHover(pick: PickResult | null, clientX: number, clientY: number): void;
  onClick(pick: PickResult | null, ground: MapPoint | null): void;
  /** Build mode only: pointer events on the ground, in map coordinates. */
  onBuild?(kind: 'hover' | 'down' | 'move' | 'up', ground: MapPoint | null): void;
}

/**
 * The camera orbits its target. `azimuth` is the angle of the camera around it, seen from above: the camera stands at
 * (cos, sin) in (x, z). The default view looks from the +x/+z corner. Any angle from 0 to 360 degrees is allowed.
 */
const CAM_ELEVATION = THREE.MathUtils.degToRad(52);
const CAM_DISTANCE = 160;
export const DEFAULT_AZIMUTH = Math.PI / 4;
/** The camera can tilt from this low angle up to nearly straight down. At 90 degrees the view has no perspective skew at all. */
const MIN_TILT = THREE.MathUtils.degToRad(30);
const MAX_TILT = THREE.MathUtils.degToRad(88);
const KEY_TILT_RATE = 0.9;
const DRAG_TILT_PER_PX = 0.004;
/** How fast the view turns: radians per second on the keyboard, radians per pixel when dragging. */
const KEY_TURN_RATE = 1.6;
const DRAG_TURN_PER_PX = 0.006;

const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0x4dff88, transparent: true, opacity: 0.5, depthWrite: false });
const GHOST_BAD = new THREE.MeshBasicMaterial({ color: 0xff5a4d, transparent: true, opacity: 0.5, depthWrite: false });

/** The see-through "blueprint" look of the part of a structure that is not built yet. */
const BLUEPRINT = new THREE.MeshStandardMaterial({
  color: 0x7ac8ff, transparent: true, opacity: 0.34, depthWrite: false,
  emissive: 0x1f5f8f, emissiveIntensity: 0.7, roughness: 0.6,
});

/** A structure that is still being built: finished at the bottom, blueprint above. */
interface BuildSite {
  blueprint: THREE.Group;
  solidPlane: THREE.Plane;
  blueprintPlane: THREE.Plane;
  originals: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]>;
  bar: THREE.Sprite | null;
  barCanvas: HTMLCanvasElement | null;
  shownPercent: number;
}

interface PieceView {
  holder: THREE.Group;
  model: THREE.Group;
  rect: Rect;
  /** Height of the finished model in meters. */
  height: number;
  site: BuildSite | null;
  /** Which neighbours a fence, wall or hedge joins (LINK_* bits). */
  links: number | undefined;
}

const MIN_VIEW = 18;
const MAX_VIEW = 130;
const DRAG_THRESHOLD_PX = 5;

/** Shadow map size. The area it covers follows the zoom, so close-ups stay sharp. */
const SHADOW_MAP = 2048;

const DAY_SKY = new THREE.Color(0x9fc9ee);
const DUSK_SKY = new THREE.Color(0xe49a62);
const NIGHT_SKY = new THREE.Color(0x0e1730);
const SUN_DAY = new THREE.Color(0xfff1d6);
const SUN_LOW = new THREE.Color(0xff9b4d);
const MOON = new THREE.Color(0x8fa8d8);
const RAIN_SKY = new THREE.Color(0x5f6872);

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,225,160,1)');
  grad.addColorStop(0.5, 'rgba(255,200,120,0.35)');
  grad.addColorStop(1, 'rgba(255,190,100,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const lampPoolMat = new THREE.MeshBasicMaterial({
  map: makeGlowTexture(),
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function makeGrassTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5f8f48';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(130,175,90,0.35)' : 'rgba(60,100,50,0.35)';
    const s = 2 + rnd() * 5;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(130, 130);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A flat translucent rectangle with an outline, used to show hover and selection on the ground. */
class RectHighlight {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly outlineMaterial: THREE.LineBasicMaterial;

  constructor(color: number, opacity: number) {
    this.fillMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    this.outlineMaterial = new THREE.LineBasicMaterial({ color });
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fillMaterial);
    this.fill.rotation.x = -Math.PI / 2;
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5),
        new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5),
      ]),
      this.outlineMaterial,
    );
    this.group.add(this.fill, outline);
    this.group.renderOrder = 3;
    this.group.visible = false;
  }

  setColor(color: number): void {
    this.fillMaterial.color.setHex(color);
    this.outlineMaterial.color.setHex(color);
  }

  show(r: Rect, y: number): void {
    this.group.position.set(r.x, y, r.z);
    this.group.scale.set(r.w, 1, r.d);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;

  private readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  private readonly hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5a3a, 0.8);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly plotGroups = new Map<PlotId, THREE.Group>();
  private readonly hoverHighlight = new RectHighlight(0xffd54a, 0.28);
  private readonly selectHighlight = new RectHighlight(0x56c2ff, 0.3);
  private readonly waypointPin = makePin(0xffc933);
  private readonly basePin = makePin(0x35c46b);
  /** The walking character, and the arrow that keeps it findable behind trees and roofs. */
  private readonly playerRig: CharacterRig = makePlayer();
  private readonly playerArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.7, 4).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xff7a3a, depthTest: false, transparent: true }),
  );
  private playerPos: MapPoint = { x: 0, z: 8 };
  /** Whether there is a player to follow (on foot or in a vehicle). */
  private hasPlayer = false;
  private vehicleLayer: VehicleLayer | null = null;
  private readonly vehicleRects = new Map<number, Rect>();
  /** The camera follows the player while this is true. Dragging the map lets go until the player moves again. */
  private following = true;

  private city: City | null = null;
  private handlers: RendererHandlers | null = null;
  private target = new THREE.Vector3(0, 0, 8);
  private desired = new THREE.Vector3(0, 0, 8);
  private viewSize = 95;
  private viewSizeTarget = 95;
  private azimuth = DEFAULT_AZIMUTH;
  private azimuthTarget = DEFAULT_AZIMUTH;
  /** Angle of the camera above the ground. */
  private elevation = CAM_ELEVATION;
  private elevationTarget = CAM_ELEVATION;
  /** Ground point that stays put on screen while a pointer zoom eases. */
  private zoomAnchor: THREE.Vector3 | null = null;
  private zoomAnchorScreen = { x: 0, y: 0 };
  private time = 0;
  private waypointPos: MapPoint | null = null;
  private basePos: MapPoint | null = null;
  private interactive = true;
  private buildMode = false;
  private readonly pieceViews = new Map<number, PieceView>();
  private readonly spinners = new Map<number, THREE.Object3D[]>();
  private ghost: { type: string; links: number | undefined; group: THREE.Group; meshes: THREE.Mesh[]; valid: boolean } | null = null;
  private gridLines: THREE.LineSegments | null = null;
  /** The tile under the placement preview. */
  private readonly footprintTile = new RectHighlight(0x4dff88, 0.3);
  /** Cars and traffic lights. Created once the city is built. */
  traffic: Traffic | null = null;
  /** Clouds, birds, fireflies and rain. */
  readonly atmosphere: Atmosphere;
  private ownedId: PlotId | null = null;
  private ownedRect: Rect | null = null;
  /** Draws the chunks of the world near the player. Created once the city is built. */
  streamer: Streamer | null = null;
  private readonly looseProps: Array<{ group: THREE.Object3D; x: number; z: number }> = [];
  /** Warning signs floating above structures that have a problem, by piece id. */
  private readonly warnSprites = new Map<number, { sprite: THREE.Sprite; kind: IssueKind }>();
  /** Dashed lines showing which structures are joined to the power and water networks. */
  private readonly linkLines: Record<'power' | 'water', THREE.Group | null> = { power: null, water: null };
  private linkKey = '';
  private linkData: Link[] = [];
  private linkEdges = 0;
  private utilityView = false;
  /** The structure whose connections are shown because it is selected. */
  private focusPieceId: number | null = null;
  private readonly linkMaterials = {
    cable: new THREE.MeshStandardMaterial({ color: 0x24211b, emissive: 0xffb300, emissiveIntensity: 0.3, roughness: 0.55 }),
    lug: new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xffa500, emissiveIntensity: 0.9, roughness: 0.4 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x2b86b3, emissive: 0x0a3550, emissiveIntensity: 0.5, roughness: 0.5 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x3aa6d8, emissiveIntensity: 0.7, roughness: 0.4 }),
  };
  private shadowHalf = 0;
  private frameCount = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const params = new URLSearchParams(window.location.search);
    // Very sharp screens would draw four times the pixels for little visible gain, so the resolution is capped.
    // ?quality=high lifts the cap, ?quality=low also turns shadows off for slow computers.
    const quality = params.get('quality');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = quality !== 'low';
    // The shadow map is redrawn every other frame; moving things are smooth enough and it halves the shadow cost
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.localClippingEnabled = true; // used to show buildings rising as they are built
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 700);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.fitShadow(70);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.add(this.hoverHighlight.group, this.selectHighlight.group, this.footprintTile.group, this.waypointPin, this.basePin, this.playerRig.group, this.playerArrow);
    this.playerArrow.renderOrder = 20;
    this.atmosphere = new Atmosphere(this.scene);
    this.waypointPin.visible = false;
    this.basePin.visible = false;
    this.playerRig.group.visible = false;
    this.playerArrow.visible = false;

    window.addEventListener('resize', () => this.resize());
    this.attachPointerEvents();
    this.resize();
  }

  setHandlers(h: RendererHandlers): void {
    this.handlers = h;
  }

  /** When false, hovering and clicking do nothing (used during travel and while dialogs are open). */
  setInteractive(value: boolean): void {
    this.interactive = value;
    if (!value) this.hoverHighlight.hide();
  }

  // ------------------------------------------------------------ City

  buildCity(city: City): void {
    this.city = city;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_HALF * 2 + 400, WORLD_HALF * 2 + 400),
      applyEdgeFade(new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const flat = (r: Rect, color: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x, y, r.z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    for (const r of city.roads) flat(r, 0x3a3d42, 0.02);
    for (const p of city.pavements) flat(p, 0x9a9a94, 0.04);

    // Lane markings (instanced)
    const dashes: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    for (const r of city.roads) {
      const horizontal = r.w > r.d;
      const len = horizontal ? r.w : r.d;
      for (let t = -len / 2 + 2; t < len / 2 - 2; t += 6) {
        const cx = horizontal ? r.x + t : r.x;
        const cz = horizontal ? r.z : r.z + t;
        if (r.d >= 10 && r.w >= 10 && Math.abs(cx) < 7 && Math.abs(cz) < 7) continue;
        m4.makeRotationY(horizontal ? 0 : Math.PI / 2);
        m4.setPosition(cx, 0.06, cz);
        dashes.push(m4.clone());
      }
    }
    const dashMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3, 0.02, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xe6d37a, roughness: 0.9 }),
      dashes.length,
    );
    dashes.forEach((m, i) => dashMesh.setMatrixAt(i, m));
    dashMesh.receiveShadow = true;
    this.scene.add(dashMesh);

    for (const b of city.buildings) {
      const group = makeBuilding(b);
      this.scene.add(group);
      const pickable = b.kind !== 'house';
      if (pickable) this.registerPick(group, { type: 'location', id: b.id as LocationId });
      if (b.kind === 'gas') {
        const canopy = makeGasCanopy(b);
        this.scene.add(canopy);
        this.registerPick(canopy, { type: 'location', id: b.id as LocationId });
      }
    }
    for (const p of city.plots) this.addPlot(p.id, false);
    for (const p of city.props) {
      if (FOREST_KINDS.includes(p.kind)) continue;
      const prop = makeProp(p);
      this.scene.add(prop);
      this.looseProps.push({ group: prop, x: p.x, z: p.z });
    }
    for (const road of city.dirtRoads) this.scene.add(makeDirtRoad(road));
    this.traffic = new Traffic(this.scene, city);
    this.streamer = new Streamer(this.scene);
    this.vehicleLayer = new VehicleLayer(this.scene);
    this.streamer.loadAround(0, 8);

    // Soft pools of light on the ground under street lamps (fade in at night)
    const lamps = city.props.filter((p) => p.kind === 'lamp');
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(12, 12), lampPoolMat, lamps.length);
    lamps.forEach((l, i) => {
      m4.makeRotationX(-Math.PI / 2);
      m4.setPosition(l.x + 0.85, 0.08, l.z);
      pools.setMatrixAt(i, m4);
    });
    pools.renderOrder = 2;
    this.scene.add(pools);
  }

  private registerPick(obj: THREE.Object3D, pick: PickResult): void {
    obj.userData.pick = pick;
    this.pickables.push(obj);
  }

  private addPlot(id: PlotId, owned: boolean, land?: Rect): void {
    const def = this.city!.plots.find((p) => p.id === id)!;
    const old = this.plotGroups.get(id);
    if (old) {
      this.scene.remove(old);
      const i = this.pickables.indexOf(old);
      if (i >= 0) this.pickables.splice(i, 1);
    }
    const group = makePlotMarker(def, owned, land ?? def.bounds);
    this.scene.add(group);
    this.registerPick(group, { type: 'plot', id });
    this.plotGroups.set(id, group);
  }

  /** Show which plot is the player's base. */
  setOwnedPlot(id: PlotId | null, land?: Rect): void {
    if (!this.city) return;
    this.ownedId = id;
    this.ownedRect = id && land ? land : null;
    for (const p of this.city.plots) this.addPlot(p.id, p.id === id, p.id === id ? this.ownedRect ?? undefined : undefined);
    const before = clearing();
    if (this.ownedRect) this.clearLand(this.ownedRect);
    else if (before) {
      setClearing(null);
      this.streamer?.refreshNear(before);
    }
  }

  /** The point on the map at the center of the screen. */
  get focus(): MapPoint {
    return { x: this.target.x, z: this.target.z };
  }

  /** What the camera is looking at, for mixing the ambient sound. */
  soundScene(): { forest: number; traffic: number; rain: number } {
    const cars = this.traffic ? this.traffic.countNear(this.target.x, this.target.z, 70) : 0;
    return {
      forest: forestAt(this.target.x, this.target.z),
      traffic: Math.min(1, cars / 6),
      rain: this.atmosphere.rain,
    };
  }

  setMarkers(waypoint: MapPoint | null, base: MapPoint | null): void {
    this.waypointPos = waypoint;
    this.basePos = base;
    this.waypointPin.visible = !!waypoint;
    this.basePin.visible = !!base;
  }

  /** Put the walking character on the map. heading is the direction it faces (0 faces +z) and speed how fast it walks, in m/s. */
  setPlayer(pos: MapPoint | null, heading = 0, speed = 0, hidden = false): void {
    const rig = this.playerRig;
    this.hasPlayer = !!pos;
    rig.group.visible = !!pos && !hidden;
    this.playerArrow.visible = !!pos && !hidden;
    if (!pos) return;
    this.playerPos = { x: pos.x, z: pos.z };
    rig.group.position.set(pos.x, 0, pos.z);
    rig.group.rotation.y = heading;
    animateCharacter(rig, this.time, speed);
    if (speed > 0.1) this.following = true;
  }

  /** Show the player's vehicles where they are. */
  syncVehicles(vehicles: readonly OwnedVehicle[]): void {
    this.vehicleLayer?.sync(vehicles, this.playerPos);
    this.vehicleRects.clear();
    for (const v of vehicles) {
      const d = VEHICLES[v.type];
      const sideways = Math.abs(Math.sin(v.heading)) > 0.7;
      this.vehicleRects.set(v.id, { x: v.x, z: v.z, w: sideways ? d.length : d.width, d: sideways ? d.width : d.length });
    }
  }

  /** The camera stays on the player. */
  followPlayer(on: boolean): void {
    this.following = on;
  }

  /** Where the player stands, as last reported. */
  get playerAt(): MapPoint {
    return { x: this.playerPos.x, z: this.playerPos.z };
  }

  // ------------------------------------------------------------ Highlights and picking

  private rectFor(pick: PickResult): Rect | null {
    const city = this.city;
    if (!city) return null;
    if (pick.type === 'plot') {
      if (pick.id === this.ownedId && this.ownedRect) return this.ownedRect;
      return city.plots.find((p) => p.id === pick.id)?.bounds ?? null;
    }
    if (pick.type === 'piece') return this.pieceViews.get(pick.id)?.rect ?? null;
    if (pick.type === 'vehicle') return this.vehicleRects.get(pick.id) ?? null;
    const idx = city.locations.findIndex((l) => l.id === pick.id);
    if (idx < 0) return null;
    const b = city.locations[idx].building;
    const pad = city.pavements[idx];
    const minX = Math.min(b.x - b.w / 2, pad ? pad.x - pad.w / 2 : Infinity) - 1;
    const maxX = Math.max(b.x + b.w / 2, pad ? pad.x + pad.w / 2 : -Infinity) + 1;
    const minZ = Math.min(b.z - b.d / 2, pad ? pad.z - pad.d / 2 : Infinity) - 1;
    const maxZ = Math.max(b.z + b.d / 2, pad ? pad.z + pad.d / 2 : -Infinity) + 1;
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
  }

  /** Screen position (client pixels) of a point on the map. Used by tests and tooling. */
  project(p: MapPoint, height = 2): { x: number; y: number } {
    const v = new THREE.Vector3(p.x, height, p.z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** Point on the ground under a screen position. */
  pickGround(clientX: number, clientY: number): MapPoint | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) ? { x: out.x, z: out.z } : null;
  }

  setBuildMode(on: boolean): void {
    this.buildMode = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
    if (!on) this.setGhost(null, null, 0, true);
    this.rebuildLinks();
  }

  /**
   * Remove the trees, bushes, rocks and loose props that stand on land the player now owns, and thin out the
   * woods just outside it so the base can be seen from any side. The edge of the clearing is ragged, not a straight cut.
   */
  clearLand(land: Rect): void {
    const margin = 1.2;
    setClearing(land);
    this.streamer?.refreshNear(land);
    for (const p of this.looseProps) {
      if (Math.abs(p.x - land.x) <= land.w / 2 + margin && Math.abs(p.z - land.z) <= land.d / 2 + margin) p.group.visible = false;
    }
  }

  /** Show a rectangle on the ground (for example the land you could buy). Pass null to hide it. */
  previewRect(r: Rect | null): void {
    if (r) this.hoverHighlight.show(r, 0.1);
    else this.hoverHighlight.hide();
  }

  /** Draw the plot's building grid, or remove it. */
  setGrid(grid: Grid | null): void {
    if (this.gridLines) {
      this.scene.remove(this.gridLines);
      this.gridLines.geometry.dispose();
      this.gridLines = null;
    }
    if (!grid) return;
    const pts: THREE.Vector3[] = [];
    const gx0 = grid.originX + grid.minCx * CELL;
    const gx1 = grid.originX + grid.maxCx * CELL;
    const gz0 = grid.originZ + grid.minCz * CELL;
    const gz1 = grid.originZ + grid.maxCz * CELL;
    for (let i = grid.minCx; i <= grid.maxCx; i++) pts.push(new THREE.Vector3(grid.originX + i * CELL, 0.09, gz0), new THREE.Vector3(grid.originX + i * CELL, 0.09, gz1));
    for (let j = grid.minCz; j <= grid.maxCz; j++) pts.push(new THREE.Vector3(gx0, 0.09, grid.originZ + j * CELL), new THREE.Vector3(gx1, 0.09, grid.originZ + j * CELL));
    this.gridLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }),
    );
    this.gridLines.renderOrder = 2;
    this.scene.add(this.gridLines);
  }

  /** Show a see-through preview of a structure. `center` is null to hide it. */
  setGhost(type: string | null, center: MapPoint | null, rot: number, valid: boolean, links?: number): void {
    if (!type || !center || !STRUCTURES[type]) {
      if (this.ghost) this.ghost.group.visible = false;
      this.footprintTile.hide();
      return;
    }
    const def = STRUCTURES[type];
    const edge = isEdgeStructure(def);
    const box = gridRectOf(def, 0, 0, rot);
    // The tile under the preview shows exactly where the piece will stand: its tiles, or the grid line for a fence
    this.footprintTile.setColor(valid ? 0x4dff88 : 0xff5a4a);
    this.footprintTile.show({ x: center.x, z: center.z, w: edge && rot % 2 === 1 ? 0.9 : box.w, d: edge && rot % 2 === 0 ? 0.9 : box.d }, 0.12);
    if (!this.ghost || this.ghost.type !== type || this.ghost.links !== links) {
      if (this.ghost) this.scene.remove(this.ghost.group);
      const group = makeStructure(def, links);
      const meshes: THREE.Mesh[] = [];
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
          meshes.push(m);
        }
      });
      this.ghost = { type, links, group, meshes, valid: !valid };
      this.scene.add(group);
    }
    const g = this.ghost;
    g.group.visible = true;
    g.group.position.set(center.x, 0, center.z);
    g.group.rotation.y = edge ? (rot % 2 === 1 ? -Math.PI / 2 : 0) : isLineStructure(def) ? 0 : rot * (Math.PI / 2);
    if (g.valid !== valid) {
      g.valid = valid;
      const material = valid ? GHOST_OK : GHOST_BAD;
      for (const m of g.meshes) m.material = material;
    }
  }

  /** Create, move and remove the 3D models of placed structures to match the game state. */
  syncPieces(pieces: Piece[], grid: Grid | null): void {
    const seen = new Set<number>();
    const occupied = occupiedCells(pieces);
    const posts = edgePostFlags(pieces);
    /** What a piece's model needs to know about its neighbours: corner posts for fences, joined sides for hedges. */
    const linksFor = (p: Piece, def: StructureDef): number | undefined =>
      isEdgeStructure(def) ? (def.look.model === 'gate' ? undefined : posts.get(p.id) ?? 0) : isLineStructure(def) ? linksAt(occupied, p.cx, p.cz) : undefined;
    if (grid) {
      for (const p of pieces) {
        const def = STRUCTURES[p.type];
        if (!def) continue;
        seen.add(p.id);
        let view = this.pieceViews.get(p.id);
        if (!view) {
          const links = linksFor(p, def);
          const holder = new THREE.Group();
          const model = makeStructure(def, links);
          holder.add(model);
          this.scene.add(holder);
          this.registerPick(holder, { type: 'piece', id: p.id });
          const height = Math.max(0.6, new THREE.Box3().setFromObject(model).max.y);
          view = { holder, model, rect: { x: 0, z: 0, w: 0, d: 0 }, height, site: null, links };
          this.pieceViews.set(p.id, view);
          const spin: THREE.Object3D[] = [];
          model.traverse((o) => {
            if (o.userData.spin) spin.push(o);
          });
          if (spin.length) this.spinners.set(p.id, spin);
        }
        const c = pieceCenter(grid, p.type, p.cx, p.cz, p.rot);
        const box = gridRectOf(def, p.cx, p.cz, p.rot);
        const edge = isEdgeStructure(def);
        // A fence, wall or hedge redraws when a neighbour is added or taken away, so corners and joins stay right
        if (edge || isLineStructure(def)) {
          const links = linksFor(p, def);
          if (links !== view.links) this.rebuildPiece(view, def, links, p.progress);
        }
        view.holder.position.set(c.x, 0, c.z);
        // Hedges ignore rotation. Pieces on a grid line turn so their start post stays at the start corner.
        view.holder.rotation.y = edge ? (p.rot % 2 === 1 ? -Math.PI / 2 : 0) : isLineStructure(def) ? 0 : p.rot * (Math.PI / 2);
        view.rect = { x: c.x, z: c.z, w: box.w, d: box.d };

        const building = p.progress < 1;
        if (building && !view.site) this.startSite(view, def);
        if (!building && view.site) this.finishSite(view);
        if (view.site) this.updateSite(view, p.progress);
      }
    }
    for (const [id, view] of this.pieceViews) {
      if (seen.has(id)) continue;
      if (view.site) this.finishSite(view);
      this.scene.remove(view.holder);
      const i = this.pickables.indexOf(view.holder);
      if (i >= 0) this.pickables.splice(i, 1);
      this.pieceViews.delete(id);
      this.spinners.delete(id);
    }
  }

  /**
   * Show an unfinished structure at its full size: the part that is built is solid and rises from the ground,
   * and the rest is a see-through blueprint. The model is never squashed into the ground.
   */
  private startSite(view: PieceView, def: StructureDef): void {
    view.holder.updateMatrixWorld(true);
    view.height = Math.max(0.6, new THREE.Box3().setFromObject(view.model).max.y);

    const solidPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // keeps what is below the line
    const blueprintPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // keeps what is above it
    const originals: BuildSite['originals'] = [];
    const clipped = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      c.clippingPlanes = [solidPlane];
      return c;
    };
    view.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      originals.push([mesh, mesh.material]);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clipped) : clipped(mesh.material);
    });

    const blueprint = makeStructure(def, view.links);
    const bpMaterial = BLUEPRINT.clone();
    bpMaterial.clippingPlanes = [blueprintPlane];
    blueprint.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = bpMaterial;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    view.holder.add(blueprint);
    view.site = { blueprint, solidPlane, blueprintPlane, originals, bar: null, barCanvas: null, shownPercent: -1 };
  }

  private updateSite(view: PieceView, progress: number): void {
    const site = view.site!;
    const h = Math.max(0.001, progress * view.height);
    site.solidPlane.constant = h;
    site.blueprintPlane.constant = -h;

    // A small progress bar above anything that is actively being worked on
    const percent = Math.round(progress * 100);
    if (progress <= 0) {
      if (site.bar) site.bar.visible = false;
      return;
    }
    if (!site.bar) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 16;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
      sprite.scale.set(2.6, 0.33, 1);
      sprite.position.set(0, view.height + 1.2, 0);
      sprite.renderOrder = 10;
      view.holder.add(sprite);
      site.bar = sprite;
      site.barCanvas = canvas;
    }
    site.bar.visible = true;
    if (percent !== site.shownPercent) {
      site.shownPercent = percent;
      const ctx = site.barCanvas!.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 16);
      ctx.fillStyle = 'rgba(8,12,20,0.85)';
      ctx.fillRect(0, 0, 128, 16);
      ctx.fillStyle = '#4dc4ff';
      ctx.fillRect(2, 2, (124 * percent) / 100, 12);
      (site.bar.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }
  }

  private finishSite(view: PieceView): void {
    const site = view.site;
    if (!site) return;
    for (const [mesh, original] of site.originals) {
      const current = mesh.material;
      mesh.material = original;
      for (const m of Array.isArray(current) ? current : [current]) m.dispose();
    }
    view.holder.remove(site.blueprint);
    if (site.bar) {
      view.holder.remove(site.bar);
      (site.bar.material as THREE.SpriteMaterial).map?.dispose();
      site.bar.material.dispose();
    }
    view.site = null;
  }

  /** What one frame costs to draw, and how much graphics memory the scene holds. */
  perf(): { calls: number; triangles: number; geometries: number; textures: number; instances: number; pixelRatio: number; meshes: number; heavy: string[] } {
    const info = this.renderer.info;
    // Which top-level objects own the most meshes (each mesh is a draw call)
    let meshes = 0;
    const owners: Array<[number, string]> = [];
    for (const child of this.scene.children) {
      let n = 0;
      child.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
      meshes += n;
      if (n >= 6) owners.push([n, `${child.type}@${Math.round(child.position.x)},${Math.round(child.position.z)}`]);
    }
    owners.sort((a, b) => b[0] - a[0]);
    const summary = new Map<number, number>();
    for (const [n] of owners) summary.set(n, (summary.get(n) ?? 0) + 1);
    return {
      meshes,
      heavy: [...summary.entries()].sort((a, b) => b[0] * b[1] - a[0] * a[1]).slice(0, 8).map(([n, count]) => `${count} objects x ${n} meshes`),
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      instances: this.streamer?.count ?? 0,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  /** Move the camera to a placed structure. */
  focusPiece(id: number): void {
    const view = this.pieceViews.get(id);
    if (view) this.focusOn({ x: view.rect.x, z: view.rect.z });
  }

  /** Show a warning sign above each listed structure, and remove the ones that are no longer needed. */
  setWarnings(warnings: Map<number, IssueKind>): void {
    for (const [id, entry] of this.warnSprites) {
      const view = this.pieceViews.get(id);
      if (warnings.has(id) && view && warnings.get(id) === entry.kind) continue;
      entry.sprite.parent?.remove(entry.sprite);
      entry.sprite.material.dispose();
      this.warnSprites.delete(id);
    }
    for (const [id, kind] of warnings) {
      const view = this.pieceViews.get(id);
      if (!view || view.site || this.warnSprites.has(id)) continue;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(kind), transparent: true, depthTest: false }));
      sprite.scale.set(2.6, 2.6, 1);
      sprite.position.set(0, view.height + 2.1, 0);
      sprite.renderOrder = 12;
      sprite.userData.baseY = view.height + 2.1;
      view.holder.add(sprite);
      this.warnSprites.set(id, { sprite, kind });
    }
  }

  /**
   * Remember which structures are joined. Nothing is drawn all the time, because a base full of criss-crossing lines
   * looks like a mess. Lines show while the utility view is on, while you are placing something, and for the
   * structure you have selected.
   */
  setLinks(links: Link[]): void {
    this.linkData = links;
    this.rebuildLinks();
  }

  /** Show every power cable and water pipe, or hide them again. */
  setUtilityView(on: boolean): void {
    this.utilityView = on;
    this.rebuildLinks();
  }

  get utilityViewOn(): boolean {
    return this.utilityView;
  }

  private rebuildLinks(): void {
    const showAll = this.utilityView || this.buildMode;
    const focus = showAll ? null : this.focusPieceId;
    const key = `${showAll}|${focus}|` + this.linkData.map((l) => `${l.kind[0]}${l.a}-${l.b}`).join(',') + '|' + [...this.pieceViews.keys()].join(',');
    if (key === this.linkKey) return;
    this.linkKey = key;
    this.linkEdges = 0;
    for (const kind of ['power', 'water'] as const) {
      const old = this.linkLines[kind];
      if (old) {
        this.scene.remove(old);
        old.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.linkLines[kind] = null;
      }
    }
    if (!showAll && focus === null) return;

    for (const kind of ['power', 'water'] as const) {
      let edges = this.linkData.filter((l) => l.kind === kind);
      if (focus !== null) {
        // Only the network the selected structure belongs to
        const seen = new Set<number>([focus]);
        for (let grew = true; grew; ) {
          grew = false;
          for (const e of edges) {
            if (seen.has(e.a) !== seen.has(e.b)) {
              seen.add(e.a);
              seen.add(e.b);
              grew = true;
            }
          }
        }
        edges = edges.filter((e) => seen.has(e.a) && seen.has(e.b));
      }
      // Draw a spanning tree: the shortest set of runs that still joins everything, so there are no tangles
      const parent = new Map<number, number>();
      const find = (id: number): number => {
        let r = id;
        while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
        return r;
      };
      const runs: Array<{ a: PieceView; b: PieceView; length: number }> = [];
      for (const e of edges) {
        const a = this.pieceViews.get(e.a);
        const b = this.pieceViews.get(e.b);
        if (a && b) runs.push({ a, b, length: Math.hypot(a.holder.position.x - b.holder.position.x, a.holder.position.z - b.holder.position.z) });
      }
      runs.sort((x, y) => x.length - y.length);
      const ids = new Map<PieceView, number>();
      for (const e of edges) {
        const a = this.pieceViews.get(e.a);
        const b = this.pieceViews.get(e.b);
        if (a) ids.set(a, e.a);
        if (b) ids.set(b, e.b);
      }
      const tree = runs.filter((r) => {
        const ra = find(ids.get(r.a)!);
        const rb = find(ids.get(r.b)!);
        if (ra === rb) return false;
        parent.set(ra, rb);
        return true;
      });
      if (tree.length === 0) continue;
      this.linkEdges += tree.length;
      const group = kind === 'power' ? this.makeCables(tree) : this.makePipes(tree);
      this.scene.add(group);
      this.linkLines[kind] = group;
    }
  }

  /** Power: dark cables with a little sag, hung between the tops of the connected structures, with amber lugs at each end. */
  private makeCables(runs: Array<{ a: PieceView; b: PieceView }>): THREE.Group {
    const cable: THREE.BufferGeometry[] = [];
    const lugs: THREE.BufferGeometry[] = [];
    const top = (v: PieceView) => Math.min(4.8, Math.max(1.1, v.height * 0.92));
    for (const { a, b } of runs) {
      const A = new THREE.Vector3(a.holder.position.x, top(a), a.holder.position.z);
      const B = new THREE.Vector3(b.holder.position.x, top(b), b.holder.position.z);
      const mid = A.clone().lerp(B, 0.5);
      mid.y -= Math.min(1.4, 0.05 * A.distanceTo(B) + 0.15);
      cable.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(A, mid, B), 14, 0.045, 5, false));
      for (const p of [A, B]) lugs.push(new THREE.SphereGeometry(0.13, 8, 6).translate(p.x, p.y, p.z));
    }
    const group = new THREE.Group();
    const wire = new THREE.Mesh(mergeGeometries(cable)!, this.linkMaterials.cable);
    const ends = new THREE.Mesh(mergeGeometries(lugs)!, this.linkMaterials.lug);
    for (const m of [wire, ends]) {
      m.renderOrder = 6;
      m.castShadow = false;
      group.add(m);
    }
    return group;
  }

  /** Water: pipes lying on the ground with square corners, as a plumber would run them, with a cap where each one joins. */
  private makePipes(runs: Array<{ a: PieceView; b: PieceView }>): THREE.Group {
    const pipes: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    const width = 0.3;
    const y = 0.09;
    const segment = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) return;
      const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
      const g = new THREE.BoxGeometry(horizontal ? len + width : width, 0.12, horizontal ? width : len + width);
      g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      pipes.push(g);
    };
    for (const { a, b } of runs) {
      const ax = a.holder.position.x;
      const az = a.holder.position.z;
      const bx = b.holder.position.x;
      const bz = b.holder.position.z;
      // Run along the longer leg first
      if (Math.abs(bx - ax) >= Math.abs(bz - az)) {
        segment(ax, az, bx, az);
        segment(bx, az, bx, bz);
      } else {
        segment(ax, az, ax, bz);
        segment(ax, bz, bx, bz);
      }
      for (const [x, z] of [[ax, az], [bx, bz]]) caps.push(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 12).translate(x, y + 0.02, z));
    }
    const group = new THREE.Group();
    const pipe = new THREE.Mesh(mergeGeometries(pipes)!, this.linkMaterials.pipe);
    const cap = new THREE.Mesh(mergeGeometries(caps)!, this.linkMaterials.cap);
    for (const m of [pipe, cap]) {
      m.renderOrder = 5;
      m.castShadow = false;
      m.receiveShadow = false;
      group.add(m);
    }
    return group;
  }

  /** Replace a piece's model with one drawn for new neighbours, keeping any building-in-progress look. */
  private rebuildPiece(view: PieceView, def: StructureDef, links: number | undefined, progress: number): void {
    const wasBuilding = view.site !== null;
    if (view.site) this.finishSite(view);
    view.holder.remove(view.model);
    view.model = makeStructure(def, links);
    view.holder.add(view.model);
    view.links = links;
    view.height = Math.max(0.6, new THREE.Box3().setFromObject(view.model).max.y);
    if (wasBuilding && progress < 1) this.startSite(view, def);
  }

  /** Numbers about the placed structures, for tests. */
  pieceStats(): { total: number; underConstruction: number; minScaleY: number; warnings: number; links: number; linksShown: number } {
    let minScaleY = 1;
    let under = 0;
    for (const v of this.pieceViews.values()) {
      minScaleY = Math.min(minScaleY, v.holder.scale.y);
      if (v.site) under++;
    }
    return { total: this.pieceViews.size, underConstruction: under, minScaleY, warnings: this.warnSprites.size, links: this.linkData.length, linksShown: this.linkEdges };
  }
  setHover(pick: PickResult | null): void {
    const r = pick ? this.rectFor(pick) : null;
    if (r) this.hoverHighlight.show(r, 0.1);
    else this.hoverHighlight.hide();
  }

  setSelected(pick: PickResult | null): void {
    const id = pick?.type === 'piece' ? pick.id : null;
    if (id !== this.focusPieceId) {
      this.focusPieceId = id;
      this.rebuildLinks();
    }
    const r = pick ? this.rectFor(pick) : null;
    if (r) this.selectHighlight.show(r, 0.11);
    else this.selectHighlight.hide();
  }

  pick(clientX: number, clientY: number): PickResult | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.pickables, ...(this.vehicleLayer?.pickables ?? [])], true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.pick) return o.userData.pick as PickResult;
        o = o.parent;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Camera

  focusOn(p: MapPoint): void {
    this.following = false;
    this.zoomAnchor = null;
    this.desired.set(p.x, 0, p.z);
    this.clampTarget(this.desired);
  }

  /** Jump to a place: the world around it is drawn at once and the camera is put there. */
  jumpTo(p: MapPoint): void {
    this.playerPos = { x: p.x, z: p.z };
    this.leash = true;
    this.streamer?.loadAround(p.x, p.z);
    this.following = true;
    this.desired.set(p.x, 0, p.z);
    this.clampTarget(this.desired);
    this.target.copy(this.desired);
  }

  /** Snap the camera without easing. */
  snapTo(p: MapPoint): void {
    this.focusOn(p);
    this.target.copy(this.desired);
  }

  /** The camera may wander this far from the player (meters), so it never looks at ground that is not drawn. */
  private static readonly LEASH = 140;
  /** Tests turn this off to look at distant places without walking there. */
  leash = true;

  private clampTarget(v: THREE.Vector3): void {
    const b = this.city?.bounds ?? { minX: -94, maxX: 94, minZ: -94, maxZ: 94 };
    v.x = THREE.MathUtils.clamp(v.x, b.minX, b.maxX);
    v.z = THREE.MathUtils.clamp(v.z, b.minZ, b.maxZ);
    if (this.leash && this.hasPlayer) {
      v.x = THREE.MathUtils.clamp(v.x, this.playerPos.x - GameRenderer.LEASH, this.playerPos.x + GameRenderer.LEASH);
      v.z = THREE.MathUtils.clamp(v.z, this.playerPos.z - GameRenderer.LEASH, this.playerPos.z + GameRenderer.LEASH);
    }
  }

  /** Ground direction that points to the right of the screen. */
  private screenRight(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
  }

  /** Ground direction that points up the screen (away from the camera). */
  private screenUp(): THREE.Vector3 {
    return new THREE.Vector3(-Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
  }

  /** Ground directions of 'up the screen' and 'right on the screen', as unit vectors. Walking keys follow the view. */
  get groundAxes(): { up: MapPoint; right: MapPoint } {
    const up = this.screenUp();
    const right = this.screenRight();
    return { up: { x: up.x, z: up.z }, right: { x: right.x, z: right.z } };
  }

  /** The angle the camera stands at around its target, in radians. Used by the compass. */
  get viewAngle(): number {
    return this.azimuth;
  }

  /** Turn the view by an angle in radians. Positive turns it counter-clockwise as seen from above. */
  turn(delta: number, instant = false): void {
    this.azimuthTarget += delta;
    if (instant) this.azimuth = this.azimuthTarget;
    this.zoomAnchor = null;
  }

  /** The camera's angle above the ground, in radians. */
  get viewTilt(): number {
    return this.elevation;
  }

  /** Tilt the view by an angle in radians. Positive looks more from above. */
  tilt(delta: number, instant = false): void {
    this.elevationTarget = THREE.MathUtils.clamp(this.elevationTarget + delta, MIN_TILT, MAX_TILT);
    if (instant) this.elevation = this.elevationTarget;
    this.zoomAnchor = null;
  }

  /** Tilt with the keyboard. dir is 1 (toward top-down), -1 (toward the horizon) or 0. */
  keyTilt(dir: number, dt: number): void {
    if (dir !== 0) this.tilt(dir * KEY_TILT_RATE * dt, true);
  }

  /** A button press: turn to the next multiple of 45 degrees, so the base always lands on a clean view. */
  stepTurn(dir: number): void {
    const step = Math.PI / 4;
    const k = Math.round((this.azimuthTarget - DEFAULT_AZIMUTH) / step);
    this.azimuthTarget = DEFAULT_AZIMUTH + (k + dir) * step;
    this.zoomAnchor = null;
  }

  /** A button press: tilt by a fixed step. */
  stepTilt(dir: number): void {
    this.tilt(dir * THREE.MathUtils.degToRad(14));
  }

  /** Turn with the keyboard. dir is 1 (counter-clockwise), -1 (clockwise) or 0. */
  keyTurn(dir: number, dt: number): void {
    if (dir !== 0) this.turn(dir * KEY_TURN_RATE * dt, true);
  }

  /** Go back to the default view, by the shorter way round. */
  resetView(): void {
    const full = Math.PI * 2;
    const diff = ((((DEFAULT_AZIMUTH - this.azimuth) % full) + full + Math.PI) % full) - Math.PI;
    this.azimuthTarget = this.azimuth + diff;
    this.elevationTarget = CAM_ELEVATION;
  }

  /** Ease the turn toward its target. */
  private easeTurn(realDt: number): void {
    const lift = this.elevationTarget - this.elevation;
    this.elevation = Math.abs(lift) < 1e-4 ? this.elevationTarget : this.elevation + lift * (1 - Math.exp(-9 * realDt));
    const diff = this.azimuthTarget - this.azimuth;
    if (Math.abs(diff) < 1e-4) {
      this.azimuth = this.azimuthTarget;
    } else {
      this.azimuth += diff * (1 - Math.exp(-9 * realDt));
    }
    // Keep the numbers small after many turns
    const full = Math.PI * 2;
    if (Math.abs(this.azimuth) > full * 2 && Math.abs(this.azimuthTarget) > full * 2) {
      const k = Math.sign(this.azimuth) * full;
      this.azimuth -= k;
      this.azimuthTarget -= k;
    }
  }

  private dragMove(dxPx: number, dyPx: number): void {
    const worldPerPx = this.viewSize / Math.max(1, this.container.clientHeight);
    const move = new THREE.Vector3()
      .addScaledVector(this.screenRight(), -dxPx * worldPerPx)
      .addScaledVector(this.screenUp(), (dyPx * worldPerPx) / Math.sin(this.elevation));
    this.zoomAnchor = null;
    this.following = false;
    this.desired.add(move);
    this.clampTarget(this.desired);
    this.target.copy(this.desired);
  }

  /** Move the camera with the keyboard. mx/my are -1..1 screen directions. */
  keyPan(mx: number, my: number, dt: number): void {
    if (mx === 0 && my === 0) return;
    this.zoomAnchor = null;
    const len = Math.hypot(mx, my);
    const speed = this.viewSize * 0.9;
    const move = new THREE.Vector3()
      .addScaledVector(this.screenRight(), (mx / len) * speed * dt)
      .addScaledVector(this.screenUp(), ((my / len) * speed * dt) / Math.sin(this.elevation));
    this.desired.add(move);
    this.clampTarget(this.desired);
  }

  /** Finish any camera easing right away (for tests). */
  settleCamera(): void {
    this.target.copy(this.desired);
    this.viewSize = this.viewSizeTarget;
    this.azimuth = this.azimuthTarget;
    this.elevation = this.elevationTarget;
  }

  /** Set the zoom directly (the visible height in meters). */
  zoomTo(size: number): void {
    this.zoomAnchor = null;
    this.viewSizeTarget = THREE.MathUtils.clamp(size, MIN_VIEW, MAX_VIEW);
  }

  zoomBy(factor: number): void {
    this.zoomAnchor = null;
    this.viewSizeTarget = THREE.MathUtils.clamp(this.viewSizeTarget * factor, MIN_VIEW, MAX_VIEW);
  }

  /**
   * Zoom while keeping the ground point under the pointer where it is on screen. The camera is orthographic, so
   * scaling the view around that point is enough: while the zoom eases, `render` rescales the camera's distance
   * to the anchor by the same ratio as the view size.
   */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const next = THREE.MathUtils.clamp(this.viewSizeTarget * factor, MIN_VIEW, MAX_VIEW);
    if (next === this.viewSizeTarget) return;
    // Keep the same anchor while the pointer stays still, so many small scrolls do not add up rounding drift.
    const same = this.zoomAnchor && Math.abs(this.zoomAnchorScreen.x - clientX) < 1.5 && Math.abs(this.zoomAnchorScreen.y - clientY) < 1.5;
    if (!same) {
      const p = this.pickGround(clientX, clientY);
      this.zoomAnchor = p ? new THREE.Vector3(p.x, 0, p.z) : null;
      this.zoomAnchorScreen = { x: clientX, y: clientY };
    }
    this.viewSizeTarget = next;
  }

  /** Ease the view size toward its target, keeping the zoom anchor fixed on screen. */
  private easeZoom(realDt: number): void {
    const previous = this.viewSize;
    this.viewSize += (this.viewSizeTarget - this.viewSize) * (1 - Math.exp(-10 * realDt));
    const arrived = Math.abs(this.viewSizeTarget - this.viewSize) < this.viewSizeTarget * 0.0005;
    if (arrived) this.viewSize = this.viewSizeTarget;
    const a = this.zoomAnchor;
    if (a && previous > 0) {
      const ratio = this.viewSize / previous;
      for (const v of [this.target, this.desired]) {
        v.x = a.x - (a.x - v.x) * ratio;
        v.z = a.z - (a.z - v.z) * ratio;
        this.clampTarget(v);
      }
    }
    if (arrived) this.zoomAnchor = null;
  }

  private attachPointerEvents(): void {
    const canvas = this.renderer.domElement;
    let down: { x: number; y: number; id: number; button: number } | null = null;
    let dragging = false;
    let building = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.buildMode && e.button === 0) {
        building = true;
        canvas.setPointerCapture(e.pointerId);
        this.handlers?.onBuild?.('down', this.pickGround(e.clientX, e.clientY));
        return;
      }
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button };
      lastX = e.clientX;
      lastY = e.clientY;
      // Right and middle buttons always drag the map
      dragging = e.button !== 0;
      if (dragging) canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (building) {
        this.handlers?.onBuild?.('move', this.pickGround(e.clientX, e.clientY));
        return;
      }
      if (down) {
        if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD_PX) {
          dragging = true;
          canvas.style.cursor = 'grabbing';
          this.setHover(null);
          this.handlers?.onHover(null, e.clientX, e.clientY);
        }
        if (dragging) {
          if (down.button === 2) {
            this.turn((e.clientX - lastX) * DRAG_TURN_PER_PX, true);
            this.tilt((e.clientY - lastY) * DRAG_TILT_PER_PX, true);
          }
          else this.dragMove(e.clientX - lastX, e.clientY - lastY);
          lastX = e.clientX;
          lastY = e.clientY;
        }
        return;
      }
      if (this.buildMode) {
        this.handlers?.onBuild?.('hover', this.pickGround(e.clientX, e.clientY));
        const piece = this.pick(e.clientX, e.clientY);
        this.handlers?.onHover(piece, e.clientX, e.clientY);
        return;
      }
      if (!this.interactive) return;
      const hit = this.pick(e.clientX, e.clientY);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      this.setHover(hit);
      this.handlers?.onHover(hit, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (building) {
        building = false;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        this.handlers?.onBuild?.('up', this.pickGround(e.clientX, e.clientY));
        return;
      }
      if (!down) return;
      const wasDrag = dragging;
      const button = down.button;
      down = null;
      dragging = false;
      canvas.style.cursor = this.buildMode ? 'crosshair' : 'grab';
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!wasDrag && button === 0 && this.interactive) this.handlers?.onClick(this.pick(e.clientX, e.clientY), this.pickGround(e.clientX, e.clientY));
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => {
      down = null;
      dragging = false;
      building = false;
    });
    canvas.addEventListener('pointerleave', () => {
      if (!down && !building) {
        this.setHover(null);
        this.handlers?.onHover(null, 0, 0);
        this.handlers?.onBuild?.('hover', null);
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // Scale by the amount scrolled so a trackpad zooms smoothly and a mouse notch is about 12%.
        const lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        const amount = THREE.MathUtils.clamp(e.deltaY * lines, -200, 200);
        if (amount !== 0) this.zoomAt(e.clientX, e.clientY, Math.exp(amount * 0.0012));
      },
      { passive: false },
    );
    canvas.style.cursor = 'grab';
  }
  // ------------------------------------------------------------ Frame

  render(realDt: number, worldSeconds: number): void {
    this.time += realDt;
    if (this.following && this.hasPlayer) {
      this.desired.set(this.playerPos.x, 0, this.playerPos.z);
      this.clampTarget(this.desired);
    }
    this.streamer?.update(this.playerPos.x, this.playerPos.z, realDt);
    this.target.lerp(this.desired, 1 - Math.exp(-9 * realDt));
    this.easeZoom(realDt);
    this.easeTurn(realDt);
    this.updateCamera();
    this.updatePins();
    const hour = hourOf(worldSeconds);
    const day = daylight(hour);
    this.traffic?.update(realDt, hour, 1 - day);
    this.atmosphere.update(realDt, this.target, day, forestAt(this.target.x, this.target.z));
    for (const list of this.spinners.values()) for (const o of list) o.rotation.z += realDt * 1.4;
    for (const [id, { sprite }] of this.warnSprites) {
      sprite.position.y = (sprite.userData.baseY as number) + Math.sin(this.time * 3 + id) * 0.18;
    }
    this.linkMaterials.cable.emissiveIntensity = 0.3 + 0.2 * Math.sin(this.time * 3);
    this.linkMaterials.lug.emissiveIntensity = 0.8 + 0.4 * Math.sin(this.time * 3);
    this.linkMaterials.cap.emissiveIntensity = 0.6 + 0.25 * Math.sin(this.time * 2);
    this.applyTimeOfDay(hourOf(worldSeconds));
    // The first frame must draw the shadow map (it does not exist until then); after that, every other frame
    if (this.frameCount++ % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  /** Run the cars, clouds and rain forward quickly. Used by tests. */
  advanceScenery(seconds: number, worldSeconds: number): void {
    const hour = hourOf(worldSeconds);
    const day = daylight(hour);
    const forest = forestAt(this.target.x, this.target.z);
    for (let t = 0; t < seconds; t += 0.05) {
      this.traffic?.update(0.05, hour, 1 - day);
      this.atmosphere.update(0.05, this.target, day, forest);
    }
  }

  private updatePins(): void {
    const bob = Math.sin(this.time * 2.4) * 0.45;
    this.playerArrow.position.set(this.playerPos.x, 2.9 + bob * 0.25, this.playerPos.z);
    this.playerArrow.rotation.y = this.time * 1.4;
    if (this.waypointPos) {
      this.waypointPin.position.set(this.waypointPos.x, 6 + bob, this.waypointPos.z);
      this.waypointPin.rotation.y = this.time * 0.8;
    }
    if (this.basePos) {
      this.basePin.position.set(this.basePos.x, 4.2 + bob, this.basePos.z);
      this.basePin.rotation.y = -this.time * 0.8;
    }
  }

  private updateCamera(): void {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const h = this.viewSize / 2;
    this.camera.left = -h * aspect;
    this.camera.right = h * aspect;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
    const flat = Math.cos(this.elevation) * CAM_DISTANCE;
    this.camera.position.set(this.target.x + flat * Math.cos(this.azimuth), this.target.y + Math.sin(this.elevation) * CAM_DISTANCE, this.target.z + flat * Math.sin(this.azimuth));
    this.camera.lookAt(this.target);
  }

  /** Make the shadow camera cover about what is on screen. Sizes come in steps so it does not change every frame. */
  private fitShadow(half: number): void {
    if (half === this.shadowHalf) return;
    this.shadowHalf = half;
    const sc = this.sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 500;
    sc.updateProjectionMatrix();
  }

  /**
   * Put the sun on its path above the view. The point it looks at moves in whole shadow-map texels, so shadows
   * stay still on the ground while the camera pans instead of crawling.
   */
  private placeSun(dir: THREE.Vector3): void {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const radius = 0.71 * (this.viewSize * aspect * 0.5 + this.viewSize * 0.5 / Math.sin(this.elevation));
    this.fitShadow(THREE.MathUtils.clamp(Math.ceil((radius * 1.1) / 8) * 8, 48, 110));
    const texel = (this.shadowHalf * 2) / SHADOW_MAP;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right);
    const t = this.target;
    const focus = new THREE.Vector3()
      .addScaledVector(right, Math.round(t.dot(right) / texel) * texel)
      .addScaledVector(up, Math.round(t.dot(up) / texel) * texel)
      .addScaledVector(dir, t.dot(dir));
    this.sun.position.copy(focus).addScaledVector(dir, 200);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
  }

  private applyTimeOfDay(hour: number): void {
    const ang = ((hour - 6) / 24) * Math.PI * 2; // 0 at 06:00, PI/2 at noon, PI at 18:00
    const elev = Math.sin(ang);
    const day = daylight(hour);
    const rain = this.atmosphere.rain;
    const lowSun = 1 - smoothstep(0.05, 0.45, Math.abs(elev));

    // The key light is the sun by day and the moon by night. Elevation is clamped so shadows never grow endless.
    const keyElev = Math.max(Math.abs(elev), 0.28);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.9, keyElev, 0.45).normalize();
    this.placeSun(dir);

    const sunColor = SUN_DAY.clone().lerp(SUN_LOW, lowSun);
    this.sun.color.copy(MOON).lerp(sunColor, day);
    this.sun.intensity = THREE.MathUtils.lerp(1.1, 2.6, day) * (1 - 0.5 * rain);

    this.hemi.intensity = THREE.MathUtils.lerp(0.75, 0.95, day) * (1 - 0.12 * rain);
    this.hemi.color.set(0x2f4478).lerp(new THREE.Color(0xbfd9ff), day);
    this.hemi.groundColor.set(0x1a2236).lerp(new THREE.Color(0x4a5a3a), day);

    const sky = NIGHT_SKY.clone().lerp(DAY_SKY, day).lerp(DUSK_SKY, lowSun * 0.55);
    this.scene.background = sky.lerp(RAIN_SKY, rain * 0.7 * day);
    setEdgeColor(sky);

    const night = 1 - day;
    glassMat.emissiveIntensity = night * 0.9;
    lampBulbMat.emissiveIntensity = night * 2.2;
    lampPoolMat.opacity = night * 0.55;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
  }
}
