import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeBill } from '../js/tariff.js';
import { buildInsights, compareClasses, diagnoseBill, variableRate, billAt } from '../js/insights.js';
import {
  analyzeCycle, allowanceFor, underLimitStreak, historyStats, addDays, daysBetween,
  addMonths, sameMonthLastYear, forecastMonths, buildIcs,
} from '../js/tracker.js';
import { applianceKwh, resolve, priceAppliances } from '../js/appliances.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const tariff = read('../data/tariffs/exwapda/2026-10.json');
const discos = read('../data/discos.json');
const appliances = read('../data/appliances.json');
const disco = discos.discos.find((d) => d.id === 'lesco');
const ctx = { tariff, disco, loadKw: 5, onATL: true, phase: 'single', consumerType: 'unprotected' };

test('notices mirror warnings with translatable codes', () => {
  const b = computeBill({ ...ctx, units: 300, consumerType: 'protected' });
  assert.equal(b.notices[0].code, 'over_cap');
  assert.deepEqual(b.notices[0].params, { type: 'protected', cap: 200, units: 300 });
  assert.equal(b.notices.length, b.warnings.length);
});

test('insights: five units under a boundary warns about the cliff', () => {
  const ins = buildInsights({ ...ctx, units: 295 });
  const near = ins.find((i) => i.id === 'cliff_near');
  assert.ok(near, 'cliff_near expected');
  assert.equal(near.params.remaining, 5);
  assert.equal(near.level, 'warn');
  assert.equal(ins[0].level, 'warn', 'warnings sort first');
});

test('insights: a few units over a boundary offers the saving of dropping back', () => {
  const ins = buildInsights({ ...ctx, units: 205 });
  const drop = ins.find((i) => i.id === 'cliff_drop');
  assert.ok(drop);
  assert.equal(drop.params.target, 200);
  assert.equal(drop.params.cut, 5);
  assert.equal(drop.params.saving, Math.round((billAt(ctx, 205) - billAt(ctx, 200)) * 100) / 100);
  assert.equal(drop.action.units, 200);
});

test('insights: unprotected at 180 units is told what protected status would save', () => {
  const ins = buildInsights({ ...ctx, units: 180 });
  const c = ins.find((i) => i.id === 'class_protected');
  assert.ok(c && c.params.save > 0);
  assert.equal(c.params.total, billAt(ctx, 180, { consumerType: 'protected' }));
});

test('insights: protected consumer over the cap sees the lost-protection warning', () => {
  const ins = buildInsights({ ...ctx, consumerType: 'protected', units: 230 });
  const lost = ins.find((i) => i.id === 'lost_protection');
  assert.ok(lost);
  assert.ok(lost.params.extra > 5000, `going over 200 should cost thousands, got ${lost.params.extra}`);
});

test('insights: non-filer income tax is flagged', () => {
  const ins = buildInsights({ ...ctx, units: 500, onATL: false });
  assert.ok(ins.some((i) => i.id === 'nonfiler_tax'));
});

test('variableRate is the in-slab slope, not the cliff jump', () => {
  const r = variableRate({ ...ctx, units: 250 });
  assert.ok(r > 35 && r < 60, `in-slab marginal rate should be ~Rs 45, got ${r}`);
  const jump = billAt(ctx, 301) - billAt(ctx, 300);
  assert.ok(jump > 500 && r < 100, 'the cliff is far larger than the slope');
});

test('compareClasses marks over-cap classes as not applicable', () => {
  const rows = compareClasses({ ...ctx, units: 150 });
  assert.equal(rows.find((r) => r.type === 'lifeline').applicable, false);
  assert.equal(rows.find((r) => r.type === 'protected').applicable, true);
  assert.ok(rows.find((r) => r.type === 'protected').total < rows.find((r) => r.type === 'unprotected').total);
});

test('diagnose: recovers a different sanctioned load from the amount billed', () => {
  const actual = computeBill({ ...ctx, units: 300, loadKw: 3 }).total;
  const d = diagnoseBill({ ...ctx, units: 300, loadKw: 5 }, actual);
  assert.equal(d.verdict, 'explained');
  assert.ok(d.matches.some((m) => m.kind === 'load' && m.value === 3));
});

