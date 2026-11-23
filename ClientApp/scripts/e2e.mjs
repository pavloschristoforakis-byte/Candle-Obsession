// End-to-end browser QA for the Candle Obsession site (plain Playwright + Chromium).
//
//   npm run test:e2e                         (against http://localhost:5199)
//   E2E_BASE_URL=https://example.test npm run test:e2e
//   E2E_HEADED=1 npm run test:e2e            (watch it run)
//   E2E_ONLY=pages,cart,flame,reduced,evening (run a subset)
//
// Runs every check at desktop (1440x900) and mobile (390x844, touch) and prints a PASS/FAIL list.
// Exits with code 1 if anything failed. Placing an order writes a test order to the database.
import { chromium } from 'playwright';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:5199').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const HEADED = !!process.env.E2E_HEADED;
const ONLY = (process.env.E2E_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (group) => ONLY.length === 0 || ONLY.includes(group);

const CART_KEY = 'co.cart.v2';
const EVENING_KEY = 'co.evening';

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};

const PAGES = [
  '/',
  '/shop',
  '/shop?guide=for-her',
  '/shop?guide=under-25',
  '/products/macademia-vanilla',
  '/products/teddy-bear-candle',
  '/products/gift-box-wine-glasses',
  '/cart',
  '/checkout',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/contact',
  '/candle-care',
  '/withdraw',
  '/admin/login',
  { path: '/this-page-does-not-exist-e2e', expectStatus: 404 },
];

// ───────────────────────────── result bookkeeping ─────────────────────────────
const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const message = (err && err.message ? err.message : String(err)).split('\n').slice(0, 6).join('\n        ');
    results.push({ name, ok: false, ms: Date.now() - started, message });
    console.log(`  FAIL  ${name}\n        ${message}`);
  }
}

class AssertionError extends Error {}
function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

/** Polls `fn` until it returns truthy (or throws the last error / a timeout message). */
async function waitFor(fn, message, timeout = 5000, interval = 50) {
  const end = Date.now() + timeout;
  let lastErr;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new AssertionError(`${message}${lastErr ? ` (last error: ${lastErr.message})` : ''} [timed out after ${timeout} ms]`);
}

// ───────────────────────────── page monitoring ─────────────────────────────
/** Records console errors, uncaught page errors and failed/4xx/5xx same-origin requests for a page. */
function monitor(page) {
  const state = { problems: [], allow404Doc: null };
  const sameOrigin = (url) => {
    try {
      return new URL(url).origin === ORIGIN;
    } catch {
      return false;
    }
  };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The browser logs the expected 404 of the "not found" document itself; that's not a defect.
    if (state.allow404Doc && /status of 404/.test(text) && (!msg.location().url || msg.location().url === state.allow404Doc)) return;
    state.problems.push(`console.error: ${text}${msg.location().url ? ` @ ${msg.location().url}` : ''}`);
  });
  page.on('pageerror', (err) => state.problems.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    if (!sameOrigin(req.url())) return;
    const failure = req.failure()?.errorText ?? 'unknown';
    // Requests cancelled by our own navigation (e.g. lazy image still loading when we leave) are not defects.
    if (failure === 'net::ERR_ABORTED' && state.navigating) return;
    state.problems.push(`request failed: ${req.method()} ${req.url()} (${failure})`);
  });
  page.on('response', (res) => {
    if (!sameOrigin(res.url()) || res.status() < 400) return;
    if (state.allow404Doc && res.status() === 404 && res.url() === state.allow404Doc) return;
    state.problems.push(`HTTP ${res.status()}: ${res.request().method()} ${res.url()}`);
  });
  return {
    state,
    take() {
      const p = state.problems.slice();
      state.problems.length = 0;
      return p;
    },
  };
}

