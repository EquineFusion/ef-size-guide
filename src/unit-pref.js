// unit-pref.js
// The customer's chosen unit (cm / inches), shared by the calculator (widget.js) and the size chart (chart.js).
//
// - Remembered in localStorage under 'efsg-unit' (same key as in v1.0.0, so earlier choices are kept).
//   localStorage can be blocked – that must never break anything, so every access is in try/catch.
// - When one component changes the unit, it tells the others on the page with a small event on window
//   ('efsg:unitchange'), so the calculator and the size chart always show the same unit.

export const UNITS = ['cm', 'in'];
const STORAGE_KEY = 'efsg-unit';
const EVENT_NAME = 'efsg:unitchange';

/** The stored unit ('cm' | 'in'), or null if none (or storage is blocked). */
export function readStoredUnit() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return UNITS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Remember a new unit and tell the other components on the page.
 * @param {string} unit    'cm' | 'in'
 * @param {object} sender  the component that changed it (it does not get its own message back)
 */
export function saveUnit(unit, sender) {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { unit, sender } }));
  } catch {
    /* ignore */
  }
}

/**
 * Call `callback(unit)` when another component changes the unit.
 * @param {object} receiver  this component (messages it sent itself are ignored)
 * @returns {function} call it to stop listening
 */
export function onUnitChange(receiver, callback) {
  const handler = (event) => {
    const detail = event.detail || {};
    if (detail.sender !== receiver && UNITS.includes(detail.unit)) callback(detail.unit);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
