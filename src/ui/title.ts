import {
  cleanLook, defaultLook, HAIR_COLORS, HAIR_NAMES, HAIR_STYLES, SHIRT_COLORS, SHIRT_NAMES, SKIN_NAMES, SKIN_TONES, SURVIVOR_NAMES,
  type Gender, type Look,
} from '../data/looks';
import { CharacterPreview } from '../render/preview';
import type { LoadResult, SlotWhere } from '../save/store';
import { dayOf } from '../sim/clock';
import { usernameProblem, USERNAME_MAX } from '../profile/profile';
import { el, money } from './dom';
import { icon } from './icons';

/**
 * Everything the player sees before a game starts: the main menu, the save slots, the character screen and the settings.
 * Each screen replaces the one before it. The 3D town stays visible behind them.
 */

export interface SlotView {
  slot: number;
  result: LoadResult;
  /** Where the game is kept, when there is a cloud to keep it in. */
  where?: SlotWhere;
}

export interface CharacterResult {
  name: string;
  gender: Gender;
  look: Look;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** "5 min ago", "2 h ago", "3 days ago". */
function ago(ms: number): string {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function iconButton(className: string, iconName: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className);
  b.append(icon(iconName, 18), el('span', undefined, label));
  b.addEventListener('click', onClick);
  return b;
}

export class TitleScreen {
  private root: HTMLElement | null = null;
  private preview: CharacterPreview | null = null;

  constructor(private readonly host: HTMLElement) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Which screen is showing: 'main', 'slots', 'character', 'settings' and so on, or null. */
  private shown: string | null = null;
  get current(): string | null {
    return this.shown;
  }

  close(): void {
    this.preview?.dispose();
    this.preview = null;
    this.root?.remove();
    this.root = null;
    this.shown = null;
  }

  private mount(kind: string): HTMLElement {
    this.close();
    const root = el('div', `title-screen ${kind}`);
    this.host.append(root);
    this.root = root;
    this.shown = kind;
    return root;
  }

  /** A short wait, for example while a sign-in comes back. */
  showBusy(text: string): void {
    const root = this.mount('busy');
    const panel = el('div', 'title-panel');
    panel.append(el('h2', undefined, text));
    root.append(panel);
  }

  // ------------------------------------------------------------ Main menu

