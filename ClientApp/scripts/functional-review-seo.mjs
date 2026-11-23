import fs from 'fs';
const B = 'http://localhost:5199';
const doc = JSON.parse(fs.readFileSync('../Data/products.json', 'utf8'));
const purch = (p) => {
  const ok = (price, stock) => price > 0 && ['in_stock', 'low_stock', 'made_to_order'].includes(stock ?? 'in_stock');
  return p.variants?.length ? p.variants.some((v) => ok(v.priceEur ?? p.priceEur, v.stockStatus ?? p.stockStatus)) : ok(p.priceEur, p.stockStatus);
};
const attr = (html, re) => (html.match(re) || [])[1];
for (const p of doc.products) {
  const html = await (await fetch(`${B}/products/${p.slug}`)).text();
  const ldRaw = attr(html, /<script type="application\/ld(?:\+|&#x2B;)json">([\s\S]*?)<\/script>/);
  let ld; try { ld = JSON.parse(ldRaw); } catch (e) { console.log(p.id, 'LD PARSE FAIL', e.message); continue; }
  const issues = [];
  if (!!ld.offers !== purch(p)) issues.push(`offers=${!!ld.offers} purchasable=${purch(p)}`);
  if (ld.offers && Number(ld.offers.price) !== Math.min(...(p.variants?.length ? p.variants.map((v) => v.priceEur ?? p.priceEur) : [p.priceEur]))) issues.push('offer price mismatch');
  if (!ld.image?.length) issues.push('LD image empty');
  if (!ld.description) issues.push('LD description empty');
  const og = attr(html, /property="og:image" content="([^"]+)"/);
  const canon = attr(html, /rel="canonical" href="([^"]+)"/);
  const ogUrl = attr(html, /property="og:url" content="([^"]+)"/);
  if (canon !== `${B}/products/${p.slug}`) issues.push('canonical ' + canon);
  if (ogUrl !== canon) issues.push('og:url != canonical');
  const ogRes = await fetch(og);
  if (!ogRes.ok) issues.push('og image ' + ogRes.status + ' ' + og);
  else {
    const buf = Buffer.from(await ogRes.arrayBuffer());
    // JPEG SOF dims
    let i = 2, w, h; while (i < buf.length) { if (buf[i] !== 0xff) break; const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + len; }
    if (w !== 1200 || h !== 630) issues.push(`og dims ${w}x${h}`);
  }
  console.log(p.id.padEnd(30), issues.join('; ') || 'ok');
}
// case-variant URL canonical
const html = await (await fetch(`${B}/products/APPLE-PIE`)).text();
console.log('APPLE-PIE canonical:', attr(html, /rel="canonical" href="([^"]+)"/));
const shopHtml = await (await fetch(`${B}/shop?guide=under-25&category=wax`)).text();
console.log('guide+category canonical:', attr(shopHtml, /rel="canonical" href="([^"]+)"/), '| count:', attr(shopHtml, /class="result-count"[^>]*>([^<]+)/));
const bad = await (await fetch(`${B}/shop?category=nope`)).text();
console.log('bad category canonical:', attr(bad, /rel="canonical" href="([^"]+)"/), attr(bad, /<h1 id="shop-title">([^<]+)/));
for (const path of ['/', '/shop', '/cart', '/checkout', '/withdraw', '/privacy', '/not-found']) {
  const h = await (await fetch(B + path)).text();
  console.log(path.padEnd(12), 'robots:', attr(h, /name="robots" content="([^"]+)"/) ?? '-', '| canon:', attr(h, /rel="canonical" href="([^"]+)"/), '| og:image:', attr(h, /property="og:image" content="([^"]+)"/));
}
const ogDefault = await fetch(B + '/images/brand/og-default.jpg'); console.log('og-default', ogDefault.status);
const home = await (await fetch(B + '/')).text();
console.log('home ld+json blocks:', (home.match(/application\/ld\+json/g) || []).length);
