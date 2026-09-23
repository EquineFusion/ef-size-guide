// build-data.mjs
// Converts the master size chart (data/size-chart.xlsx) into data/size-chart.json.
//
// - Reads the sheets `models`, `sizes` and `settings`. `README` and `avvik` are ignored.
// - Validates everything. Any ERROR stops the build and no JSON is written,
//   so invalid data can never reach the customer.
// - WARNINGS are printed, but the build continues.
// - Only rows with active = TRUE end up in the JSON.
//
// Messages are in Norwegian because they are read by the person editing the Excel file.
//
// Usage: npm run build-data
//
// The validation logic is exported as `buildData(workbook)` so it can be tested
// with small in-memory workbooks (see tests/build-data.test.js).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

// Sanity limits for all millimetre values (a hoof outside this range is not realistic).
export const MM_MIN = 40;
export const MM_MAX = 250;

const MODEL_COLUMNS = ['model_id', 'name', 'use_case', 'sold_as', 'product_url', 'image_url', 'active', 'sort_order', 'source'];
const SIZE_COLUMNS = ['model_id', 'size_label', 'size', 'variant', 'length_min_mm', 'length_max_mm', 'width_min_mm', 'width_max_mm', 'active', 'source'];
const SETTINGS_COLUMNS = ['key', 'value'];
const REQUIRED_SETTINGS = [
  'tolerance_mm', 'wide_hoof_model', 'wide_hoof_max_extra_length_mm',
  'narrow_hoof_model', 'narrow_hoof_max_below_mm',
  'fresh_trim_add_mm', 'measure_guide_url', 'dealer_finder_url', 'data_version',
];
// Settings that must be a whole number of millimetres between 0 and 50.
const MM_SETTINGS = ['tolerance_mm', 'wide_hoof_max_extra_length_mm', 'narrow_hoof_max_below_mm', 'fresh_trim_add_mm'];
// Settings that must name an active model.
const MODEL_SETTINGS = ['wide_hoof_model', 'narrow_hoof_model'];

// ---------------------------------------------------------------------------
// Helpers for reading cells
// ---------------------------------------------------------------------------

// Normalise a cell value: trim strings, turn empty strings into null.
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}

// Read a sheet as a list of { row, values } where `row` is the Excel row number
// (so error messages can point to the exact row) and `values` is keyed by column name.
function readSheet(workbook, sheetName, requiredColumns, errors) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push(`Arket «${sheetName}» mangler i Excel-filen.`);
    return [];
  }

  const header = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []).map((h) => clean(h));
  for (const column of requiredColumns) {
    if (!header.includes(column)) {
      errors.push(`Ark «${sheetName}»: kolonnen «${column}» mangler i rad 1.`);
    }
  }

  // sheet_to_json skips blank rows; __rowNum__ (0-based) keeps the real Excel row number.
  return XLSX.utils.sheet_to_json(sheet, { defval: null }).map((raw) => {
    const values = {};
    for (const [key, value] of Object.entries(raw)) values[clean(key)] = clean(value);
    return { row: raw.__rowNum__ + 1, values };
  });
}

// Parse TRUE/FALSE (Excel boolean or text). Returns null if not a valid boolean.
function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
  }
  return null;
}

// Validate a whole-millimetre field. Returns the number, or null (and records an error).
function parseMm(value, where, column, errors, { required = true } = {}) {
  if (value === null) {
    if (required) errors.push(`${where}: «${column}» mangler.`);
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number)) {
    errors.push(`${where}: «${column}» må være et helt antall millimeter (fant «${value}»).`);
    return null;
  }
  if (number < MM_MIN || number > MM_MAX) {
    errors.push(`${where}: «${column}» = ${number} mm er utenfor realistiske verdier (${MM_MIN}–${MM_MAX} mm).`);
    return null;
  }
  return number;
}

// ---------------------------------------------------------------------------
// Sheet parsers
// ---------------------------------------------------------------------------

