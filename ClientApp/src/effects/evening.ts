// Optional "evening mode": dims the page and turns the cursor into a soft candle light.
// The light follows the mouse, or the focused element when using the keyboard, or the last touch.
// The toggle is hidden until JS runs, remembered in localStorage, and works with reduced motion too
// (the light simply follows without any easing animation).
import { storage } from '../lib/util';

const KEY = 'co.evening';

export function initEvening(): void {
  const html = document.documentElement;
  const toggle = document.querySelector<HTMLButtonElement>('[data-evening-toggle]');
  if (!toggle) return;
  toggle.hidden = false;

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 3;
  let pending = false;

  const apply = () => {
    pending = false;
    html.style.setProperty('--cx', `${x}px`);
    html.style.setProperty('--cy', `${y}px`);
  };
  const moveTo = (nx: number, ny: number) => {
    x = nx;
    y = ny;
    if (!pending) {
      pending = true;
      requestAnimationFrame(apply);
    }
  };

  const onPointer = (e: PointerEvent) => moveTo(e.clientX, e.clientY);
  const onFocus = (e: FocusEvent) => {
    const r = (e.target as Element).getBoundingClientRect?.();
    if (r) moveTo(r.left + r.width / 2, r.top + r.height / 2);
  };

  const set = (on: boolean) => {
    html.toggleAttribute('data-evening', on);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.setAttribute('aria-label', on ? 'Turn off evening mode' : 'Turn on evening mode');
    toggle.title = on ? 'Evening mode: on' : 'Evening mode';
    storage.set(KEY, on ? '1' : '0');
    if (on) {
      apply();
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerdown', onPointer, { passive: true });
      document.addEventListener('focusin', onFocus);
    } else {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    }
  };

  toggle.addEventListener('click', () => set(!html.hasAttribute('data-evening')));
  set(html.hasAttribute('data-evening'));
}