// The site rate-limits /checkout, /withdraw, /admin/login and /order/cancelled (GET and POST) to 10 requests
// per minute per IP, shared across those pages. A full run needs more than that, so when the test itself
// trips the limit we wait for the window to reset and retry once, and list it under "Notes" at the end.
const notes = [];
async function goto(page, mon, path, { expectStatus = 200, settle = true } = {}) {
  const url = BASE + path;
  mon.state.allow404Doc = expectStatus === 404 ? url : null;
  mon.state.navigating = true;
  let res = await page.goto(url, { waitUntil: 'load' });
  if (res && res.status() === 429 && expectStatus !== 429) {
    notes.push(`HTTP 429 (rate limited) on GET ${path}; waited 61 s and retried`);
    console.log(`        (429 rate limited on ${path}: waiting 61 s for the window to reset)`);
    await page.waitForTimeout(61000);
    mon.take();
    res = await page.goto(url, { waitUntil: 'load' });
  }
  mon.state.navigating = false;
  assert(res, `no response for ${path}`);
  assert(res.status() === expectStatus, `${path} returned HTTP ${res.status()}, expected ${expectStatus}`);
  if (settle) await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  return res;
}

function noProblems(mon, where) {
  const p = mon.take();
  assert(p.length === 0, `${where}: ${p.length} problem(s):\n${p.join('\n')}`);
}

/** Scrolls the page top → bottom in steps so lazy islands/images load, then back to the top. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
    const height = () => document.scrollingElement.scrollHeight;
    for (let y = 0; y < height(); y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo({ top: height(), behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

async function overflow(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement;
    const vw = window.innerWidth;
    const offenders = [];
    if (se.scrollWidth > vw) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} (right=${Math.round(r.right)})`);
          if (offenders.length >= 5) break;
        }
      }
    }
    return { scrollWidth: se.scrollWidth, innerWidth: vw, offenders };
  });
}

/** Opens the cart drawer from the header icon. Clicks a second time if the first click did nothing
 *  (that first-click failure is reported by its own check). */
async function openDrawer(page) {
  const drawer = page.locator('.cart-drawer[role=dialog]');
  if (await drawer.count()) return;
  await page.locator('#cart-link').click();
  try {
    await drawer.waitFor({ state: 'visible', timeout: 2000 });
  } catch {
    await page.locator('#cart-link').click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
  }
}

const cartCount = (page) => page.locator('#cart-count').textContent().then((t) => Number((t || '').trim()));
const storedCart = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), CART_KEY);

// ───────────────────────────── 1. page loads ─────────────────────────────
async function testPages(browser, vpName) {
  const context = await browser.newContext(VIEWPORTS[vpName]);
  const page = await context.newPage();
  const mon = monitor(page);
  for (const entry of PAGES) {
    const { path, expectStatus = 200 } = typeof entry === 'string' ? { path: entry } : entry;
    await check(`[${vpName}] page ${path} loads cleanly, no horizontal overflow`, async () => {
      mon.take();
      await goto(page, mon, path, { expectStatus });
      await scrollThrough(page);
      await page.waitForTimeout(250);
      noProblems(mon, path);
      const o = await overflow(page);
      assert(o.scrollWidth <= o.innerWidth, `horizontal overflow: scrollWidth ${o.scrollWidth} > innerWidth ${o.innerWidth}; ${o.offenders.join(', ')}`);
    });
  }
  await context.close();
}

