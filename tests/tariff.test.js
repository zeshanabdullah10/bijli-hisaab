import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeBill, slabCliffInfo, maxUnitsForBudget } from '../js/tariff.js';

const here = dirname(fileURLToPath(import.meta.url));
const tariff = JSON.parse(readFileSync(join(here, '../data/tariffs/lesco/2026-10.json'), 'utf8'));
const discos = JSON.parse(readFileSync(join(here, '../data/discos.json'), 'utf8'));
const disco = discos.discos.find((d) => d.id === 'lesco');

const ctx = { tariff, disco, loadKw: 5, onATL: true, phase: 'single' };

test('data files carry provenance for every tariff', () => {
  assert.ok(tariff.sources.length >= 4, 'sources must be cited');
  assert.ok(tariff.effective_date && tariff.verified_on, 'effective/verified dates required');
  for (const cls of Object.values(tariff.consumer_classes.domestic)) {
    for (const s of cls.slabs) {
      assert.equal(typeof s.rate, 'number');
      assert.equal(typeof s.fixed_per_kw, 'number');
    }
  }
});

test('protected billing is telescopic — 200 units = 100×10.54 + 100×13.01 = Rs 2,355', () => {
  const bill = computeBill({ ...ctx, units: 200, consumerType: 'protected' });
  const energy = bill.items.find((i) => i.id === 'energy');
  assert.equal(energy.amount, 2355);
  assert.equal(energy.formula, '100 × 10.54  +  100 × 13.01');
});

test('unprotected billing is landing-slab — 200 units × 28.91 = Rs 5,782 (per SRO example)', () => {
  const bill = computeBill({ ...ctx, units: 200, consumerType: 'unprotected' });
  const energy = bill.items.find((i) => i.id === 'energy');
  assert.equal(energy.amount, 5782);
});

test('the cliff: 201 units costs far more than 200 (whole month repriced)', () => {
  const b200 = computeBill({ ...ctx, units: 200, consumerType: 'unprotected' });
  const b201 = computeBill({ ...ctx, units: 201, consumerType: 'unprotected' });
  const e200 = b200.items.find((i) => i.id === 'energy').amount;
  const e201 = b201.items.find((i) => i.id === 'energy').amount;
  assert.equal(e201, round(201 * 33.10)); // landed in 201–300
  assert.ok(e201 - e200 > 800, `energy jump should exceed Rs 800, got ${round(e201 - e200)}`);
  const info = slabCliffInfo({ ...ctx, units: 195, consumerType: 'unprotected' });
  assert.equal(info.unitsRemaining, 5);
  assert.ok(info.crossingCost > 800, 'crossing the 200 boundary must be visibly painful');
});

test('lifeline: 80 units at 7.74, exempt from fixed charge, FCA and financing surcharge', () => {
  const bill = computeBill({ ...ctx, units: 80, consumerType: 'lifeline', loadKw: 5 });
  const energy = bill.items.find((i) => i.id === 'energy');
  assert.equal(energy.amount, round(80 * 7.74));
  assert.equal(bill.items.find((i) => i.id === 'fixed'), undefined);
  assert.equal(bill.items.find((i) => i.id === 'fc_surcharge'), undefined);
  assert.equal(bill.items.find((i) => i.id === 'fpa'), undefined);
  assert.equal(bill.items.find((i) => i.id === 'qta'), undefined);
  assert.ok(bill.items.find((i) => i.id === 'tv_fee'));
});

test('minimum charge floors a tiny lifeline bill (fixed-charge payers are always above it)', () => {
  const bill = computeBill({ ...ctx, units: 1, consumerType: 'lifeline' });
  const topUp = bill.items.find((i) => i.id === 'minimum');
  assert.ok(topUp, 'top-up line expected for lifeline');
  const core = bill.items.filter((i) => ['energy', 'fixed'].includes(i.id)).reduce((a, i) => a + i.amount, 0);
  assert.ok(core + topUp.amount >= 75, 'energy + top-up must clear the single-phase minimum');

  // An unprotected consumer's per-kW fixed charge already clears the minimum.
  const billU = computeBill({ ...ctx, units: 1, consumerType: 'unprotected' });
  assert.equal(billU.items.find((i) => i.id === 'minimum'), undefined);
});

