// Functional review (read-only): client-side cart / drawer / checkout UI checks against the running dev server.
import { chromium } from 'playwright';

const B = process.env.BASE ?? 'http://localhost:5199';
const out = [];
const log = (k, v) => { out.push([k, v]); console.log(k, JSON.stringify(v)); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

// 1. Legacy cart migration
await page.goto(B + '/about-blank-404');
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('cart', JSON.stringify([
    { name: 'Strawbery', price: 15, quantity: 2 },
    { name: 'Strawberry', price: 15, quantity: 1 },
    { name: 'Macademia Vanilla', price: 13, quantity: 50 },
    { name: 'Totally Unknown', price: 1, quantity: 1 },
  ]));
});
await page.goto(B + '/');
await page.waitForTimeout(500);
log('legacy.migrated', await page.evaluate(() => JSON.parse(localStorage.getItem('co.cart.v2'))));
log('legacy.removed', await page.evaluate(() => localStorage.getItem('cart')));
log('badge', await page.textContent('[data-cart-count]'));

// 2. Drawer: first click opens? (fresh page, chunk not yet loaded)
await page.goto(B + '/shop');
await page.click('[data-cart-open]');
await page.waitForTimeout(1200);
log('drawer.firstClick.open', await page.locator('.cart-drawer[role=dialog]').count());
log('drawer.firstClick.url', page.url());
if (await page.locator('.cart-drawer[role=dialog]').count() === 0) {
  await page.click('[data-cart-open]');
  await page.waitForTimeout(1000);
  log('drawer.secondClick.open', await page.locator('.cart-drawer[role=dialog]').count());
}
// lines with duplicate keys from migration: remove one and see what happens
log('drawer.lines', await page.locator('.cart-drawer .cart-line').count());
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
log('drawer.focusAfterEsc', await page.evaluate(() => document.activeElement?.getAttribute('data-cart-open') !== null ? 'cart-link' : document.activeElement?.outerHTML.slice(0, 80)));

// 2b. Drawer opened via keyboard (Enter on cart link)
await page.goto(B + '/shop');
await page.waitForTimeout(2500); // let idle preload happen
await page.focus('[data-cart-open]');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
log('drawer.keyboard.open', await page.locator('.cart-drawer[role=dialog]').count());
log('drawer.keyboard.focus', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
// Remove all lines inside the drawer → where does focus go?
for (let i = 0; i < 5 && (await page.locator('.cart-drawer .cart-line').count()) > 0; i++) {
  await page.locator('.cart-drawer .cart-line button[aria-label^="Remove"]').first().click();
  await page.waitForTimeout(150);
}
log('drawer.afterRemoveAll.focus', await page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.className ?? '')));
log('drawer.afterRemoveAll.storage', await page.evaluate(() => localStorage.getItem('co.cart.v2')));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 3. Shift-click on cart link (should open new window, not be hijacked)
const popupPromise = ctx.waitForEvent('page', { timeout: 1500 }).catch(() => null);
await page.click('[data-cart-open]', { modifiers: ['Shift'] });
const popup = await popupPromise;
await page.waitForTimeout(500);
log('shiftClick.newWindow', !!popup);
log('shiftClick.drawerOpened', await page.locator('.cart-drawer[role=dialog]').count());
if (popup) await popup.close();
await page.keyboard.press('Escape');

// 4. Unavailable products in cart → cart + checkout
await page.evaluate(() => {
  localStorage.setItem('co.cart.v2', JSON.stringify([
    { key: 'red-grape||', productId: 'red-grape', quantity: 1 },
    { key: 'ghost||', productId: 'ghost', quantity: 1 },
  ]));
});
await page.goto(B + '/checkout');
await page.waitForTimeout(600);
log('checkout.onlyUnavailable.formHidden', await page.locator('[data-checkout]').evaluate((e) => e.hidden));
log('checkout.onlyUnavailable.emptyShown', await page.locator('[data-checkout-empty]').evaluate((e) => !e.hidden));
await page.goto(B + '/cart');
await page.waitForTimeout(800);
log('cart.unavailable.lines', await page.locator('.cart-page .cart-line.is-unavailable').count());
log('cart.unavailable.checkoutDisabled', await page.locator('.cart-page a[href="/checkout"]').getAttribute('aria-disabled'));

