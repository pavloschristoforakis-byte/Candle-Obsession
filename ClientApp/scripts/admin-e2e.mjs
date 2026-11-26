// Browser test for the admin product editor (/admin/products), with plain Playwright + Chromium.
//
// IT CHANGES DATA: it adds, edits and deletes a test product and uploads a test photo. Run it against a
// throw-away copy of the catalogue, never the live site:
//
//   Catalog__Path=/tmp/co-test/products.json Catalog__ImagesPath=/tmp/co-test/images \
//   ConnectionStrings__DefaultConnection="Data Source=/tmp/co-test/test.db" Admin__Password=<16+ chars> \
//   dotnet run --environment Development --urls http://localhost:5300
//
//   E2E_BASE_URL=http://localhost:5300 E2E_ADMIN_PASSWORD=<same password> npm run test:admin
//   E2E_HEADED=1 ...   (watch it run)      E2E_SHOTS=dir ...   (save screenshots there)
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:5300').replace(/\/$/, '');
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const HEADED = !!process.env.E2E_HEADED;
const SHOTS = process.env.E2E_SHOTS || '';
if (!PASSWORD) {
  console.error('Set E2E_ADMIN_PASSWORD to the admin password of the TEST site.');
  process.exit(2);
}
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const message = (err?.message ?? String(err)).split('\n').slice(0, 8).join('\n        ');
    results.push({ name, ok: false, message });
    console.log(`  FAIL  ${name}\n        ${message}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

// A real photo-sized JPEG (a "candle" with a bright wick near the top) made on the fly.
async function testPhoto(width = 1600, height = 1200) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#e9d8c3"/>
    <rect x="${width / 2 - 160}" y="${height * 0.35}" width="320" height="${height * 0.5}" rx="24" fill="#f6b8c4"/>
    <rect x="${width / 2 - 4}" y="${height * 0.3}" width="8" height="${height * 0.06}" fill="#3a2a20"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).withMetadata({ exif: { IFD0: { Copyright: 'e2e', Artist: 'should be stripped' } } }).toBuffer();
}

async function login(page) {
  await page.goto(`${BASE}/admin/login?returnUrl=/admin/products`);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/\/admin\/products/), page.click('button[type="submit"]')]);
  await page.waitForSelector('.pa-list > li');
}

/** Calls an editor handler from inside the page, the same way the editor does. */
async function api(page, handler, body, { token = true } = {}) {
  return page.evaluate(
    async ({ handler, body, token }) => {
      const root = document.querySelector('[data-island="product-admin"]');
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (token) headers.RequestVerificationToken = root.dataset.token;
      const res = await fetch(`/admin/products?handler=${handler}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* not JSON */
      }
      return { status: res.status, redirected: res.redirected, json };
    },
    { handler, body, token },
  );
}

const field = (page, label) => page.getByLabel(label, { exact: true });

