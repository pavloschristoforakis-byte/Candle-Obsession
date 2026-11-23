// Accessibility audit: axe-core (WCAG 2.0/2.1 A + AA) on key pages at desktop + mobile, plus a keyboard pass.
// Usage (from ClientApp):  node scripts/a11y.mjs [baseUrl]
// Writes a JSON report to ClientApp/screenshots/a11y-report.json and prints a summary.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/$/, '');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../screenshots');
fs.mkdirSync(outDir, { recursive: true });

const CART = JSON.stringify([{ key: 'apple-pie||', productId: 'apple-pie', quantity: 1 }]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const pages = [
  { name: 'home', url: '/' },
  { name: 'shop', url: '/shop' },
  { name: 'product-macademia', url: '/products/macademia-vanilla' },
  { name: 'product-teddy', url: '/products/teddy-bear-candle' },
  { name: 'cart', url: '/cart', cart: true },
  { name: 'checkout', url: '/checkout', cart: true },
  { name: 'returns', url: '/returns' },
  { name: 'withdraw', url: '/withdraw' },
  { name: 'drawer-open', url: '/', cart: true, drawer: true },
];

const viewports = {
  desktop: { viewport: { width: 1366, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const report = { base: BASE, axe: [], keyboard: {}, errors: [] };

async function newPage(browser, vp, withCart) {
  const ctx = await browser.newContext(viewports[vp]);
  if (withCart) await ctx.addInitScript((c) => { try { localStorage.setItem('co.cart.v2', c); } catch {} }, CART);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push({ vp, url: page.url(), text: m.text() }); });
  page.on('pageerror', (e) => report.errors.push({ vp, url: page.url(), text: String(e) }));
  return { ctx, page };
}

// Known issue check: does the FIRST activation of the cart icon open the drawer? Retry once so the drawer can still be audited.
report.drawerFirstActivation = [];
async function openDrawer(page, activate, label) {
  await activate();
  const ok = await page.waitForSelector('.cart-drawer[role=dialog]', { timeout: 2500 }).then(() => true, () => false);
  report.drawerFirstActivation.push({ label, opened: ok, url: page.url() });
  if (!ok) {
    await activate();
    await page.waitForSelector('.cart-drawer[role=dialog]', { timeout: 5000 });
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // Scroll through so lazily-mounted islands / reveal-on-scroll content is present, then back to top.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200); // let entrance animations (BlurText, reveal) finish so contrast is measured on final state
}

async function runAxe(browser) {
  for (const vp of Object.keys(viewports)) {
    for (const p of pages) {
      const { ctx, page } = await newPage(browser, vp, p.cart);
      try {
        await page.goto(BASE + p.url, { waitUntil: 'load' });
        await settle(page);
        if (p.drawer) {
          await openDrawer(page, () => page.click('#cart-link'), `${p.name}/${vp}`);
          await page.waitForTimeout(800);
        }
        const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        for (const v of res.violations) {
          report.axe.push({
            page: p.name, vp, id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n').slice(0, 3).join(' | ') })),
          });
        }
        report.axe.push({ page: p.name, vp, ok: true, violations: res.violations.length, incomplete: res.incomplete.map((i) => `${i.id}(${i.nodes.length})`) });
        await page.screenshot({ path: path.join(outDir, `a11y-${p.name}-${vp}.png`) });
      } catch (e) {
        report.errors.push({ vp, page: p.name, text: 'audit failed: ' + e.message });
      } finally {
        await ctx.close();
      }
    }
  }
}

// Describe the focused element + whether it has a visible focus indicator.
async function focusInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: 'body' };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const ring = cs.boxShadow && cs.boxShadow !== 'none';
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    return {
      tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''),
      label,
      visibleFocus: outline || ring,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
      inDrawer: !!el.closest('.cart-drawer'),
    };
  });
}

async function tabSeq(page, n) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(40);
    seq.push(await focusInfo(page));
  }
  return seq;
}

