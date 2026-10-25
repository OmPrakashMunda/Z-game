import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import './style.css';
import { GameAudio, type SoundEnv } from './audio/audio';
import { config, setTimeScale } from './config';
import { balance } from './data/balance';
import { city, locationById, type LocationId, type PlotId } from './data/city';
import { isStore, ONLINE_STORE_ID, type StoreId } from './data/stores';
import { itemById } from './data/items';
import { CELL, edgeLength, footprint, isEdgeStructure, isLineStructure, isStructure, STRUCTURES, STRUCTURE_LIST } from './data/structures';
import { makeStructure, structureBounds } from './render/structures';
import { applyEvents, RuleBasedDirector, validateEvents } from './director';
import { Input } from './input';
import { GameRenderer, type MapPoint, type PickResult } from './render/scene';
import { prewarmThumbnails, preloadThumbnails, thumbnailStats } from './render/thumbnails';
import { headlightMat } from './render/traffic';
import { loadGame, saveGame } from './save/store';
import { advise, type Advice, type AdviceAction } from './sim/advisor';
import { dayOf, dayPart, formatClock, hourOf, worldSecondsAt } from './sim/clock';
import {
  edgeAnchor, edgePieceNear, edgePostFlags, gridOf, linksAt, occupiedCells, pieceAt, pieceCenter, placePiece, placementProblem, removePiece,
  type Grid,
} from './sim/build';
import { expandPlot, ownedRect, plotOf, stripFor, type Side } from './sim/land';
import { grantFunds, placeOrder, returnItems, SANDBOX_FUNDS, type Cart } from './sim/economy';
import { buildPlan, planBase } from './sim/architect';
import { activeCheats, resetCheatSession, runCheatCode, type WeatherMode } from './cheats';
import { finishAllConstruction, movePiece, relocationProblem, rotatePiece } from './sim/build';
import { cleanPiece, conditionIssue, repairPiece, upgradePiece } from './sim/upkeep';
import { buyPlot } from './sim/realty';
import { createNewGame, type GameState, type PlaceId, type Piece } from './sim/state';
import { stepSim } from './sim/step';
import { flushSurvival, summarize } from './sim/survival';
import { runtimeOf, topologyOf } from './sim/utilities';
import type { IssueKind } from './data/survival';
import { placePoint, travelMinutes, travelProblem } from './sim/travel';
import { PiecePanel } from './ui/piece-panel';
import { PlacingBar } from './ui/placing-bar';
import { Drawer, type DrawerTab } from './ui/drawer';
import { ArchitectPanel } from './ui/architect-panel';
import { CheatConsole } from './ui/cheat-console';
import { ExpandPanel } from './ui/expand-panel';
import { money } from './ui/dom';
import { PlacePanel, type PlaceInfo } from './ui/place-panel';
import { RealtyView } from './ui/realty';
import { ShopView } from './ui/shop';
import { UI } from './ui/ui';
import { AdvisorPanel, VitalsPanel } from './ui/survival-panels';

const gameEl = document.getElementById('game')!;
const uiEl = document.getElementById('ui')!;

type Screen = 'title' | 'play' | 'menu';
let screen: Screen = 'title';
let state: GameState | null = null;
let selected: PickResult | null = null;
let seenMsgId = 0;
let toastedMsgId = 0;

interface TravelAnim {
  to: PlaceId;
  from: MapPoint;
  dest: MapPoint;
  total: number;
  remaining: number;
  /** Game seconds that pass per real second during the time-lapse. */
  speed: number;
}
let travel: TravelAnim | null = null;

interface BuildMode {
  /** Structure being placed, or null if none is selected. */
  type: string | null;
  rot: number;
  demolish: boolean;
  /** Id of a structure that is being lifted and moved, rather than a new one from storage. */
  moving?: number;
}
let build: BuildMode | null = null;
let hoverAnchor: { cx: number; cz: number } | null = null;
/** Rotation the preview uses. For fences and walls it comes from which grid line the pointer is nearest. */
let hoverRot = 0;
/** While dragging: the last cell, and for fences the grid line being followed (rot, the line, and how far along it we got). */
let painting: { last: { cx: number; cz: number }; edge?: { rot: number; line: number; last: number } } | null = null;
let pendingBuild: string | null = null;
let pendingArchitect = false;
let lastCompass = Number.NaN;
let persistTimer = 0;
let lastPlaceSound = 0;
let sinceSoundUpdate = 1;

let accumulator = 0;
let lastFrame = performance.now();
let sinceSave = 0;
let saving = false;
let sinceUiRefresh = 0;

const director = new RuleBasedDirector();
const audio = new GameAudio();
const gfx = new GameRenderer(gameEl);
gfx.buildCity(city);
const input = new Input();

const ui = new UI(uiEl, {
  onSpeed: (m) => setSpeed(m),
  onOnlineStore: () => toggleOnlineStore(),
  onBuild: () => (build ? stopPlacing() : drawer.toggle('storage')),
  onDrawer: (tab) => drawer.toggle(tab),
  onMenu: () => openMenu(),
  onToggleSound: () => toggleSound(),
  onRotate: (dir) => gfx.stepTurn(dir),
  onTilt: (dir) => gfx.stepTilt(dir),
  onResetView: () => gfx.resetView(),
  onToggleLines: () => toggleUtilityView(),
});
const drawer = new Drawer(
  uiEl,
  (tab: DrawerTab | null) => {
    if (tab === 'news' && state) seenMsgId = latestMsgId(state);
    if (state) drawer.refresh(state);
  },
  (itemId) => startPlacing(itemId),
  (itemId, qty) => handleReturn(itemId, qty),
);
const placingBar = new PlacingBar(uiEl, { onRotate: () => rotateBuild(), onDone: () => stopPlacing(), onStorage: () => drawer.toggle('storage') });
const expandPanel = new ExpandPanel(uiEl, () => state!, (side) => handleExpand(side), (side) => previewExpand(side), () => gfx.viewAngle);
const architect = new ArchitectPanel(uiEl, () => state!, { onFunds: () => handleFunds(), onBuild: () => handleArchitectBuild() });
const cheats = new CheatConsole(uiEl, (code) => runCheat(code));
const placePanel = new PlacePanel(uiEl, () => select(null));
const piecePanel = new PiecePanel(uiEl, () => state!, {
  onClose: () => select(null),
  onRotate: (id) => rotatePlaced(id),
  onMove: (id) => startMoving(id),
  onTakeDown: (id) => takeDownSelected(id),
  onRepair: (id) => doWork('repair', id),
  onUpgrade: (id) => doWork('upgrade', id),
  onClean: (id) => doWork('clean', id),
  onShowLines: () => toggleUtilityView(),
});
const leftStack = document.createElement('div');
leftStack.className = 'left-stack';
uiEl.append(leftStack);
const vitals = new VitalsPanel(leftStack);
const advisor = new AdvisorPanel(leftStack, (a) => handleAdvice(a), () => toggleArchitect());
const shop = new ShopView(uiEl, () => state!, handleOrder, leaveBuilding, () => {
  shop.close();
  startPlacing();
});
const realty = new RealtyView(
  uiEl,
  () => state!,
  handleBuyPlot,
  (plotId) => gfx.setHover(plotId ? { type: 'plot', id: plotId } : null),
  leaveBuilding,
);

const modalOpen = () => shop.isOpen || realty.isOpen;
const ownedStructures = (s: GameState) => Object.entries(s.storage).filter(([id, n]) => n > 0 && isStructure(id)).map(([id]) => id);
const latestMsgId = (s: GameState) => s.messages[s.messages.length - 1]?.id ?? 0;
const placeName = (p: PlaceId) => (p === 'base' ? 'your base' : locationById(p).name);

