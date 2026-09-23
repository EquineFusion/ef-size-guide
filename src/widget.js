// widget.js
// Equine Fusion size guide widget: form + results, built on engine.js.
//
// Usage (test page and, later, Webflow):
//   <div id="size-guide"></div>
//   <script type="module">
//     import { mount } from 'https://…/src/widget.js';
//     mount(document.getElementById('size-guide'));
//   </script>
// The widget also registers itself as window.EFSizeGuide.mount(element, options).
//
// Options (all optional):
//   data          the size chart object itself (skips loading dataUrl – used by the shareable test page)
//   dataUrl       URL of size-chart.json      (default: ../data/size-chart.json next to this file)
//   imageBaseUrl  base URL for image_url      (default: the folder above /data/)
//   loadCss       inject widget.css           (default: true)
//   updateUrl     keep ?l=&w=&u= in the address bar after each calculation (default: true)
//   share         show the "Copy link" button (default: true)
//   onResult      function(result) – called with the raw engine output (used by the debug panel)
//
// Rules for this file:
//   - No dependencies. All customer-facing text is in `strings` below.
//   - All classes are prefixed `efsg-`; all CSS is scoped under `.efsg-root` (widget.css).
//   - No alert(). Errors are shown inline next to the field.

import { recommend } from './engine.js';
import { formatMeasurement, normaliseUnit, parseMeasurement } from './units.js';

// ---------------------------------------------------------------------------
// Customer-facing text (English). Add other languages later by swapping this object.
// ---------------------------------------------------------------------------

export const strings = {
  title: 'Find the right size',
  intro: 'Enter the length and width of the hoof, and we will recommend the model and size that fit.',
  unitLegend: 'Unit',
  unitNames: { cm: 'cm', in: 'inches' },
  unitShort: { cm: 'cm', in: 'in' },
  lengthLabel: 'Hoof length',
  widthLabel: 'Hoof width',
  placeholders: { cm: 'e.g. 12.5', in: 'e.g. 4 7/8' },
  submit: 'Find my size',
  howToMeasure: 'How to measure',
  loading: 'Loading size guide…',
  loadError: 'The size guide could not be loaded. Please try again later.',

  fieldNames: { length: 'hoof length', width: 'hoof width' },
  errors: {
    empty: (field) => `Please enter the ${field}.`,
    not_a_number: {
      cm: 'Please enter a number, e.g. 12.5',
      in: 'Please enter a number, e.g. 4.75 or 4 3/4',
    },
    not_positive: (field) => `The ${field} must be greater than 0.`,
    out_of_range: {
      cm: 'Please check the measurement – a hoof is usually between 4 and 25 cm.',
      in: 'Please check the measurement – a hoof is usually between 1 5/8 and 9 7/8 inches.',
    },
  },

  yourHoof: (length, width, unit) => `Hoof: ${length} × ${width} ${unit} (length × width)`,
  resultOne: 'Recommended size',
  resultMany: (n) => `${n} models fit this hoof`,
  resultManyHint: 'Choose the model that best suits how the horse is used.',
  sizeName: (label, variant) => (variant === 'regular' ? `${label} Regular` : label),
  size: (name) => `Size ${name}`,
  useCaseLabel: 'Recommended for:',
  soldAs: { single: 'Sold individually', pair: 'Sold in pairs' },
  nearLimit: (size) => `Near the upper limit – consider size ${size} if the hoof is freshly trimmed.`,
  outsideChart: {
    wide: (model) =>
      `Your measurements are outside our size chart. Based on the width, we suggest the ${model}, ` +
      'which has the most adaptable upper. Please contact a dealer for advice before ordering.',
    narrow: (model) =>
      `The hoof is narrower than our size chart. Based on the length, the ${model} may work, ` +
      'as it has the most adaptable upper. Please contact a dealer for advice before ordering.',
  },
  viewProduct: 'View product',
  findDealer: 'Find a dealer',
  noMatch: 'We do not currently have any models that fit your size.',
  noMatchHelp: 'Please check how the hoof was measured, or contact a dealer for advice.',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  copyManually: 'Copy this link:',
};

const UNITS = ['cm', 'in'];
const STORAGE_KEY = 'efsg-unit';
let instanceCount = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the size guide into `element`.
 * @returns {Promise<{ calculate: Function }>} resolves when the data is loaded
 */
