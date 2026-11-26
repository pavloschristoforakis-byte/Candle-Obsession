// Admin product editor (/admin/products): add, edit, hide, reorder and delete products, upload photos,
// set prices, stock and animations. Mounted by islands/index.ts into Pages/Admin/Products.cshtml.
// It saves through Pages/Admin/Products.cshtml.cs, which checks everything again on the server.
// Styles: wwwroot/css/admin.css (loaded only by the admin page, so shoppers never download them).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { money } from '../../lib/util';
import { AdminApi, AdminError, blankProduct, imageUrl, type AdminState, type FieldError, type Product, type ProductImage, type ProductOption, type Variant } from './api';
import { CardPreview, FlameEditor } from './FlameEditor';
import { Icon, ListField, NumberField, Section, SelectField, TextField, Toggle } from './fields';
import { PhotoLibrary } from './PhotoLibrary';

const TYPE_LABELS: Record<string, string> = {
  candle: 'Candle',
  'wax-melts': 'Wax melts',
  'wax-decor': 'Wax decoration',
  diffuser: 'Reed diffuser',
  'car-freshener': 'Car air freshener',
  'gift-set': 'Gift box or set',
  favours: 'Favours (wedding / christening)',
  other: 'Something else',
};

const BUYABLE = ['in_stock', 'low_stock', 'made_to_order'];

/** Why customers can't buy this product online right now, or null if they can. */
function notBuyableReason(p: Product): string | null {
  if (p.hidden) return 'Hidden: customers cannot see this product.';
  const ok = (price: number | null, stock: string) => (price ?? 0) > 0 && BUYABLE.includes(stock);
  if (p.variants.length) {
    return p.variants.some((v) => ok(v.priceEur ?? p.priceEur, v.stockStatus ?? p.stockStatus))
      ? null
      : 'No version has both a price and an availability that allows buying.';
  }
  if ((p.priceEur ?? 0) <= 0) return 'No price yet, so customers see "Ask about this".';
  if (!BUYABLE.includes(p.stockStatus)) return p.stockStatus === 'out_of_stock' ? 'Marked as sold out.' : 'Availability is "Ask about this".';
  return null;
}

function priceLabel(p: Product): string {
  const prices = p.variants.length ? p.variants.map((v) => v.priceEur ?? p.priceEur).filter((n): n is number => n !== null) : p.priceEur !== null ? [p.priceEur] : [];
  if (prices.length === 0) return p.priceNote ?? 'No price';
  const min = Math.min(...prices);
  return new Set(prices).size > 1 ? `from ${money(min)}` : money(min);
}

// ---------------------------------------------------------------- Product list

