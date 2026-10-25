import { itemById } from '../data/items';
import { STRUCTURES } from '../data/structures';
import { UTILITIES } from '../data/survival';
import { MAX_UPGRADE, upkeepOf } from '../data/upkeep';
import {
  cleanQuote, conditionIssue, dirtOf, levelOf, outputFactor, repairQuote, strengthOf, upgradeQuote, type WorkQuote,
} from '../sim/upkeep';
import type { GameState, Piece } from '../sim/state';
import { runtimeOf } from '../sim/utilities';
import { clearChildren, el } from './dom';
import { icon } from './icons';

export interface PieceActions {
  onClose(): void;
  onRotate(id: number): void;
  onMove(id: number): void;
  onTakeDown(id: number): void;
  onRepair(id: number): void;
  onUpgrade(id: number): void;
  onClean(id: number): void;
  onShowLines(id: number): void;
}

/** What a job costs, as one short line: "3 lumber, 1 nails. Needs a toolbox". */
function costLine(q: WorkQuote): string {
  const parts = Object.entries(q.items).map(([item, qty]) => `${qty} ${itemById(item).name.toLowerCase()}`);
  const tools = q.tools.map((t) => itemById(t).name.toLowerCase());
  const bits: string[] = [];
  if (parts.length) bits.push(parts.join(', '));
  if (tools.length) bits.push(`needs ${tools.join(' and ')}`);
  return bits.join('. ');
}

/** The card for one placed structure: how it is doing, and everything you can do with it. */
export class PiecePanel {
  private readonly panel = el('div', 'place-panel piece-panel');
  private open = false;
  private signature = '';
  private shownId = -1;

  constructor(parent: HTMLElement, private readonly getState: () => GameState, private readonly actions: PieceActions) {
    this.panel.style.display = 'none';
    parent.append(this.panel);
  }

  get isOpen(): boolean {
    return this.open;
  }

  get pieceId(): number {
    return this.open ? this.shownId : -1;
  }

  hide(): void {
    this.open = false;
    this.signature = '';
    this.shownId = -1;
    this.panel.style.display = 'none';
  }