test('per-kW fixed charge scales with sanctioned load', () => {
  const b5 = computeBill({ ...ctx, units: 350, consumerType: 'unprotected', loadKw: 5 });
  const b1 = computeBill({ ...ctx, units: 350, consumerType: 'unprotected', loadKw: 1 });
  const f5 = b5.items.find((i) => i.id === 'fixed').amount;
  const f1 = b1.items.find((i) => i.id === 'fixed').amount;
  assert.equal(f1, 400); // 301–400 slab → Rs 400/kW × 1 kW
  assert.equal(f5, 2000);
});

test('FPA override replaces the default FPA rate', () => {
  const bDef = computeBill({ ...ctx, units: 300, consumerType: 'unprotected' });
  const bOvr = computeBill({ ...ctx, units: 300, consumerType: 'unprotected', fpaOverride: 4.5 });
  const def = bDef.items.find((i) => i.id === 'fpa').amount;
  const ovr = bOvr.items.find((i) => i.id === 'fpa').amount;
  assert.equal(ovr, 1350); // 4.5 × 300
  assert.equal(def, round(0.7503 * 300));
});

test('income tax: none for ATL filers; 7.5% above Rs 25,000 for non-filers', () => {
  const bFiler = computeBill({ ...ctx, units: 500, consumerType: 'unprotected', onATL: true });
  assert.equal(bFiler.items.find((i) => i.id === 'income_tax'), undefined);

  const bNon = computeBill({ ...ctx, units: 500, consumerType: 'unprotected', onATL: false });
  const it = bNon.items.find((i) => i.id === 'income_tax');
  assert.ok(it, 'income tax line expected on a large non-filer bill');
  assert.ok(Math.abs(it.amount - bNon.totalBeforeIncomeTax * 0.075) < 1);
});

test('sanity: a 300-unit unprotected bill lands in a realistic range', () => {
  const bill = computeBill({ ...ctx, units: 300, consumerType: 'unprotected' });
  assert.ok(bill.total > 12000 && bill.total < 20000, `got ${bill.total}`);
  assert.ok(bill.effectiveRatePerUnit > 40 && bill.effectiveRatePerUnit < 65);
});

test('reverse calculator inverts the bill exactly', () => {
  const p = { ...ctx, consumerType: 'unprotected' };
  const u = maxUnitsForBudget(p, 20000);
  assert.ok(computeBill({ ...p, units: u }).total <= 20000);
  assert.ok(computeBill({ ...p, units: u + 1 }).total > 20000);
});

test('crossing the protection cap reprices the whole month as unprotected', () => {
  const bill = computeBill({ ...ctx, units: 300, consumerType: 'protected' });
  const energy = bill.items.find((i) => i.id === 'energy');
  assert.equal(energy.amount, 9930, '300 protected units must bill at the unprotected 201–300 rate');
  assert.ok(bill.warnings.length >= 1 && /UNPROTECTED/.test(bill.warnings[0]));
  assert.ok(bill.total > 15000, `repriced total should be punitive, got ${bill.total}`);

  // Same for lifeline above its 100-unit cap.
  const lf = computeBill({ ...ctx, units: 150, consumerType: 'lifeline' });
  assert.equal(lf.items.find((i) => i.id === 'energy').amount, round(150 * 28.91));
  assert.ok(lf.warnings.length >= 1);
});

test('audit fixture — a fully worked bill stays consistent with its recorded total', () => {
  // Worked example, generated from the engine and hand-checked against the
  // SRO arithmetic (300 × 33.10 = 9,930 etc.). Replace with a real,
  // anonymised bill photo transcription when you have one — see README.
  const bill = computeBill({ ...ctx, units: 300, consumerType: 'unprotected' });
  const lines = Object.fromEntries(bill.items.map((i) => [i.id, i.amount]));
  assert.equal(lines.energy, 9930);
  assert.equal(lines.fixed, 1750);
  assert.equal(lines.fc_surcharge, round(3.23 * 300));
  assert.equal(lines.qta, round(0.52 * 300));
  assert.equal(lines.fpa, round(0.7503 * 300));
  assert.equal(lines.electricity_duty, round((9930 + 1750) * 0.015));
  assert.equal(lines.tv_fee, 35);
  const gstBase = lines.energy + lines.fixed + lines.electricity_duty
    + lines.fc_surcharge + lines.qta + lines.fpa;
  assert.equal(lines.gst, round(gstBase * 0.18));
  const sum = bill.items.reduce((a, i) => a + i.amount, 0);
  assert.ok(Math.abs(sum - bill.total) < 0.01, 'items must sum exactly to the total');
});

function round(n) {
  return Math.round(n * 100) / 100;
}
