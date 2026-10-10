import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshnessReport, STALE_AFTER_DAYS } from '../tools/freshness.mjs';

const tariff = (verified) => ({
  verified_on: verified,
  effective_date: '2026-02-12',
  adjustments_per_kwh: [{ id: 'fpa', rate: 0.75, name_en: 'FPA June' }, { id: 'qta', rate: 0.52, name_en: 'QTA Q3' }],
});
const sets = (verified) => [{ set: 'exwapda', file: 'data/tariffs/exwapda/x.json', tariff: tariff(verified) }];

test('freshness: fresh data opens no issue', () => {
  const r = freshnessReport(sets('2026-10-01'), '2026-10-20');
  assert.equal(r.stale, false);
  assert.equal(r.rows[0].age, 19);
});

test('freshness: data older than the limit is stale and the body lists current rates', () => {
  const r = freshnessReport(sets('2026-10-01'), '2026-11-06');
  assert.ok(36 > STALE_AFTER_DAYS);
  assert.equal(r.stale, true);
  assert.equal(r.title, 'Tariff check: 2026-11');
  assert.match(r.body, /0\.75 \(FPA June\)/);
  assert.match(r.body, /- \[ \] Check NEPRA/);
});
