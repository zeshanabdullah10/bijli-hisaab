import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulateSolar, sizeOptions } from '../js/solar.js';
import { billAt } from '../js/insights.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const tariff = read('../data/tariffs/exwapda/2026-10.json');
const disco = read('../data/discos.json').discos.find((d) => d.id === 'lesco');
const ctx = { tariff, disco, loadKw: 5, onATL: true, phase: 'single', consumerType: 'unprotected' };
const base = { units: 500, yieldPerKw: 120, daytimeShare: 0.4, mode: 'net_billing', buyback: 10, costPerKw: 100000 };

test('solar: flows add up; self-use is capped by daytime demand', () => {
  const r = simulateSolar(ctx, { ...base, kw: 5 }); // 600 kWh generated, 200 used in daytime
  assert.equal(r.generated, 600);
  assert.equal(r.selfUsed, 200);
  assert.equal(r.imported, 300);
  assert.equal(r.exported, 400);
  assert.equal(r.without, billAt(ctx, 500));
  assert.ok(r.bill < r.without);
  assert.equal(r.paybackMonths, Math.ceil(500000 / r.saving));
});

test('solar: a small system is all self-used and exports nothing', () => {
  const r = simulateSolar(ctx, { ...base, kw: 1 }); // 120 kWh < 200 daytime
  assert.equal(r.exported, 0);
  assert.equal(r.imported, 380);
});

test('solar: net metering beats net billing for the same system', () => {
  const nb = simulateSolar(ctx, { ...base, kw: 8 });
  const nm = simulateSolar(ctx, { ...base, kw: 8, mode: 'net_metering' });
  assert.ok(nm.bill < nb.bill);
});

test('solar: sizes ranked by payback, smallest wins ties', () => {
  const { rows, best } = sizeOptions(ctx, base, [3, 5, 8]);
  assert.equal(rows.length, 3);
  const min = Math.min(...rows.map((r) => r.paybackMonths));
  assert.equal(best, rows.find((r) => r.paybackMonths === min).kw);
  assert.equal(sizeOptions(ctx, { ...base, costPerKw: 0 }).best, null);
});
