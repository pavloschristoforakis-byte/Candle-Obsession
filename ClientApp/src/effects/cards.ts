// Gentle spotlight + tilt on product cards (mouse only, motion allowed).
// Product cards are server-rendered Razor markup, so instead of wrapping each one in React this
// re-uses the technique of React Bits' <SpotlightCard>: the pointer position goes into CSS variables
// (--mx/--my) and CSS paints a soft radial light; --rx/--ry add a subtle 3D tilt.
import { canHover, prefersReducedMotion } from '../lib/util';

export function initCardSpotlight(root: ParentNode = document): void {
  if (!canHover()) return;
  // data-tilt="off": switched off for that product in the admin product editor.
  for (const card of root.querySelectorAll<HTMLElement>('.product-card[data-product-card]:not(.pd-slide):not([data-tilt="off"])')) {
    let frame = 0;
    card.addEventListener('pointermove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        if (!prefersReducedMotion()) {
          card.style.setProperty('--ry', `${((px - 0.5) * 5).toFixed(2)}deg`);
          card.style.setProperty('--rx', `${((0.5 - py) * 4).toFixed(2)}deg`);
        }
      });
    });
    card.addEventListener('pointerleave', () => {
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    });
  }
}

/** Fades sections in as they scroll into view (only when motion is allowed; see .reveal in site.css). */
export function initReveal(): void {
  const items = document.querySelectorAll<HTMLElement>('.reveal');
  if (!items.length) return;
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
  );
  items.forEach((i) => io.observe(i));
}
