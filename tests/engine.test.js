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
  // Active 12 Regular: length 116–125, width 111–120. 126 → Active 13 Slim (width 111–120).
  assert.equal(forModel(run(125, 115), 'active').sizeLabel, '12');
  assert.equal(forModel(run(126, 115), 'active').sizeLabel, '13 Slim');
  // Trailblazer 12: 114–121. 122 → 13.
  assert.equal(forModel(run(121, 118), 'trailblazer').sizeLabel, '12');
  assert.equal(forModel(run(122, 122), 'trailblazer').sizeLabel, '13');
});

test('#9 0,5 mm over max length → gap rule: same size, near limit, alt next size', () => {
  // Active 12 Regular (width 111–120), width 115 fits 13 Slim (111–120).
  const rec = forModel(run('125,5', 115), 'active');
  assert.equal(rec.sizeLabel, '12');
  assert.equal(rec.betweenSizes, true);
  assert.deepEqual(rec.advice, ['near_upper_limit']);
  assert.deepEqual(rec.alternative, { sizeLabel: '13 Slim', size: '13', variant: 'slim', reason: 'length' });
});

test('#9 1 mm over max width (Slim) → Regular in the same size', () => {
  // Active 12 Slim up to 110, 12 Regular 111–120.
  assert.equal(forModel(run(118, 110), 'active').sizeLabel, '12 Slim');
  assert.equal(forModel(run(118, 111), 'active').sizeLabel, '12');
});

test('#9 0,5 mm over Slim max width → Regular (bigger than Slim max), no advice', () => {
  // Decision 23.09.26: a width between Slim max (110) and Regular min (111) is Regular.
  const rec = forModel(run(118, '110,5'), 'active');
  assert.equal(rec.sizeLabel, '12');
  assert.equal(rec.betweenSizes, false);
  assert.deepEqual(rec.advice, []);
  assert.equal(rec.alternative, null);
});

test('width just over Slim max is Regular also for Trailblazer (89 → 90)', () => {
  assert.equal(forModel(run(95, '89,5'), 'trailblazer').sizeLabel, '9');
  assert.equal(forModel(run(95, '89,0'), 'trailblazer').sizeLabel, '9 Slim');
});

// ---------------------------------------------------------------------------
// Rule 3: min width, several models
// ---------------------------------------------------------------------------

test('min width is checked: narrow hoof does not get Trailblazer Slim below its min', () => {
  // Trailblazer 12 Slim: width 104–113. Width 102 is too narrow for Trailblazer 12.
  const result = run(118, 102);
  assert.equal(forModel(result, 'trailblazer'), undefined);
  assert.equal(forModel(result, 'active').sizeLabel, '12 Slim'); // Active 12 Slim: 101–110
});

test('Slim min width (Regular min − 10) is checked for Active/Trekking/Ultra', () => {
  // Active 14 Slim: 121–130. 140 × 121 fits, 140 × 120 does not (decision 23.09.26).
  assert.equal(forModel(run(140, 121), 'active').sizeLabel, '14 Slim');
  assert.equal(forModel(run(140, 120), 'active'), undefined);
  assert.equal(forModel(run(140, 120), 'trekking'), undefined);
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
  // Active 12 Slim: 116–125, width 101–110. On min length and min width.
  const rec = forModel(run(116, 101), 'active');
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
  // Trailblazer 12 Slim (114–121, 104–113): length 121 and width 113 both on max.
  // Next size 13 Slim (112–121) fits width 113 → length alternative.
  const rec = forModel(run(121, 113), 'trailblazer');
  assert.equal(rec.alternative.reason, 'length');
  assert.equal(rec.alternative.sizeLabel, '13 Slim');
});

test('near max length without a fitting next size falls back to Slim → Regular', () => {
  // Active 12 Slim (101–110) at length 125 and width 110. 13 Slim needs width ≥ 111,
  // so no length alternative; Slim is on max width → 12 Regular.
  const rec = forModel(run(125, 110), 'active');
  assert.deepEqual(rec.alternative, { sizeLabel: '12', size: '12', variant: 'regular', reason: 'width' });
});

test('near max width on Regular → just the size that fits, no advice (decision 23.09.26)', () => {
  // Active 12 Regular 111–120, width 120. 13 Slim is not wider, so no alternative.
  const rec = forModel(run(118, 120), 'active');
  assert.equal(rec.sizeLabel, '12');
  assert.deepEqual(rec.advice, []);
  assert.equal(rec.alternative, null);
});

