// Appliance planner maths — pure functions, no DOM.
// Monthly energy = qty × watts × duty × hours/day × days ÷ 1000, where `duty`
// is the share of running time the appliance actually draws full power
// (a fridge compressor cycles; a fan does not).

import { billAt } from './insights.js';

const round2 = (n) => Math.round(n * 100) / 100;
const DAYS = 30;

export function applianceKwh({ qty, watts, duty = 1, hours }) {
  return round2((qty * watts * duty * hours * DAYS) / 1000);
}

/** Merge a catalog entry with the user's saved overrides (qty/hours/watts). */
export function resolve(entry, saved = {}) {
  return {
    id: entry.id,
    qty: saved.qty ?? entry.qty ?? 1,
    hours: saved.hours ?? entry.hours,
    watts: saved.watts ?? entry.watts,
    duty: entry.duty ?? 1,
  };
}

/**
 * Price every selected appliance against the real tariff.
 * `savesIfOff` is counterfactual — the bill with and without that appliance —
 * so it includes slab cliffs; `rsPerHour` uses the in-slab rate so it stays
 * stable. `hourLess` is the saving from running it one hour less per day.
 * @param {object} ctx       tariff context (see tariff.computeBill) minus units
 * @param {Array}  selected  resolved appliances (see resolve)
 * @param {number} rate      in-slab Rs per extra unit (insights.variableRate)
 */
export function priceAppliances(ctx, selected, rate) {
  const rows = selected.map((a) => ({ ...a, kwh: applianceKwh(a) }));
  const total = Math.round(rows.reduce((s, r) => s + r.kwh, 0));
  const whole = billAt(ctx, total);
  return {
    totalKwh: total,
    bill: whole,
    rows: rows.map((r) => {
      const lessHour = r.hours >= 1 ? applianceKwh({ ...r, hours: r.hours - 1 }) : r.kwh;
      return {
        ...r,
        share: total > 0 ? r.kwh / total : 0,
        savesIfOff: round2(whole - billAt(ctx, Math.max(0, Math.round(total - r.kwh)))),
        hourLess: round2(whole - billAt(ctx, Math.max(0, Math.round(total - (r.kwh - lessHour))))),
        rsPerHour: round2((r.qty * r.watts * r.duty / 1000) * rate),
      };
    }).sort((a, b) => b.kwh - a.kwh),
  };
}
