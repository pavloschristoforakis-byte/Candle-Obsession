// Types and server calls for the admin product editor (/admin/products).
// The server side is Pages/Admin/Products.cshtml.cs; every rule is checked again there.

export interface FlamePoint {
  x: number;
  y: number;
  size: number;
}

export interface ProductImage {
  file: string;
  alt: string;
  source: string | null;
  flame: FlamePoint | null;
}

export interface Variant {
  id: string;
  sku: string;
  name: string;
  swatch: string | null;
  priceEur: number | null;
  stockStatus: string | null;
  paymentLink: string | null;
}

export interface ProductOption {
  id: string;
  label: string;
  type: 'select' | 'text';
  required: boolean;
  values: string[];
  maxLength: number;
  placeholder: string | null;
}

export interface Product {
  id: string;
  sku: string;
  slug: string;
  name: string;
  legacyNames: string[];
  category: string;
  type: string;
  shortDescription: string;
  description: string;
  scent: { tags: string[]; top: string[]; heart: string[]; base: string[] };
  contents: string[];
  wax: string | null;
  vessel: string | null;
  size: string | null;
  weightGrams: number | null;
  burnTimeHours: number | null;
  priceEur: number | null;
  priceNote: string | null;
  compareAtPriceEur: number | null;
  stockStatus: string;
  variants: Variant[];
  options: ProductOption[];
  images: ProductImage[];
  guides: string[];
  featured: boolean;
  giftSet: boolean;
  containsAlcohol: boolean;
  paymentLink: string | null;
  checkoutUrl: string | null;
  instagramSource: string | null;
  todo: string[];
  hidden: boolean;
  effects: { flame: boolean | null; tilt: boolean };
  /** Fields this editor doesn't know are kept and sent back unchanged. */
  [extra: string]: unknown;
}

export interface LibraryImage {
  file: string;
  canDelete: boolean;
  usedBy: string[];
}

export interface AdminState {
  products: Product[];
  categories: { id: string; name: string }[];
  guides: { id: string; name: string; maxPriceEur?: number | null }[];
  types: string[];
  stockStatuses: { id: string; label: string }[];
  images: LibraryImage[];
  maxUploadBytes: number;
}

export interface FieldError {
  field: string;
  message: string;
}

/** Thrown for anything the server refuses; `errors` says which fields are wrong. */
export class AdminError extends Error {
  constructor(public errors: FieldError[]) {
    super(errors.map((e) => e.message).join(' '));
  }
}

export const imageUrl = (file: string, width: 400 | 800 | 1200 = 400): string => `/images/products/${file}-${width}.webp`;

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numberOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The server leaves out empty fields; fill them in so the form always has something to bind to. */
export function normalize(raw: Record<string, unknown>): Product {
  const scent = (raw.scent ?? {}) as Record<string, unknown>;
  const effects = (raw.effects ?? {}) as Record<string, unknown>;
  return {
    ...raw,
    id: text(raw.id),
    sku: text(raw.sku),
    slug: text(raw.slug),
    name: text(raw.name),
    legacyNames: list(raw.legacyNames),
    category: text(raw.category),
    type: text(raw.type),
    shortDescription: text(raw.shortDescription),
    description: text(raw.description),
    scent: { tags: list(scent.tags), top: list(scent.top), heart: list(scent.heart), base: list(scent.base) },
    contents: list(raw.contents),
    wax: textOrNull(raw.wax),
    vessel: textOrNull(raw.vessel),
    size: textOrNull(raw.size),
    weightGrams: numberOrNull(raw.weightGrams),
    burnTimeHours: numberOrNull(raw.burnTimeHours),
    priceEur: numberOrNull(raw.priceEur),
    priceNote: textOrNull(raw.priceNote),
    compareAtPriceEur: numberOrNull(raw.compareAtPriceEur),
    stockStatus: text(raw.stockStatus) || 'in_stock',
    variants: (Array.isArray(raw.variants) ? raw.variants : []).map((v: Record<string, unknown>) => ({
      ...v,
      id: text(v.id),
      sku: text(v.sku),
      name: text(v.name),
      swatch: textOrNull(v.swatch),
      priceEur: numberOrNull(v.priceEur),
      stockStatus: textOrNull(v.stockStatus),
      paymentLink: textOrNull(v.paymentLink),
    })),
    options: (Array.isArray(raw.options) ? raw.options : []).map((o: Record<string, unknown>) => ({
      ...o,
      id: text(o.id),
      label: text(o.label),
      type: o.type === 'text' ? ('text' as const) : ('select' as const),
      required: o.required === true,
      values: list(o.values),
      maxLength: numberOrNull(o.maxLength) ?? 120,
      placeholder: textOrNull(o.placeholder),
    })),
    images: (Array.isArray(raw.images) ? raw.images : []).map((i: Record<string, unknown>) => {
      const f = i.flame as Record<string, unknown> | null | undefined;
      return {
        ...i,
        file: text(i.file),
        alt: text(i.alt),
        source: textOrNull(i.source),
        flame: f ? { x: numberOrNull(f.x) ?? 0.5, y: numberOrNull(f.y) ?? 0.2, size: numberOrNull(f.size) ?? 1 } : null,
      };
    }),
    guides: list(raw.guides),
    featured: raw.featured === true,
    giftSet: raw.giftSet === true,
    containsAlcohol: raw.containsAlcohol === true,
    paymentLink: textOrNull(raw.paymentLink),
    checkoutUrl: textOrNull(raw.checkoutUrl),
    instagramSource: textOrNull(raw.instagramSource),
    todo: list(raw.todo),
    hidden: raw.hidden === true,
    effects: { flame: typeof effects.flame === 'boolean' ? effects.flame : null, tilt: effects.tilt !== false },
  };
}