export async function mount(element, options = {}) {
  const id = `efsg-${++instanceCount}`;
  const dataUrl = resolveUrl(options.dataUrl || '../data/size-chart.json', import.meta.url);
  const imageBaseUrl = resolveUrl(options.imageBaseUrl || '../', dataUrl);
  const updateUrl = options.updateUrl !== false;
  const showShare = options.share !== false;
  const onResult = typeof options.onResult === 'function' ? options.onResult : () => {};

  if (options.loadCss !== false) loadCss();

  // --- Build the form -------------------------------------------------------
  const root = el('div', { class: 'efsg-root' });
  const status = el('p', { class: 'efsg-status' }, strings.loading);

  const unitButtons = UNITS.map((unit) =>
    el('label', { class: 'efsg-unit' }, [
      el('input', { type: 'radio', name: `${id}-unit`, value: unit, class: 'efsg-unit-input' }),
      el('span', { class: 'efsg-unit-text' }, strings.unitNames[unit]),
    ])
  );
  const unitGroup = el('fieldset', { class: 'efsg-units' }, [
    el('legend', { class: 'efsg-visually-hidden' }, strings.unitLegend),
    ...unitButtons,
  ]);

  const fields = {
    length: makeField(id, 'length', strings.lengthLabel),
    width: makeField(id, 'width', strings.widthLabel),
  };

  const submit = el('button', { type: 'submit', class: 'efsg-button efsg-button-primary', disabled: '' }, strings.submit);
  const measureLink = el('a', { class: 'efsg-link efsg-measure-link', href: '#' }, strings.howToMeasure);

  const form = el('form', { class: 'efsg-form', novalidate: '' }, [
    unitGroup,
    el('div', { class: 'efsg-fields' }, [fields.length.wrapper, fields.width.wrapper]),
    submit,
    measureLink,
  ]);

  const results = el('div', { class: 'efsg-results', 'aria-live': 'polite' });

  root.append(
    el('h2', { class: 'efsg-title' }, strings.title),
    el('p', { class: 'efsg-intro' }, strings.intro),
    form,
    status,
    results
  );
  element.replaceChildren(root);

  // --- State ------------------------------------------------------------------
  let data = null; // size-chart.json, set when loaded
  let lastResult = null; // last engine output (to recalculate on unit change)
  let unit = readStoredUnit() || 'cm';

  // --- Unit handling --------------------------------------------------------

  function setUnit(newUnit, { convert }) {
    if (convert && newUnit !== unit) {
      // Convert what is already typed, so the customer does not have to re-enter it.
      for (const name of ['length', 'width']) {
        const parsed = parseMeasurement(fields[name].input.value, unit);
        if (parsed.ok) fields[name].input.value = formatMeasurement(parsed.mm, newUnit);
      }
    }
    unit = newUnit;
    for (const button of unitButtons) {
      const input = button.querySelector('input');
      input.checked = input.value === unit;
    }
    for (const name of ['length', 'width']) {
      fields[name].input.placeholder = strings.placeholders[unit];
      fields[name].unit.textContent = strings.unitShort[unit];
      // Fractions need space and "/", which the numeric keypad does not have.
      fields[name].input.inputMode = unit === 'in' ? 'text' : 'decimal';
    }
  }

  for (const button of unitButtons) {
    button.querySelector('input').addEventListener('change', (event) => {
      setUnit(event.target.value, { convert: true });
      storeUnit(unit);
      if (data && lastResult) calculate();
    });
  }
  setUnit(unit, { convert: false });

  // Clear a field's error as soon as the customer edits it.
  for (const name of ['length', 'width']) {
    fields[name].input.addEventListener('input', () => showFieldError(fields[name], null));
  }

  // --- Load data --------------------------------------------------------------
  try {
    if (options.data) {
      data = options.data;
    } else {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
  } catch (err) {
    status.textContent = strings.loadError;
    status.classList.add('efsg-status-error');
    console.error('[EF size guide] Could not load data:', err);
    return { calculate: () => null };
  }
  status.remove();
  submit.removeAttribute('disabled');
  measureLink.href = data.settings.measure_guide_url;

  // --- Calculate --------------------------------------------------------------
  function calculate() {
    const input = { length: fields.length.input.value, width: fields.width.input.value, unit };
    const result = recommend(input, data);
    lastResult = result;
    onResult(result);

    showFieldError(fields.length, null);
    showFieldError(fields.width, null);

    if (result.status === 'invalid_input') {
      results.replaceChildren();
      for (const error of result.errors) {
        if (fields[error.field]) showFieldError(fields[error.field], errorMessage(error, unit));
      }
      const first = result.errors.find((e) => fields[e.field]);
      if (first) fields[first.field].input.focus();
      return result;
    }

    renderResults(result, input);
    if (updateUrl) writeUrlParams(input);
    return result;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    calculate();
  });

  // --- Results ----------------------------------------------------------------
  function renderResults(result, input) {
    const hoof = el(
      'p',
      { class: 'efsg-hoof' },
      strings.yourHoof(
        formatMeasurement(result.input.lengthMm, unit),
        formatMeasurement(result.input.widthMm, unit),
        strings.unitShort[unit]
      )
    );

    const share = showShare ? makeShareButton(input) : null;

    if (result.status === 'no_match') {
      setResults(
        hoof,
        el('div', { class: 'efsg-no-match' }, [
          el('p', { class: 'efsg-no-match-title' }, strings.noMatch),
          el('p', {}, strings.noMatchHelp),
          el('div', { class: 'efsg-actions' }, [
            el('a', { class: 'efsg-button efsg-button-secondary', href: data.settings.measure_guide_url }, strings.howToMeasure),
            el('a', { class: 'efsg-button efsg-button-secondary', href: data.settings.dealer_finder_url }, strings.findDealer),
          ]),
        ]),
        share
      );
      return;
    }

    const recs = result.recommendations;
    const heading = [el('h3', { class: 'efsg-results-title' }, recs.length > 1 ? strings.resultMany(recs.length) : strings.resultOne)];
    if (recs.length > 1) heading.push(el('p', { class: 'efsg-results-hint' }, strings.resultManyHint));

    setResults(hoof, ...heading, ...recs.map(renderCard), share);
  }

  // Replace the result area, skipping empty parts (e.g. share button turned off).
  function setResults(...nodes) {
    results.replaceChildren(...nodes.filter(Boolean));
  }

  function renderCard(rec) {
    const model = data.models.find((m) => m.model_id === rec.modelId);
    const body = [
      el('h4', { class: 'efsg-model' }, model.name),
      el('p', { class: 'efsg-size' }, strings.size(strings.sizeName(rec.sizeLabel, rec.variant))),
    ];

    if (rec.warning === 'outside_size_chart') {
      const text = strings.outsideChart[rec.outsideReason] || strings.outsideChart.wide;
      body.push(el('div', { class: 'efsg-warning', role: 'note' }, text(model.name)));
    }
    if (rec.alternative) {
      const alt = strings.sizeName(rec.alternative.sizeLabel, rec.alternative.variant);
      body.push(el('p', { class: 'efsg-alternative' }, strings.nearLimit(alt)));
    }

    body.push(
      el('p', { class: 'efsg-use-case' }, [el('span', { class: 'efsg-label' }, strings.useCaseLabel + ' '), model.use_case]),
      el('p', { class: 'efsg-sold-as' }, strings.soldAs[model.sold_as] || ''),
      el('div', { class: 'efsg-actions' }, [
        model.product_url && el('a', { class: 'efsg-button efsg-button-primary', href: model.product_url }, strings.viewProduct),
        el('a', { class: 'efsg-button efsg-button-secondary', href: data.settings.dealer_finder_url }, strings.findDealer),
      ])
    );

    const classes = ['efsg-card'];
    if (rec.warning) classes.push('efsg-card-warning');
    return el('article', { class: classes.join(' ') }, [
      renderImage(model),
      el('div', { class: 'efsg-card-body' }, body),
    ]);
  }

  // Product image, or a neutral placeholder if it is missing or fails to load.
  function renderImage(model) {
    const frame = el('div', { class: 'efsg-image' });
    if (!model.image_url) {
      frame.append(placeholder());
      return frame;
    }
    const img = el('img', {
      src: resolveUrl(model.image_url, imageBaseUrl) || model.image_url,
      alt: model.name,
      loading: 'lazy',
      decoding: 'async',
    });
    img.addEventListener('error', () => img.replaceWith(placeholder()));
    frame.append(img);
    return frame;
  }

  // --- Share link -------------------------------------------------------------
  function makeShareButton(input) {
    const url = shareUrl(input);
    const feedback = el('span', { class: 'efsg-share-feedback', role: 'status' });
    const button = el('button', { type: 'button', class: 'efsg-button efsg-button-ghost' }, strings.copyLink);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        feedback.textContent = strings.linkCopied;
      } catch {
        // Clipboard blocked (e.g. not https): show the link so it can be copied by hand.
        const field = el('input', { class: 'efsg-share-url', readonly: '', value: url, 'aria-label': strings.copyManually });
        feedback.replaceChildren(strings.copyManually + ' ', field);
        field.select();
      }
    });
    return el('div', { class: 'efsg-share' }, [button, feedback]);
  }

  // --- Shared link on page load (?l=…&w=…&u=…) ----------------------------------
  const params = readUrlParams();
  if (params) {
    setUnit(params.unit, { convert: false });
    fields.length.input.value = params.length;
    fields.width.input.value = params.width;
    calculate();
  }

  return { calculate };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolve a (relative) URL against a base. Returns null instead of throwing
