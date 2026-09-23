// Tests for src/engine.js.
// Most tests run against the real data/size-chart.json (run `npm run build-data` first).
// A few generic rules are also tested with a small synthetic chart at the bottom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/engine.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'size-chart.json'), 'utf8'));

const run = (length, width, unit = 'mm', chart = data) => recommend({ length, width, unit }, chart);

// Compact summary of the recommendations, e.g. "active 12 Slim → alt 12 (width)".
function summary(result) {
  return result.recommendations.map((r) => {
    let text = `${r.modelId} ${r.sizeLabel}`;
    if (r.warning) text += ` [${r.warning}]`;
    if (r.advice.includes('near_upper_limit')) text += ' (near)';
    if (r.alternative) text += ` → alt ${r.alternative.sizeLabel} (${r.alternative.reason})`;
    return text;
  });
}

// Find the recommendation for one model (or undefined).
const forModel = (result, modelId) => result.recommendations.find((r) => r.modelId === modelId);

// ---------------------------------------------------------------------------
// Mandatory cases from STEG1-BUILD-PROMPT.md
// ---------------------------------------------------------------------------

test('#1 11,8 × 11,0 cm → four models, three with alternative', () => {
  const result = run('11,8', '11,0', 'cm');
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.input, { lengthMm: 118, widthMm: 110, unit: 'cm' });
  assert.deepEqual(summary(result), [
    'trailblazer 12 Slim',
    'active 12 Slim (near) → alt 12 (width)',
    'ultra 12 (near) → alt 13 Slim (length)',
    'trekking 12 Slim (near) → alt 12 (width)',
  ]);
});

test('#2 118 × 124 mm → wide hoof: Ultra 13 Regular with warning, no alternative', () => {
  const result = run(118, 124);
  assert.equal(result.status, 'ok');
  assert.deepEqual(summary(result), ['ultra 13 [outside_size_chart]']);
  const ultra = result.recommendations[0];
  assert.equal(ultra.variant, 'regular');
  assert.equal(ultra.alternative, null);
  assert.deepEqual(ultra.advice, []);
});

test('#3 75,5 × 65 mm → 1 mm gap: size 7 Regular + alt 8 Slim', () => {
  const result = run('75,5', 65);
  assert.equal(result.status, 'ok');
  assert.deepEqual(summary(result), [
    'active 7 (near) → alt 8 Slim (length)',
    'trekking 7 (near) → alt 8 Slim (length)',
  ]);
  assert.ok(result.recommendations.every((r) => r.betweenSizes));
});

test('#4 170 × 150 mm → no_match (length fits no size, so no wide-hoof rule)', () => {
  const result = run(170, 150);
  assert.equal(result.status, 'no_match');
  assert.deepEqual(result.recommendations, []);
});

test('#5 60 × 55 mm → no_match', () => {
  assert.equal(run(60, 55).status, 'no_match');
});

test('#6 invalid input gives the right error code per field', () => {
  assert.deepEqual(run('abc', 100).errors, [{ field: 'length', code: 'not_a_number' }]);
  assert.deepEqual(run(100, '').errors, [{ field: 'width', code: 'empty' }]);
  assert.deepEqual(run('-5', 100).errors, [{ field: 'length', code: 'not_positive' }]);
  assert.deepEqual(run(100, '300').errors, [{ field: 'width', code: 'out_of_range' }]);
  assert.deepEqual(run('abc', '').errors, [
    { field: 'length', code: 'not_a_number' },
    { field: 'width', code: 'empty' },
  ]);
  const result = run(100, 100, 'ft');
  assert.equal(result.status, 'invalid_input');
  assert.deepEqual(result.errors, [{ field: 'unit', code: 'invalid_unit' }]);
  assert.deepEqual(result.recommendations, []);
});

test('#7 4 5/8 × 4 1/4 inches → 117,5 × 108,0 mm, same result as mm', () => {
  const inches = run('4 5/8', '4 1/4', 'in');
  assert.deepEqual(inches.input, { lengthMm: 117.5, widthMm: 108, unit: 'in' });
  const millimetres = run('117,5', '108', 'mm');
  assert.deepEqual(inches.recommendations, millimetres.recommendations);
  assert.deepEqual(summary(inches), [
    'trailblazer 12 Slim',
    'active 12 Slim (near) → alt 12 (width)',
    'ultra 12',
    'trekking 12 Slim (near) → alt 12 (width)',
  ]);
});

