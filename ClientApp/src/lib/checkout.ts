// ─────────────────────────────────────────────────────────────────────────────────────────────
// CHECKOUT HANDOFF (browser side)
//
// The browser only collects the details and sends the cart to the server. The server re-prices it,
// saves the order and decides where to go next. The payment-provider integration point is on the
// server: Services/Checkout/CheckoutService.cs (see INTEGRATION.md). Nothing here needs to change
// when you connect a provider. The browser just follows `redirectUrl` (thank-you page, payment link,
// or the provider's hosted checkout page).
// ─────────────────────────────────────────────────────────────────────────────────────────────
import type { CartLine } from './cart';

export interface CheckoutPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  deliveryMethod: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  locker?: string;
  giftWrap: boolean;
  giftMessage?: string;
  ageConfirmed: boolean;
  acceptTerms: boolean;
  paymentMethod: string;
  notes?: string;
  /** Same value for every attempt from one checkout page, so a double submit can't create two orders. */
  idempotencyKey?: string;
  items: { productId: string; variantId?: string; options?: Record<string, string>; quantity: number }[];
}

export interface CheckoutResult {
  success: true;
  reference: string;
  total: number;
  redirectUrl: string;
}

export function toItems(lines: CartLine[]): CheckoutPayload['items'] {
  return lines.map(({ productId, variantId, options, quantity }) => ({ productId, variantId, options, quantity }));
}

export async function placeOrder(payload: CheckoutPayload, antiforgeryToken: string): Promise<CheckoutResult> {
  const response = await fetch('/Checkout?handler=PlaceOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', RequestVerificationToken: antiforgeryToken },
    body: JSON.stringify(payload),
  });

  let body: Partial<CheckoutResult> & { message?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* non-JSON error page */
  }

  if (response.status === 429) throw new Error('Too many attempts. Please wait a minute and try again.');
  if (!response.ok || !body.success || !body.redirectUrl) {
    throw new Error(body.message || 'We could not place your order. Please check your details and try again.');
  }
  return body as CheckoutResult;
}
