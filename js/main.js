import { computeBill, slabCliffInfo, maxUnitsForBudget } from './tariff.js';
import { renderCliffChart } from './chart.js';
import { makeT, fmt, fmt2 } from './i18n.js';

const el = (id) => document.getElementById(id);

const state = {
  lang: localStorage.getItem('bh_lang') || 'en',
  discoId: localStorage.getItem('bh_disco') || 'lesco',
  units: Number(localStorage.getItem('bh_units')) || 300,
  consumerType: localStorage.getItem('bh_type') || 'unprotected',
  loadKw: Number(localStorage.getItem('bh_load')) || 5,
  fpa: localStorage.getItem('bh_fpa') || '',
  onATL: localStorage.getItem('bh_atl') !== '0',
  actual: localStorage.getItem('bh_actual') || '',
  budget: Number(localStorage.getItem('bh_budget')) || 20000,
  theme: localStorage.getItem('bh_theme') || null, // 'light' | 'dark' | null = system
  solar: {
    enabled: localStorage.getItem('bh_solar') === '1',
    mode: localStorage.getItem('bh_solar_mode') || 'net_billing',
    importedPeak: localStorage.getItem('bh_solar_imp_peak') || '',
    importedOffPeak: localStorage.getItem('bh_solar_imp_off') || '',
    exportedPeak: localStorage.getItem('bh_solar_exp_peak') || '',
    exportedOffPeak: localStorage.getItem('bh_solar_exp_off') || '',
    buyback: localStorage.getItem('bh_solar_buyback') || '',
    buybackPeak: localStorage.getItem('bh_solar_buyback_peak') || '',
    cost: localStorage.getItem('bh_solar_cost') || '',
  },
};

// When solar registers are filled, the total imports (state.units) is derived
// as peak + off-peak and the manual units controls step aside.
function registersActive() {
  return state.solar.enabled
    && (state.solar.importedPeak !== '' || state.solar.importedOffPeak !== '');
}

let tariff = null;
let disco = null;
let discos = null;
let t = makeT(state.lang);
let lastTotal = null;

function persist() {
  const flat = {
    bh_lang: state.lang, bh_disco: state.discoId, bh_units: state.units,
    bh_type: state.consumerType, bh_load: state.loadKw, bh_fpa: state.fpa,
    bh_atl: state.onATL ? '1' : '0', bh_actual: state.actual, bh_budget: state.budget,
    bh_theme: state.theme, bh_solar: state.solar.enabled ? '1' : '0',
    bh_solar_mode: state.solar.mode,
    bh_solar_imp_peak: state.solar.importedPeak, bh_solar_imp_off: state.solar.importedOffPeak,
    bh_solar_exp_peak: state.solar.exportedPeak, bh_solar_exp_off: state.solar.exportedOffPeak,
    bh_solar_buyback: state.solar.buyback, bh_solar_buyback_peak: state.solar.buybackPeak,
    bh_solar_cost: state.solar.cost,
  };
  for (const [k, v] of Object.entries(flat)) localStorage.setItem(k, v);
}

function ctx(withSolar = true) {
  const s = state.solar;
  return {
    tariff, disco,
    units: state.units,
    consumerType: state.consumerType,
    loadKw: state.loadKw,
    fpaOverride: state.fpa === '' ? null : Number(state.fpa),
    onATL: state.onATL,
    phase: 'single',
    solar: withSolar && s.enabled
      ? {
          mode: s.mode,
          importedUnits: state.units,
          importedPeak: s.importedPeak === '' ? null : Number(s.importedPeak),
          importedOffPeak: s.importedOffPeak === '' ? null : Number(s.importedOffPeak),
          exportedPeak: s.exportedPeak === '' ? 0 : Number(s.exportedPeak),
          exportedOffPeak: s.exportedOffPeak === '' ? 0 : Number(s.exportedOffPeak),
          buybackPerUnit: s.buyback === '' ? undefined : Number(s.buyback),
          buybackPeakPerUnit: s.buybackPeak === '' ? undefined : Number(s.buybackPeak),
        }
      : null,
  };
}