// ---------------------------------------------------------------- Sound

for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => audio.unlock(), { capture: true });
// Every button makes a small click
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button')) audio.click();
});

function toggleSound(): void {
  audio.unlock();
  audio.setMuted(!audio.isMuted);
}

/** What the camera is looking at, as far as sound is concerned. */
function soundEnv(): SoundEnv {
  const scene = gfx.soundScene();
  const focus = gfx.focus;
  let water = 0;
  let fire = 0;
  // Streams run beside two of the plots
  for (const plot of city.plots) {
    if (plot.water !== 'stream') continue;
    const d = Math.hypot(plot.bounds.x - focus.x, plot.bounds.z - focus.z);
    water = Math.max(water, 0.55 * Math.max(0, 1 - d / 45));
  }
  if (state) {
    const grid = gridOf(state);
    if (grid) {
      for (const piece of state.pieces) {
        if (piece.progress < 1) continue;
        const isPond = piece.type.startsWith('pond_');
        if (!isPond && piece.type !== 'fire_pit') continue;
        const c = pieceCenter(grid, piece.type, piece.cx, piece.cz, piece.rot);
        const d = Math.hypot(c.x - focus.x, c.z - focus.z);
        if (isPond) water = Math.max(water, Math.max(0, 1 - d / 32));
        else fire = Math.max(fire, Math.max(0, 1 - d / 25));
      }
    }
  }
  return {
    hour: state ? hourOf(state.worldSeconds) : 11,
    forest: scene.forest,
    traffic: scene.traffic,
    rain: scene.rain,
    water,
    fire,
    outbreak: !!state && state.phase !== 'prep',
  };
}

// ---------------------------------------------------------------- Saving

async function persist(showToast = false): Promise<boolean> {
  // A finished game is never saved over the last good one, so "Continue" still works after a death
  if (!state || saving || state.phase === 'dead') return false;
  saving = true;
  try {
    await saveGame(state);
    if (showToast) ui.toast('Game saved', 'info');
    return true;
  } catch (err) {
    console.error('Save failed', err);
    ui.toast('Could not save your game. Progress may be lost if you close the tab.');
    return false;
  } finally {
    saving = false;
  }
}

function persistOnLeave(): void {
  if (screen !== 'title') void persist();
}
document.addEventListener('visibilitychange', () => {
  // The clock only runs while the tab is visible. Reset the frame timer so no time is credited on return.
  lastFrame = performance.now();
  if (document.hidden) persistOnLeave();
});
window.addEventListener('pagehide', persistOnLeave);

// ---------------------------------------------------------------- Game flow

async function showTitle(): Promise<void> {
  screen = 'title';
  resetCheatSession(cheatPictureHost);
  ui.setCheats([]);
  closeAllViews();
  ui.setHudVisible(false);
  gfx.setMarkers(null, null);
  gfx.setOwnedPlot(null);
  gfx.syncPieces([], null);
  gfx.setWarnings(new Map());
  gfx.setLinks([]);
  vitals.hide();
  advisor.hide();
  gfx.snapTo({ x: 0, z: 8 });
  gfx.setInteractive(false);
  const result = await loadGame();
  const startNew = () => beginGame(createNewGame(), true);

  switch (result.status) {
    case 'ok':
      ui.showTitle({ hasSave: true, onContinue: () => beginGame(result.state, false), onNew: startNew });
      break;
    case 'recovered':
      ui.showTitle({
        hasSave: true, notice: result.message, noticeIsWarning: true,
        onContinue: () => beginGame(result.state, false), onNew: startNew,
      });
      break;
    case 'error':
      ui.showTitle({ hasSave: false, notice: result.message, noticeIsWarning: true, onContinue: () => {}, onNew: startNew });
      break;
    default:
      ui.showTitle({ hasSave: false, onContinue: () => {}, onNew: startNew });
  }
}

function beginGame(next: GameState, isNew: boolean): void {
  resetCheatSession(cheatPictureHost);
  ui.setCheats([]);
  state = next;
  state.at = state.at === 'base' && !state.plotId ? 'motel' : state.at;
  deathShown = false;
  advice = null;
  speed = 1;
  ui.closeOverlay();
  closeAllViews();
  ui.setHudVisible(true);
  gfx.setOwnedPlot(state.plotId, landOf(state));
  gfx.syncPieces(state.pieces, gridOf(state));
  syncMarkers();
  gfx.snapTo(placePoint(state, state.at) ?? { x: 0, z: 8 });
  gfx.setInteractive(true);
  seenMsgId = isNew ? 0 : latestMsgId(state);
  toastedMsgId = latestMsgId(state);
  travel = null;
  selected = null;
  accumulator = 0;
  sinceSave = 0;
  lastFrame = performance.now();
  input.clear();
  audio.unlock();
  screen = 'play';
  refreshSurvival();
  void persist();
}

function closeAllViews(): void {
  if (build) stopPlacing(false);
  piecePanel.hide();
  pendingBuild = null;
  expandPanel.hide();
  architect.hide();
  cheats.hide();
  pendingArchitect = false;
  shop.close();
  realty.close();
  placePanel.hide();
  drawer.hide();
  gfx.setSelected(null);
  gfx.setHover(null);
  ui.setTooltip(null);
  ui.showTravel(null);
  selected = null;
}

function openMenu(): void {
  if (screen !== 'play' || travel) return;
  screen = 'menu';
  input.clear();
  gfx.setInteractive(false);
  ui.setTooltip(null);
  ui.showMenu({
    timeScale: config.timeScale,
    volume: audio.level,
    muted: audio.isMuted,
    onVolume: (v) => audio.setVolume(v),
    onMute: (m) => audio.setMuted(m),
    onResume: closeMenu,
    onSave: () => void persist(true),
    onQuit: async () => {
      await persist();
      state = null;
      ui.closeOverlay();
      void showTitle();
    },
  });
}

function closeMenu(): void {
  if (screen !== 'menu') return;
  ui.closeOverlay();
  screen = 'play';
  gfx.setInteractive(true);
  lastFrame = performance.now();
}

input.onPress('Escape', () => {
  if (screen === 'menu') return closeMenu();
  if (screen !== 'play' || travel) return;
  if (modalOpen()) return shop.closeSheet() || leaveBuilding();
  if (architect.isOpen) return architect.hide();
  if (build) return stopPlacing();
  if (drawer.isOpen) return drawer.hide();
  if (placePanel.isOpen || piecePanel.isOpen) return select(null);
  openMenu();
});
input.onPress('Backquote', () => screen === 'play' && !travel && cheats.toggle());
input.onPress('KeyU', () => screen === 'play' && !modalOpen() && toggleUtilityView());
input.onPress('KeyP', () => screen === 'play' && !modalOpen() && !travel && toggleArchitect());
input.onPress('KeyI', () => screen === 'play' && !modalOpen() && drawer.toggle('storage'));
input.onPress('KeyO', () => screen === 'play' && !modalOpen() && drawer.toggle('orders'));
input.onPress('KeyN', () => screen === 'play' && !modalOpen() && drawer.toggle('news'));
input.onPress('KeyB', () => screen === 'play' && toggleOnlineStore());
input.onPress('KeyM', () => toggleSound());
input.onPress('KeyF', () => screen === 'play' && setSpeed(speed > 1 ? 1 : 4));
input.onPress('KeyV', () => screen === 'play' && !modalOpen() && !travel && (build ? stopPlacing() : drawer.toggle('storage')));
input.onPress('KeyR', () => {
  if (screen !== 'play' || modalOpen()) return;
  if (build) rotateBuild();
  else rotatePlaced();
});
for (let i = 1; i <= 9; i++) {
  input.onPress(`Digit${i}`, () => {
    if (!state || !build || modalOpen()) return;
    const id = ownedStructures(state)[i - 1];
    if (id) selectBuildType(id);
  });
}

