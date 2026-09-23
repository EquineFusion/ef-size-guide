// Smoke test for the project setup.
// Checks that the folder structure from CLAUDE.md exists and that the master Excel
// file can be found and read (skipped on a PC without access to the shared folder).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveExcelPath } from '../scripts/build-data.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('required folders exist', () => {
  for (const dir of ['data', 'scripts', 'src', 'assets/images', 'demo', 'tests', 'docs']) {
    assert.ok(fs.existsSync(path.join(root, dir)), `missing folder: ${dir}`);
  }
});

test('generated size-chart.json exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'data', 'size-chart.json')));
});

test('master Excel file can be found and read', async (t) => {
  const excel = resolveExcelPath();
  if (!fs.existsSync(excel.path)) return t.skip(`Excel not available on this PC: ${excel.path}`);
  const XLSX = await import('xlsx');
  const wb = XLSX.read(fs.readFileSync(excel.path));
  for (const sheet of ['models', 'sizes', 'settings']) {
    assert.ok(wb.SheetNames.includes(sheet), `missing sheet: ${sheet}`);
  }
});

test('resolveExcelPath: env variable, then local.config.json, then data/size-chart.xlsx', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efsg-'));
  try {
    assert.equal(resolveExcelPath(tmp, {}).path, path.join(tmp, 'data', 'size-chart.xlsx'));
    fs.writeFileSync(path.join(tmp, 'local.config.json'), JSON.stringify({ excelPath: 'X:\\shared\\a.xlsx' }));
    assert.deepEqual(resolveExcelPath(tmp, {}), { path: 'X:\\shared\\a.xlsx', source: 'local.config.json' });
    assert.equal(resolveExcelPath(tmp, { SIZE_CHART_XLSX: 'Y:\\b.xlsx' }).path, 'Y:\\b.xlsx');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