// ---------------------------------------------------------------- theme

function applyTheme() {
  if (state.theme === 'light' || state.theme === 'dark') {
    document.documentElement.dataset.theme = state.theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function toggleTheme() {
  const dark = state.theme === 'dark'
    || (state.theme === null && matchMedia('(prefers-color-scheme: dark)').matches);
  state.theme = dark ? 'light' : 'dark';
  persist();
  applyTheme();
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
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });
  el('rates-chip').textContent = t('rates_chip', { date: tariff.effective_date });
  el('disclaimer').textContent = t('disclaimer');
  el('data-updated').textContent = t('data_updated', { date: tariff.verified_on });
  el('theme-toggle').setAttribute('aria-label', t('theme_toggle'));
  el('helpline-link').textContent = `${disco.name_en} ${t('audit_helpline')}: ${disco.helpline}`;
  el('helpline-link').href = `tel:${disco.helpline}`;
  el('complaint-link').href = disco.regulator_complaints || 'https://nepra.org.pk/complaints.php';

  // Units label becomes "grid imports" when solar is on.
  document.querySelector('label[for="units-input"]').textContent =
    state.solar.enabled ? t('solar_imports_label') : t('units_label');
  el('units-input').setAttribute('aria-label', state.solar.enabled ? t('solar_imports_label') : t('units_label'));
  el('units-slider').setAttribute('aria-label', state.solar.enabled ? t('solar_imports_label') : t('units_label'));
}

const CLUSTER_DEFS = () => {
  const defs = [
    { label: t('cluster_energy'), ids: ['energy', 'fixed', 'minimum', 'fc_surcharge', 'qta', 'fpa'] },
    { label: t('cluster_taxes'), ids: ['electricity_duty', 'gst', 'tv_fee', 'income_tax'] },
  ];
  if (state.solar.enabled) defs.push({ label: t('solar_title'), ids: ['solar_export'] });
  return defs;
};

