/** Keyboard input: held keys walk the player and turn the view, single presses trigger actions. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedHandlers = new Map<string, Array<() => void>>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.code === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
      if (!this.down.has(code) && !e.repeat) {
        for (const h of this.pressedHandlers.get(code) ?? []) h();
      }
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

  /** Walking direction on screen (right and up), each axis -1 to 1. */
  move(): { x: number; y: number } {
    const k = (c: string) => (this.down.has(c) ? 1 : 0);
    return {
      x: k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'),
      y: k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'),
    };
  }

  /** Whether the run key is held. */
  sprint(): boolean {
    return this.down.has('ShiftLeft') || this.down.has('ShiftRight');
  }

  /** View turn direction: 1 for counter-clockwise (Q), -1 for clockwise (E). */
  rotation(): number {
    return (this.down.has('KeyQ') ? 1 : 0) - (this.down.has('KeyE') ? 1 : 0);
  }
  /** View tilt direction: 1 toward top-down (C), -1 toward the horizon (Z). */
  tilt(): number {
    return (this.down.has('KeyC') ? 1 : 0) - (this.down.has('KeyZ') ? 1 : 0);
  }
  clear(): void {
    this.down.clear();
  }
}