test('diagnose: recovers the FPA a bill was charged with and the billed units', () => {
  const actual = computeBill({ ...ctx, units: 320, fpaOverride: 3.1 }).total;
  const d = diagnoseBill({ ...ctx, units: 320 }, actual);
  assert.ok(Math.abs(d.impliedFpa - 3.1) < 0.02, `implied FPA ${d.impliedFpa}`);
  assert.ok(d.impliedUnits > 320, 'a higher FPA looks like extra units when FPA is held at the default');
});

test('diagnose: a bill inside 3% is a match; units billed are inferred from the amount', () => {
  const total = computeBill({ ...ctx, units: 260 }).total;
  const d = diagnoseBill({ ...ctx, units: 260 }, total * 1.01);
  assert.equal(d.verdict, 'match');
  const inflated = diagnoseBill({ ...ctx, units: 260 }, computeBill({ ...ctx, units: 340 }).total);
  assert.equal(inflated.impliedUnits, 340, 'amount reveals the units actually billed');
});

test('tracker: pace and projection from meter readings', () => {
  const c = analyzeCycle({
    startDate: '2026-09-01', startReading: 1000,
    readings: [{ date: '2026-09-11', reading: 1100 }],
    cycleDays: 30, today: '2026-09-11',
  });
  assert.equal(c.status, 'ok');
  assert.equal(c.used, 100);
  assert.equal(c.daysElapsed, 10);
  assert.equal(c.avgPerDay, 10);
  assert.equal(c.projected, 300);
  assert.equal(c.daysLeft, 20);
  assert.equal(c.endDate, '2026-10-01');
});

test('tracker: recent pace flags a heatwave', () => {
  const c = analyzeCycle({
    startDate: '2026-06-01', startReading: 0,
    readings: [{ date: '2026-06-08', reading: 70 }, { date: '2026-06-16', reading: 270 }],
    cycleDays: 30, today: '2026-06-16',
  });
  assert.equal(c.trend, 'up');
  assert.ok(c.recentPerDay > c.avgPerDay);
  assert.ok(c.projectedRecent > c.projected);
});

test('tracker: backwards readings are set aside, not trusted', () => {
  const c = analyzeCycle({
    startDate: '2026-09-01', startReading: 500,
    readings: [{ date: '2026-09-05', reading: 540 }, { date: '2026-09-08', reading: 90 }],
    today: '2026-09-08',
  });
  assert.equal(c.ignored.length, 1);
  assert.equal(c.used, 40);
});

test('tracker: empty and single-day states do not divide by zero', () => {
  assert.equal(analyzeCycle({}).status, 'empty');
  const c = analyzeCycle({ startDate: '2026-09-01', startReading: 10, readings: [], today: '2026-09-01' });
  assert.equal(c.status, 'need_more');
});

test('allowance: units per day left to hold a limit', () => {
  assert.deepEqual(allowanceFor(300, { used: 150, daysLeft: 15 }), { limit: 300, left: 150, over: 0, perDay: 10 });
  assert.equal(allowanceFor(200, { used: 230, daysLeft: 5 }).over, 30);
  assert.equal(allowanceFor(200, { used: 230, daysLeft: 5 }).perDay, null);
});

test('date helpers cross month and year boundaries', () => {
  assert.equal(addDays('2026-12-25', 10), '2027-01-04');
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
});

test('protection streak counts consecutive recent months at or under the cap', () => {
  const bills = [
    { month: '2026-03', units: 190 }, { month: '2026-04', units: 150 },
    { month: '2026-05', units: 120 }, { month: '2026-06', units: 180 },
  ];
  assert.equal(underLimitStreak(bills, 200), 4);
  assert.equal(underLimitStreak([...bills, { month: '2026-07', units: 260 }], 200), 0, 'latest month broke it');
  assert.equal(underLimitStreak([{ month: '2026-03', units: 90 }, { month: '2026-05', units: 90 }], 200), 1, 'a missing month breaks the run');
});