function renderResults() {
  const bill = computeBill(ctx());
  const cliff = slabCliffInfo(ctx());
  const cls = tariff.consumer_classes.domestic[state.consumerType];
  const ur = state.lang === 'ur';

  // Hero: total + effective rate + meta chips
  if (lastTotal !== null && lastTotal !== bill.total) {
    const amount = el('total-value');
    amount.classList.remove('pulse');
    void amount.offsetWidth; // restart the animation
    amount.classList.add('pulse');
  }
  lastTotal = bill.total;
  el('total-value').textContent = fmt(bill.total);
  el('effective-rate').textContent = `${t('effective_rate')}: Rs ${fmt2(bill.effectiveRatePerUnit)} ${t('per_unit')}`;
  const typeNames = { unprotected: t('type_unprotected'), protected: t('type_protected'), lifeline: t('type_lifeline') };
  el('bill-head-line').innerHTML = `
    <span class="chip">${typeNames[state.consumerType]}</span>
    <span class="chip tnum">${fmt(state.units)} ${ur ? 'یونٹس' : 'units'}</span>
    <span class="chip tnum">${cliff.slabLabel}</span>`;

  // Bill breakdown, clustered like a statement
  const lineHTML = (item) => `
    <details class="bill-line kind-${item.kind}" data-id="${item.id}">
      <summary>
        <span class="line-name${ur ? ' ur' : ''}">${ur ? item.name_ur : item.name_en}</span>
        <span class="line-amt tnum">${item.amount < 0 ? '− ' : ''}Rs ${fmt(Math.abs(item.amount))}</span>
        <svg class="line-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg>
      </summary>
      <div class="line-detail">
        <p class="formula">${item.formula}</p>
        ${item.source ? `<a href="${item.source}" target="_blank" rel="noopener">${t('source')} <svg aria-hidden="true"><use href="#i-external-link"/></svg></a>` : ''}
      </div>
    </details>`;

  const clusters = CLUSTER_DEFS().map((cd) => {
    const items = bill.items.filter((i) => cd.ids.includes(i.id));
    if (!items.length) return '';
    const subtotal = items.reduce((a, i) => a + i.amount, 0);
    return `<div class="cluster">
      <p class="cluster-label${ur ? ' ur' : ''}">${cd.label}</p>
      ${items.map(lineHTML).join('')}
      <div class="cluster-sub"><span${ur ? ' class="ur"' : ''}>${t('cluster_subtotal')}</span><span class="tnum">Rs ${fmt(subtotal)}</span></div>
    </div>`;
  }).join('');

  // Defensive: anything not covered by a cluster still renders, same style.
  const known = CLUSTER_DEFS().flatMap((c) => c.ids);
  const leftover = bill.items.filter((i) => !known.includes(i.id));
  const extra = leftover.length
    ? `<div class="cluster"><p class="cluster-label${ur ? ' ur' : ''}">${t('cluster_taxes')}</p>${leftover.map(lineHTML).join('')}</div>`
    : '';

  el('bill-items').innerHTML = clusters + extra;
  el('bill-total-row').innerHTML = `
    <span class="${ur ? 'ur' : ''}">${t('total_label')}</span>
    <span class="line-amt tnum">Rs ${fmt(bill.total)}</span>`;

  // Eligibility note under the segmented control
  el('type-note').textContent = ur
    ? (cls.eligibility_ur || cls.mode_note_ur || '') : (cls.eligibility_en || cls.mode_note_en || '');

  // Cliff tiles
  el('cliff-slab').textContent = cliff.slabLabel;
  if (cliff.unitsRemaining !== null) {
    el('cliff-remaining').textContent = fmt(cliff.unitsRemaining);
    el('cliff-crossing').textContent = `+${fmt(cliff.crossingCost)}`;
    el('cliff-next-unit').textContent = `Rs ${fmt2(cliff.marginalCostNextUnit)}`;
    el('cliff-top-note').hidden = true;
    el('cliff-grid').hidden = false;
  } else {
    el('cliff-grid').hidden = true;
    el('cliff-top-note').hidden = false;
  }
  el('cliff-note').textContent = cliff.billingMode === 'telescopic'
    ? (ur ? 'محفوظ صارفین کا بل سلیب بہ سلیب بڑھتا ہے، اوپر والی کھائی آپ پر لاگو نہیں۔' : 'Protected billing is telescopic: each slab only prices its own units, so the cliff does not apply to you.')
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
    const absPct = bill.total > 0 ? Math.abs(diff / bill.total) * 100 : 0;
    auditBox.hidden = false;
    auditBox.innerHTML = `
      <div class="audit-row"><span>${t('audit_computed')}</span><b class="tnum">Rs ${fmt(bill.total)}</b></div>
      <div class="audit-row"><span>${t('audit_actual')}</span><b class="tnum">Rs ${fmt(actual)}</b></div>
      <div class="audit-row diff"><span>${t('audit_diff')}</span><b class="tnum ${diff >= 0 ? 'neg' : 'pos'}">${diff >= 0 ? '+' : '−'} Rs ${fmt(Math.abs(diff))} (${absPct.toFixed(1)}%)</b></div>
      ${absPct <= 3
        ? `<p class="audit-close"><svg aria-hidden="true"><use href="#i-check"/></svg>${t('audit_close')}</p>`
        : `<p class="audit-explain-title">${t('audit_explain_title')}</p>
           <ul class="audit-list"><li>${t('audit_e1')}</li><li>${t('audit_e2')}</li><li>${t('audit_e3')}</li></ul>`}`;
  } else {
    auditBox.hidden = true;
  }

  // Warnings as alert cards
  el('warnings').innerHTML = bill.warnings.map((w) => `
    <div class="warn-item"><svg aria-hidden="true"><use href="#i-alert-triangle"/></svg><span>${w}</span></div>`).join('');

  renderSolar();
}

