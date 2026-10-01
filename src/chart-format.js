// chart-format.js
// Pure functions for the size chart table (chart.js). No DOM, no UI text – runs in the browser and in Node.
//
//   formatLength(mm, unit)            66 → "6.6" (cm) or "2 5/8" (in)
//   formatRange(minMm, maxMm, unit)   "6.6 – 7.5"
//   buildChartRows(data, modelId)     one row per size, with Regular and Slim side by side
//   findModelByPath(data, pathname)   which model's product page are we on?
//   isSamePath(url, pathname)         does a link point to the page we are already on?

const MM_PER_INCH = 25.4;

/**
 * Format millimetres for the size chart.
 *   cm: always one decimal ("6.6", "16.0").
 *   in: whole inches plus a fraction rounded to the nearest 1/16, reduced ("3 3/8", "2", "5/8").
 * Note: 1 mm is less than 1/16 inch, so two neighbouring mm values can show the same inch value.
 */
export function formatLength(mm, unit) {
  if (unit === 'in') {
    // Round to the nearest 1/16 inch. mm * 160 / 254 = mm / 25.4 * 16, kept as one division.
    const sixteenths = Math.round((mm * 160) / 254);
    const whole = Math.floor(sixteenths / 16);
    let numerator = sixteenths % 16;
    let denominator = 16;
    // Reduce the fraction: 8/16 → 1/2, 6/16 → 3/8.
    while (numerator > 0 && numerator % 2 === 0) {
      numerator /= 2;
      denominator /= 2;
    }
    if (numerator === 0) return String(whole);
    if (whole === 0) return `${numerator}/${denominator}`;
    return `${whole} ${numerator}/${denominator}`;
  }
  // cm (default): one decimal. mm in the chart are whole numbers, so this is exact.
  return (Math.round(mm) / 10).toFixed(1);
}

/** A min–max interval: "6.6 – 7.5" (en dash with spaces). */
export function formatRange(minMm, maxMm, unit) {
  return `${formatLength(minMm, unit)} – ${formatLength(maxMm, unit)}`;
}

/**
 * Rows for one model's size chart, sorted by size (9, 10, …, 14, 14.5, 15).
 * Each row: { size: '14.5', regular: Measures | null, slim: Measures | null }
 *   Measures = { lengthMinMm, lengthMaxMm, widthMinMm, widthMaxMm }
 * A missing variant is null (the table shows "–"). Inactive rows are skipped.
 * Unknown model → [].
 */
export function buildChartRows(data, modelId) {
  const bySize = new Map();
  for (const s of data.sizes) {
    if (s.model_id !== modelId || s.active === false) continue;
    if (s.variant !== 'regular' && s.variant !== 'slim') continue;
    if (!bySize.has(s.size)) bySize.set(s.size, { size: s.size, regular: null, slim: null });
    bySize.get(s.size)[s.variant] = {
      lengthMinMm: s.length_min_mm,
      lengthMaxMm: s.length_max_mm,
      widthMinMm: s.width_min_mm,
      widthMaxMm: s.width_max_mm,
    };
  }
  return [...bySize.values()].sort((a, b) => Number(a.size) - Number(b.size));
}

/**
 * Find the model whose product_url has the same path as `pathname`.
 * Compares only the path: no domain, no query/hash, no trailing slash, case-insensitive.
 * Works on eqfusion.com and on the Webflow staging domain alike.
 * Accepts a path ("/products/active-jogging-shoe/") or a full URL. Returns the model or null.
 */
export function findModelByPath(data, pathname) {
  const target = normalisePath(pathname);
  if (!target) return null;
  return data.models.find((m) => m.active !== false && m.product_url && normalisePath(m.product_url) === target) || null;
}

/**
 * Does `url` point to the page the customer is already on (`pathname`)?
 * Same comparison as findModelByPath: path only. Used to hide links to the measuring guide
 * when the calculator / chart sits on the measuring guide page itself.
 */
export function isSamePath(url, pathname) {
  const a = normalisePath(url);
  return a !== null && a === normalisePath(pathname);
}

// "/Products/Active/?x=1#top" or "https://www.eqfusion.com/products/active/" → "/products/active"
function normalisePath(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let path;
  try {
    path = new URL(value.trim(), 'https://example.invalid').pathname;
  } catch {
    return null;
  }
  path = path.replace(/\/+$/, '').toLowerCase();
  return path === '' ? null : path; // the front page never matches a product
}
