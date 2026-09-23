// engine.js
// The recommendation engine: hoof length + width → recommended model(s) and size(s).
//
// Pure function: no DOM, no network, no customer-facing text. Runs in the browser
// (widget, step 1) and in Node (image-analysis backend, step 2).
// The rules are described in CLAUDE.md under "Anbefalingslogikk".
//
// ---------------------------------------------------------------------------
// Usage
//   import { recommend } from './engine.js';
//   const result = recommend({ length: '11,8', width: '11,0', unit: 'cm' }, sizeChartJson);
//
// Input
//   length, width : string or number, in `unit`
//   unit          : 'cm' | 'mm' | 'in'  (also 'inch'/'inches')
//   data          : the contents of data/size-chart.json
//
// Output
//   {
//     status: 'ok' | 'no_match' | 'invalid_input',
//     errors: [{ field: 'length' | 'width' | 'unit', code }],   // only for invalid_input
//              codes: 'empty', 'not_a_number', 'not_positive', 'out_of_range', 'invalid_unit'
//     input: { lengthMm, widthMm, unit },                        // null values if invalid
//     recommendations: [{                                        // empty unless status 'ok'
//       modelId, sizeLabel, size, variant,                       // e.g. 'active', '12 Slim', '12', 'slim'
//       advice: [] | ['near_upper_limit'],   // only given together with an alternative
//       warning: null | 'outside_size_chart',
//       outsideReason: null | 'wide' | 'narrow',  // why the hoof is outside the size chart
//       betweenSizes: boolean,     // length fell in the 1 mm gap between two sizes
//       alternative: null | {
//         sizeLabel, size, variant,
//         reason: 'length' | 'width'   // which measurement was close to the upper limit
//       }
//     }]
//   }
//
// Recommendations are ordered like the models in the data (sort_order).
//
// Decisions (Sven Erik, 23.09.26) on top of the rules in CLAUDE.md:
//   - "Near upper limit" is only reported when there is a real alternative:
//     near max length → next size up; near max width on Slim → Regular in the same size.
//     Regular near max width, or the largest size, gives just the size that fits.
//   - A width in the 1 mm step between Slim max and Regular min (e.g. 110.5) is Regular.
//   - Wide-hoof rule: only if the suggested size's length_min is at most
//     settings.wide_hoof_max_extra_length_mm longer than the hoof; otherwise no_match.
//   - Narrow-hoof rule (5c): narrower than the size chart → settings.narrow_hoof_model
//     in the size where the length fits (Slim), if the hoof is at most
//     settings.narrow_hoof_max_below_mm narrower than that Slim's width_min; otherwise no_match.
// ---------------------------------------------------------------------------

import { normaliseUnit, parseMeasurement } from './units.js';

/**
 * Recommend model(s) and size(s) for a hoof.
 * @param {{ length: string|number, width: string|number, unit: string }} input
 * @param {object} data  contents of size-chart.json
 */
export function recommend(input, data) {
  // 1–2. Normalise and validate the input.
  const errors = [];
  const unit = normaliseUnit(input?.unit);
  if (!unit) errors.push({ field: 'unit', code: 'invalid_unit' });

  let lengthMm = null;
  let widthMm = null;
  if (unit) {
    const length = parseMeasurement(input?.length, unit);
    const width = parseMeasurement(input?.width, unit);
    if (length.ok) lengthMm = length.mm;
    else errors.push({ field: 'length', code: length.code });
    if (width.ok) widthMm = width.mm;
    else errors.push({ field: 'width', code: width.code });
  }

  const inputOut = { lengthMm, widthMm, unit };
  if (errors.length) {
    return { status: 'invalid_input', errors, input: inputOut, recommendations: [] };
  }

  const tolerance = data.settings.tolerance_mm;
  const chart = buildChart(data);

  // 3–5. Look for a normal match in every model.
  const recommendations = [];
  for (const model of chart) {
    const match = findMatch(model, lengthMm, widthMm, tolerance);
    if (match) recommendations.push(match);
  }
  if (recommendations.length) {
    return { status: 'ok', errors: [], input: inputOut, recommendations };
  }

  // 5b. Wide hoof: the length fits a size, but the hoof is wider than the widest variant.
  const wide = findWideHoofMatch(chart, data.settings, lengthMm, widthMm);
  if (wide) {
    return { status: 'ok', errors: [], input: inputOut, recommendations: [wide] };
  }

  // 5c. Narrow hoof: narrower than the narrowest variant for its length.
  const narrow = findNarrowHoofMatch(chart, data.settings, lengthMm, widthMm);
  if (narrow) {
    return { status: 'ok', errors: [], input: inputOut, recommendations: [narrow] };
  }

  // 6. Nothing fits.
  return { status: 'no_match', errors: [], input: inputOut, recommendations: [] };
}

