import { computeBill, slabCliffInfo, maxUnitsForBudget } from './tariff.js';
import { renderCliffChart } from './chart.js';
import { makeT, fmt, fmt2 } from './i18n.js';

const el = (id) => document.getElementById(id);

const state = {
  lang: localStorage.getItem('bh_lang') || 'en',
  units: Number(localStorage.getItem('bh_units')) || 300,
  consumerType: localStorage.getItem('bh_type') || 'unprotected',
  loadKw: Number(localStorage.getItem('bh_load')) || 5,
  fpa: localStorage.getItem('bh_fpa') || '',
  onATL: localStorage.getItem('bh_atl') !== '0',
  actual: localStorage.getItem('bh_actual') || '',
  budget: Number(localStorage.getItem('bh_budget')) || 20000,
};

let tariff = null;
let disco = null;
let t = makeT(state.lang);

function persist() {
  for (const [k, key] of [
    ['lang', 'bh_lang'], ['units', 'bh_units'], ['consumerType', 'bh_type'],
    ['loadKw', 'bh_load'], ['fpa', 'bh_fpa'], ['onATL', 'bh_atl'],
    ['actual', 'bh_actual'], ['budget', 'bh_budget'],
  ]) localStorage.setItem(key, state[k]);
}

function ctx() {
  return {
    tariff, disco,
    units: state.units,
    consumerType: state.consumerType,
    loadKw: state.loadKw,
    fpaOverride: state.fpa === '' ? null : Number(state.fpa),
    onATL: state.onATL,
    phase: 'single',
  };
}

// ---------------------------------------------------------------- rendering

function render() {
  t = makeT(state.lang);
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ur' ? 'rtl' : 'ltr';
  applyStaticTexts();
  renderResults();
  renderChart();
}

function applyStaticTexts() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  el('rates-chip').textContent = t('rates_chip', { date: tariff.effective_date });
  el('disclaimer').textContent = t('disclaimer');
  el('data-updated').textContent = t('data_updated', { date: tariff.verified_on });
  el('helpline-link').textContent = `${t('audit_helpline')}: ${disco.helpline}`;
}

function renderResults() {
  const bill = computeBill(ctx());
  const cliff = slabCliffInfo(ctx());
  const cls = tariff.consumer_classes.domestic[state.consumerType];

  el('total-value').textContent = `Rs ${fmt(bill.total)}`;
  el('effective-rate').textContent = `${t('effective_rate')}: Rs ${fmt2(bill.effectiveRatePerUnit)} ${t('per_unit')}`;

  // Bill-style breakdown
  const typeNames = { unprotected: t('type_unprotected'), protected: t('type_protected'), lifeline: t('type_lifeline') };
  el('bill-head-line').textContent = `${typeNames[state.consumerType]} · ${fmt(state.units)} ${state.lang === 'ur' ? 'یونٹس' : 'units'} · ${cliff.slabLabel}`;
  el('bill-items').innerHTML = bill.items.map((item) => `
    <details class="bill-line kind-${item.kind}" data-id="${item.id}">
      <summary>
        <span class="line-name ${state.lang === 'ur' ? 'ur' : ''}">${state.lang === 'ur' ? item.name_ur : item.name_en}</span>
        <span class="line-amt">Rs ${fmt(item.amount)}</span>
      </summary>
      <div class="line-detail">
        <p class="formula">${item.formula}</p>
        ${item.source ? `<a href="${item.source}" target="_blank" rel="noopener">${t('source')} ↗</a>` : ''}
      </div>
    </details>`).join('');
  el('bill-total-row').innerHTML = `
    <span>${t('total_label')}</span>
    <span class="line-amt total-amt">Rs ${fmt(bill.total)}</span>`;

  // Eligibility note under the type selector
  const elig = cls.eligibility_en || cls.mode_note_en;
  el('type-note').textContent = state.lang === 'ur'
    ? (cls.eligibility_ur || cls.mode_note_ur || '') : (elig || '');

  // Cliff card
  el('cliff-slab').textContent = cliff.slabLabel;
  if (cliff.unitsRemaining !== null) {
    el('cliff-remaining').textContent = `${fmt(cliff.unitsRemaining)}`;
    el('cliff-crossing').textContent = `+ Rs ${fmt(cliff.crossingCost)}`;
    el('cliff-next-unit').textContent = `Rs ${fmt2(cliff.marginalCostNextUnit)}`;
    el('cliff-top-note').hidden = true;
    el('cliff-grid').hidden = false;
  } else {
    el('cliff-grid').hidden = true;
    el('cliff-top-note').hidden = false;
  }
  el('cliff-note').textContent = cliff.billingMode === 'telescopic'
    ? (state.lang === 'ur' ? 'محفوظ صارفین کا بل سلیب بہ سلیب بڑھتا ہے — اوپر والی کھائی آپ پر لاگو نہیں۔' : 'Protected billing is telescopic — each slab only prices its own units, so the cliff above does not apply to you.')
    : t('cliff_note');

  // Budget planner
  const maxU = maxUnitsForBudget(ctx(), state.budget);
  el('budget-result').textContent = maxU === 0
    ? t('budget_too_small')
    : t('budget_result', { units: fmt(maxU) });

  // Audit box
  const auditBox = el('audit-result');
  if (state.actual !== '' && !Number.isNaN(Number(state.actual))) {
    const actual = Number(state.actual);
    const diff = actual - bill.total;
    const pct = bill.total > 0 ? (diff / bill.total) * 100 : 0;
    const absPct = Math.abs(pct);
    auditBox.hidden = false;
    auditBox.innerHTML = `
      <div class="audit-row"><span>${t('audit_computed')}</span><b>Rs ${fmt(bill.total)}</b></div>
      <div class="audit-row"><span>${t('audit_actual')}</span><b>Rs ${fmt(actual)}</b></div>
      <div class="audit-row diff"><span>${t('audit_diff')}</span><b class="${diff >= 0 ? 'neg' : 'pos'}">${diff >= 0 ? '+' : '−'} Rs ${fmt(Math.abs(diff))} (${absPct.toFixed(1)}%)</b></div>
      ${absPct <= 3 ? `<p class="audit-close">✓ ${t('audit_close')}</p>` : `
        <p class="audit-explain-title">${t('audit_explain_title')}</p>
        <ul class="audit-list"><li>${t('audit_e1')}</li><li>${t('audit_e2')}</li><li>${t('audit_e3')}</li></ul>`}`;
  } else {
    auditBox.hidden = true;
  }

  const warn = el('warnings');
  warn.innerHTML = bill.warnings.map((w) => `<p class="warn">${w}</p>`).join('');
}

