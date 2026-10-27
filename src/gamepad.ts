/**
 * Gamepad input. A controller with the standard layout (Xbox, PlayStation, Switch Pro and most others in Chrome and Firefox)
 * is read once a frame. The sticks and triggers are values; the buttons give a "pressed" event on the frame they go down.
 *
 * Layout:
 *   left stick      walk, or steer a vehicle        right stick   turn and tilt the view
 *   right trigger   gas                             left trigger  brake and reverse
 *   left stick press   run, or handbrake            right stick press   reset the view
 *   A use / get in or out   B back   X storage   Y online store   Start menu   Select fast-forward
 *   LB / RB turn the view   D-pad up and down zoom
 * In a menu the left stick and the D-pad move between the buttons, A presses one and B goes back.
 */

export type PadButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'select' | 'start' | 'l3' | 'r3' | 'up' | 'down' | 'left' | 'right';

/** Button numbers in the "standard" gamepad layout. The two triggers (6 and 7) are read as values instead. */
const BUTTON_AT: Record<number, PadButton> = {
  0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'select', 9: 'start', 10: 'l3', 11: 'r3', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

/** Stick movement smaller than this is ignored, because sticks never rest exactly at zero. */
const DEAD_ZONE = 0.22;
const TRIGGER_DEAD = 0.05;
/** How far a stick must go to count as a direction press in a menu. */
const STICK_PRESS = 0.6;
const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];

/** A stick value with the dead zone taken out and the rest stretched back to 0..1. */
function shape(v: number): number {
  const m = Math.abs(v);
  return m < DEAD_ZONE ? 0 : (Math.sign(v) * (Math.min(1, m) - DEAD_ZONE)) / (1 - DEAD_ZONE);
}

export class PadReader {
  connected = false;
  /** The name the browser gives the controller. */
  name = '';
  /** Left and right stick, -1 to 1. Up is negative, as the browser reports it. */
  lx = 0;
  ly = 0;
  rx = 0;
  ry = 0;
  /** Triggers, 0 to 1. */
  lt = 0;
  rt = 0;
  /** True while a menu is open: the left stick then also gives direction presses, and repeats them while held. */
  menuMode = false;
  /** Called on the frame a button goes down. */
  onPress: ((button: PadButton) => void) | null = null;
  /** Called once when a controller is first seen, and again if it comes back. */
  onConnect: ((name: string) => void) | null = null;

  private readonly held = new Set<PadButton>();
  private readonly dirTime = new Map<Direction, number>();
  private pad: Gamepad | null = null;

  isHeld(button: PadButton): boolean {
    return this.held.has(button);
  }

  /** Read the controller. Call once a frame with the time since the last call, in seconds. */
  poll(dt: number): void {
    const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = Array.from(list).find((p): p is Gamepad => !!p && p.connected) ?? null;
    if (!pad) {
      if (this.connected) this.release();
      return;
    }
    if (!this.connected) {
      this.connected = true;
      this.name = pad.id;
      this.onConnect?.(pad.id);
    }
    this.pad = pad;

    this.lx = shape(pad.axes[0] ?? 0);
    this.ly = shape(pad.axes[1] ?? 0);
    this.rx = shape(pad.axes[2] ?? 0);
    this.ry = shape(pad.axes[3] ?? 0);
    const trigger = (i: number) => {
      const v = pad.buttons[i]?.value ?? 0;
      return v < TRIGGER_DEAD ? 0 : v;
    };
    this.lt = trigger(6);
    this.rt = trigger(7);

    // What is down now, including the left stick as directions in a menu
    const now = new Set<PadButton>();
    for (const [index, button] of Object.entries(BUTTON_AT)) if (pad.buttons[Number(index)]?.pressed) now.add(button);
    if (this.menuMode) {
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (y < -STICK_PRESS) now.add('up');
      if (y > STICK_PRESS) now.add('down');
      if (x < -STICK_PRESS) now.add('left');
      if (x > STICK_PRESS) now.add('right');
    }

    for (const button of now) {
      const isDir = (DIRECTIONS as readonly string[]).includes(button);
      if (!this.held.has(button)) {
        this.onPress?.(button);
        if (isDir) this.dirTime.set(button as Direction, 0);
      } else if (isDir && this.menuMode) {
        // Held: repeat after a short wait, then steadily
        const t = (this.dirTime.get(button as Direction) ?? 0) + dt;
        if (t >= 0.42) {
          this.onPress?.(button);
          this.dirTime.set(button as Direction, 0.3);
        } else {
          this.dirTime.set(button as Direction, t);
        }
      }
    }
    this.held.clear();
    for (const b of now) this.held.add(b);
  }

  private release(): void {
    this.connected = false;
    this.pad = null;
    this.lx = this.ly = this.rx = this.ry = this.lt = this.rt = 0;
    this.held.clear();
    this.dirTime.clear();
  }

  /** Shake the controller, if it can. strength is 0 to 1, seconds is how long. */
  rumble(strength: number, seconds: number): void {
    const actuator = (this.pad as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    if (!actuator?.playEffect) return;
    void actuator
      .playEffect('dual-rumble', { startDelay: 0, duration: Math.round(seconds * 1000), strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.7) })
      .catch(() => {});
  }
}
