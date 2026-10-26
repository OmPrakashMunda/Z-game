import { button, el, money, type ButtonSpec } from './dom';
import type { DrawerTab } from './drawer';
import type { DayPart } from '../sim/clock';
import { icon } from './icons';

export interface HudData {
  day: number;
  time: string;
  money: number;
  timeScale: number;
  outbreak: boolean;
  outbreakDay: number;
  daysLeft: number;
  unreadNews: number;
  pendingOrders: number;
  /** True once the player owns a plot and the shops are still open. */
  canBuild: boolean;
  objective: string | null;
  location: string;
  /** The waypoint and how far away it is, or null when none is set. */
  waypoint: string | null;
  /** What the backpack holds, such as "12 / 25 kg", or null when it is empty. */
  pack: string | null;
  dayPart: DayPart;
  raining: boolean;
  muted: boolean;
  /** The speed the player chose: 1 is normal, bigger is fast-forward. */
  speed: number;
  /** True while a shop, the build mode or a trip holds the clock at normal speed for now. */
  speedHeld: boolean;
}

/** The speeds on offer: normal, fast, and very fast. */
export const SPEEDS = [
  { value: 1, icon: 'Play', label: 'Normal speed' },
  { value: 4, icon: 'FastForward', label: 'Fast: 4 times faster' },
  { value: 12, icon: 'ChevronsRight', label: 'Very fast: 12 times faster' },
] as const;

export interface HudHandlers {
  onSpeed(multiplier: number): void;
  onOnlineStore(): void;
  onBuild(): void;
  onDrawer(tab: DrawerTab): void;
  onMenu(): void;
  onToggleSound(): void;
  /** Turn the view one step: 1 counter-clockwise, -1 clockwise. */
  onRotate(dir: number): void;
  /** Tilt the view one step: 1 toward top-down, -1 toward the horizon. */
  onTilt(dir: number): void;
  onResetView(): void;
  /** Show or hide every power cable and water pipe. */
  onToggleLines(): void;
}

/** Set text only when it changed. Writing the same text every frame would make the browser redo layout for nothing. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** A big square button for the action dock: an icon, a label and the key that does the same thing. */
function dockButton(iconName: string, label: string, hotkey: string, extra = ''): { button: HTMLButtonElement; count: HTMLElement } {
  const button = el('button', `dock-btn ${extra}`.trim()) as HTMLButtonElement;
  const count = el('span', 'dock-count');
  count.style.display = 'none';
  button.append(el('span', 'dock-key', hotkey), el('span', 'dock-icon'), el('span', 'dock-label', label), count);
  button.querySelector('.dock-icon')!.append(icon(iconName, 28));
  button.title = `${label} (${hotkey})`;
  return { button, count };
}

export class UI {
  private readonly hud = el('div', 'hud');
  private readonly dayNum = el('span', 'day-num');
  private readonly dayTotal = el('span', 'day-total');
  private readonly countdown = el('span', 'countdown');
  private readonly countdownFill = el('span', 'countdown-fill');
  private readonly timeEl = el('span', 'time icon-label');
  private readonly timeIcon = el('span', 'icon-host');
  private readonly timeText = el('span');
  private readonly weatherEl = el('span', 'weather icon-label');
  private readonly soundBtn = el('button', 'hud-btn icon-only');
  private shownPart = '';
  private shownMuted: boolean | null = null;
  private readonly moneyEl = el('span', 'money-num');
  private readonly tagEl = el('span', 'tag');
  private readonly cheatTag = el('span', 'tag cheat-tag');
  private readonly leftEl = el('span', 'days-left');
  private readonly locEl = el('span', 'place icon-label');
  private readonly locText = el('span');
  private readonly wpEl = el('span', 'waypoint icon-label');
  private readonly wpText = el('span');
  private readonly packEl = el('span', 'pack icon-label');
  private readonly packText = el('span');
  private readonly speedEl = el('span', 'speed');
  private readonly viewGroup = el('div', 'view-group');
  private readonly compassIcon = el('span', 'compass-icon');
  private readonly linesBtn = el('button', 'view-btn');
  private readonly speedGroup = el('div', 'speed-group');
  private readonly speedButtons = new Map<number, HTMLElement>();
  private readonly dock = el('div', 'dock');
  private readonly buildBtn: HTMLButtonElement;
  private readonly ordersCount: HTMLElement;
  private readonly newsBtn: HTMLButtonElement;
  private readonly newsCount: HTMLElement;
  private readonly goalEl = el('div', 'goal');
  private readonly helpEl = el('div', 'help', 'WASD: walk   Shift: run   Space: enter or use   Q/E, Z/C or right-drag: turn and tilt the view   Wheel: zoom   Click a place: info and waypoint   Esc: menu');
  private readonly tooltipEl = el('div', 'tooltip');
  private overlay: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;

