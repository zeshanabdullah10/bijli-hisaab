import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('billscan: real OCR output of a tabular bill (header row over value row)', () => {
  // Tesseract's text for a PITC-style test bill: "UNITS" came out as "unrts",
  // "TARIFF" as "TAREE", and the comma in 12,345 as a dot.
  const r = parseBillText(`LAHORE ELECTRIC SUPPLY COMPANY
ELECTRICITY CONSUMER BILL
REFERENCE NO BILL MONTH READING DATE ISSUE DATE DUE DATE
| 09 11234 1234567 U | sep 26 | 18100126 | 2100126 | ov10726 |
| TAREE SANCTIONED LOAD | Previous | PRESENT | MF unrts |
A1a(01) 5 14250 14495 1 245
| cost oF ELECTRICITY [7.082 |
|Fe SURCHARGE 784
est 1,836
| PAYABLE WITHIN DUE DATE [12.345 |
PAYABLE AFTER DUE DATE 13,580`);
  assert.equal(r.units, 245);
  assert.equal(r.prevReading, 14250);
  assert.equal(r.presReading, 14495);
  assert.equal(r.loadKw, 5);
  assert.equal(r.amount, 12345);
  assert.equal(r.month, '2026-09');
  assert.equal(r.found, 4);
});
