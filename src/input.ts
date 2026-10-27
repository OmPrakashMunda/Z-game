import { PadReader } from './gamepad';

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** Keyboard and gamepad input: held keys and sticks walk the player and turn the view, single presses trigger actions. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedHandlers = new Map<string, Array<() => void>>();
  /** The gamepad. It is read by poll(), once a frame. */
  readonly pad = new PadReader();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.code === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
      if (!this.down.has(code) && !e.repeat) this.press(code);
      this.down.add(code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => this.down.clear());
  }

  /** Call once when the key goes down (not on auto-repeat). */
  onPress(code: string, handler: () => void): void {
    const list = this.pressedHandlers.get(code) ?? [];
    list.push(handler);
    this.pressedHandlers.set(code, list);
  }

  /** Do what pressing a key does. The gamepad uses this so that its buttons and the keys can never disagree. */
  press(code: string): void {
    for (const h of this.pressedHandlers.get(code) ?? []) h();
  }

  /** Read the gamepad. Call once a frame. */
  poll(dt: number): void {
    this.pad.poll(dt);
  }

  /** Walking direction on screen (right and up), each axis -1 to 1. The left stick adds to the keys. */
  move(): { x: number; y: number } {
    const k = (c: string) => (this.down.has(c) ? 1 : 0);
    // While a menu is open the left stick moves the menu highlight, not the player
    const sx = this.pad.menuMode ? 0 : this.pad.lx;
    const sy = this.pad.menuMode ? 0 : this.pad.ly;
    return {
      x: clamp1(k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + sx),
      y: clamp1(k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - sy),
    };
  }

  /** Gas and brake from the triggers, -1 to 1. The keys use move() instead. */
  trigger(): number {
    return this.pad.rt - this.pad.lt;
  }

  /** Whether the run key is held (a vehicle's handbrake). */
  sprint(): boolean {
    return this.down.has('ShiftLeft') || this.down.has('ShiftRight') || this.pad.isHeld('l3');
  }

  /** View turn direction: 1 for counter-clockwise (Q, left shoulder), -1 for clockwise (E, right shoulder or the right stick). */
  rotation(): number {
    const keys = (this.down.has('KeyQ') ? 1 : 0) - (this.down.has('KeyE') ? 1 : 0);
    const pad = (this.pad.isHeld('lb') ? 1 : 0) - (this.pad.isHeld('rb') ? 1 : 0) - this.pad.rx;
    return clamp1(keys + pad);
  }
  /** View tilt direction: 1 toward top-down (C, right stick up), -1 toward the horizon (Z, right stick down). */
  tilt(): number {
    const keys = (this.down.has('KeyC') ? 1 : 0) - (this.down.has('KeyZ') ? 1 : 0);
    return clamp1(keys - this.pad.ry);
  }
  /** Zoom direction from the D-pad: 1 in, -1 out. */
  zoom(): number {
    return (this.pad.isHeld('up') ? 1 : 0) - (this.pad.isHeld('down') ? 1 : 0);
  }
  clear(): void {
    this.down.clear();
  }
}
