// Rooftop solar sizing — pure functions, no DOM.
// A month of solar is modelled in three flows: the part of generation used in
// the house as it is produced (never touches the meter), the rest exported,
// and whatever the house still needs imported. New connections are on net
// billing (imports at full slab rates, exports bought back cheaply), so the
// daytime share of use decides most of the saving.

import { computeBill } from './tariff.js';
import { billAt } from './insights.js';

/**
 * One system size for one month.
 * @param {object} ctx  tariff context without units/solar (app.plainCtx())
 * @param {object} p
 * @param {number} p.units          the household's monthly use (kWh)
 * @param {number} p.kw             system size (kWp)
 * @param {number} p.yieldPerKw     kWh per kWp per month
 * @param {number} p.daytimeShare   0..1, share of use while the sun is up
 * @param {string} p.mode           'net_billing' | 'net_metering'
 * @param {number} [p.buyback]      Rs per exported unit (net billing)
 * @param {number} [p.costPerKw]    installed Rs per kWp
 */
export function simulateSolar(ctx, { units, kw, yieldPerKw, daytimeShare, mode, buyback, costPerKw = 0 }) {
  const generated = kw * yieldPerKw;
  const selfUsed = Math.min(generated, units * daytimeShare);
  const imported = Math.round(units - selfUsed);
  const exported = Math.round(generated - selfUsed);
  const bill = computeBill({
    ...ctx,
    units: imported,
    solar: { mode, importedUnits: imported, exportedOffPeak: exported, buybackPerUnit: buyback },
  }).total;
  const without = billAt(ctx, units);
  const saving = Math.max(0, without - bill);
  const cost = kw * costPerKw;
  return {
    kw, generated: Math.round(generated), selfUsed: Math.round(selfUsed), imported, exported,
    bill, without, saving,
    cost, paybackMonths: cost > 0 && saving > 0 ? Math.ceil(cost / saving) : null,
  };
}

/**
 * Compare system sizes. `best` is the size that pays itself back soonest
 * (ties go to the smaller system): past that, extra panels mostly export
 * at the buyback price and stretch the payback.
 */
export function sizeOptions(ctx, p, sizes = [3, 5, 8, 10, 12]) {
  const rows = sizes.map((kw) => simulateSolar(ctx, { ...p, kw }));
  const ranked = rows.filter((r) => r.paybackMonths !== null)
    .sort((a, b) => a.paybackMonths - b.paybackMonths || a.kw - b.kw);
  return { rows, best: ranked[0]?.kw ?? null };
}
