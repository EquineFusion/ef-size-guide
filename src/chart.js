// chart.js
// Equine Fusion size chart table for the product pages. Sits below the calculator (widget.js).
//
// Usage (Webflow product template – the same code on every product page):
//   <div id="ef-size-chart"></div>
//   <script type="module">
//     import { mountChart } from 'https://…/src/chart.js';
//     mountChart(document.getElementById('ef-size-chart'));
//   </script>
// The chart also registers itself as window.EFSizeGuide.mountChart(element, options).
//
// Which model? Found automatically by comparing the page address with each model's product_url
// (chart-format.js → findModelByPath). Override with data-model="active" on the element
// or mountChart(el, { model: 'active' }). No model found → nothing is shown (never a wrong model).
//
// On a page that is not a product page (the "How to measure" page), use the model picker:
//   mountChart(el, { picker: true, tips: false });
// It shows one button per model and starts with the first model in the data.
//
// Options (all optional):
//   model     model_id to show (default: data-model on the element, else found from the page address)
//   picker    true = show buttons to switch between the models (default: false)
//   tips      false = leave out the three tip cards (default: true)
//   data      the size chart object itself (skips loading dataUrl – used by the shareable test page)
//   dataUrl   URL of size-chart.json (default: ../data/size-chart.json next to this file = same version)
//   loadCss   inject chart.css (default: true)
//   onAnalytics  function(name, params) – called with every analytics event (debug panel).
//                Events go to GA4 via window.gtag automatically if the page has it (see analytics.js):
//                sizeguide_click_measure_guide / sizeguide_click_dealer with source: 'chart',
//                sizeguide_chart_unit when the customer switches unit in the chart,
//                and sizeguide_chart_model when the customer picks another model.
//
// The "Full measuring guide" button is left out automatically on the measuring guide page itself.
//
// Rules for this file:
//   - No dependencies. No measurements here – everything comes from size-chart.json.
//   - All customer-facing text is in `strings` below.
//   - All classes are prefixed `efsc-`; all CSS is scoped under `.efsc-root` (chart.css).

import { buildChartRows, findModelByPath, formatRange, isSamePath } from './chart-format.js';
import { UNITS, readStoredUnit, saveUnit, onUnitChange } from './unit-pref.js';
import { sendEvent } from './analytics.js';

// ---------------------------------------------------------------------------
// Customer-facing text (English). Add other languages later by swapping this object.
// ---------------------------------------------------------------------------

export const strings = {
  title: (model) => `${model} size chart`,
  intro: 'Regular and Slim have separate measurements. Find the one where both your hoof width and length fit.',
  soldAs: { single: 'Sold individually', pair: 'Sold in pairs' },
  unitLegend: 'Unit',
  unitNames: { cm: 'cm', in: 'inches' },
  unitShort: { cm: 'cm', in: 'in' },
  modelLegend: 'Model', // screen-reader name of the model picker (the buttons show the model names)

  size: 'Size',
  variants: { regular: 'Regular', slim: 'Slim' },
  width: (unit) => `Width (${unit})`,
  length: (unit) => `Length (${unit})`,
  // Table captions for screen readers (the visible headings say the same more briefly).
  caption: (model, unitName) => `${model} size chart: hoof width and length in ${unitName}, Regular and Slim`,
  variantCaptionBefore: (model) => `${model} `,
  variantCaptionAfter: (unitName) => ` sizes: hoof width and length in ${unitName}`,
  notAvailable: 'Not available',

  // Tips from the catalogue (p. 31). Do not rewrite.
  tips: {
    measure: {
      title: 'How to measure',
      text: 'Length: from the buttress line to the toe, without the heel bulbs. Width: at the widest point.',
    },
    trimmed: {
      title: 'Freshly trimmed?',
      text: 'Add 4 mm (1/8 in) to your measurements to allow for hoof growth.',
    },
    underrun: {
      title: 'Underrun heels?',
      text: 'Consider one size up in length. You may need a Slim.',
    },
  },

  measureGuide: 'Full measuring guide',
  findDealer: 'Find a dealer',
  dealerHelp: 'Unsure? Your dealer can help you measure.',
};

