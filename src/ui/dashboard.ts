import { el } from './dom';
import { icon } from './icons';

export interface DashboardData {
  name: string;
  /** Speed in km/h. */
  kmh: number;
  /** Liters in the tank and the tank size, or null for a vehicle that needs no fuel. */
  fuel: { have: number; size: number; kind: string } | null;
  /** 0 to 1. */
  condition: number;
  /** A line of trouble, such as an empty tank, or null. */
  warning: string | null;
  /** Kilograms of goods carried and the most it can hold. */
  load: { have: number; max: number };
  /** Whether a trailer is hitched. */
  trailer: boolean;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** The driving display: speed, fuel, condition and load. Shown only while at the wheel. */
export class Dashboard {
  private readonly root = el('div', 'dash');
  private readonly name = el('div', 'dash-name');
  private readonly speed = el('span', 'dash-speed');
  private readonly fuelFill = el('span', 'dash-fill fuel');
  private readonly fuelText = el('span', 'dash-val');
  private readonly condFill = el('span', 'dash-fill cond');
  private readonly condText = el('span', 'dash-val');
  private readonly loadText = el('span', 'dash-val');
  private readonly warn = el('div', 'dash-warn');
  private readonly fuelRow = el('div', 'dash-row');

  constructor(parent: HTMLElement) {
    const speedBox = el('div', 'dash-speedbox');
    speedBox.append(this.speed, el('span', 'dash-unit', 'km/h'));
    const bar = (fill: HTMLElement) => {
      const b = el('span', 'dash-bar');
      b.append(fill);
      return b;
    };
    this.fuelRow.append(icon('Fuel', 16), bar(this.fuelFill), this.fuelText);
    const condRow = el('div', 'dash-row');
    condRow.append(icon('Wrench', 16), bar(this.condFill), this.condText);
    const loadRow = el('div', 'dash-row');
    loadRow.append(icon('Weight', 16), el('span', 'dash-bar spacer'), this.loadText);
    const gauges = el('div', 'dash-gauges');
    gauges.append(this.fuelRow, condRow, loadRow);
    const hint = el('div', 'dash-hint');
    hint.append(el('span', 'prompt-key', 'Space'), el('span', undefined, 'Get out'));
    const left = el('div', 'dash-left');
    left.append(this.name, speedBox, hint);
    this.root.append(left, gauges, this.warn);
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  update(d: DashboardData): void {
    if (this.root.style.display !== 'flex') this.root.style.display = 'flex';
    setText(this.name, d.trailer ? `${d.name} + trailer` : d.name);
    setText(this.speed, String(Math.round(Math.abs(d.kmh))));
    this.fuelRow.style.display = d.fuel ? '' : 'none';
    if (d.fuel) {
      const f = d.fuel.size > 0 ? d.fuel.have / d.fuel.size : 0;
      this.fuelFill.style.width = `${Math.round(f * 100)}%`;
      this.fuelFill.classList.toggle('low', f < 0.15);
      setText(this.fuelText, `${Math.round(d.fuel.have)} / ${Math.round(d.fuel.size)} L`);
    }
    this.condFill.style.width = `${Math.round(d.condition * 100)}%`;
    this.condFill.classList.toggle('low', d.condition < 0.3);
    setText(this.condText, `${Math.round(d.condition * 100)}%`);
    setText(this.loadText, `${Math.round(d.load.have)} / ${Math.round(d.load.max)} kg`);
    setText(this.warn, d.warning ?? '');
    this.warn.style.display = d.warning ? '' : 'none';
  }
}