  showMain(opts: {
    username: string;
    gender: Gender;
    look: Look;
    accountLabel: string;
    signedIn: boolean;
    canSignIn: boolean;
    notice?: string;
    onSingle: () => void;
    onProfile: () => void;
    onSettings: () => void;
    onSignIn: () => void;
    onSignOut: () => void;
  }): void {
    const root = this.mount('main');

    // Who is playing, top right
    const side = el('div', 'title-user');
    const chip = el('button', 'profile-chip');
    chip.title = 'Your profile';
    const avatar = el('span', 'avatar');
    avatar.style.background = hex(SHIRT_COLORS[opts.look.shirt]);
    avatar.append(icon(opts.gender === 'female' ? 'Venus' : 'Mars', 20));
    const who = el('span', 'who');
    who.append(el('span', 'who-name', opts.username), el('span', 'who-sub', `${opts.accountLabel} \u00b7 ${opts.signedIn ? 'saves go to the cloud' : 'saves stay on this device'}`));
    chip.append(avatar, who, icon('Pencil', 14));
    chip.addEventListener('click', opts.onProfile);
    const signIn = el('button', 'tool-btn signin-btn');
    if (opts.signedIn) {
      signIn.append(icon('LogOut', 16), el('span', undefined, 'Sign out'));
      signIn.addEventListener('click', opts.onSignOut);
    } else {
      signIn.append(icon(opts.canSignIn ? 'LogIn' : 'CloudOff', 16), el('span', undefined, 'Sign in with Google'));
      if (opts.canSignIn) {
        signIn.addEventListener('click', () => {
          signIn.disabled = true;
          signIn.querySelector('span')!.textContent = 'Signing in...';
          opts.onSignIn();
        });
      } else {
        signIn.disabled = true;
        signIn.title = 'Sign-in and cloud saves are not set up';
        signIn.append(el('span', 'soon', 'Soon'));
      }
    }    side.append(chip, signIn);

    // The name of the game and the menu, left
    const logo = el('div', 'logo');
    logo.append(el('div', 'logo-kicker', 'Survive the outbreak'), el('h1', 'logo-name', 'Z-Game'), el('div', 'logo-tag', '30 days to prepare'));
    const menu = el('nav', 'title-menu');
    const item = (iconName: string, label: string, hint: string, onClick: (() => void) | null): HTMLButtonElement => {
      const b = el('button', 'menu-btn');
      b.append(icon(iconName, 26), el('span', 'menu-label', label), el('span', 'menu-hint', hint));
      if (onClick) {
        b.addEventListener('click', onClick);
      } else {
        b.disabled = true;
        b.append(el('span', 'soon', 'Soon'));
      }
      return b;
    };
    menu.append(
      item('Gamepad2', 'Single player', 'Build your base alone', opts.onSingle),
      item('Users', 'Multiplayer', 'Share a base with friends', null),
      item('UserRound', 'Profile', 'Your name and look', opts.onProfile),
      item('Settings', 'Settings', 'Sound', opts.onSettings),
    );
    const left = el('div', 'title-left');
    left.append(logo, menu);
    if (opts.notice) left.append(el('p', 'title-notice', opts.notice));

    root.append(left, side, el('div', 'title-foot', 'Low-poly zombie survival. Prepare, build, then hold out.'));
  }

  // ------------------------------------------------------------ Save slots

  showSlots(opts: {
    slots: SlotView[];
    /** True when games are also kept in the cloud, so each card says where its game is. */
    cloud: boolean;
    onContinue: (slot: number, result: Extract<LoadResult, { state: unknown }>) => void;
    onNew: (slot: number) => void;
    onDelete: (slot: number) => void;
    onBack: () => void;
  }): void {
    const root = this.mount('slots');
    const panel = el('div', 'title-panel wide');
    panel.append(el('h2', undefined, 'Single player'), el('p', 'sub', 'Pick a save slot. Each slot keeps its own game.'));
    const row = el('div', 'slot-row');
    for (const { slot, result, where } of opts.slots) row.append(this.slotCard(slot, result, where ?? 'device', opts));
    const back = iconButton('tool-btn back-btn', 'ArrowLeft', 'Back', opts.onBack);
    panel.append(row, back);
    root.append(panel);
  }

