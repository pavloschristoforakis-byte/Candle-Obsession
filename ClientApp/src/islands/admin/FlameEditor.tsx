// Live previews for the admin product editor. They reuse the shop's real card and flame styles
// (wwwroot/css/site.css), so what the owner sees here is what customers get.
import { useEffect, useRef, type CSSProperties } from 'react';
import { money, prefersReducedMotion } from '../../lib/util';
import { imageUrl, type FlamePoint, type Product, type ProductImage } from './api';
import { Icon, Toggle } from './fields';

/** Same markup as Pages/Shared/_Flame.cshtml. */
function Flame() {
  return (
    <span className="wick-flame" aria-hidden="true">
      <span className="flame">
        <span className="flame-outer" />
        <span className="flame-inner" />
        <span className="flame-core" />
      </span>
      <span className="wick" />
      <svg className="smoke" viewBox="0 0 40 120" focusable="false">
        <path d="M20 118 C 9 96, 31 84, 19 63 S 11 28, 23 2" />
        <path d="M21 118 C 30 98, 12 86, 23 66 S 30 34, 17 8" />
      </svg>
    </span>
  );
}

/** Random flicker while `lit`, like ClientApp/src/effects/flame.ts does for the shop's cards. */
function useFlicker(lit: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !lit || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      const r = (min: number, max: number) => min + Math.random() * (max - min);
      node.style.setProperty('--flicker-scale', r(0.92, 1.08).toFixed(3));
      node.style.setProperty('--flicker-rot', `${r(-3.5, 3.5).toFixed(2)}deg`);
      node.style.setProperty('--flicker-x', `${r(-1, 1).toFixed(2)}px`);
      node.style.setProperty('--flicker-glow', r(0.78, 1).toFixed(3));
    }, 110);
    return () => {
      window.clearInterval(timer);
      for (const v of ['--flicker-scale', '--flicker-rot', '--flicker-x', '--flicker-glow']) node.style.removeProperty(v);
    };
  }, [lit]);
  return ref;
}

const flameVars = (flame: FlamePoint): CSSProperties =>
  ({ '--flame-x': `${flame.x * 100}%`, '--flame-y': `${flame.y * 100}%`, '--flame-scale': String(flame.size) }) as CSSProperties;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Lets the owner put the flame on the wick of one photo: click or drag on the photo, or use the sliders. */
