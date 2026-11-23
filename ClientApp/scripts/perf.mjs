// Performance probe (mobile-ish): transferred bytes, request count, JS loaded before first paint, LCP, long tasks,
// and a trace breakdown of the longest main-thread tasks. Usage (from ClientApp): node scripts/perf.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/$/, '');
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
fs.mkdirSync(outDir, { recursive: true });
const urls = ['/', '/products/macademia-vanilla', '/checkout', '/shop'];
const CART = JSON.stringify([{ key: 'apple-pie||', productId: 'apple-pie', quantity: 1 }]);

const browser = await chromium.launch();
const results = [];
for (const u of urls) {
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await ctx.addInitScript((c) => {
      try { localStorage.setItem('co.cart.v2', c); } catch {}
      window.__lcp = []; window.__lt = []; window.__fcp = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName + '.' + (e.element.className || '') : e.url })) ).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === 'first-contentful-paint') window.__fcp = e.startTime; })).observe({ type: 'paint', buffered: true });
    }, CART);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const tracing = !reduced;
    if (tracing) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
    await page.goto(BASE + u, { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const data = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource').map((r) => ({ name: r.name.replace(location.origin, ''), start: Math.round(r.startTime), size: r.transferSize, type: r.initiatorType }));
      const nav = performance.getEntriesByType('navigation')[0];
      return { fcp: Math.round(window.__fcp), lcp: window.__lcp, lt: window.__lt, res, docSize: nav.transferSize, load: Math.round(nav.loadEventEnd) };
    });
    let traceTop = null;
    if (tracing) {
      const buf = await browser.stopTracing();
      const ev = JSON.parse(buf.toString()).traceEvents;
      const main = ev.filter((e) => e.name === 'RunTask' && e.dur > 50000).sort((a, b) => b.dur - a.dur).slice(0, 3);
      traceTop = main.map((t) => {
        const kids = ev.filter((e) => e.tid === t.tid && e.ts >= t.ts && e.ts + (e.dur || 0) <= t.ts + t.dur && e.ph === 'X' && e.name !== 'RunTask');
        const agg = {};
        for (const k of kids) agg[k.name] = (agg[k.name] || 0) + k.dur;
        const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, d]) => `${n}=${Math.round(d / 1000)}ms`);
        return { durMs: Math.round(t.dur / 1000), top };
      });
    }
    const js = data.res.filter((r) => /\.js(\?|$)/.test(r.name));
    results.push({
      url: u, reducedMotion: reduced, fcp: data.fcp, lcp: data.lcp.at(-1), load: data.load,
      requests: data.res.length + 1, bytes: data.res.reduce((n, r) => n + r.size, 0) + data.docSize,
      jsBytes: js.reduce((n, r) => n + r.size, 0),
      jsBeforeFcp: js.filter((r) => r.start <= data.fcp).map((r) => r.name),
      jsAll: js.map((r) => `${r.start}ms ${r.name} ${r.size}B`),
      longTasks: data.lt, traceTop,
    });
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'perf-report.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n== ${r.url} reducedMotion=${r.reducedMotion}  FCP ${r.fcp}ms  LCP ${r.lcp?.t}ms (${r.lcp?.el})  load ${r.load}ms  requests ${r.requests}  bytes ${Math.round(r.bytes / 1024)}KiB  JS ${Math.round(r.jsBytes / 1024)}KiB`);
  console.log('  JS requested before FCP:', r.jsBeforeFcp.join(', ') || '(none)');
  console.log('  JS timeline:\n    ' + r.jsAll.join('\n    '));
  console.log('  long tasks:', r.longTasks.map((t) => `${t.t}+${t.d}`).join(' '));
  if (r.traceTop) r.traceTop.forEach((t) => console.log(`  trace task ${t.durMs}ms: ${t.top.join(', ')}`));
}