function renderSolar() {
  const s = state.solar;
  const nb = s.mode === 'net_billing';
  el('solar-panel').hidden = !s.enabled;
  el('solar-card').hidden = !s.enabled;
  el('solar-buyback-row').hidden = !nb;
  el('solar-buyback-peak-row').hidden = !nb;

  // With peak/off-peak registers filled, total imports is derived, so the
  // manual units controls step aside.
  const reg = registersActive();
  el('units-input').readOnly = s.enabled && reg;
  el('units-slider').disabled = s.enabled && reg;
  el('units-plus').disabled = s.enabled && reg;
  el('units-minus').disabled = s.enabled && reg;
  if (!s.enabled) return;

  const mode = tariff.solar.modes[s.mode];
  el('solar-mode-note').textContent = state.lang === 'ur' ? mode.note_ur : mode.note_en;

  const withSolar = computeBill(ctx(true)).total;
  const without = computeBill(ctx(false)).total;
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

function renderChart() {
  renderCliffChart({
    host: el('cliff-chart'),
    ctx: { tariff, disco, loadKw: state.loadKw, fpaOverride: state.fpa === '' ? null : Number(state.fpa), onATL: state.onATL, phase: 'single' },
    consumerType: state.consumerType,
    units: state.units,
    t,
    onDrag: (units) => setUnits(units, { fromChart: true }),
  });
}

// ---------------------------------------------------------------- units state

function setUnits(units, { fromChart = false } = {}) {
  state.units = Math.max(0, Math.min(2000, Math.round(units)));
  el('units-slider').value = Math.min(state.units, 1000);
  el('units-input').value = state.units;
  setSliderFill();
  persist();
  renderResults();
  renderChart();
}

function setSliderFill() {
  const slider = el('units-slider');
  const pct = Math.min(100, (state.units / Number(slider.max)) * 100);
  slider.style.setProperty('--p', `${pct}%`);
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
    next: cliff.nextBoundary ?? '-',
    cross: cliff.crossingCost !== null ? fmt(cliff.crossingCost) : '-',
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
  const span = btn.querySelector('span');
  span.textContent = `✓ ${t('copied')}`;
  setTimeout(() => { span.textContent = t('share_btn'); }, 1600);
}

// ---------------------------------------------------------------- wiring

function wire() {
  el('units-input').addEventListener('input', (e) => {
    state.units = Math.max(0, Math.min(2000, Number(e.target.value) || 0));
    el('units-slider').value = Math.min(state.units, 1000);
    setSliderFill();
    persist(); renderResults(); renderChart();
  });
  el('units-slider').addEventListener('input', (e) => setUnits(Number(e.target.value)));
  el('units-minus').addEventListener('click', () => setUnits(state.units - 10));
  el('units-plus').addEventListener('click', () => setUnits(state.units + 10));

  const seg = el('ctype-seg');
  document.querySelectorAll('input[name=ctype]').forEach((r) => r.addEventListener('change', (e) => {
    state.consumerType = e.target.value;
    seg.style.setProperty('--active', [...document.querySelectorAll('input[name=ctype]')].indexOf(e.target));
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
  el('theme-toggle').addEventListener('click', toggleTheme);
  el('share-btn').addEventListener('click', copyShare);

  el('disco-select').addEventListener('change', async (e) => {
    state.discoId = e.target.value;
    disco = discos.discos.find((d) => d.id === state.discoId);
    if (disco.tariff_set !== tariff.tariff_set) await loadTariff(disco.tariff_set);
    persist(); render();
  });

  el('solar-toggle').addEventListener('change', (e) => {
    state.solar.enabled = e.target.checked;
    persist(); render();
  });
  const smodes = document.querySelectorAll('input[name=smode]');
  smodes.forEach((r) => r.addEventListener('change', (e) => {
    state.solar.mode = e.target.value;
    el('solar-mode-seg').style.setProperty('--active', [...smodes].indexOf(e.target));
    persist(); render();
  }));

  // Peak/off-peak imports drive the derived total (units field).
  const syncImportTotal = () => {
    if (!registersActive()) return;
    state.units = Math.min(2000,
      (Number(state.solar.importedPeak) || 0) + (Number(state.solar.importedOffPeak) || 0));
    el('units-input').value = state.units;
    el('units-slider').value = Math.min(state.units, 1000);
    setSliderFill();
  };
  const bindSolarInput = (id, key, after) => {
    el(id).addEventListener('input', (e) => {
      state.solar[key] = e.target.value;
      if (after) after();
      persist(); renderResults(); renderChart();
    });
  };
  bindSolarInput('solar-imp-peak', 'importedPeak', syncImportTotal);
  bindSolarInput('solar-imp-off', 'importedOffPeak', syncImportTotal);
  bindSolarInput('solar-exp-peak', 'exportedPeak');
  bindSolarInput('solar-exp-off', 'exportedOffPeak');
  bindSolarInput('solar-buyback-input', 'buyback');
  bindSolarInput('solar-buyback-peak', 'buybackPeak');
  bindSolarInput('solar-cost-input', 'cost');
}

// ---------------------------------------------------------------- boot

async function loadTariff(setId) {
  const index = await fetch(`data/tariffs/${setId}/index.json`).then((r) => r.json());
  tariff = await fetch(`data/tariffs/${setId}/${index.default}.json`).then((r) => r.json());
}

async function boot() {
  discos = await fetch('data/discos.json').then((r) => r.json());
  disco = discos.discos.find((d) => d.id === state.discoId)
    || discos.discos.find((d) => d.id === 'lesco');
  state.discoId = disco.id;
  await loadTariff(disco.tariff_set);

  el('disco-select').innerHTML = discos.discos.map((d) =>
    `<option value="${d.id}" ${d.id === state.discoId ? 'selected' : ''}>${d.name_en}</option>`).join('');

  el('units-input').value = state.units;
  el('units-slider').value = Math.min(state.units, 1000);
  setSliderFill();
  const checked = document.querySelector(`input[name=ctype][value=${state.consumerType}]`);
  if (checked) {
    checked.checked = true;
    el('ctype-seg').style.setProperty('--active', [...document.querySelectorAll('input[name=ctype]')].indexOf(checked));
  }
  el('load-input').value = state.loadKw;
  el('fpa-input').value = state.fpa;
  el('atl-input').checked = state.onATL;
  el('actual-input').value = state.actual;
  el('budget-input').value = state.budget;
  el('solar-toggle').checked = state.solar.enabled;
  const smodeChecked = document.querySelector(`input[name=smode][value=${state.solar.mode}]`);
  if (smodeChecked) {
    smodeChecked.checked = true;
    el('solar-mode-seg').style.setProperty('--active', [...document.querySelectorAll('input[name=smode]')].indexOf(smodeChecked));
  }
  el('solar-imp-peak').value = state.solar.importedPeak;
  el('solar-imp-off').value = state.solar.importedOffPeak;
  el('solar-exp-peak').value = state.solar.exportedPeak;
  el('solar-exp-off').value = state.solar.exportedOffPeak;
  el('solar-buyback-input').value = state.solar.buyback;
  el('solar-buyback-peak').value = state.solar.buybackPeak;
  el('solar-cost-input').value = state.solar.cost;

  // Footer source list from the tariff file, provenance stays visible.
  el('source-list').innerHTML = tariff.sources
    .map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`)
    .join('');

  applyTheme();
  wire();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((err) => {
  document.body.innerHTML =
    `<div class="boot-error"><p>Failed to load tariff data (${err.message}). Serve over HTTP, see README.</p></div>`;
});