// when the base cannot be used (e.g. the widget is inlined in an about:srcdoc page).
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

function makeField(id, name, labelText) {
  const inputId = `${id}-${name}`;
  const errorId = `${inputId}-error`;
  const input = el('input', {
    id: inputId,
    name,
    type: 'text',
    class: 'efsg-input',
    autocomplete: 'off',
    'aria-describedby': errorId,
  });
  const unit = el('span', { class: 'efsg-input-unit', 'aria-hidden': 'true' });
  const error = el('p', { id: errorId, class: 'efsg-error' });
  const wrapper = el('div', { class: 'efsg-field' }, [
    el('label', { class: 'efsg-label', for: inputId }, labelText),
    el('div', { class: 'efsg-input-wrap' }, [input, unit]),
    error,
  ]);
  return { wrapper, input, unit, error };
}

function showFieldError(field, message) {
  field.error.textContent = message || '';
  if (message) field.input.setAttribute('aria-invalid', 'true');
  else field.input.removeAttribute('aria-invalid');
}

function errorMessage({ field, code }, unit) {
  const name = strings.fieldNames[field];
  const text = strings.errors[code];
  if (typeof text === 'function') return text(name);
  if (text && typeof text === 'object') return text[unit];
  return strings.errors.not_a_number[unit];
}