function parseModels(rows, errors, warnings) {
  const models = [];
  const seen = new Set();

  for (const { row, values: v } of rows) {
    const where = `Ark «models», rad ${row}`;
    const before = errors.length;

    for (const column of ['model_id', 'name', 'use_case', 'sold_as', 'active', 'sort_order']) {
      if (v[column] === null || v[column] === undefined) errors.push(`${where}: «${column}» mangler.`);
    }

    const id = v.model_id === null ? null : String(v.model_id);
    if (id !== null) {
      if (seen.has(id)) errors.push(`${where}: model_id «${id}» finnes flere ganger.`);
      seen.add(id);
    }

    if (v.sold_as !== null && v.sold_as !== 'single' && v.sold_as !== 'pair') {
      errors.push(`${where}: «sold_as» må være «single» eller «pair» (fant «${v.sold_as}»).`);
    }

    const active = parseBoolean(v.active);
    if (v.active !== null && active === null) {
      errors.push(`${where}: «active» må være TRUE eller FALSE (fant «${v.active}»).`);
    }

    const sortOrder = Number(v.sort_order);
    if (v.sort_order !== null && !Number.isFinite(sortOrder)) {
      errors.push(`${where}: «sort_order» må være et tall (fant «${v.sort_order}»).`);
    }

    if (errors.length > before) continue;

    if (active) {
      if (v.product_url === null) warnings.push(`${where}: «${id}» mangler product_url.`);
      if (v.image_url === null) warnings.push(`${where}: «${id}» mangler image_url (widgeten viser plassholder).`);
    }

    models.push({
      model_id: id,
      name: String(v.name),
      use_case: String(v.use_case),
      sold_as: v.sold_as,
      product_url: v.product_url,
      image_url: v.image_url,
      sort_order: sortOrder,
      active,
    });
  }
  return models;
}

function parseSizes(rows, modelIds, errors) {
  const sizes = [];
  const seen = new Set();

  for (const { row, values: v } of rows) {
    const where = `Ark «sizes», rad ${row}`;
    const before = errors.length;

    for (const column of ['model_id', 'size_label', 'size', 'variant', 'active']) {
      if (v[column] === null || v[column] === undefined) errors.push(`${where}: «${column}» mangler.`);
    }

    const modelId = v.model_id === null ? null : String(v.model_id);
    if (modelId !== null && !modelIds.has(modelId)) {
      errors.push(`${where}: ukjent model_id «${modelId}» (finnes ikke i arket «models»).`);
    }

    const sizeLabel = v.size_label === null ? null : String(v.size_label);
    if (modelId !== null && sizeLabel !== null) {
      const key = `${modelId}|${sizeLabel}`;
      if (seen.has(key)) errors.push(`${where}: «${modelId} ${sizeLabel}» finnes flere ganger.`);
      seen.add(key);
    }

    if (v.variant !== null && v.variant !== 'slim' && v.variant !== 'regular') {
      errors.push(`${where}: «variant» må være «slim» eller «regular» (fant «${v.variant}»).`);
    }

    const active = parseBoolean(v.active);
    if (v.active !== null && active === null) {
      errors.push(`${where}: «active» må være TRUE eller FALSE (fant «${v.active}»).`);
    }

    const lengthMin = parseMm(v.length_min_mm, where, 'length_min_mm', errors);
    const lengthMax = parseMm(v.length_max_mm, where, 'length_max_mm', errors);
    // Required for every size (decision 23.09.26): without a minimum a narrow hoof
    // would get a boot that is too wide.
    const widthMin = parseMm(v.width_min_mm, where, 'width_min_mm', errors);
    const widthMax = parseMm(v.width_max_mm, where, 'width_max_mm', errors);

    if (lengthMin !== null && lengthMax !== null && lengthMin > lengthMax) {
      errors.push(`${where}: length_min_mm (${lengthMin}) er større enn length_max_mm (${lengthMax}).`);
    }
    if (widthMin !== null && widthMax !== null && widthMin > widthMax) {
      errors.push(`${where}: width_min_mm (${widthMin}) er større enn width_max_mm (${widthMax}).`);
    }

    if (errors.length > before) continue;

    sizes.push({
      row,
      model_id: modelId,
      size_label: sizeLabel,
      size: String(v.size), // "14.5" may come from Excel as the number 14.5
      variant: v.variant,
      length_min_mm: lengthMin,
      length_max_mm: lengthMax,
      width_min_mm: widthMin,
      width_max_mm: widthMax,
      active,
    });
  }
  return sizes;
}