test('near max length, but width does not fit the next size → no alternative, no advice', () => {
  // Trailblazer 12 Slim (114–121, 104–113). Length 120, width 105.
  // Next size 13 Slim needs width ≥ 112 → no alternative.
  const rec = forModel(run(120, 105), 'trailblazer');
  assert.equal(rec.sizeLabel, '12 Slim');
  assert.deepEqual(rec.advice, []);
  assert.equal(rec.alternative, null);
});

test('near max on the largest size → just the size that fits, no advice', () => {
  const rec = forModel(run(165, 145), 'active'); // Active 16 Slim (141–150), length max 165
  assert.equal(rec.sizeLabel, '16 Slim');
  assert.deepEqual(rec.advice, []);
  assert.equal(rec.alternative, null);
});

test('largest size, near max length and Slim near max width → Regular in the same size', () => {
  // No size above 16, but Slim → Regular is still a real alternative.
  const rec = forModel(run(165, 150), 'active');
  assert.equal(rec.sizeLabel, '16 Slim');
  assert.deepEqual(rec.advice, ['near_upper_limit']);
  assert.deepEqual(rec.alternative, { sizeLabel: '16', size: '16', variant: 'regular', reason: 'width' });
});

test('gap between sizes on the largest length is not a gap (nothing above)', () => {
  // Active 16: max 165. 165,5 has no size above → no Active match.
  assert.equal(forModel(run('165,5', 150), 'active'), undefined);
});

// ---------------------------------------------------------------------------
// Rule 5b: wide hoof
// ---------------------------------------------------------------------------

test('wide hoof: smallest Ultra size where the width fits (Regular)', () => {
  // Length 95 fits Active 9 (Regular up to 90) and Trailblazer 9 (up to 97). Width 99 too wide.
  // Ultra: 10 Regular up to 95 → no, 11 Slim up to 95 → no, 11 Regular 96–105 → yes.
  // Ultra 11 starts at 101 mm = 6 mm longer than the hoof → allowed (max 10).
  const result = run(95, 99);
  assert.deepEqual(summary(result), ['ultra 11 [outside_size_chart]']);
  assert.equal(result.recommendations[0].variant, 'regular');
});

test('wide hoof: Slim is chosen before Regular when the width fits it', () => {
  // Length 82 fits Active/Trekking 8 (Regular up to 80). Width 83 is too wide.
  // Ultra 10 Slim (up to 85, starts at 91 mm = 9 mm longer) is the smallest Ultra that fits.
  const result = run(82, 83);
  assert.deepEqual(summary(result), ['ultra 10 Slim [outside_size_chart]']);
});

test('wide hoof: boot at most 10 mm longer than the hoof (exactly 10 is allowed)', () => {
  // Ultra 10 starts at 91 mm.
  assert.deepEqual(summary(run(81, 83)), ['ultra 10 Slim [outside_size_chart]']); // 10 mm longer
  assert.equal(run(80, 83).status, 'no_match'); // 11 mm longer
});

test('wide hoof: suggested size too long for the hoof → no_match', () => {
  // 70 × 80: Ultra 10 Slim would be 21 mm longer than the hoof.
  assert.equal(run(70, 80).status, 'no_match');
  // 100 × 106: Ultra 12 (starts at 111) would be 11 mm longer.
  assert.equal(run(100, 106).status, 'no_match');
});

test('wide hoof: max extra length comes from settings', () => {
  const custom = structuredClone(data);
  custom.settings.wide_hoof_max_extra_length_mm = 25;
  assert.deepEqual(summary(run(70, 80, 'mm', custom)), ['ultra 10 Slim [outside_size_chart]']);
});

test('wide hoof: width too big even for the largest Ultra → no_match', () => {
  // Length 160 fits Active 16 (Regular up to 160). Width 170 > Ultra 16 Regular max 155.
  assert.equal(run(160, 170).status, 'no_match');
});

// ---------------------------------------------------------------------------
// Rule 5c: narrow hoof (decision 23.09.26)
// ---------------------------------------------------------------------------

test('narrow hoof: Ultra fits normally when the width is within Ultra Slim', () => {
  // 140 × 120: too narrow for Active/Trekking 14 Slim (121–130), but Ultra 14 Slim is 116–125.
  assert.deepEqual(summary(run(140, 120)), ['ultra 14 Slim']);
});