test('#8 12,5 and 12.5 cm give identical results', () => {
  assert.deepEqual(run('12,5', '11,5', 'cm'), run('12.5', '11.5', 'cm'));
  assert.deepEqual(run('12,5', '11,5', 'cm').recommendations, run(125, 115).recommendations);
});

// #9: every size row in the real data, exactly on its min and max.
test('#9 every size matches exactly on its min and max length/width', () => {
  for (const row of data.sizes) {
    const widthLow = row.width_min_mm ?? row.width_max_mm - 5;
    for (const [length, width] of [
      [row.length_min_mm, widthLow],
      [row.length_max_mm, row.width_max_mm],
      [row.length_min_mm, row.width_max_mm],
      [row.length_max_mm, widthLow],
    ]) {
      const rec = forModel(run(length, width), row.model_id);
      assert.ok(rec, `${row.model_id} ${row.size_label}: no match for ${length} × ${width}`);
      assert.equal(rec.sizeLabel, row.size_label, `${row.model_id} at ${length} × ${width}`);
      assert.equal(rec.warning, null);
    }
  }
});

test('#9 1 mm over max length → next size up in the same model', () => {
  // Active 12 Slim: 116–125. 126 → Active 13 Slim.
  assert.equal(forModel(run(125, 100), 'active').sizeLabel, '12 Slim');
  assert.equal(forModel(run(126, 100), 'active').sizeLabel, '13 Slim');
  // Trailblazer 12: 114–121. 122 → 13.
  assert.equal(forModel(run(121, 118), 'trailblazer').sizeLabel, '12');
  assert.equal(forModel(run(122, 122), 'trailblazer').sizeLabel, '13');
});

test('#9 0,5 mm over max length → gap rule: same size, near limit, alt next size', () => {
  const rec = forModel(run('125,5', 100), 'active');
  assert.equal(rec.sizeLabel, '12 Slim');
  assert.equal(rec.betweenSizes, true);
  assert.deepEqual(rec.advice, ['near_upper_limit']);
  assert.deepEqual(rec.alternative, { sizeLabel: '13 Slim', size: '13', variant: 'slim', reason: 'length' });
});

test('#9 1 mm over max width (Slim) → Regular in the same size', () => {
  // Active 12 Slim up to 110, 12 Regular 111–120.
  assert.equal(forModel(run(118, 110), 'active').sizeLabel, '12 Slim');
  assert.equal(forModel(run(118, 111), 'active').sizeLabel, '12');
});

test('#9 0,5 mm over Slim max width → gap rule: Slim, near limit, alt Regular', () => {
  const rec = forModel(run(118, '110,5'), 'active');
  assert.equal(rec.sizeLabel, '12 Slim');
  assert.equal(rec.betweenSizes, true);
  assert.deepEqual(rec.alternative, { sizeLabel: '12', size: '12', variant: 'regular', reason: 'width' });
});

// ---------------------------------------------------------------------------
// Rule 3: min width, several models
// ---------------------------------------------------------------------------

test('min width is checked: narrow hoof does not get Trailblazer Slim below its min', () => {
  // Trailblazer 12 Slim: width 104–113. Width 100 is too narrow for Trailblazer 12.
  const result = run(118, 100);
  assert.equal(forModel(result, 'trailblazer'), undefined);
  assert.equal(forModel(result, 'active').sizeLabel, '12 Slim');
});

test('Slim without width_min has no lower limit', () => {
  // Active 7 Slim: up to 60 mm, no minimum.
  assert.equal(forModel(run(70, 40), 'active').sizeLabel, '7 Slim');
});

test('only models that fit are returned, in sort_order', () => {
  const result = run(95, 88); // Ultra 10 (91–100, 86–95), Active/Trekking 9 (86–95, 81–90)
  const ids = result.recommendations.map((r) => r.modelId);
  const order = data.models.map((m) => m.model_id).filter((id) => ids.includes(id));
  assert.deepEqual(ids, order);
});

// ---------------------------------------------------------------------------
// Rule 5: near upper limit
// ---------------------------------------------------------------------------

