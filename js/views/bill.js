// Bill tab: the estimate, where it goes, what to do about it, and an audit
// of the paper bill. Static markup lives in index.html; this file wires it.

import { app } from '../app.js';
import { computeBill, slabCliffInfo, maxUnitsForBudget } from '../tariff.js';
import { renderCliffChart } from '../chart.js';
import { buildInsights, compareClasses, diagnoseBill } from '../insights.js';
import { fmt, fmt2 } from '../i18n.js';
import { el, $$, esc, icon, fillSlider, num, copyText } from '../ui.js';
import { openSettings } from './settings.js';

// Bill-line id → glossary entry id (Learn tab).
const GLOSSARY = {
  energy: 'slab', fixed: 'fixed', minimum: 'minimum', fc_surcharge: 'fc',
  qta: 'qta', fpa: 'fpa', electricity_duty: 'duty', gst: 'gst',
  tv_fee: 'tv', income_tax: 'itax', solar_export: 'netbilling',
};

// Money groups. `seg` picks the colour slot shared by the hero bar and the list.
const GROUPS = [
  { key: 'cluster_energy', ids: ['energy', 'fixed', 'minimum'], seg: 1 },
  { key: 'cluster_adjust', ids: ['fc_surcharge', 'qta', 'fpa'], seg: 3 },
  { key: 'cluster_taxes', ids: ['electricity_duty', 'gst', 'tv_fee', 'income_tax'], seg: 2 },
];

let wired = false;
let lastTotal = null;

const registersActive = () => {
  const s = app.state.solar;
  return s.enabled && (s.importedPeak !== '' || s.importedOffPeak !== '');
};
const typeName = (type) => app.t(`type_${type}`);
const isNetMetering = () => app.state.solar.enabled && app.state.solar.mode === 'net_metering';

export const billView = {
  id: 'bill',

  build() {
    const { state } = app;
    el('units-input').value = state.units;
    el('units-slider').value = Math.min(state.units, 1000);
    fillSlider(el('units-slider'), state.units, 1000);
    const checked = document.querySelector(`input[name=ctype][value=${state.profile.consumerType}]`);
    if (checked) {
      checked.checked = true;
      el('ctype-seg').style.setProperty('--active', [...document.querySelectorAll('input[name=ctype]')].indexOf(checked));
    }
    el('budget-input').value = state.budget;
    el('actual-input').value = state.actual;
    el('solar-toggle').checked = state.solar.enabled;
    const sm = document.querySelector(`input[name=smode][value=${state.solar.mode}]`);
    if (sm) {
      sm.checked = true;
      el('solar-mode-seg').style.setProperty('--active', [...document.querySelectorAll('input[name=smode]')].indexOf(sm));
    }
    const ids = {
      'solar-imp-peak': 'importedPeak', 'solar-imp-off': 'importedOffPeak',
      'solar-exp-peak': 'exportedPeak', 'solar-exp-off': 'exportedOffPeak',
      'solar-buyback-input': 'buyback', 'solar-buyback-peak': 'buybackPeak', 'solar-cost-input': 'cost',
    };
    for (const [id, key] of Object.entries(ids)) el(id).value = state.solar[key];
    el('source-list').innerHTML = app.tariff.sources
      .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('');
    if (!wired) { wire(); wired = true; }
    this.update();
  },

  update() {
    const { state, t } = app;
    const ur = state.lang === 'ur';
    const ctx = app.plainCtx();
    const billCtx = app.ctx();
    const bill = computeBill(billCtx);
    const cliff = slabCliffInfo(ctx);
    const cls = app.tariff.consumer_classes.domestic[state.profile.consumerType];

    syncUnitsControls();
    renderHero(bill, cliff);
    renderBreakdown(bill, ur);
    renderWarnings(bill);

    el('type-note').textContent = ur ? (cls.eligibility_ur || cls.mode_note_ur || '') : (cls.eligibility_en || cls.mode_note_en || '');
    el('conn-text').textContent = [
      app.disco.name_en,
      `${state.profile.loadKw} kW`,
      state.profile.onATL ? t('filer_short') : t('nonfiler_short'),
    ].join(' · ');

    // Cliff tiles
    if (cliff.unitsRemaining !== null) {
      el('cliff-remaining').textContent = fmt(cliff.unitsRemaining);
      el('cliff-crossing').textContent = `+Rs ${fmt(cliff.crossingCost)}`;
      el('cliff-top-note').hidden = true;
      el('cliff-grid').hidden = false;
    } else {
      el('cliff-grid').hidden = true;
      el('cliff-top-note').hidden = false;
    }
    el('cliff-note').textContent = cliff.billingMode === 'telescopic' ? t('cliff_note_telescopic') : t('cliff_note');

    renderInsights(ctx);
    renderCompare(ctx);

    const maxU = maxUnitsForBudget(billCtx, state.budget);
    el('budget-result').textContent = maxU === 0 ? t('budget_too_small') : t('budget_result', { units: fmt(maxU) });

    renderAudit(ctx);
    renderSolar();

    el('helpline-link').textContent = `${app.disco.name_en} ${t('audit_helpline')}: ${app.disco.helpline}`;
    el('helpline-link').href = `tel:${app.disco.helpline}`;
    el('complaint-link').href = app.disco.regulator_complaints || 'https://nepra.org.pk/complaints.php';

    renderCliffChart({
      host: el('cliff-chart'),
      ctx,
      consumerType: state.profile.consumerType,
      units: state.units,
      t,
      onDrag: (u) => { if (!registersActive()) setUnits(u); },
    });
    renderSliderScale(cliff);
  },
};

