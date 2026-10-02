// BijliHisaab advice engine — pure functions, no DOM.
// Turns the tariff engine's numbers into decisions: what is the next unit
// worth, how close is the cliff, what would another consumer class cost, and
// why does a paper bill disagree with the estimate.

import { computeBill, slabCliffInfo, slabIndex, effectiveConsumerType } from './tariff.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Plain (no-solar) bill total for a unit count under `ctx`. */
export function billAt(ctx, units, overrides = {}) {
  return computeBill({ ...ctx, solar: null, ...overrides, units }).total;
}

/**
 * What one more unit costs inside the current slab, taxes included. Under
 * landing-slab billing this deliberately ignores the cliff: it is the slope
 * you feel until the boundary, the boundary itself is reported separately.
 */
export function variableRate(ctx) {
  const { tariff, units, consumerType } = ctx;
  const eff = effectiveConsumerType(tariff, consumerType, units);
  const slabs = tariff.consumer_classes.domestic[eff].slabs;
  const idx = slabIndex(slabs, units);
  const lo = idx > 0 ? slabs[idx - 1].up_to + 1 : 0;
  const hi = slabs[idx].up_to; // null on the top slab
  const here = billAt(ctx, units, { consumerType });
  if (hi === null || units + 1 <= hi) return round2(billAt(ctx, units + 1, { consumerType }) - here);
  if (units - 1 >= lo) return round2(here - billAt(ctx, units - 1, { consumerType }));
  return 0;
}

/** Same units, every consumer class that could legally apply. */
export function compareClasses(ctx) {
  const { tariff, units } = ctx;
  return Object.keys(tariff.consumer_classes.domestic).map((type) => {
    const slabs = tariff.consumer_classes.domestic[type].slabs;
    const cap = type === 'unprotected' ? null : slabs[slabs.length - 1].up_to;
    const applicable = cap === null || units <= cap;
    return { type, cap, applicable, total: applicable ? billAt(ctx, units, { consumerType: type }) : null };
  });
}

/**
 * Ranked, translatable insights: { id, level: 'warn'|'tip'|'info', icon,
 * params, action? }. The UI owns the wording (i18n keys are `ins_<id>`),
 * `action.units` is a one-tap "set my units to this" target.
 */