  private slotCard(slot: number, result: LoadResult, where: SlotWhere, opts: Parameters<TitleScreen['showSlots']>[0]): HTMLElement {
    const card = el('div', 'slot');
    card.dataset.slot = String(slot);
    card.dataset.status = result.status;
    card.append(el('div', 'slot-head', `Slot ${slot}`));
    const body = el('div', 'slot-body');
    const actions = el('div', 'slot-actions');
    const newBtn = (secondary: boolean) => {
      const b = el('button', `btn${secondary ? ' secondary' : ''}`, 'New game');
      b.addEventListener('click', () => (result.status === 'none' ? opts.onNew(slot) : askReplace()));
      return b;
    };

    /** Ask before doing something that throws a save away. */
    const confirmInline = (text: string, yes: string, onYes: () => void) => {
      actions.replaceChildren();
      body.replaceChildren(el('p', 'slot-ask', text));
      const y = el('button', 'btn danger', yes);
      y.addEventListener('click', onYes);
      const n = el('button', 'btn secondary', 'Cancel');
      n.addEventListener('click', () => this.showSlots(opts));
      actions.append(y, n);
    };
    const askReplace = () => confirmInline('This replaces the game in this slot.', 'Start new game', () => opts.onNew(slot));
    const askDelete = () => confirmInline('Delete this game for good?', 'Delete', () => opts.onDelete(slot));

    const del = el('button', 'btn secondary icon-only');
    del.title = 'Delete this game';
    del.setAttribute('aria-label', 'Delete this game');
    del.append(icon('Trash2', 18));
    del.addEventListener('click', askDelete);

    if (result.status === 'none') {
      body.append(el('div', 'slot-empty', 'Empty'), el('div', 'sub', 'Nothing saved here yet.'));
      actions.append(newBtn(false));
    } else if (result.status === 'error') {
      body.append(el('div', 'slot-empty warn', 'Cannot be read'), el('div', 'sub', result.message));
      actions.append(newBtn(false), del);
    } else {
      const s = result.state;
      const who = el('div', 'slot-who');
      const av = el('span', 'avatar small');
      av.style.background = hex(SHIRT_COLORS[s.character.look.shirt]);
      av.append(icon(s.character.gender === 'female' ? 'Venus' : 'Mars', 14));
      who.append(av, el('span', 'slot-name', s.character.name));
      const day = dayOf(s.worldSeconds);
      const phase = s.phase === 'prep' ? `Day ${day} of 30` : `Day ${day}, outbreak`;
      body.append(who, el('div', 'slot-line', phase), el('div', 'slot-line', money(s.money)), el('div', 'sub', `Saved ${ago(result.savedAt)}`));
      if (opts.cloud) {
        const safe = where === 'both' || where === 'cloud';
        const note = el('div', safe ? 'slot-where' : 'slot-where off');
        note.append(icon(safe ? 'Cloud' : 'CloudOff', 14), el('span', undefined, safe ? 'Saved to the cloud' : 'On this device only'));
        body.append(note);
      }
      if (result.status === 'recovered') body.append(el('div', 'slot-line warn', result.message));
      const go = el('button', 'btn', 'Continue');
      go.addEventListener('click', () => opts.onContinue(slot, result));
      actions.append(go, newBtn(true), del);
    }
    card.append(body, actions);
    return card;
  }

  // ------------------------------------------------------------ Character