  constructor(readonly root: HTMLElement, handlers: HudHandlers) {
    // ---- Top status bar
    const day = el('span', 'day');
    day.append(icon('CalendarDays', 18), el('span', 'day-label', 'Day'), this.dayNum, this.dayTotal);
    this.countdown.title = 'Time left before the outbreak';
    this.countdown.append(this.countdownFill);
    this.timeEl.append(this.timeIcon, this.timeText);
    this.weatherEl.append(icon('CloudRain', 15), el('span', undefined, 'Raining'));
    this.weatherEl.style.display = 'none';
    const money = el('span', 'money icon-label');
    money.title = 'Your money';
    money.append(icon('Coins', 18), this.moneyEl);
    this.locEl.append(icon('MapPin', 14), this.locText);
    this.wpEl.append(icon('Flag', 14), this.wpText);
    this.wpEl.style.display = 'none';
    this.packEl.title = 'What you carry. It goes into your storage when you reach your base.';
    this.packEl.append(icon('Backpack', 14), this.packText);
    this.packEl.style.display = 'none';
    this.soundBtn.title = 'Sound (M)';
    this.soundBtn.addEventListener('click', () => handlers.onToggleSound());
    const menuBtn = el('button', 'hud-btn icon-only');
    menuBtn.title = 'Menu (Esc)';
    menuBtn.append(icon('Menu', 18));
    menuBtn.addEventListener('click', () => handlers.onMenu());
    // View control: turn the map all the way round
    const viewBtn = (title: string, name: string, onClick: () => void) => {
      const b = el('button', 'view-btn');
      b.title = title;
      b.append(icon(name, 16));
      b.addEventListener('click', onClick);
      return b;
    };
    this.compassIcon.append(icon('Compass', 18));
    const compass = el('button', 'view-btn compass');
    compass.title = 'The needle points north. Click to reset the view.';
    compass.append(this.compassIcon);
    compass.addEventListener('click', () => handlers.onResetView());
    this.viewGroup.append(
      viewBtn('Turn the view left (Q, or drag with the right button)', 'RotateCcw', () => handlers.onRotate(1)),
      compass,
      viewBtn('Turn the view right (E, or drag with the right button)', 'RotateCw', () => handlers.onRotate(-1)),
      el('span', 'view-sep'),
      viewBtn('Look more from above (C). All the way up, squares stay square.', 'ChevronUp', () => handlers.onTilt(1)),
      viewBtn('Look more from the side (Z)', 'ChevronDown', () => handlers.onTilt(-1)),
      el('span', 'view-sep'),
    );
    this.linesBtn.title = 'Show or hide power cables and water pipes (U)';
    this.linesBtn.append(icon('Cable', 16));
    this.linesBtn.addEventListener('click', () => handlers.onToggleLines());
    this.viewGroup.append(this.linesBtn);
    // Speed control: normal, fast and very fast. Time passes faster; nothing else changes.
    this.speedGroup.title = 'Game speed. Press F to fast-forward or go back to normal.';
    for (const s of SPEEDS) {
      const b = el('button', 'speed-btn') as HTMLButtonElement;
      b.dataset.speed = String(s.value);
      b.title = s.label;
      b.append(icon(s.icon, 16), el('span', undefined, s.value === 1 ? '1x' : `${s.value}x`));
      b.addEventListener('click', () => handlers.onSpeed(s.value));
      this.speedGroup.append(b);
      this.speedButtons.set(s.value, b);
    }

    this.hud.append(
      day, this.countdown, this.leftEl, this.tagEl, this.cheatTag, this.timeEl, this.weatherEl, money, this.locEl, this.wpEl, this.packEl,
      el('span', 'spacer'), this.viewGroup, this.speedGroup, this.speedEl, this.soundBtn, menuBtn,
    );

    // ---- Action dock along the bottom
    const build = dockButton('Hammer', 'Build', 'V', 'primary');
    const store = dockButton('ShoppingCart', 'Online store', 'B', 'primary');
    const storage = dockButton('Package', 'Storage', 'I');
    const orders = dockButton('Truck', 'Orders', 'O');
    const news = dockButton('Newspaper', 'News', 'N');
    this.buildBtn = build.button;
    this.ordersCount = orders.count;
    this.newsBtn = news.button;
    this.newsCount = news.count;
    build.button.addEventListener('click', () => handlers.onBuild());
    store.button.addEventListener('click', () => handlers.onOnlineStore());
    storage.button.addEventListener('click', () => handlers.onDrawer('storage'));
    orders.button.addEventListener('click', () => handlers.onDrawer('orders'));
    news.button.addEventListener('click', () => handlers.onDrawer('news'));
    this.dock.append(build.button, store.button, storage.button, orders.button, news.button);

    this.tooltipEl.style.display = 'none';
    this.goalEl.style.display = 'none';
    this.setHudVisible(false);
    root.append(this.hud, this.dock, this.goalEl, this.helpEl, this.tooltipEl);
  }