// ---------------------------------------------------------------- Map interaction

gfx.setHandlers({
  onHover(pick, x, y) {
    if (!state || screen !== 'play' || build) return ui.setTooltip(null);
    ui.setTooltip(pick ? tooltipFor(pick, state) : null, x, y);
  },
  onClick(pick, ground) {
    if (screen !== 'play' || travel || modalOpen() || build) return;
    // A fence is thin and see-through, so a click that lands on the ground right beside a structure still counts as clicking it
    if ((!pick || pick.type === 'plot') && ground && state?.plotId) {
      const grid = gridOf(state);
      if (grid) {
        const cell = rawCell(grid, ground);
        const near = edgePieceNear(state.pieces, grid, ground.x, ground.z, 0.5) ?? pieceAt(state, cell.cx, cell.cz);
        if (near) pick = { type: 'piece', id: near.id };
      }
    }
    select(pick);
  },
  onBuild: (kind, ground) => onBuildPointer(kind, ground),
});

function tooltipFor(pick: PickResult, s: GameState): string {
  if (pick.type === 'piece') {
    const piece = s.pieces.find((p) => p.id === pick.id);
    if (!piece) return 'Structure';
    const name = STRUCTURES[piece.type].name;
    if (piece.progress < 1) return `${name} (${Math.round(piece.progress * 100)}% built)`;
    const problem = runtimeOf(s).issues.get(piece.id)?.[0] ?? conditionIssue(piece);
    return problem ? `${name}. ${problem.text}` : name;
  }
  if (pick.type === 'plot') {
    const plot = city.plots.find((p) => p.id === pick.id)!;
    return s.plotId === pick.id ? `${plot.name} (your base)` : `${plot.name}: for sale`;
  }
  const loc = locationById(pick.id);
  if (s.at === pick.id) return `${loc.name} (you are here)`;
  return `${loc.name} · ${travelMinutes(s, pick.id)} min away`;
}

function select(input: PickResult | null): void {
  const pick: PickResult | null = input;
  selected = pick;
  gfx.setSelected(pick);
  if (!pick || !state) {
    placePanel.hide();
    piecePanel.hide();
    return;
  }
  // Every placed structure has its own card
  if (pick.type === 'piece') {
    placePanel.hide();
    refreshPiecePanel();
    return;
  }
  piecePanel.hide();
  const point = pick.type === 'location' ? placePoint(state, pick.id) : city.plots.find((p) => p.id === pick.id)!.bounds;
  if (point) gfx.focusOn({ x: point.x, z: point.z });
  refreshPlacePanel();
}

function refreshPlacePanel(): void {
  if (!state || !selected) return;
  placePanel.show(buildPlaceInfo(selected, state));
}

function travelButton(s: GameState, to: PlaceId, label: string, openAfter = true) {
  const problem = travelProblem(s, to);
  const mins = travelMinutes(s, to);
  return {
    label: mins > 0 ? `${label} (${mins} min)` : label,
    disabled: problem !== null,
    onClick: () => goTo(to, openAfter),
  };
}

function buildPlaceInfo(pick: PickResult, s: GameState): PlaceInfo {
  // A placed structure has its own card (see the piece panel), so this one is never asked for it
  if (pick.type === 'piece') return { title: 'Structure', actions: [] };
  if (pick.type === 'plot') {
    const plot = city.plots.find((p) => p.id === pick.id)!;
    const stats: Array<[string, string]> = [
      ['Price', money(plot.price)],
      ['Size', `${plot.bounds.w} × ${plot.bounds.d} m`],
      ['Water', plot.water === 'well' ? 'Working well' : plot.water === 'stream' ? 'Stream' : 'None'],
      ['Defense', `${plot.defense} / 5`],
    ];
    if (s.plotId === plot.id) {
      const done = s.pieces.filter((p) => p.progress >= 1).length;
      const land = ownedRect(plot, s.expansion);
      stats[1] = ['Your land', `${land.w} × ${land.d} m`];
      stats.push(['Structures', `${done} built, ${s.pieces.length - done} in progress`]);
      return {
        title: plot.name,
        subtitle: 'Your base',
        text: s.at === 'base' ? 'You are at your base.' : undefined,
        stats,
        actions: [
          { label: 'Place from storage', kind: 'good' as const, onClick: () => startPlacing() },
          ...(s.at === 'base' ? [] : [travelButton(s, 'base', 'Go to base', false)]),
          { label: 'Buy more land', kind: 'secondary' as const, onClick: () => expandPanel.show() },
          { label: 'Open storage', kind: 'secondary' as const, onClick: () => drawer.show('storage') },
          { label: 'Buy from the online store', kind: 'secondary' as const, onClick: () => toggleOnlineStore(true) },
        ],
      };
    }
    return {
      title: plot.name,
      subtitle: s.plotId ? 'Not for you: you already own a plot' : 'For sale',
      text: plot.blurb,
      stats,
      notice: s.plotId ? undefined : 'You can buy plots at Hillside Realty.',
      actions: s.plotId ? [] : [travelButton(s, 'real_estate', 'Go to Hillside Realty')],
    };
  }

  const loc = locationById(pick.id);
  const here = s.at === loc.id;
  const sells = isStore(loc.id);
  const closed = (sells || loc.id === 'real_estate') && s.phase !== 'prep';
  const actions = [];
  if (loc.id === 'motel') {
    actions.push(travelButton(s, loc.id, here ? 'You are here' : 'Go to motel', false));
    if (here) actions[0].disabled = true;
  } else if (closed) {
    actions.push({ label: 'Closed', disabled: true, onClick: () => {} });
  } else {
    const verb = loc.id === 'real_estate' ? 'office' : 'shop';
    actions.push(travelButton(s, loc.id, here ? `Enter ${verb}` : `Travel & enter ${verb}`));
  }
  return {
    title: loc.name,
    subtitle: here ? 'You are here' : `${travelMinutes(s, loc.id)} min away`,
    text: loc.blurb,
    notice: closed ? 'This place has closed since the outbreak began.' : undefined,
    actions,
  };
}

// ---------------------------------------------------------------- Travel

function goTo(to: PlaceId, openAfter: boolean): void {
  if (!state || travel) return;
  if (travelProblem(state, to)) return;
  const mins = travelMinutes(state, to);
  if (mins === 0) {
    if (openAfter) openPlace(to);
    return;
  }
  if (build) stopPlacing(false);
  if (to !== 'base') pendingBuild = null;
  const from = placePoint(state, state.at)!;
  const dest = placePoint(state, to)!;
  const [minAnim, maxAnim] = balance.travelAnimSeconds;
  const animSeconds = Math.min(maxAnim, minAnim + mins / 40);
  const total = mins * 60;
  travel = { to, from, dest, total, remaining: total, speed: total / animSeconds };
  pendingOpen = openAfter;
  shop.close();
  realty.close();
  drawer.hide();
  placePanel.hide();
  ui.setTooltip(null);
  gfx.setInteractive(false);
  gfx.setSelected(null);
  gfx.focusOn(dest);
  ui.showTravel(`Travelling to ${placeName(to)}… ${mins} min`);
}
let pendingOpen = true;

