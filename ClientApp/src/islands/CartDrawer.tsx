// Slide-in cart drawer (accessible dialog: focus trap, Esc to close, focus returns to the cart icon).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { CartView, useCart } from './CartView';

// An open request can arrive after mount() but before React's effect subscribes (rendering is async).
// Buffer it here and replay it once the drawer's own listener is attached.
let pendingTrigger: HTMLElement | null | undefined;
const bufferOpen = (e: Event) => {
  pendingTrigger = ((e as CustomEvent).detail?.trigger as HTMLElement) ?? (document.activeElement as HTMLElement);
};
window.addEventListener('co:open-cart', bufferOpen);

function CartDrawer({ initialOpen = false, initialTrigger = null }: { initialOpen?: boolean; initialTrigger?: HTMLElement | null }) {
  const [open, setOpen] = useState(initialOpen);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(initialTrigger);
  const lines = useCart();
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    window.removeEventListener('co:open-cart', bufferOpen);
    const onOpen = (e: Event) => {
      returnFocus.current = ((e as CustomEvent).detail?.trigger as HTMLElement) ?? (document.activeElement as HTMLElement);
      setOpen(true);
    };
    window.addEventListener('co:open-cart', onOpen);
    if (pendingTrigger !== undefined) {
      returnFocus.current = pendingTrigger;
      pendingTrigger = undefined;
      setOpen(true);
    }
    return () => window.removeEventListener('co:open-cart', onOpen);
  }, []);

  useEffect(() => {
    if (!open) {
      returnFocus.current?.focus();
      return;
    }
    document.documentElement.classList.add('drawer-open');
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(
        panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('drawer-open');
    };
  }, [open, close]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div className="drawer-backdrop" key="backdrop" onClick={close}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
        )}
        {open && (
          <motion.div ref={panel} key="panel" className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
            <header className="drawer-head">
              <h2 id="drawer-title">Your cart {count > 0 && <span className="drawer-count">({count})</span>}</h2>
              <button type="button" className="icon-button" onClick={close} data-autofocus aria-label="Close cart">
                <svg className="icon" aria-hidden="true">
                  <use href="#i-close" />
                </svg>
              </button>
            </header>
            <div className="drawer-body">
              <CartView compact onNavigate={close} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

export function mount(el: HTMLElement, opts?: { open?: boolean; trigger?: HTMLElement | null }): void {
  createRoot(el).render(<CartDrawer initialOpen={!!opts?.open} initialTrigger={opts?.trigger ?? null} />);
}