// ───────────────────────────── 2. cart + checkout flow ─────────────────────────────
async function testCartFlow(browser, vpName) {
  const context = await browser.newContext(VIEWPORTS[vpName]);
  const page = await context.newPage();
  const mon = monitor(page);
  const t = (n) => `[${vpName}] cart: ${n}`;
  let ok = true; // later steps depend on earlier ones
  let placeOrderCount = null;
  const step = async (name, fn) => {
    if (!ok) {
      results.push({ name: t(name), ok: false, skipped: true, message: 'skipped (an earlier cart step failed)' });
      console.log(`  SKIP  ${t(name)}`);
      return;
    }
    mon.take(); // don't blame this step for leftovers of a failed earlier one
    await check(t(name), fn);
    if (!results[results.length - 1].ok) ok = false; // the step's own result is pushed last
  };

  await step('empty localStorage, add Macademia Vanilla from a home-page card → count 1 + toast', async () => {
    await goto(page, mon, '/');
    await page.evaluate(() => localStorage.clear());
    await goto(page, mon, '/');
    assert((await cartCount(page)) === 0, `cart count should start at 0, got ${await cartCount(page)}`);
    const card = page
      .locator('[data-product-card]')
      .filter({ has: page.locator('.product-title', { hasText: /^\s*Macademia Vanilla\s*$/ }) })
      .filter({ has: page.locator('button[data-add-to-cart]') })
      .first();
    await card.scrollIntoViewIfNeeded();
    await card.locator('button[data-add-to-cart]').click();
    await waitFor(async () => (await cartCount(page)) === 1, 'header cart count did not become 1');
    const toast = page.locator('#toast');
    await waitFor(() => toast.evaluate((el) => el.classList.contains('is-visible')), 'toast did not become visible');
    const text = await toast.textContent();
    assert(/Macademia Vanilla added/i.test(text || ''), `toast text unexpected: "${text}"`);
    assert((await page.locator('#cart-link').getAttribute('aria-label')) === 'Shopping cart, 1 item', 'cart link aria-label not updated');
    noProblems(mon, 'home add-to-cart');
  });

  await step('gift box: choose wine + candle, qty 2, add → count 3', async () => {
    await goto(page, mon, '/products/gift-box-wine-glasses');
    // Adding without choosing the required options must not add anything.
    await page.locator('[data-product-form] button[type=submit][data-add-to-cart]').click();
    await page.waitForTimeout(200);
    assert((await cartCount(page)) === 1, 'add without required options changed the cart');
    await page.selectOption('#opt-wine', 'Red');
    await page.selectOption('#opt-candle', 'Baby Powder');
    // The +/- buttons are checked separately (non-blocking) so a stepper bug doesn't hide the rest of the flow.
    await check(t('product page quantity "+" goes 1 → 2 and "−" goes back to 1'), async () => {
      await page.fill('#qty', '1');
      await page.locator('[data-qty-step="1"]').click();
      const up = await page.inputValue('#qty');
      await page.locator('[data-qty-step="-1"]').click();
      const down = await page.inputValue('#qty');
      assert(up === '2' && down === '1', `one click on "+" gave ${up} (expected 2), then "−" gave ${down} (expected 1)`);
    });
    await page.fill('#qty', '2');
    await page.locator('[data-product-form] button[type=submit][data-add-to-cart]').click();
    await waitFor(async () => (await cartCount(page)) === 3, 'header cart count did not become 3');
    const lines = await storedCart(page);
    const gift = lines.find((l) => l.productId === 'gift-box-wine-glasses');
    assert(gift && gift.quantity === 2, `stored gift-box line wrong: ${JSON.stringify(lines)}`);
    assert(gift.options?.wine === 'Red' && gift.options?.candle === 'Baby Powder', `options not stored: ${JSON.stringify(gift.options)}`);
    noProblems(mon, 'gift box add');
  });

  // The first click is checked on its own (non-blocking); the content checks below retry with a second click.
  await check(t('first click on the header cart icon opens the drawer'), async () => {
    await page.locator('#cart-link').click();
    await page.locator('.cart-drawer[role=dialog]').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    const n = await page.locator('.cart-drawer[role=dialog]').count();
    assert(page.url().startsWith(`${BASE}/products/`), `clicking the cart icon navigated to ${page.url()}`);
    assert(n === 1, 'nothing happened on the first click (no drawer, no navigation to /cart); a second click is needed');
  });

  await step('cart drawer via header icon: 2 lines, subtotal €73.00; Esc closes, focus returns to icon', async () => {
    await openDrawer(page);
    const drawer = page.locator('.cart-drawer[role=dialog]');
    assert(page.url().startsWith(`${BASE}/products/`), `clicking the cart icon navigated away to ${page.url()}`);
    await waitFor(async () => (await drawer.locator('.cart-line').count()) === 2, 'drawer should list 2 lines');
    const names = await drawer.locator('.cart-line-name').allTextContents();
    assert(names.some((n) => /Macademia Vanilla/.test(n)) && names.some((n) => /Gift Box/.test(n)), `drawer line names: ${names}`);
    const sub = (await drawer.locator('.cart-subtotal .visually-hidden').textContent())?.trim();
    assert(sub === '€73.00', `drawer subtotal "${sub}", expected €73.00`);
    // Focus should be inside the dialog once it opens.
    await waitFor(() => page.evaluate(() => !!document.activeElement?.closest('.cart-drawer')), 'focus did not move into the drawer');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached', timeout: 5000 });
    await waitFor(() => page.evaluate(() => document.activeElement?.id === 'cart-link'), 'focus did not return to the cart icon after Esc');
    noProblems(mon, 'drawer');
  });

  await step('/cart page: increase, decrease, remove work and persist across reload', async () => {
    await goto(page, mon, '/cart');
    const lines = page.locator('[data-island="cart-page"] .cart-line');
    await waitFor(async () => (await lines.count()) === 2, '/cart should list 2 lines');
    const mac = lines.filter({ hasText: 'Macademia Vanilla' });
    const gift = lines.filter({ hasText: 'Gift Box' });
    const qtyOf = async (line) => Number((await line.locator('.qty-value').textContent()).trim());

    await mac.getByRole('button', { name: /Increase quantity of Macademia Vanilla/ }).click();
    await waitFor(async () => (await qtyOf(mac)) === 2, 'Macademia qty did not increase to 2');
    await gift.getByRole('button', { name: /Decrease quantity of Gift Box/ }).click();
    await waitFor(async () => (await qtyOf(gift)) === 1, 'Gift box qty did not decrease to 1');
    await waitFor(async () => (await cartCount(page)) === 3, 'header count should be 3 after +1/-1');
    const sub1 = (await page.locator('.cart-subtotal .visually-hidden').textContent()).trim();
    assert(sub1 === '€56.00', `subtotal after +/-: "${sub1}", expected €56.00 (2×13 + 30)`);

    await goto(page, mon, '/cart');
    await waitFor(async () => (await lines.count()) === 2, 'after reload /cart should still list 2 lines');
    assert((await qtyOf(mac)) === 2 && (await qtyOf(gift)) === 1, 'quantities did not persist across reload');

    await mac.getByRole('button', { name: /Remove Macademia Vanilla/ }).click();
    await waitFor(async () => (await lines.count()) === 1, 'remove did not drop the Macademia line');
    await waitFor(async () => (await cartCount(page)) === 1, 'header count should be 1 after remove');
    await goto(page, mon, '/cart');
    await waitFor(async () => (await lines.count()) === 1, 'remove did not persist across reload');
    assert(/Gift Box/.test(await lines.first().textContent()), 'remaining line should be the gift box');
    noProblems(mon, '/cart');
  });

  await step('checkout: ACS → BOX NOW → pickup, gift wrap + message, age, terms, Revolut → success page, cart emptied', async () => {
    // Put the Macademia back so the order has two lines (one simple, one with options).
    await goto(page, mon, '/products/macademia-vanilla');
    await page.locator('[data-product-form] button[type=submit][data-add-to-cart]').click();
    await waitFor(async () => (await cartCount(page)) === 2, 'adding Macademia from its page did not give count 2');

    await goto(page, mon, '/checkout');
    const form = page.locator('#checkout-form');
    await form.waitFor({ state: 'visible' });
    await waitFor(async () => (await page.locator('#checkout-items li').count()) === 2, 'checkout summary should list 2 items');
    await page.fill('#firstName', 'E2E');
    await page.fill('#lastName', 'Tester');
    await page.fill('#email', 'e2e@example.com');
    await page.fill('#phone', '+35799000000');

    const deliveryChoice = (v) => page.locator('label.choice').filter({ has: page.locator(`input[name=deliveryMethod][value="${v}"]`) });
    const radio = (n, v) => page.locator(`input[name=${n}][value="${v}"]`);
    const total = (n) => page.locator(`[data-total="${n}"]`).textContent().then((s) => s.trim());

    // ACS courier: address fields visible + required.
    await deliveryChoice('acs').click();
    assert(await radio('deliveryMethod', 'acs').isChecked(), 'ACS radio not checked');
    assert(await page.locator('#address').isVisible(), 'address field should be visible for ACS');
    assert(await page.locator('#address').evaluate((el) => el.required && !el.disabled), 'address should be required for ACS');
    assert((await total('shipping')) === '€5.00', `ACS shipping shows "${await total('shipping')}", expected €5.00`);
    // Submitting with an empty address must be blocked by validation (no navigation).
    await page.locator('[data-place-order]').click();
    await page.waitForTimeout(300);
    assert(page.url().startsWith(`${BASE}/checkout`), 'order was submitted without an address for ACS');
    assert(await page.locator('#address').evaluate((el) => !el.validity.valid), 'empty address should be invalid for ACS');

    // BOX NOW: locker field, address disabled, cash disabled.
    await deliveryChoice('boxnow').click();
    assert(await radio('deliveryMethod', 'boxnow').isChecked(), 'BOX NOW radio not checked');
    assert(await page.locator('#locker').isVisible(), 'locker field should be visible for BOX NOW');
    assert(!(await page.locator('#address').isVisible()), 'address should be hidden for BOX NOW');
    assert(await radio('paymentMethod', 'cash').isDisabled(), 'cash should be disabled for BOX NOW');
    assert((await total('shipping')) === '€3.00', `BOX NOW shipping shows "${await total('shipping')}", expected €3.00`);

    // Local pickup: no address/locker, free.
    await deliveryChoice('pickup').click();
    assert(await radio('deliveryMethod', 'pickup').isChecked(), 'pickup radio not checked');
    assert(!(await page.locator('#address').isVisible()) && !(await page.locator('#locker').isVisible()), 'address/locker should be hidden for pickup');
    assert(!(await radio('paymentMethod', 'cash').isDisabled()), 'cash should be enabled again for pickup');
    assert((await total('shipping')) === 'Free', `pickup shipping shows "${await total('shipping')}", expected Free`);

    // Gift this.
    await page.locator('label.toggle').filter({ has: page.locator('[data-gift-wrap]') }).click();
    assert(await page.locator('[data-gift-wrap]').isChecked(), 'gift wrap not ticked');
    assert(await page.locator('[data-total-row="giftwrap"]').isVisible(), 'gift wrap row should appear in the summary');
    await page.fill('#giftMessage', 'Happy birthday! Love, E2E');
    assert(/^25 \//.test((await page.locator('[data-char-count]').textContent()).trim()), 'gift message counter did not update');

    // Wine in the cart → age confirmation.
    const age = page.locator('[data-age-confirm]');
    assert(await age.isVisible(), 'age confirmation should be visible (gift box contains wine)');
    await age.locator('input').check();
    await page.locator('input[name=acceptTerms]').check();
    await page.locator('label.choice').filter({ has: radio('paymentMethod', 'revolut') }).click();
    assert(await radio('paymentMethod', 'revolut').isChecked(), 'Revolut not selected');
    assert((await total('subtotal')) === '€43.00', `subtotal "${await total('subtotal')}", expected €43.00`);

    mon.take();
    const placeOrderPosts = [];
    const onReq = (r) => r.method() === 'POST' && /handler=PlaceOrder/i.test(r.url()) && placeOrderPosts.push(r.url());
    page.on('request', onReq);
    await Promise.all([page.waitForURL(/\/order\/success\/[^/]+$/, { timeout: 15000 }), page.locator('[data-place-order]').click()]);
    page.off('request', onReq);
    placeOrderCount = placeOrderPosts.length;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const ref = page.url().split('/').pop();
    assert(ref && ref.length >= 6, `odd order reference "${ref}"`);
    assert(/made our day/i.test(await page.locator('h1').textContent()), 'success heading missing');
    const items = await page.locator('.order-result .summary-items li').allTextContents();
    assert(items.length === 2, `success summary should show 2 items, got ${items.length}`);
    assert(items.some((s) => /Gift Box/.test(s) && /Red/.test(s) && /Baby Powder/.test(s)), `gift box line/options missing on success page: ${items.join(' | ')}`);
    assert(items.some((s) => /Macademia Vanilla/.test(s)), 'Macademia missing on success page');
    const body = await page.locator('.order-result').textContent();
    assert(/Gift wrap/i.test(body), 'gift wrap not shown in success summary');
    await waitFor(async () => (await cartCount(page)) === 0, 'cart count did not become 0 on the success page');
    assert((await storedCart(page)).length === 0, 'cart not cleared in localStorage');
    // A second, aborted PlaceOrder POST is reported by the dedicated "one click = one order" check below.
    mon.state.problems = mon.state.problems.filter((p) => !/PlaceOrder \(net::ERR_ABORTED\)/.test(p));
    noProblems(mon, 'checkout/success');
  });

  await check(t('one click on "Place order" sends exactly one order request'), async () => {
    assert(placeOrderCount !== null, 'not measured (the checkout step did not get that far)');
    assert(placeOrderCount === 1, `one click sent ${placeOrderCount} POST /Checkout?handler=PlaceOrder requests (risk of duplicate orders)`);
  });

  ok = true; // independent of the flow above
  await step('front-end entry (dist/app*.js) is executed only once per page', async () => {
    const appRequests = [];
    const onReq = (r) => {
      if (/\/dist\/app(\.[A-Za-z0-9]+)?\.js(\?|$)/.test(new URL(r.url()).pathname + new URL(r.url()).search)) appRequests.push(r.url());
    };
    page.on('request', onReq);
    await goto(page, mon, '/products/macademia-vanilla');
    await page.waitForTimeout(2500); // the cart drawer chunk is warmed when the browser is idle
    page.off('request', onReq);
    assert(appRequests.length === 1, `the entry module was loaded ${appRequests.length} times under different URLs (${appRequests.join(', ')}), so every listener runs twice`);
  });

  ok = true;
  await step('removing a line in the drawer, then adding another product on the same page, does not bring the removed line back', async () => {
    await goto(page, mon, '/products/macademia-vanilla');
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([
      { key: 'baby-powder||', productId: 'baby-powder', quantity: 1 },
    ])), CART_KEY);
    await goto(page, mon, '/products/macademia-vanilla');
    await page.waitForTimeout(2500); // let idle preloading finish, as a real visitor would
    assert((await cartCount(page)) === 1, `expected 1 item to start, got ${await cartCount(page)}`);
    await openDrawer(page);
    const drawer = page.locator('.cart-drawer[role=dialog]');
    await drawer.getByRole('button', { name: /^Remove / }).first().click();
    await waitFor(async () => (await drawer.locator('.cart-line').count()) === 0, 'drawer line was not removed');
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('[data-product-form] button[type=submit][data-add-to-cart]').click();
    await page.waitForTimeout(300);
    const stored = await storedCart(page);
    const ids = stored.map((l) => `${l.productId}×${l.quantity}`);
    assert(stored.length === 1 && stored[0].productId === 'macademia-vanilla' && stored[0].quantity === 1,
      `cart after remove + add should be [macademia-vanilla×1], got [${ids.join(', ')}] (header shows ${await cartCount(page)})`);
    await page.evaluate((k) => localStorage.removeItem(k), CART_KEY);
    noProblems(mon, 'drawer remove + add');
  });

  ok = true;
  await step('empty cart: checkout shows the empty state and the server rejects an empty order', async () => {
    await goto(page, mon, '/shop');
    await page.evaluate((k) => localStorage.removeItem(k), CART_KEY);
    await goto(page, mon, '/checkout');
    await waitFor(() => page.locator('[data-checkout-empty]').isVisible(), 'empty-cart message not shown on /checkout');
    assert(!(await page.locator('[data-checkout]').isVisible()), 'checkout form should be hidden with an empty cart');
    assert(!(await page.locator('[data-place-order]').isVisible()), 'Place order button should not be visible with an empty cart');
    // Even if someone bypasses the UI, the server must refuse an order with no items.
    const postEmpty = () => page.evaluate(async () => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value ?? '';
      const r = await fetch('/Checkout?handler=PlaceOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
        body: JSON.stringify({
          firstName: 'E2E', lastName: 'Empty', email: 'e2e@example.com', phone: '+35799000000',
          deliveryMethod: 'pickup', giftWrap: false, ageConfirmed: false, acceptTerms: true, paymentMethod: 'revolut', items: [],
        }),
      });
      let body = null;
      try { body = await r.json(); } catch { /* not json */ }
      return { status: r.status, body };
    });
    let res = await postEmpty();
    if (res.status === 429) {
      notes.push('HTTP 429 (rate limited) on the empty-order POST; waited 61 s and retried');
      await page.waitForTimeout(61000);
      res = await postEmpty();
    }
    assert(res.status === 400 && !res.body?.success, `server accepted an empty order: ${JSON.stringify(res)}`);
    // The expected 400 shows up as a failed request/console error in the monitor: drop it.
    mon.take();
  });

  await context.close();
}

