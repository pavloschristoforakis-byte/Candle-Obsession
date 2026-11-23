// Burning-wick product cards (custom: React Bits has no flame component).
//
//  • Mouse: hovering (or keyboard-focusing) a candle card lights it; leaving blows it out with a wisp of smoke.
//  • Touch (no hover): the candle lights when the card is mostly on screen and goes out when it scrolls away.
//  • The flame shape/glow is pure CSS (site.css → "Flame"). This file only toggles classes and, while a
//    candle is lit, nudges a few CSS variables at random intervals so the flicker never looks looped.
//  • prefers-reduced-motion: the flame still appears (a calm, steady light) but never flickers or smokes.
import { canHover, prefersReducedMotion, random } from '../lib/util';

const SMOKE_MS = 1700;
const FLICKER_VARS = ['--flicker-scale', '--flicker-rot', '--flicker-x', '--flicker-glow'];
const lit = new Set<HTMLElement>();
const smokeTimers = new WeakMap<HTMLElement, number>();
let rafId = 0;
let lastTick = 0;

function light(card: HTMLElement): void {
  window.clearTimeout(smokeTimers.get(card));
  card.classList.remove('is-out');
  card.classList.add('is-lit');
  lit.add(card);
  startLoop();
}

function extinguish(card: HTMLElement): void {
  if (!card.classList.contains('is-lit')) return;
  card.classList.remove('is-lit');
  lit.delete(card);
  FLICKER_VARS.forEach((v) => card.style.removeProperty(v));
  if (prefersReducedMotion()) return;
  card.classList.add('is-out');
  smokeTimers.set(card, window.setTimeout(() => card.classList.remove('is-out'), SMOKE_MS));
}

// One shared loop for every lit candle; only runs while at least one is lit.
function startLoop(): void {
  if (rafId || prefersReducedMotion()) return;
  const tick = (now: number) => {
    if (lit.size === 0 || prefersReducedMotion()) {
      for (const card of lit) FLICKER_VARS.forEach((v) => card.style.removeProperty(v));
      rafId = 0;
      return;
    }
    if (now - lastTick > random(70, 140)) {
      lastTick = now;
      for (const card of lit) {
        const s = card.style;
        s.setProperty('--flicker-scale', random(0.92, 1.08).toFixed(3));
        s.setProperty('--flicker-rot', `${random(-3.5, 3.5).toFixed(2)}deg`);
        s.setProperty('--flicker-x', `${random(-1, 1).toFixed(2)}px`);
        s.setProperty('--flicker-glow', random(0.78, 1).toFixed(3));
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

/** Reduced motion switched on mid-visit: stop the flicker loop and any smoke, keep the steady flame. */
export function calmFlames(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  for (const card of document.querySelectorAll<HTMLElement>('[data-candle]')) {
    card.classList.remove('is-out');
    window.clearTimeout(smokeTimers.get(card));
    FLICKER_VARS.forEach((v) => card.style.removeProperty(v));
  }
}

/** Reduced motion switched off again: restart the flicker for candles that are still lit. */
export function resumeFlicker(): void {
  if (lit.size) startLoop();
}

export function initFlames(root: ParentNode = document): void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-candle]')).filter(
    (c) => c.querySelector('.wick-flame') && !c.classList.contains('is-sold-out'),
  );
  if (cards.length === 0) return;

  // Cards rendered already lit (thank-you page) just need the flicker loop.
  cards.filter((c) => c.classList.contains('is-lit')).forEach(light);
  const interactive = cards.filter((c) => !c.classList.contains('result-flame'));

  if (canHover()) {
    for (const card of interactive) {
      card.addEventListener('pointerenter', () => light(card));
      card.addEventListener('pointerleave', () => extinguish(card));
      card.addEventListener('focusin', () => light(card));
      card.addEventListener('focusout', (e) => {
        if (!card.contains(e.relatedTarget as Node | null)) extinguish(card);
      });
    }
    return;
  }

  // Touch devices: light candles as they scroll into view.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const card = entry.target as HTMLElement;
        if (entry.intersectionRatio >= 0.6) light(card);
        else extinguish(card);
      }
    },
    { threshold: [0, 0.6] },
  );
  interactive.forEach((c) => io.observe(c));
}
