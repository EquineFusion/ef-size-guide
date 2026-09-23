// fetch-images.mjs
// Downloads one product image per active model from its product page (product_url).
//
// For each model in data/size-chart.json:
//   1. Fetch the product page.
//   2. Use <meta property="og:image"> (first choice).
//      If it is missing, looks like a logo, or is the same image for several models
//      (a site-wide default share image), use the first large image from the
//      Webflow CDN on the page instead.
//   3. Save it as assets/images/<model_id>.<ext> (original format).
//
// Prints source URL, file size and dimensions per model, and warns about images over 300 kB.
// If a page fails, the other models continue; missing ones are listed at the end
// (the widget shows a placeholder for them).
//
// Only built-in Node APIs (fetch). Usage: npm run fetch-images
//
// Models that already have an image in assets/images/ are SKIPPED, so hand-edited
// images (e.g. the cropped Trailblazer image) are never overwritten by accident.
// To download again anyway: npm run fetch-images -- --force
//
// NOTE: this script does not change the Excel file. After checking the images,
// put the relative path (e.g. assets/images/trailblazer.png) in the image_url column
// of the `models` sheet and run `npm run build-data`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE_WARNING_BYTES = 300 * 1024;
const WEBFLOW_CDN = /(cdn\.prod\.website-files\.com|assets-global\.website-files\.com|uploads-ssl\.webflow\.com)/;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// ---------------------------------------------------------------------------
// HTML parsing (exported for tests)
// ---------------------------------------------------------------------------

// Decode the few HTML entities that appear in URLs.
function decodeEntities(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Read one attribute from a tag string, e.g. attr('<meta content="x">', 'content') → 'x'.
function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2]) : null;
}

/** The og:image URL on the page (absolute), or null. */
export function findOgImage(html, pageUrl) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if ((attr(tag, 'property') || '').toLowerCase() === 'og:image') {
      const content = attr(tag, 'content');
      if (content) return new URL(content, pageUrl).href;
    }
  }
  return null;
}

/**
 * Fallback: the first image on the Webflow CDN that is not an icon, flag, logo or SVG.
 * Returns an absolute URL or null.
 */
export function findGalleryImage(html, pageUrl) {
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, 'src');
    if (!src) continue;
    const url = new URL(src, pageUrl).href;
    if (!WEBFLOW_CDN.test(url)) continue;
    if (/\.svg($|\?)/i.test(url)) continue;
    if (/logo|icon|flag|navbar|menu/i.test(url + ' ' + (attr(tag, 'class') || ''))) continue;
    return url;
  }
  return null;
}

// Does the URL look like something other than a product image?
export function looksLikeNonProduct(url) {
  return /logo|favicon|icon|banner/i.test(decodeURIComponent(url));
}

// ---------------------------------------------------------------------------
// Image dimensions without dependencies (exported for tests)
// ---------------------------------------------------------------------------

/** Width/height of a PNG, JPEG or WebP buffer, or null if unknown. */
export function imageDimensions(buf) {
  // PNG: signature + IHDR chunk with width/height as 32-bit big-endian.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk the markers until a "start of frame" marker.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSOF) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  // WebP: RIFF container with VP8 / VP8L / VP8X chunk.
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'EquineFusion-SizeGuide/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  const fromUrl = decodeURIComponent(new URL(url).pathname).match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1].toLowerCase();
  const ext = EXTENSIONS[type] || (fromUrl === 'jpeg' ? 'jpg' : fromUrl);
  if (!ext) throw new Error(`Unknown image type «${type}» for ${url}`);
  return { buffer, ext };
}

async function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'size-chart.json'), 'utf8'));
  const outDir = path.join(root, 'assets', 'images');
  fs.mkdirSync(outDir, { recursive: true });
  const force = process.argv.includes('--force');

  // 1. Fetch all pages and find candidate images.
  const candidates = [];
  const missing = [];
  const skipped = [];
  for (const model of data.models) {
    const existing = fs.readdirSync(outDir).find((f) => f.startsWith(`${model.model_id}.`));
    if (existing && !force) {
      skipped.push(`${model.model_id}: assets/images/${existing} finnes allerede`);
      continue;
    }
    if (!model.product_url) {
      missing.push(`${model.model_id}: ingen product_url`);
      continue;
    }
    try {
      const html = await fetchText(model.product_url);
      candidates.push({ model, html, og: findOgImage(html, model.product_url) });
    } catch (err) {
      missing.push(`${model.model_id}: kunne ikke hente produktsiden (${err.message})`);
    }
  }

  // An og:image shared by several models is a site-wide default, not a product image.
  const ogCount = new Map();
  for (const c of candidates) if (c.og) ogCount.set(c.og, (ogCount.get(c.og) || 0) + 1);

  // 2. Choose and download.
  const downloaded = [];
  for (const { model, html, og } of candidates) {
    let url = og;
    let method = 'og:image';
    if (!url || looksLikeNonProduct(url) || ogCount.get(url) > 1) {
      url = findGalleryImage(html, model.product_url);
      method = 'produktgalleri';
    }
    if (!url) {
      missing.push(`${model.model_id}: fant ikke noe produktbilde på siden`);
      continue;
    }

    try {
      const { buffer, ext } = await fetchImage(url);
      // Remove old files for this model with another extension.
      for (const file of fs.readdirSync(outDir)) {
        if (file.startsWith(`${model.model_id}.`) && file !== `${model.model_id}.${ext}`) fs.unlinkSync(path.join(outDir, file));
      }
      const fileName = `${model.model_id}.${ext}`;
      fs.writeFileSync(path.join(outDir, fileName), buffer);
      downloaded.push({ model: model.model_id, fileName, url, method, bytes: buffer.length, dims: imageDimensions(buffer) });
    } catch (err) {
      missing.push(`${model.model_id}: nedlasting feilet (${err.message})`);
    }
  }

  // 3. Report.
  if (skipped.length) {
    console.log('Hoppet over (bruk --force for å laste ned på nytt):');
    for (const s of skipped) console.log(`  - ${s}`);
  }
  for (const d of downloaded) {
    const kb = Math.round(d.bytes / 1024);
    const dims = d.dims ? `${d.dims.width} × ${d.dims.height} px` : 'ukjente dimensjoner';
    console.log(`\n${d.model} → assets/images/${d.fileName}`);
    console.log(`  kilde (${d.method}): ${decodeURIComponent(d.url)}`);
    console.log(`  ${kb} kB, ${dims}`);
    if (d.bytes > SIZE_WARNING_BYTES) console.log(`  ADVARSEL: over 300 kB – bør komprimeres før publisering.`);
  }
  if (missing.length) {
    console.log('\nMangler bilde (widgeten viser plassholder):');
    for (const m of missing) console.log(`  - ${m}`);
  }
  console.log(`\n${downloaded.length} lastet ned, ${skipped.length} hoppet over, ${missing.length} mangler.`);
  if (missing.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
