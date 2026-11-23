// Wires the server-rendered pages to the cart: header badge, "Add to cart" buttons, the product
// detail form, toasts, and clearing the cart after a completed order.
import { cart, MAX_QTY } from '../lib/cart';
import { findProduct } from '../lib/catalog';
import { money, el } from '../lib/util';
import { flyEmber } from '../effects/ember';

// ---------- header badge ----------
function renderBadge(): void {
  const count = cart.count();
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((badge) => {
    badge.textContent = String(count);
    badge.classList.toggle('is-empty', count === 0);
  });
  document.querySelectorAll<HTMLElement>('[data-cart-open]').forEach((link) => {
    link.setAttribute('aria-label', `Shopping cart, ${count} ${count === 1 ? 'item' : 'items'}`);
  });
}

// ---------- toast (polite live region) ----------
let toastTimer = 0;
export function toast(message: string, action?: { label: string; href: string }): void {
  let region = document.getElementById('toast');
  if (!region) {
    region = el('div', { id: 'toast', className: 'toast' });
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  region.replaceChildren(el('span', {}, message));
  if (action) region.append(el('a', { href: action.href, className: 'toast-action' }, action.label));
  region.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => region!.classList.remove('is-visible'), 3200);
}

function added(button: Element, name: string): void {
  flyEmber(button);
  toast(`${name} added to your cart`, { label: 'View cart', href: '/cart' });
}

// ---------- simple "Add to cart" buttons on product cards ----------
function initCardButtons(): void {
  document.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('[data-add-to-cart]');
    if (!button || button.closest('[data-product-form]')) return;
    const product = findProduct(button.dataset.productId);
    if (!product || !product.purchasable) return;
    cart.add(product.id);
    added(button, product.name);
  });
}

// ---------- product detail page ----------
function initProductForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-product-form]');
  const detail = document.querySelector<HTMLElement>('[data-product-detail]');
  if (!form || !detail) return;
  const product = findProduct(detail.dataset.productId);
  if (!product) return;

  const priceEl = document.querySelector<HTMLElement>('[data-price]');
  const stockEl = document.querySelector<HTMLElement>('[data-stock-display]');
  const qty = form.querySelector<HTMLInputElement>('input[name="quantity"]');
  const message = form.querySelector<HTMLElement>('[data-form-message]');
  const stockLabels: Record<string, string> = {
    in_stock: 'In stock',
    low_stock: 'Only a few left',
    out_of_stock: 'Sold out',
    made_to_order: 'Made to order',
    enquire: 'Ask about this',
  };

  form.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.name !== 'variant') return;
    const price = Number(input.dataset.price);
    if (priceEl && price > 0) priceEl.textContent = money(price);
    if (stockEl && input.dataset.stock) {
      stockEl.textContent = stockLabels[input.dataset.stock] ?? '';
      stockEl.className = `pd-stock stock-${input.dataset.stock}`;
    }
  });

  form.querySelectorAll<HTMLButtonElement>('[data-qty-step]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!qty) return;
      qty.value = String(Math.max(1, Math.min(MAX_QTY, (Number(qty.value) || 1) + Number(b.dataset.qtyStep))));
    }),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (message) message.textContent = '';
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const variantId = (data.get('variant') as string) || undefined;
    if (product.variants.length && !variantId) {
      if (message) message.textContent = 'Please choose an option first.';
      return;
    }
    const options: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (key.startsWith('option:') && String(value).trim()) options[key.slice(7)] = String(value).trim();
    }
    const quantity = Math.max(1, Math.min(MAX_QTY, Number(data.get('quantity')) || 1));
    cart.add(product.id, variantId, options, quantity);
    added(form.querySelector('[data-add-to-cart]') ?? form, product.name);
  });
}

// ---------- gallery thumbnails (scroll without changing the URL hash) ----------
function initGallery(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-thumb]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const target = document.getElementById(a.hash.slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }),
  );
}

export function initShop(): void {
  renderBadge();
  cart.subscribe(renderBadge);
  initCardButtons();
  initProductForm();
  initGallery();

  // Thank-you page: the order is saved, so empty the cart.
  if (document.querySelector('[data-order-complete]')) cart.clear();
}
