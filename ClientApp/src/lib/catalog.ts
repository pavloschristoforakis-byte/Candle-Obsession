// Read-only view of Data/products.json, embedded by _Layout.cshtml as <script id="co-catalog">.
// Prices here are for display only: the server re-prices every order.

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'made_to_order' | 'enquire';

export interface CatalogVariant {
  id: string;
  name: string;
  price: number | null;
  stock: StockStatus;
  purchasable: boolean;
  swatch?: string;
}

export interface CatalogOption {
  id: string;
  label: string;
  type: 'select' | 'text';
  required: boolean;
  values: string[];
  maxLength: number;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  legacyNames: string[];
  type: string;
  url: string;
  image?: string;
  price: number | null;
  priceNote?: string;
  stock: StockStatus;
  purchasable: boolean;
  containsAlcohol: boolean;
  variants: CatalogVariant[];
  options: CatalogOption[];
}

let cache: CatalogProduct[] | null = null;

export function products(): CatalogProduct[] {
  if (cache) return cache;
  const el = document.getElementById('co-catalog');
  try {
    cache = el?.textContent ? (JSON.parse(el.textContent) as CatalogProduct[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function findProduct(id: string | undefined): CatalogProduct | undefined {
  return id ? products().find((p) => p.id === id) : undefined;
}

export function findByLegacyName(name: string): CatalogProduct | undefined {
  const n = name.trim().toLowerCase();
  return products().find((p) => p.name.toLowerCase() === n || p.legacyNames.some((l) => l.toLowerCase() === n));
}

export function findVariant(product: CatalogProduct, id: string | undefined): CatalogVariant | undefined {
  return id ? product.variants.find((v) => v.id === id) : undefined;
}
