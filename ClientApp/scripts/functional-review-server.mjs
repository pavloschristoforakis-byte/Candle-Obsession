// Functional review (read-only besides test orders): server-side checkout validation, success/cancel pages.
// Throttled to stay well under the "forms" rate limit (10/min per IP) shared with other sessions.
import { chromium } from 'playwright';

const B = 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(B + '/checkout');
const token = await page.inputValue('input[name=__RequestVerificationToken]');

const base = {
  firstName: 'Review', lastName: 'Bot', email: 'review@example.com', phone: '99000000',
  deliveryMethod: 'acs', address: '1 Test St', city: 'Larnaca', postalCode: '6000', country: 'Cyprus',
  giftWrap: false, ageConfirmed: false, acceptTerms: true, paymentMethod: 'card',
  items: [{ productId: 'apple-pie', quantity: 1 }],
};

async function post(name, patch) {
  const body = { ...base, ...patch };
  const res = await page.evaluate(async ([b, t]) => {
    const r = await fetch('/Checkout?handler=PlaceOrder', { method: 'POST', headers: { 'Content-Type': 'application/json', RequestVerificationToken: t }, body: JSON.stringify(b) });
    return { status: r.status, text: (await r.text()).slice(0, 300) };
  }, [body, token]);
  console.log(name.padEnd(34), res.status, res.text);
  await sleep(6500);
  return res;
}

const cases = (process.argv[2] ?? 'all').split(',');
const want = (k) => cases.includes('all') || cases.includes(k);

if (want('rules')) {
  await post('boxnow+cash', { deliveryMethod: 'boxnow', paymentMethod: 'cash', locker: 'X' });
  await post('acs Greece', { country: 'Greece' });
  await post('eu disabled', { deliveryMethod: 'eu', country: 'Greece' });
  await post('wine no age', { items: [{ productId: 'gift-box-wine-melts', options: { wine: 'Red' }, quantity: 1 }] });
  await post('enquire product', { items: [{ productId: 'red-grape', quantity: 1 }] });
  await post('select case-insens + unknown opt', { items: [{ productId: 'gift-box-wine-melts', options: { wine: 'red', colour: 'x' }, quantity: 1 }], ageConfirmed: true });
  await post('merge qty >100', { items: [{ productId: 'apple-pie', quantity: 60 }, { productId: 'apple-pie', quantity: 60 }] });
  await post('legacy name only', { items: [{ name: 'Strawbery', quantity: 1 }], acceptTerms: false });
  await post('null item', { items: [null] });
  await post('giftMessage 251', { giftMessage: 'x'.repeat(251), acceptTerms: false });
}

if (want('order')) {
  // A real (test) order: card, Manual provider → success page. Verify totals + cart clearing.
  await page.evaluate(() => localStorage.setItem('co.cart.v2', JSON.stringify([{ key: 'apple-pie||', productId: 'apple-pie', quantity: 2 }])));
  const r = await post('valid order (card, acs, wrap)', { items: [{ productId: 'apple-pie', quantity: 2 }], giftWrap: true, giftMessage: 'Hi', notes: 'functional review test order' });
  const json = JSON.parse(r.text);
  console.log('total', json.total, 'redirect', json.redirectUrl);
  const ref = json.reference;
  // Cancelled page first: cart must survive.
  await page.goto(`${B}/order/cancelled/${ref}`);
  await page.waitForTimeout(500);
  console.log('cancelled.cart', await page.evaluate(() => localStorage.getItem('co.cart.v2')));
  console.log('cancelled.retryButton', await page.locator('form button[type=submit]').count(), await page.locator('.result-actions').innerText());
  await sleep(6500);
  if (await page.locator('form button[type=submit]').count()) {
    await page.click('form button[type=submit]');
    await page.waitForLoadState();
    console.log('retry →', page.url());
  }
  await sleep(6500);
  await page.goto(`${B}/order/success/${ref}`);
  await page.waitForTimeout(500);
  console.log('success.cart', await page.evaluate(() => localStorage.getItem('co.cart.v2')));
  console.log('success.totals', (await page.locator('.summary-totals').innerText()).replace(/\n/g, ' | '));
  console.log('success.withdrawLink', await page.locator('main a[href^="/withdraw?reference="]').first().getAttribute('href'));
}

await browser.close();
