const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

/** Formats a EUR amount like "€13.00" (same format as the server's Money.Eur). */
export const money = (amount: number): string => eur.format(amount);

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/** True when the visitor has asked for reduced motion. Every effect checks this. */
export const prefersReducedMotion = (): boolean => reduceQuery.matches;

export function onReducedMotionChange(cb: (reduced: boolean) => void): void {
  reduceQuery.addEventListener('change', (e) => {
    document.documentElement.classList.toggle('motion-ok', !e.matches);
    cb(e.matches);
  });
}

/** Devices with a real hover-capable pointer (mouse/trackpad). Touch devices get tap/scroll behaviour. */
export const canHover = (): boolean => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** localStorage that never throws (private mode, blocked storage, thumbnails…). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** Small DOM element helper (textContent only: never innerHTML with user data). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null) node.append(child);
  return node;
}

export const random = (min: number, max: number): number => min + Math.random() * (max - min);
