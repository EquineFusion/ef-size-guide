// Tests for scripts/build-data.mjs.
// Uses small in-memory workbooks – never the real data/size-chart.xlsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildData } from '../scripts/build-data.mjs';

// ---------------------------------------------------------------------------
// Test workbook builder
// ---------------------------------------------------------------------------

const MODEL_HEADER = ['model_id', 'name', 'use_case', 'sold_as', 'product_url', 'image_url', 'active', 'sort_order', 'source'];
const SIZE_HEADER = ['model_id', 'size_label', 'size', 'variant', 'length_min_mm', 'length_max_mm', 'width_min_mm', 'width_max_mm', 'active', 'source'];

function model(overrides = {}) {
  return {
    model_id: 'alpha', name: 'Alpha', use_case: 'Trail riding', sold_as: 'pair',
    product_url: 'https://example.com/alpha', image_url: 'assets/images/alpha.jpg',
    active: true, sort_order: 1, source: 'test', ...overrides,
  };
}

function size(overrides = {}) {
  return {
    model_id: 'alpha', size_label: '7 Slim', size: '7', variant: 'slim',
    length_min_mm: 66, length_max_mm: 75, width_min_mm: null, width_max_mm: 60,
    active: true, source: 'test', ...overrides,
  };
}

// A valid baseline: model "alpha" with sizes 7 and 8, Slim + Regular each.
function baseSizes() {
  return [
    size(),
    size({ size_label: '7', variant: 'regular', width_min_mm: 61, width_max_mm: 70 }),
    size({ size_label: '8 Slim', size: '8', length_min_mm: 76, length_max_mm: 85, width_max_mm: 70 }),
    size({ size_label: '8', size: '8', variant: 'regular', length_min_mm: 76, length_max_mm: 85, width_min_mm: 71, width_max_mm: 80 }),
  ];
}

function baseSettings() {
  return {
    tolerance_mm: 2, wide_hoof_model: 'alpha', wide_hoof_max_extra_length_mm: 10, fresh_trim_add_mm: 4,
    measure_guide_url: 'https://example.com/measure', dealer_finder_url: 'https://example.com/dealers',
    data_version: '2026-01-01',
  };
}

function makeWorkbook({ models = [model()], sizes = baseSizes(), settings = baseSettings() } = {}) {
  const wb = XLSX.utils.book_new();
  const toRows = (header, objs) => [header, ...objs.map((o) => header.map((h) => o[h] ?? null))];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows(MODEL_HEADER, models)), 'models');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows(SIZE_HEADER, sizes)), 'sizes');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([['key', 'value'], ...Object.entries(settings)]),
    'settings'
  );
  return wb;
}