function arrive(): void {
  if (!state || !travel) return;
  const to = travel.to;
  state.at = to;
  travel = null;
  ui.showTravel(null);
  gfx.setInteractive(true);
  syncMarkers();
  select(null);
  if (to === 'base' && pendingArchitect) {
    pendingArchitect = false;
    architect.show();
  }
  if (to === 'base' && pendingBuild !== null) {
    const type = pendingBuild || null;
    pendingBuild = null;
    beginPlacing(type);
  } else if (pendingOpen) {
    openPlace(to);
  } else {
    select(to === 'base' ? { type: 'plot', id: state.plotId! } : { type: 'location', id: to });
  }
  void persist();
}

function openPlace(place: PlaceId): void {
  if (!state) return;
  if (place === 'base') {
    select({ type: 'plot', id: state.plotId! });
    return;
  }
  if (place === 'real_estate') {
    if (state.phase === 'prep') realty.open();
    else select({ type: 'location', id: place });
    return;
  }
  if (isStore(place) && state.phase === 'prep') {
    placePanel.hide();
    gfx.setSelected(null);
    shop.open(place as LocationId);
    return;
  }
  select({ type: 'location', id: place });
}

function leaveBuilding(): void {
  const here = state?.at;
  shop.close();
  realty.close();
  gfx.setHover(null);
  if (build) return; // the build bar is still on screen
  if (here && here !== 'base') select({ type: 'location', id: here });
}

// ---------------------------------------------------------------- Land

/** The land the player owns, as a rectangle on the map. */
function landOf(s: GameState): ReturnType<typeof ownedRect> | undefined {
  const plot = plotOf(s);
  return plot ? ownedRect(plot, s.expansion) : undefined;
}

function handleExpand(side: Side): void {
  if (!state) return;
  const result = expandPlot(state, side);
  if (!result.ok) {
    ui.toast(result.reason);
    return;
  }
  gfx.setOwnedPlot(state.plotId, landOf(state));
  if (build) gfx.setGrid(gridOf(state));
  const land = landOf(state)!;
  ui.toast(`You now own ${land.w} x ${land.d} m. The trees on it, and many of those nearby, have been cleared.`, 'info');
  audio.buy();
  expandPanel.refresh();
  schedulePersist();
}

function previewExpand(side: Side | null): void {
  const plot = state ? plotOf(state) : null;
  gfx.previewRect(side && state && plot ? stripFor(plot, state.expansion, side) : null);
}

// ---------------------------------------------------------------- Base architect

function toggleArchitect(): void {
  if (!state || screen !== 'play' || travel) return;
  if (!state.plotId) {
    ui.toast('Buy a base plot first.');
    return;
  }
  if (!architect.isOpen) {
    shop.close();
    realty.close();
  }
  architect.toggle();
}

/**
 * Cheat: the finished base in the Deep Woods Clearing. Buys the plot if you have none, buys land to grow it, builds the
 * architect's whole design and finishes it at once. Adds funds if the money runs short.
 */
function buildWoodsBase(): string {
  if (!state) return '';
  if (state.phase !== 'prep') return 'The shops have closed, so a base can no longer be bought.';
  if (state.plotId && state.plotId !== 'woods') {
    return `You already own ${plotOf(state)?.name ?? 'another plot'}. This code builds in the Deep Woods Clearing, so start a game with no base, or with that plot.`;
  }
  const woods = city.plots.find((p) => p.id === 'woods')!;
  if (!state.plotId) {
    if (state.money < woods.price) grantFunds(state);
    state.money -= woods.price;
    state.plotId = 'woods';
  }
  // Plenty of money, so the design uses the strongest walls instead of trimming to a budget
  for (let i = 0; i < 4 && state.money < 700_000; i++) grantFunds(state);
  state.at = 'base';
  gfx.setOwnedPlot(state.plotId, landOf(state));
  syncMarkers();
  let plan = planBase(state);
  for (let i = 0; plan && plan.shortfall > 0 && i < 6; i++) {
    grantFunds(state);
    plan = planBase(state);
  }
  if (!plan) return 'There is nothing to plan.';
  const result = buildPlan(state, plan);
  if (!result.ok) return result.reason;
  gfx.setOwnedPlot(state.plotId, landOf(state));
  if (build) gfx.setGrid(gridOf(state));
  finishAllConstruction(state);
  gfx.syncPieces(state.pieces, gridOf(state));
  refreshSurvival();
  expandPanel.refresh();
  schedulePersist();
  const land = landOf(state)!;
  gfx.focusOn({ x: land.x, z: land.z });
  gfx.zoomTo(Math.max(land.w, land.d) * 1.5);
  audio.done();
  ui.toast(`Cheat: the woods base is built and finished on ${land.w} x ${land.d} m.`, 'info');
  return `Done. ${result.placed} pieces built on ${land.w} x ${land.d} m (${result.landBought} strips of land bought).`;
}

/** Show or hide every power cable and water pipe. They are hidden by default so the base stays easy to read. */
function toggleUtilityView(): void {
  gfx.setUtilityView(!gfx.utilityViewOn);
  ui.setLinesActive(gfx.utilityViewOn);
}

/** The weather cheats act on the picture only. */
function setCheatWeather(mode: WeatherMode): void {
  gfx.atmosphere.setWeather(mode === 'normal');
  gfx.atmosphere.forceRain(mode === 'always' ? 0.9 : 0);
}

const cheatPictureHost = { setWeather: setCheatWeather, setCarsHidden: (hidden: boolean) => gfx.traffic?.setCarsHidden(hidden) };

/** What the world should look like right now: the real time, or the hour a cheat has locked it to. */
function visualSeconds(s: GameState): number {
  const lock = runtimeOf(s).cheats.hourLock;
  return lock === null ? s.worldSeconds : worldSecondsAt(dayOf(s.worldSeconds), lock);
}

/** Run a typed cheat code. Returns the line to show under the box. */
function runCheat(raw: string): string {
  if (!state || screen !== 'play') return '';
  const host = {
    state,
    ...cheatPictureHost,
    changed: () => {
      if (!state) return;
      gfx.syncPieces(state.pieces, gridOf(state));
      refreshSurvival();
      refreshPiecePanel();
      ui.setCheats(activeCheats(state));
      schedulePersist();
    },
    addFunds: () => {
      handleFunds();
      return `Done. ${money(SANDBOX_FUNDS)} added.`;
    },
    buildWoodsBase,
    finishAll: () => {
      const n = finishAllConstruction(state!);
      if (n === 0) return 'Nothing is being built right now.';
      gfx.syncPieces(state!.pieces, gridOf(state!));
      refreshSurvival();
      schedulePersist();
      audio.done();
      ui.toast(`Cheat: ${n} piece${n === 1 ? '' : 's'} finished at once.`, 'info');
      return `Done. ${n} piece${n === 1 ? '' : 's'} finished.`;
    },
  };
  const result = runCheatCode(raw, host);
  ui.setCheats(activeCheats(state));
  return result;
}
function handleFunds(): void {
  if (!state) return;
  grantFunds(state);
  ui.toast(`Sandbox funds added: ${money(SANDBOX_FUNDS)}.`, 'info');
  audio.buy();
  architect.refresh(true);
  schedulePersist();
}

