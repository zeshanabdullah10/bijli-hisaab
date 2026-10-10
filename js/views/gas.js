// Gas tab: the winter half of the household bill. SNGPL / SSGC domestic
// tariff, priced the same way as electricity: every line, every slab line.

import { app } from '../app.js';
import { computeGasBill, gasCliff } from '../gas.js';
import { fmt, fmt2 } from '../i18n.js';
import { $, $$, esc, icon, num, fillSlider } from '../ui.js';

let root = null;
const MAX = 5;

const params = () => {
  const g = app.state.gas;
  return { tariff: app.gasTariff, hm3: g.hm3, isProtected: g.protected, gcv: Number(g.gcv) || undefined };
};

export const gasView = {
  id: 'gas',

  build() {
    const { t, state } = app;
    const T = app.gasTariff;
    const ur = state.lang === 'ur';
    const g = state.gas;
    root = document.getElementById('view-gas');
    const seg = (name, opts, cur) => `
      <div class="seg ${opts.length === 2 ? 'two' : ''}" style="--active:${opts.findIndex((o) => o.v === cur)}">
        <span class="seg-thumb" aria-hidden="true"></span>
        ${opts.map((o) => `<label class="seg-item"><input type="radio" name="${name}" value="${o.v}" ${o.v === cur ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}
      </div>`;
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('gas_title'))}</h1><p>${esc(t('gas_sub'))}</p></div>

      <section class="hero-card" id="gas-hero" aria-live="polite"></section>

      <section class="card scenario">
        <div class="units-block">
          <div class="units-head">
            <label for="gas-hm3" class="units-label">${esc(t('gas_volume'))}</label>
            <div class="stepper">
              <button class="step-btn" type="button" data-gstep="-0.05" aria-label="−">${icon('minus')}</button>
              <input type="number" inputmode="decimal" id="gas-hm3" class="tnum" min="0" max="20" step="0.01" value="${g.hm3}">
              <button class="step-btn" type="button" data-gstep="0.05" aria-label="+">${icon('plus')}</button>
            </div>
          </div>
          <input type="range" id="gas-slider" min="0" max="${MAX}" step="0.01" value="${Math.min(g.hm3, MAX)}" aria-label="${esc(t('gas_volume'))}">
          <div class="slider-scale" id="gas-scale" aria-hidden="true"></div>
        </div>
        ${seg('gas-co', T.companies.map((c) => ({ v: c.id, label: c.name_en })), g.company)}
        <p class="seg-note">${esc(ur ? T.companies.find((c) => c.id === g.company).region_ur : T.companies.find((c) => c.id === g.company).region_en)}</p>
        ${seg('gas-cat', [{ v: 'unprotected', label: t('gas_unprotected') }, { v: 'protected', label: t('gas_protected') }], g.protected ? 'protected' : 'unprotected')}
        <p class="seg-note">${esc(ur ? T.protected_rule_ur : T.protected_rule_en)}</p>
        <div class="row">
          <label class="row-label" for="gas-gcv">${esc(t('gas_gcv'))}</label>
          <input type="number" inputmode="numeric" id="gas-gcv" class="row-input tnum" min="800" max="1200" step="1" placeholder="${T.conversion.default_gcv}" value="${esc(g.gcv)}">
        </div>
        <p class="group-hint">${esc(t('gas_gcv_hint'))}</p>
      </section>

      <div class="insight lvl-warn" id="gas-warn" hidden></div>

      <section class="card">
        <header class="card-head">${icon('receipt', 'head-ic')}<h2>${esc(t('breakdown_title'))}</h2></header>
        <div id="gas-lines"></div>
        <div class="bill-total" id="gas-total"></div>
      </section>

      <section class="card" id="gas-cliff-card">
        <header class="card-head">${icon('trending-up', 'head-ic')}<h2>${esc(t('gas_cliff_title'))}</h2></header>
        <div class="tiles">
          <div class="tile"><span>${esc(t('gas_left'))}</span><b class="tnum" id="gas-left"></b></div>
          <div class="tile warn"><span>${esc(t('cliff_crossing'))}</span><b class="tnum" id="gas-jump"></b></div>
        </div>
        <p class="note" id="gas-cliff-note"></p>
      </section>

      <section class="card">
        <header class="card-head">${icon('flame', 'head-ic')}<h2>${esc(t('gas_tips_title'))}</h2></header>
        <ul class="tips">${['gas_tip1', 'gas_tip2', 'gas_tip3', 'gas_tip4'].map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>
      </section>

      <p class="note">${esc(t('gas_note', { date: T.effective_date }))}</p>
      <details class="sources gas-sources"><summary>${icon('info-circle', 'row-ic')}<span>${esc(t('footer_sources'))}</span></summary>
        <ul>${T.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></details>`;

    const setHm3 = (v) => app.change((s) => { s.gas.hm3 = Math.round(Math.max(0, Math.min(20, v)) * 100) / 100; });
    $('#gas-hm3', root).addEventListener('input', (e) => { const v = num(e.target.value, { max: 20, fallback: NaN }); if (!Number.isNaN(v)) setHm3(v); });
    $('#gas-slider', root).addEventListener('input', (e) => setHm3(Number(e.target.value)));
    $$('[data-gstep]', root).forEach((b) => b.addEventListener('click', () => setHm3(app.state.gas.hm3 + Number(b.dataset.gstep))));
    $('#gas-gcv', root).addEventListener('input', (e) => app.change((s) => { s.gas.gcv = e.target.value; }));
    const bindSeg = (name, fn) => $$(`input[name=${name}]`, root).forEach((r, i, all) => r.addEventListener('change', () => {
      r.closest('.seg').style.setProperty('--active', all.indexOf(r));
      fn(r.value);
    }));
    bindSeg('gas-co', (v) => { app.change((s) => { s.gas.company = v; }); this.build(); });
    bindSeg('gas-cat', (v) => app.change((s) => { s.gas.protected = v === 'protected'; }));

    $('#gas-scale', root).innerHTML = T.slabs.unprotected.filter((s) => s.up_to !== null && s.up_to <= MAX && s.up_to >= 1)
      .map((s) => `<span style="--x:${(s.up_to / MAX) * 100}%"><i></i>${s.up_to}</span>`).join('');
    this.update();
  },

  update() {
    if (!root) return;
    const { t, state } = app;
    const g = state.gas;
    const p = params();
    const b = computeGasBill(p);
    const co = app.gasTariff.companies.find((c) => c.id === g.company);
    if (document.activeElement !== $('#gas-hm3', root)) $('#gas-hm3', root).value = g.hm3;
    $('#gas-slider', root).value = Math.min(g.hm3, MAX);
    fillSlider($('#gas-slider', root), g.hm3, MAX);

    $('#gas-hero', root).innerHTML = `
      <div class="hero-top"><span class="hero-label">${esc(t('gas_estimate'))}</span>
        <span class="chip">${esc(co.name_en)} · ${fmt2(g.hm3)} hm³ · ${esc(t(b.category === 'protected' ? 'gas_protected' : 'gas_unprotected'))}</span></div>
      <p class="hero-amount"><span class="hero-cur">Rs</span><span class="tnum">${fmt(b.total)}</span></p>
      <p class="hero-sub tnum">${esc(t('gas_mmbtu', { mm: fmt2(b.mmbtu), rate: fmt(b.slab.rate) }))}</p>`;

    const warn = $('#gas-warn', root);
    warn.hidden = !b.lostProtection;
    warn.innerHTML = b.lostProtection
      ? `<span class="insight-ic">${icon('alert-triangle')}</span><div class="insight-body"><p>${esc(t('gas_lost_protection'))}</p></div>` : '';

    const names = { gas: t('gas_line_gas'), fixed: t('gas_line_fixed'), meter_rent: t('gas_line_rent'), gst: t('gas_line_gst') };
    $('#gas-lines', root).innerHTML = b.items.map((i) => `
      <details class="bill-line">
        <summary><span class="line-name">${esc(names[i.id])}</span><span class="line-amt tnum">Rs ${fmt(i.amount)}</span>${icon('chevron-down', 'line-chev')}</summary>
        <div class="line-detail"><p class="formula">${esc(i.formula)}</p>
          ${i.id === 'gst' ? `<p class="formula">${esc(t('gas_gst_unverified'))}</p>` : ''}</div>
      </details>`).join('');
    $('#gas-total', root).innerHTML = `<span>${esc(t('gas_estimate'))}</span><span class="line-amt tnum">Rs ${fmt(b.total)}</span>`;

    const c = gasCliff(p);
    $('#gas-cliff-card', root).hidden = c.next === null;
    if (c.next !== null) {
      $('#gas-left', root).textContent = `${fmt2(c.left)} hm³`;
      $('#gas-jump', root).textContent = `+Rs ${fmt(c.jump)}`;
      $('#gas-cliff-note', root).textContent = t('gas_cliff_note', { line: c.next, at: fmt(c.atLine), jump: fmt(c.jump) });
    }
  },
};
