// Real cancelled page (real CSP header); only the Retry POST response is replaced by a 302 to an external "provider".
import { chromium } from 'playwright';
const ref = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('  [console]', m.type(), m.text()));
await page.route('**/order/cancelled/**', (route) => {
  if (route.request().method() === 'POST') return route.fulfill({ status: 302, headers: { location: process.env.TARGET ?? 'https://pay.test/session' } });
  return route.continue();
});
await page.route('https://pay.test/**', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: '<h1>PAYMENT PAGE</h1>' }));
await page.goto(`http://localhost:5199/order/cancelled/${ref}`);
await page.click('form button[type=submit]');
await page.waitForTimeout(2000);
console.log('url after retry:', page.url());
await browser.close();
