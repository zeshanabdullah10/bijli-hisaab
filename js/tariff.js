// BijliHisaab tariff engine — pure functions, no DOM.
// Used by both the browser UI and `node --test` fixtures.

const round2 = (n) => Math.round(n * 100) / 100;

export function findSlab(slabs, units) {
  for (const s of slabs) {
    if (s.up_to === null || units <= s.up_to) return s;
  }
  return slabs[slabs.length - 1];
}

export function slabIndex(slabs, units) {
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    if (s.up_to === null || units <= s.up_to) return i;
  }
  return slabs.length - 1;
}

export function slabLabel(slab, prevUpTo) {
  const from = prevUpTo === null || prevUpTo === undefined ? 1 : prevUpTo + 1;
  return slab.up_to === null ? `${from}+` : `${from}-${slab.up_to}`;
}

function energyCharge(cls, units) {
  // Returns { amount, formula, slabLabel } for the energy line.
  const slab = findSlab(cls.slabs, units);
  const idx = slabIndex(cls.slabs, units);
  const prevUpTo = idx > 0 ? cls.slabs[idx - 1].up_to : null;
  const label = slabLabel(slab, prevUpTo);

  if (cls.billing_mode === 'telescopic') {
    // Progressive: each slab's rate applies only to units inside that slab.
    let amount = 0;
    let remaining = units;
    let lower = 0;
    const parts = [];
    for (const s of cls.slabs) {
      if (remaining <= 0) break;
      const width = s.up_to === null ? Infinity : s.up_to - lower;
      const inSlab = Math.min(remaining, width);
      if (inSlab > 0) {
        amount += inSlab * s.rate;
        parts.push(`${inSlab} × ${s.rate.toFixed(2)}`);
      }
      remaining -= inSlab;
      lower = s.up_to;
    }
    return { amount: round2(amount), formula: parts.join('  +  '), slabLabel: label };
  }

  // landing_slab: every unit billed at the rate of the slab the total lands in.
  return {
    amount: round2(units * slab.rate),
    formula: `${units} units × Rs ${slab.rate.toFixed(2)} (${label} slab, all units at this rate)`,
    slabLabel: label,
  };
}

/**
 * Protected and lifeline status only holds while usage stays under the cap of
 * the class (200 / 100 units). Cross it and the month is billed as an ordinary
 * unprotected consumer — the cap is the whole point of the protection.
 */
export function effectiveConsumerType(tariff, consumerType, units, warnings = []) {
  const cls = tariff.consumer_classes.domestic[consumerType];
  const cap = consumerType === 'lifeline' || consumerType === 'protected'
    ? cls.slabs[cls.slabs.length - 1].up_to
    : null;
  if (cap !== null && units > cap) {
    warnings.push(
      `You entered ${units} units as a ${consumerType} consumer, but the ${consumerType} tables only apply up to ${cap} units. ` +
      `This month is billed as UNPROTECTED: the whole month reprices, and ${consumerType === 'protected' ? 'protection is lost for the next 6 months' : 'lifeline status is lost'}.`,
    );
    return 'unprotected';
  }
  return consumerType;
}

/**
 * Compute an itemised bill.
 * @param {object} p
 * @param {object} p.tariff        parsed tariff JSON (see data/tariffs/)
 * @param {object} p.disco         parsed entry from data/discos.json
 * @param {number} p.units         monthly kWh (grid imports when p.solar is set)
 * @param {string} p.consumerType  'unprotected' | 'protected' | 'lifeline'
 * @param {number} [p.loadKw=5]    sanctioned load in kW (drives fixed charges)
 * @param {number|null} [p.fpaOverride] per-unit FPA from the paper bill, if known
 * @param {boolean} [p.onATL=true] consumer on the Active Taxpayer List (filer)
 * @param {'single'|'three'} [p.phase='single']  meter phase (minimum charge)
 * @param {object|null} [p.solar]  rooftop solar:
 *   { mode: 'net_metering'|'net_billing', importedUnits, exportedUnits,
 *     importedPeak, importedOffPeak, exportedPeak, exportedOffPeak,
 *     buybackPerUnit, buybackPeakPerUnit }
 *   net_metering: exports offset imports 1:1, PER REGISTER when peak/off-peak
 *   registers are given (peak export never offsets off-peak import); excess
 *   export rolls forward as a unit credit (grandfathered agreements).
 *   net_billing:  imports billed in full at slab rates, exports credited at
 *   the buyback rate per register (peak rate defaults to the off-peak rate
 *   when not supplied).
 * @returns {{items: Array, total: number, totalBeforeIncomeTax: number, effectiveRatePerUnit: number, warnings: string[]}}
 */
