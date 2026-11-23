// Visual QA: full-page screenshots of the main pages at desktop + mobile, plus a few effect states.
// Usage (from ClientApp, with the site running):  node scripts/screenshots.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:5199').replace(/\/$/, '');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
const CART = [
  { key: 'macademia-vanilla||', productId: 'macademia-vanilla', quantity: 1 },
  { key: 'apple-pie||', productId: 'apple-pie', quantity: 2 },
];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const log = (...a) => console.log('[shots]', ...a);
const issues = [];

async function settle(page, { scroll = true } = {}) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  if (scroll) {
    // Walk the page so lazy images and scroll-reveal effects fire, then return to the top.
    // html has scroll-behavior: smooth, so scroll with behavior 'instant' or the walk lags behind.
    await page.evaluate(async () => {
      const to = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      const step = Math.max(200, Math.floor(window.innerHeight * 0.6));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        to(y);
        await new Promise((r) => setTimeout(r, 250));
      }
      to(document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      to(0);
    });
    await page.waitForTimeout(1200); // let .reveal transitions (0.8s) finish
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 4000); })));
  }).catch(() => {});
  await page.waitForTimeout(800);
}

async function audit(page, label) {
  // Cheap layout checks to go with the screenshots: horizontal overflow and broken images.
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
      if (b.right > vw + 1 || b.left < -1) {
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) {
          const ps = getComputedStyle(p);
          if (/(hidden|clip|auto|scroll)/.test(ps.overflowX)) { clipped = true; break; }
          p = p.parentElement;
        }
        if (!clipped) over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} [${Math.round(b.left)}..${Math.round(b.right)}]`);
      }
    }
    const broken = Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').map((i) => i.currentSrc || i.src);
    return { scrollW: document.documentElement.scrollWidth, vw, over: over.slice(0, 8), broken };
  });
  if (r.scrollW > r.vw + 1 || r.over.length || r.broken.length) {
    issues.push({ label, ...r });
    log('  !', label, JSON.stringify(r));
  }
}

async function newPage(browser, vp, { cart = false, reducedMotion = 'no-preference', evening = false, hasTouch = false } = {}) {
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion, hasTouch, isMobile: hasTouch });
  await context.addInitScript(({ cart, evening, CART }) => {
    try {
      if (cart && !sessionStorage.getItem('qa.cartSeeded')) {
        localStorage.setItem('co.cart.v2', JSON.stringify(CART));
        sessionStorage.setItem('qa.cartSeeded', '1');
      }
      if (evening) localStorage.setItem('co.evening', '1');
    } catch { /* ignore */ }
  }, { cart, evening, CART });
  const page = await context.newPage();
  page.on('pageerror', (e) => log('  pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') log('  console.error:', m.text().slice(0, 200)); });
  return { context, page };
}

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'allow', ...opts });
  log('saved', path.relative(process.cwd(), file));
}

async function placeOrder(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS.desktop, { cart: true });
  await page.goto(`${BASE}/checkout`);
  await settle(page, { scroll: false });
  await page.fill('#firstName', 'QA');
  await page.fill('#lastName', 'Screenshot');
  await page.fill('#email', 'qa@example.com');
  await page.fill('#phone', '+35799000000');
  const pickup = page.locator('input[name="deliveryMethod"][value="pickup"]');
  if (await pickup.count()) await pickup.check({ force: true });
  const cash = page.locator('input[name="paymentMethod"][value="cash"]');
  if (await cash.count() && await cash.isEnabled()) await cash.check({ force: true });
  else await page.locator('input[name="paymentMethod"][value="revolut"]').check({ force: true }).catch(() => {});
  await page.locator('input[name="acceptTerms"]').check({ force: true });
  await Promise.all([
    page.waitForURL(/\/order\/success\//, { timeout: 15000 }).catch(() => {}),
    page.click('[data-place-order]'),
  ]);
  let url = page.url();
  if (!/\/order\/success\//.test(url)) {
    log('  UI order did not redirect; message:', await page.locator('#checkout-message').textContent().catch(() => ''));
    url = null;
  }
  await context.close();
  log('order success url:', url);
  return url;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const successUrl = await placeOrder(browser);

  const pages = [
    ['home', '/'],
    ['shop', '/shop'],
    ['product-macademia-vanilla', '/products/macademia-vanilla'],
    ['product-teddy-bear-candle', '/products/teddy-bear-candle'],
    ['product-gift-box-wine-glasses', '/products/gift-box-wine-glasses'],
    ['cart', '/cart', { cart: true }],
    ['checkout', '/checkout', { cart: true }],
    ['order-success', successUrl, {}],
    ['returns', '/returns'],
    ['withdraw', '/withdraw'],
    ['404', '/this-page-does-not-exist'],
  ];

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const [name, url, opts = {}] of pages) {
      if (!url) { log('skip', name); continue; }
      const { context, page } = await newPage(browser, vp, { ...opts, hasTouch: vpName === 'mobile' });
      const target = url.startsWith('http') ? url : `${BASE}${url}`;
      let res = await page.goto(target);
      if (res && res.status() === 429) {
        // /checkout and /withdraw share the "forms" rate limit (10/min), even for GET. Wait it out.
        log('  429 on', name, '- waiting 61s for the rate limit window');
        await page.waitForTimeout(61000);
        res = await page.goto(target);
      }
      await settle(page);
      await audit(page, `${name}-${vpName}`);
      await shot(page, `${name}-${vpName}`);
      await context.close();
    }
  }

  // Hovered candle card (desktop), cropped to the card.
  {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop);
    await page.goto(`${BASE}/`);
    await settle(page);
    const card = page.locator('[data-product-card].is-candle').first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await card.hover();
    await page.waitForTimeout(1500);
    await card.screenshot({ path: path.join(OUT, 'home-card-hover-desktop.png') });
    // A little context around the card too (to see the glow and spotlight).
    const box = await card.boundingBox();
    if (box) {
      await page.screenshot({
        path: path.join(OUT, 'home-card-hover-context-desktop.png'),
        clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 60), width: box.width + 120, height: box.height + 120 },
      });
    }
    // Leave the card and capture the smoke.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(350);
    await card.screenshot({ path: path.join(OUT, 'home-card-unhover-smoke-desktop.png') });
    log('saved card hover shots');
    await context.close();
  }

  // Evening mode, both viewports.
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp, { evening: true, hasTouch: vpName === 'mobile' });
    await page.goto(`${BASE}/`);
    await settle(page);
    if (vpName === 'desktop') { await page.mouse.move(700, 400); await page.waitForTimeout(400); }
    await shot(page, `home-evening-${vpName}`);
    await page.screenshot({ path: path.join(OUT, `home-evening-viewport-${vpName}.png`) });
    await context.close();
  }

  // Gift-box reveal after opening.
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp, { hasTouch: vpName === 'mobile' });
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const section = page.locator('#gift-sets');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await section.screenshot({ path: path.join(OUT, `home-gift-sets-open-${vpName}.png`) });
    log('saved gift sets', vpName);
    await context.close();
  }

  // Cart drawer open (desktop), and mobile for good measure.
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp, { cart: true, hasTouch: vpName === 'mobile' });
    await page.goto(`${BASE}/shop`);
    await settle(page, { scroll: false });
    await page.click('[data-cart-open]');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `cart-drawer-${vpName}.png`) });
    log('saved cart drawer', vpName, 'url now', page.url());
    await context.close();
  }

  // Add-to-cart ember (mid-flight) on desktop.
  {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop);
    await page.goto(`${BASE}/shop`);
    await settle(page, { scroll: false });
    const btn = page.locator('[data-add-to-cart]').first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'add-to-cart-ember-desktop.png') });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'add-to-cart-after-desktop.png') });
    await context.close();
  }

  // Reduced motion home.
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp, { reducedMotion: 'reduce', hasTouch: vpName === 'mobile' });
    await page.goto(`${BASE}/`);
    await settle(page);
    await shot(page, `home-reduced-motion-${vpName}`);
    await context.close();
  }

  // Mobile nav open (if there is a menu button).
  {
    const { context, page } = await newPage(browser, VIEWPORTS.mobile, { hasTouch: true });
    await page.goto(`${BASE}/`);
    await settle(page, { scroll: false });
    const toggle = page.locator('[aria-controls], .nav-toggle, [data-nav-toggle]').filter({ hasNot: page.locator('[data-cart-open]') }).first();
    if (await toggle.count() && await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, 'nav-open-mobile.png') });
      log('saved nav open mobile');
    }
    await context.close();
  }

  await browser.close();
  log('done. layout issues:', issues.length);
  if (issues.length) console.log(JSON.stringify(issues, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