  /**
   * One screen for three jobs: the first time (choose a username and a look), the profile (change them), and the start of a
   * new game (name the survivor). The turntable shows the look as it is chosen.
   */
  showCharacter(opts: {
    mode: 'welcome' | 'profile' | 'survivor';
    name: string;
    gender: Gender;
    look: Look;
    /**
     * Called when the player is done. It may take a while (talking to the cloud): return a promise that gives an error message
     * to keep the screen open and show it, or null when all went well. The caller moves on to the next screen.
     */
    onDone: (result: CharacterResult) => void | Promise<string | null>;
    onBack?: () => void;
    /** A problem to show straight away, for example that the username is taken. */
    error?: string;
  }): void {
    const root = this.mount('character');
    const survivor = opts.mode === 'survivor';
    const heading = { welcome: 'Welcome, survivor', profile: 'Your profile', survivor: 'Create your survivor' }[opts.mode];
    const intro = {
      welcome: 'Choose a username and how you look. You can change both later from the main menu.',
      profile: 'Your username and look are used for every new game.',
      survivor: 'Name your survivor. This look stays with them for the whole game.',
    }[opts.mode];
    const doneLabel = { welcome: 'Continue', profile: 'Save', survivor: 'Start game' }[opts.mode];

    let gender: Gender = opts.gender;
    let look: Look = cleanLook(opts.look, gender);
    const randomName = () => {
      const list = SURVIVOR_NAMES[gender];
      return list[Math.floor(Math.random() * list.length)];
    };

    // --- Name
    const input = el('input', 'name-input');
    input.type = 'text';
    input.maxLength = survivor ? 20 : USERNAME_MAX;
    input.placeholder = survivor ? 'Survivor name' : 'Username';
    input.value = opts.name;
    input.setAttribute('aria-label', survivor ? 'Survivor name' : 'Username');
    const error = el('div', 'form-error');
    const dice = iconButton('tool-btn', 'Dices', 'Another name', () => {
      input.value = randomName();
      error.textContent = '';
    });

    // --- Gender
    const genderRow = el('div', 'gender-row');
    const genderBtns = new Map<Gender, HTMLButtonElement>();
    for (const [g, label, iconName] of [['male', 'Man', 'Mars'], ['female', 'Woman', 'Venus']] as const) {
      const b = el('button', 'gender-btn');
      b.append(icon(iconName, 26), el('span', undefined, label));
      b.addEventListener('click', () => {
        const wasListed = SURVIVOR_NAMES[gender].includes(input.value) || input.value.trim() === '';
        gender = g;
        // A new gender brings that gender's usual hair and shirt; skin and hair colour stay
        const d = defaultLook(g);
        look = { ...look, hairStyle: d.hairStyle, shirt: d.shirt };
        if (survivor && wasListed) input.value = randomName();
        refresh();
      });
      genderBtns.set(g, b);
      genderRow.append(b);
    }

    // --- Looks
    const swatchRow = (colors: readonly number[], names: string[], key: 'skin' | 'hair' | 'shirt', label: string) => {
      const row = el('div', 'swatches');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', label);
      const buttons: HTMLButtonElement[] = [];
      colors.forEach((c, i) => {
        const b = el('button', 'swatch');
        b.style.background = hex(c);
        b.title = `${label}: ${names[i]}`;
        b.setAttribute('aria-label', `${label}: ${names[i]}`);
        b.addEventListener('click', () => {
          look = { ...look, [key]: i };
          refresh();
        });
        buttons.push(b);
        row.append(b);
      });
      return { row, buttons, key };
    };
    const skin = swatchRow(SKIN_TONES, SKIN_NAMES, 'skin', 'Skin');
    const hair = swatchRow(HAIR_COLORS, HAIR_NAMES, 'hair', 'Hair colour');
    const shirt = swatchRow(SHIRT_COLORS, SHIRT_NAMES, 'shirt', 'Shirt');
    const styleRow = el('div', 'style-row');
    const styleBtns = new Map<string, HTMLButtonElement>();
    for (const s of HAIR_STYLES) {
      const b = el('button', 'tool-btn style-btn', s.label);
      b.addEventListener('click', () => {
        look = { ...look, hairStyle: s.id };
        refresh();
      });
      styleBtns.set(s.id, b);
      styleRow.append(b);
    }

    // --- The turntable
    const stage = el('div', 'char-stage');
    this.preview = new CharacterPreview(280, 360);
    stage.append(this.preview.canvas, el('div', 'sub', 'Drag to turn'));

    const refresh = () => {
      for (const [g, b] of genderBtns) b.classList.toggle('active', g === gender);
      for (const group of [skin, hair, shirt]) group.buttons.forEach((b, i) => b.classList.toggle('active', look[group.key] === i));
      for (const [id, b] of styleBtns) b.classList.toggle('active', look.hairStyle === id);
      hair.row.classList.toggle('off', look.hairStyle === 'bald');
      this.preview?.set(gender, look);
    };

    const finish = () => {
      if (done.disabled) return;
      let name = input.value.trim();
      if (survivor) {
        name = name.slice(0, 20) || randomName();
      } else {
        const problem = usernameProblem(name);
        if (problem) {
          error.textContent = problem;
          input.focus();
          return;
        }
      }
      const out = opts.onDone({ name, gender, look });
      if (out instanceof Promise) {
        done.disabled = true;
        const label = done.textContent;
        done.textContent = 'Please wait...';
        void out.then((message) => {
          if (!message || !done.isConnected) return;
          error.textContent = message;
          done.disabled = false;
          done.textContent = label;
          input.focus();
        });
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
    });
    input.addEventListener('input', () => {
      error.textContent = '';
    });

    // --- Put it together
    const form = el('div', 'char-form creator');
    const field = (text: string, ...nodes: HTMLElement[]) => {
      const row = el('div', 'field');
      const body = el('div', 'field-body');
      body.append(...nodes);
      row.append(el('label', 'creator-label', text), body);
      return row;
    };
    const nameRow = el('div', 'name-row');
    nameRow.append(input, dice);
    form.append(
      field(survivor ? 'Survivor' : 'Username', nameRow, error),
      field('You are', genderRow),
      field('Skin', skin.row),
      field('Hair', styleRow, hair.row),
      field('Shirt', shirt.row),
    );    const grid = el('div', 'char-grid');
    grid.append(form, stage);
    const done = el('button', 'btn', doneLabel);
    done.addEventListener('click', finish);
    const btns = el('div', 'btn-row');
    btns.append(done);
    if (opts.onBack) {
      const back = el('button', 'btn secondary', 'Back');
      const onBack = opts.onBack;
      back.addEventListener('click', () => {
        this.close();
        onBack();
      });
      btns.append(back);
    }
    const panel = el('div', 'title-panel wide');
    panel.append(el('h2', undefined, heading), el('p', 'sub', intro), grid, btns);
    root.append(panel);
    if (opts.error) error.textContent = opts.error;
    refresh();
    input.focus();
    input.select();
  }

