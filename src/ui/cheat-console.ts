import { el } from './dom';

/**
 * A one-line box for typing cheat codes. Press the backquote key (`) to open it, type a code, press Enter.
 * The game keys are switched off while you type, because the keyboard handler ignores text boxes.
 */
export class CheatConsole {
  private readonly form = el('form', 'cheat-console');
  private readonly input = el('input') as HTMLInputElement;
  private readonly result = el('div', 'cheat-result');
  private open = false;

  constructor(parent: HTMLElement, private readonly run: (code: string) => string) {
    this.input.type = 'text';
    this.input.placeholder = 'Type a cheat code, then press Enter';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.form.append(this.input, this.result);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = this.input.value.trim();
      if (!code) return;
      this.result.textContent = this.run(code);
      this.input.value = '';
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === '`') {
        e.preventDefault();
        this.hide();
      }
    });
    this.form.style.display = 'none';
    parent.append(this.form);
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
    this.result.textContent = 'Codes: buildnow (finish all building), money (+$500,000), woodsbase (a finished base in the woods)';
    this.form.style.display = 'block';
    this.input.value = '';
    // Wait a moment so the key that opened the box is not typed into it
    window.setTimeout(() => this.input.focus(), 0);
  }

  hide(): void {
    this.open = false;
    this.form.style.display = 'none';
    this.input.blur();
  }
}
