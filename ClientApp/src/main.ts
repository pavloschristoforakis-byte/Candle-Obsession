// Front-end entry. Loaded on every page as /dist/app.js (type="module", so it never blocks rendering).
// Small vanilla modules run immediately; React islands are code-split and loaded on demand.
import './styles/islands.css';
import { initShop } from './ui/shop';
import { initCheckout } from './ui/checkoutPage';
import { calmFlames, initFlames, resumeFlicker } from './effects/flame';
import { initEvening } from './effects/evening';
import { initCardSpotlight, initReveal } from './effects/cards';
import { initIslands } from './islands';
import { onReducedMotionChange } from './lib/util';

// One failing setup step must not stop the others (or the islands).
function safe(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`${name} failed`, err);
  }
}

function start(): void {
  // Guard: if the entry module is ever evaluated twice, don't wire every handler a second time.
  const w = window as unknown as { __coStarted?: boolean };
  if (w.__coStarted) return;
  w.__coStarted = true;

  safe('shop', initShop);
  safe('checkout', initCheckout);
  safe('flames', () => initFlames());
  safe('spotlight', () => initCardSpotlight());
  safe('reveal', initReveal);
  safe('evening', initEvening);
  safe('islands', initIslands);
  // If the visitor turns on "reduce motion" while the page is open, stop decorative motion right away.
  safe('reduced-motion', () =>
    onReducedMotionChange((reduced) => {
      if (reduced) calmFlames();
      else resumeFlicker();
    }),
  );
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