export function computeBill(p) {
  const {
    tariff, disco, units: unitsIn = 0, consumerType = 'unprotected', loadKw = 5,
    fpaOverride = null, onATL = true, phase = 'single', solar = null,
  } = p;

  const warnings = [];
  let units = unitsIn;
  let importedUnits = unitsIn;
  if (solar) {
    importedUnits = solar.importedUnits ?? unitsIn;
    const expPeak = solar.exportedPeak || 0;
    const expOff = solar.exportedOffPeak ?? solar.exportedUnits ?? 0;
    const hasRegisters = solar.importedPeak != null || solar.importedOffPeak != null;

    if (solar.mode === 'net_metering') {
      if (hasRegisters) {
        // Register-wise netting: a peak export only cancels a peak import.
        const impPeak = solar.importedPeak || 0;
        const impOff = solar.importedOffPeak || 0;
        const surplusPeak = Math.max(0, expPeak - impPeak);
        const surplusOff = Math.max(0, expOff - impOff);
        units = Math.max(0, impPeak - expPeak) + Math.max(0, impOff - expOff);
        const surplus = surplusPeak + surplusOff;
        if (surplus > 0) {
          warnings.push(
            `You exported ${Math.round(surplus)} more units than you imported in the same register${surplusPeak > 0 && surplusOff > 0 ? 's' : ''}. Under net metering the difference rolls forward to future bills as a unit credit, not cash.`,
          );
        }
      } else {
        const exported = expPeak + expOff;
        units = Math.max(0, importedUnits - exported);
        if (exported > importedUnits) {
          warnings.push(
            `You exported ${Math.round(exported - importedUnits)} more units than you imported. Under net metering the difference rolls forward to future bills as a unit credit, not cash.`,
          );
        }
      }
    } else {
      units = importedUnits;
    }
  }

  const cls = tariff.consumer_classes.domestic[consumerType];
  if (!cls) throw new Error(`Unknown consumerType: ${consumerType}`);
  const effType = effectiveConsumerType(tariff, consumerType, units, warnings);
  const effCls = tariff.consumer_classes.domestic[effType];
  const items = [];
  const src = (id) => (tariff.sources.find((s) => s.id === id) || {}).url || '';

  // --- 1. Energy charge -----------------------------------------------------
  const energy = energyCharge(effCls, units);
  items.push({
    id: 'energy', kind: 'charge',
    name_en: 'Electricity charges', name_ur: 'بجلی کے چارجز',
    amount: energy.amount, formula: energy.formula, slabLabel: energy.slabLabel,
    source: src('sro279'),
  });

  // --- 2. Fixed charge (per kW of sanctioned load) ---------------------------
  const slab = findSlab(effCls.slabs, units);
  const fixedPerKw = slab.fixed_per_kw || 0;
  if (fixedPerKw > 0) {
    const amount = round2(fixedPerKw * loadKw);
    items.push({
      id: 'fixed', kind: 'charge',
      name_en: 'Fixed charges', name_ur: 'ثابت چارجز',
      amount, formula: `Rs ${fixedPerKw}/kW × ${loadKw} kW sanctioned load (${energy.slabLabel} slab)`,
      source: src('sro279'),
    });
  }

  // --- 3. Per-unit surcharges & adjustments ----------------------------------
  const chargeables = [
    ...(tariff.surcharges_per_kwh || []),
    ...(tariff.adjustments_per_kwh || []),
  ];
  for (const c of chargeables) {
    if ((c.exempt_consumer_types || []).includes(effType)) continue;
    let rate = c.rate;
    if (c.id === 'fpa' && fpaOverride !== null && fpaOverride !== undefined) {
      rate = fpaOverride;
    }
    const amount = round2(rate * units);
    if (amount === 0) continue;
    items.push({
      id: c.id, kind: c.rate >= 0 ? 'adjustment' : 'adjustment',
      name_en: c.name_en, name_ur: c.name_ur,
      amount, formula: `Rs ${rate.toFixed(4)}/unit × ${units} units`,
      source: src(c.source),
    });
  }

  // --- 4. Minimum charge floor ----------------------------------------------
  const minCharge = phase === 'three' ? tariff.minimum_charge.three_phase : tariff.minimum_charge.single_phase;
  const coreSoFar = items.reduce((a, i) => a + i.amount, 0);
  if (coreSoFar > 0 && coreSoFar < minCharge) {
    items.push({
      id: 'minimum', kind: 'charge',
      name_en: 'Minimum charge top-up', name_ur: 'کم از کم چارج',
      amount: round2(minCharge - coreSoFar),
      formula: `Minimum monthly charge Rs ${minCharge} (${phase}-phase) applies to every domestic connection`,
      source: src('sro279'),
    });
  }

  // --- 5. Electricity duty (provincial) --------------------------------------
  const ed = disco.electricity_duty;
  const edBaseIds = ed.base || ['energy'];
  const edBase = items.filter((i) => edBaseIds.includes(i.id)).reduce((a, i) => a + i.amount, 0);
  const edAmount = round2(edBase * ed.rate_pct / 100);
  items.push({
    id: 'electricity_duty', kind: 'tax',
    name_en: `Electricity duty (${disco.region_en})`, name_ur: 'الیکٹرسٹی ڈیوٹی',
    amount: edAmount,
    formula: `${ed.rate_pct}% × Rs ${round2(edBase).toLocaleString('en-PK')} (on ${edBaseIds.join(' + ')})`,
    source: src('mepco_tax'),
  });

  // --- 6. TV licence fee ------------------------------------------------------
  const tv = tariff.fees.tv_license;
  if ((tv.consumer_types || []).includes(effType)) {
    items.push({
      id: 'tv_fee', kind: 'fee',
      name_en: 'TV licence fee (PTV)', name_ur: 'ٹی وی لائسنس فیس',
      amount: tv.amount, formula: `Flat Rs ${tv.amount} on domestic connections`,
      source: src(tv.source),
    });
  }

  // --- 7. GST ------------------------------------------------------------------
  const gst = tariff.taxes.gst;
  const gstBase = items.filter((i) => gst.base.includes(i.id)).reduce((a, i) => a + i.amount, 0);
  items.push({
    id: 'gst', kind: 'tax',
    name_en: 'GST (sales tax)', name_ur: 'جی ایس ٹی (سیلز ٹیکس)',
    amount: round2(gstBase * gst.rate_pct / 100),
    formula: `${gst.rate_pct}% × Rs ${round2(gstBase).toLocaleString('en-PK')} (on ${gst.base.join(' + ')})`,
    source: src(gst.source),
  });

  // --- 7b. Solar export credit (net billing) -----------------------------------
  // Exports are bought back at the reference price and credited separately;
  // they do not enter the GST base. Peak and off-peak registers earn their
  // own rates; the peak rate falls back to the off-peak/default rate.
  if (solar && solar.mode === 'net_billing') {
    const expPeak = solar.exportedPeak || 0;
    const expOff = solar.exportedOffPeak ?? solar.exportedUnits ?? 0;
    if (expPeak > 0 || expOff > 0) {
      const defaultRate = tariff.solar.modes.net_billing.buyback_per_kwh;
      const offRate = solar.buybackPerUnit ?? defaultRate;
      const peakRate = solar.buybackPeakPerUnit ?? offRate;
      const credit = round2(expPeak * peakRate + expOff * offRate);
      const parts = [];
      if (expPeak > 0) parts.push(`${Math.round(expPeak)} peak × Rs ${peakRate.toFixed(2)}`);
      if (expOff > 0) parts.push(`${Math.round(expOff)} off-peak × Rs ${offRate.toFixed(2)}`);
      items.push({
        id: 'solar_export', kind: 'credit',
        name_en: tariff.solar.credit_name_en, name_ur: tariff.solar.credit_name_ur,
        amount: -credit,
        formula: `${parts.join('  +  ')} units exported (credited against this bill)`,
        source: src(tariff.solar.source),
      });
    }
  }

  const totalBeforeIncomeTax = round2(items.reduce((a, i) => a + i.amount, 0));

  // --- 8. Income tax (non-filers above threshold) -------------------------------
  const it = tariff.taxes.income_tax;
  let incomeTax = 0;
  if (!onATL && totalBeforeIncomeTax >= it.threshold) {
    incomeTax = round2(totalBeforeIncomeTax * it.rate_pct / 100);
    items.push({
      id: 'income_tax', kind: 'tax',
      name_en: 'Income tax (non-filer)', name_ur: 'انکم ٹیکس (نان فائلر)',
      amount: incomeTax,
      formula: `${it.rate_pct}% × Rs ${totalBeforeIncomeTax.toLocaleString('en-PK')} (applies when the bill reaches Rs ${it.threshold.toLocaleString('en-PK')} and you are not on the ATL)`,
      source: src(it.source),
    });
  } else if (!onATL) {
    warnings.push(
      `Bill is below the Rs ${it.threshold.toLocaleString('en-PK')} income-tax threshold for non-filers, so no income tax applies.`,
    );
  }

  let total = round2(totalBeforeIncomeTax + incomeTax);
  if (total < 0) {
    total = 0;
    warnings.push(
      'Your solar export credit exceeds this month\'s entire bill. The surplus carries forward on your account; this estimate shows Rs 0 payable.',
    );
  }
  return {
    items,
    total,
    totalBeforeIncomeTax,
    effectiveRatePerUnit: importedUnits > 0 ? round2(total / importedUnits) : 0,
    warnings,
  };
}