// ───────────────────────────── 3. flame ─────────────────────────────
const CANDLE_CARD = 'article.product-card[data-candle]:has(.wick-flame)';

async function testFlame(browser, vpName) {
  const context = await browser.newContext(VIEWPORTS[vpName]);
  const page = await context.newPage();
  const mon = monitor(page);
  if (vpName === 'desktop') {
    await check('[desktop] flame: hover lights a candle card (is-lit); leaving → is-out, then cleared', async () => {
      await goto(page, mon, '/shop');
      const card = page.locator(CANDLE_CARD).first();
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(2, 450);
      const box = await card.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3, { steps: 5 });
      await waitFor(() => card.evaluate((el) => el.classList.contains('is-lit')), 'card did not get is-lit on hover');
      const flameOpacity = await card.locator('.flame').evaluate((el) => getComputedStyle(el).opacity);
      await page.mouse.move(2, 450, { steps: 5 });
      await waitFor(() => card.evaluate((el) => el.classList.contains('is-out') && !el.classList.contains('is-lit')), 'card did not go is-out after leaving');
      await waitFor(() => card.evaluate((el) => !el.classList.contains('is-out') && !el.classList.contains('is-lit')), 'is-out was not cleared', 4000);
      assert(Number(flameOpacity) >= 0, 'flame element missing');
      noProblems(mon, 'flame desktop');
    });
  } else {
    await check('[mobile] flame: a candle card scrolled fully into view gets is-lit', async () => {
      await goto(page, mon, '/shop');
      const cards = page.locator(CANDLE_CARD);
      const card = cards.nth(Math.min(2, (await cards.count()) - 1));
      await card.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await waitFor(
        () => card.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight;
        }),
        'card could not be scrolled fully into view',
      );
      await waitFor(() => card.evaluate((el) => el.classList.contains('is-lit')), 'card in view did not get is-lit');
      // Scroll it away again → goes out.
      await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
      await waitFor(() => card.evaluate((el) => !el.classList.contains('is-lit')), 'card scrolled away was not extinguished');
      noProblems(mon, 'flame mobile');
    });
  }
  await context.close();
}

