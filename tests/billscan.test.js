import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseBillText } from '../js/billscan.js';

test('billscan: labelled values on one line', () => {
  const r = parseBillText(`LAHORE ELECTRIC SUPPLY COMPANY
BILL MONTH SEP 26   SANCTIONED LOAD 5
PREVIOUS READING 14250  PRESENT READING 14495
UNITS CONSUMED 245
F.P.A @ 0.7503
PAYABLE WITHIN DUE DATE 12,345`);
  assert.equal(r.month, '2026-09');
  assert.equal(r.units, 245);
  assert.equal(r.amount, 12345);
  assert.equal(r.loadKw, 5);
  assert.equal(r.fpaRate, 0.7503);
  assert.equal(r.found, 4);
});

test('billscan: values on the line below their labels, OCR noise inside numbers', () => {
  const r = parseBillText(`Units Consumed   Bill Month
  3O8   OCT-2026
  Payable Within Due Date
  l7,1O0`);
  assert.equal(r.units, 308);
  assert.equal(r.amount, 17100);
  assert.equal(r.month, '2026-10');
});

test('billscan: units derived from readings when the units label is missing', () => {
  const r = parseBillText('PREV READING 14,250 PRES READING 14,381');
  assert.equal(r.units, 131);
});

test('billscan: words between label and value are not read as digits', () => {
  const r = parseBillText('UNITS CONSUMED BY SOBIA 210');
  assert.equal(r.units, 210);
});

test('billscan: nothing recognisable', () => {
  const r = parseBillText('hello world');
  assert.equal(r.found, 0);
  assert.equal(r.units, null);
});

// Every file in tests/fixtures/scans is an OCR capture with the numbers the
// bill really shows. Contributions: copy the text from the scan sheet
// ("Copy the text that was read"), blank out names/addresses/reference
// numbers, and add a file here (see README).
const dir = new URL('./fixtures/scans/', import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const fx = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  test(`billscan fixture: ${f}`, () => {
    const r = parseBillText(fx.ocr_text);
    for (const [k, v] of Object.entries(fx.expected)) assert.equal(r[k], v, `${f}: ${k}`);
  });
}