function placeholder() {
  // Simple neutral hoof-boot outline, no external file needed.
  const wrap = el('div', { class: 'efsg-placeholder', 'aria-hidden': 'true' });
  wrap.innerHTML =
    '<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">' +
    '<path d="M18 14h22l6 22 8 6v8H10v-8l4-6z"/><path d="M10 50h44"/></svg>';
  return wrap;
}

// --- Unit memory (localStorage can be blocked – never let that break the widget) ---
function readStoredUnit() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return UNITS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeUnit(unit) {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    /* ignore */
  }
}

// --- URL parameters ---------------------------------------------------------------
// ?l=11.8&w=11.0&u=cm   (u = cm | in | mm; mm values are shown in cm)
function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const length = params.get('l');
  const width = params.get('w');
  if (!length || !width) return null;
  const unit = normaliseUnit(params.get('u') || 'cm');
  if (unit === 'mm') {
    const toCm = (v) => {
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? formatMeasurement(n, 'cm') : v;
    };
    return { length: toCm(length), width: toCm(width), unit: 'cm' };
  }
  if (!UNITS.includes(unit)) return null;
  return { length, width, unit };
}

function shareUrl(input) {
  const url = new URL(window.location.href);
  url.searchParams.set('l', input.length.trim().replace(',', '.'));
  url.searchParams.set('w', input.width.trim().replace(',', '.'));
  url.searchParams.set('u', input.unit);
  url.hash = '';
  return url.href;
}

// Keep the current measurements in the address bar, so reload / back button
// restores the result and the address can be shared directly.
function writeUrlParams(input) {
  try {
    const url = new URL(shareUrl(input));
    window.history.replaceState(window.history.state, '', url.href);
  } catch {
    /* ignore (e.g. sandboxed iframe) */
  }
}

// Inject widget.css once (next to this file), unless the page already has it.
function loadCss() {
  const href = resolveUrl('./widget.css', import.meta.url);
  if (!href || document.querySelector(`link[data-efsg-css], link[href="${href}"]`)) return;
  const link = el('link', { rel: 'stylesheet', href, 'data-efsg-css': '' });
  document.head.append(link);
}

// Make the widget available to classic (non-module) scripts, e.g. Webflow embeds.
if (typeof window !== 'undefined') {
  window.EFSizeGuide = Object.assign(window.EFSizeGuide || {}, { mount, strings });
}