test('near limit: exactly tolerance (2 mm) from max length → alternative', () => {
  // Ultra 12: 111–120. 118 is 2 mm from max.
  assert.equal(forModel(run(118, 108), 'ultra').alternative?.sizeLabel, '13 Slim');
  // 117,9 is 2,1 mm from max → no alternative.
  const rec = forModel(run('117,9', 108), 'ultra');
  assert.equal(rec.alternative, null);
  assert.deepEqual(rec.advice, []);
});

test('near limit: exactly on max → alternative', () => {
  assert.equal(forModel(run(120, 108), 'ultra').alternative?.sizeLabel, '13 Slim');
});

test('near limit: lower end never gives an alternative', () => {
  // Active 12 Slim: 116–125, width up to 110. On min length, low width.
  const rec = forModel(run(116, 90), 'active');
  assert.deepEqual(rec.advice, []);
  assert.equal(rec.alternative, null);
});

test('near max length: alternative uses the variant where the width fits', () => {
  // Active 12 Regular (111–120), length 124 near max 125. Width 115 → 13 Slim (up to 120).
  const rec = forModel(run(124, 115), 'active');
  assert.equal(rec.sizeLabel, '12');
  assert.deepEqual(rec.alternative, { sizeLabel: '13 Slim', size: '13', variant: 'slim', reason: 'length' });
});

test('near max length takes priority over near max width', () => {
  // Active 12 Slim, both length (125) and width (110) on max → next size up.
  const rec = forModel(run(125, 110), 'active');
  assert.equal(rec.alternative.reason, 'length');
  assert.equal(rec.alternative.sizeLabel, '13 Slim');
});

test('near max width on Regular → next size up where the width fits', () => {
  // Active 12 Regular 111–120, width 120 → 13 Slim (up to 120).
  const rec = forModel(run(118, 120), 'active');
  assert.equal(rec.sizeLabel, '12');
  assert.deepEqual(rec.alternative, { sizeLabel: '13 Slim', size: '13', variant: 'slim', reason: 'width' });
});

test('near max length, but width does not fit the next size → no alternative (Trailblazer min width)', () => {
  // Trailblazer 12 Slim (114–121, 104–113). Length 120, width 105.
  // Next size 13 Slim needs width ≥ 112 → no alternative. Advice is still given.
  const rec = forModel(run(120, 105), 'trailblazer');
  assert.equal(rec.sizeLabel, '12 Slim');
  assert.deepEqual(rec.advice, ['near_upper_limit']);
  assert.equal(rec.alternative, null);
});

test('near max on the largest size → advice, but no alternative', () => {
  const rec = forModel(run(165, 150), 'active'); // Active 16 Slim, max 165
  assert.equal(rec.sizeLabel, '16 Slim');
  assert.deepEqual(rec.advice, ['near_upper_limit']);
  assert.equal(rec.alternative, null);
});

test('gap between sizes on the largest length is not a gap (nothing above)', () => {
  // Active 16: max 165. 165,5 has no size above → no Active match.
  assert.equal(forModel(run('165,5', 150), 'active'), undefined);
});

// ---------------------------------------------------------------------------
// Rule 5b: wide hoof
// ---------------------------------------------------------------------------

test('wide hoof: smallest Ultra size where the width fits, Slim before Regular', () => {
  // Length 100 fits Active 10 (Regular up to 100), width 106 is too wide for all models.
  // Ultra: 11 Regular up to 105 → no, 12 Slim up to 105 → no, 12 Regular 106–115 → yes.
  const result = run(100, 106);
  assert.deepEqual(summary(result), ['ultra 12 [outside_size_chart]']);
});

test('wide hoof: Regular is chosen when only Regular fits the width', () => {
  // Length 90 fits Active/Trekking 9 (Regular up to 90) and Trailblazer 9 (up to 97).
  // Width 99 is too wide for all of them; Ultra starts at length 91.
  // Ultra: 10 Regular up to 95 → no, 11 Slim up to 95 → no, 11 Regular 96–105 → yes.
  const result = run(90, 99);
  assert.deepEqual(summary(result), ['ultra 11 [outside_size_chart]']);
  assert.equal(result.recommendations[0].variant, 'regular');
});