function handleArchitectBuild(): void {
  if (!state || screen !== 'play') return;
  if (state.at !== 'base') {
    architect.hide();
    pendingArchitect = true;
    goTo('base', false);
    return;
  }
  const plan = planBase(state);
  if (!plan) {
    ui.toast('The shops have closed.');
    return;
  }
  const result = buildPlan(state, plan);
  if (!result.ok) {
    ui.toast(result.reason);
    audio.error();
    return;
  }
  if (result.landBought > 0) {
    gfx.setOwnedPlot(state.plotId, landOf(state));
    if (build) gfx.setGrid(gridOf(state));
    expandPanel.refresh();
  }
  gfx.syncPieces(state.pieces, gridOf(state));
  if (build) refreshBuildBar();
  refreshSurvival();
  const extra = result.failed > 0 ? ` ${result.failed} could not be placed and are in your storage.` : '';
  ui.toast(`Upgrade ordered for ${money(result.spent)}. Your crew has ${result.placed} pieces to build.${extra}`, 'info');
  audio.buy();
  architect.refresh(true);
  schedulePersist();
}

// ---------------------------------------------------------------- Online store
function toggleOnlineStore(forceOpen = false): void {
  if (!state || screen !== 'play' || travel) return;
  if (shop.isOpen && shop.currentStore === ONLINE_STORE_ID && !forceOpen) {
    leaveBuilding();
    return;
  }
  if (state.phase !== 'prep') {
    ui.toast('The online store has shut down.');
    return;
  }
  realty.close();
  drawer.hide();
  placePanel.hide();
  gfx.setSelected(null);
  shop.open(ONLINE_STORE_ID);
}

// ---------------------------------------------------------------- Building on your plot

function startPlacing(type?: string): void {
  if (!state || screen !== 'play' || travel) return;
  if (!state.plotId) {
    ui.toast('Buy a base plot first.');
    return;
  }
  if (!type) {
    // No separate building mode: what you can place is whatever is in your storage
    drawer.show('storage');
    return;
  }
  if (state.at !== 'base') {
    pendingBuild = type;
    goTo('base', false);
    return;
  }
  beginPlacing(type);
}

/** Pick up a structure from storage (or lift one off the ground, with `moving`) and start putting it down. */
function beginPlacing(type: string | null, moving?: number): void {
  if (!state) return;
  const grid = gridOf(state);
  if (!grid) return;
  if (!type) {
    drawer.show('storage');
    return;
  }
  if (moving === undefined && (state.storage[type] ?? 0) < 1) {
    ui.toast('You have none of those in storage.');
    return;
  }
  shop.close();
  realty.close();
  architect.hide();
  drawer.hide();
  select(null);
  const rot = moving !== undefined ? state.pieces.find((p) => p.id === moving)?.rot ?? 0 : 0;
  build = { type, rot, demolish: false, moving };
  hoverAnchor = null;
  painting = null;
  gfx.setBuildMode(true);
  gfx.setGrid(grid);
  gfx.setInteractive(false);
  // If your land is off screen, bring it into view. Otherwise the camera stays where you put it.
  const land = landOf(state);
  if (land) {
    const at = gfx.project({ x: land.x, z: land.z }, 0);
    if (at.x < 60 || at.x > window.innerWidth - 60 || at.y < 100 || at.y > window.innerHeight - 160) {
      gfx.focusOn({ x: land.x, z: land.z });
      gfx.zoomTo(Math.max(34, Math.max(land.w, land.d) * 1.35));
    }
  }
  placingBar.show();
  placingBar.setStatus(moving !== undefined ? 'Click where it should go. It moves at once, and for free.' : 'Click your land to place it. Drag to lay a line.');
  refreshBuildBar();
}

function stopPlacing(reselect = true): void {
  if (!build) return;
  const moved = build.moving;
  build = null;
  hoverAnchor = null;
  painting = null;
  gfx.setBuildMode(false);
  gfx.setGrid(null);
  gfx.setHover(null);
  gfx.setGhost(null, null, 0, true);
  gfx.setInteractive(true);
  placingBar.hide();
  if (reselect && moved !== undefined && state?.pieces.some((p) => p.id === moved)) select({ type: 'piece', id: moved });
}

function refreshBuildBar(): void {
  if (!state || !build) return;
  placingBar.update(state, build.type, build.rot, build.moving !== undefined);
  updateGhost();
}

function selectBuildType(type: string): void {
  if (!build || !state || (state.storage[type] ?? 0) < 1) return;
  build.type = type;
  build.demolish = false;
  build.moving = undefined;
  build.rot = 0;
  gfx.setHover(null);
  refreshBuildBar();
}

function rotateBuild(): void {
  if (!build) return;
  build.rot = (build.rot + 1) % 4;
  refreshBuildBar();
}

/** Grid cell under a map point, even if it is outside the plot (so the preview can turn red). */
function rawCell(grid: Grid, p: MapPoint): { cx: number; cz: number } {
  return { cx: Math.floor((p.x - grid.originX) / CELL), cz: Math.floor((p.z - grid.originZ) / CELL) };
}

function updateGhost(): void {
  if (!state || !build) return;
  const grid = gridOf(state);
  if (!grid || !build.type || !hoverAnchor) {
    gfx.setGhost(null, null, 0, true);
    return;
  }
  const def = STRUCTURES[build.type];
  const edge = isEdgeStructure(def);
  const rot = edge ? hoverRot : build.rot;
  const problem = build.moving !== undefined
    ? relocationProblem(state, build.moving, hoverAnchor.cx, hoverAnchor.cz, rot)
    : placementProblem(state, build.type, hoverAnchor.cx, hoverAnchor.cz, rot);
  const center = pieceCenter(grid, build.type, hoverAnchor.cx, hoverAnchor.cz, rot);
  let links: number | undefined;
  if (edge && def.look.model !== 'gate') {
    // Draw the preview with the corner posts it would really get, as the newest piece on the grid
    const ghostPiece: Piece = { id: Number.MAX_SAFE_INTEGER, type: build.type, cx: hoverAnchor.cx, cz: hoverAnchor.cz, rot, hp: 1, maxHp: 1, progress: 0 };
    links = edgePostFlags(state.pieces, ghostPiece).get(ghostPiece.id) ?? 0;
  } else if (isLineStructure(def)) {
    links = linksAt(occupiedCells(state.pieces), hoverAnchor.cx, hoverAnchor.cz);
  }
  gfx.setGhost(build.type, center, rot, problem === null, links);
  placingBar.setStatus(problem ?? (build.moving !== undefined ? 'Click to move it here' : `${STRUCTURES[build.type].name}: click to place`), problem !== null);
}

/** Structures that make sense as a line, so dragging turns them to follow the drag. */
const isLinear = (type: string) => ['spikes', 'trench', 'path', 'hedge'].includes(STRUCTURES[type].look.model) && STRUCTURES[type].w === 1;

function afterBuildChange(): void {
  if (!state || !build) return;
  gfx.syncPieces(state.pieces, gridOf(state));
  schedulePersist();
  if (build.moving === undefined && build.type && (state.storage[build.type] ?? 0) < 1) {
    // That was the last one in storage
    ui.toast(`That was the last ${STRUCTURES[build.type].name.toLowerCase()}. Buy more from the online store (B).`, 'info');
    stopPlacing();
    return;
  }
  refreshBuildBar();
}

function tryPlace(cx: number, cz: number, rot = build?.rot ?? 0): boolean {
  if (!state || !build?.type) return false;
  if (build.moving !== undefined) {
    const result = movePiece(state, build.moving, cx, cz, rot);
    if (!result.ok) {
      placingBar.setStatus(result.reason, true);
      return false;
    }
    audio.place();
    gfx.syncPieces(state.pieces, gridOf(state));
    refreshSurvival();
    schedulePersist();
    stopPlacing();
    return true;
  }
  const result = placePiece(state, build.type, cx, cz, rot);
  if (!result.ok) {
    placingBar.setStatus(result.reason, true);
    return false;
  }
  const now = performance.now();
  if (now - lastPlaceSound > 70) audio.place();
  lastPlaceSound = now;
  afterBuildChange();
  return true;
}