test('history stats', () => {
  const s = historyStats([{ month: '2026-01', units: 100, amount: 3000 }, { month: '2026-02', units: 300, amount: 15000 }]);
  assert.equal(s.avgUnits, 200);
  assert.equal(s.avgAmount, 9000);
  assert.equal(s.peak.month, '2026-02');
  assert.equal(historyStats([]), null);
});

test('appliances: monthly kWh = qty × W × duty × h × 30 ÷ 1000', () => {
  assert.equal(applianceKwh({ qty: 1, watts: 1000, duty: 1, hours: 1 }), 30);
  assert.equal(applianceKwh({ qty: 3, watts: 75, duty: 1, hours: 12 }), 81);
  const fridge = appliances.appliances.find((a) => a.id === 'fridge');
  const kwh = applianceKwh(resolve(fridge));
  assert.ok(kwh > 35 && kwh < 70, `a fridge should use roughly 40–60 units a month, got ${kwh}`);
});

test('appliances: catalog is well-formed and every preset references real ids', () => {
  const ids = new Set(appliances.appliances.map((a) => a.id));
  assert.equal(ids.size, appliances.appliances.length, 'ids unique');
  const groups = new Set(appliances.groups.map((g) => g.id));
  for (const a of appliances.appliances) {
    assert.ok(a.name_en && a.name_ur && a.watts > 0 && a.hours > 0 && a.duty > 0 && a.duty <= 1, a.id);
    assert.ok(groups.has(a.group), a.id);
  }
  for (const p of appliances.presets) for (const id of Object.keys(p.picks)) assert.ok(ids.has(id), `${p.id}:${id}`);
});

test('appliances: pricing is counterfactual and reports the cliff', () => {
  const picks = [
    resolve(appliances.appliances.find((a) => a.id === 'ac_std_15')),
    resolve(appliances.appliances.find((a) => a.id === 'fridge')),
  ];
  const priced = priceAppliances({ ...ctx }, picks, 45);
  assert.equal(priced.rows[0].id, 'ac_std_15', 'biggest consumer first');
  assert.equal(priced.bill, billAt(ctx, priced.totalKwh));
  assert.ok(priced.rows[0].savesIfOff > priced.rows[1].savesIfOff);
  assert.ok(priced.rows[0].rsPerHour > 30 && priced.rows[0].rsPerHour < 200);
  assert.ok(priced.rows[0].hourLess > 0);
});

// ---------------------------------------------------------------- outlook & reminders

const billsFrom = (start, units) => units.map((u, i) => ({ month: addMonths(start, i), units: u, amount: u * 40 }));

test('addMonths crosses year boundaries both ways', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-03', -12), '2025-03');
});

test('sameMonthLastYear finds the bill twelve months back', () => {
  const bills = billsFrom('2025-06', [300, 320, 340]);
  assert.equal(sameMonthLastYear([...bills, { month: '2026-07', units: 1, amount: 1 }], '2026-07').units, 320);
  assert.equal(sameMonthLastYear(bills, '2026-01'), null);
});

test('forecast: needs three bills, then falls back to the recent average', () => {
  assert.deepEqual(forecastMonths(billsFrom('2026-01', [100, 120])), []);
  const f = forecastMonths(billsFrom('2026-01', [100, 120, 140]));
  assert.deepEqual(f.map((m) => m.month), ['2026-04', '2026-05', '2026-06']);
  assert.ok(f.every((m) => m.basis === 'recent' && m.units === 120));
});

test('forecast: seasonal, scaled by this year vs last year', () => {
  // A year of bills, then three months running 10% above a year earlier.
  const year = [150, 120, 110, 125, 160, 200, 280, 350, 390, 330, 240, 190];
  const bills = billsFrom('2025-01', [...year, ...year.slice(0, 3).map((u) => u * 1.1)]);
  const f = forecastMonths(bills, 3);
  assert.deepEqual(f.map((m) => m.month), ['2026-04', '2026-05', '2026-06']);
  assert.ok(f.every((m) => m.basis === 'last_year'));
  assert.deepEqual(f.map((m) => m.units), [138, 176, 220]);
});

test('forecast: the seasonal scale is clamped', () => {
  const bills = billsFrom('2025-01', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 500, 500, 500]);
  assert.equal(forecastMonths(bills, 1)[0].units, 160);
});

