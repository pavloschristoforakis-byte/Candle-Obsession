// Checkout page behaviour: order summary, delivery/payment rules, gift options and submitting the order.
import { cart } from '../lib/cart';
import { placeOrder, toItems, type CheckoutPayload } from '../lib/checkout';
import { el, money } from '../lib/util';

export function initCheckout(): void {
  const rootOrNull = document.querySelector<HTMLElement>('[data-checkout]');
  const form = document.getElementById('checkout-form') as HTMLFormElement | null;
  if (!rootOrNull || !form) return;
  const root: HTMLElement = rootOrNull;

  const empty = document.querySelector<HTMLElement>('[data-checkout-empty]');
  const itemsList = document.getElementById('checkout-items')!;
  const message = document.getElementById('checkout-message')!;
  const button = document.querySelector<HTMLButtonElement>('[data-place-order]')!;
  const giftWrapPrice = Number(root.dataset.giftWrapPrice) || 0;
  const giftWrapConfirmed = root.dataset.giftWrapConfirmed === 'true';
  // One id per checkout attempt: a double click or a retry after a lost response can't create two orders.
  const newAttemptId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  let attemptId = newAttemptId();
  // Coming back to this page from the browser's history counts as a new attempt.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) attemptId = newAttemptId();
  });
  const total = (name: string) => root.querySelector<HTMLElement>(`[data-total="${name}"]`)!;
  const radios = (name: string) => Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  const checked = (name: string) => radios(name).find((r) => r.checked);
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

  function renderSummary(): void {
    const lines = cart.resolve();
    const available = lines.filter((l) => l.available);
    const isEmpty = available.length === 0;
    root.hidden = isEmpty;
    if (empty) {
      empty.hidden = !isEmpty;
      const onlyUnavailable = isEmpty && lines.length > 0;
      const text = empty.querySelector<HTMLElement>('[data-checkout-empty-text]');
      const link = empty.querySelector<HTMLAnchorElement>('[data-checkout-empty-link]');
      if (text)
        text.textContent = onlyUnavailable
          ? 'The items in your cart are no longer available. Please review your cart.'
          : 'Your cart is empty.';
      if (link) {
        link.href = onlyUnavailable ? '/cart' : '/shop';
        link.textContent = onlyUnavailable ? 'Review your cart' : 'Continue shopping';
      }
    }

    itemsList.replaceChildren(
      ...lines.map((l) =>
        el(
          'li',
          { className: `summary-item${l.available ? '' : ' is-unavailable'}` },
          el('span', {}, `${l.quantity} × ${l.name}`, l.detail ? el('small', {}, l.detail) : null,
            l.available ? null : el('small', {}, l.reason ?? 'No longer available: remove it from your cart')),
          el('span', {}, l.available ? money(l.total) : '–'),
        ),
      ),
    );

    // Wine in the cart → age confirmation becomes visible and required.
    const age = form!.querySelector<HTMLElement>('[data-age-confirm]');
    if (age) {
      const needed = cart.containsAlcohol();
      age.hidden = !needed;
      age.querySelector('input')!.required = needed;
    }
    updateTotals();
  }

  function updateTotals(): void {
    const subtotal = cart.subtotal();
    const delivery = checked('deliveryMethod');
    const shipping = delivery ? Number(delivery.dataset.price) || 0 : 0;
    const wrap = (form!.querySelector<HTMLInputElement>('[data-gift-wrap]')?.checked ?? false) ? giftWrapPrice : 0;
    total('subtotal').textContent = money(subtotal);
    total('shipping').textContent = shipping === 0 ? 'Free' : money(shipping);
    total('giftwrap').textContent = wrap === 0 && giftWrapConfirmed ? 'Free' : money(wrap);
    const wrapRow = root.querySelector<HTMLElement>('[data-total-row="giftwrap"]');
    if (wrapRow) wrapRow.hidden = !(form!.querySelector<HTMLInputElement>('[data-gift-wrap]')?.checked);
    total('total').textContent = money(subtotal + shipping + wrap);
  }

  function updateDelivery(): void {
    const delivery = checked('deliveryMethod');
    const requires = delivery?.dataset.requires ?? 'address';
    form!.querySelectorAll<HTMLElement>('[data-requires-group]').forEach((group) => {
      const active = group.dataset.requiresGroup === requires;
      group.hidden = !active;
      group.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((input) => {
        input.disabled = !active;
        if (input.tagName === 'INPUT') input.required = active;
      });
    });

    // Countries allowed for this delivery method.
    const countries = (delivery?.dataset.countries ?? '').split('|').filter(Boolean);
    const country = field('country') as HTMLSelectElement | null;
    if (country && countries.length) {
      for (const opt of Array.from(country.options)) opt.hidden = opt.disabled = !countries.includes(opt.value);
      if (!countries.includes(country.value)) country.value = countries[0];
    }

    // Payment methods not allowed with this delivery method (e.g. cash with lockers).
    const disallowed = (delivery?.dataset.disallow ?? '').split(',').filter(Boolean);
    for (const radio of radios('paymentMethod')) {
      const blocked = disallowed.includes(radio.value);
      radio.disabled = blocked;
      radio.closest('.choice')?.classList.toggle('is-disabled', blocked);
      if (blocked && radio.checked) radios('paymentMethod').find((r) => !r.disabled)!.checked = true;
    }
    updatePayment();
    updateTotals();
  }

  function updatePayment(): void {
    const note = form!.querySelector<HTMLElement>('[data-card-note]');
    if (note) note.hidden = checked('paymentMethod')?.value !== 'card';
  }

  // Gift message character counter.
  const giftMessage = field('giftMessage') as HTMLTextAreaElement | null;
  const counter = form.querySelector<HTMLElement>('[data-char-count]');
  giftMessage?.addEventListener('input', () => {
    if (counter) counter.textContent = `${giftMessage.value.length} / ${giftMessage.maxLength}`;
  });

  form.addEventListener('change', (e) => {
    const name = (e.target as HTMLInputElement).name;
    if (name === 'deliveryMethod') updateDelivery();
    else if (name === 'paymentMethod') updatePayment();
    else if (name === 'giftWrap') updateTotals();
  });

  let submitting = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    message.textContent = '';

    const lines = cart.resolve();
    if (lines.some((l) => !l.available)) {
      message.textContent = 'Please remove unavailable items from your cart first.';
      return;
    }
    if (lines.length === 0) {
      message.textContent = 'Your cart is empty.';
      return;
    }
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const text = (k: string) => ((data.get(k) as string | null) ?? '').trim() || undefined;
    const payload: CheckoutPayload = {
      firstName: text('firstName') ?? '',
      lastName: text('lastName') ?? '',
      email: text('email') ?? '',
      phone: text('phone') ?? '',
      deliveryMethod: text('deliveryMethod') ?? '',
      address: text('address'),
      city: text('city'),
      postalCode: text('postalCode'),
      country: text('country'),
      locker: text('locker'),
      giftWrap: data.get('giftWrap') === 'true',
      giftMessage: text('giftMessage'),
      ageConfirmed: data.get('ageConfirmed') === 'true',
      acceptTerms: data.get('acceptTerms') === 'true',
      paymentMethod: text('paymentMethod') ?? '',
      notes: text('notes'),
      idempotencyKey: attemptId,
      items: toItems(cart.lines()),
    };

    submitting = true;
    button.disabled = true;
    const label = button.querySelector('span');
    const original = label?.textContent ?? 'Place order';
    if (label) label.textContent = 'Placing your order…';

    try {
      const token = (data.get('__RequestVerificationToken') as string) ?? '';
      const result = await placeOrder(payload, token);
      // The cart is cleared on the thank-you page, so it survives a cancelled online payment.
      window.location.assign(result.redirectUrl);
    } catch (err) {
      message.textContent = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      submitting = false;
      button.disabled = false;
      if (label) label.textContent = original;
    }
  });

  cart.subscribe(renderSummary);
  renderSummary();
  updateDelivery();
}