async function run(label, contextOptions) {
  console.log(`\n=== ${label} ===`);
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const name = `E2E ${label} Candle`;
  const slug = `e2e-${label}-candle`;
  let uploadedFile = null;

  await check(`[${label}] logged-out visitors are sent to the login page, and can't call the editor`, async () => {
    const res = await page.goto(`${BASE}/admin/products`);
    expect(page.url().includes('/admin/login'), `expected the login page, got ${page.url()}`);
    expect(res.status() === 200, 'login page should load');
    const data = await context.request.get(`${BASE}/admin/products?handler=Data`, { maxRedirects: 0 });
    expect(data.status() === 302, `Data without login should redirect, got ${data.status()}`);
    const save = await context.request.post(`${BASE}/admin/products?handler=Save`, { data: {}, maxRedirects: 0 });
    expect([302, 400, 401].includes(save.status()), `Save without login should be refused, got ${save.status()}`);
  });

  await check(`[${label}] log in → product list loads with every product`, async () => {
    await login(page);
    // Clear anything an earlier, interrupted run left behind.
    const leftovers = (await api(page, 'Data')).json.products.filter((p) => p.name === name);
    for (const p of leftovers) await api(page, 'Delete', { id: p.id });
    if (leftovers.length) await page.reload();
    await page.waitForSelector('.pa-list > li');
    const count = await page.locator('.pa-list > li').count();
    expect(count >= 20, `expected the catalogue in the list, saw ${count} rows`);
    await shot(page, `${label}-list`);
  });

  await check(`[${label}] a save without the anti-forgery token is refused`, async () => {
    const res = await api(page, 'Save', { originalId: null, product: { name: 'No token' } }, { token: false });
    expect(res.status === 400, `expected 400, got ${res.status}`);
  });

  await check(`[${label}] every existing product passes the editor's checks unchanged`, async () => {
    const data = await api(page, 'Data');
    expect(data.status === 200 && data.json.products.length >= 20, 'Data should return the products');
    const failures = [];
    for (const product of data.json.products) {
      const res = await api(page, 'Save', { originalId: product.id, product });
      if (res.status !== 200) failures.push(`${product.id}: ${JSON.stringify(res.json?.errors ?? res.status)}`);
    }
    expect(failures.length === 0, `these products were rejected:\n${failures.join('\n')}`);
    const after = await api(page, 'Data');
    for (const before of data.json.products) {
      const now = after.json.products.find((p) => p.id === before.id);
      expect(JSON.stringify(now) === JSON.stringify(before), `${before.id} changed after an unchanged save:\n${JSON.stringify(before)}\n→\n${JSON.stringify(now)}`);
    }
  });

  await check(`[${label}] the server refuses bad input (script link, unknown photo, negative price)`, async () => {
    const res = await api(page, 'Save', {
      originalId: null,
      product: {
        name: 'Bad', category: 'candles', type: 'candle', stockStatus: 'in_stock', priceEur: -5,
        paymentLink: 'javascript:alert(1)', images: [{ file: '../../etc/passwd', alt: 'x' }],
        variants: [{ name: 'Red', swatch: 'red;background:url(//evil)' }],
      },
    });
    expect(res.status === 400, `expected 400, got ${res.status}`);
    const fields = res.json.errors.map((e) => e.field);
    for (const f of ['priceEur', 'paymentLink', 'images.0', 'variants.0.swatch']) expect(fields.includes(f), `missing error for ${f}: ${fields.join(', ')}`);
    const list = await api(page, 'Data');
    expect(!list.json.products.some((p) => p.name === 'Bad'), 'the bad product must not be saved');
  });

  await check(`[${label}] add a product: empty name shows an error, then fill the form`, async () => {
    await page.reload();
    await page.waitForSelector('.pa-list > li');
    await page.getByRole('button', { name: 'Add a product' }).click();
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await page.waitForSelector('.pa-errors');
    expect((await page.locator('.pa-errors').innerText()).includes('Give the product a name'), 'expected the name error');
    await field(page, 'Name').fill(name);
    await field(page, 'Short description').fill('A test candle made by the browser test.');
    await field(page, 'Price').fill('9.5');
    await field(page, 'Scent words').fill('Test vanilla, Test cocoa');
    await field(page, 'Scent words').press('Enter');
    expect((await page.locator('.pa-chips li').count()) === 2, 'two scent words should be added');
  });

  await check(`[${label}] upload a photo: crop, upload, and it is added to the product`, async () => {
    await page.getByRole('button', { name: 'Add or upload photos' }).click();
    await page.waitForSelector('dialog.pa-dialog[open]');
    await page.setInputFiles('dialog.pa-dialog input[type="file"]', { name: 'My Candle Photo.jpg', mimeType: 'image/jpeg', buffer: await testPhoto() });
    await page.waitForSelector('.pa-crop-frame');
    await shot(page, `${label}-crop`);
    // Move the crop frame with the keyboard, then upload.
    await page.locator('.pa-crop-frame').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Upload this photo' }).click();
    await page.waitForSelector('.pa-library li.is-selected', { timeout: 30000 });
    uploadedFile = (await page.locator('.pa-library li.is-selected img').first().getAttribute('src')).match(/products\/(.+)-400\.webp/)[1];
    expect(/^e2e-.*-candle-[0-9a-f]{6}$/.test(uploadedFile), `unexpected file name ${uploadedFile}`);
    await shot(page, `${label}-library`);
    await page.getByRole('button', { name: 'Done' }).click();
    expect((await page.locator('.pa-photos > li').count()) === 1, 'the photo should be on the product');
    for (const suffix of ['-400.webp', '-800.webp', '-1200.webp', '-og.jpg']) {
      const res = await context.request.get(`${BASE}/images/products/${uploadedFile}${suffix}`);
      expect(res.status() === 200, `${suffix} should be served, got ${res.status()}`);
      const meta = await sharp(await res.body()).metadata();
      const [w, h] = suffix === '-og.jpg' ? [1200, 630] : [Number(suffix.slice(1, -5)), (Number(suffix.slice(1, -5)) * 5) / 4];
      expect(meta.width === w && meta.height === h, `${suffix} is ${meta.width}x${meta.height}, expected ${w}x${h}`);
      expect(!meta.exif, `${suffix} still has camera data (EXIF)`);
    }
  });

  await check(`[${label}] a file that is not a photo is refused`, async () => {
    await page.getByRole('button', { name: 'Add or upload photos' }).click();
    await page.waitForSelector('dialog.pa-dialog[open]');
    await page.setInputFiles('dialog.pa-dialog input[type="file"]', { name: 'evil.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.padEnd(200, ' ')) });
    await page.getByRole('button', { name: 'Upload this photo' }).click();
    await page.waitForSelector('dialog.pa-dialog .form-message');
    expect((await page.locator('dialog.pa-dialog .form-message').innerText()).includes("isn't a photo"), 'expected the not-a-photo message');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
  });

  await check(`[${label}] place the flame on the photo and see it in the preview`, async () => {
    await page.getByRole('button', { name: 'Place the flame' }).click();
    await page.getByRole('switch', { name: /The wick is visible/ }).check({ force: true });
    const media = page.locator('.pa-flame-media');
    const box = await media.boundingBox();
    await media.click({ position: { x: box.width * 0.5, y: box.height * 0.25 } });
    const style = await page.locator('.pa-flame-card').getAttribute('style');
    expect(/--flame-x:\s*5\d/.test(style) && /--flame-y:\s*2\d/.test(style), `flame not placed where clicked: ${style}`);
    await field(page, 'Flame size').fill('1.4');
    expect((await page.locator('.pa-preview-card .wick-flame').count()) === 1, 'the preview card should show one flame');
    await page.getByRole('button', { name: 'Light it' }).click();
    expect(await page.locator('.pa-preview-card.is-lit').count(), 'the preview should light');
    await shot(page, `${label}-editor`);
  });

  await check(`[${label}] save → it appears in the shop, on its own page and in the cart data`, async () => {
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await page.waitForSelector('.pa-ok');
    expect((await page.locator('.pa-list').innerText()).includes(name), 'the new product should be in the list');
    const productPage = await context.request.get(`${BASE}/products/${slug}`);
    expect(productPage.status() === 200, `product page should exist, got ${productPage.status()}`);
    const html = await productPage.text();
    // Razor writes the euro sign as &#x20AC; in HTML, so look for the amount.
    expect(/(€|&#x20AC;)9\.50/.test(html), 'the product page should show €9.50');
    expect(html.includes(`${uploadedFile}-1200.webp`), 'the product page should use the uploaded photo');
    expect(/--flame-scale:1\.4/.test(html), 'the product page should use the flame size');
    const shop = await (await context.request.get(`${BASE}/shop`)).text();
    expect(shop.includes(name) && shop.includes(`data-product-id="${slug}"`), 'the shop should list it with an Add to cart button');
    expect(shop.includes(`"id":"${slug}"`), 'the cart data should include it');
    const sitemap = await (await context.request.get(`${BASE}/sitemap.xml`)).text();
    expect(sitemap.includes(`/products/${slug}`), 'the sitemap should include it');
  });

  await check(`[${label}] the shop charges the saved price (server-side) for the new product`, async () => {
    const shopper = await browser.newContext();
    const sp = await shopper.newPage();
    await sp.goto(`${BASE}/checkout`);
    const result = await sp.evaluate(async (id) => {
      const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
      const res = await fetch('/Checkout?handler=PlaceOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
        body: JSON.stringify({
          firstName: 'E2E', lastName: 'Admin', email: 'e2e@example.com', phone: '99000000', deliveryMethod: 'pickup', paymentMethod: 'cash',
          acceptTerms: true, giftWrap: false, ageConfirmed: false, idempotencyKey: `e2e-${id}-${Math.random()}`, items: [{ productId: id, quantity: 2 }],
        }),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    }, slug);
    await shopper.close();
    expect(result.status === 200 && result.json?.total === 19, `expected a €19 order, got ${JSON.stringify(result)}`);
  });

  await check(`[${label}] edit: change the price, turn animations off, hide it → gone from the shop`, async () => {
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await field(page, 'Price').fill('11');
    await page.getByRole('switch', { name: /Light the candle/ }).uncheck({ force: true });
    await page.getByRole('switch', { name: /Tilt and spotlight/ }).uncheck({ force: true });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForSelector('.pa-ok');
    let shop = await (await context.request.get(`${BASE}/shop`)).text();
    const card = shop.slice(shop.lastIndexOf('<article', shop.indexOf(`>${name}<`)), shop.indexOf(`>${name}<`));
    expect(/(€|&#x20AC;)11\.00/.test(shop), 'the shop should show the new price');
    expect(!card.includes('is-candle') && card.includes('data-tilt="off"'), `the card should have no flame and no tilt: ${card.slice(0, 300)}`);

    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('switch', { name: /Show on the website/ }).uncheck({ force: true });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForSelector('.pa-ok');
    shop = await (await context.request.get(`${BASE}/shop`)).text();
    expect(!shop.includes(name), 'a hidden product must not be in the shop');
    expect((await context.request.get(`${BASE}/products/${slug}`)).status() === 404, 'a hidden product page should be 404');
    expect((await page.locator('.pa-list').innerText()).includes(name), 'a hidden product stays in the admin list');
  });

  await check(`[${label}] the order arrows move a product`, async () => {
    const before = await page.locator('.pa-list-name').allInnerTexts();
    await page.getByRole('button', { name: `Move ${name} earlier` }).click();
    await page.waitForFunction((n) => {
      const names = [...document.querySelectorAll('.pa-list-name')].map((e) => e.textContent);
      return names.indexOf(n) === names.length - 2;
    }, name);
    await page.getByRole('button', { name: `Move ${name} later` }).click();
    await page.waitForFunction((n) => [...document.querySelectorAll('.pa-list-name')].pop().textContent === n, name);
    expect(JSON.stringify(await page.locator('.pa-list-name').allInnerTexts()) === JSON.stringify(before), 'order should be back to the start');
  });

  await check(`[${label}] no accessibility violations in the list, the editor and the photo dialog`, async () => {
    const scan = async (what) => {
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.length === 0, `${what}: ${violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].html.slice(0, 160)}`).join('\n')}`);
    };
    await scan('list');
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await page.waitForSelector('.pa-editor');
    await scan('editor');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow <= 1, `the editor scrolls sideways by ${overflow}px`);
    await page.getByRole('button', { name: 'Add or upload photos' }).click();
    await page.waitForSelector('dialog.pa-dialog[open]');
    await scan('photo dialog');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.pa-dialog', { state: 'detached' });
  });

  await check(`[${label}] a photo in use can't be deleted; delete the product, then the photo`, async () => {
    const inUse = await api(page, 'DeleteImage', { file: uploadedFile });
    expect(inUse.status === 400, `deleting a used photo should be refused, got ${inUse.status}`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete this product' }).click();
    await page.waitForSelector('.pa-ok');
    expect(!(await page.locator('.pa-list').innerText()).includes(name), 'the product should be gone from the list');
    const gone = await api(page, 'DeleteImage', { file: uploadedFile });
    expect(gone.status === 200, `deleting the unused photo should work, got ${gone.status} ${JSON.stringify(gone.json)}`);
    expect((await context.request.get(`${BASE}/images/products/${uploadedFile}-800.webp`)).status() === 404, 'the photo file should be gone');
    const builtIn = await api(page, 'DeleteImage', { file: 'apple-pie-1' });
    expect(builtIn.status === 400, 'a photo used by Apple Pie must not be deletable');
  });

  await check(`[${label}] backup download is the full catalogue; no console errors`, async () => {
    const res = await context.request.get(`${BASE}/admin/products?handler=Export`);
    expect(res.status() === 200 && (res.headers()['content-disposition'] ?? '').includes('products.json'), 'expected a products.json download');
    const doc = JSON.parse(await res.text());
    expect(doc.products.length >= 20 && doc.categories.length > 0 && typeof doc.$comment === 'string', 'the backup should have products, categories and the file comment');
    expect(!('isCandle' in doc.products[0]) && !('url' in doc.products[0]), 'computed fields must not be written to the file');
    const real = consoleErrors.filter((e) => !/status of 40[04]/.test(e));
    expect(real.length === 0, `console errors:\n${real.join('\n')}`);
  });

  await browser.close();
}

await run('desktop', { viewport: { width: 1440, height: 900 } });
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed.`);
process.exit(failed.length ? 1 : 0);