// ───────────────────────────── 4. reduced motion ─────────────────────────────
async function testReducedMotion(browser, vpName) {
  const context = await browser.newContext({ ...VIEWPORTS[vpName], reducedMotion: 'reduce' });
  const page = await context.newPage();
  const mon = monitor(page);
  await check(`[${vpName}] reduced motion: no motion-ok, hero headline visible at once`, async () => {
    mon.state.navigating = true;
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    mon.state.navigating = false;
    const early = await page.evaluate(() => {
      const h1 = document.querySelector('#hero-title');
      return { cls: document.documentElement.className, opacity: h1 && getComputedStyle(h1).opacity, text: h1?.textContent };
    });
    assert(!/\bmotion-ok\b/.test(early.cls), `html has motion-ok with reduced motion: "${early.cls}"`);
    assert(early.opacity === '1', `hero h1 opacity at DOMContentLoaded is ${early.opacity}`);
    assert(/Light up your moments\./.test(early.text || ''), `hero text: "${early.text}"`);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const late = await page.evaluate(() => {
      const h1 = document.querySelector('#hero-title');
      const hidden = Array.from(h1.querySelectorAll('*')).filter((e) => Number(getComputedStyle(e).opacity) < 1).length;
      return { opacity: getComputedStyle(h1).opacity, text: h1.innerText, hidden, state: h1.dataset.islandState };
    });
    assert(late.opacity === '1' && late.hidden === 0, `hero h1 not fully visible after load (opacity ${late.opacity}, ${late.hidden} faded children)`);
    assert(/Light up your moments\./.test(late.text), `hero visible text after load: "${late.text}"`);
    noProblems(mon, 'reduced-motion home');
  });

  await check(`[${vpName}] reduced motion: candle still lights (is-lit) and the flame does not animate`, async () => {
    await goto(page, mon, '/shop');
    const card = page.locator(CANDLE_CARD).first();
    if (vpName === 'desktop') {
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3, { steps: 4 });
    } else {
      await card.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    }
    await waitFor(() => card.evaluate((el) => el.classList.contains('is-lit')), 'card did not light with reduced motion');
    await page.waitForTimeout(300);
    const anim = await card.locator('.flame-outer').evaluate((el) => ({
      running: el.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name),
      name: getComputedStyle(el).animationName,
      inlineFlicker: el.closest('[data-candle]').style.getPropertyValue('--flicker-scale'),
    }));
    assert(anim.running.length === 0 || anim.name === 'none', `flame-outer animating with reduced motion: ${JSON.stringify(anim)}`);
    assert(!anim.inlineFlicker, `JS flicker loop ran with reduced motion (--flicker-scale=${anim.inlineFlicker})`);
    if (vpName === 'desktop') {
      await page.mouse.move(2, 450, { steps: 4 });
      await waitFor(() => card.evaluate((el) => !el.classList.contains('is-lit')), 'card did not go out after leaving');
      assert(!(await card.evaluate((el) => el.classList.contains('is-out'))), 'smoke (is-out) shown with reduced motion');
    }
    noProblems(mon, 'reduced-motion shop');
  });
  await context.close();
}