test('ics: a reminder every N days up to the cycle end, plus the end itself', () => {
  const ics = buildIcs({ from: '2026-10-10', endDate: '2026-10-22', everyDays: 3, title: 'Read, meter', body: 'x', endTitle: 'End' });
  const starts = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(starts, ['20261013', '20261016', '20261019', '20261022']);
  assert.match(ics, /SUMMARY:Read\\, meter/);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal(new Set([...ics.matchAll(/UID:(\S+)/g)].map((m) => m[1])).size, 4);
});

test('cutOptions: hours less a day per appliance, easiest first, feasible only', async () => {
  const { cutOptions } = await import('../js/appliances.js');
  const items = [
    { id: 'ac', qty: 1, watts: 1600, duty: 0.75, hours: 8 },   // 1.2 kWh/h
    { id: 'fan', qty: 3, watts: 75, duty: 1, hours: 12 },      // 0.225 kWh/h
    { id: 'tv', qty: 1, watts: 80, duty: 1, hours: 5 },        // 0.08 kWh/h
  ];
  const o = cutOptions(items, 2.4);
  assert.deepEqual(o.map((x) => [x.id, x.hoursLess]), [['ac', 2], ['fan', 10.7]]);
  assert.deepEqual(cutOptions(items, 0), []);
});

test('readingError: forward in date and register only', async () => {
  const { readingError } = await import('../js/tracker.js');
  const cycle = { startDate: '2026-10-01', startReading: 1000, cycleDays: 30, readings: [{ date: '2026-10-05', reading: 1040 }] };
  const today = '2026-10-10';
  assert.equal(readingError(cycle, '2026-10-10', '1080', today), null);
  assert.equal(readingError(cycle, '2026-10-10', '', today), 'err_need_reading');
  assert.equal(readingError(cycle, '2026-10-11', '1080', today), 'err_future');
  assert.equal(readingError(cycle, '2026-10-05', '1080', today), 'err_date_order');
  assert.equal(readingError(cycle, '2026-10-10', '1030', today), 'err_reading_lower');
});

test('readingDue: nudges after three quiet days, not after the cycle, not when dismissed', async () => {
  const { readingDue } = await import('../js/tracker.js');
  const cycle = { startDate: '2026-10-01', startReading: 1000, cycleDays: 30, readings: [{ date: '2026-10-05', reading: 1040 }] };
  assert.equal(readingDue(cycle, { today: '2026-10-07' }), null);
  assert.deepEqual(readingDue(cycle, { today: '2026-10-08' }), { days: 3, last: { date: '2026-10-05', reading: 1040 } });
  assert.equal(readingDue(cycle, { today: '2026-10-08', dismissed: '2026-10-08' }), null);
  assert.equal(readingDue(cycle, { today: '2026-11-10' }), null);
  assert.equal(readingDue({ startDate: '' }, { today: '2026-10-08' }), null);
  assert.equal(readingDue({ ...cycle, readings: [] }, { today: '2026-10-04' }).days, 3);
});

test('yearReview: totals, extremes, cliff months over the last twelve', async () => {
  const { yearReview } = await import('../js/tracker.js');
  const units = [150, 120, 110, 125, 160, 205, 280, 350, 390, 330, 240, 190, 150];
  const bills = units.map((u, i) => ({ month: addMonths('2025-09', i), units: u, amount: u * 40 }));
  const r = yearReview(bills, { boundaries: [100, 200, 300], billAt: (u) => u * 40 + (u > 200 ? 1000 : 0) });
  assert.equal(r.months, 12, 'only the latest twelve');
  assert.equal(r.from, '2025-10');
  assert.equal(r.to, '2026-09');
  assert.equal(r.priciest.units, 390);
  assert.equal(r.cheapest.units, 110);
  assert.equal(r.underCap, 6);
  assert.equal(r.cliffMonths, 2, '205 and 110 land within 15 of a boundary');
  assert.equal(r.cliffCost, 1200 + 400);
  assert.equal(yearReview(bills.slice(0, 5), { boundaries: [], billAt: () => 0 }), null);
});

