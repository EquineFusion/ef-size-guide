// Smoke test for the project setup (phase 0).
// Checks that the folder structure from CLAUDE.md exists and the master data is present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('required folders exist', () => {
  for (const dir of ['data', 'scripts', 'src', 'assets/images', 'demo', 'tests', 'docs', 'legacy']) {
    assert.ok(fs.existsSync(path.join(root, dir)), `missing folder: ${dir}`);
  }
});

test('master size chart (Excel) exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'data', 'size-chart.xlsx')));
});

test('SheetJS can read the master size chart', async () => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(fs.readFileSync(path.join(root, 'data', 'size-chart.xlsx')));
  for (const sheet of ['models', 'sizes', 'settings']) {
    assert.ok(wb.SheetNames.includes(sheet), `missing sheet: ${sheet}`);
  }
});
