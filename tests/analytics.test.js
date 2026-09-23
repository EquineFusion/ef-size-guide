// Tests for src/analytics.js – event contents and safe sending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from '../src/engine.js';
import { sendEvent, resultType, calculateEvent, resultEvents } from '../src/analytics.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'size-chart.json'), 'utf8'));
const run = (length, width, unit = 'mm') => recommend({ length, width, unit }, data);

test('resultType covers every kind of result', () => {
  assert.equal(resultType(run(118, 110)), 'match');
  assert.equal(resultType(run('75,5', 65)), 'between');
  assert.equal(resultType(run(118, 124)), 'outside_wide');
  assert.equal(resultType(run(140, 110)), 'outside_narrow');
  assert.equal(resultType(run(170, 150)), 'no_match');
  assert.equal(resultType(run('abc', 100)), 'invalid_input');
});

test('calculate event: measurements rounded to whole mm, unit and counts', () => {
  const params = calculateEvent(run('11,75', '10,84', 'cm'), 'form');
  assert.deepEqual(params, {
    result_type: 'match',
    unit: 'cm',
    model_count: 4,
    trigger: 'form',
    length_mm: 118, // 117.5 → 118
    width_mm: 108, // 108.4 → 108
  });
});

test('calculate event for invalid input has error codes and no measurements', () => {
  const params = calculateEvent(run('abc', ''), 'form');
  assert.equal(params.result_type, 'invalid_input');
  assert.equal(params.error, 'length:not_a_number,width:empty');
  assert.equal('length_mm' in params, false);
  assert.equal('width_mm' in params, false);
});

test('one result event per recommended model', () => {
  const events = resultEvents(run(118, 110));
  assert.equal(events.length, 4);
  assert.deepEqual(events[1], {
    model: 'active',
    size: '12 Slim',
    variant: 'slim',
    alternative_size: '12',
    outside_chart: 'no',
    position: 2,
    result_count: 4,
  });
  assert.equal(resultEvents(run(118, 124))[0].outside_chart, 'wide');
  assert.deepEqual(resultEvents(run(170, 150)), []);
});

test('events contain only simple values (no personal data, nothing nested)', () => {
  const all = [calculateEvent(run(118, 110), 'form'), ...resultEvents(run(118, 110))];
  for (const params of all) {
    for (const value of Object.values(params)) {
      assert.ok(['string', 'number'].includes(typeof value), `unexpected value ${JSON.stringify(value)}`);
      if (typeof value === 'string') assert.ok(value.length <= 100, 'GA4 limits parameter values to 100 characters');
    }
  }
});

test('sendEvent: uses window.gtag when it exists', () => {
  const calls = [];
  globalThis.window = { gtag: (...args) => calls.push(args) };
  try {
    sendEvent('sizeguide_share', { method: 'clipboard' });
    assert.deepEqual(calls, [['event', 'sizeguide_share', { method: 'clipboard' }]]);
  } finally {
    delete globalThis.window;
  }
});

test('sendEvent: no gtag, failing gtag or failing hook never throws', () => {
  assert.doesNotThrow(() => sendEvent('x', {}));
  globalThis.window = {
    gtag: () => {
      throw new Error('blocked');
    },
  };
  try {
    assert.doesNotThrow(() =>
      sendEvent('x', {}, () => {
        throw new Error('broken hook');
      })
    );
  } finally {
    delete globalThis.window;
  }
});

test('sendEvent: debug hook receives name and params', () => {
  const seen = [];
  sendEvent('sizeguide_calculate', { a: 1 }, (name, params) => seen.push([name, params]));
  assert.deepEqual(seen, [['sizeguide_calculate', { a: 1 }]]);
});