export function blankProduct(category: string): Product {
  return normalize({ category, type: 'candle', stockStatus: 'in_stock' });
}

function normalizeState(raw: AdminState): AdminState {
  return { ...raw, products: raw.products.map((p) => normalize(p as unknown as Record<string, unknown>)) };
}

export class AdminApi {
  constructor(
    private endpoint: string,
    private token: string,
  ) {}

  get exportUrl(): string {
    return `${this.endpoint}?handler=Export`;
  }

  private async send<T>(handler: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}?handler=${handler}`, {
        credentials: 'same-origin',
        ...init,
        headers: { RequestVerificationToken: this.token, Accept: 'application/json', ...(init.headers ?? {}) },
      });
    } catch {
      throw new AdminError([{ field: 'general', message: 'No connection to the website. Check your internet and try again.' }]);
    }

    const isJson = (response.headers.get('content-type') ?? '').includes('json');
    if (response.redirected || response.status === 401 || (response.ok && !isJson)) {
      throw new AdminError([{ field: 'session', message: 'You have been logged out. Log in again, then come back to this page.' }]);
    }

    if (!response.ok) {
      const body = isJson ? ((await response.json().catch(() => null)) as { errors?: FieldError[] } | null) : null;
      const fallback =
        response.status === 413
          ? 'That photo is too large to upload. Please choose one under 20 MB.'
          : response.status === 400
            ? 'This page has been open for a long time. Refresh it and try again.'
            : 'The website could not do that. Please try again.';
      throw new AdminError(body?.errors?.length ? body.errors : [{ field: 'general', message: fallback }]);
    }

    return (await response.json()) as T;
  }

  private post<T>(handler: string, body: unknown): Promise<T> {
    return this.send<T>(handler, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  async load(): Promise<AdminState> {
    return normalizeState(await this.send<AdminState>('Data', { method: 'GET' }));
  }

  async save(product: Product, originalId: string | null): Promise<{ savedId: string; state: AdminState }> {
    const result = await this.post<{ savedId: string; state: AdminState }>('Save', { originalId, product });
    return { savedId: result.savedId, state: normalizeState(result.state) };
  }

  async remove(id: string): Promise<AdminState> {
    return normalizeState((await this.post<{ state: AdminState }>('Delete', { id })).state);
  }

  async move(id: string, direction: -1 | 1): Promise<AdminState> {
    return normalizeState((await this.post<{ state: AdminState }>('Move', { id, direction })).state);
  }

  async upload(
    file: File,
    name: string,
    crop: { x: number; y: number; width: number; height: number } | null,
  ): Promise<{ file: string; warning?: string; state: AdminState }> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    if (crop) {
      form.append('cropX', String(crop.x));
      form.append('cropY', String(crop.y));
      form.append('cropWidth', String(crop.width));
      form.append('cropHeight', String(crop.height));
    }
    const result = await this.send<{ file: string; warning?: string; state: AdminState }>('Upload', { method: 'POST', body: form });
    return { ...result, state: normalizeState(result.state) };
  }

  async deleteImage(file: string): Promise<AdminState> {
    return normalizeState((await this.post<{ state: AdminState }>('DeleteImage', { file })).state);
  }
}
