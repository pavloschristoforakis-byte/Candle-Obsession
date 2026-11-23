// The shopping cart. Lives in the browser (localStorage) so it survives reloads, and syncs across tabs.
// Only ids, variants, options and quantities are stored: names and prices always come from the catalogue.
import { findByLegacyName, findProduct, findVariant, type CatalogProduct, type CatalogVariant } from './catalog';
import { storage } from './util';

const KEY = 'co.cart.v2';
const LEGACY_KEY = 'cart'; // format used by the original site: [{ name, price, quantity }]
export const MAX_QTY = 20;

export interface CartLine {
  key: string;
  productId: string;
  variantId?: string;
  options?: Record<string, string>;
  quantity: number;
}

export interface ResolvedLine extends CartLine {
  product?: CatalogProduct;
  variant?: CatalogVariant;
  name: string;
  detail?: string;
  image?: string;
  url?: string;
  unitPrice: number;
  total: number;
  /** false if the product was removed, sold out or no longer priced. Such lines can't be checked out. */
  available: boolean;
  /** Why the line can't be checked out (shown to the customer). */
  reason?: string;
}

type Listener = (lines: CartLine[]) => void;
const listeners = new Set<Listener>();
let lines: CartLine[] = load();

function lineKey(productId: string, variantId?: string, options?: Record<string, string>): string {
  const opts = options ? Object.keys(options).sort().map((k) => `${k}=${options[k]}`).join('&') : '';
  return [productId, variantId ?? '', opts].join('|');
}

function load(): CartLine[] {
  const raw = storage.get(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CartLine[];
      if (Array.isArray(parsed)) return parsed.filter((l) => l && typeof l.productId === 'string' && l.quantity > 0);
    } catch {
      /* fall through */
    }
  }
  return migrateLegacy();
}

/** Carries over carts saved by the previous version of the site (name-based). */
function migrateLegacy(): CartLine[] {
  const raw = storage.get(LEGACY_KEY);
  if (!raw) return [];
  try {
    const old = JSON.parse(raw) as { name: string; quantity: number }[];
    const migrated: CartLine[] = [];
    for (const item of old) {
      const product = findByLegacyName(String(item.name ?? ''));
      if (!product) continue;
      migrated.push({ key: lineKey(product.id), productId: product.id, quantity: clampQty(item.quantity) });
    }
    storage.remove(LEGACY_KEY);
    storage.set(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

// A function declaration (hoisted), because load() → migrateLegacy() calls it while the module initialises.
function clampQty(q: number): number {
  return Math.max(1, Math.min(MAX_QTY, Math.floor(Number(q) || 1)));
}

/** Mirrors the server's OrderCalculator.ValidateOptions, so the cart flags lines the server would reject. */
function optionProblem(product: CatalogProduct, chosen: Record<string, string> = {}): string | undefined {
  const keys = Object.keys(chosen);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  for (const o of product.options) {
    const k = keys.find((x) => same(x, o.id));
    const v = k ? String(chosen[k] ?? '').trim() : '';
    if (!v) {
      if (o.required) return `Please choose "${o.label}" again on the product page.`;
      continue;
    }
    const bad = o.type === 'select' ? !o.values.some((x) => same(x, v)) : v.length > o.maxLength;
    if (bad) return `"${o.label}" has changed. Please remove this item and choose again.`;
  }
  if (keys.some((k) => !product.options.some((o) => same(o.id, k)))) return 'The options for this item have changed. Please remove it and add it again.';
  return undefined;
}

function save(): void {
  storage.set(KEY, JSON.stringify(lines));
  listeners.forEach((l) => l(lines));
}

export const cart = {
  lines: (): CartLine[] => lines,

  count: (): number => lines.reduce((n, l) => n + l.quantity, 0),

  add(productId: string, variantId?: string, options?: Record<string, string>, quantity = 1): void {
    const cleaned = options && Object.keys(options).length ? options : undefined;
    const key = lineKey(productId, variantId, cleaned);
    lines = lines.some((l) => l.key === key)
      ? lines.map((l) => (l.key === key ? { ...l, quantity: clampQty(l.quantity + quantity) } : l))
      : [...lines, { key, productId, variantId, options: cleaned, quantity: clampQty(quantity) }];
    save();
  },

  setQuantity(key: string, quantity: number): void {
    if (quantity <= 0) return cart.remove(key);
    lines = lines.map((l) => (l.key === key ? { ...l, quantity: clampQty(quantity) } : l));
    save();
  },

  remove(key: string): void {
    lines = lines.filter((l) => l.key !== key);
    save();
  },

  clear(): void {
    lines = [];
    save();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Joins cart lines with catalogue data for display. */
  resolve(): ResolvedLine[] {
    return lines.map((line) => {
      const product = findProduct(line.productId);
      const variant = product ? findVariant(product, line.variantId) : undefined;
      const price = variant?.price ?? product?.price ?? 0;
      const buyable = !!product && (product.variants.length ? !!variant?.purchasable : product.purchasable);
      const reason = buyable && product ? optionProblem(product, line.options) : undefined;
      const available = buyable && !reason;
      const optionText = line.options
        ? Object.entries(line.options)
            .map(([k, v]) => `${product?.options.find((o) => o.id === k)?.label ?? k}: ${v}`)
            .join(' · ')
        : '';
      return {
        ...line,
        product,
        variant,
        name: product?.name ?? 'Unavailable product',
        detail: [variant?.name, optionText].filter(Boolean).join(' · ') || undefined,
        image: product?.image,
        url: product?.url,
        unitPrice: price,
        total: price * line.quantity,
        available,
        reason,
      };
    });
  },

  subtotal(): number {
    return cart.resolve().filter((l) => l.available).reduce((sum, l) => sum + l.total, 0);
  },

  containsAlcohol(): boolean {
    return cart.resolve().some((l) => l.available && l.product?.containsAlcohol);
  },
};

// Keep tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    lines = load();
    listeners.forEach((l) => l(lines));
  }
});
