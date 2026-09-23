// Tests for the helper functions in scripts/fetch-images.mjs (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOgImage, findGalleryImage, looksLikeNonProduct, imageDimensions } from '../scripts/fetch-images.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'https://www.eqfusion.com/products/test';

test('findOgImage: attribute order and entities do not matter', () => {
  assert.equal(
    findOgImage('<meta content="https://cdn.prod.website-files.com/a/b.png?x=1&amp;y=2" property="og:image"/>', PAGE),
    'https://cdn.prod.website-files.com/a/b.png?x=1&y=2'
  );
  assert.equal(findOgImage(`<meta property='og:image' content='/img/a.jpg'>`, PAGE), 'https://www.eqfusion.com/img/a.jpg');
  assert.equal(findOgImage('<meta name="twitter:image" content="x.jpg">', PAGE), null);
});

test('findGalleryImage: skips flags, SVGs, logos and non-CDN images', () => {
  const html = `
    <img src="https://cdn.prod.website-files.com/a/flag.svg" class="locals-flag">
    <img src="https://example.com/product.jpg">
    <img src="https://cdn.prod.website-files.com/a/menu.png" class="navbar21_menu">
    <img src="https://cdn.prod.website-files.com/a/logo.png">
    <img src="https://cdn.prod.website-files.com/a/product.jpg" class="gallery">`;
  assert.equal(findGalleryImage(html, PAGE), 'https://cdn.prod.website-files.com/a/product.jpg');
  assert.equal(findGalleryImage('<p>no images</p>', PAGE), null);
});

test('looksLikeNonProduct', () => {
  assert.equal(looksLikeNonProduct('https://cdn/x/EF%20Logo.png'), true);
  assert.equal(looksLikeNonProduct('https://cdn/x/Active%20jogging%20shoe.jpg'), false);
});

test('imageDimensions: PNG and JPEG (real downloaded files, if present)', (t) => {
  const dir = path.join(root, 'assets', 'images');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
  if (!files.length) return t.skip('no images downloaded yet');
  for (const file of files) {
    const dims = imageDimensions(fs.readFileSync(path.join(dir, file)));
    assert.ok(dims && dims.width > 0 && dims.height > 0, `no dimensions for ${file}`);
  }
});

test('imageDimensions: minimal PNG header and unknown data', () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(imageDimensions(png), { width: 640, height: 480 });
  assert.equal(imageDimensions(Buffer.from('not an image at all, really not')), null);
});
