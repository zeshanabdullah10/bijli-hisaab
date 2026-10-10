import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeGasBill, gasCliff } from '../js/gas.js';

const tariff = JSON.parse(readFileSync(new URL('../data/gas/2025-07.json', import.meta.url), 'utf8'));
// GCV that gives exactly 3.5 MMBtu per hm3, the factor in the published worked examples.
const gcv = 3.5 * 281.7385;
const lines = (b) => Object.fromEntries(b.items.map((i) => [i.id, i.amount]));

test('gas: 1.5 hm3 non-protected reproduces the worked example (previous-slab benefit)', () => {
  const b = computeGasBill({ tariff, hm3: 1.5, isProtected: false, gcv });
  assert.equal(lines(b).gas, 6912.5);
  assert.equal(lines(b).fixed, 1500);
  assert.equal(lines(b).meter_rent, 40);
  assert.equal(b.total, 9973.95);
});

test('gas: 1.51 hm3 crosses into the next slab and the higher fixed charge', () => {
  const b = computeGasBill({ tariff, hm3: 1.51, isProtected: false, gcv });
  assert.equal(lines(b).fixed, 3000);
  assert.equal(b.total, 12648.42);
  const c = gasCliff({ tariff, hm3: 1.4, isProtected: false, gcv });
  assert.equal(c.next, 1.5);
  assert.ok(c.jump > 2600);
});

test('gas: above 4 hm3 the whole month is at the top rate', () => {
  const b = computeGasBill({ tariff, hm3: 5, isProtected: false, gcv });
  assert.equal(lines(b).gas, Math.round(5 * 3.5 * 4200 * 100) / 100);
});

test('gas: protected rates stop at 0.9 hm3', () => {
  const ok = computeGasBill({ tariff, hm3: 0.8, isProtected: true, gcv });
  assert.equal(ok.category, 'protected');
  assert.equal(lines(ok).fixed, 600);
  const over = computeGasBill({ tariff, hm3: 1.0, isProtected: true, gcv });
  assert.equal(over.category, 'unprotected');
  assert.equal(over.lostProtection, true);
});

test('gas data: every block cites a listed source', () => {
  const ids = new Set(tariff.sources.map((s) => s.id));
  for (const k of ['slabs', 'fixed', 'meter_rent', 'gst', 'conversion', 'previous_slab_benefit']) assert.ok(ids.has(tariff[k].source), k);
});