/**
 * Where you sit relative to the next slab cliff.
 */
export function slabCliffInfo(p) {
  const { tariff, disco, units, consumerType, loadKw, fpaOverride, onATL, phase } = p;
  const warnings = [];
  const effType = effectiveConsumerType(tariff, consumerType, units, warnings);
  const cls = tariff.consumer_classes.domestic[effType];
  const idx = slabIndex(cls.slabs, units);
  const slab = cls.slabs[idx];
  const ctx = { tariff, disco, consumerType: effType, loadKw, fpaOverride, onATL, phase };

  const billAt = (u) => computeBill({ ...ctx, units: u }).total;
  const nextBoundary = slab.up_to; // null = top slab
  const marginalCostNextUnit = units >= 0 ? round2(billAt(units + 1) - billAt(units)) : 0;

  let crossingCost = null;
  let unitsRemaining = null;
  if (nextBoundary !== null && units <= nextBoundary) {
    unitsRemaining = nextBoundary - units;
    crossingCost = round2(billAt(nextBoundary + 1) - billAt(nextBoundary));
  }

  const prevUpTo = idx > 0 ? cls.slabs[idx - 1].up_to : null;
  return {
    slabLabel: slabLabel(slab, prevUpTo),
    billingMode: cls.billing_mode,
    effectiveConsumerType: effType,
    warnings,
    unitsRemaining,
    nextBoundary,
    crossingCost,
    marginalCostNextUnit,
  };
}

/**
 * Reverse calculator: the most units you can consume while keeping the bill
 * within `budget`. Binary search over the monotone total(units) function.
 */
export function maxUnitsForBudget(p, budget, cap = 5000) {
  const ctx = (u) => computeBill({ ...p, units: u }).total;
  if (ctx(0) > budget) return 0; // even standing charge exceeds the budget
  let lo = 0;
  let hi = cap;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx(mid) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
