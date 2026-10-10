// "Is solar worth it?" — compare system sizes for this household against the
// real tariff, on the net-billing terms new connections get.

import { app } from '../app.js';
import { sizeOptions } from '../solar.js';
import { historyStats } from '../tracker.js';
import { fmt } from '../i18n.js';
import { esc, icon, num, openSheet, wireSheet } from '../ui.js';

const SHARES = ['evening', 'mixed', 'daytime'];

export function openSolarSizer() {
  const { t, state } = app;
  const data = app.solarData;
  const ur = state.lang === 'ur';
  const hist = state.bills.length >= 3 ? historyStats(state.bills) : null;
  const inp = {
    units: hist ? hist.avgUnits : state.units,
    city: data.disco_city[state.profile.discoId] || data.cities[0].id,
    share: 'mixed',
    cost: data.cost_per_kw.default,
  };
  const buyback = state.solar.buyback === '' ? app.tariff.solar.modes.net_billing.buyback_per_kwh : Number(state.solar.buyback);
  const dlg = document.getElementById('close-sheet');
  dlg.innerHTML = `
    <div class="sheet-body">
      <header class="sheet-head"><h2 id="close-title">${esc(t('ss_title'))}</h2>
        <button class="icon-btn small" type="button" data-close aria-label="${esc(t('close'))}">${icon('x')}</button></header>
      <p class="note tight">${esc(t('ss_sub', { buyback }))}</p>
      <div class="group">
        <div class="row"><label class="row-label" for="ss-units">${esc(t(hist ? 'ss_units_hist' : 'ss_units'))}</label>
          <input type="number" inputmode="numeric" id="ss-units" class="row-input tnum" min="1" max="3000" value="${inp.units}"></div>
        <div class="row"><label class="row-label" for="ss-city">${esc(t('ss_city'))}</label>
          <select id="ss-city" class="row-select">${data.cities.map((c) => `<option value="${c.id}" ${c.id === inp.city ? 'selected' : ''}>${esc(ur ? c.name_ur : c.name_en)}</option>`).join('')}</select></div>
        <div class="row"><label class="row-label" for="ss-cost">${esc(t('ss_cost'))}</label>
          <input type="number" inputmode="numeric" id="ss-cost" class="row-input tnum" min="0" step="5000" value="${inp.cost}"></div>
      </div>
      <p class="sheet-label">${esc(t('ss_when'))}</p>
      <div class="seg" id="ss-seg" style="--active:${SHARES.indexOf(inp.share)}">
        <span class="seg-thumb" aria-hidden="true"></span>
        ${SHARES.map((k) => `<label class="seg-item"><input type="radio" name="ss-share" value="${k}" ${k === inp.share ? 'checked' : ''}><span>${esc(t(`ss_share_${k}`))}</span></label>`).join('')}
      </div>
      <p class="seg-note" id="ss-share-note"></p>
      <div id="ss-out" aria-live="polite"></div>
      <p class="group-hint">${esc(t('ss_assume', { low: fmt(data.cost_per_kw.low), high: fmt(data.cost_per_kw.high) }))}</p>
      <ul class="ss-sources">${data.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul>
    </div>`;
  wireSheet(dlg);

  const render = () => {
    const share = data.daytime_share[inp.share];
    dlg.querySelector('#ss-share-note').textContent = t('ss_share_note', { pct: Math.round(share * 100) });
    const city = data.cities.find((c) => c.id === inp.city);
    const yieldPerKw = city.kwh_per_kwp_year / 12;
    const { rows, best } = sizeOptions(app.plainCtx(), {
      units: inp.units, yieldPerKw, daytimeShare: share, mode: 'net_billing', buyback, costPerKw: inp.cost,
    }, data.sizes_kw);
    const without = rows[0]?.without ?? 0;
    const pay = (m) => (m === null ? t('payback_never') : t('payback_fmt', { y: Math.floor(m / 12), m: m % 12 }));
    dlg.querySelector('#ss-out').innerHTML = `
      <p class="ss-now tnum">${esc(t('ss_now', { units: fmt(inp.units), bill: fmt(without) }))}</p>
      <div class="ss-rows">${rows.map((r) => `
        <div class="ss-row${r.kw === best ? ' is-best' : ''}">
          <div class="ss-kw"><b class="tnum">${r.kw}</b><span>kW</span></div>
          <div class="ss-body">
            <p class="ss-main tnum">${esc(t('ss_bill', { bill: fmt(r.bill) }))} <span class="ss-save">${esc(t('ss_saves', { saving: fmt(r.saving) }))}</span></p>
            <p class="ss-sub tnum">${esc(t('ss_flows', { gen: fmt(r.generated), self: fmt(r.selfUsed), exp: fmt(r.exported) }))}</p>
          </div>
          <div class="ss-pay"><span>${esc(t('solar_payback'))}</span><b class="tnum">${esc(pay(r.paybackMonths))}</b>
            ${r.kw === best ? `<em class="tag good">${esc(t('ss_best'))}</em>` : ''}</div>
        </div>`).join('')}</div>`;
  };

  dlg.querySelector('#ss-units').addEventListener('input', (e) => { inp.units = num(e.target.value, { min: 1, max: 3000, fallback: inp.units }); render(); });
  dlg.querySelector('#ss-cost').addEventListener('input', (e) => { inp.cost = num(e.target.value, { min: 0, max: 1000000, fallback: 0 }); render(); });
  dlg.querySelector('#ss-city').addEventListener('change', (e) => { inp.city = e.target.value; render(); });
  dlg.querySelectorAll('input[name=ss-share]').forEach((r) => r.addEventListener('change', () => {
    inp.share = r.value;
    dlg.querySelector('#ss-seg').style.setProperty('--active', SHARES.indexOf(inp.share));
    render();
  }));
  render();
  openSheet(dlg);
}