// ───────────────────────────── 5. evening mode ─────────────────────────────
async function testEvening(browser, vpName) {
  const context = await browser.newContext(VIEWPORTS[vpName]);
  const page = await context.newPage();
  const mon = monitor(page);
  await check(`[${vpName}] evening mode: toggle visible, on → persists after reload → off`, async () => {
    await goto(page, mon, '/');
    await page.evaluate((k) => localStorage.removeItem(k), EVENING_KEY);
    await goto(page, mon, '/');
    const toggle = page.locator('[data-evening-toggle]');
    await toggle.waitFor({ state: 'visible', timeout: 5000 });
    const html = page.locator('html');
    assert((await html.getAttribute('data-evening')) === null, 'evening mode should start off');
    assert((await toggle.getAttribute('aria-pressed')) === 'false', 'aria-pressed should start false');
    await toggle.click();
    await waitFor(async () => (await html.getAttribute('data-evening')) !== null, 'html[data-evening] not set');
    assert((await toggle.getAttribute('aria-pressed')) === 'true', 'aria-pressed not true after turning on');
    await goto(page, mon, '/');
    assert((await html.getAttribute('data-evening')) !== null, 'evening mode did not persist after reload');
    assert((await toggle.getAttribute('aria-pressed')) === 'true', 'aria-pressed not true after reload');
    await toggle.click();
    await waitFor(async () => (await html.getAttribute('data-evening')) === null, 'html[data-evening] not removed');
    assert((await toggle.getAttribute('aria-pressed')) === 'false', 'aria-pressed not false after turning off');
    await goto(page, mon, '/');
    assert((await html.getAttribute('data-evening')) === null, 'evening mode came back after reload when off');
    noProblems(mon, 'evening');
  });
  await context.close();
}

// ───────────────────────────── run ─────────────────────────────
async function main() {
  console.log(`Candle Obsession e2e → ${BASE}\n`);
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    for (const vp of Object.keys(VIEWPORTS)) {
      console.log(`\n── ${vp} ──`);
      if (want('pages')) await testPages(browser, vp);
      if (want('cart')) await testCartFlow(browser, vp);
      if (want('flame')) await testFlame(browser, vp);
      if (want('reduced')) await testReducedMotion(browser, vp);
      if (want('evening')) await testEvening(browser, vp);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n════════ SUMMARY ════════');
  for (const r of results) console.log(`${r.ok ? 'PASS' : r.skipped ? 'SKIP' : 'FAIL'}  ${r.name}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed.`);
  if (notes.length) console.log(`\nNotes:\n${notes.map((n) => `- ${n}`).join('\n')}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const r of failed) console.log(`- ${r.name}\n    ${r.message}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error('e2e crashed:', err);
  process.exitCode = 2;
});