// Small hoof drawing for the "How to measure" tip (length arrow + dashed width line).
const HOOF_SVG =
  '<svg width="56" height="66" viewBox="0 0 72 84" fill="none" aria-hidden="true" focusable="false">' +
  '<path d="M36 4C58 4 68 22 68 44C68 62 62 75 54 80L47 72C42 68 30 68 25 72L18 80C10 75 4 62 4 44C4 22 14 4 36 4Z" stroke="#1a1a1a" stroke-width="2"/>' +
  '<path d="M36 8V66" stroke="#062a56" stroke-width="2"/>' +
  '<path d="M32 12L36 8L40 12M32 62L36 66L40 62" stroke="#062a56" stroke-width="2"/>' +
  '<path d="M9 40H63" stroke="#00359e" stroke-width="2" stroke-dasharray="3 3"/>' +
  '</svg>';

const VARIANTS = ['regular', 'slim'];

// Clean-up for a chart that is mounted again in the same element (e.g. the test page's model picker).
const mounted = new WeakMap();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the size chart into `element`.
 * @returns {Promise<{ modelId: string } | null>} null if nothing is shown (no model, or data not loaded)
 */
export async function mountChart(element, options = {}) {
  if (mounted.has(element)) mounted.get(element)();
  element.replaceChildren(); // nothing is shown until the data is loaded

  if (options.loadCss !== false) loadCss();
  const track = (name, params) => sendEvent(name, params, options.onAnalytics);

  // --- Load data --------------------------------------------------------------
  let data;
  try {
    if (options.data) {
      data = options.data;
    } else {
      const dataUrl = resolveUrl(options.dataUrl || '../data/size-chart.json', import.meta.url);
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
  } catch (err) {
    // The calculator above already shows a message when the data cannot be loaded.
    console.error('[EF size chart] Could not load data:', err);
    return null;
  }

  // --- Which model? -------------------------------------------------------------
  // Models that can be shown: active, with at least one size. Same order as in the data (sort_order).
  const showPicker = options.picker === true;
  const models = data.models.filter((m) => m.active !== false && buildChartRows(data, m.model_id).length > 0);
  const wanted = options.model || element.getAttribute('data-model');
  let model = wanted
    ? models.find((m) => m.model_id === wanted)
    : models.find((m) => m === findModelByPath(data, window.location.pathname));
  // With the model picker there is always something to show: start with the first model.
  if (!model && showPicker && !wanted) model = models[0];

  if (!model) {
    console.warn(
      wanted
        ? `[EF size chart] No active model "${wanted}" with sizes in size-chart.json – the size chart is not shown.`
        : `[EF size chart] No model has product_url matching "${window.location.pathname}" – the size chart is not shown. ` +
            'Tip: set data-model="<model_id>" on the chart element (e.g. data-model="active").'
    );
    return null;
  }
  let rows = buildChartRows(data, model.model_id);

  // --- Build the static parts ---------------------------------------------------
  const root = el('section', { class: 'efsc-root' });
  let unit = readStoredUnit() || 'cm';

  // Model picker (only with options.picker): one button per model.
  const modelButtons = !showPicker ? [] : models.map((m) => {
    const button = el('button', { type: 'button', class: 'efsc-model', 'data-model': m.model_id }, m.name);
    button.addEventListener('click', () => {
      if (m === model) return;
      setModel(m);
      track('sizeguide_chart_model', { model: m.model_id });
    });
    return button;
  });
  const picker = showPicker ? el('div', { class: 'efsc-models', role: 'group', 'aria-label': strings.modelLegend }, modelButtons) : null;

  const unitButtons = UNITS.map((u) => {
    const button = el('button', { type: 'button', class: 'efsc-unit', 'data-unit': u }, strings.unitNames[u]);
    button.addEventListener('click', () => {
      if (u === unit) return;
      setUnit(u);
      saveUnit(u, root); // remember it, and let the calculator follow
      track('sizeguide_chart_unit', { model: model.model_id, unit: u });
    });
    return button;
  });
  const unitGroup = el('div', { class: 'efsc-units', role: 'group', 'aria-label': strings.unitLegend }, unitButtons);

  const title = el('h2', { class: 'efsc-title' });
  const pill = el('span', { class: 'efsc-pill' });
  const header = el('div', { class: 'efsc-header' }, [
    el('div', { class: 'efsc-heading' }, [title, el('p', { class: 'efsc-intro' }, strings.intro)]),
    el('div', { class: 'efsc-meta' }, [pill, unitGroup]),
  ]);

  const tables = el('div', { class: 'efsc-tables' });

  // Tips (can be turned off where the page already explains how to measure).
  let tips = null;
  if (options.tips !== false) {
    const measureTip = tipCard(strings.tips.measure);
    const drawing = el('div', { class: 'efsc-tip-drawing' });
    drawing.innerHTML = HOOF_SVG; // fixed markup from this file, never data
    measureTip.append(drawing);
    measureTip.classList.add('efsc-tip-measure');
    tips = el('div', { class: 'efsc-tips' }, [measureTip, tipCard(strings.tips.trimmed), tipCard(strings.tips.underrun)]);
  }

  // Links open in the same tab (like the calculator). A click is tracked; the link still works normally.
  const trackedLink = (className, href, text, eventName) => {
    if (!href) return null;
    const link = el('a', { class: `efsc-button ${className}`, href }, text);
    link.addEventListener('click', () => track(eventName, { source: 'chart', model: model.model_id }));
    return link;
  };
  // No link to the measuring guide when the chart is on the measuring guide page itself.
  const measureUrl = data.settings.measure_guide_url;
  const onMeasurePage = isSamePath(measureUrl, window.location.pathname);
  const actions = el('div', { class: 'efsc-actions' }, [
    !onMeasurePage && trackedLink('efsc-button-primary', measureUrl, strings.measureGuide, 'sizeguide_click_measure_guide'),
    trackedLink('efsc-button-secondary', data.settings.dealer_finder_url, strings.findDealer, 'sizeguide_click_dealer'),
    el('p', { class: 'efsc-help' }, strings.dealerHelp),
  ]);

  root.append(...[picker, header, tables, tips, actions].filter(Boolean));
  element.replaceChildren(root);

  // --- Model and unit -------------------------------------------------------------
  // Only the tables are redrawn, so keyboard focus stays on the button that was pressed.
  function drawTables() {
    tables.replaceChildren(wideTable(model, rows, unit), ...VARIANTS.map((v) => narrowTable(model, rows, v, unit)));
  }

  function setModel(newModel) {
    model = newModel;
    rows = buildChartRows(data, model.model_id);
    root.setAttribute('aria-label', strings.title(model.name));
    title.textContent = strings.title(model.name);
    pill.textContent = strings.soldAs[model.sold_as] || '';
    pill.hidden = !strings.soldAs[model.sold_as];
    for (const button of modelButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.model === model.model_id));
    }
    drawTables();
  }

  function setUnit(newUnit) {
    unit = newUnit;
    for (const button of unitButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.unit === unit));
    }
    drawTables();
  }

  for (const button of unitButtons) button.setAttribute('aria-pressed', String(button.dataset.unit === unit));
  setModel(model);

  // The calculator on the same page changed the unit → follow it.
  const stopListening = onUnitChange(root, (newUnit) => {
    if (newUnit !== unit) setUnit(newUnit);
  });
  mounted.set(element, stopListening);

  return { modelId: model.model_id };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