function takeDown(pieceId: number): void {
  if (!state) return;
  const result = removePiece(state, pieceId);
  if (!result.ok) {
    ui.toast(result.reason);
    return;
  }
  gfx.setHover(null);
  audio.remove();
  if (result.salvaged) ui.toast('It was too worn to reuse. You kept the materials.', 'info');
  gfx.syncPieces(state.pieces, gridOf(state));
  refreshSurvival();
  schedulePersist();
}

function onBuildPointer(kind: 'hover' | 'down' | 'move' | 'up', ground: MapPoint | null): void {
  if (!state || !build || screen !== 'play') return;
  const grid = gridOf(state);
  if (!grid) return;
  if (kind === 'up') {
    painting = null;
    return;
  }
  if (!ground) {
    hoverAnchor = null;
    updateGhost();
    return;
  }
  const cell = rawCell(grid, ground);
  if (!build.type) return;

  const def = STRUCTURES[build.type];

  // Fences, walls and gates stand on the grid line nearest the pointer, not inside a tile
  if (isEdgeStructure(def)) {
    const a = edgeAnchor(grid, def, ground.x, ground.z);
    const along = a.rot % 2 === 0 ? a.cx : a.cz;
    const line = a.rot % 2 === 0 ? a.cz : a.cx;
    if (kind === 'down') {
      tryPlace(a.cx, a.cz, a.rot);
      if (!build) return;
      painting = { last: cell, edge: { rot: a.rot, line, last: along } };
    } else if (kind === 'move' && painting?.edge && edgeLength(def) === 1) {
      // Dragging follows the line the drag started on, filling any tiles the pointer skipped
      const e = painting.edge;
      const u = e.rot % 2 === 0 ? (ground.x - grid.originX) / CELL : (ground.z - grid.originZ) / CELL;
      const target = Math.floor(u);
      const step = target >= e.last ? 1 : -1;
      for (let i = e.last + step; step > 0 ? i <= target : i >= target; i += step) {
        const ok = e.rot % 2 === 0 ? tryPlace(i, e.line, e.rot) : tryPlace(e.line, i, e.rot);
        if (!ok) break;
        e.last = i;
      }
      painting = { last: cell, edge: e };
      return;
    }
    hoverAnchor = { cx: a.cx, cz: a.cz };
    hoverRot = a.rot;
    updateGhost();
    return;
  }

  const fp = footprint(def, build.rot);
  const anchor = { cx: cell.cx - Math.floor(fp.w / 2), cz: cell.cz - Math.floor(fp.d / 2) };

  if (kind === 'down') {
    tryPlace(anchor.cx, anchor.cz);
    if (!build) return;
    painting = { last: cell };
  } else if (kind === 'move' && painting && def.w === 1 && def.d === 1) {
    // Dragging lays a line of single-cell pieces, filling any cells the pointer skipped
    const from = painting.last;
    const steps = Math.max(Math.abs(cell.cx - from.cx), Math.abs(cell.cz - from.cz));
    for (let i = 1; i <= steps; i++) {
      const cx = Math.round(from.cx + ((cell.cx - from.cx) * i) / steps);
      const cz = Math.round(from.cz + ((cell.cz - from.cz) * i) / steps);
      // The last one in storage may have just been placed, which ends placing
      if (!build?.type) break;
      if (isLinear(build.type)) build.rot = cell.cx !== from.cx ? 0 : 1;
      if (!tryPlace(cx, cz)) break;
    }
    painting = { last: cell };
    return;
  }
  hoverAnchor = anchor;
  updateGhost();
}

// ---------------------------------------------------------------- Clicking a placed structure

/** The structure whose card is open, if any. */
function selectedPiece(): Piece | undefined {
  if (!state || selected?.type !== 'piece') return undefined;
  const id = selected.id;
  return state.pieces.find((p) => p.id === id);
}

function refreshPiecePanel(): void {
  if (!state || selected?.type !== 'piece') return;
  const piece = selectedPiece();
  if (!piece) {
    select(null);
    return;
  }
  piecePanel.show(piece);
}

function afterPieceChange(): void {
  if (!state) return;
  gfx.syncPieces(state.pieces, gridOf(state));
  refreshSurvival();
  refreshPiecePanel();
  schedulePersist();
}

/** Turn the structure a quarter turn where it stands. Instant and free. */
function rotatePlaced(id?: number): void {
  if (!state) return;
  const target = id ?? selectedPiece()?.id;
  if (target === undefined) return;
  const result = rotatePiece(state, target);
  if (!result.ok) {
    ui.toast(result.reason);
    audio.error();
    return;
  }
  audio.place();
  afterPieceChange();
}

/** Lift the structure so it can be put down somewhere else. Instant and free. */
function startMoving(id: number): void {
  if (!state) return;
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece) return;
  if (state.at !== 'base') {
    ui.toast('Travel to your base first.');
    return;
  }
  beginPlacing(piece.type, id);
}

function takeDownSelected(id: number): void {
  takeDown(id);
  select(null);
}

function doWork(kind: 'repair' | 'upgrade' | 'clean', id: number): void {
  if (!state) return;
  const result = kind === 'repair' ? repairPiece(state, id) : kind === 'upgrade' ? upgradePiece(state, id) : cleanPiece(state, id);
  if (!result.ok) {
    ui.toast(result.reason);
    audio.error();
    return;
  }
  ui.toast(result.message, 'info');
  audio.buy();
  afterPieceChange();
}

function schedulePersist(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => void persist(), 1500);
}

// ---------------------------------------------------------------- Player actions

function handleOrder(storeId: StoreId, cart: Cart) {
  const result = placeOrder(state!, storeId, cart);
  if (result.ok) {
    ui.toast(`Bought for ${money(result.order.total)}. It is already in your storage.`, 'info');
    audio.buy();
    void persist();
  } else {
    ui.toast(result.reason);
    audio.error();
  }
  return result;
}

function handleBuyPlot(plotId: PlotId): boolean {
  const result = buyPlot(state!, plotId);
  if (!result.ok) {
    ui.toast(result.reason);
    return false;
  }
  gfx.setOwnedPlot(state!.plotId, landOf(state!));
  syncMarkers();
  ui.toast('Plot purchased. You can order supplies now.', 'info');
  audio.buy();
  void persist();
  return true;
}

function syncMarkers(): void {
  if (!state) return;
  const you = travel ? null : placePoint(state, state.at);
  const base = state.plotId ? placePoint(state, 'base') : null;
  gfx.setMarkers(you, base);
}

// ---------------------------------------------------------------- Director (news and events)

function runDirector(s: GameState): void {
  while (s.directedDay < dayOf(s.worldSeconds)) {
    const day = ++s.directedDay;
    void director
      .nextEvents({ day, phase: s.phase, hasPlot: s.plotId !== null, money: s.money })
      .then((events) => {
        if (state === s) applyEvents(s, validateEvents(events));
      })
      .catch((err) => console.warn('Director failed', err));
  }
}

// ---------------------------------------------------------------- Loop

function objective(s: GameState): string | null {
  // Before the outbreak the advisor panel tells the player what to do; this banner is only for the outbreak.
  if (s.phase === 'outbreak') return 'The outbreak has begun. Keep the family fed and watered. Zombies and base defense arrive in later updates.';
  return null;
}

