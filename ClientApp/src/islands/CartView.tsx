// Shared cart contents for the cart drawer and the /cart page.
import { useSyncExternalStore } from 'react';
import CountUp from '../reactbits/CountUp';
import { cart, MAX_QTY, type ResolvedLine } from '../lib/cart';
import { money, prefersReducedMotion } from '../lib/util';

export function useCart(): ResolvedLine[] {
  useSyncExternalStore(cart.subscribe, cart.lines, cart.lines);
  return cart.resolve();
}

function Icon({ id }: { id: string }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#i-${id}`} />
    </svg>
  );
}

function Line({ line, compact }: { line: ResolvedLine; compact: boolean }) {
  const label = `${line.name}${line.detail ? ` (${line.detail})` : ''}`;
  return (
    <li className={`cart-line${line.available ? '' : ' is-unavailable'}`}>
      {line.image ? (
        <img className="cart-line-img" src={line.image} alt="" width={80} height={100} loading="lazy" />
      ) : (
        <span className="cart-line-img media-placeholder">
          <Icon id="gift" />
        </span>
      )}
      <div className="cart-line-info">
        {line.url ? <a href={line.url} className="cart-line-name">{line.name}</a> : <span className="cart-line-name">{line.name}</span>}
        {line.detail && <small>{line.detail}</small>}
        {line.available ? (
          <small>{money(line.unitPrice)} each</small>
        ) : (
          <small className="cart-line-warning">{line.reason ?? 'No longer available online. Please remove it.'}</small>
        )}
        <div className="cart-line-controls">
          {line.available && (
            <div className="qty qty-small">
              <button type="button" className="qty-btn" aria-label={`Decrease quantity of ${label}`}
                onClick={() => cart.setQuantity(line.key, line.quantity - 1)}>
                <Icon id="minus" />
              </button>
              <span className="qty-live" aria-live="polite" aria-atomic="true">
                <span className="visually-hidden">Quantity of {label}: </span>
                <span className="qty-value">{line.quantity}</span>
              </span>
              <button type="button" className="qty-btn" aria-label={`Increase quantity of ${label}`}
                disabled={line.quantity >= MAX_QTY} onClick={() => cart.setQuantity(line.key, line.quantity + 1)}>
                <Icon id="plus" />
              </button>
            </div>
          )}
          <button type="button" className="text-button" onClick={() => cart.remove(line.key)} aria-label={`Remove ${label}`}>
            <Icon id="trash" />
            {!compact && <span>Remove</span>}
          </button>
        </div>
      </div>
      <span className="cart-line-total">{line.available ? money(line.total) : '–'}</span>
    </li>
  );
}

export function CartView({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const lines = useCart();
  const available = lines.filter((l) => l.available);
  const subtotal = available.reduce((s, l) => s + l.total, 0);
  const blocked = lines.some((l) => !l.available);

  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <Icon id="bag" />
        <p>Your cart is empty.</p>
        <a className="button" href="/shop" onClick={onNavigate}>Discover our candles</a>
      </div>
    );
  }

  return (
    <div className={`cart-view${compact ? ' is-compact' : ''}`}>
      <ul className="cart-lines">
        {lines.map((l) => (
          <Line key={l.key} line={l} compact={compact} />
        ))}
      </ul>
      <div className="cart-summary">
        <p className="cart-subtotal">
          <span>Subtotal</span>
          <strong>
            <span className="visually-hidden">{money(subtotal)}</span>
            <span aria-hidden="true">
              {prefersReducedMotion() ? money(subtotal) : <CountUp to={subtotal} from={subtotal} decimals={2} prefix="€" separator="," duration={0.5} trigger="load" />}
            </span>
          </strong>
        </p>
        <p className="cart-note">
          <Icon id="gift" /> Delivery, gift wrapping and gift messages are added at checkout.
        </p>
        {blocked && <p className="form-message" role="alert">Remove unavailable items to continue.</p>}
        <a className={`button button-large button-block${blocked ? ' is-disabled' : ''}`} href="/checkout"
          aria-disabled={blocked || undefined} onClick={(e) => blocked && e.preventDefault()}>
          <Icon id="lock" /> Proceed to checkout
        </a>
        <a className="text-link" href="/shop" onClick={onNavigate}>Continue shopping</a>
      </div>
    </div>
  );
}