// ---------------------------------------------------------------------------
// Data preparation
// ---------------------------------------------------------------------------

// Turn the flat size list into:
//   [{ modelId, groups: [{ size, lengthMin, lengthMax, variants: [size rows, narrowest first] }] }]
// Groups (= one size, e.g. "12") are sorted by length; Slim and Regular share one group.
function buildChart(data) {
  return data.models.map((model) => {
    const bySize = new Map();
    for (const row of data.sizes) {
      if (row.model_id !== model.model_id) continue;
      if (!bySize.has(row.size)) {
        bySize.set(row.size, {
          size: row.size,
          lengthMin: row.length_min_mm,
          lengthMax: row.length_max_mm,
          variants: [],
        });
      }
      bySize.get(row.size).variants.push(row);
    }
    const groups = [...bySize.values()].sort((a, b) => a.lengthMin - b.lengthMin);
    for (const group of groups) group.variants.sort((a, b) => a.width_max_mm - b.width_max_mm);
    return { modelId: model.model_id, groups };
  });
}

// ---------------------------------------------------------------------------
// Range checks
// ---------------------------------------------------------------------------

// Does the length fit size number `index` in `groups`?
// Sizes follow each other with a 1 mm step (e.g. 66–75, 76–85). A length in that
// gap (75 < length < 76) belongs to the smaller size and counts as "in gap"
// (treated as near its upper limit).
// Returns { fits: boolean, inGap: boolean }.
function fitsLength(lengthMm, groups, index) {
  const { lengthMin, lengthMax } = groups[index];
  const next = groups[index + 1];
  if (lengthMm < lengthMin) return { fits: false, inGap: false };
  if (lengthMm <= lengthMax) return { fits: true, inGap: false };
  const adjacent = next && next.lengthMin - lengthMax === 1;
  if (adjacent && lengthMm < next.lengthMin) return { fits: true, inGap: true };
  return { fits: false, inGap: false };
}

// Does the width fit variant number `index` in `variants` (narrowest first)?
// Empty width_min = no lower limit. A width in the 1 mm step between Slim max and
// Regular min (e.g. 110 < width < 111) is bigger than Slim max, so it counts as Regular.
function fitsWidth(widthMm, variants, index) {
  const { width_min_mm: min, width_max_mm: max } = variants[index];
  const narrower = variants[index - 1];
  if (widthMm > max) return false;
  if (min === null || widthMm >= min) return true;
  const adjacent = narrower && min - narrower.width_max_mm === 1;
  return Boolean(adjacent && widthMm > narrower.width_max_mm);
}

// Index of the variant in `group` that fits the width, or -1.
function findVariantForWidth(group, widthMm) {
  return group.variants.findIndex((_, i) => fitsWidth(widthMm, group.variants, i));
}