function renderChart() {
  renderCliffChart({
    host: el('cliff-chart'),
    ctx: { tariff, disco, loadKw: state.loadKw, fpaOverride: state.fpa === '' ? null : Number(state.fpa), onATL: state.onATL, phase: 'single' },
    consumerType: state.consumerType,
    units: state.units,
    t,
  });
}

// ---------------------------------------------------------------- share card

function shareText() {
  const bill = computeBill(ctx());
  const cliff = slabCliffInfo(ctx());
  const typeNames = { unprotected: t('type_unprotected'), protected: t('type_protected'), lifeline: t('type_lifeline') };
  return t('share_text', {
    units: fmt(state.units),
    total: fmt(bill.total),
    type: typeNames[state.consumerType],
    slab: cliff.slabLabel,
    rate: fmt2(bill.effectiveRatePerUnit),
    next: cliff.nextBoundary ?? '—',
    cross: cliff.crossingCost !== null ? fmt(cliff.crossingCost) : '—',
  });
}

async function copyShare() {
  const btn = el('share-btn');
  try {
    await navigator.clipboard.writeText(shareText());
  } catch {
    const ta = document.createElement('textarea');
    ta.value = shareText();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  btn.textContent = `✓ ${t('copied')}`;
  setTimeout(() => { btn.textContent = t('share_btn'); }, 1600);
}

// ---------------------------------------------------------------- wiring

function wire() {
  el('units-input').addEventListener('input', (e) => {
    state.units = Math.max(0, Math.min(2000, Number(e.target.value) || 0));
    el('units-slider').value = state.units;
    persist(); renderResults(); renderChart();
  });
  el('units-slider').addEventListener('input', (e) => {
    state.units = Number(e.target.value);
    el('units-input').value = state.units;
    persist(); renderResults(); renderChart();
  });
  document.querySelectorAll('input[name=ctype]').forEach((r) => r.addEventListener('change', (e) => {
    state.consumerType = e.target.value;
    persist(); renderResults(); renderChart();
  }));
  el('load-input').addEventListener('input', (e) => {
    state.loadKw = Math.max(0, Number(e.target.value) || 0);
    persist(); renderResults(); renderChart();
  });
  el('fpa-input').addEventListener('input', (e) => {
    state.fpa = e.target.value;
    persist(); renderResults(); renderChart();
  });
  el('atl-input').addEventListener('change', (e) => {
    state.onATL = e.target.checked;
    persist(); renderResults(); renderChart();
  });
  el('actual-input').addEventListener('input', (e) => {
    state.actual = e.target.value;
    persist(); renderResults();
  });
  el('budget-input').addEventListener('input', (e) => {
    state.budget = Math.max(0, Number(e.target.value) || 0);
    persist(); renderResults();
  });
  el('lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'ur' : 'en';
    persist(); render();
  });
  el('share-btn').addEventListener('click', copyShare);
}

// ---------------------------------------------------------------- boot

async function boot() {
  const [discos, index] = await Promise.all([
    fetch('data/discos.json').then((r) => r.json()),
    fetch('data/tariffs/lesco/index.json').then((r) => r.json()),
  ]);
  disco = discos.discos.find((d) => d.id === 'lesco');
  tariff = await fetch(`data/tariffs/lesco/${index.default}.json`).then((r) => r.json());

  el('units-input').value = state.units;
  el('units-slider').value = state.units;
  document.querySelector(`input[name=ctype][value=${state.consumerType}]`).checked = true;
  el('load-input').value = state.loadKw;
  el('fpa-input').value = state.fpa;
  el('atl-input').checked = state.onATL;
  el('actual-input').value = state.actual;
  el('budget-input').value = state.budget;

  // Footer source list from the tariff file — provenance stays visible.
  el('source-list').innerHTML = tariff.sources
    .map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`)
    .join('');

  wire();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((err) => {
  document.getElementById('app').innerHTML =
    `<div class="boot-error"><p>Failed to load tariff data (${err.message}). Serve over HTTP — see README.</p></div>`;
});