// ---------------------------------------------------------------- Game speed

/** The speed the player chose: 1 is normal, 4 and 12 fast-forward. It is never saved, so a loaded game starts at normal. */
let speed = 1;

/** Fast-forward waits while you shop, build or travel, so no time is burned while you are busy. */
function effectiveSpeed(): number {
  return modalOpen() || build || travel ? 1 : speed;
}

function setSpeed(multiplier: number, reason?: string): void {
  if (!state || screen !== 'play') return;
  const next = [1, 4, 12].includes(multiplier) ? multiplier : 1;
  if (next === speed) return;
  speed = next;
  if (reason) ui.toast(reason, 'info');
}

/** Drop back to normal speed when something needs attention. */
function slowDownIfNeeded(s: GameState): void {
  if (speed === 1) return;
  const p = s.player;
  if (s.phase !== 'prep') setSpeed(1, 'Back to normal speed: the outbreak has begun.');
  else if (p.thirst < 35) setSpeed(1, 'Back to normal speed: your family is getting thirsty.');
  else if (p.hunger < 35) setSpeed(1, 'Back to normal speed: your family is getting hungry.');
  else if (p.health < 70) setSpeed(1, 'Back to normal speed: your family is losing health.');
}

// ---------------------------------------------------------------- Returns

function handleReturn(itemId: string, qty: number): void {
  if (!state) return;
  const result = returnItems(state, itemId, qty);
  if (!result.ok) {
    ui.toast(result.reason);
    audio.error();
    return;
  }
  ui.toast(`Returned ${qty}\u00d7 ${itemById(itemId).name}. You got ${money(result.refund)} back.`, 'info');
  audio.buy();
  refreshBuildBar();
  void persist();
}
// ---------------------------------------------------------------- Survival: advisor, warnings, connections

let advice: Advice | null = null;
let deathShown = false;

/** Recompute the advisor and push the results to the panels and the 3D warnings. */
function refreshSurvival(): void {
  if (!state) return;
  flushSurvival(state);
  advice = advise(state);
  vitals.update(state, advice);
  advisor.update(state, advice);

  const warnings = new Map<number, IssueKind>();
  for (const [id, list] of runtimeOf(state).issues) {
    // Show the most serious problem: a missing link or fuel before a shortage
    if (list.length > 0) warnings.set(id, list[0].kind);
  }
  for (const piece of state.pieces) {
    if (warnings.has(piece.id)) continue;
    const care = conditionIssue(piece);
    if (care) warnings.set(piece.id, care.kind);
  }
  gfx.setWarnings(warnings);
  gfx.setLinks(topologyOf(state).links);
}

function handleAdvice(a: AdviceAction): void {
  if (!state || screen !== 'play') return;
  switch (a.kind) {
    case 'show':
      gfx.focusPiece(a.pieceId);
      break;
    case 'store':
      toggleOnlineStore(true);
      shop.showCategory(a.category);
      break;
    case 'buy': {
      const result = handleOrder(ONLINE_STORE_ID, { [a.item]: a.qty });
      if (result.ok && isStructure(a.item)) startPlacing(a.item);
      refreshSurvival();
      break;
    }
    case 'place':
      startPlacing(a.item);
      break;
  }
}

function showGameOver(): void {
  if (!state || deathShown) return;
  deathShown = true;
  const last = [...state.messages].reverse().find((m) => m.kind === 'warning');
  ui.showGameOver({
    reason: last?.text ?? 'Your family did not survive.',
    day: dayOf(state.worldSeconds),
    onTitle: () => void showTitle(),
  });
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const renderDt = Math.min((now - lastFrame) / 1000, 0.1);

  if (document.hidden) {
    lastFrame = now;
    return;
  }

  if (screen === 'play' && state) {
    // The world clock runs only here: tab visible, not on the title screen or in the pause menu.
    const realDt = Math.min((now - lastFrame) / 1000, balance.maxFrameDelta);
    accumulator += realDt;
    sinceSave += realDt;

    while (accumulator >= balance.simStep) {
      accumulator -= balance.simStep;
      if (travel) {
        const worldDt = Math.min(travel.remaining, balance.simStep * travel.speed);
        stepSim(state, balance.simStep, worldDt);
        travel.remaining -= worldDt;
        if (travel.remaining <= 1e-6) {
          arrive();
          break;
        }
      } else {
        if (!runtimeOf(state).cheats.freeze) stepSim(state, balance.simStep, balance.simStep * config.timeScale * effectiveSpeed());
      }
    }

    runDirector(state);
    slowDownIfNeeded(state);
    const pan = input.pan();
    gfx.keyPan(pan.x, pan.y, renderDt);
    gfx.keyTurn(input.rotation(), renderDt);
    gfx.keyTilt(input.tilt(), renderDt);
    if (expandPanel.isOpen) expandPanel.refresh();
    if (gfx.viewAngle !== lastCompass) {
      lastCompass = gfx.viewAngle;
      ui.setCompass(lastCompass);
    }

    if (sinceSave >= balance.autosaveRealSeconds) {
      sinceSave = 0;
      void persist();
    }
    sinceUiRefresh += realDt;
    if (sinceUiRefresh >= 0.5) {
      sinceUiRefresh = 0;
      refreshSurvival();
      shop.refresh();
      realty.refresh();
      drawer.refresh(state);
      if (placePanel.isOpen) refreshPlacePanel();
      if (piecePanel.isOpen) refreshPiecePanel();
      ui.setCheats(activeCheats(state));
      // Keep structures that are being built growing, and the build bar in step with deliveries
      gfx.syncPieces(state.pieces, gridOf(state));
      if (build) refreshBuildBar();
    }
    toastNewMessages(state);
    if (state.phase === 'dead') showGameOver();
  }
  lastFrame = now;

  sinceSoundUpdate += renderDt;
  if (sinceSoundUpdate >= 0.25) {
    sinceSoundUpdate = 0;
    audio.update(soundEnv());
  }
  gfx.traffic?.setEnabled(!state || state.phase === 'prep');

  if (state) {
    if (travel) {
      const t = 1 - travel.remaining / travel.total;
      const e = t * t * (3 - 2 * t);
      gfx.setMarkers(
        { x: travel.from.x + (travel.dest.x - travel.from.x) * e, z: travel.from.z + (travel.dest.z - travel.from.z) * e },
        state.plotId ? placePoint(state, 'base') : null,
      );
    }
    const unread = state.messages.filter((m) => m.id > seenMsgId && m.kind !== 'order').length;
    gfx.render(screen === 'play' ? renderDt : 0, visualSeconds(state));
    const day = dayOf(state.worldSeconds);
    ui.updateHud({
      day,
      time: formatClock(state.worldSeconds),
      money: state.money,
      timeScale: config.timeScale,
      outbreak: state.phase !== 'prep',
      outbreakDay: balance.outbreakDay,
      daysLeft: Math.max(0, balance.outbreakDay - day),
      unreadNews: drawer.isOpen && drawer.currentTab === 'news' ? 0 : unread,
      pendingOrders: state.orders.filter((o) => o.status === 'transit').length,
      canBuild: state.plotId !== null,
      objective: objective(state),
      location: placeName(state.at),
      dayPart: dayPart(hourOf(state.worldSeconds)),
      raining: gfx.atmosphere.rain > 0.15,
      muted: audio.isMuted,
      speed,
      speedHeld: speed > 1 && effectiveSpeed() === 1,
    });
    if (drawer.isOpen && drawer.currentTab === 'news') seenMsgId = latestMsgId(state);
  } else {
    gfx.render(0, worldSecondsAt(1, 11));
  }
}

