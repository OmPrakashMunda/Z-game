import type { Advice, AdviceAction, AdviceStep } from '../sim/advisor';
import type { GameState } from '../sim/state';
import { el } from './dom';
import { icon } from './icons';

const SEGMENTS = 10;

/** The family's vitals and supplies, in a plate on the left of the screen. */
export class VitalsPanel {
  readonly root = el('div', 'vitals');
  private readonly rows = new Map<string, { segs: HTMLElement[]; value: HTMLElement; row: HTMLElement; shown: number }>();
  private readonly supplies = new Map<string, { main: HTMLElement; sub: HTMLElement; box: HTMLElement }>();
  private readonly banner = el('div', 'vitals-banner');

  constructor(parent: HTMLElement) {
    const head = el('div', 'panel-head');
    head.append(icon('HeartPulse', 18), el('span', undefined, 'Your family'));
    this.root.append(head, this.banner);
    const bars = el('div', 'vital-bars');
    for (const [key, label, ico] of [['health', 'Health', 'Heart'], ['thirst', 'Thirst', 'Droplet'], ['hunger', 'Hunger', 'Utensils']] as const) {
      const row = el('div', 'vital');
      const track = el('div', 'segs');
      const segs = Array.from({ length: SEGMENTS }, () => el('span', 'seg'));
      track.append(...segs);
      const value = el('span', 'vital-num');
      row.append(icon(ico, 18), el('span', 'vital-label', label), track, value);
      bars.append(row);
      this.rows.set(key, { segs, value, row, shown: -1 });
    }
    this.root.append(bars);
    const list = el('div', 'supplies');
    for (const [key, label, ico] of [['water', 'Water', 'Droplets'], ['food', 'Food', 'Soup'], ['power', 'Power', 'Zap']] as const) {
      const box = el('div', 'supply');
      const headRow = el('div', 'supply-head');
      headRow.append(icon(ico, 13), el('span', undefined, label));
      const main = el('div', 'supply-main');
      const sub = el('div', 'supply-sub');
      box.append(headRow, main, sub);
      list.append(box);
      this.supplies.set(key, { main, sub, box });
    }
    this.root.append(list);
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  update(state: GameState, advice: Advice): void {
    if (!state.plotId) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    const p = state.player;
    const bar = (key: 'health' | 'thirst' | 'hunger', v: number) => {
      const r = this.rows.get(key)!;
      const lit = Math.max(0, Math.min(SEGMENTS, Math.ceil(v / (100 / SEGMENTS) - 0.001)));
      if (lit !== r.shown) {
        r.shown = lit;
        r.segs.forEach((s, i) => s.classList.toggle('on', i < lit));
      }
      const num = String(Math.round(v));
      if (r.value.textContent !== num) r.value.textContent = num;
      const cls = `vital ${v < 30 ? 'bad' : v < 60 ? 'mid' : 'ok'}`;
      if (r.row.className !== cls) r.row.className = cls;
    };
    bar('health', p.health);
    bar('thirst', p.thirst);
    bar('hunger', p.hunger);

    const s = advice.summary;
    const days = (n: number) => (Number.isFinite(n) ? `${n < 10 ? n.toFixed(1) : Math.round(n)} days` : 'self-sufficient');
    const set = (key: string, main: string, sub: string, level: 'ok' | 'mid' | 'bad') => {
      const r = this.supplies.get(key)!;
      if (r.main.textContent !== main) r.main.textContent = main;
      if (r.sub.textContent !== sub) r.sub.textContent = sub;
      const cls = `supply ${level}`;
      if (r.box.className !== cls) r.box.className = cls;
    };
    const level = (d: number): 'ok' | 'mid' | 'bad' => (d < 2.5 ? 'bad' : d < 7 ? 'mid' : 'ok');
    set('water', `${Math.round(s.water.reserve)} L`, days(s.water.days), level(s.water.days));
    set('food', `${Math.round(s.food.reserve)}`, `meals, ${days(s.food.days)}`, level(s.food.days));
    if (s.counts.powerSources === 0 && s.counts.powerConsumers === 0) set('power', 'none', 'no power yet', 'mid');
    else {
      const pct = s.power.capacityKwh > 0 ? `battery ${Math.round((100 * s.power.storedKwh) / s.power.capacityKwh)}%` : 'no battery';
      const short = s.power.useKw > s.power.makeKw && s.power.storedKwh <= 0.01;
      set('power', `${s.power.makeKw.toFixed(1)} kW`, `using ${s.power.useKw.toFixed(1)}, ${pct}`, short ? 'bad' : 'ok');
    }
    const top = advice.alerts.find((a) => a.severity === 'bad');
    const text = top ? top.text : '';
    if (this.banner.textContent !== text) this.banner.textContent = text;
    const shown = top ? '' : 'none';
    if (this.banner.style.display !== shown) this.banner.style.display = shown;
  }
}
/** The advisor: the next thing to do, why, and a button that does it. */
export class AdvisorPanel {
  readonly root = el('div', 'advisor');
  private readonly body = el('div', 'advisor-body');
  private readonly toggle = el('button', 'x-btn');
  private collapsed = false;
  private showAll = false;
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly onAction: (a: AdviceAction) => void, private readonly onPlan: () => void) {
    const head = el('div', 'panel-head');
    head.append(icon('ListChecks', 18), el('span', undefined, 'Advisor'));
    this.toggle.title = 'Show or hide the advisor';
    this.toggle.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.lastKey = '';
      this.root.classList.toggle('collapsed', this.collapsed);
      this.toggle.replaceChildren(icon(this.collapsed ? 'ChevronDown' : 'ChevronUp', 15));
    });
    this.toggle.append(icon('ChevronUp', 15));
    const plan = el('button', 'mini-btn plan-btn');
    plan.append(icon('DraftingCompass', 14), el('span', undefined, 'Plan base'));
    plan.title = 'Open the base architect (P)';
    plan.addEventListener('click', () => this.onPlan());
    head.append(el('span', 'spacer'), plan, this.toggle);
    this.root.append(head, this.body);
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  update(state: GameState, advice: Advice): void {
    this.root.style.display = '';
    if (this.collapsed) return;
    // Only rebuild when something visible changed, so a click is never lost to a redraw
    const key = JSON.stringify([
      advice.alerts.map((a) => [a.id, a.text, a.action?.label, a.action && 'price' in a.action ? a.action.price : 0]),
      advice.steps.map((s) => [s.id, s.state, s.detail, s.actions.map((a) => [a.label, 'price' in a ? a.price : 0])]),
      Math.floor(state.money / 100), this.showAll,
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.body.replaceChildren();

    // Urgent alerts first, then what to do next, then the list of broken structures (short, with the full text on hover)
    const alertRow = (alert: Advice['alerts'][number]) => {
      const row = el('div', `alert ${alert.severity}`);
      const short = alert.severity === 'warn' ? alert.text.split(/(?<=\.)\s/)[0] : alert.text;
      const text = el('span', 'alert-text', short);
      text.title = alert.text;
      row.append(icon('TriangleAlert', 15), text);
      if (alert.action) row.append(this.actionButton(alert.action, state));
      return row;
    };
    for (const alert of advice.alerts) if (alert.severity === 'bad') this.body.append(alertRow(alert));

    const current = advice.current;
    if (current) this.body.append(this.currentCard(current, state));
    else this.body.append(el('div', 'all-done', 'The basics are covered. Keep building walls and growing your supplies.'));

    const warnings = advice.alerts.filter((a) => a.severity === 'warn');
    if (warnings.length) {
      const list = el('div', 'warn-list');
      list.append(el('div', 'warn-title', 'Needs attention'));
      for (const alert of warnings) list.append(alertRow(alert));
      this.body.append(list);
    }

    const done = advice.steps.filter((s) => s.state === 'done').length;
    const more = el('button', 'link-btn');
    more.append(icon(this.showAll ? 'ChevronUp' : 'ChevronDown', 14), el('span', undefined, `Checklist ${done}/${advice.steps.length}`));
    more.addEventListener('click', () => {
      this.showAll = !this.showAll;
      this.lastKey = '';
      this.update(state, advice);
    });
    this.body.append(more);
    if (this.showAll) {
      const list = el('div', 'checklist');
      for (const step of advice.steps) {
        const row = el('div', `check ${step.state}`);
        row.append(icon(step.state === 'done' ? 'CircleCheck' : 'Circle', 15), el('span', undefined, step.title));
        list.append(row);
      }
      this.body.append(list);
    }
  }

  private currentCard(step: AdviceStep, state: GameState): HTMLElement {
    const card = el('div', 'step');
    const title = el('div', 'step-title');
    title.append(icon(step.icon, 22), el('span', undefined, step.title));
    card.append(el('div', 'step-kicker', 'Next'), title, el('div', 'step-detail', step.detail));
    if (step.actions.length) {
      const row = el('div', 'step-actions');
      for (const a of step.actions) row.append(this.actionButton(a, state));
      card.append(row);
    }
    return card;
  }

  private actionButton(a: AdviceAction, state: GameState): HTMLButtonElement {
    const b = el('button', a.kind === 'buy' || a.kind === 'place' ? 'mini-btn primary' : 'mini-btn') as HTMLButtonElement;
    const label = a.kind === 'buy' ? `${a.label} ($${a.price.toLocaleString('en-US')})` : a.label;
    b.append(el('span', undefined, label));
    if (a.kind === 'buy' && a.price > state.money) {
      b.disabled = true;
      b.title = 'You cannot afford this yet';
    }
    b.addEventListener('click', () => this.onAction(a));
    return b;
  }
}