test('narrow hoof: narrower than the chart → Ultra Slim where the length fits, with warning', () => {
  // 140 × 110: Ultra 14 Slim min 116 → 6 mm narrower.
  const result = run(140, 110);
  assert.deepEqual(summary(result), ['ultra 14 Slim [outside_size_chart]']);
  const rec = result.recommendations[0];
  assert.equal(rec.outsideReason, 'narrow');
  assert.equal(rec.alternative, null);
  assert.deepEqual(rec.advice, []);
});

test('narrow hoof: at most 20 mm narrower (exactly 20 allowed, 21 → no_match)', () => {
  assert.deepEqual(summary(run(140, 96)), ['ultra 14 Slim [outside_size_chart]']); // 116 − 96 = 20
  assert.equal(run(140, 95).status, 'no_match'); // 21 mm
});

test('narrow hoof: length outside the Ultra range → no_match', () => {
  // 80 × 55: too narrow for Active/Trekking 8 Slim (61–70); Ultra starts at 91 mm.
  assert.equal(run(80, 55).status, 'no_match');
});

test('narrow hoof: length in the 1 mm gap between Ultra sizes', () => {
  // 100,5 → Ultra 10 (91–100, gap to 101). Ultra 10 Slim min 76 → 70 is 6 mm narrower.
  const rec = run('100,5', 70).recommendations[0];
  assert.equal(rec.sizeLabel, '10 Slim');
  assert.equal(rec.outsideReason, 'narrow');
  assert.equal(rec.betweenSizes, true);
});

test('narrow hoof: model and max distance come from settings', () => {
  const custom = structuredClone(data);
  custom.settings.narrow_hoof_max_below_mm = 5;
  assert.equal(run(140, 110, 'mm', custom).status, 'no_match'); // 6 > 5
  custom.settings.narrow_hoof_max_below_mm = 20;
  custom.settings.narrow_hoof_model = 'active';
  // Active 14 Slim (136–145, min 121) → 11 mm narrower.
  assert.deepEqual(summary(run(140, 110, 'mm', custom)), ['active 14 Slim [outside_size_chart]']);
});

test('wide hoof sets outsideReason "wide"', () => {
  assert.equal(run(118, 124).recommendations[0].outsideReason, 'wide');
});

test('wide hoof rule is not used when another model fits', () => {
  // Active 12 max width 120, but Trailblazer 12 Regular (114–121) fits 121.
  const result = run(118, 121);
  assert.deepEqual(summary(result), ['trailblazer 12']);
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
      ['advice', 'alternative', 'betweenSizes', 'modelId', 'outsideReason', 'size', 'sizeLabel', 'variant', 'warning']
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
  settings: { tolerance_mm: 2, wide_hoof_model: 'wide', wide_hoof_max_extra_length_mm: 10 },
  models: [{ model_id: 'narrow' }, { model_id: 'wide' }],
  sizes: [
    // "narrow": Regular only (no Slim), with a real gap (> 1 mm) between sizes.
    { model_id: 'narrow', size_label: '1', size: '1', variant: 'regular', length_min_mm: 100, length_max_mm: 109, width_min_mm: null, width_max_mm: 90 },
    { model_id: 'narrow', size_label: '2', size: '2', variant: 'regular', length_min_mm: 115, length_max_mm: 124, width_min_mm: null, width_max_mm: 100 },
    { model_id: 'wide', size_label: '1', size: '1', variant: 'regular', length_min_mm: 110, length_max_mm: 114, width_min_mm: 95, width_max_mm: 110 },
  ],
};

test('synthetic: a real gap (> 1 mm) between sizes is not treated as "between sizes"', () => {
  assert.equal(run('109,5', 80, 'mm', synthetic).status, 'no_match');
  assert.equal(run(112, 80, 'mm', synthetic).status, 'no_match');
});

test('synthetic: Regular only, near max width → no alternative, no advice', () => {
  const rec = forModel(run(120, 100, 'mm', synthetic), 'narrow');
  assert.deepEqual(rec.advice, []);
  assert.equal(rec.alternative, null);
});

test('synthetic: near max width on Regular with a size above → still no alternative', () => {
  const rec = forModel(run(105, 89, 'mm', synthetic), 'narrow');
  assert.equal(rec.sizeLabel, '1');
  assert.equal(rec.alternative, null);
});

test('synthetic: wide hoof model is chosen by width only', () => {
  const result = run(105, 100, 'mm', synthetic);
  assert.deepEqual(summary(result), ['wide 1 [outside_size_chart]']);
});