function ProductList({
  state,
  busy,
  onEdit,
  onAdd,
  onMove,
  exportUrl,
}: {
  state: AdminState;
  busy: boolean;
  onEdit: (p: Product) => void;
  onAdd: () => void;
  onMove: (p: Product, direction: -1 | 1) => void;
  exportUrl: string;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const term = search.trim().toLowerCase();
  const filtering = term !== '' || category !== '';
  const shown = state.products.filter(
    (p) => (category === '' || p.category === category) && (term === '' || `${p.name} ${p.sku} ${p.id}`.toLowerCase().includes(term)),
  );
  const categoryName = (id: string) => state.categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="pa-list-view">
      <div className="pa-toolbar">
        <button type="button" className="button" onClick={onAdd}>
          <Icon id="plus" /> Add a product
        </button>
        <label className="pa-inline pa-search">
          <span className="visually-hidden">Search products</span>
          <input type="text" value={search} placeholder="Search by name" onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
        </label>
        <label className="pa-inline">
          <span className="visually-hidden">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <a className="button button-ghost button-small" href={exportUrl} download="products.json">
          Download a backup
        </a>
      </div>

      <p className="pa-hint" role="status">
        {shown.length} of {state.products.length} products.
        {filtering ? ' Clear the search to change the order.' : ' The arrows change the order products appear in the shop.'}
      </p>

      <ul className="pa-list">
        {shown.map((p) => {
          const index = state.products.indexOf(p);
          const reason = notBuyableReason(p);
          const image = p.images[0];
          return (
            <li key={p.id} className={p.hidden ? 'is-hidden' : undefined}>
              {image ? (
                <img className="pa-thumb" src={imageUrl(image.file)} alt="" width={64} height={80} loading="lazy" />
              ) : (
                <span className="pa-thumb pa-thumb-empty" aria-hidden="true">
                  <Icon id="gift" />
                </span>
              )}
              <div className="pa-list-info">
                <button type="button" className="pa-list-name" onClick={() => onEdit(p)}>
                  {p.name}
                </button>
                <span className="pa-list-meta">
                  {categoryName(p.category)} · {priceLabel(p)}
                </span>
                <span className="pa-list-badges">
                  {p.hidden && <span className="badge badge-muted">Hidden</span>}
                  {!p.hidden && reason === null && <span className="badge pa-badge-ok">On sale</span>}
                  {!p.hidden && reason !== null && <span className="badge">{p.stockStatus === 'out_of_stock' ? 'Sold out' : 'Ask about this'}</span>}
                  {p.images.length === 0 && <span className="badge badge-muted">No photo</span>}
                  {p.featured && <span className="badge badge-gift">Home page</span>}
                </span>
              </div>
              <div className="pa-list-actions">
                <button type="button" className="icon-button" disabled={busy || filtering || index === 0} onClick={() => onMove(p, -1)} aria-label={`Move ${p.name} earlier`}>
                  <span className="pa-up">
                    <Icon id="chevron" />
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy || filtering || index === state.products.length - 1}
                  onClick={() => onMove(p, 1)}
                  aria-label={`Move ${p.name} later`}
                >
                  <span className="pa-down">
                    <Icon id="chevron" />
                  </span>
                </button>
                <button type="button" className="button button-small button-ghost" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                  Edit
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="pa-empty">No products match.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Editor

function Editor({
  api,
  state,
  originalId,
  initial,
  onState,
  onSaved,
  onDeleted,
  onBack,
  onCopy,
  onDirty,
}: {
  api: AdminApi;
  state: AdminState;
  originalId: string | null;
  initial: Product;
  onState: (state: AdminState) => void;
  onSaved: (state: AdminState, savedId: string) => void;
  onDeleted: (state: AdminState) => void;
  onBack: () => void;
  onCopy: (p: Product) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [p, setP] = useState<Product>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [flameOpen, setFlameOpen] = useState<string | null>(null);
  const [lit, setLit] = useState(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const savedJson = useMemo(() => JSON.stringify(initial), [initial]);
  const dirty = JSON.stringify(p) !== savedJson;

  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  const set = (patch: Partial<Product>) => {
    setP((prev) => ({ ...prev, ...patch }));
    // Once a field is edited, its old error message no longer applies.
    const keys = Object.keys(patch);
    setErrors((prev) => (prev.length ? prev.filter((e) => !keys.some((k) => e.field === k || e.field.startsWith(`${k}.`))) : prev));
  };
  const err = (field: string) => errors.find((e) => e.field === field)?.message;

  const isNew = originalId === null;
  const showFlame = p.effects.flame ?? p.type === 'candle';
  const categoryName = state.categories.find((c) => c.id === p.category)?.name ?? '';
  const reason = notBuyableReason(p);

  const setImage = (index: number, patch: Partial<ProductImage>) =>
    set({ images: p.images.map((img, i) => (i === index ? { ...img, ...patch } : img)) });
  const moveImage = (index: number, by: -1 | 1) => {
    const images = [...p.images];
    const [item] = images.splice(index, 1);
    images.splice(index + by, 0, item);
    set({ images });
  };
  const addImage = (file: string) =>
    setP((prev) =>
      prev.images.some((i) => i.file === file)
        ? prev
        : { ...prev, images: [...prev.images, { file, alt: prev.name ? `${prev.name} photo` : '', source: null, flame: null }] },
    );
  const toggleImage = (file: string) =>
    setP((prev) =>
      prev.images.some((i) => i.file === file)
        ? { ...prev, images: prev.images.filter((i) => i.file !== file) }
        : { ...prev, images: [...prev.images, { file, alt: prev.name ? `${prev.name} photo` : '', source: null, flame: null }] },
    );

  const setVariant = (index: number, patch: Partial<Variant>) => set({ variants: p.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) });
  const setOption = (index: number, patch: Partial<ProductOption>) => set({ options: p.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) });

  const save = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const result = await api.save(p, originalId);
      onSaved(result.state, result.savedId);
    } catch (e) {
      setErrors(e instanceof AdminError ? e.errors : [{ field: 'general', message: 'Saving failed. Please try again.' }]);
      window.setTimeout(() => errorBox.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!originalId) return;
    if (!window.confirm(`Delete "${initial.name}" for good? Tip: "Show on the website" off hides it without deleting.`)) return;
    setBusy(true);
    try {
      onDeleted(await api.remove(originalId));
    } catch (e) {
      setErrors(e instanceof AdminError ? e.errors : [{ field: 'general', message: 'Deleting failed. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  const stockOptions = state.stockStatuses.map((s) => ({ value: s.id, label: s.label }));

  return (
    <form
      className="pa-editor"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="pa-editor-head">
        <button type="button" className="text-button" onClick={onBack}>
          <span className="pa-back">
            <Icon id="arrow" />
          </span>{' '}
          All products
        </button>
        <h2>{isNew ? 'New product' : initial.name}</h2>
      </div>

      {errors.length > 0 && (
        <div className="pa-errors" role="alert" tabIndex={-1} ref={errorBox}>
          <strong>{errors.some((e) => e.field === 'session') ? 'Not saved' : `Not saved yet. Please fix ${errors.length === 1 ? 'this' : `these ${errors.length} things`}:`}</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>
                {e.message}
                {e.field === 'session' && (
                  <>
                    {' '}
                    <a href="/admin/login?returnUrl=/admin/products" target="_blank" rel="noopener">
                      Log in (opens a new tab)
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pa-editor-grid">
        <div className="pa-editor-main">
          <Section title="Basics">
            <TextField label="Name" value={p.name} onChange={(name) => set({ name })} error={err('name')} maxLength={120} />
            <div className="form-row">
              <SelectField
                label="Category"
                value={p.category}
                onChange={(category) => set({ category })}
                options={state.categories.map((c) => ({ value: c.id, label: c.name }))}
                error={err('category')}
              />
              <SelectField
                label="Kind of product"
                value={p.type}
                onChange={(type) => set({ type })}
                options={state.types.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
                hint="Candles get the burning-wick effect unless you switch it off below."
                error={err('type')}
              />
            </div>
            <TextField
              label="Short description"
              value={p.shortDescription}
              onChange={(shortDescription) => set({ shortDescription })}
              hint="One sentence, shown on the product card and in Google."
              error={err('shortDescription')}
              maxLength={200}
            />
            <TextField
              label="Full description"
              value={p.description}
              onChange={(description) => set({ description })}
              hint="Shown on the product's own page."
              error={err('description')}
              maxLength={4000}
              multiline
            />
            <Toggle
              label="Show on the website"
              hint={p.hidden ? 'Hidden: saved here, but customers cannot see or buy it.' : 'Customers can see this product.'}
              checked={!p.hidden}
              onChange={(on) => set({ hidden: !on })}
            />
          </Section>

          <Section title="Price and availability" intro="Prices are in euro. Leave the price empty if it isn't decided: customers then see “Ask about this”.">
            <div className="form-row">
              <NumberField label="Price" prefix="€" step={0.01} value={p.priceEur} onChange={(priceEur) => set({ priceEur })} error={err('priceEur')} />
              <NumberField
                label="Old price (for an offer)"
                prefix="€"
                step={0.01}
                value={p.compareAtPriceEur}
                onChange={(compareAtPriceEur) => set({ compareAtPriceEur })}
                hint="Shown crossed out next to the price."
                error={err('compareAtPriceEur')}
              />
            </div>
            <div className="form-row">
              <SelectField
                label="Availability"
                value={p.stockStatus}
                onChange={(stockStatus) => set({ stockStatus })}
                options={stockOptions}
                hint="“Sold out” and “Ask about this” stop online orders."
                error={err('stockStatus')}
              />
              <TextField
                label="Price note (when there is no price)"
                value={p.priceNote}
                onChange={(priceNote) => set({ priceNote: priceNote || null })}
                placeholder="e.g. €15–€20"
                error={err('priceNote')}
                maxLength={60}
              />
            </div>
          </Section>

          <Section title="Photos" intro="The first photo is the one on the product card. Add as many as you like.">
            {errors
              .filter((e) => e.field === 'images')
              .map((e, i) => (
                <p key={i} className="field-error" role="alert">
                  {e.message}
                </p>
              ))}
            {p.images.length === 0 && <p className="pa-empty">No photos yet.</p>}
            <ul className="pa-photos">
              {p.images.map((img, i) => (
                <li key={img.file}>
                  <div className="pa-photo-row">
                    <img src={imageUrl(img.file)} alt="" width={96} height={120} />
                    <div className="pa-photo-fields">
                      <TextField
                        label={i === 0 ? 'Describe this photo (main photo)' : 'Describe this photo'}
                        value={img.alt}
                        onChange={(alt) => setImage(i, { alt })}
                        hint="A few words for blind visitors and Google, e.g. “Pink candle in a ceramic cup”."
                        error={err(`images.${i}.alt`) ?? err(`images.${i}`)}
                        maxLength={200}
                      />
                      <div className="pa-row">
                        <button type="button" className="button button-small button-ghost" disabled={i === 0} onClick={() => moveImage(i, -1)}>
                          Move earlier
                        </button>
                        <button type="button" className="button button-small button-ghost" disabled={i === p.images.length - 1} onClick={() => moveImage(i, 1)}>
                          Move later
                        </button>
                        {showFlame && (
                          <button
                            type="button"
                            className="button button-small button-ghost"
                            aria-expanded={flameOpen === img.file}
                            onClick={() => setFlameOpen(flameOpen === img.file ? null : img.file)}
                          >
                            <Icon id="flame" /> {img.flame ? 'Move the flame' : 'Place the flame'}
                          </button>
                        )}
                        <button type="button" className="text-button pa-danger" onClick={() => set({ images: p.images.filter((_, j) => j !== i) })}>
                          <Icon id="trash" /> Take off
                        </button>
                      </div>
                    </div>
                  </div>
                  {showFlame && flameOpen === img.file && <FlameEditor image={img} onChange={(flame) => setImage(i, { flame })} />}
                </li>
              ))}
            </ul>
            <button type="button" className="button button-outline" onClick={() => setLibraryOpen(true)}>
              <Icon id="plus" /> Add or upload photos
            </button>
          </Section>

          <Section title="Animations" intro="How this product's card behaves in the shop. Visitors who ask for less motion always get a calm version.">
            <Toggle
              label="Light the candle"
              hint="A flame lights when a customer hovers over the card (or scrolls to it on a phone) and goes out with a wisp of smoke."
              checked={showFlame}
              onChange={(on) => set({ effects: { ...p.effects, flame: on === (p.type === 'candle') ? null : on } })}
            />
            {showFlame && (
              <p className="pa-hint">
                {p.images.length === 0
                  ? 'Add a photo, then use “Place the flame” to put the flame on the wick.'
                  : p.images[0].flame
                    ? 'The flame is placed on the main photo. Use “Move the flame” next to a photo to adjust its position and size.'
                    : 'The flame sits just below the photo. Use “Place the flame” next to the photo to put it on the wick.'}
              </p>
            )}
            <Toggle
              label="Tilt and spotlight"
              hint="The card tilts slightly and a soft light follows the mouse."
              checked={p.effects.tilt}
              onChange={(tilt) => set({ effects: { ...p.effects, tilt } })}
            />
            <Toggle
              label="Gift box reveal"
              hint="Shows this product in the “Gift sets” part of the home page, which opens with the ribbon animation. Also adds a “Gift set” label."
              checked={p.giftSet}
              onChange={(giftSet) => set({ giftSet })}
            />
          </Section>

          <Section title="Scent and details" intro="Only fill in what you know. Empty boxes are simply not shown.">
            <ListField
              label="Scent words"
              values={p.scent.tags}
              onChange={(tags) => set({ scent: { ...p.scent, tags } })}
              placeholder="e.g. Warm cinnamon"
              hint="Shown as animated tags. Press Enter after each one."
              error={err('scent.tags')}
            />
            <div className="pa-three">
              <ListField label="Top notes" values={p.scent.top} onChange={(top) => set({ scent: { ...p.scent, top } })} error={err('scent.top')} />
              <ListField label="Heart notes" values={p.scent.heart} onChange={(heart) => set({ scent: { ...p.scent, heart } })} error={err('scent.heart')} />
              <ListField label="Base notes" values={p.scent.base} onChange={(base) => set({ scent: { ...p.scent, base } })} error={err('scent.base')} />
            </div>
            <div className="form-row">
              <TextField label="Wax" value={p.wax} onChange={(wax) => set({ wax: wax || null })} placeholder="e.g. Soy wax" error={err('wax')} maxLength={80} />
              <TextField label="Container" value={p.vessel} onChange={(vessel) => set({ vessel: vessel || null })} placeholder="e.g. Glass jar with bamboo lid" error={err('vessel')} maxLength={80} />
            </div>
            <div className="pa-three">
              <TextField label="Size" value={p.size} onChange={(size) => set({ size: size || null })} placeholder="e.g. 8 × 9 cm" error={err('size')} maxLength={80} />
              <NumberField label="Weight (grams)" value={p.weightGrams} onChange={(weightGrams) => set({ weightGrams })} error={err('weightGrams')} />
              <NumberField label="Burn time (hours)" value={p.burnTimeHours} onChange={(burnTimeHours) => set({ burnTimeHours })} error={err('burnTimeHours')} />
            </div>
            <ListField
              label="What's inside (for boxes and sets)"
              values={p.contents}
              onChange={(contents) => set({ contents })}
              placeholder="e.g. 1 scented candle"
              error={err('contents')}
              long
            />
          </Section>

          <Section title="Versions" intro="Use versions when the same product comes in colours or sizes. Each can have its own price and availability.">
            {errors
              .filter((e) => e.field === 'variants')
              .map((e, i) => (
                <p key={i} className="field-error" role="alert">
                  {e.message}
                </p>
              ))}
            <ul className="pa-cards">
              {p.variants.map((v, i) => (
                <li key={i}>
                  <div className="form-row">
                    <TextField label="Version name" value={v.name} onChange={(name) => setVariant(i, { name })} placeholder="e.g. Pink" error={err(`variants.${i}.name`)} maxLength={60} />
                    <NumberField
                      label="Price (empty = product price)"
                      prefix="€"
                      step={0.01}
                      value={v.priceEur}
                      onChange={(priceEur) => setVariant(i, { priceEur })}
                      error={err(`variants.${i}.priceEur`)}
                    />
                  </div>
                  <div className="form-row">
                    <SelectField
                      label="Availability"
                      value={v.stockStatus ?? ''}
                      onChange={(s) => setVariant(i, { stockStatus: s || null })}
                      options={[{ value: '', label: 'Same as the product' }, ...stockOptions]}
                      error={err(`variants.${i}.stockStatus`)}
                    />
                    <div className="form-group">
                      <span className="pa-label">Colour dot</span>
                      <span className="pa-row">
                        <label className="check pa-check-inline">
                          <input type="checkbox" checked={v.swatch !== null} onChange={(e) => setVariant(i, { swatch: e.target.checked ? '#f4b6be' : null })} />
                          <span>Show a colour</span>
                        </label>
                        {v.swatch !== null && (
                          <input type="color" value={v.swatch} aria-label={`Colour for ${v.name || 'this version'}`} onChange={(e) => setVariant(i, { swatch: e.target.value })} />
                        )}
                      </span>
                      {err(`variants.${i}.swatch`) && <p className="field-error">{err(`variants.${i}.swatch`)}</p>}
                    </div>
                  </div>
                  <details className="pa-more">
                    <summary>Payment link and SKU</summary>
                    <TextField
                      label="Payment link for this version"
                      type="url"
                      value={v.paymentLink}
                      onChange={(paymentLink) => setVariant(i, { paymentLink: paymentLink || null })}
                      placeholder="https://"
                      error={err(`variants.${i}.paymentLink`)}
                    />
                    <TextField label="SKU (made for you if empty)" value={v.sku} onChange={(sku) => setVariant(i, { sku })} error={err(`variants.${i}.sku`)} maxLength={40} />
                  </details>
                  <button type="button" className="text-button pa-danger" onClick={() => set({ variants: p.variants.filter((_, j) => j !== i) })}>
                    <Icon id="trash" /> Remove this version
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button-small button-ghost"
              onClick={() => set({ variants: [...p.variants, { id: '', sku: '', name: '', swatch: null, priceEur: null, stockStatus: null, paymentLink: null }] })}
            >
              <Icon id="plus" /> Add a version
            </button>
          </Section>

          <Section title="Questions for the customer" intro="Things the customer chooses or types when ordering, like which wine goes in the box or a name to add.">
            {errors
              .filter((e) => e.field === 'options')
              .map((e, i) => (
                <p key={i} className="field-error" role="alert">
                  {e.message}
                </p>
              ))}
            <ul className="pa-cards">
              {p.options.map((o, i) => (
                <li key={i}>
                  <div className="form-row">
                    <TextField label="Question" value={o.label} onChange={(label) => setOption(i, { label })} placeholder="e.g. Choose your wine" error={err(`options.${i}.label`)} maxLength={80} />
                    <SelectField
                      label="How they answer"
                      value={o.type}
                      onChange={(type) => setOption(i, { type: type as 'select' | 'text' })}
                      options={[
                        { value: 'select', label: 'Pick from a list' },
                        { value: 'text', label: 'Type an answer' },
                      ]}
                      error={err(`options.${i}.type`)}
                    />
                  </div>
                  {o.type === 'select' ? (
                    <ListField label="Answers to pick from" values={o.values} onChange={(values) => setOption(i, { values })} placeholder="e.g. Red wine" error={err(`options.${i}.values`)} long />
                  ) : (
                    <div className="form-row">
                      <NumberField label="Longest answer (characters)" value={o.maxLength} min={1} onChange={(n) => setOption(i, { maxLength: n ?? 120 })} error={err(`options.${i}.maxLength`)} />
                      <TextField label="Hint inside the box" value={o.placeholder} onChange={(placeholder) => setOption(i, { placeholder: placeholder || null })} error={err(`options.${i}.placeholder`)} maxLength={120} />
                    </div>
                  )}
                  <label className="check">
                    <input type="checkbox" checked={o.required} onChange={(e) => setOption(i, { required: e.target.checked })} />
                    <span>The customer must answer this</span>
                  </label>
                  <button type="button" className="text-button pa-danger" onClick={() => set({ options: p.options.filter((_, j) => j !== i) })}>
                    <Icon id="trash" /> Remove this question
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button-small button-ghost"
              onClick={() => set({ options: [...p.options, { id: '', label: '', type: 'select', required: true, values: [], maxLength: 120, placeholder: null }] })}
            >
              <Icon id="plus" /> Add a question
            </button>
          </Section>

          <Section title="Where it appears">
            <Toggle label="Show on the home page" hint="Adds it to “Featured collection”." checked={p.featured} onChange={(featured) => set({ featured })} />
            <fieldset className="pa-checks">
              <legend className="pa-label">Gift guide</legend>
              {state.guides.map((g) =>
                g.maxPriceEur != null ? (
                  <p key={g.id} className="pa-hint">
                    {g.name}: added by itself when the product can be bought for {money(g.maxPriceEur)} or less.
                  </p>
                ) : (
                  <label key={g.id} className="check">
                    <input
                      type="checkbox"
                      checked={p.guides.includes(g.id)}
                      onChange={(e) => set({ guides: e.target.checked ? [...p.guides, g.id] : p.guides.filter((x) => x !== g.id) })}
                    />
                    <span>{g.name}</span>
                  </label>
                ),
              )}
            </fieldset>
            <Toggle
              label="Contains alcohol"
              hint="Customers must confirm they are old enough before ordering."
              checked={p.containsAlcohol}
              onChange={(containsAlcohol) => set({ containsAlcohol })}
            />
          </Section>

          <Section title="Private notes" intro="Only you see these.">
            <ListField label="Things still to do or check" values={p.todo} onChange={(todo) => set({ todo })} placeholder="e.g. Confirm burn time" error={err('todo')} long />
            <TextField label="Where the details came from" value={p.instagramSource} onChange={(v) => set({ instagramSource: v || null })} error={err('instagramSource')} maxLength={300} />
          </Section>

          <details className="pa-section pa-more">
            <summary>
              <h3>Advanced: payment links, web address, SKU</h3>
            </summary>
            <TextField
              label="Payment link"
              type="url"
              value={p.paymentLink}
              onChange={(v) => set({ paymentLink: v || null })}
              placeholder="https://"
              hint="Only for “one payment link per product” providers. See INTEGRATION.md."
              error={err('paymentLink')}
            />
            <TextField
              label="“Buy now” link"
              type="url"
              value={p.checkoutUrl}
              onChange={(v) => set({ checkoutUrl: v || null })}
              placeholder="https://"
              hint="Only used when “Buy now” buttons are switched on in the site settings."
              error={err('checkoutUrl')}
            />
            <TextField
              label="Web address"
              value={p.slug}
              onChange={(slug) => set({ slug })}
              hint={`The page will be /products/${p.slug || '…'}. Made from the name if empty. Changing it breaks old links.`}
              error={err('slug')}
              maxLength={60}
            />
            <TextField label="SKU (stock code)" value={p.sku} onChange={(sku) => set({ sku })} hint="Made for you if empty." error={err('sku')} maxLength={40} />
            <TextField
              label="ID"
              value={p.id}
              onChange={(id) => set({ id })}
              disabled={!isNew}
              hint={isNew ? 'Made from the name if empty. It can never change afterwards.' : 'Cannot be changed: orders and carts refer to it.'}
              error={err('id')}
              maxLength={60}
            />
            <ListField
              label="Old names"
              values={p.legacyNames}
              onChange={(legacyNames) => set({ legacyNames })}
              hint="Names this product had before, so old saved carts still find it."
              error={err('legacyNames')}
              long
            />
          </details>

          {!isNew && (
            <div className="pa-row pa-danger-zone">
              <button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => onCopy(p)}>
                Make a copy
              </button>
              <button type="button" className="button button-small button-ghost pa-danger" disabled={busy} onClick={remove}>
                <Icon id="trash" /> Delete this product
              </button>
            </div>
          )}
        </div>

        <aside className="pa-editor-side" aria-label="Preview">
          <h3>Preview</h3>
          <CardPreview product={p} categoryName={categoryName} showFlame={showFlame} lit={lit} onLit={setLit} />
          {showFlame && (
            <button type="button" className="button button-small button-ghost" aria-pressed={lit} onClick={() => setLit(!lit)}>
              <Icon id="flame" /> {lit ? 'Blow it out' : 'Light it'}
            </button>
          )}
          <p className={`pa-status${reason === null ? ' is-ok' : ''}`}>
            <Icon id={reason === null ? 'check' : 'info'} />
            <span>{reason ?? 'Customers can buy this online.'}</span>
          </p>
          {!isNew && !initial.hidden && (
            <a className="text-link" href={`/products/${initial.slug}`} target="_blank" rel="noopener">
              See the saved page (opens a new tab)
            </a>
          )}
        </aside>
      </div>

      <div className="pa-savebar">
        <span className="pa-savebar-state" role="status">
          {busy ? 'Working…' : dirty ? 'You have unsaved changes' : isNew ? 'Not saved yet' : 'All changes saved'}
        </span>
        <button type="button" className="button button-ghost" disabled={busy} onClick={onBack}>
          {dirty ? 'Discard' : 'Back'}
        </button>
        <button type="submit" className="button" disabled={busy || (!dirty && !isNew)}>
          {busy ? 'Saving…' : isNew ? 'Add product' : 'Save changes'}
        </button>
      </div>

      {libraryOpen && (
        <PhotoLibrary
          api={api}
          images={state.images}
          selected={p.images.map((i) => i.file)}
          nameHint={p.name}
          maxUploadBytes={state.maxUploadBytes}
          onState={onState}
          onToggle={toggleImage}
          onUploaded={addImage}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </form>
  );
}

// ---------------------------------------------------------------- Root

function ProductAdmin({ api }: { api: AdminApi }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: number; originalId: string | null; product: Product } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);
  const keyRef = useRef(0);

  useEffect(() => {
    api
      .load()
      .then(setState)
      .catch((e) => setLoadError(e instanceof AdminError ? e.message : 'The products could not be loaded. Please refresh the page.'));
  }, [api]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const open = (product: Product, originalId: string | null) => {
    keyRef.current += 1;
    dirtyRef.current = false;
    setNotice(null);
    setEditing({ key: keyRef.current, originalId, product });
    window.scrollTo({ top: 0 });
  };

  const close = () => {
    dirtyRef.current = false;
    setEditing(null);
    window.scrollTo({ top: 0 });
  };

  if (loadError) {
    return (
      <p className="form-message" role="alert">
        {loadError} <a href="/admin/login?returnUrl=/admin/products">Log in again</a>
      </p>
    );
  }
  if (!state) return <p className="pa-loading">Loading the product editor…</p>;

  if (editing) {
    return (
      <Editor
        key={editing.key}
        api={api}
        state={state}
        originalId={editing.originalId}
        initial={editing.product}
        onState={setState}
        onDirty={(d) => (dirtyRef.current = d)}
        onBack={() => {
          if (dirtyRef.current && !window.confirm('Leave without saving your changes?')) return;
          close();
        }}
        onSaved={(next, savedId) => {
          setState(next);
          const saved = next.products.find((x) => x.id === savedId);
          setNotice(saved ? `Saved “${saved.name}”. The website is updated.` : 'Saved.');
          close();
        }}
        onDeleted={(next) => {
          setState(next);
          setNotice('Product deleted.');
          close();
        }}
        onCopy={(p) => {
          if (dirtyRef.current && !window.confirm('Copy this product? Unsaved changes to the original will be lost.')) return;
          open({ ...p, id: '', slug: '', sku: '', name: `${p.name} (copy)`, legacyNames: [], variants: p.variants.map((v) => ({ ...v, sku: '' })), hidden: true }, null);
        }}
      />
    );
  }

  return (
    <>
      {notice && (
        <p className="pa-ok" role="status">
          <Icon id="check" /> {notice}
        </p>
      )}
      <ProductList
        state={state}
        busy={busy}
        exportUrl={api.exportUrl}
        onEdit={(p) => open(p, p.id)}
        onAdd={() => open(blankProduct(state.categories[0]?.id ?? ''), null)}
        onMove={async (p, direction) => {
          setBusy(true);
          setNotice(null);
          try {
            setState(await api.move(p.id, direction));
          } catch (e) {
            setNotice(e instanceof AdminError ? e.message : 'Could not move the product.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

export function mount(el: HTMLElement): void {
  const api = new AdminApi(el.dataset.endpoint ?? '/admin/products', el.dataset.token ?? '');
  el.replaceChildren();
  createRoot(el).render(<ProductAdmin api={api} />);
}
