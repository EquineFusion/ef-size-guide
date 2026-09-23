// units.js
// Parsing of user input and unit conversion. No DOM, no UI text – runs in the browser and in Node.
//
// Accepted input:
//   - decimal comma or point:      "12,5"  "12.5"
//   - centimetres, millimetres or inches (unit codes: 'cm', 'mm', 'in')
//   - inches as decimal or fraction: "5.25"  "5 1/4"  "5-1/4"  "3/4"
//   - plain numbers (e.g. from image analysis in step 2): 118
//
// All results are in millimetres, rounded to 0.1 mm.
// Rounding is done with integer arithmetic to avoid floating point errors
// (e.g. 4 1/4" = 107.95 mm must become 108.0 mm, not 107.9 mm).

// A hoof outside this range is not realistic → input error (not "no match").
export const INPUT_MIN_MM = 40;
export const INPUT_MAX_MM = 250;

// Tenths of a millimetre per unit.
const TENTHS_PER_UNIT = { mm: 10, cm: 100, in: 254 };

/**
 * Normalise a unit code. Returns 'mm', 'cm', 'in' or null if unknown.
 * Accepts a few common spellings ("inch", "inches", "CM").
 */
export function normaliseUnit(unit) {
  if (typeof unit !== 'string') return null;
  const u = unit.trim().toLowerCase();
  if (u === 'mm' || u === 'cm') return u;
  if (u === 'in' || u === 'inch' || u === 'inches' || u === '"') return 'in';
  return null;
}

/**
 * Parse one measurement.
 * @param {string|number} value  what the user typed
 * @param {string} unit          'mm' | 'cm' | 'in' (must already be normalised)
 * @returns {{ ok: true, mm: number } | { ok: false, code: string }}
 *   Error codes: 'empty', 'not_a_number', 'not_positive', 'out_of_range'
 */
export function parseMeasurement(value, unit) {
  if (value === null || value === undefined) return { ok: false, code: 'empty' };
  if (typeof value === 'number' && !Number.isFinite(value)) return { ok: false, code: 'not_a_number' };

  const text = String(value).trim().replace(/\s+/g, ' ');
  if (text === '') return { ok: false, code: 'empty' };

  // Negative or zero values: a minus sign in front of a number.
  if (/^-\s?[\d.,]/.test(text)) return { ok: false, code: 'not_positive' };

  const tenths = toTenthsOfMm(text, unit);
  if (tenths === null) return { ok: false, code: 'not_a_number' };
  if (tenths <= 0) return { ok: false, code: 'not_positive' };

  const mm = tenths / 10;
  if (mm < INPUT_MIN_MM || mm > INPUT_MAX_MM) return { ok: false, code: 'out_of_range' };
  return { ok: true, mm };
}

// Convert text to a whole number of tenths of a millimetre, or null if not a number.
function toTenthsOfMm(text, unit) {
  const factor = TENTHS_PER_UNIT[unit];

  // Decimal number: "12", "12,5", "12.5", ".5"
  const decimal = text.match(/^(\d*)[.,]?(\d*)$/);
  if (decimal && (decimal[1] !== '' || decimal[2] !== '')) {
    const number = Number(`${decimal[1] || '0'}.${decimal[2] || '0'}`);
    // toFixed(6) removes floating point noise before rounding (e.g. 11.8 * 100).
    return Math.round(Number((number * factor).toFixed(6)));
  }

  // Fractions are only accepted for inches: "5 1/4", "5-1/4", "3/4".
  if (unit !== 'in') return null;
  const fraction = text.match(/^(?:(\d+)[ -])?(\d+)\/(\d+)$/);
  if (!fraction) return null;
  const whole = Number(fraction[1] || 0);
  const numerator = Number(fraction[2]);
  const denominator = Number(fraction[3]);
  if (denominator === 0) return null;
  // (whole + numerator/denominator) * 254, computed as one fraction to stay exact.
  return Math.round(((whole * denominator + numerator) * factor) / denominator);
}
