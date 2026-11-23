// Does CSP form-action 'self' (as sent by Program.cs) block a form POST that 302-redirects to an external payment page?
import { chromium } from 'playwright';
const csp = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('  [console]', m.type(), m.text()));
await page.route('http://shop.test/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/cancelled') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html', 'content-security-policy': csp }, body: '<form method="post" action="/retry"><button>Try again</button></form>' });
  if (u.pathname === '/retry') return route.fulfill({ status: 302, headers: { location: process.env.SAME ? 'http://shop.test/done' : 'https://pay.test/session' } });
  if (u.pathname === '/done') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: 'SAME ORIGIN DONE' });
});
await page.route('https://pay.test/**', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: '<h1>PAYMENT PAGE</h1>' }));
await page.goto('http://shop.test/cancelled');
await page.click('button');
await page.waitForTimeout(1500);
console.log('url after retry:', page.url(), '| body:', (await page.textContent('body')).slice(0, 60));
await browser.close();