export function buildInsights(ctx, { solarMode = null, buyback = 0 } = {}) {
  const { tariff, units, consumerType, onATL } = ctx;
  const out = [];
  const info = slabCliffInfo({ ...ctx, solar: null });
  const eff = info.effectiveConsumerType;
  const cls = tariff.consumer_classes.domestic[eff];
  const idx = slabIndex(cls.slabs, units);
  const bill = computeBill({ ...ctx, solar: null });
  const here = bill.total;

  // Protection already lost this month.
  if (eff !== consumerType) {
    const cap = tariff.consumer_classes.domestic[consumerType].slabs.at(-1).up_to;
    out.push({
      id: 'lost_protection', level: 'warn', icon: 'alert-triangle',
      params: { type: consumerType, cap, units, extra: round2(here - billAt(ctx, cap, { consumerType })) },
      action: { units: cap },
    });
  }

  // Landing-slab billing: the cliff above and the discount just below.
  if (cls.billing_mode === 'landing_slab' && eff === 'unprotected') {
    if (info.unitsRemaining !== null && info.unitsRemaining <= 20) {
      out.push({
        id: info.unitsRemaining === 0 ? 'cliff_edge' : 'cliff_near', level: 'warn', icon: 'alert-triangle',
        params: { remaining: info.unitsRemaining, boundary: info.nextBoundary, cost: info.crossingCost },
      });
    }
    if (idx > 0) {
      const lower = cls.slabs[idx - 1].up_to;
      const width = lower - (idx > 1 ? cls.slabs[idx - 2].up_to : 0);
      const cut = units - lower;
      if (cut > 0 && cut <= Math.max(30, width * 0.3)) {
        out.push({
          id: 'cliff_drop', level: 'tip', icon: 'sparkles',
          params: { cut, target: lower, saving: round2(here - billAt(ctx, lower)) },
          action: { units: lower },
        });
      }
    }
  }

  // Headroom under protected / lifeline caps.
  if (eff === consumerType && consumerType !== 'unprotected') {
    const cap = cls.slabs.at(-1).up_to;
    const left = cap - units;
    if (left <= 25) {
      out.push({
        id: 'cap_headroom', level: left <= 10 ? 'warn' : 'info', icon: 'shield-check',
        params: { type: consumerType, left, cap, cost: round2(billAt(ctx, cap + 1) - billAt(ctx, cap)) },
      });
    }
  }

  // What a better class would have cost.
  if (consumerType === 'unprotected') {
    for (const c of compareClasses(ctx)) {
      if (c.type === 'unprotected' || !c.applicable) continue;
      const save = round2(here - c.total);
      if (save > 0) {
        out.push({ id: `class_${c.type}`, level: 'info', icon: 'shield-check', params: { save, total: c.total, cap: c.cap } });
      }
    }
  }

  // Non-filer income tax.
  const it = bill.items.find((i) => i.id === 'income_tax');
  const threshold = tariff.taxes.income_tax.threshold;
  if (it) {
    out.push({ id: 'nonfiler_tax', level: 'warn', icon: 'receipt', params: { amount: it.amount } });
  } else if (!onATL && bill.totalBeforeIncomeTax >= threshold * 0.9) {
    out.push({ id: 'nonfiler_near', level: 'warn', icon: 'receipt', params: { threshold, gap: round2(threshold - bill.totalBeforeIncomeTax) } });
  }

  // Solar: self-consumption beats export.
  if (solarMode === 'net_billing') {
    const m = variableRate({ ...ctx, solar: null });
    if (m > buyback) {
      out.push({ id: 'solar_selfuse', level: 'tip', icon: 'sun', params: { buy: m, sell: buyback } });
    }
  }

  // Always-on context.
  if (units > 0) {
    out.push({ id: 'next_unit', level: 'info', icon: 'bolt', params: { rate: variableRate({ ...ctx, solar: null }) } });
    const taxes = bill.items.filter((i) => i.kind === 'tax' || i.kind === 'fee').reduce((a, i) => a + i.amount, 0);
    if (here > 0) {
      out.push({ id: 'tax_share', level: 'info', icon: 'receipt', params: { amount: round2(taxes), pct: Math.round((taxes / here) * 100) } });
    }
  }

  const rank = { warn: 0, tip: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * Reverse-engineer a paper bill. Given the units and the amount actually
 * charged, report the units the amount corresponds to, the FPA it implies and
 * any single changed assumption (load, class, filer status) that reproduces it.
 */
export function diagnoseBill(ctx, actual) {
  const base = { ...ctx, solar: null };
  const at = (overrides = {}, units = base.units) => computeBill({ ...base, ...overrides, units }).total;
  const computed = at();
  const diff = round2(actual - computed);
  const diffPct = computed > 0 ? (diff / computed) * 100 : 0;

  // Largest unit count whose bill does not exceed `actual`; pick the nearer neighbour.
  let lo = 0;
  let hi = 3000;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (at({}, mid) <= actual) lo = mid; else hi = mid - 1;
  }
  const impliedUnits = Math.abs(at({}, lo + 1) - actual) < Math.abs(at({}, lo) - actual) ? lo + 1 : lo;

  // total(fpa) is increasing, so bisect for the rate that reproduces the bill.
  let impliedFpa = null;
  if (base.units > 0) {
    let a = -20;
    let b = 40;
    if (at({ fpaOverride: a }) <= actual && actual <= at({ fpaOverride: b })) {
      for (let i = 0; i < 40; i++) {
        const m = (a + b) / 2;
        if (at({ fpaOverride: m }) < actual) a = m; else b = m;
      }
      impliedFpa = round2((a + b) / 2);
    }
  }

  const matches = [];
  const consider = (kind, value, total) => {
    const residualPct = actual > 0 ? (Math.abs(total - actual) / actual) * 100 : 100;
    if (residualPct <= 1.5) matches.push({ kind, value, total, residualPct: round2(residualPct) });
  };
  if (Math.abs(diffPct) > 3) {
    for (let kw = 0.5; kw <= 20; kw += 0.5) {
      if (kw !== base.loadKw) consider('load', kw, at({ loadKw: kw }));
    }
    for (const type of Object.keys(base.tariff.consumer_classes.domestic)) {
      if (type !== base.consumerType) consider('class', type, at({ consumerType: type }));
    }
    consider('filer', !base.onATL, at({ onATL: !base.onATL }));
    matches.sort((x, y) => x.residualPct - y.residualPct);
  }

  const verdict = Math.abs(diffPct) <= 3 ? 'match' : matches.length ? 'explained' : 'unexplained';
  return { computed, diff, diffPct: round2(diffPct), impliedUnits, impliedFpa, matches: matches.slice(0, 3), verdict };
}
