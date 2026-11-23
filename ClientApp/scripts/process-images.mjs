// Generates optimised product, hero and brand images from the owner's source photos.
//
//   cd ClientApp && npm run images
//
// Sources live in ClientApp/assets-src (Instagram screenshots supplied by the owner + the
// original site photos). Output goes to ../wwwroot/images/{products,brand}. Re-run after adding
// or replacing photos. To use a new photo for a product: drop it in assets-src, add an entry
// below with the same "file" name the product uses in Data/products.json, and run again.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../assets-src');
const OUT = path.resolve(here, '../../wwwroot/images');
const IG = (n) => path.join(SRC, 'instagram', `${n}.jpg`);
const OLD = (f) => path.join(SRC, f);

// crop = [left, top, width, height] as fractions of the source image (optional).
// Product images are 4:5 portrait. "attention" focuses on the most interesting area.
const productImages = [
  { file: 'macademia-vanilla-1', src: OLD('candle1.jpg'), crop: [0.12, 0.25, 0.62, 0.75] },
  { file: 'baby-powder-1', src: OLD('candle2.jpg') },
  { file: 'apple-pie-1', src: OLD('candle3.jpg'), crop: [0.0, 0.26, 0.86, 0.74] },
  { file: 'strawberry-1', src: OLD('candle4.jpg'), crop: [0.1, 0.37, 0.52, 0.6] },
  { file: 'red-grape-1', src: IG(18), crop: [0.0, 0.42, 1.0, 0.58] },
  { file: 'pumpkin-spice-1', src: IG(28), crop: [0.0, 0.38, 1.0, 0.62] },
  { file: 'rose-petals-mothers-day-1', src: IG(19), crop: [0.0, 0.0, 0.8, 0.29] },
  { file: 'teddy-bear-candle-1', src: IG(5), crop: [0.0, 0.2, 0.72, 0.62] },
  { file: 'teddy-bear-candle-2', src: IG(10) },
  { file: 'teddy-bear-candle-3', src: IG(7), crop: [0.0, 0.25, 0.7, 0.55] },
  { file: 'heart-bubble-candle-1', src: IG(9), crop: [0.3, 0.38, 0.45, 0.4] },
  { file: 'heart-bubble-candle-2', src: IG(6), crop: [0.05, 0.25, 0.85, 0.65] },
  { file: 'heart-bubble-candle-3', src: IG(4), crop: [0.05, 0.25, 0.85, 0.65] },
  { file: 'shell-candle-1', src: IG(23), crop: [0.12, 0.28, 0.62, 0.4] },
  { file: 'wax-melts-box-1', src: IG(25), crop: [0.555, 0.012, 0.425, 0.285] },
  { file: 'wax-melts-box-2', src: IG(13), crop: [0.0, 0.0, 0.85, 1.0] },
  { file: 'daisy-wax-flower-1', src: IG(12) },
  { file: 'daisy-wax-flower-2', src: IG(13) },
  { file: 'wax-flower-bouquet-1', src: IG(22), crop: [0.35, 0.35, 0.65, 0.65] },
  { file: 'wax-flower-bouquet-2', src: IG(21), crop: [0.0, 0.2, 0.75, 0.8] },
  { file: 'caramel-cream-reed-diffuser-1', src: IG(33), crop: [0.05, 0.26, 0.9, 0.74] },
  { file: 'car-air-freshener-1', src: IG(29), crop: [0.18, 0.38, 0.64, 0.56] },
  { file: 'car-air-freshener-2', src: IG(30), crop: [0.16, 0.34, 0.68, 0.56] },
  { file: 'car-air-freshener-3', src: IG(32), crop: [0.14, 0.38, 0.72, 0.56] },
  { file: 'hello-fall-gift-crate-1', src: IG(34), crop: [0.0, 0.3, 1.0, 0.7] },
  { file: 'hello-fall-gift-crate-2', src: IG(35) },
  { file: 'christmas-gold-tin-candle-1', src: IG(46), crop: [0.45, 0.42, 0.53, 0.38] },
  { file: 'christmas-gift-basket-1', src: IG(45), crop: [0.4, 0.31, 0.56, 0.55] },
  { file: 'wax-favours-bomboniere-1', src: IG(26), crop: [0.4, 0.36, 0.6, 0.39] },
];

const WIDTHS = [400, 800, 1200];
const RATIO = 5 / 4; // height / width

async function cropped(src, crop) {
  const img = sharp(src).rotate();
  if (!crop) return img;
  const meta = await sharp(src).rotate().metadata();
  const [l, t, w, h] = crop;
  return img.extract({
    left: Math.round(l * meta.width),
    top: Math.round(t * meta.height),
    width: Math.min(meta.width - Math.round(l * meta.width), Math.round(w * meta.width)),
    height: Math.min(meta.height - Math.round(t * meta.height), Math.round(h * meta.height)),
  });
}

async function product({ file, src, crop }) {
  const base = await (await cropped(src, crop)).toBuffer();
  for (const w of WIDTHS) {
    await sharp(base)
      .resize(w, Math.round(w * RATIO), { fit: 'cover', position: sharp.strategy.attention, withoutEnlargement: false })
      .webp({ quality: 78, effort: 5 })
      .toFile(path.join(OUT, 'products', `${file}-${w}.webp`));
  }
  // Open Graph / social share image (1200x630 JPEG)
  await sharp(base)
    .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(OUT, 'products', `${file}-og.jpg`));
}

// Minimal .ico writer (PNG-compressed entries, supported by all modern browsers).
function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function brand() {
  const dir = path.join(OUT, 'brand');
  // Hero background (cover photo) in several widths + a JPEG fallback.
  for (const w of [960, 1600, 2400]) {
    await sharp(OLD('cover.jpg')).resize(w).webp({ quality: 72 }).toFile(path.join(dir, `hero-${w}.webp`));
  }
  await sharp(OLD('cover.jpg')).resize(1600).jpeg({ quality: 76, mozjpeg: true }).toFile(path.join(dir, 'hero-1600.jpg'));
  // Default social share image.
  await sharp(OLD('cover.jpg')).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(dir, 'og-default.jpg'));

  // Logo (screenshot 11): full lock-up, and the drop + bowl mark for icons.
  const logo = IG(11);
  const meta = await sharp(logo).metadata();
  await sharp(logo).resize(800).png({ compressionLevel: 9 }).toFile(path.join(dir, 'logo-full.png'));
  const mark = await sharp(logo)
    .extract({ left: Math.round(0.215 * meta.width), top: Math.round(0.12 * meta.height), width: Math.round(0.57 * meta.width), height: Math.round(0.57 * meta.height) })
    .toBuffer();
  const icon = (size) => sharp(mark).resize(size, size, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png();
  await icon(512).toFile(path.join(dir, 'icon-512.png'));
  await icon(192).toFile(path.join(dir, 'icon-192.png'));
  await icon(180).toFile(path.join(OUT, '..', 'apple-touch-icon.png'));
  const icoParts = [];
  for (const size of [16, 32, 48]) icoParts.push({ size, data: await icon(size).toBuffer() });
  await writeFile(path.join(OUT, '..', 'favicon.ico'), ico(icoParts));
}

await mkdir(path.join(OUT, 'products'), { recursive: true });
await mkdir(path.join(OUT, 'brand'), { recursive: true });
for (const p of productImages) {
  await product(p);
  process.stdout.write(`✓ ${p.file}\n`);
}
await brand();
console.log('✓ brand images, favicon');
