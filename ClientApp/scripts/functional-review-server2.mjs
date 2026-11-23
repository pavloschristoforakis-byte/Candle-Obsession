import { chromium } from 'playwright';
const B = 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(B + '/checkout');
const token = await page.inputValue('input[name=__RequestVerificationToken]');
const base = { firstName: 'Review', lastName: 'Bot', email: 'review@example.com', phone: '99000000', deliveryMethod: 'acs', address: '1 Test St', city: 'Larnaca', postalCode: '6000', country: 'Cyprus', giftWrap: false, ageConfirmed: false, acceptTerms: false, paymentMethod: 'card', items: [{ productId: 'apple-pie', quantity: 1 }] };
for (const [name, patch] of [
  ['null item', { items: [null], acceptTerms: true, firstName: '' }],
  ['giftMessage 251 (terms false)', { giftMessage: 'x'.repeat(251) }],
  ['variant product no variant', { items: [{ productId: 'teddy-bear-candle', quantity: 1 }] }],
]) {
  const res = await page.evaluate(async ([b, t]) => { const r = await fetch('/Checkout?handler=PlaceOrder', { method: 'POST', headers: { 'Content-Type': 'application/json', RequestVerificationToken: t }, body: JSON.stringify(b) }); return [r.status, (await r.text()).slice(0, 200)]; }, [{ ...base, ...patch }, token]);
  console.log(name.padEnd(32), ...res);
  await sleep(7000);
}
await browser.close();