test('wide hoof: Slim is chosen before Regular when the width fits it', () => {
  // Length 70 fits Active/Trekking 7 (Regular up to 70). Width 80 is too wide.
  // Ultra 10 Slim (up to 85) is the smallest Ultra where the width fits.
  const result = run(70, 80);
  assert.deepEqual(summary(result), ['ultra 10 Slim [outside_size_chart]']);
});

test('wide hoof: width too big even for the largest Ultra → no_match', () => {
  // Length 160 fits Active 16 (Regular up to 160). Width 170 > Ultra 16 Regular max 155.
  assert.equal(run(160, 170).status, 'no_match');
});

test('wide hoof rule is not used when another model fits', () => {
  // Active 12 max width 120, but Trailblazer 12 Regular (114–121) fits 121.
  // Width is on max → next size up where the width fits = 13 Slim (112–121).
  const result = run(118, 121);
  assert.deepEqual(summary(result), ['trailblazer 12 (near) → alt 13 Slim (width)']);
});

test('wide hoof model comes from settings, not hard-coded', () => {
  const custom = structuredClone(data);
  custom.settings.wide_hoof_model = 'trekking';
  const result = run(118, 124, 'mm', custom);
  // Trekking: 12 Regular up to 120, 13 Slim up to 120, 13 Regular 121–130 → 13.
  assert.deepEqual(summary(result), ['trekking 13 [outside_size_chart]']);
});

// ---------------------------------------------------------------------------
// Output format and determinism
// ---------------------------------------------------------------------------

test('output has the documented shape', () => {
  const result = run(118, 110);
  assert.deepEqual(Object.keys(result).sort(), ['errors', 'input', 'recommendations', 'status']);
  for (const r of result.recommendations) {
    assert.deepEqual(
      Object.keys(r).sort(),
      ['advice', 'alternative', 'betweenSizes', 'modelId', 'size', 'sizeLabel', 'variant', 'warning']
    );
  }
});

test('engine is deterministic and does not modify the data', () => {
  const before = JSON.stringify(data);
  const a = run(118, 110);
  const b = run(118, 110);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(data), before);
});

test('accepts plain numbers (for step 2 image analysis)', () => {
  assert.deepEqual(run(118, 110).recommendations, run('118', '110').recommendations);
});

// ---------------------------------------------------------------------------
// Generic rules on a small synthetic chart
// ---------------------------------------------------------------------------

const synthetic = {
  settings: { tolerance_mm: 2, wide_hoof_model: 'wide' },
  models: [{ model_id: 'narrow' }, { model_id: 'wide' }],
  sizes: [
    // "narrow": Regular only (no Slim), with a real gap (> 1 mm) between sizes.
    { model_id: 'narrow', size_label: '1', size: '1', variant: 'regular', length_min_mm: 100, length_max_mm: 109, width_min_mm: null, width_max_mm: 90 },
    { model_id: 'narrow', size_label: '2', size: '2', variant: 'regular', length_min_mm: 115, length_max_mm: 124, width_min_mm: null, width_max_mm: 100 },
    { model_id: 'wide', size_label: '1', size: '1', variant: 'regular', length_min_mm: 200, length_max_mm: 209, width_min_mm: 95, width_max_mm: 110 },
  ],
};

test('synthetic: a real gap (> 1 mm) between sizes is not treated as "between sizes"', () => {
  assert.equal(run('109,5', 80, 'mm', synthetic).status, 'no_match');
  assert.equal(run(112, 80, 'mm', synthetic).status, 'no_match');
});

test('synthetic: Regular only, near max width, no size above with fitting width → no alternative', () => {
  const rec = forModel(run(120, 100, 'mm', synthetic), 'narrow');
  assert.deepEqual(rec.advice, ['near_upper_limit']);
  assert.equal(rec.alternative, null);
});

test('synthetic: near max width on Regular → next size up (width reason)', () => {
  const rec = forModel(run(105, 89, 'mm', synthetic), 'narrow');
  assert.deepEqual(rec.alternative, { sizeLabel: '2', size: '2', variant: 'regular', reason: 'width' });
});

test('synthetic: wide hoof model is chosen by width only', () => {
  const result = run(105, 100, 'mm', synthetic);
  assert.deepEqual(summary(result), ['wide 1 [outside_size_chart]']);
});