// Helper: build and expect at least one error containing `text`.
function expectError(workbookOptions, text) {
  const { data, errors } = buildData(makeWorkbook(workbookOptions));
  assert.equal(data, null, 'data should be null when there are errors');
  assert.ok(
    errors.some((e) => e.includes(text)),
    `expected an error containing «${text}», got:\n${errors.join('\n')}`
  );
  return errors;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('valid workbook builds without errors or warnings', () => {
  const { data, errors, warnings } = buildData(makeWorkbook(), { generatedAt: 'T' });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(data.generatedAt, 'T');
  assert.equal(data.dataVersion, '2026-01-01');
  assert.equal(data.settings.tolerance_mm, 2);
  assert.equal(data.settings.wide_hoof_model, 'alpha');
  assert.equal(data.models.length, 1);
  assert.equal(data.sizes.length, 4);
});

test('empty width_min_mm becomes null (no lower limit)', () => {
  const { data } = buildData(makeWorkbook());
  assert.equal(data.sizes[0].width_min_mm, null);
  assert.equal(data.sizes[1].width_min_mm, 61);
});

test('size is always a string, also when Excel stores it as a number', () => {
  const sizes = [size({ size: 14.5, size_label: '14.5 Slim' })];
  const { data } = buildData(makeWorkbook({ sizes }));
  assert.equal(data.sizes[0].size, '14.5');
});

test('only active rows are included; "TRUE"/"FALSE" text is accepted', () => {
  const models = [model(), model({ model_id: 'beta', name: 'Beta', active: 'FALSE', sort_order: 2 })];
  const sizes = [...baseSizes(), size({ model_id: 'beta' }), size({ size_label: '9 Slim', size: '9', length_min_mm: 86, length_max_mm: 95, active: 'FALSE' })];
  const { data, errors } = buildData(makeWorkbook({ models, sizes }));
  assert.deepEqual(errors, []);
  assert.deepEqual(data.models.map((m) => m.model_id), ['alpha']);
  assert.equal(data.sizes.length, 4);
  assert.ok(data.sizes.every((s) => s.model_id === 'alpha'));
});

test('models are sorted by sort_order and sizes by model, length, Slim before Regular', () => {
  const models = [model({ sort_order: 2 }), model({ model_id: 'beta', name: 'Beta', sort_order: 1 })];
  const sizes = [...baseSizes().reverse(), size({ model_id: 'beta' })];
  const { data } = buildData(makeWorkbook({ models, sizes }));
  assert.deepEqual(data.models.map((m) => m.model_id), ['beta', 'alpha']);
  assert.deepEqual(
    data.sizes.map((s) => `${s.model_id} ${s.size_label}`),
    ['beta 7 Slim', 'alpha 7 Slim', 'alpha 7', 'alpha 8 Slim', 'alpha 8']
  );
});

test('output does not contain internal fields (row, active, source)', () => {
  const { data } = buildData(makeWorkbook());
  for (const s of data.sizes) {
    assert.equal('row' in s, false);
    assert.equal('active' in s, false);
    assert.equal('source' in s, false);
  }
  assert.equal('active' in data.models[0], false);
});

// ---------------------------------------------------------------------------
// Errors (stop the build)
// ---------------------------------------------------------------------------

test('error: missing required field, with sheet and row number', () => {
  const sizes = baseSizes();
  sizes[1].length_max_mm = null;
  const errors = expectError({ sizes }, 'length_max_mm');
  assert.ok(errors.some((e) => e.includes('«sizes», rad 3')), errors.join('\n'));
});

test('error: missing required model field', () => {
  expectError({ models: [model({ use_case: null })] }, '«use_case» mangler');
});

test('error: non-integer mm value', () => {
  const sizes = baseSizes();
  sizes[0].length_max_mm = 75.5;
  expectError({ sizes }, 'helt antall millimeter');
});

test('error: text in mm field', () => {
  const sizes = baseSizes();
  sizes[0].width_max_mm = 'sixty';
  expectError({ sizes }, 'helt antall millimeter');
});

test('error: min greater than max (length and width)', () => {
  const s1 = baseSizes();
  s1[0].length_min_mm = 80;
  expectError({ sizes: s1 }, 'length_min_mm (80) er større enn length_max_mm (75)');

  const s2 = baseSizes();
  s2[1].width_min_mm = 75;
  expectError({ sizes: s2 }, 'width_min_mm (75) er større enn width_max_mm (70)');
});

test('error: unknown model_id in sizes', () => {
  expectError({ sizes: [...baseSizes(), size({ model_id: 'ghost' })] }, 'ukjent model_id «ghost»');
});

test('error: duplicate model_id + size_label', () => {
  expectError({ sizes: [...baseSizes(), size()] }, 'finnes flere ganger');
});

test('error: duplicate model_id in models', () => {
  expectError({ models: [model(), model()] }, 'finnes flere ganger');
});

test('error: values outside 40–250 mm', () => {
  const s1 = baseSizes();
  s1[0].length_min_mm = 39;
  expectError({ sizes: s1 }, 'utenfor realistiske verdier');

  const s2 = baseSizes();
  s2[3].length_max_mm = 251;
  expectError({ sizes: s2 }, 'utenfor realistiske verdier');
});

test('boundary: exactly 40 and 250 mm are allowed', () => {
  const sizes = [size({ length_min_mm: 40, length_max_mm: 250, width_min_mm: 40, width_max_mm: 250, variant: 'regular' })];
  const { errors } = buildData(makeWorkbook({ sizes }));
  assert.deepEqual(errors, []);
});

test('error: variant other than slim/regular', () => {
  const sizes = baseSizes();
  sizes[0].variant = 'wide';
  expectError({ sizes }, '«variant» må være «slim» eller «regular»');
});

test('error: sold_as other than single/pair', () => {
  expectError({ models: [model({ sold_as: 'set' })] }, '«sold_as»');
});

test('error: active not TRUE/FALSE', () => {
  const sizes = baseSizes();
  sizes[0].active = 'yes';
  expectError({ sizes }, '«active» må være TRUE eller FALSE');
});

test('error: Slim and Regular in the same size overlap in width', () => {
  const sizes = baseSizes();
  sizes[1].width_min_mm = 60; // Slim max is 60 → overlap on 60
  expectError({ sizes }, 'overlapper i bredde');
});

test('error: Regular without width_min overlaps Slim', () => {
  const sizes = baseSizes();
  sizes[1].width_min_mm = null;
  expectError({ sizes }, 'overlapper i bredde');
});

test('no error: Slim/Regular touching with 1 mm step (60 → 61)', () => {
  const { errors } = buildData(makeWorkbook());
  assert.deepEqual(errors, []);
});

test('no error: inactive rows are not checked for overlap', () => {
  const sizes = baseSizes();
  sizes[1].width_min_mm = 55;
  sizes[1].active = false;
  const { errors } = buildData(makeWorkbook({ sizes }));
  assert.deepEqual(errors, []);
});

test('error: wide_hoof_model does not exist', () => {
  expectError({ settings: { ...baseSettings(), wide_hoof_model: 'ultra' } }, 'wide_hoof_model «ultra»');
});

test('error: wide_hoof_model refers to an inactive model', () => {
  const models = [model(), model({ model_id: 'beta', name: 'Beta', active: false, sort_order: 2 })];
  expectError({ models, settings: { ...baseSettings(), wide_hoof_model: 'beta' } }, 'wide_hoof_model «beta»');
});

test('error: missing setting', () => {
  const settings = baseSettings();
  delete settings.tolerance_mm;
  expectError({ settings }, '«tolerance_mm» mangler');
});

test('error: tolerance_mm not a whole number', () => {
  expectError({ settings: { ...baseSettings(), tolerance_mm: 2.5 } }, '«tolerance_mm»');
});

test('error: wide_hoof_max_extra_length_mm missing or invalid', () => {
  const settings = baseSettings();
  delete settings.wide_hoof_max_extra_length_mm;
  expectError({ settings }, '«wide_hoof_max_extra_length_mm» mangler');
  expectError({ settings: { ...baseSettings(), wide_hoof_max_extra_length_mm: 'ten' } }, '«wide_hoof_max_extra_length_mm»');
});

test('error: missing sheet', () => {
  const wb = makeWorkbook();
  delete wb.Sheets.sizes;
  wb.SheetNames = wb.SheetNames.filter((n) => n !== 'sizes');
  const { data, errors } = buildData(wb);
  assert.equal(data, null);
  assert.ok(errors.some((e) => e.includes('«sizes» mangler')));
});

test('error: missing column in header', () => {
  const wb = makeWorkbook();
  wb.Sheets.sizes = XLSX.utils.aoa_to_sheet([SIZE_HEADER.filter((h) => h !== 'width_max_mm')]);
  const { errors } = buildData(wb);
  assert.ok(errors.some((e) => e.includes('kolonnen «width_max_mm» mangler')));
});

test('README and avvik sheets are ignored', () => {
  const wb = makeWorkbook();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['anything'], ['goes here']]), 'README');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['alvorlighet'], ['Kritisk']]), 'avvik');
  const { errors } = buildData(wb);
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// Warnings (build continues)
// ---------------------------------------------------------------------------

