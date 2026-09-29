// Tests for src/chart-format.js – formatting and rows for the size chart table.
// Row tests run against the real data/size-chart.json (run `npm run build-data` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatLength, formatRange, buildChartRows, findModelByPath } from '../src/chart-format.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'size-chart.json'), 'utf8'));

test('formatLength: cm with one decimal', () => {
  assert.equal(formatLength(66, 'cm'), '6.6');
  assert.equal(formatLength(160, 'cm'), '16.0');
  assert.equal(formatLength(75, 'cm'), '7.5');
  assert.equal(formatLength(100, 'cm'), '10.0');
});

test('formatLength: inches as fraction to the nearest 1/16, reduced', () => {
  assert.equal(formatLength(51, 'in'), '2');
  assert.equal(formatLength(66, 'in'), '2 5/8');
  assert.equal(formatLength(85, 'in'), '3 3/8');
  assert.equal(formatLength(86, 'in'), '3 3/8'); // known: 1 mm < 1/16 in, so neighbours can look equal
  assert.equal(formatLength(25.4 * 4.5, 'in'), '4 1/2'); // 8/16 → 1/2
  assert.equal(formatLength(25.4 * 4.25, 'in'), '4 1/4'); // 4/16 → 1/4
  assert.equal(formatLength(25.4 * (4 + 1 / 16), 'in'), '4 1/16');
  assert.equal(formatLength(16, 'in'), '5/8'); // below one inch: no leading 0
  assert.equal(formatLength(127, 'in'), '5'); // exactly 5 in
  assert.equal(formatLength(126, 'in'), '4 15/16'); // 4.96 in
  assert.equal(formatLength(126.5, 'in'), '5'); // 4.98 in rounds up to 5, not "4 16/16"
});

test('formatRange uses an en dash with spaces', () => {
  assert.equal(formatRange(66, 75, 'cm'), '6.6 – 7.5');
  assert.equal(formatRange(51, 66, 'in'), '2 – 2 5/8');
});

test('buildChartRows: number of sizes per model', () => {
  assert.equal(buildChartRows(data, 'active').length, 10);
  assert.equal(buildChartRows(data, 'trekking').length, 10);
  assert.equal(buildChartRows(data, 'ultra').length, 7);
  assert.equal(buildChartRows(data, 'trailblazer').length, 9);
  assert.deepEqual(buildChartRows(data, 'unknown'), []);
});

test('buildChartRows: sorted numerically, Trailblazer includes 14.5', () => {
  const sizes = buildChartRows(data, 'trailblazer').map((r) => r.size);
  assert.ok(sizes.includes('14.5'));
  const numbers = sizes.map(Number);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  assert.equal(sizes.indexOf('14.5'), sizes.indexOf('14') + 1);
});

test('buildChartRows: spot checks against the size chart', () => {
  const row = (model, size) => buildChartRows(data, model).find((r) => r.size === size);
  const m = (widthMin, widthMax, lengthMin, lengthMax) => ({
    widthMinMm: widthMin,
    widthMaxMm: widthMax,
    lengthMinMm: lengthMin,
    lengthMaxMm: lengthMax,
  });
  assert.deepEqual(row('active', '7').regular, m(61, 70, 66, 75));
  assert.deepEqual(row('active', '7').slim, m(51, 60, 66, 75));
  assert.deepEqual(row('trailblazer', '9').slim, m(81, 89, 90, 97));
  assert.deepEqual(row('ultra', '10').regular, m(86, 95, 91, 100));
});

test('buildChartRows: missing variant is null, inactive rows are skipped', () => {
  const size = (sizeText, variant, active = true) => ({
    model_id: 'x', size: sizeText, variant, active,
    length_min_mm: 100, length_max_mm: 109, width_min_mm: 90, width_max_mm: 99,
  });
  const fake = { sizes: [size('12', 'regular'), size('11', 'slim'), size('11', 'regular', false), size('10', 'slim', false)] };
  const rows = buildChartRows(fake, 'x');
  assert.deepEqual(rows.map((r) => r.size), ['11', '12']);
  assert.equal(rows[0].regular, null);
  assert.ok(rows[0].slim);
  assert.equal(rows[1].slim, null);
});

test('findModelByPath: all four product pages', () => {
  const cases = {
    active: '/products/active-jogging-shoe',
    trailblazer: '/products/trailblazer-jogging-shoe',
    ultra: '/products/ultra-jogging-shoe',
    trekking: '/products/trekking-shoe',
  };
  for (const [id, p] of Object.entries(cases)) {
    assert.equal(findModelByPath(data, p)?.model_id, id, p);
    assert.equal(findModelByPath(data, p + '/')?.model_id, id, p + '/');
    assert.equal(findModelByPath(data, p + '?l=11.8&w=11.0&u=cm')?.model_id, id, p + '?…');
    assert.equal(findModelByPath(data, p + '/?src=share#size')?.model_id, id, p + '/?…#…');
    // Staging domain (webflow.io) has the same path.
    assert.equal(findModelByPath(data, 'https://eqfusion.webflow.io' + p)?.model_id, id, 'full URL');
  }
});

test('findModelByPath: unknown paths → null (never a wrong model)', () => {
  assert.equal(findModelByPath(data, '/products/unknown-shoe'), null);
  assert.equal(findModelByPath(data, '/products/active-jogging-shoe-2'), null);
  assert.equal(findModelByPath(data, '/products'), null);
  assert.equal(findModelByPath(data, '/'), null);
  assert.equal(findModelByPath(data, ''), null);
  assert.equal(findModelByPath(data, undefined), null);
});
