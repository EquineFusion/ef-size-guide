// analytics.js
// Google Analytics (GA4) events for the size guide widget.
//
// - Events are sent with window.gtag('event', name, params) ONLY if gtag exists on the page
//   (eqfusion.com already has GA4). No gtag → nothing is sent, nothing breaks.
// - No personal data. Measurements are rounded to whole millimetres.
// - Used by widget.js only – never by engine.js.
// - The event builders are pure functions (no DOM), so they can be tested in Node.
//
// Events
//   sizeguide_calculate           one per calculation (form submit or opened shared link)
//   sizeguide_result              one per recommended model
//   sizeguide_click_product       "View product"
//   sizeguide_click_dealer        "Find a dealer"
//   sizeguide_click_measure_guide "How to measure"
//   sizeguide_share               "Copy link"
//   sizeguide_open_shared         page opened from a shared link (?src=share)

/**
 * Send one event. Never throws.
 * @param {string} name
 * @param {object} params
 * @param {function} [hook]  called with (name, params) – used by the debug panel on the test page
 */
export function sendEvent(name, params, hook) {
  try {
    if (typeof hook === 'function') hook(name, params);
  } catch {
    /* a broken debug hook must not break the widget */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
  } catch {
    /* analytics blocked or failing – ignore */
  }
}

/**
 * Overall result type of an engine result:
 *   'invalid_input' | 'no_match' | 'outside_wide' | 'outside_narrow' | 'between' | 'match'
 */
export function resultType(result) {
  if (result.status === 'invalid_input') return 'invalid_input';
  if (result.status === 'no_match') return 'no_match';
  const recs = result.recommendations;
  const outside = recs.find((r) => r.warning === 'outside_size_chart');
  if (outside) return outside.outsideReason === 'narrow' ? 'outside_narrow' : 'outside_wide';
  if (recs.some((r) => r.betweenSizes)) return 'between';
  return 'match';
}

/** Parameters for sizeguide_calculate. */
export function calculateEvent(result, trigger) {
  const params = {
    result_type: resultType(result),
    unit: result.input.unit,
    model_count: result.recommendations.length,
    trigger, // 'form' | 'shared_link'
  };
  if (result.input.lengthMm !== null) params.length_mm = Math.round(result.input.lengthMm);
  if (result.input.widthMm !== null) params.width_mm = Math.round(result.input.widthMm);
  if (result.status === 'invalid_input') {
    params.error = result.errors.map((e) => `${e.field}:${e.code}`).join(',');
  }
  return params;
}

/** One sizeguide_result parameter set per recommendation. */
export function resultEvents(result) {
  const count = result.recommendations.length;
  return result.recommendations.map((rec, i) => ({
    model: rec.modelId,
    size: rec.sizeLabel,
    variant: rec.variant,
    alternative_size: rec.alternative ? rec.alternative.sizeLabel : 'none',
    outside_chart: rec.outsideReason || 'no',
    position: i + 1,
    result_count: count,
  }));
}