// 5. Variant product with mixed / no variant: teddy has variants but enquire. Add variant product w/o variantId
await page.evaluate(() => {
  localStorage.setItem('co.cart.v2', JSON.stringify([
    { key: 'gift-box-wine-glasses||', productId: 'gift-box-wine-glasses', quantity: 1 }, // missing required options
    { key: 'apple-pie||', productId: 'apple-pie', quantity: 2 },
  ]));
});
await page.goto(B + '/cart');
await page.waitForTimeout(800);
log('cart.missingOptions.unavailableCount', await page.locator('.cart-page .cart-line.is-unavailable').count());
log('cart.missingOptions.subtotal', await page.locator('.cart-subtotal .visually-hidden').textContent());

// 6. Checkout UI rules: BOX NOW disables cash; pickup hides address; country list
await page.evaluate(() => {
  localStorage.setItem('co.cart.v2', JSON.stringify([
    { key: 'apple-pie||', productId: 'apple-pie', quantity: 2 },
    { key: 'gift-box-wine-melts||wine=Red', productId: 'gift-box-wine-melts', options: { wine: 'Red' }, quantity: 1 },
  ]));
});
await page.goto(B + '/checkout');
await page.waitForTimeout(600);
await page.check('input[name=paymentMethod][value=cash]');
await page.check('input[name=deliveryMethod][value=boxnow]');
log('checkout.boxnow.cashDisabled', await page.locator('input[name=paymentMethod][value=cash]').isDisabled());
log('checkout.boxnow.selectedPayment', await page.locator('input[name=paymentMethod]:checked').getAttribute('value'));
log('checkout.boxnow.lockerRequired', await page.locator('#locker').evaluate((e) => e.required));
log('checkout.boxnow.addressDisabled', await page.locator('#address').isDisabled());
log('checkout.ageVisible', await page.locator('[data-age-confirm]').isVisible());
await page.check('[data-gift-wrap]', { force: true });
log('checkout.totals', await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-total]')].map((e) => [e.dataset.total, e.textContent]))));
await page.check('input[name=deliveryMethod][value=acs]');
log('checkout.acs.cashEnabled', !(await page.locator('input[name=paymentMethod][value=cash]').isDisabled()));
log('checkout.acs.countries', await page.locator('#country option').allTextContents());
log('checkout.totals.acs', await page.evaluate(() => document.querySelector('[data-total=total]').textContent));
await page.check('input[name=deliveryMethod][value=pickup]');
log('checkout.pickup.addressHidden', await page.locator('[data-requires-group=address]').evaluate((e) => e.hidden));
log('checkout.totals.pickup', await page.evaluate(() => document.querySelector('[data-total=total]').textContent));

// 7. Product detail: options/variant flow on wine-glasses box
await page.goto(B + '/products/gift-box-wine-glasses');
await page.selectOption('select[name="option:wine"]', 'Rosé');
await page.selectOption('select[name="option:candle"]', 'Apple Pie');
await page.click('.pd-form button[type=submit]');
await page.waitForTimeout(300);
await page.selectOption('select[name="option:wine"]', 'rosé'.normalize()).catch(() => {});
log('detail.addedLine', await page.evaluate(() => JSON.parse(localStorage.getItem('co.cart.v2')).find((l) => l.productId === 'gift-box-wine-glasses')));

// 8. Cross-tab sync / corrupt storage
await page.evaluate(() => localStorage.setItem('co.cart.v2', '{"not":"array"}'));
await page.goto(B + '/cart');
await page.waitForTimeout(600);
log('corruptV2.lines', await page.evaluate(() => localStorage.getItem('co.cart.v2')));

await browser.close();
