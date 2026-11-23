import { chromium } from 'playwright';
const B = 'http://localhost:5199';
const browser = await chromium.launch();
// A. Drawer chunk fails to load → does the cart icon still work?
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/dist/chunks/CartDrawer-*.js', (r) => r.abort());
  await page.goto(B + '/shop');
  for (let i = 1; i <= 2; i++) {
    await page.click('[data-cart-open]');
    await page.waitForTimeout(800);
    console.log(`A. chunk blocked, click ${i}: url=${page.url()} drawerState=${await page.getAttribute('#cart-drawer-root', 'data-island-state')}`);
  }
  await ctx.close();
}
// B. Cart page island chunk fails → fallback text?
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/dist/chunks/CartPage-*.js', (r) => r.abort());
  await page.goto(B + '/cart');
  await page.waitForTimeout(1000);
  console.log('B. cart page chunk blocked:', JSON.stringify(await page.locator('.cart-page').innerText()), 'state=', await page.getAttribute('.cart-page', 'data-island-state'));
  await ctx.close();
}
// C. Reduced motion: decorative islands skipped, gift grid visible immediately, CountUp not used
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(B + '/');
  await page.waitForTimeout(500);
  console.log('C. hero state:', await page.getAttribute('#hero-title', 'data-island-state'), '| html class:', await page.getAttribute('html', 'class'));
  await page.locator('#gift-sets').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  console.log('C. gift grid classes:', await page.getAttribute('#gift-set-grid', 'class'));
  await ctx.close();
}
// D. Drawer timing: does the first click open if we wait for the 'co:open-cart' listener? measure clicks needed
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(B + '/');
  await page.waitForTimeout(3000);
  let clicks = 0;
  while (clicks < 4 && (await page.locator('.cart-drawer[role=dialog]').count()) === 0) { await page.click('[data-cart-open]'); clicks++; await page.waitForTimeout(700); }
  console.log('D. clicks needed to open drawer (after idle preload):', clicks);
  await ctx.close();
}
await browser.close();