  /** Show or update the card. Redraws only when something you can see changed, so a click is never lost. */
  show(piece: Piece): void {
    const state = this.getState();
    const def = STRUCTURES[piece.type];
    const repair = repairQuote(state, piece);
    const upgrade = upgradeQuote(state, piece);
    const clean = cleanQuote(state, piece);
    const care = upkeepOf(piece.type);
    const issues = [...(runtimeOf(state).issues.get(piece.id) ?? []).map((i) => i.text)];
    const wear = conditionIssue(piece);
    if (wear) issues.push(wear.text);
    const atBase = state.at === 'base';
    const view = {
      id: piece.id,
      type: piece.type,
      progress: Math.round(piece.progress * 100),
      strength: Math.round(strengthOf(piece) * 100),
      dirt: Math.round(dirtOf(piece) * 100),
      level: levelOf(piece),
      output: Math.round(outputFactor(piece) * 100),
      issues,
      atBase,
      repair: [repair.ok, repair.reason, costLine(repair)],
      upgrade: [upgrade.ok, upgrade.reason, costLine(upgrade)],
      clean: [clean.ok, clean.reason, costLine(clean)],
    };
    const signature = JSON.stringify(view);
    if (this.open && signature === this.signature) return;
    this.signature = signature;
    this.shownId = piece.id;
    this.open = true;
    this.panel.style.display = 'block';
    clearChildren(this.panel);

    const close = el('button', 'x');
    close.append(icon('X', 16));
    close.addEventListener('click', () => this.actions.onClose());
    this.panel.append(close, el('h2', undefined, def.name));
    this.panel.append(el('div', 'dim', def.blurb));

    if (piece.progress < 1) {
      this.panel.append(el('div', 'banner', `Being built: ${view.progress}% done. The crew finishes it over time.`));
    } else if (care) {
      this.panel.append(this.meter('Strength', view.strength / 100, view.strength < 40 ? 'bad' : view.strength < 70 ? 'warn' : 'good', `${view.strength}%`));
      if (care.dirtDays) this.panel.append(this.meter('Dirt', view.dirt / 100, view.dirt > 60 ? 'bad' : view.dirt > 30 ? 'warn' : 'good', `${view.dirt}%`));
      const stats = el('div', 'stats');
      const stat = (label: string, value: string) => {
        const s = el('div', 'stat');
        s.append(el('span', 'dim', label), el('b', undefined, value));
        stats.append(s);
      };
      stat('Level', `${view.level} of ${MAX_UPGRADE}`);
      if (view.output !== 100) stat('Working at', `${view.output}%`);
      if (def.barrier) stat('Hit points', `${Math.round(piece.hp)} of ${piece.maxHp}`);
      this.panel.append(stats);
    }
    for (const text of issues) this.panel.append(el('div', 'banner warn', text));

    // Moving and turning are free and instant
    const row = el('div', 'btns piece-row');
    row.append(
      this.action('RotateCw', 'Rotate (R)', () => this.actions.onRotate(piece.id), !atBase, atBase ? '' : 'Travel to your base first.', 'secondary'),
      this.action('Move', 'Move', () => this.actions.onMove(piece.id), !atBase, atBase ? '' : 'Travel to your base first.', 'secondary'),
      this.action('Trash2', 'Take down', () => this.actions.onTakeDown(piece.id), !atBase, atBase ? '' : 'Travel to your base first.', 'danger'),
    );
    this.panel.append(row);

    if (piece.progress >= 1 && care) {
      const jobs = el('div', 'piece-jobs');
      jobs.append(this.job('Wrench', 'Repair', repair, () => this.actions.onRepair(piece.id)));
      jobs.append(this.job('ArrowUp', `Upgrade to level ${view.level + 1}`, upgrade, () => this.actions.onUpgrade(piece.id)));
      if (care.dirtDays) jobs.append(this.job('Droplets', 'Clean', clean, () => this.actions.onClean(piece.id)));
      this.panel.append(jobs);
    }
    const util = UTILITIES[piece.type];
    if (util && (util.power || util.water)) {
      const lines = el('button', 'link-btn');
      lines.append(icon('Cable', 14), el('span', undefined, 'Show all cables and pipes'));
      lines.addEventListener('click', () => this.actions.onShowLines(piece.id));
      this.panel.append(lines);
    }
  }

  private meter(label: string, value: number, tone: 'good' | 'warn' | 'bad', text: string): HTMLElement {
    const row = el('div', 'piece-meter');
    const bar = el('div', `piece-bar ${tone}`);
    const fill = el('div', 'piece-fill');
    fill.style.width = `${Math.max(2, Math.round(value * 100))}%`;
    bar.append(fill);
    row.append(el('span', 'dim', label), bar, el('b', undefined, text));
    return row;
  }

  private action(iconName: string, label: string, onClick: () => void, disabled: boolean, why: string, kind: 'secondary' | 'danger'): HTMLElement {
    const b = el('button', `btn small ${kind}`);
    b.append(icon(iconName, 14), el('span', undefined, label));
    b.disabled = disabled;
    if (why) b.title = why;
    b.addEventListener('click', onClick);
    return b;
  }

  private job(iconName: string, label: string, q: WorkQuote, onClick: () => void): HTMLElement {
    const box = el('div', 'piece-job');
    const b = el('button', 'btn small good');
    b.append(icon(iconName, 14), el('span', undefined, label));
    b.disabled = !q.ok;
    b.addEventListener('click', onClick);
    const info = el('div', 'dim small');
    if (!q.ok && !Object.keys(q.items).length) info.textContent = q.reason ?? '';
    else info.textContent = [q.effect, costLine(q), q.ok ? '' : q.reason].filter(Boolean).join('. ');
    box.append(b, info);
    return box;
  }
}
