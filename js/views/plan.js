// Appliances tab: build a usage profile from what runs in the house and price
// it against the real tariff, cliffs included.

import { app } from '../app.js';
import { variableRate } from '../insights.js';
import { resolve, priceAppliances, applianceKwh } from '../appliances.js';
import { fmt, fmt2 } from '../i18n.js';
import { $, $$, esc, icon, num } from '../ui.js';

let root = null;

const catalog = () => app.appliances.appliances;
const byId = (id) => catalog().find((a) => a.id === id);
const nameOf = (a) => (app.state.lang === 'ur' ? a.name_ur : a.name_en);

export const planView = {
  id: 'plan',

  build() {
    const { t, state } = app;
    const ur = state.lang === 'ur';
    root = document.getElementById('view-plan');
    const groups = app.appliances.groups.map((g) => `
      <section class="card app-group">
        <header class="card-head"><h2>${esc(ur ? g.name_ur : g.name_en)}</h2></header>
        ${catalog().filter((a) => a.group === g.id).map(rowHTML).join('')}
      </section>`).join('');

    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('plan_title'))}</h1><p>${esc(t('plan_sub'))}</p></div>

      <div class="chips" id="pl-presets" role="group" aria-label="${esc(t('plan_presets'))}">
        ${app.appliances.presets.map((p) => `<button class="chip-btn" type="button" data-preset="${p.id}">${esc(ur ? p.name_ur : p.name_en)}</button>`).join('')}
        <button class="chip-btn ghost" type="button" data-preset="__clear">${esc(t('plan_clear'))}</button>
      </div>

      <section class="hero-card compact" id="pl-summary"></section>
      <section class="card" id="pl-ideas" hidden></section>
      ${groups}
      <p class="note">${esc(t('plan_note'))}</p>`;

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    this.update();
  },

  update() {
    if (!root) return;
    const { state, t } = app;
    const ur = state.lang === 'ur';
    const sel = state.plan.sel;
    const picked = Object.keys(sel).map(byId).filter(Boolean);

    // reflect state in the rows
    $$('.app-row', root).forEach((row) => {
      const id = row.dataset.id;
      const on = id in sel;
      row.classList.toggle('is-on', on);
      $('[data-toggle]', row).checked = on;
      $('.app-edit', row).hidden = !on;
      if (on) {
        const r = resolve(byId(id), sel[id]);
        const set = (k, v) => { const i = $(`[data-field=${k}]`, row); if (document.activeElement !== i) i.value = v; };
        set('qty', r.qty); set('hours', r.hours); set('watts', r.watts);
      }
    });

    const summary = $('#pl-summary', root);
    if (!picked.length) {
      summary.innerHTML = `
        <div class="empty on-dark"><span class="empty-ic">${icon('bulb')}</span>
        <h2>${esc(t('plan_empty_title'))}</h2><p>${esc(t('plan_empty_body'))}</p></div>`;
      $('#pl-ideas', root).hidden = true;
      return;
    }

    const items = picked.map((a) => resolve(a, sel[a.id]));
    const total0 = items.reduce((s, r) => s + applianceKwh(r), 0);
    const ctx = app.plainCtx();
    const rate = variableRate(app.plainCtx(Math.round(total0)));
    const priced = priceAppliances(ctx, items, rate);

    // per-row output line
    for (const r of priced.rows) {
      const row = $(`.app-row[data-id=${r.id}]`, root);
      $('.app-out', row).innerHTML =
        `<b>${fmt(r.kwh)}</b> ${esc(t('plan_units_mo'))} · ~Rs ${fmt2(r.rsPerHour)}/${esc(t('plan_hour'))} · ${esc(t('plan_saves_off', { amount: fmt(r.savesIfOff) }))}`;
    }

    // summary: totals, split bar of the biggest consumers, reconciliation with the Bill tab
    const top = priced.rows.slice(0, 4);
    const rest = priced.rows.slice(4).reduce((a, r) => a + r.kwh, 0);
    const parts = [...top.map((r, i) => ({ label: nameOf(byId(r.id)), kwh: r.kwh, seg: i + 1 })),
      ...(rest > 0 ? [{ label: t('plan_other'), kwh: rest, seg: 0 }] : [])];
    const whole = parts.reduce((a, p) => a + p.kwh, 0) || 1;
    const gap = state.units - priced.totalKwh;
    summary.innerHTML = `
      <div class="hero-top"><span class="hero-label">${esc(t('plan_total_label'))}</span>
        <span class="chip">${picked.length} ${esc(t('plan_appliances'))}</span></div>
      <p class="hero-amount"><span class="tnum">${fmt(priced.totalKwh)}</span><span class="hero-cur unit">${esc(t('units_word'))}</span></p>
      <p class="hero-sub tnum">≈ Rs ${fmt(priced.bill)} ${esc(t('plan_per_month'))}</p>
      <div class="moneybar">${parts.map((p) => `<span class="seg-${p.seg}" style="flex-grow:${p.kwh}" title="${esc(p.label)}: ${fmt(p.kwh)}"></span>`).join('')}</div>
      <ul class="money-legend">${parts.map((p) => `
        <li><i class="dot seg-${p.seg}"></i><span class="${ur ? 'ur' : ''}">${esc(p.label)}</span><b class="tnum">${fmt(p.kwh)}</b><em class="tnum">${Math.round((p.kwh / whole) * 100)}%</em></li>`).join('')}</ul>
      <p class="recon">${esc(gap > 15
        ? t('plan_recon_under', { have: fmt(state.units), got: fmt(priced.totalKwh), gap: fmt(gap) })
        : gap < -15 ? t('plan_recon_over', { have: fmt(state.units), got: fmt(priced.totalKwh), gap: fmt(-gap) })
          : t('plan_recon_match', { have: fmt(state.units) }))}</p>
      <div class="hero-actions"><button class="btn btn-volt" type="button" id="pl-use">${icon('arrow-right')}<span>${esc(t('plan_use', { units: fmt(priced.totalKwh) }))}</span></button></div>`;
    $('#pl-use', root).addEventListener('click', () => {
      app.change((s) => { s.units = Math.min(2000, priced.totalKwh); });
      app.go('bill');
    });

    // savings ideas: one hour less a day on the biggest movers
    const ideas = priced.rows.filter((r) => r.hours >= 1 && r.hourLess > 0).sort((a, b) => b.hourLess - a.hourLess).slice(0, 3);
    const host = $('#pl-ideas', root);
    host.hidden = ideas.length === 0;
    host.innerHTML = `<header class="card-head">${icon('sparkles', 'head-ic')}<h2>${esc(t('plan_ideas_title'))}</h2></header>` +
      ideas.map((r) => {
        const a = byId(r.id);
        const kwhLess = Math.round(applianceKwh(r) - applianceKwh({ ...r, hours: r.hours - 1 }));
        return `<div class="insight lvl-tip"><span class="insight-ic app-emoji">${a.emoji}</span>
          <div class="insight-body"><p>${esc(t('plan_idea', { name: nameOf(a), units: kwhLess, amount: fmt(r.hourLess) }))}</p></div></div>`;
      }).join('');
  },
};

function rowHTML(a) {
  const t = app.t;
  const stepper = (field, step, min, max) => `
    <div class="mini-stepper">
      <button type="button" class="step-btn sm" data-step="${field}" data-dir="-1" aria-label="−">${icon('minus')}</button>
      <input type="number" inputmode="decimal" class="tnum" data-field="${field}" min="${min}" max="${max}" step="${step}" aria-label="${esc(t(`plan_${field}`))}">
      <button type="button" class="step-btn sm" data-step="${field}" data-dir="1" aria-label="+">${icon('plus')}</button>
    </div>`;
  return `
    <div class="app-row" data-id="${a.id}">
      <div class="app-main">
        <span class="app-emoji" aria-hidden="true">${a.emoji}</span>
        <div class="app-name"><b class="${app.state.lang === 'ur' ? 'ur' : ''}">${esc(nameOf(a))}</b><span class="app-meta tnum">${a.watts} W</span></div>
        <span class="switch"><input type="checkbox" data-toggle aria-label="${esc(nameOf(a))}"><span class="switch-track"></span></span>
      </div>
      <div class="app-edit" hidden>
        <div class="app-fields">
          <div class="mf"><span>${esc(t('plan_qty'))}</span>${stepper('qty', 1, 1, 20)}</div>
          <div class="mf"><span>${esc(t('plan_hours'))}</span>${stepper('hours', 0.5, 0.1, 24)}</div>
          <div class="mf"><span>${esc(t('plan_watts'))}</span><input type="number" inputmode="numeric" class="tnum wide-in" data-field="watts" min="1" max="10000" step="5" aria-label="${esc(t('plan_watts'))}"></div>
        </div>
        <p class="app-out tnum"></p>
      </div>
    </div>`;
}

const FIELD = { qty: { min: 1, max: 20, step: 1 }, hours: { min: 0.1, max: 24, step: 0.5 }, watts: { min: 1, max: 10000, step: 5 } };

function setField(id, field, value) {
  app.change((s) => {
    const entry = s.plan.sel[id] || {};
    entry[field] = value;
    s.plan.sel[id] = entry;
  });
}

function onClick(e) {
  const preset = e.target.closest('[data-preset]');
  if (preset) {
    const id = preset.dataset.preset;
    app.change((s) => {
      if (id === '__clear') { s.plan.sel = {}; return; }
      const p = app.appliances.presets.find((x) => x.id === id);
      s.plan.sel = Object.fromEntries(Object.entries(p.picks).map(([k, v]) => [k, { ...v }]));
    });
    return;
  }
  const step = e.target.closest('[data-step]');
  if (step) {
    const row = step.closest('.app-row');
    const id = row.dataset.id;
    const f = step.dataset.step;
    const cur = resolve(byId(id), app.state.plan.sel[id])[f];
    const { min, max, step: inc } = FIELD[f];
    const next = Math.round((cur + inc * Number(step.dataset.dir)) * 100) / 100;
    setField(id, f, Math.max(min, Math.min(max, next)));
  }
}

function onInput(e) {
  const input = e.target.closest('input[data-field]');
  if (!input) return;
  const f = input.dataset.field;
  const { min, max } = FIELD[f];
  const v = num(input.value, { min, max, fallback: NaN });
  if (!Number.isNaN(v) && input.value !== '') setField(input.closest('.app-row').dataset.id, f, v);
}

function onChange(e) {
  const tog = e.target.closest('[data-toggle]');
  if (!tog) return;
  const id = tog.closest('.app-row').dataset.id;
  app.change((s) => {
    if (tog.checked) s.plan.sel[id] = s.plan.sel[id] || {};
    else delete s.plan.sel[id];
  });
}