function toastNewMessages(s: GameState): void {
  const fresh = s.messages.filter((m) => m.id > toastedMsgId);
  if (fresh.length === 0) return;
  toastedMsgId = latestMsgId(s);
  const last = fresh[fresh.length - 1];
  // Purchases already have their own toast.
  if (last.kind === 'order') return;
  if (/is finished\.$/.test(last.text)) audio.done();
  // A warning always takes you back to normal speed, so you read it before time moves on
  if (last.kind === 'warning' && speed > 1) speed = 1;
  ui.toast(last.text, last.kind === 'warning' ? 'error' : 'info');
}

requestAnimationFrame((t) => {
  lastFrame = t;
  frame(t);
});

void showTitle();

// Saved product pictures load straight away. Any that are missing are drawn later, when the browser is idle.
void preloadThumbnails();
window.setTimeout(() => prewarmThumbnails(), 2500);

// Keep the game's files in the browser, so later visits start fast and also work offline.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => console.warn('Offline cache unavailable', err));
  });
}

// ---------------------------------------------------------------- Dev helpers

if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__setTimeScale = setTimeScale;
  w.__game = {
    get state() {
      return state;
    },
    /** Jump forward in time, running daily restocks, deliveries and the outbreak on the way. */
    skipToDay(day: number, hour = 8) {
      if (!state) return;
      const delta = worldSecondsAt(day, hour) - state.worldSeconds;
      if (delta > 0) stepSim(state, 0, delta);
      else state.worldSeconds = worldSecondsAt(day, hour);
    },
    /** Own a plot without paying (for testing). */
    ownPlot(id: PlotId) {
      if (!state) return;
      state.plotId = id;
      gfx.setOwnedPlot(id, landOf(state));
      syncMarkers();
    },
    /** Put a finished structure on the base without paying or waiting (for testing). Returns an error text or null. */
    placeDone(type: string, cx: number, cz: number, rot = 0) {
      if (!state) return 'no game';
      state.storage[type] = (state.storage[type] ?? 0) + 1;
      const prevAt = state.at;
      state.at = 'base';
      const result = placePiece(state, type, cx, cz, rot);
      state.at = prevAt;
      if (!result.ok) return result.reason;
      const piece = state.pieces[state.pieces.length - 1];
      piece.progress = 1;
      gfx.syncPieces(state.pieces, gridOf(state));
      return null;
    },
    /** Turn hunger, thirst and the move-in supplies off or on (for testing). */
    survivalOff(off: boolean) {
      if (state) runtimeOf(state).disabled = off;
    },
    /** How many product pictures are ready (for testing the picture cache). */
    thumbs() {
      return thumbnailStats();
    },
    /** Open a product's detail sheet in the open store (for testing). */
    showProduct(id: string) {
      shop.showProduct(id);
    },
    /** Change the game speed as if the player pressed the button (for testing). */
    setSpeed(m: number) {
      setSpeed(m);
    },
    /** The speed the player chose and the speed the clock actually runs at right now (for testing). */
    speedInfo() {
      return { chosen: speed, effective: effectiveSpeed() };
    },
    /** Drawing cost numbers (for testing performance). */
    perf() {
      return gfx.perf();
    },
    /** Write the game to the save slot now (for testing). */
    save() {
      return persist();
    },
    /** Simulate all waiting survival time and refresh the panels (for testing). */
    refreshSurvival() {
      refreshSurvival();
    },
    /** What the survival rules see right now (for testing). */
    summary() {
      return state ? JSON.parse(JSON.stringify(summarize(state), (_k, v) => (v === Infinity ? 'inf' : v))) : null;
    },
    advice() {
      return advice ? JSON.parse(JSON.stringify({ alerts: advice.alerts, steps: advice.steps }, (_k, v) => (v === Infinity ? 'inf' : v))) : null;
    },
    /** Problem codes per piece id (for testing). */
    issues() {
      const out: Record<number, string[]> = {};
      if (state) for (const [id, list] of runtimeOf(state).issues) out[id] = list.map((i) => i.code);
      return out;
    },
    /** Lowest and highest point of every structure model (for testing). */
    modelBounds() {
      return structureBounds(STRUCTURE_LIST);
    },
    /** Let game time pass, running all the game systems (for testing). */
    advanceHours(hours: number) {
      if (!state) return;
      stepSim(state, 0, hours * 3600);
      gfx.syncPieces(state.pieces, gridOf(state));
    },
    /** Sound state, for testing. */
    audio() {
      return audio.debug();
    },
    /** Traffic and weather numbers, for testing. */
    scenery() {
      const t = gfx.traffic;
      return {
        cars: t?.carCount ?? 0,
        visibleCars: t?.visibleCarCount ?? 0,
        snapshot: t?.snapshot ?? [],
        headlights: headlightMat.emissiveIntensity,
        stopped: t?.stoppedCount ?? 0,
        minGap: t?.minGap ?? 0,
        pieces: gfx.pieceStats(),
        birds: gfx.atmosphere.birdCount,
        fireflies: gfx.atmosphere.firefliesShown,
        rain: gfx.atmosphere.rain,
      };
    },
    /** Run the traffic, clouds and rain forward by some seconds (for testing). */
    advanceScenery(seconds: number) {
      if (state) gfx.advanceScenery(seconds, state.worldSeconds);
    },
    /** Make it rain (0 to 1) or stop, and stop random showers. */
    setRain(level: number) {
      gfx.atmosphere.setWeather(false);
      gfx.atmosphere.forceRain(level);
    },
    /** Put items straight into storage (for testing). */
    give(itemId: string, qty = 1) {
      if (state) state.storage[itemId] = (state.storage[itemId] ?? 0) + qty;
    },
    /** Let the camera go anywhere, for looking at models outside the map. */
    unclamp() {
      city.bounds.minX = -400;
      city.bounds.maxX = 400;
      city.bounds.minZ = -400;
      city.bounds.maxZ = 400;
    },
    /** Lay out one of every structure in a grid at the given spot. */
    gallery(x0: number, z0: number) {
      let i = 0;
      for (const def of STRUCTURE_LIST) {
        const model = makeStructure(def);
        const w = Math.max(def.w, def.d) * CELL;
        model.position.set(x0 + (i % 8) * 11, 0, z0 + Math.floor(i / 8) * 11);
        gfx.scene.add(model);
        void w;
        i++;
      }
    },
    /** Turn the view by some degrees and finish at once (for testing). */
    turnView(deg: number) {
      gfx.turn((deg * Math.PI) / 180, true);
    },
    /** Tilt the view by some degrees and finish at once (for testing). */
    tiltView(deg: number) {
      gfx.tilt((deg * Math.PI) / 180, true);
    },
    /** The camera's angle above the ground, in degrees (for testing). */
    tiltDegrees() {
      return (gfx.viewTilt * 180) / Math.PI;
    },
    /** The camera angle in degrees (for testing). */
    viewDegrees() {
      return (gfx.viewAngle * 180) / Math.PI;
    },
    setMoney(n: number) {
      if (state) state.money = n;
    },
    settleCamera() {
      gfx.settleCamera();
    },
    /** Move the camera to a map point without easing. */
    snapCamera(x: number, z: number) {
      gfx.snapTo({ x, z });
    },
    /** Client pixel position of a map point. */
    project(x: number, z: number, height = 2) {
      return gfx.project({ x, z }, height);
    },
  };
}
