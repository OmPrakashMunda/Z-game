import type { PadButton } from '../gamepad';

/**
 * Moving around a menu with a gamepad: the D-pad (or left stick) moves the highlight to the nearest button in that direction,
 * A presses it, and B goes back. The highlight is a class (pad-focus) on the element, plus real keyboard focus so that
 * Enter, typing and sliders still work.
 */

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const HIGHLIGHT = 'pad-focus';

function usable(e: HTMLElement): boolean {
  if (e.getAttribute('aria-hidden') === 'true') return false;
  const r = e.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = getComputedStyle(e);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function candidates(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(usable);
}

function highlight(e: HTMLElement | null, root: HTMLElement): void {
  for (const old of Array.from(root.querySelectorAll('.' + HIGHLIGHT))) old.classList.remove(HIGHLIGHT);
  if (!e) return;
  e.classList.add(HIGHLIGHT);
  e.focus({ preventScroll: true });
  e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Take the highlight away, for example when the mouse is used again. */
export function clearPadFocus(): void {
  for (const old of Array.from(document.querySelectorAll('.' + HIGHLIGHT))) old.classList.remove(HIGHLIGHT);
}

const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The element in a direction from the current one, or the first element when nothing is highlighted yet. */
function pick(root: HTMLElement, dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const all = candidates(root);
  if (all.length === 0) return null;
  const current = all.find((e) => e.classList.contains(HIGHLIGHT)) ?? (all.includes(document.activeElement as HTMLElement) ? (document.activeElement as HTMLElement) : null);
  if (!current) return all[0];
  const from = centre(current.getBoundingClientRect());
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const e of all) {
    if (e === current) continue;
    const to = centre(e.getBoundingClientRect());
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    // Must lie ahead, and more ahead than aside, so a wide row does not swallow a press meant for the next row
    if (along < 2 || across > along * 2.2 + 12) continue;
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** Handle a gamepad press inside a menu. Returns true if it was used. */
export function padMenuPress(root: HTMLElement, button: PadButton): boolean {
  if (button === 'up' || button === 'down' || button === 'left' || button === 'right') {
    const active = document.activeElement;
    // A slider is adjusted left and right instead of being left
    if (active instanceof HTMLInputElement && active.type === 'range' && (button === 'left' || button === 'right') && root.contains(active)) {
      const step = Number(active.step) || 5;
      active.value = String(Number(active.value) + (button === 'right' ? step : -step));
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const next = pick(root, button);
    if (next) highlight(next, root);
    return true;
  }
  if (button === 'a') {
    const e = root.querySelector<HTMLElement>('.' + HIGHLIGHT);
    if (!e) {
      // Nothing highlighted yet: A starts at the first button
      highlight(candidates(root)[0] ?? null, root);
      return true;
    }
    if (e instanceof HTMLInputElement && (e.type === 'text' || e.type === 'search' || e.type === 'number')) {
      e.focus();
      e.select();
    } else {
      e.click();
    }
    return true;
  }
  return false;
}

/** The button that means "go back" in the open menu, if there is one. */
export function backButton(root: HTMLElement): HTMLElement | null {
  const words = /^(back|cancel|resume|close|not now|keep)/i;
  return candidates(root).find((e) => e instanceof HTMLButtonElement && words.test((e.textContent ?? '').trim())) ?? null;
}

document.addEventListener('pointermove', clearPadFocus, { passive: true });