// ---------------------------------------------------------------- units

function setUnits(u) {
  app.change((s) => { s.units = Math.max(0, Math.min(2000, Math.round(u))); });
}

function syncUnitsControls() {
  const { state, t } = app;
  const reg = registersActive();
  const label = state.solar.enabled ? t('solar_imports_label') : t('units_label');
  document.querySelector('label[for="units-input"]').textContent = label;
  el('units-input').setAttribute('aria-label', label);
  el('units-slider').setAttribute('aria-label', label);
  if (document.activeElement !== el('units-input')) el('units-input').value = state.units;
  el('units-slider').value = Math.min(state.units, 1000);
  fillSlider(el('units-slider'), state.units, 1000);
  el('units-input').readOnly = reg;
  el('units-slider').disabled = reg;
  el('units-plus').disabled = reg;
  el('units-minus').disabled = reg;
}

/** Tick marks under the slider at each slab boundary: the cliffs, made visible. */
function renderSliderScale() {
  const type = app.state.profile.consumerType;
  const cls = app.tariff.consumer_classes.domestic[type];
  el('slider-scale').innerHTML = cls.slabs
    .filter((s) => s.up_to !== null && s.up_to <= 1000)
    .map((s) => `<span style="--x:${(s.up_to / 1000) * 100}%"><i></i>${s.up_to}</span>`).join('');
}

// ---------------------------------------------------------------- hero