test('warning: gap > 1 mm in length between sizes', () => {
  const sizes = baseSizes();
  sizes[2].length_min_mm = 78;
  sizes[3].length_min_mm = 78;
  const { data, warnings } = buildData(makeWorkbook({ sizes }));
  assert.ok(data, 'build should continue');
  assert.ok(warnings.some((w) => w.includes('hull i lengde')), warnings.join('\n'));
});

test('warning: overlap in length between sizes', () => {
  const sizes = baseSizes();
  sizes[2].length_min_mm = 74;
  sizes[3].length_min_mm = 74;
  const { data, warnings } = buildData(makeWorkbook({ sizes }));
  assert.ok(data);
  assert.ok(warnings.some((w) => w.includes('overlapper i lengde')), warnings.join('\n'));
});

test('warning: missing image_url and product_url', () => {
  const { data, warnings } = buildData(makeWorkbook({ models: [model({ image_url: null, product_url: null })] }));
  assert.ok(data);
  assert.ok(warnings.some((w) => w.includes('mangler image_url')));
  assert.ok(warnings.some((w) => w.includes('mangler product_url')));
});

test('no missing-url warnings for inactive models', () => {
  const models = [model(), model({ model_id: 'beta', name: 'Beta', active: false, image_url: null, product_url: null })];
  const { warnings } = buildData(makeWorkbook({ models }));
  assert.deepEqual(warnings, []);
});
