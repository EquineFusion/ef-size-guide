// Tests for src/units.js – input parsing and unit conversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeasurement, normaliseUnit, formatMeasurement } from '../src/units.js';

const mm = (value, unit) => {
  const result = parseMeasurement(value, unit);
  assert.equal(result.ok, true, `expected «${value} ${unit}» to parse, got ${JSON.stringify(result)}`);
  return result.mm;
};
const code = (value, unit) => parseMeasurement(value, unit).code;

test('millimetres', () => {
  assert.equal(mm('118', 'mm'), 118);
  assert.equal(mm('75,5', 'mm'), 75.5);
  assert.equal(mm('75.5', 'mm'), 75.5);
  assert.equal(mm(118, 'mm'), 118);
});

test('centimetres with comma and point give identical results', () => {
  assert.equal(mm('12,5', 'cm'), 125);
  assert.equal(mm('12.5', 'cm'), 125);
  assert.equal(mm('11,8', 'cm'), 118); // no floating point noise (11.8 * 10 = 118.00000000000001)
  assert.equal(mm('11', 'cm'), 110);
  assert.equal(mm('  11,0 ', 'cm'), 110);
  assert.equal(mm('12.', 'cm'), 120);
});

test('inches as decimal', () => {
  assert.equal(mm('5.25', 'in'), 133.4); // 133.35 → 133.4
  assert.equal(mm('5,25', 'in'), 133.4);
  assert.equal(mm('5', 'in'), 127);
});

test('inches as fraction', () => {
  assert.equal(mm('4 5/8', 'in'), 117.5); // 117.475
  assert.equal(mm('4 1/4', 'in'), 108); // 107.95 → 108.0 (not 107.9)
  assert.equal(mm('5 1/4', 'in'), mm('5.25', 'in'));
  assert.equal(mm('5-1/4', 'in'), mm('5.25', 'in'));
  assert.equal(mm('4  1/2', 'in'), 114.3); // extra spaces are ignored
});

test('fractions are only accepted for inches', () => {
  assert.equal(code('12 1/2', 'cm'), 'not_a_number');
  assert.equal(code('3/4', 'mm'), 'not_a_number');
});

test('error: empty', () => {
  assert.equal(code('', 'cm'), 'empty');
  assert.equal(code('   ', 'cm'), 'empty');
  assert.equal(code(null, 'cm'), 'empty');
  assert.equal(code(undefined, 'cm'), 'empty');
});

test('error: not a number', () => {
  assert.equal(code('abc', 'cm'), 'not_a_number');
  assert.equal(code('12cm', 'cm'), 'not_a_number');
  assert.equal(code('1,2,3', 'cm'), 'not_a_number');
  assert.equal(code('.', 'cm'), 'not_a_number');
  assert.equal(code('4 1/0', 'in'), 'not_a_number');
  assert.equal(code(NaN, 'mm'), 'not_a_number');
});

test('error: negative or zero', () => {
  assert.equal(code('-5', 'mm'), 'not_positive');
  assert.equal(code('-12,5', 'cm'), 'not_positive');
  assert.equal(code('0', 'cm'), 'not_positive');
  assert.equal(code(-5, 'mm'), 'not_positive');
});

test('error: outside realistic range 40–250 mm', () => {
  assert.equal(code('300', 'mm'), 'out_of_range');
  assert.equal(code('39,9', 'mm'), 'out_of_range');
  assert.equal(code('250,1', 'mm'), 'out_of_range');
  assert.equal(code('1', 'in'), 'out_of_range');
  assert.equal(mm('40', 'mm'), 40);
  assert.equal(mm('250', 'mm'), 250);
  assert.equal(mm('25', 'cm'), 250);
});

test('formatMeasurement', () => {
  assert.equal(formatMeasurement(118, 'cm'), '11.8');
  assert.equal(formatMeasurement(110, 'cm'), '11.0');
  assert.equal(formatMeasurement(75.5, 'cm'), '7.55'); // not rounded to 7.5
  assert.equal(formatMeasurement(117.5, 'cm'), '11.75');
  assert.equal(formatMeasurement(75.5, 'mm'), '75.5');
  assert.equal(formatMeasurement(118, 'mm'), '118');
  assert.equal(formatMeasurement(118, 'in'), '4.65');
  assert.equal(formatMeasurement(127, 'in'), '5');
});

test('formatMeasurement → parseMeasurement round trip stays within 0.13 mm', () => {
  // 41–249 mm: at the exact 40/250 limits, rounding to 0.01" could step just outside the range.
  for (let mm = 41; mm <= 249; mm += 0.1) {
    const exact = Math.round(mm * 10) / 10;
    for (const unit of ['cm', 'mm', 'in']) {
      const back = parseMeasurement(formatMeasurement(exact, unit), unit);
      assert.ok(back.ok, `${exact} ${unit}`);
      assert.ok(Math.abs(back.mm - exact) <= 0.13, `${exact} mm → ${unit} → ${back.mm} mm`);
    }
  }
});

test('normaliseUnit', () => {
  assert.equal(normaliseUnit('cm'), 'cm');
  assert.equal(normaliseUnit('CM'), 'cm');
  assert.equal(normaliseUnit('mm'), 'mm');
  assert.equal(normaliseUnit('in'), 'in');
  assert.equal(normaliseUnit('inches'), 'in');
  assert.equal(normaliseUnit('inch'), 'in');
  assert.equal(normaliseUnit('ft'), null);
  assert.equal(normaliseUnit(undefined), null);
});