function renderHero(bill, cliff) {
  const { state, t } = app;
  const ur = state.lang === 'ur';
  if (lastTotal !== null && lastTotal !== bill.total) {
    const a = el('total-value');
    a.classList.remove('pulse');
    void a.offsetWidth; // restart the animation
    a.classList.add('pulse');
  }
  lastTotal = bill.total;
  el('total-value').textContent = fmt(bill.total);
  el('effective-rate').textContent = `${t('effective_rate')}: Rs ${fmt2(bill.effectiveRatePerUnit)} ${t('per_unit')}`;
  el('hero-chip').textContent = `${typeName(state.profile.consumerType)} · ${fmt(state.units)} ${ur ? 'یونٹس' : 'units'} · ${cliff.slabLabel}`;
  el('mini-label').textContent = `${fmt(state.units)} ${ur ? 'یونٹس' : 'units'}`;
  el('mini-amount').textContent = `Rs ${fmt(bill.total)}`;

  // Money bar: positive lines only; a solar credit is shown separately below.
  const sums = GROUPS.map((g) => ({
    ...g,
    amount: bill.items.filter((i) => g.ids.includes(i.id) && i.amount > 0).reduce((a, i) => a + i.amount, 0),
  })).filter((g) => g.amount > 0);
  const whole = sums.reduce((a, g) => a + g.amount, 0) || 1;
  el('moneybar').setAttribute('aria-label', sums.map((g) => `${t(g.key)} Rs ${fmt(g.amount)}`).join(', '));
  el('moneybar').innerHTML = sums.map((g) =>
    `<span class="seg-${g.seg}" style="flex-grow:${g.amount}" title="${esc(t(g.key))}: Rs ${fmt(g.amount)}"></span>`).join('');
  const credit = bill.items.find((i) => i.id === 'solar_export');
  el('money-legend').innerHTML = sums.map((g) => `
    <li><i class="dot seg-${g.seg}"></i><span class="${ur ? 'ur' : ''}">${esc(t(g.key))}</span>
    <b class="tnum">Rs ${fmt(g.amount)}</b><em class="tnum">${Math.round((g.amount / whole) * 100)}%</em></li>`).join('')
    + (credit ? `<li class="credit"><i class="dot"></i><span class="${ur ? 'ur' : ''}">${esc(t('solar_title'))}</span><b class="tnum">− Rs ${fmt(-credit.amount)}</b><em></em></li>` : '');
}

// ---------------------------------------------------------------- breakdown

function lineHTML(item, ur) {
  const { t } = app;
  const term = GLOSSARY[item.id];
  return `
    <details class="bill-line kind-${item.kind}" data-id="${item.id}">
      <summary>
        <span class="line-name${ur ? ' ur' : ''}">${esc(ur ? item.name_ur : item.name_en)}</span>
        <span class="line-amt tnum">${item.amount < 0 ? '− ' : ''}Rs ${fmt(Math.abs(item.amount))}</span>
        ${icon('chevron-down', 'line-chev')}
      </summary>
      <div class="line-detail">
        <p class="formula">${esc(item.formula)}</p>
        <p class="line-links">
          ${term ? `<a href="#/learn?term=${term}">${icon('book-2')} ${esc(t('whats_this'))}</a>` : ''}
          ${item.source ? `<a href="${esc(item.source)}" target="_blank" rel="noopener">${esc(t('source'))} ${icon('external-link')}</a>` : ''}
        </p>
      </div>
    </details>`;
}

function renderBreakdown(bill, ur) {
  const { t } = app;
  const defs = [...GROUPS];
  if (bill.items.some((i) => i.id === 'solar_export')) defs.push({ key: 'solar_title', ids: ['solar_export'], seg: 0 });
  const html = defs.map((g) => {
    const items = bill.items.filter((i) => g.ids.includes(i.id));
    if (!items.length) return '';
    const sub = items.reduce((a, i) => a + i.amount, 0);
    return `<div class="cluster">
      <p class="cluster-label${ur ? ' ur' : ''}"><i class="dot seg-${g.seg}"></i>${esc(t(g.key))}</p>
      ${items.map((i) => lineHTML(i, ur)).join('')}
      <div class="cluster-sub"><span class="${ur ? 'ur' : ''}">${esc(t('cluster_subtotal'))}</span><span class="tnum">${sub < 0 ? '− ' : ''}Rs ${fmt(Math.abs(sub))}</span></div>
    </div>`;
  }).join('');
  const known = defs.flatMap((g) => g.ids);
  const rest = bill.items.filter((i) => !known.includes(i.id));
  el('bill-items').innerHTML = html + (rest.length ? `<div class="cluster">${rest.map((i) => lineHTML(i, ur)).join('')}</div>` : '');
  el('bill-total-row').innerHTML = `
    <span class="${ur ? 'ur' : ''}">${esc(t('total_label'))}</span>
    <span class="line-amt tnum">Rs ${fmt(bill.total)}</span>`;
}

