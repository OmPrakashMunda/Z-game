import { SANDBOX_FUNDS } from '../sim/economy';
import { analyseBase, GROUP_LABEL, planBase, TARGET_PEOPLE, type BasePlan, type Finding, type Group } from '../sim/architect';
import type { GameState } from '../sim/state';
import { clearChildren, el, money } from './dom';
import { icon } from './icons';

export interface ArchitectHandlers {
  onFunds: () => void;
  onBuild: () => void;
}

const GROUP_ORDER: Group[] = ['land', 'water', 'food', 'power', 'housing', 'security', 'upkeep', 'access'];
const GROUP_ICON: Record<Group, string> = { water: 'Droplet', food: 'Wheat', power: 'Zap', housing: 'House', security: 'Shield', access: 'Footprints', land: 'Expand', upkeep: 'Wrench' };

/** The Base Architect: what your base has, what it lacks, and a one-click upgrade for security and self-sufficiency. */
export class ArchitectPanel {
  private readonly panel = el('div', 'architect');
  private readonly body = el('div', 'architect-body');
  private readonly footer = el('div', 'arch-footer');
  private open = false;
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly getState: () => GameState, private readonly handlers: ArchitectHandlers) {
    const close = el('button', 'x');
    close.append(icon('X', 16));
    close.title = 'Close';
    close.addEventListener('click', () => this.hide());
    const head = el('div', 'panel-head');
    head.append(icon('DraftingCompass', 18), el('span', undefined, 'Base architect'));
    this.panel.append(close, head, this.body, this.footer);
    this.panel.style.display = 'none';
    parent.append(this.panel);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.panel.style.display = 'flex';
    this.refresh(true);
  }

  hide(): void {
    this.open = false;
    this.panel.style.display = 'none';
  }

  /** Redraw after the money, the pieces or the day changed. */
  refresh(force = false): void {
    if (!this.open) return;
    const state = this.getState();
    const key = JSON.stringify([state.plotId, state.expansion, Math.floor(state.money / 100), state.pieces.length, state.phase, state.at === 'base', state.storage.seeds_veg ?? 0]);
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const scroll = this.body.scrollTop;
    clearChildren(this.body);
    clearChildren(this.footer);
    if (!state.plotId) {
      this.body.append(el('p', 'empty', 'Buy a base plot first. The architect designs around the land you own.'));
      return;
    }
    this.body.append(this.findings(analyseBase(state)));
    const plan = planBase(state);
    if (!plan) {
      this.body.append(el('p', 'empty', 'The shops have closed, so there is nothing left to order. Anything you already own can still be placed from the build menu.'));
      return;
    }
    this.body.append(this.planView(plan));
    this.footer.append(...this.footerView(plan, state));
    this.body.scrollTop = scroll;
  }

  private findings(list: Finding[]): HTMLElement {
    const box = el('div', 'arch-findings');
    box.append(el('h4', undefined, 'Your base now'));
    for (const f of list) {
      const row = el('div', `arch-find ${f.status}`);
      row.append(icon(f.status === 'good' ? 'CircleCheck' : 'TriangleAlert', 16));
      const text = el('div', 'arch-find-text');
      text.append(el('b', undefined, f.title));
      if (f.status !== 'good') text.append(el('span', 'dim', f.detail));
      else row.title = f.detail;
      row.append(text);
      box.append(row);
    }
    return box;
  }

  private planView(plan: BasePlan): HTMLElement {
    const box = el('div', 'arch-plan');
    box.append(el('h4', undefined, 'The upgrade'));
    box.append(
      el('p', 'dim', `Crops grow in the outer belt, inside a wall with a gate on the side facing the road. Homes, water and power sit in an inner yard behind a second fence. Designed for ${TARGET_PEOPLE} people.`),
    );

    if (plan.lines.length === 0) box.append(el('p', 'arch-result good', 'Your base already matches this design. There is nothing to add.'));

    for (const group of GROUP_ORDER) {
      const lines = plan.lines.filter((l) => l.group === group);
      if (lines.length === 0) continue;
      const row = el('div', 'arch-group');
      const head = el('div', 'arch-group-head icon-label');
      head.append(icon(GROUP_ICON[group], 16), el('span', undefined, GROUP_LABEL[group]));
      const total = lines.reduce((n, l) => n + l.total, 0);
      head.append(el('span', 'spacer'), el('b', undefined, money(total)));
      const items = lines.map((l) => `${l.qty} ${l.name.toLowerCase()}`).join(', ');
      row.append(head, el('div', 'dim small', items));
      box.append(row);
    }

    const o = plan.outcome;
    const result = el('div', `arch-result ${o.ok ? 'good' : 'warn'}`);
    result.append(
      el('b', undefined, o.ok ? `Tested: it runs by itself for ${o.people} people` : 'Tested: some problems remain'),
      el('div', undefined, `Food ${Math.round(o.mealsMake)} meals a day (${o.mealsNeed} needed). Water ${Math.round(o.waterMake)} L a day (${Math.round(o.waterNeed)} needed), ${Math.round(o.waterStoreL).toLocaleString('en-US')} L in tanks. Battery ${Math.round(o.batteryKwh)} kWh.`),
    );
    for (const p of o.problems) result.append(el('div', 'small', p));
    box.append(result);
    for (const note of plan.notes) box.append(el('p', 'warn small', note));

    const days = plan.crewHours / 24;
    box.append(el('p', 'dim small', `${plan.pieces.length} pieces. Your crew of three needs about ${Math.round(plan.crewHours)} hours of work (${days.toFixed(1)} days at their pace). They build the farms and water first, the walls after.`));

    return box;
  }

  private footerView(plan: BasePlan, state: GameState): HTMLElement[] {
    const parts: HTMLElement[] = [];
    const money1 = el('div', 'arch-money');
    money1.append(
      el('span', 'dim', 'Cost'), el('b', undefined, money(plan.cost)),
      el('span', 'dim', 'You have'), el('b', plan.shortfall > 0 ? 'warn' : undefined, money(state.money)),
    );
    parts.push(money1);
    if (plan.shortfall > 0) parts.push(el('p', 'warn small', `You are ${money(plan.shortfall)} short.`));

    const buttons = el('div', 'arch-buttons');
    const funds = el('button', 'btn secondary small');
    funds.append(icon('Coins', 15), el('span', undefined, `Sandbox funds +${money(SANDBOX_FUNDS)}`));
    funds.title = 'A sandbox top-up for trying out designs. It is added to your account and noted in the news log.';
    funds.addEventListener('click', () => this.handlers.onFunds());
    const build = el('button', 'btn good');
    const here = state.at === 'base';
    build.append(icon(here ? 'Hammer' : 'MapPin', 16), el('span', undefined, here ? 'Build the upgrade' : 'Go to base'));
    build.disabled = here && plan.shortfall > 0;
    build.title = here ? (plan.shortfall > 0 ? 'You need more money first' : 'Buy everything and lay it out on your land') : 'You have to be at your base to build';
    build.addEventListener('click', () => this.handlers.onBuild());
    buttons.append(funds, build);
    parts.push(buttons);
    return parts;
  }
}