async function keyboard(browser) {
  // Home: skip link, header, first product cards.
  {
    const { ctx, page } = await newPage(browser, 'desktop', true);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.keyboard.press('Tab');
    const first = await focusInfo(page);
    const skipVisible = await page.evaluate(() => {
      const a = document.activeElement; const r = a.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.top >= 0 && getComputedStyle(a).clipPath === 'none';
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const afterSkip = await page.evaluate(() => ({ active: document.activeElement?.id || document.activeElement?.tagName, hash: location.hash }));
    await page.keyboard.press('Tab');
    const afterSkipNext = await focusInfo(page);
    // Fresh load for full order
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const seq = await tabSeq(page, 30);
    await page.screenshot({ path: path.join(outDir, 'kbd-home-after30tabs.png') });
    report.keyboard.home = { first, skipVisible, afterSkip, afterSkipNext, seq };
    await ctx.close();
  }
  // Checkout form order.
  {
    const { ctx, page } = await newPage(browser, 'desktop', true);
    await page.goto(BASE + '/checkout', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.focus('#firstName');
    const seq = [await focusInfo(page), ...(await tabSeq(page, 28))];
    report.keyboard.checkout = { seq };
    await ctx.close();
  }
  // Drawer: must trap focus, Esc closes, focus returns to cart icon.
  {
    const { ctx, page } = await newPage(browser, 'desktop', true);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await openDrawer(page, async () => { await page.focus('#cart-link'); await page.keyboard.press('Enter'); }, 'keyboard');
    await page.waitForTimeout(500);
    const opened = await focusInfo(page);
    const seq = await tabSeq(page, 15);
    const back = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(40); back.push(await focusInfo(page)); }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const afterEsc = await focusInfo(page);
    const stillOpen = await page.$('.cart-drawer[role=dialog]');
    report.keyboard.drawer = { opened, escaped: seq.some((s) => !s.inDrawer) || back.some((s) => !s.inDrawer), seq, back, afterEsc, closed: !stillOpen };
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  await runAxe(browser);
  await keyboard(browser);
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(outDir, 'a11y-report.json'), JSON.stringify(report, null, 2));

// Summary
console.log('=== axe violations ===');
for (const v of report.axe.filter((x) => !x.ok)) {
  console.log(`[${v.vp}] ${v.page}: ${v.id} (${v.impact}) - ${v.help}`);
  for (const n of v.nodes.slice(0, 6)) console.log(`    ${n.target}  :: ${n.summary}`);
  if (v.nodes.length > 6) console.log(`    ... +${v.nodes.length - 6} more`);
}
console.log('=== per page ===');
for (const v of report.axe.filter((x) => x.ok)) console.log(`[${v.vp}] ${v.page}: ${v.violations} violations; incomplete: ${v.incomplete.join(', ')}`);
console.log('=== keyboard ===');
const fmt = (s) => `${s.tag} "${s.label}" focus=${s.visibleFocus ? 'Y' : 'N'}${s.onScreen === false ? ' OFFSCREEN' : ''}${s.inDrawer ? ' [drawer]' : ''}`;
const k = report.keyboard;
console.log('home first tab:', fmt(k.home.first), 'skipVisible=', k.home.skipVisible, 'afterSkip=', JSON.stringify(k.home.afterSkip), 'next=', fmt(k.home.afterSkipNext));
k.home.seq.forEach((s, i) => console.log(`  home ${i + 1}: ${fmt(s)}`));
k.checkout.seq.forEach((s, i) => console.log(`  checkout ${i}: ${fmt(s)}`));
console.log('drawer opened focus:', fmt(k.drawer.opened), 'escapedTrap=', k.drawer.escaped, 'closedOnEsc=', k.drawer.closed, 'afterEsc=', fmt(k.drawer.afterEsc));
k.drawer.seq.forEach((s, i) => console.log(`  drawer tab ${i + 1}: ${fmt(s)}`));
k.drawer.back.forEach((s, i) => console.log(`  drawer shift-tab ${i + 1}: ${fmt(s)}`));
console.log('=== drawer first activation ===');
for (const d of report.drawerFirstActivation) console.log(JSON.stringify(d));
console.log('=== console errors ===');
for (const e of report.errors) console.log(JSON.stringify(e));