  /** Show which cheats are on, so you never forget one. Hidden when none are. */
  setCheats(names: string[]): void {
    this.cheatTag.style.display = names.length ? '' : 'none';
    if (names.length) {
      setText(this.cheatTag, `Cheats ${names.length}`);
      this.cheatTag.title = names.join(', ');
    }
  }

  /** Light the cables-and-pipes button while those lines are shown. */
  setLinesActive(active: boolean): void {
    this.linesBtn.classList.toggle('active', active);
  }

  /** Point the compass needle north. `azimuth` is the camera angle in radians; the default view is a quarter turn from the x axis. */
  setCompass(azimuth: number): void {
    const deg = ((Math.PI / 4 - azimuth) * 180) / Math.PI;
    this.compassIcon.style.transform = `rotate(${deg.toFixed(1)}deg)`;
  }

  /** The build bar sits where the dock is, so the dock steps aside while building. */
  setDockHidden(hidden: boolean): void {
    this.dock.classList.toggle('hidden', hidden);
    this.root.classList.toggle('building', hidden);
  }

  setHudVisible(visible: boolean): void {
    this.hud.style.display = visible ? 'flex' : 'none';
    this.dock.style.display = visible ? 'flex' : 'none';
    this.helpEl.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.goalEl.style.display = 'none';
      this.tooltipEl.style.display = 'none';
    }
  }

  updateHud(d: HudData): void {
    setText(this.dayNum, String(d.day));
    setText(this.dayTotal, d.outbreak ? '' : `/ ${d.outbreakDay}`);
    this.countdown.style.display = d.outbreak ? 'none' : '';
    const pct = `${Math.min(100, Math.max(0, ((d.day - 1) / d.outbreakDay) * 100)).toFixed(1)}%`;
    if (this.countdownFill.style.width !== pct) this.countdownFill.style.width = pct;
    setText(this.timeText, d.time);
    if (this.shownPart !== d.dayPart) {
      this.shownPart = d.dayPart;
      const names = { dawn: 'Sunrise', day: 'Sun', dusk: 'Sunset', night: 'Moon' } as const;
      this.timeIcon.replaceChildren(icon(names[d.dayPart], 18));
      this.timeEl.title = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' }[d.dayPart];
    }
    const rainShown = d.raining ? '' : 'none';
    if (this.weatherEl.style.display !== rainShown) this.weatherEl.style.display = rainShown;
    if (this.shownMuted !== d.muted) {
      this.shownMuted = d.muted;
      this.soundBtn.replaceChildren(icon(d.muted ? 'VolumeX' : 'Volume2', 18));
    }
    setText(this.moneyEl, money(d.money));
    setText(this.tagEl, d.outbreak ? 'Outbreak' : 'Preparing');
    const tagClass = d.outbreak ? 'tag outbreak' : 'tag';
    if (this.tagEl.className !== tagClass) this.tagEl.className = tagClass;
    setText(this.leftEl, d.outbreak ? '' : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`);
    setText(this.locText, d.location);
    if (d.waypoint) setText(this.wpText, d.waypoint);
    if (d.pack) setText(this.packText, d.pack);
    const packShown = d.pack ? '' : 'none';
    if (this.packEl.style.display !== packShown) this.packEl.style.display = packShown;
    const wpShown = d.waypoint ? '' : 'none';
    if (this.wpEl.style.display !== wpShown) this.wpEl.style.display = wpShown;
    setText(this.speedEl, `${d.timeScale * d.speed}x`);
    this.speedEl.title = `One real second is ${d.timeScale * d.speed} game seconds`;
    for (const [value, b] of this.speedButtons) b.classList.toggle('active', value === d.speed);
    this.speedGroup.classList.toggle('held', d.speedHeld && d.speed > 1);
    this.speedGroup.classList.toggle('fast', d.speed > 1);
    const buildShown = d.canBuild ? '' : 'none';
    if (this.buildBtn.style.display !== buildShown) this.buildBtn.style.display = buildShown;
    this.setCount(this.ordersCount, d.pendingOrders);
    this.setCount(this.newsCount, d.unreadNews);
    this.newsBtn.classList.toggle('unread', d.unreadNews > 0);
    if (d.objective) {
      setText(this.goalEl, d.objective);
      if (this.goalEl.style.display !== 'block') this.goalEl.style.display = 'block';
    } else if (this.goalEl.style.display !== 'none') {
      this.goalEl.style.display = 'none';
    }
  }

  private setCount(node: HTMLElement, n: number): void {
    setText(node, n > 99 ? '99+' : String(n));
    const shown = n > 0 ? '' : 'none';
    if (node.style.display !== shown) node.style.display = shown;
  }
  setTooltip(text: string | null, x = 0, y = 0): void {
    if (!text) {
      this.tooltipEl.style.display = 'none';
      return;
    }
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${x + 16}px`;
    this.tooltipEl.style.top = `${y + 18}px`;
  }

  toast(message: string, kind: 'error' | 'info' = 'error'): void {
    this.toastEl?.remove();
    const t = el('div', kind === 'info' ? 'toast info' : 'toast');
    t.append(icon(kind === 'info' ? 'Info' : 'TriangleAlert', 20), el('span', undefined, message));
    this.root.append(t);
    this.toastEl = t;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.remove(), 4500);
  }

  get isOverlayOpen(): boolean {
    return this.overlay !== null;
  }

  closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private showCard(
    title: string, titleTag: 'h1' | 'h2', paragraphs: Array<{ text: string; cls?: string }>, buttons: ButtonSpec[],
    extras: HTMLElement[] = [],
  ): void {
    this.closeOverlay();
    const overlay = el('div', 'overlay');
    const card = el('div', 'card');
    card.append(el(titleTag, undefined, title));
    for (const p of paragraphs) card.append(el('p', p.cls, p.text));
    for (const e of extras) card.append(e);
    const btns = el('div', 'btns');
    for (const b of buttons) btns.append(button(b));
    card.append(btns);
    overlay.append(card);
    this.root.append(overlay);
    this.overlay = overlay;
  }

  showTitle(opts: {
    hasSave: boolean;
    notice?: string;
    noticeIsWarning?: boolean;
    onContinue: () => void;
    onNew: () => void;
  }): void {
    const paras: Array<{ text: string; cls?: string }> = [
      { text: 'The outbreak is 30 days away. You have a fortune and one chance to build a base that lasts. Buy land, order supplies, and fortify.' },
    ];
    if (opts.notice) paras.push({ text: opts.notice, cls: opts.noticeIsWarning ? 'warn' : 'sub' });
    const buttons: ButtonSpec[] = [];
    if (opts.hasSave) buttons.push({ label: 'Continue', onClick: opts.onContinue });
    buttons.push({
      label: 'New Game',
      kind: opts.hasSave ? 'secondary' : undefined,
      onClick: () => {
        if (!opts.hasSave && !opts.notice) return opts.onNew();
        this.confirm('Start a new game?', 'This will replace your current save.', 'Start new game', opts.onNew, () => this.showTitle(opts));
      },
    });
    this.showCard('Z-Game: 30 Days', 'h1', paras, buttons);
  }

  confirm(title: string, text: string, confirmLabel: string, onYes: () => void, onNo: () => void): void {
    this.showCard(title, 'h2', [{ text }], [
      { label: confirmLabel, kind: 'danger', onClick: onYes },
      { label: 'Cancel', kind: 'secondary', onClick: onNo },
    ]);
  }

  showMenu(opts: {
    timeScale: number;
    volume: number;
    muted: boolean;
    onVolume: (v: number) => void;
    onMute: (muted: boolean) => void;
    onResume: () => void;
    onSave: () => void;
    onQuit: () => void;
  }): void {
    const sound = el('div', 'sound-row');
    const toggle = el('button', 'tool-btn');
    const drawToggle = (muted: boolean) => toggle.replaceChildren(icon(muted ? 'VolumeX' : 'Volume2', 16), el('span', undefined, muted ? 'Sound off' : 'Sound on'));
    let muted = opts.muted;
    drawToggle(muted);
    toggle.addEventListener('click', () => {
      muted = !muted;
      drawToggle(muted);
      opts.onMute(muted);
    });
    const slider = el('input', 'volume') as HTMLInputElement;
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(opts.volume * 100));
    slider.addEventListener('input', () => opts.onVolume(Number(slider.value) / 100));
    sound.append(toggle, slider);
    this.showCard(
      'Paused',
      'h2',
      [
        { text: 'The game clock is stopped while this menu is open.' },
        { text: `Time speed: ${opts.timeScale}x (set VITE_TIME_SCALE in .env, then restart the dev server).`, cls: 'sub' },
      ],
      [
        { label: 'Resume', onClick: opts.onResume },
        { label: 'Save game', kind: 'secondary', onClick: opts.onSave },
        { label: 'Save & Exit to title', kind: 'secondary', onClick: opts.onQuit },
      ],
      [sound],
    );
  }

  showGameOver(opts: { reason: string; day: number; onTitle: () => void }): void {
    this.showCard(
      'Your family did not survive',
      'h2',
      [
        { text: opts.reason },
        { text: `You lasted until day ${opts.day}. Your last save is still there: choose Continue on the title screen to try again from it.`, cls: 'sub' },
      ],
      [{ label: 'Back to the title screen', onClick: opts.onTitle }],
    );
  }

  /** The bar shown while searching a house. Pass null to hide it. */
  setSearch(text: string | null, fraction = 0): void {
    let box = this.root.querySelector<HTMLElement>('.house-search');
    if (!text) {
      box?.remove();
      return;
    }
    if (!box) {
      box = el('div', 'house-search');
      const bar = el('span', 'search-bar');
      bar.append(el('span', 'search-fill'));
      box.append(el('span', 'search-text'), bar, el('span', 'search-hint', 'Move to stop'));
      this.root.append(box);
    }
    setText(box.querySelector<HTMLElement>('.search-text')!, text);
    box.querySelector<HTMLElement>('.search-fill')!.style.width = `${Math.round(fraction * 100)}%`;
  }

  /** The hint above the dock, for example "Space: Enter Fresh Mart". Pass null to hide it. */
  setPrompt(text: string | null, key = 'Space'): void {
    let banner = this.root.querySelector<HTMLElement>('.prompt');
    if (!text) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = el('div', 'prompt');
      this.root.append(banner);
    }
    const label = `${key}|${text}`;
    if (banner.dataset.label === label) return;
    banner.dataset.label = label;
    banner.replaceChildren(el('span', 'prompt-key', key), el('span', undefined, text));
  }}