// Is `value` within `tolerance` mm of `max`? (Rounded to 0.1 mm to avoid floating point noise.)
function isNearMax(value, max, tolerance) {
  return Math.round((max - value) * 10) / 10 <= tolerance;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Rule 3 + 5: normal match within one model, with "near upper limit" alternative.
function findMatch(model, lengthMm, widthMm, tolerance) {
  const { groups } = model;

  for (let g = 0; g < groups.length; g++) {
    const length = fitsLength(lengthMm, groups, g);
    if (!length.fits) continue;

    const group = groups[g];
    for (let v = 0; v < group.variants.length; v++) {
      if (!fitsWidth(widthMm, group.variants, v)) continue;

      const variant = group.variants[v];
      const nearLength = length.inGap || isNearMax(lengthMm, group.lengthMax, tolerance);
      const nearWidth = isNearMax(widthMm, variant.width_max_mm, tolerance);

      let alternative = null;
      if (nearLength) {
        // Next size up in the same model, in the variant where the width fits.
        const next = groups[g + 1];
        const i = next ? findVariantForWidth(next, widthMm) : -1;
        if (i >= 0) alternative = toAlternative(next.variants[i], 'length');
      }
      if (!alternative && nearWidth) {
        // Slim → Regular in the same size. Regular near max width gets no alternative.
        const wider = group.variants[v + 1];
        if (wider) alternative = toAlternative(wider, 'width');
      }

      return {
        modelId: model.modelId,
        sizeLabel: variant.size_label,
        size: variant.size,
        variant: variant.variant,
        advice: alternative ? ['near_upper_limit'] : [],
        warning: null,
        outsideReason: null,
        betweenSizes: length.inGap,
        alternative,
      };
    }
    // Length fits this size, but no variant fits the width. Lengths never overlap
    // within a model, so no other size can match either.
    return null;
  }
  return null;
}

// Rule 5b: the length fits a size in some model, but the hoof is wider than the
// widest variant of that size. Recommend the wide-hoof model (from settings) in the
// smallest size where the width fits (checked size by size, Slim before Regular).
// That size must not be much longer than the hoof: its length_min may be at most
// settings.wide_hoof_max_extra_length_mm above the hoof length, otherwise no match.
function findWideHoofMatch(chart, settings, lengthMm, widthMm) {
  const wideModelId = settings.wide_hoof_model;
  const maxExtraLength = settings.wide_hoof_max_extra_length_mm;
  const tooWide = chart.some(({ groups }) =>
    groups.some((group, g) => {
      if (!fitsLength(lengthMm, groups, g).fits) return false;
      const widest = group.variants[group.variants.length - 1];
      return widthMm > widest.width_max_mm;
    })
  );
  if (!tooWide) return null;

  const wideModel = chart.find((m) => m.modelId === wideModelId);
  if (!wideModel) return null;

  for (const group of wideModel.groups) {
    const i = findVariantForWidth(group, widthMm);
    if (i < 0) continue;
    // Larger sizes are only longer, so if this one is too long there is no match.
    if (group.lengthMin - lengthMm > maxExtraLength) return null;
    const variant = group.variants[i];
    return {
      modelId: wideModel.modelId,
      sizeLabel: variant.size_label,
      size: variant.size,
      variant: variant.variant,
      advice: [],
      warning: 'outside_size_chart',
      outsideReason: 'wide',
      betweenSizes: false,
      alternative: null,
    };
  }
  return null;
}

// Rule 5c: the hoof is narrower than the size chart. Recommend the narrow-hoof model
// (from settings) in the size where the LENGTH fits, in its narrowest variant (Slim),
// but only if the hoof is at most settings.narrow_hoof_max_below_mm narrower than
// that variant's width_min. Further outside the chart → no match.
function findNarrowHoofMatch(chart, settings, lengthMm, widthMm) {
  const model = chart.find((m) => m.modelId === settings.narrow_hoof_model);
  if (!model) return null;

  const g = model.groups.findIndex((_, i) => fitsLength(lengthMm, model.groups, i).fits);
  if (g < 0) return null;

  const narrowest = model.groups[g].variants[0];
  const min = narrowest.width_min_mm;
  if (min === null || widthMm >= min) return null; // not narrower than this size
  if (Math.round((min - widthMm) * 10) / 10 > settings.narrow_hoof_max_below_mm) return null;

  return {
    modelId: model.modelId,
    sizeLabel: narrowest.size_label,
    size: narrowest.size,
    variant: narrowest.variant,
    advice: [],
    warning: 'outside_size_chart',
    outsideReason: 'narrow',
    betweenSizes: fitsLength(lengthMm, model.groups, g).inGap,
    alternative: null,
  };
}

function toAlternative(row, reason) {
  return { sizeLabel: row.size_label, size: row.size, variant: row.variant, reason };
}
