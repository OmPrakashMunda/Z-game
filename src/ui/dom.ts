import { dayOf, formatClock } from '../sim/clock';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function clearChildren(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** "2 h 10 min", "35 min". Input is game seconds. */
export function duration(worldSeconds: number): string {
  const totalMin = Math.max(0, Math.round(worldSeconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** "Day 3, 14:20" */
export function dayTime(worldSeconds: number): string {
  return `Day ${dayOf(worldSeconds)}, ${formatClock(worldSeconds)}`;
}

export interface ButtonSpec {
  label: string;
  onClick: () => void;
  kind?: 'secondary' | 'danger' | 'good';
  disabled?: boolean;
}

export function button(spec: ButtonSpec): HTMLButtonElement {
  const b = el('button', `btn${spec.kind ? ' ' + spec.kind : ''}`, spec.label);
  b.disabled = !!spec.disabled;
  b.addEventListener('click', spec.onClick);
  return b;
}