  // ------------------------------------------------------------ Guest games

  /** Right after a first sign-in: offer to move the games played as a guest into the account. */
  showGuestGames(opts: { games: Array<{ slot: number; name: string; day: number }>; onCopy: () => void; onSkip: () => void }): void {
    const root = this.mount('guest-games');
    const panel = el('div', 'title-panel');
    panel.append(
      el('h2', undefined, 'Your guest games'),
      el('p', 'sub', 'You have games saved on this device from before you signed in. Copy them to your account to keep them in the cloud.'),
    );
    const list = el('ul', 'guest-list');
    for (const g of opts.games) list.append(el('li', undefined, `Slot ${g.slot}: ${g.name}, day ${g.day}`));
    const copy = el('button', 'btn', 'Copy to my account');
    copy.addEventListener('click', () => {
      copy.disabled = true;
      copy.textContent = 'Copying...';
      opts.onCopy();
    });
    const skip = el('button', 'btn secondary', 'Not now');
    skip.addEventListener('click', opts.onSkip);
    const btns = el('div', 'btn-row');
    btns.append(copy, skip);
    panel.append(list, el('p', 'sub', 'A slot that already has a game in your account is left alone. Your guest games stay on this device either way.'), btns);
    root.append(panel);
  }

  // ------------------------------------------------------------ Settings

  showSettings(opts: { volume: number; muted: boolean; onVolume: (v: number) => void; onMute: (muted: boolean) => void; onBack: () => void }): void {
    const root = this.mount('settings');
    const panel = el('div', 'title-panel');
    panel.append(el('h2', undefined, 'Settings'));
    const sound = el('div', 'sound-row');
    const toggle = el('button', 'tool-btn');
    let muted = opts.muted;
    const draw = () => toggle.replaceChildren(icon(muted ? 'VolumeX' : 'Volume2', 16), el('span', undefined, muted ? 'Sound off' : 'Sound on'));
    draw();
    toggle.addEventListener('click', () => {
      muted = !muted;
      draw();
      opts.onMute(muted);
    });
    const slider = el('input', 'volume');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(opts.volume * 100));
    slider.setAttribute('aria-label', 'Volume');
    slider.addEventListener('input', () => opts.onVolume(Number(slider.value) / 100));
    sound.append(toggle, slider);
    panel.append(sound, iconButton('tool-btn back-btn', 'ArrowLeft', 'Back', opts.onBack));
    root.append(panel);
  }
}
