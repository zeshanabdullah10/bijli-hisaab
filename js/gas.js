// Sui gas bill engine (SNGPL / SSGC domestic) — pure functions, no DOM.
// Volume is billed per MMBtu; the slab is picked by monthly volume in hm3.
// Domestic consumers get the "previous slab" benefit: volume up to the
// previous slab's limit is charged at that slab's rate, the rest at the
// current one, except in the top slab where the whole month is at its rate.

const round2 = (n) => Math.round(n * 100) / 100;

export const toMmbtu = (hm3, gcv, divisor) => (hm3 * gcv) / divisor;

/**
 * @param {object} p
 * @param {object} p.tariff     parsed data/gas/<period>.json
 * @param {number} p.hm3        monthly volume (hm3)
 * @param {boolean} p.isProtected
 * @param {number} [p.gcv]      gross calorific value printed on the bill
 */
export function computeGasBill({ tariff, hm3, isProtected, gcv }) {
  const g = gcv || tariff.conversion.default_gcv;
  const mm = (v) => toMmbtu(v, g, tariff.conversion.divisor);
  const protCap = tariff.slabs.protected.at(-1).up_to;
  // Like electricity, protected rates stop at the protected cap.
  const category = isProtected && hm3 <= protCap ? 'protected' : 'unprotected';
  const slabs = tariff.slabs[category];
  const idx = slabs.findIndex((s) => s.up_to === null || hm3 <= s.up_to);
  const slab = slabs[idx];
  const prev = idx > 0 ? slabs[idx - 1] : null;
  const top = slab.up_to === null && hm3 > tariff.previous_slab_benefit.none_above;

  let gas;
  let formula;
  if (prev && !top) {
    const a = mm(prev.up_to) * prev.rate;
    const b = mm(hm3 - prev.up_to) * slab.rate;
    gas = a + b;
    formula = `${prev.up_to} hm3 × Rs ${prev.rate} + ${round2(hm3 - prev.up_to)} hm3 × Rs ${slab.rate} per MMBtu (previous-slab benefit)`;
  } else {
    gas = mm(hm3) * slab.rate;
    formula = `${hm3} hm3 × Rs ${slab.rate} per MMBtu`;
  }
  const items = [{ id: 'gas', amount: round2(gas), formula: `${formula}; ${round2(mm(hm3))} MMBtu at GCV ${g}` }];
  const fixed = tariff.fixed[category].find((f) => f.up_to === null || hm3 <= f.up_to);
  items.push({ id: 'fixed', amount: fixed.amount, formula: `Rs ${fixed.amount} a month (${category})` });
  items.push({ id: 'meter_rent', amount: tariff.meter_rent.amount, formula: `Rs ${tariff.meter_rent.amount} a month` });
  const base = items.filter((i) => tariff.gst.base.includes(i.id)).reduce((s, i) => s + i.amount, 0);
  items.push({ id: 'gst', amount: round2((base * tariff.gst.rate_pct) / 100), formula: `${tariff.gst.rate_pct}% × Rs ${round2(base)}` });
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  return {
    items, total, category, mmbtu: round2(mm(hm3)),
    slab: { from: prev ? prev.up_to : 0, to: slab.up_to, rate: slab.rate },
    lostProtection: isProtected && category === 'unprotected',
  };
}

/** The next slab line above `hm3` and what one more hundredth past it costs. */
export function gasCliff(p) {
  const here = computeGasBill(p);
  const to = here.slab.to;
  if (to === null) return { next: null };
  const at = computeGasBill({ ...p, hm3: to }).total;
  const over = computeGasBill({ ...p, hm3: round2(to + 0.01) }).total;
  return { next: to, left: round2(to - p.hm3), jump: round2(over - at), atLine: at };
}