export function FlameEditor({ image, onChange }: { image: ProductImage; onChange: (flame: FlamePoint | null) => void }) {
  const flame = image.flame;
  const ref = useFlicker(flame !== null);
  const dragging = useRef(false);

  const place = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!flame) return;
    const r = e.currentTarget.getBoundingClientRect();
    onChange({ ...flame, x: Math.round(clamp01((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(clamp01((e.clientY - r.top) / r.height) * 1000) / 1000 });
  };

  return (
    <div className="pa-flame">
      <Toggle
        label="The wick is visible in this photo"
        hint={flame ? 'Tap the photo where the wick is, or use the sliders.' : 'Off: the flame appears just below the photo instead.'}
        checked={flame !== null}
        onChange={(on) => onChange(on ? { x: 0.5, y: 0.3, size: 1 } : null)}
      />
      {flame && (
        <div className="pa-flame-grid">
          <div ref={ref} className="product-card is-candle is-lit pa-flame-card" style={flameVars(flame)}>
            <div
              className="product-media pa-flame-media"
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                place(e);
              }}
              onPointerMove={(e) => dragging.current && place(e)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
            >
              <img src={imageUrl(image.file, 800)} alt="" width={800} height={1000} draggable={false} />
              <Flame />
            </div>
          </div>
          <div className="pa-flame-sliders">
            <label className="pa-range">
              <span>Left – right</span>
              <input type="range" min={0} max={1} step={0.005} value={flame.x} onChange={(e) => onChange({ ...flame, x: Number(e.target.value) })} />
            </label>
            <label className="pa-range">
              <span>Up – down</span>
              <input type="range" min={0} max={1} step={0.005} value={flame.y} onChange={(e) => onChange({ ...flame, y: Number(e.target.value) })} />
            </label>
            <label className="pa-range">
              <span>Flame size</span>
              <input type="range" min={0.4} max={2.5} step={0.05} value={flame.size} onChange={(e) => onChange({ ...flame, size: Number(e.target.value) })} />
            </label>
            <p className="pa-hint">The flame is shown lit here. In the shop it lights when a customer hovers over the card, or scrolls to it on a phone.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** What the product card will look like in the shop. Hover (or focus) lights the candle, as it does for customers. */
export function CardPreview({
  product,
  categoryName,
  showFlame,
  lit,
  onLit,
}: {
  product: Product;
  categoryName: string;
  showFlame: boolean;
  lit: boolean;
  onLit: (lit: boolean) => void;
}) {
  const image = product.images[0];
  const flame = image?.flame ?? null;
  const isLit = showFlame && lit;
  const ref = useFlicker(isLit);
  const buyable = product.variants.length
    ? product.variants.filter((v) => (v.priceEur ?? product.priceEur ?? 0) > 0 && ['in_stock', 'low_stock', 'made_to_order'].includes(v.stockStatus ?? product.stockStatus))
    : (product.priceEur ?? 0) > 0 && ['in_stock', 'low_stock', 'made_to_order'].includes(product.stockStatus)
      ? [null]
      : [];
  const prices = product.variants.length ? (buyable as { priceEur: number | null }[]).map((v) => v.priceEur ?? product.priceEur ?? 0) : [product.priceEur ?? 0];
  const price = buyable.length ? Math.min(...prices) : null;
  const soldOut = product.variants.length
    ? product.variants.every((v) => (v.stockStatus ?? product.stockStatus) === 'out_of_stock')
    : product.stockStatus === 'out_of_stock';

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Preview of the ${product.name || 'new product'} card in the shop`}
      className={`product-card pa-preview-card${showFlame ? ' is-candle' : ''}${showFlame && !flame ? ' flame-default' : ''}${isLit ? ' is-lit' : ''}`}
      style={flame ? flameVars(flame) : undefined}
      onPointerEnter={() => onLit(true)}
      onPointerLeave={() => onLit(false)}
    >
      <div className="product-media">
        {image ? (
          <img src={imageUrl(image.file, 800)} alt="" width={800} height={1000} />
        ) : (
          <span className="media-placeholder">
            <Icon id="gift" />
            <span>Photo coming soon</span>
          </span>
        )}
        {showFlame && flame && <Flame />}
      </div>
      <div className="product-body">
        {showFlame && !flame && <Flame />}
        <ul className="product-badges">
          {soldOut && <li className="badge badge-muted">Sold out</li>}
          {!soldOut && price === null && <li className="badge">Ask about this</li>}
          {product.giftSet && <li className="badge badge-gift">Gift set</li>}
          {product.compareAtPriceEur !== null && <li className="badge badge-sale">Offer</li>}
        </ul>
        <p className="product-category">{categoryName}</p>
        <p className="product-title">{product.name || 'Product name'}</p>
        <p className="product-scent">{product.scent.tags.length ? product.scent.tags.slice(0, 3).join(' · ') : product.shortDescription}</p>
        <div className="product-foot">
          <p className="price">
            {price !== null ? (
              <>
                {new Set(prices).size > 1 && <span className="price-from">from</span>}
                <span>{money(price)}</span>
                {product.compareAtPriceEur !== null && <s className="price-was">{money(product.compareAtPriceEur)}</s>}
              </>
            ) : product.priceNote ? (
              <span>{product.priceNote}</span>
            ) : (
              <span className="price-request">Price on request</span>
            )}
          </p>
          <span className={`button button-small${price !== null && !product.variants.length && !product.options.length ? '' : ' button-ghost'}`}>
            {price === null ? 'Details' : product.variants.length || product.options.length ? 'Choose options' : 'Add to cart'}
          </span>
        </div>
      </div>
    </div>
  );
}