function renderWarnings(bill) {
  const { t } = app;
  el('warnings').innerHTML = bill.notices.map((n) => {
    const key = n.code === 'over_cap' ? `notice_over_cap_${n.params.type}` : `notice_${n.code}`;
    const params = { ...n.params, threshold: fmt(n.params.threshold ?? 0) };
    return `<div class="warn-item">${icon('alert-triangle')}<span>${esc(t(key, params))}</span></div>`;
  }).join('');
}

// ---------------------------------------------------------------- insights

function renderInsights(ctx) {
  const { state, t } = app;
  const card = el('insights-card');
  if (isNetMetering() || state.units <= 0) { card.hidden = true; return; }
  const s = state.solar;
  const buyback = s.buyback === '' ? app.tariff.solar.modes.net_billing.buyback_per_kwh : Number(s.buyback);
  const list = buildInsights(ctx, { solarMode: s.enabled ? s.mode : null, buyback }).slice(0, 5);
  card.hidden = list.length === 0;
  el('insights-list').innerHTML = list.map((i) => {
    const p = { ...i.params };
    for (const k of ['extra', 'cost', 'saving', 'total', 'save', 'amount', 'threshold', 'gap']) if (k in p) p[k] = fmt(p[k]);
    if ('rate' in p) p.rate = fmt2(p.rate);
    if ('buy' in p) { p.buy = fmt2(p.buy); p.sell = fmt2(p.sell); }
    if (p.type) p.type = typeName(p.type);
    return `<div class="insight lvl-${i.level}">
      <span class="insight-ic">${icon(i.icon)}</span>
      <div class="insight-body">
        <p>${esc(t(`ins_${i.id}`, p))}</p>
        ${i.action ? `<button class="btn btn-small" type="button" data-set-units="${i.action.units}">${esc(t('ins_set_units', { units: i.action.units }))}</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderCompare(ctx) {
  const { state, t } = app;
  const card = el('compare-card');
  if (isNetMetering()) { card.hidden = true; return; }
  card.hidden = false;
  const rows = compareClasses(ctx);
  const current = rows.find((r) => r.type === state.profile.consumerType);
  el('compare-list').innerHTML = rows.map((r) => {
    const delta = r.applicable && current?.applicable ? r.total - current.total : null;
    return `<div class="cmp-row${r.type === state.profile.consumerType ? ' is-current' : ''}${r.applicable ? '' : ' is-off'}">
      <span class="cmp-name">${esc(typeName(r.type))}</span>
      ${r.applicable
        ? `<b class="tnum">Rs ${fmt(r.total)}</b><em class="tnum ${delta < 0 ? 'good' : delta > 0 ? 'bad' : ''}">${delta === null || delta === 0 ? '' : `${delta < 0 ? '−' : '+'}${fmt(Math.abs(delta))}`}</em>`
        : `<span class="cmp-na">${esc(t('compare_na', { cap: r.cap }))}</span><em></em>`}
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------- audit

function renderAudit(ctx) {
  const { state, t } = app;
  const box = el('audit-result');
  const raw = state.actual;
  if (raw === '' || Number.isNaN(Number(raw)) || Number(raw) <= 0) { box.hidden = true; return; }
  const actual = Number(raw);
  const d = diagnoseBill(ctx, actual);
  const sign = d.diff >= 0 ? '+' : '−';
  const tone = d.verdict === 'match' ? 'ok' : d.verdict === 'explained' ? 'info' : 'warn';
  let html = `
    <div class="verdict v-${tone}">
      ${icon(tone === 'ok' ? 'circle-check' : tone === 'info' ? 'search' : 'alert-circle')}
      <div><b>${esc(t(`verdict_${d.verdict}`))}</b><p>${esc(t(`verdict_${d.verdict}_body`))}</p></div>
    </div>
    <div class="audit-row"><span>${esc(t('audit_computed'))}</span><b class="tnum">Rs ${fmt(d.computed)}</b></div>
    <div class="audit-row"><span>${esc(t('audit_actual'))}</span><b class="tnum">Rs ${fmt(actual)}</b></div>
    <div class="audit-row diff"><span>${esc(t('audit_diff'))}</span><b class="tnum ${d.diff > 0 ? 'neg' : 'pos'}">${sign} Rs ${fmt(Math.abs(d.diff))} (${Math.abs(d.diffPct).toFixed(1)}%)</b></div>`;

  if (d.verdict !== 'match') {
    const found = [];
    for (const m of d.matches) {
      if (m.kind === 'load') found.push(`<li>${esc(t('diag_load', { kw: m.value }))} <button class="btn btn-small" type="button" data-set-load="${m.value}">${esc(t('apply'))}</button></li>`);
      if (m.kind === 'class') found.push(`<li>${esc(t('diag_class', { type: typeName(m.value) }))}</li>`);
      if (m.kind === 'filer') found.push(`<li>${esc(t(m.value ? 'diag_filer_yes' : 'diag_filer_no'))}</li>`);
    }
    if (d.impliedUnits !== state.units && Math.abs(d.impliedUnits - state.units) >= 3) {
      found.push(`<li>${esc(t('diag_units', { units: d.impliedUnits }))}</li>`);
    }
    if (d.impliedFpa !== null && d.impliedFpa >= -3 && d.impliedFpa <= 12) {
      found.push(`<li>${esc(t('diag_fpa', { fpa: fmt2(d.impliedFpa) }))} <button class="btn btn-small" type="button" data-set-fpa="${d.impliedFpa}">${esc(t('apply'))}</button></li>`);
    }
    html += `<p class="audit-explain-title">${esc(t('audit_explain_title'))}</p>
      <ul class="audit-list">${found.join('')}
        <li>${esc(t('audit_e2'))}</li></ul>`;
  }
  box.innerHTML = html;
  box.hidden = false;
}

// ---------------------------------------------------------------- solar

function renderSolar() {
  const { state, t } = app;
  const s = state.solar;
  const nb = s.mode === 'net_billing';
  el('solar-panel').hidden = !s.enabled;
  el('solar-strip').hidden = !s.enabled;
  el('solar-buyback-cell').hidden = !nb;
  el('solar-buyback-peak-cell').hidden = !nb;
  if (!s.enabled) return;

  const mode = app.tariff.solar.modes[s.mode];
  el('solar-mode-note').textContent = state.lang === 'ur' ? mode.note_ur : mode.note_en;
  const withSolar = computeBill(app.ctx(true)).total;
  const without = computeBill(app.ctx(false)).total;
  const saving = Math.max(0, without - withSolar);
  el('solar-with').textContent = `Rs ${fmt(withSolar)}`;
  el('solar-without').textContent = `Rs ${fmt(without)}`;
  el('solar-saving').textContent = `Rs ${fmt(saving)}`;
  const cost = s.cost === '' ? 0 : Number(s.cost);
  if (cost > 0 && saving > 0) {
    const months = Math.ceil(cost / saving);
    el('solar-payback').textContent = t('payback_fmt', { y: Math.floor(months / 12), m: months % 12 });
  } else {
    el('solar-payback').textContent = t('payback_never');
  }
}

// ---------------------------------------------------------------- sharing

function scenarioLink() {
  const { state } = app;
  const q = new URLSearchParams({
    u: state.units, t: state.profile.consumerType, d: state.profile.discoId, k: state.profile.loadKw,
  });
  return `${location.origin}${location.pathname}#/bill?${q}`;
}

function shareText() {
  const { state, t } = app;
  const ctx = app.plainCtx();
  const bill = computeBill(app.ctx());
  const cliff = slabCliffInfo(ctx);
  return t('share_text', {
    units: fmt(state.units),
    total: fmt(bill.total),
    type: typeName(state.profile.consumerType),
    slab: cliff.slabLabel,
    rate: fmt2(bill.effectiveRatePerUnit),
    next: cliff.nextBoundary ?? '-',
    cross: cliff.crossingCost !== null ? fmt(cliff.crossingCost) : '-',
  });
}

async function share() {
  const text = shareText();
  const url = scenarioLink();
  if (navigator.share) {
    try { await navigator.share({ title: 'BijliHisaab', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await copyText(`${text}\n${url}`)) app.toast(app.t('copied'));
}

// ---------------------------------------------------------------- wiring

function wire() {
  el('units-input').addEventListener('input', (e) => {
    app.change((s) => { s.units = num(e.target.value, { max: 2000 }); });
  });
  el('units-slider').addEventListener('input', (e) => setUnits(Number(e.target.value)));
  el('units-minus').addEventListener('click', () => setUnits(app.state.units - 10));
  el('units-plus').addEventListener('click', () => setUnits(app.state.units + 10));

  $$('input[name=ctype]').forEach((r) => r.addEventListener('change', (e) => {
    el('ctype-seg').style.setProperty('--active', $$('input[name=ctype]').indexOf(e.target));
    app.change((s) => { s.profile.consumerType = e.target.value; });
  }));

  el('conn-row').addEventListener('click', () => openSettings());
  el('actual-input').addEventListener('input', (e) => app.change((s) => { s.actual = e.target.value; }));
  el('budget-input').addEventListener('input', (e) => app.change((s) => { s.budget = num(e.target.value); }));
  el('share-btn').addEventListener('click', share);
  el('link-btn').addEventListener('click', async () => {
    if (await copyText(scenarioLink())) app.toast(app.t('link_copied'));
  });

  el('solar-toggle').addEventListener('change', (e) => app.change((s) => { s.solar.enabled = e.target.checked; }));
  const smodes = $$('input[name=smode]');
  smodes.forEach((r) => r.addEventListener('change', (e) => {
    el('solar-mode-seg').style.setProperty('--active', smodes.indexOf(e.target));
    app.change((s) => { s.solar.mode = e.target.value; });
  }));
  const bind = (id, key) => el(id).addEventListener('input', (e) => app.change((s) => {
    s.solar[key] = e.target.value;
    // Registers drive the total grid imports when they're filled.
    if ((key === 'importedPeak' || key === 'importedOffPeak') && registersActive()) {
      s.units = Math.min(2000, (Number(s.solar.importedPeak) || 0) + (Number(s.solar.importedOffPeak) || 0));
    }
  }));
  bind('solar-imp-peak', 'importedPeak');
  bind('solar-imp-off', 'importedOffPeak');
  bind('solar-exp-peak', 'exportedPeak');
  bind('solar-exp-off', 'exportedOffPeak');
  bind('solar-buyback-input', 'buyback');
  bind('solar-buyback-peak', 'buybackPeak');
  bind('solar-cost-input', 'cost');

  // Delegated one-tap actions rendered by insights and the audit.
  document.getElementById('view-bill').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set-units], button[data-set-load], button[data-set-fpa]');
    if (!b) return;
    if (b.dataset.setUnits) setUnits(Number(b.dataset.setUnits));
    if (b.dataset.setLoad) app.change((s) => { s.profile.loadKw = Number(b.dataset.setLoad); });
    if (b.dataset.setFpa) app.change((s) => { s.profile.fpa = String(b.dataset.setFpa); });
  });

  // Sticky mini-total once the hero scrolls away.
  const mini = el('mini-total');
  new IntersectionObserver(([entry]) => {
    const onBill = !el('view-bill').hidden;
    mini.hidden = entry.isIntersecting || !onBill;
  }, { rootMargin: '-56px 0px 0px 0px' }).observe(el('hero'));
}