function parseSettings(rows, errors) {
  const settings = {};
  for (const { values: v } of rows) {
    if (v.key !== null) settings[String(v.key)] = v.value;
  }

  for (const key of REQUIRED_SETTINGS) {
    if (settings[key] === null || settings[key] === undefined) {
      errors.push(`Ark «settings»: innstillingen «${key}» mangler.`);
    }
  }
  for (const key of MM_SETTINGS) {
    if (settings[key] === null || settings[key] === undefined) continue;
    const number = Number(settings[key]);
    if (!Number.isInteger(number) || number < 0 || number > 50) {
      errors.push(`Ark «settings»: «${key}» må være et helt antall millimeter mellom 0 og 50 (fant «${settings[key]}»).`);
    } else {
      settings[key] = number;
    }
  }
  if (settings.data_version !== undefined && settings.data_version !== null) {
    settings.data_version = String(settings.data_version);
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Cross-row checks (only on active rows – that is what the customer sees)
// ---------------------------------------------------------------------------

// Slim and Regular in the same size must never overlap in width,
// so there is always exactly one variant that fits within a size.
function checkSlimRegularOverlap(sizes, errors) {
  const groups = groupBy(sizes, (s) => `${s.model_id}|${s.size}`);
  for (const group of groups.values()) {
    const slims = group.filter((s) => s.variant === 'slim');
    const regulars = group.filter((s) => s.variant === 'regular');
    for (const slim of slims) {
      for (const regular of regulars) {
        const slimMin = slim.width_min_mm ?? -Infinity;
        const regularMin = regular.width_min_mm ?? -Infinity;
        const overlaps = slimMin <= regular.width_max_mm && regularMin <= slim.width_max_mm;
        if (overlaps) {
          errors.push(
            `Ark «sizes», rad ${slim.row} og ${regular.row}: «${slim.model_id} ${slim.size_label}» og ` +
              `«${regular.model_id} ${regular.size_label}» overlapper i bredde. ` +
              `Regular width_min_mm må være større enn Slim width_max_mm (${slim.width_max_mm}).`
          );
        }
      }
    }
  }
}

// Consecutive sizes in the same model should follow each other with exactly 1 mm step
// in length (e.g. 66–75, 76–85). A bigger gap or an overlap is a warning.
function checkLengthSteps(sizes, warnings) {
  const byModel = groupBy(sizes, (s) => s.model_id);
  for (const [modelId, modelSizes] of byModel) {
    // One length range per size (Slim and Regular share the length range).
    const ranges = [];
    for (const group of groupBy(modelSizes, (s) => s.size).values()) {
      ranges.push({ size: group[0].size, min: group[0].length_min_mm, max: group[0].length_max_mm });
      for (const s of group) {
        if (s.length_min_mm !== group[0].length_min_mm || s.length_max_mm !== group[0].length_max_mm) {
          warnings.push(`Ark «sizes», rad ${s.row}: «${modelId} ${s.size_label}» har annen lengde enn andre varianter i størrelse ${s.size}.`);
        }
      }
    }
    ranges.sort((a, b) => a.min - b.min);
    for (let i = 1; i < ranges.length; i++) {
      const prev = ranges[i - 1];
      const next = ranges[i];
      const step = next.min - prev.max;
      if (step > 1) {
        warnings.push(`Modell «${modelId}»: hull i lengde mellom størrelse ${prev.size} (maks ${prev.max} mm) og ${next.size} (min ${next.min} mm).`);
      } else if (step < 1) {
        warnings.push(`Modell «${modelId}»: størrelse ${prev.size} (maks ${prev.max} mm) og ${next.size} (min ${next.min} mm) overlapper i lengde.`);
      }
    }
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main build function (pure: workbook in, result out)
// ---------------------------------------------------------------------------

/**
 * Validate a workbook and build the JSON data.
 * @param {object} workbook  SheetJS workbook
 * @param {object} [options]
 * @param {string} [options.generatedAt]  ISO timestamp (injectable for tests)
 * @returns {{ data: object|null, errors: string[], warnings: string[] }}
 *          `data` is null if there are any errors.
 */
export function buildData(workbook, { generatedAt = new Date().toISOString() } = {}) {
  const errors = [];
  const warnings = [];

  const modelRows = readSheet(workbook, 'models', MODEL_COLUMNS, errors);
  const sizeRows = readSheet(workbook, 'sizes', SIZE_COLUMNS, errors);
  const settingRows = readSheet(workbook, 'settings', SETTINGS_COLUMNS, errors);
  if (errors.length) return { data: null, errors, warnings };

  const allModels = parseModels(modelRows, errors, warnings);
  const allModelIds = new Set(modelRows.map((r) => r.values.model_id).filter((id) => id !== null).map(String));
  const allSizes = parseSizes(sizeRows, allModelIds, errors);
  const settings = parseSettings(settingRows, errors);

  // Only active rows go to the customer. A size is only shown if its model is active too.
  const models = allModels.filter((m) => m.active).sort((a, b) => a.sort_order - b.sort_order);
  const activeModelIds = new Set(models.map((m) => m.model_id));
  const sizes = allSizes.filter((s) => s.active && activeModelIds.has(s.model_id));

  for (const key of MODEL_SETTINGS) {
    if (settings[key] && !activeModelIds.has(String(settings[key]))) {
      errors.push(`Ark «settings»: ${key} «${settings[key]}» finnes ikke som aktiv modell i arket «models».`);
    }
  }
  for (const model of models) {
    if (!sizes.some((s) => s.model_id === model.model_id)) {
      warnings.push(`Modell «${model.model_id}» er aktiv, men har ingen aktive størrelser.`);
    }
  }

  checkSlimRegularOverlap(sizes, errors);
  checkLengthSteps(sizes, warnings);

  if (errors.length) return { data: null, errors, warnings };

  // Sort sizes: by model order, then length, then Slim before Regular.
  const modelOrder = new Map(models.map((m, i) => [m.model_id, i]));
  sizes.sort(
    (a, b) =>
      modelOrder.get(a.model_id) - modelOrder.get(b.model_id) ||
      a.length_min_mm - b.length_min_mm ||
      (a.variant === 'slim' ? 0 : 1) - (b.variant === 'slim' ? 0 : 1)
  );

  const data = {
    generatedAt,
    dataVersion: settings.data_version,
    settings: {
      tolerance_mm: settings.tolerance_mm,
      wide_hoof_model: String(settings.wide_hoof_model),
      wide_hoof_max_extra_length_mm: settings.wide_hoof_max_extra_length_mm,
      narrow_hoof_model: String(settings.narrow_hoof_model),
      narrow_hoof_max_below_mm: settings.narrow_hoof_max_below_mm,
      fresh_trim_add_mm: settings.fresh_trim_add_mm,
      measure_guide_url: settings.measure_guide_url,
      dealer_finder_url: settings.dealer_finder_url,
    },
    models: models.map(({ active, ...m }) => m),
    sizes: sizes.map(({ row, active, ...s }) => s),
  };
  return { data, errors, warnings };
}

// ---------------------------------------------------------------------------
// Command line entry point
// ---------------------------------------------------------------------------

function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const inputPath = path.join(root, 'data', 'size-chart.xlsx');
  const outputPath = path.join(root, 'data', 'size-chart.json');

  let workbook;
  try {
    workbook = XLSX.read(fs.readFileSync(inputPath));
  } catch (err) {
    console.error(`FEIL: Kunne ikke lese ${inputPath}. Er filen åpen i Excel eller låst av OneDrive?\n${err.message}`);
    process.exit(1);
  }

  const { data, errors, warnings } = buildData(workbook);

  for (const w of warnings) console.warn(`ADVARSEL: ${w}`);

  if (errors.length) {
    for (const e of errors) console.error(`FEIL: ${e}`);
    console.error(`\nBuild stoppet: ${errors.length} feil. size-chart.json er IKKE oppdatert.`);
    process.exit(1);
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + '\n');

  console.log(`\nOK: data/size-chart.json skrevet (dataversjon ${data.dataVersion}).`);
  console.log(`${data.models.length} modeller, ${data.sizes.length} størrelser:`);
  for (const model of data.models) {
    const count = data.sizes.filter((s) => s.model_id === model.model_id).length;
    console.log(`  - ${model.name}: ${count} størrelser`);
  }
  console.log(`${warnings.length} advarsel(er).`);
}

// Only run main() when started from the command line, not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
