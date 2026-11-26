// React "islands": small React components mounted into server-rendered pages.
// Each island is code-split and loaded only when needed, so React never blocks the first paint:
//   • eager   – hero text, cart page (needed straight away)
//   • visible – gift guide, gift-box reveal (when scrolled near)
//   • on demand – cart drawer (loaded on hover/focus/touch of the cart icon, mounted on click)
// Every island has a server-rendered fallback inside its mount element, so the page works without it.
import { prefersReducedMotion } from '../lib/util';

type Loader = () => Promise<{ mount: (el: HTMLElement, opts?: any) => void }>;

const loaders: Record<string, Loader> = {
  'hero-title': () => import('./HeroTitle'),
  'shiny-text': () => import('./ShinyEyebrow'),
  'gift-guide': () => import('./GiftGuide'),
  'gift-reveal': () => import('./GiftReveal'),
  'cart-page': () => import('./CartPage'),
  'cart-drawer': () => import('./CartDrawer'),
  'product-admin': () => import('./admin/ProductAdmin'), // owner-only, on /admin/products
};

// Purely decorative islands are skipped entirely for reduced-motion visitors (server text stays).
const decorative = new Set(['hero-title', 'shiny-text']);
const eager = new Set(['hero-title', 'shiny-text', 'cart-page', 'product-admin']);

/** Loads and mounts an island. Resolves true once it is mounted, false if it is loading, skipped or failed. */
async function mount(el: HTMLElement, opts?: unknown): Promise<boolean> {
  const name = el.dataset.island!;
  if (el.dataset.islandState === 'mounted') return true;
  if (el.dataset.islandState) return false;
  el.dataset.islandState = 'loading';
  try {
    const mod = await loaders[name]();
    mod.mount(el, opts);
    el.dataset.islandState = 'mounted';
    return true;
  } catch (err) {
    el.dataset.islandState = 'failed'; // CSS reveals the server-rendered fallback
    console.error(`Island "${name}" failed to load`, err);
    return false;
  }
}

export function initIslands(): void {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-island]')).filter((el) => loaders[el.dataset.island!]);
  const reduced = prefersReducedMotion();
  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                io!.unobserve(e.target);
                void mount(e.target as HTMLElement);
              }
            }
          },
          { rootMargin: '300px 0px' },
        )
      : null;

  for (const node of nodes) {
    const name = node.dataset.island!;
    if (reduced && decorative.has(name)) {
      node.dataset.islandState = 'skipped';
      continue;
    }
    if (name === 'cart-drawer') continue;
    if (eager.has(name) || !io) void mount(node);
    else io.observe(node);
  }

  // Cart drawer: open on cart-icon click (falls back to the /cart page without JS).
  const drawer = document.querySelector<HTMLElement>('[data-island="cart-drawer"]');
  if (drawer) {
    // Warm the drawer chunk only when the visitor shows intent (hover, focus or touch on the cart icon),
    // so React never downloads on pages where nobody opens the cart. The cart and checkout pages never need it.
    const path = window.location.pathname.toLowerCase();
    if (!path.startsWith('/cart') && !path.startsWith('/checkout')) {
      let warmed = false;
      const warm = (e: Event) => {
        if (warmed || !(e.target as Element | null)?.closest?.('[data-cart-open]')) return;
        warmed = true;
        loaders['cart-drawer']().catch(() => {}); // a failed preload is handled on click
      };
      for (const t of ['pointerover', 'focusin', 'touchstart'] as const) document.addEventListener(t, warm, { passive: true });
    }

    document.addEventListener('click', async (e) => {
      const me = e as MouseEvent;
      const trigger = (e.target as Element).closest<HTMLAnchorElement>('[data-cart-open]');
      if (!trigger || e.defaultPrevented || me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;
      if (window.location.pathname.toLowerCase().startsWith('/cart')) return; // already on the cart page
      const state = drawer.dataset.islandState;
      if (state === 'failed') return; // the drawer can't load: let the link go to the /cart page
      e.preventDefault();
      if (state === 'mounted') {
        window.dispatchEvent(new CustomEvent('co:open-cart', { detail: { trigger } }));
        return;
      }
      if (state === 'loading') return; // a first click is already opening it
      // First click: render the drawer already open (no event needed, so nothing can be missed).
      const ok = await mount(drawer, { open: true, trigger });
      if (!ok && drawer.dataset.islandState === 'failed') window.location.assign(trigger.getAttribute('href') || '/cart');
    });
  }
}
