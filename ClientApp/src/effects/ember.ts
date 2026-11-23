// "Add to cart" ember: a small glowing spark arcs from the button to the cart icon, which then glows.
// Uses the Web Animations API (GPU-friendly transforms only). Reduced motion: no flight, just the glow.
import { prefersReducedMotion } from '../lib/util';

export function glowCart(): void {
  const icon = document.querySelector<HTMLElement>('[data-cart-open]');
  if (!icon) return;
  icon.classList.remove('is-glowing');
  void icon.offsetWidth; // restart the CSS animation
  icon.classList.add('is-glowing');
  window.setTimeout(() => icon.classList.remove('is-glowing'), 1200);
}

export function flyEmber(from: Element): void {
  const target = document.querySelector<HTMLElement>('[data-cart-open]');
  if (!target || prefersReducedMotion()) {
    glowCart();
    return;
  }

  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const startX = a.left + a.width / 2;
  const startY = a.top + a.height / 2;
  const dx = b.left + b.width / 2 - startX;
  const dy = b.top + b.height / 2 - startY;
  const lift = Math.min(160, Math.abs(dx) * 0.35 + 60);

  const ember = document.createElement('span');
  ember.className = 'ember-particle';
  ember.setAttribute('aria-hidden', 'true');
  ember.style.left = `${startX}px`;
  ember.style.top = `${startY}px`;
  document.body.append(ember);

  const anim = ember.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.12 },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 - lift}px)) scale(1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35)`, opacity: 0.2 },
    ],
    { duration: 780, easing: 'cubic-bezier(.45,.05,.35,1)' },
  );
  anim.onfinish = anim.oncancel = () => {
    ember.remove();
    glowCart();
  };
}
