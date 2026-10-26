import {
  Moon, Sunrise, Sunset, Volume2, VolumeX,
  Armchair, ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, Expand, Fish, Flag, Flower2, Footprints, Leaf, Trees, TreePine,
  Bed, Boxes, Bug, Cog, Fan, RadioTower, RotateCw, Search, ShoppingCart, Tent, Warehouse,
  Anvil, Apple, Axe, Backpack, Bandage, Bike, Barrel, Bath, Battery, BatteryFull, Bean, Binoculars, Bird, Blocks, Bolt, Bus,
  Cable, Candy, Car, CarFront, Caravan, Carrot, Check, Citrus, Cloud, CloudRain, Construction, Container, Cookie, Cross,
  Crosshair, Cuboid, Cylinder, Disc, DoorClosed, Drill, Droplet, Droplets, Dumbbell, Fence, Flame, FlameKindling,
  FlaskConical, Flower, Fuel, Gauge, GlassWater, HeartPulse, Hammer, House, Layers, Lightbulb, Lock, LockKeyhole, MapPin,
  Menu, Mountain, Newspaper, Nut, Package, Pill, Pipette, PlugZap, Ruler, Scroll, Shield, ShieldCheck, Shovel, Soup, Sprout,
  Stethoscope, Sun, Sword, Target, Trash2, TrendingUp, Triangle, Truck, Utensils, Waves, Weight, Wheat, Wrench, X, Zap,
  ChevronDown, ChevronUp, Circle, CircleCheck, Heart, ListChecks, TriangleAlert, CalendarDays, Coins, Info, ChevronLeft, Hourglass, Play, FastForward, ChevronsRight, Undo2, DraftingCompass, Move, Compass, RotateCcw, ArrowUp, ArrowRight, ArrowDown, ArrowLeft,
  createElement,
} from 'lucide';
import { CATEGORIES, ITEMS, type ItemDef } from '../data/items';

/** Every icon the game can show. Add an import above and an entry here to make a new one available. */
const REGISTRY = {
  Moon, Sunrise, Sunset, Volume2, VolumeX,
  Armchair, ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, Expand, Fish, Flag, Flower2, Footprints, Leaf, Trees, TreePine,
  Bed, Boxes, Bug, Cog, Fan, RadioTower, RotateCw, Search, ShoppingCart, Tent, Warehouse,
  Anvil, Apple, Axe, Backpack, Bandage, Bike, Barrel, Bath, Battery, BatteryFull, Bean, Binoculars, Bird, Blocks, Bolt, Bus,
  Cable, Candy, Car, CarFront, Caravan, Carrot, Check, Citrus, Cloud, CloudRain, Construction, Container, Cookie, Cross,
  Crosshair, Cuboid, Cylinder, Disc, DoorClosed, Drill, Droplet, Droplets, Dumbbell, Fence, Flame, FlameKindling,
  FlaskConical, Flower, Fuel, Gauge, GlassWater, HeartPulse, Hammer, House, Layers, Lightbulb, Lock, LockKeyhole, MapPin,
  Menu, Mountain, Newspaper, Nut, Package, Pill, Pipette, PlugZap, Ruler, Scroll, Shield, ShieldCheck, Shovel, Soup, Sprout,
  Stethoscope, Sun, Sword, Target, Trash2, TrendingUp, Triangle, Truck, Utensils, Waves, Weight, Wheat, Wrench, X, Zap,
  ChevronDown, ChevronUp, Circle, CircleCheck, Heart, ListChecks, TriangleAlert, CalendarDays, Coins, Info, ChevronLeft, Hourglass, Play, FastForward, ChevronsRight, Undo2, DraftingCompass, Move, Compass, RotateCcw, ArrowUp, ArrowRight, ArrowDown, ArrowLeft,
};

export type IconName = keyof typeof REGISTRY;

function isIconName(name: string): name is IconName {
  return name in REGISTRY;
}

// Fail fast if the data names an icon that does not exist.
for (const item of Object.values(ITEMS)) {
  if (!isIconName(item.icon)) throw new Error(`Item "${item.id}" uses unknown icon "${item.icon}"`);
}
for (const [id, cat] of Object.entries(CATEGORIES)) {
  if (!isIconName(cat.icon)) throw new Error(`Category "${id}" uses unknown icon "${cat.icon}"`);
}

/** An inline SVG icon. It takes the text colour of its parent. */
export function icon(name: string, size = 16): SVGElement {
  const key: IconName = isIconName(name) ? name : 'Package';
  const svg = createElement(REGISTRY[key], { width: size, height: size, 'stroke-width': 2 }) as SVGElement;
  svg.classList.add('ico');
  return svg;
}

/** An icon followed by text, for buttons and headings. */
export function iconLabel(name: string, text: string, size = 16): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'icon-label';
  const t = document.createElement('span');
  t.textContent = text;
  span.append(icon(name, size), t);
  return span;
}

/** A small coloured badge holding an item's icon. */
export function itemChip(item: ItemDef, size = 18): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.style.background = CATEGORIES[item.category].color;
  chip.append(icon(item.icon, size));
  return chip;
}

/** A coloured badge for a whole category. */
export function categoryChip(category: keyof typeof CATEGORIES, size = 16): HTMLSpanElement {
  const info = CATEGORIES[category];
  const chip = document.createElement('span');
  chip.className = 'chip small';
  chip.style.background = info.color;
  chip.append(icon(info.icon, size));
  return chip;
}