// Both layouts are built; chart.css shows one of them depending on the chart's own width
// (the hidden one uses display: none, so screen readers only get the visible one).

// Wide container: one table, Size | Regular (width, length) | Slim (width, length).
function wideTable(model, rows, unit) {
  const u = strings.unitShort[unit];
  const head = el('thead', {}, [
    el('tr', {}, [
      el('th', { scope: 'col', rowspan: '2', class: 'efsc-size-head' }, strings.size),
      ...VARIANTS.map((v) =>
        el('th', { scope: 'colgroup', colspan: '2', class: `efsc-variant-head efsc-${v}` }, [
          el('span', { class: 'efsc-variant-label' }, strings.variants[v]),
        ])
      ),
    ]),
    el('tr', {}, VARIANTS.flatMap((v) => [
      el('th', { scope: 'col', class: `efsc-col-head efsc-${v} efsc-block-start` }, strings.width(u)),
      el('th', { scope: 'col', class: `efsc-col-head efsc-${v}` }, strings.length(u)),
    ])),
  ]);

  const body = el('tbody', {}, rows.map((row) =>
    el('tr', {}, [
      el('th', { scope: 'row', class: 'efsc-size' }, row.size),
      ...VARIANTS.flatMap((v) => measureCells(row[v], v, unit)),
    ])
  ));

  return el('table', { class: 'efsc-table efsc-table-wide' }, [
    el('caption', { class: 'efsc-visually-hidden' }, strings.caption(model.name, strings.unitNames[unit])),
    el('colgroup', {}, [el('col', { class: 'efsc-col-size' })]),
    el('colgroup', { span: '2' }),
    el('colgroup', { span: '2' }),
    head,
    body,
  ]);
}

