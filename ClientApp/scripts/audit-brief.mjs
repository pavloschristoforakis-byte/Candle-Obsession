// Read-only brief audit probe (islands mounted, reduced-motion gift reveal loop).
import { chromium } from 'playwright';
const base = 'http://localhost:5199';
const b = await chromium.launch();
for (const rm of ['no-preference', 'reduce']) {
  const ctx = await b.newContext({ reducedMotion: rm, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  for (let y = 0; y < 6000; y += 600) { await p.mouse.wheel(0, 600); await p.waitForTimeout(150); }
  await p.locator('#gift-sets').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
  const states = await p.$$eval('[data-island]', els => els.map(e => e.dataset.island + '=' + (e.dataset.islandState || '-')));
  const samples = [];
  for (let i = 0; i < 6; i++) { samples.push(await p.$$eval('.gift-box svg circle', cs => cs.map(c => (+getComputedStyle(c).opacity).toFixed(2)).join(','))); await p.waitForTimeout(400); }
  console.log(rm, states.join(' '), '\n  sparkle opacities over time:', samples.join(' | '));
  await p.click('[data-cart-open]').catch(()=>{}); await p.waitForTimeout(800);
  console.log('  drawer state:', await p.$eval('[data-island="cart-drawer"]', e => e.dataset.islandState));
  await ctx.close();
}
const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + '/products/red-grape');
console.log('red-grape ld offers?', (await p.$eval('script[type="application/ld+json"]', s => s.textContent)).includes('offers'));
await p.goto(base + '/shop?guide=under-25');
console.log('under-25 cards:', await p.$$eval('.product-card .product-title', e => e.map(x => x.textContent.trim()).join('; ')));
await b.close();