// Narrow container: one table per variant, Size | Width | Length.
// Sizes that do not exist in this variant are left out of that table.
function narrowTable(model, rows, variant, unit) {
  const u = strings.unitShort[unit];
  const variantRows = rows.filter((row) => row[variant]);
  return el('table', { class: `efsc-table efsc-table-narrow efsc-${variant}` }, [
    el('caption', { class: 'efsc-variant-caption' }, [
      el('span', { class: 'efsc-visually-hidden' }, strings.variantCaptionBefore(model.name)),
      strings.variants[variant],
      el('span', { class: 'efsc-visually-hidden' }, strings.variantCaptionAfter(strings.unitNames[unit])),
    ]),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', class: 'efsc-col-head' }, strings.size),
        el('th', { scope: 'col', class: 'efsc-col-head' }, strings.width(u)),
        el('th', { scope: 'col', class: 'efsc-col-head' }, strings.length(u)),
      ]),
    ]),
    el('tbody', {}, variantRows.map((row) =>
      el('tr', {}, [
        el('th', { scope: 'row', class: 'efsc-size' }, row.size),
        ...measureCells(row[variant], variant, unit, false),
      ])
    )),
  ]);
}

// Width and length cells for one variant; "–" if the size does not exist in that variant.
function measureCells(measures, variant, unit, blockStart = true) {
  const first = blockStart ? ' efsc-block-start' : '';
  if (!measures) {
    const missing = () => [el('span', { 'aria-hidden': 'true' }, '–'), el('span', { class: 'efsc-visually-hidden' }, strings.notAvailable)];
    return [
      el('td', { class: `efsc-cell efsc-${variant}${first}` }, missing()),
      el('td', { class: `efsc-cell efsc-${variant}` }, missing()),
    ];
  }
  return [
    el('td', { class: `efsc-cell efsc-${variant}${first}` }, formatRange(measures.widthMinMm, measures.widthMaxMm, unit)),
    el('td', { class: `efsc-cell efsc-${variant}` }, formatRange(measures.lengthMinMm, measures.lengthMaxMm, unit)),
  ];
}

function tipCard({ title, text }) {
  return el('div', { class: 'efsc-tip' }, [
    el('div', { class: 'efsc-tip-text' }, [el('h3', { class: 'efsc-tip-title' }, title), el('p', {}, text)]),
  ]);
}

// ---------------------------------------------------------------------------
// Helpers (same as in widget.js)
// ---------------------------------------------------------------------------

// Resolve a (relative) URL against a base. Returns null instead of throwing
// when the base cannot be used (e.g. the chart is inlined in an about:srcdoc page).
function resolveUrl(url, base) {
  try {
    return new URL(url, base || undefined).href;
  } catch {
    return null;
  }
}

// Create an element: el('a', { href: '…', class: '…' }, ['text', childNode]).
// Text is always set as text (never HTML), so data can never inject markup.
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Inject chart.css once (next to this file), unless the page already has it.
function loadCss() {
  const href = resolveUrl('./chart.css', import.meta.url);
  if (!href || document.querySelector(`link[data-efsc-css], link[href="${href}"]`)) return;
  document.head.append(el('link', { rel: 'stylesheet', href, 'data-efsc-css': '' }));
}

// Make the chart available to classic (non-module) scripts, e.g. Webflow embeds.
if (typeof window !== 'undefined') {
  window.EFSizeGuide = Object.assign(window.EFSizeGuide || {}, { mountChart, chartStrings: strings });
}
