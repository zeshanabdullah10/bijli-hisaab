// Track tab: a live meter tracker for the current billing cycle, and a log of
// past bills with trend and protection-streak tracking.

import { app } from '../app.js';
import { computeBill } from '../tariff.js';
import { billAt } from '../insights.js';
import { analyzeCycle, allowanceFor, underLimitStreak, historyStats, isoDate } from '../tracker.js';
import { fmt } from '../i18n.js';
import { $, $$, esc, icon, num, niceDate, download, openSheet, wireSheet } from '../ui.js';

let root = null;
let sub = 'cycle';
let selectedBar = null;

const today = () => isoDate();
const prevMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return isoDate(d).slice(0, 7);
};
const boundaries = () => app.tariff.consumer_classes.domestic.unprotected.slabs
  .map((s) => s.up_to).filter((u) => u !== null);

export const trackView = {
  id: 'track',

  build() {
    const { t } = app;
    root = document.getElementById('view-track');
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('track_title'))}</h1><p>${esc(t('track_sub'))}</p></div>
      <div class="seg two" id="track-seg" role="tablist" style="--active:${sub === 'cycle' ? 0 : 1}">
        <span class="seg-thumb" aria-hidden="true"></span>
        <label class="seg-item"><input type="radio" name="tsub" value="cycle" ${sub === 'cycle' ? 'checked' : ''}><span>${esc(t('sub_cycle'))}</span></label>
        <label class="seg-item"><input type="radio" name="tsub" value="history" ${sub === 'history' ? 'checked' : ''}><span>${esc(t('sub_history'))}</span></label>
      </div>
      <div id="track-cycle" class="stack"></div>
      <div id="track-history" class="stack" hidden></div>`;
    $$('input[name=tsub]', root).forEach((r) => r.addEventListener('change', (e) => {
      sub = e.target.value;
      $('#track-seg', root).style.setProperty('--active', sub === 'cycle' ? 0 : 1);
      showSub();
    }));
    buildCycle();
    buildHistory();
    showSub();
    this.update();
  },

  update() {
    if (!root) return;
    updateCycle();
    updateHistory();
  },
};

function showSub() {
  $('#track-cycle', root).hidden = sub !== 'cycle';
  $('#track-history', root).hidden = sub !== 'history';
}

// ================================================================ cycle

function buildCycle() {
  const { t } = app;
  $('#track-cycle', root).innerHTML = `
    <section class="card" id="cy-setup">
      <div class="empty">
        <span class="empty-ic">${icon('calendar-stats')}</span>
        <h2>${esc(t('cy_empty_title'))}</h2>
        <p>${esc(t('cy_empty_body'))}</p>
      </div>
      <div class="form-grid">
        <div class="field"><label for="cy-start-date">${esc(t('cy_start_date'))}</label><input type="date" id="cy-start-date" max="${today()}" value="${today()}"></div>
        <div class="field"><label for="cy-start-reading">${esc(t('cy_start_reading'))}</label><input type="number" inputmode="decimal" id="cy-start-reading" class="tnum" min="0" step="1" placeholder="e.g. 14250"></div>
        <div class="field"><label for="cy-days">${esc(t('cy_days'))}</label><input type="number" inputmode="numeric" id="cy-days" class="tnum" min="20" max="40" step="1" value="30"></div>
      </div>
      <p class="form-err" id="cy-setup-err" hidden></p>
      <button class="btn btn-primary" id="cy-start" type="button">${esc(t('cy_start_btn'))}</button>
    </section>

    <div id="cy-live" class="stack" hidden>
      <section class="card summary" id="cy-summary"></section>
      <section class="card" id="cy-plan"></section>
      <section class="card">
        <header class="card-head">${icon('plus', 'head-ic')}<h2>${esc(t('cy_add_title'))}</h2></header>
        <div class="form-grid two">
          <div class="field"><label for="cy-date">${esc(t('cy_date'))}</label><input type="date" id="cy-date" max="${today()}" value="${today()}"></div>
          <div class="field"><label for="cy-reading">${esc(t('cy_reading'))}</label><input type="number" inputmode="decimal" id="cy-reading" class="tnum" min="0" step="1"></div>
        </div>
        <p class="form-err" id="cy-err" hidden></p>
        <button class="btn btn-primary" id="cy-add" type="button">${icon('plus')}<span>${esc(t('cy_add_btn'))}</span></button>
        <div id="cy-readings"></div>
      </section>
      <div class="action-row">
        <button class="btn btn-secondary" id="cy-use" type="button">${icon('arrow-right')}<span>${esc(t('cy_use_in_bill'))}</span></button>
        <button class="btn btn-secondary" id="cy-close" type="button">${icon('flag')}<span>${esc(t('cy_close'))}</span></button>
        <button class="btn btn-ghost" id="cy-restart" type="button">${icon('rotate')}<span>${esc(t('cy_restart'))}</span></button>
      </div>
    </div>`;

  $('#cy-start', root).addEventListener('click', startCycle);
  $('#cy-add', root).addEventListener('click', addReading);
  $('#cy-reading', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') addReading(); });
  $('#cy-use', root).addEventListener('click', () => {
    const c = cycleInfo();
    if (c.status !== 'ok') return;
    app.change((s) => { s.units = Math.min(2000, c.projected); });
    app.go('bill');
  });
  $('#cy-close', root).addEventListener('click', openCloseSheet);
  $('#cy-restart', root).addEventListener('click', () => {
    if (confirm(app.t('cy_restart_confirm'))) {
      app.change((s) => { s.cycle = { startDate: '', startReading: '', cycleDays: 30, readings: [] }; });
    }
  });
  $('#cy-readings', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-del-reading]');
    if (!b) return;
    app.change((s) => { s.cycle.readings = s.cycle.readings.filter((r) => r.date !== b.dataset.delReading); });
  });
}

const cycleInfo = () => analyzeCycle({ ...app.state.cycle, cycleDays: app.state.cycle.cycleDays || 30, today: today() });

function startCycle() {
  const { t } = app;
  const date = $('#cy-start-date', root).value;
  const reading = $('#cy-start-reading', root).value;
  const err = $('#cy-setup-err', root);
  if (!date || reading === '' || Number(reading) < 0) {
    err.textContent = t('err_need_reading');
    err.hidden = false;
    return;
  }
  err.hidden = true;
  app.change((s) => {
    s.cycle = { startDate: date, startReading: Number(reading), cycleDays: num($('#cy-days', root).value, { min: 20, max: 40, fallback: 30 }), readings: [] };
  });
}

function addReading() {
  const { t, state } = app;
  const c = state.cycle;
  const date = $('#cy-date', root).value;
  const raw = $('#cy-reading', root).value;
  const err = $('#cy-err', root);
  const fail = (key) => { err.textContent = t(key); err.hidden = false; };
  if (!date || raw === '') return fail('err_need_reading');
  const reading = Number(raw);
  const last = analyzeCycle({ ...c, today: today() });
  const prev = last.valid?.at(-1) || { date: c.startDate, reading: Number(c.startReading) };
  if (date > today()) return fail('err_future');
  if (date <= prev.date) return fail('err_date_order');
  if (reading < prev.reading) return fail('err_reading_lower');
  err.hidden = true;
  app.change((s) => { s.cycle.readings.push({ date, reading }); });
  $('#cy-reading', root).value = '';
  app.toast(t('cy_added'));
}

function updateCycle() {
  const { state, t } = app;
  const has = !!state.cycle.startDate;
  $('#cy-setup', root).hidden = has;
  $('#cy-live', root).hidden = !has;
  if (!has) return;

  const c = cycleInfo();
  const ur = state.lang === 'ur';
  const bounds = boundaries();

  // ---- summary
  let head;
  if (c.status === 'ok') {
    const bill = billAt(app.plainCtx(), c.projected);
    const axisMax = (bounds.find((b) => b > Math.max(c.projected, c.used)) ?? Math.ceil(Math.max(c.projected, c.used) / 100) * 100 + 100);
    const pct = (v) => Math.min(100, (v / axisMax) * 100);
    const ticks = bounds.filter((b) => b <= axisMax)
      .map((b) => `<span class="gauge-tick" style="--x:${pct(b)}%"><i></i>${b}</span>`).join('');
    const trend = { up: 'trend_up', down: 'trend_down', steady: 'trend_steady' }[c.trend];
    head = `
      <p class="summary-label">${esc(t('cy_onpace'))}</p>
      <p class="summary-big"><span class="tnum">${fmt(c.projected)}</span> <small>${esc(t('units_word'))}</small></p>
      <p class="summary-sub tnum">≈ Rs ${fmt(bill)} · ${esc(t('cy_ends', { date: niceDate(c.endDate, state.lang, { year: false }) }))}</p>
      <div class="gauge" role="img" aria-label="${esc(t('cy_used'))} ${c.used} / ${c.projected}">
        <div class="gauge-track">
          <span class="gauge-proj" style="width:${pct(c.projected)}%"></span>
          <span class="gauge-used" style="width:${pct(c.used)}%"></span>
        </div>
        <div class="gauge-ticks">${ticks}</div>
      </div>
      <div class="tiles four">
        <div class="tile"><span>${esc(t('cy_used'))}</span><b class="tnum">${fmt(c.used)}</b></div>
        <div class="tile"><span>${esc(t('cy_day_of'))}</span><b class="tnum">${c.daysElapsed}/${c.cycleDays}</b></div>
        <div class="tile"><span>${esc(t('cy_pace'))}</span><b class="tnum">${c.avgPerDay}</b></div>
        <div class="tile ${c.trend === 'up' ? 'warn' : c.trend === 'down' ? 'good' : ''}"><span>${esc(t('cy_recent'))}</span><b class="tnum">${c.recentPerDay}</b></div>
      </div>
      <p class="trend-note t-${c.trend}">${esc(t(trend, { projected: fmt(c.projectedRecent) }))}</p>
      ${c.stale ? `<p class="stale-note">${icon('alert-circle')}${esc(t('cy_stale'))}</p>` : ''}`;
  } else {
    head = `
      <p class="summary-label">${esc(t('cy_waiting'))}</p>
      <p class="summary-sub">${esc(t('cy_need_more', { reading: fmt(state.cycle.startReading), date: niceDate(state.cycle.startDate, state.lang) }))}</p>`;
  }
  $('#cy-summary', root).innerHTML = head;

  // ---- pace plan
  renderPlan(c, bounds, ur);

  // ---- readings
  const rows = [
    { date: state.cycle.startDate, reading: Number(state.cycle.startReading), start: true },
    ...[...state.cycle.readings].sort((a, b) => b.date.localeCompare(a.date)),
  ];
  const ignored = new Set((c.ignored || []).map((r) => r.date));
  $('#cy-readings', root).innerHTML = `<ul class="list">${rows.map((r) => `
    <li class="${ignored.has(r.date) ? 'is-ignored' : ''}">
      <span>${esc(niceDate(r.date, state.lang))}${r.start ? ` <em class="tag">${esc(t('cy_opening'))}</em>` : ''}${ignored.has(r.date) ? ` <em class="tag warn">${esc(t('cy_ignored'))}</em>` : ''}</span>
      <b class="tnum">${fmt(r.reading)}</b>
      ${r.start ? '<span class="list-gap"></span>' : `<button class="icon-btn small" type="button" data-del-reading="${esc(r.date)}" aria-label="${esc(t('delete'))}">${icon('trash')}</button>`}
    </li>`).join('')}</ul>`;
}

function renderPlan(c, bounds, ur) {
  const { t } = app;
  const host = $('#cy-plan', root);
  if (c.status !== 'ok') { host.hidden = true; return; }
  host.hidden = false;
  const ctx = app.plainCtx();
  const projBill = billAt(ctx, c.projected);

  if (c.daysLeft === 0) {
    host.innerHTML = `<header class="card-head">${icon('flag', 'head-ic')}<h2>${esc(t('cy_done_title'))}</h2></header>
      <p class="note">${esc(t('cy_done_body', { units: fmt(c.used), bill: fmt(billAt(ctx, c.used)) }))}</p>`;
    return;
  }

  // Limits worth steering by: the two boundaries below the projection, and the
  // one just above it (the cliff you could still fall off).
  const below = bounds.filter((b) => b < c.projected && b > c.used).slice(-2);
  const above = bounds.find((b) => b >= c.projected);
  const limits = [...below, ...(above ? [above] : [])];
  const rows = limits.map((limit) => {
    const a = allowanceFor(limit, c);
    const bill = billAt(ctx, limit);
    const spare = limit - c.projected;
    let tone; let note;
    if (a.over > 0) { tone = 'off'; note = t('cy_passed', { over: fmt(a.over) }); }
    else if (spare >= 0) { tone = 'ok'; note = t('cy_spare', { n: fmt(spare) }); }
    else { tone = a.perDay < c.avgPerDay * 0.6 ? 'hard' : 'doable'; note = t('cy_cut', { pct: Math.round((1 - a.perDay / c.avgPerDay) * 100) }); }
    const save = projBill - bill;
    return `<div class="plan-row tone-${tone}">
      <div class="plan-limit"><b class="tnum">${limit}</b><span>${esc(t('units_word'))}</span></div>
      <div class="plan-body">
        <p class="plan-main">${a.perDay !== null ? `<b class="tnum">${a.perDay}</b> ${esc(t('cy_per_day'))}` : esc(note)}</p>
        <p class="plan-sub">${esc(note)}${save > 0 && a.over === 0 && spare < 0 ? ` · ${esc(t('cy_saves', { amount: fmt(save) }))}` : ''}</p>
      </div>
    </div>`;
  }).join('');
  host.innerHTML = `
    <header class="card-head">${icon('target', 'head-ic')}<h2>${esc(t('cy_plan_title'))}</h2></header>
    <p class="note tight">${esc(t('cy_plan_sub', { days: c.daysLeft, pace: c.avgPerDay }))}</p>
    <div class="plan-rows">${rows}</div>`;
}

function openCloseSheet() {
  const { state, t } = app;
  const c = cycleInfo();
  const dlg = document.getElementById('close-sheet');
  if (c.status !== 'ok') { app.toast(t('cy_need_one')); return; }
  const month = c.latest.date.slice(0, 7);
  const est = computeBill(app.ctx({ units: c.used })).total;
  dlg.innerHTML = `
    <form method="dialog" class="sheet-body" id="close-form">
      <header class="sheet-head"><h2 id="close-title">${esc(t('close_title'))}</h2>
        <button class="icon-btn small" type="button" data-close aria-label="${esc(t('close'))}">${icon('x')}</button></header>
      <p class="note tight">${esc(t('close_body', { units: fmt(c.used), month: niceDate(month, state.lang) }))}</p>
      <div class="field"><label for="close-amount">${esc(t('close_amount'))}</label>
        <input type="number" inputmode="numeric" id="close-amount" class="tnum" min="0" placeholder="${fmt(est)}"></div>
      <p class="group-hint">${esc(t('close_hint', { est: fmt(est) }))}</p>
      <button class="btn btn-primary wide" type="submit">${esc(t('close_confirm'))}</button>
    </form>`;
  wireSheet(dlg);
  dlg.querySelector('#close-form').addEventListener('submit', () => {
    const amount = dlg.querySelector('#close-amount').value;
    app.change((s) => {
      const entry = { id: `b${Date.now()}`, month, units: c.used, amount: amount === '' ? est : Number(amount) };
      s.bills = [...s.bills.filter((b) => b.month !== month), entry];
      s.cycle = { startDate: c.latest.date, startReading: c.latest.reading, cycleDays: s.cycle.cycleDays, readings: [] };
    });
    app.toast(t('close_done'));
  });
  openSheet(dlg);
}

// ================================================================ history

function buildHistory() {
  const { t } = app;
  $('#track-history', root).innerHTML = `
    <section class="card">
      <header class="card-head">${icon('plus', 'head-ic')}<h2>${esc(t('hs_add_title'))}</h2></header>
      <div class="form-grid">
        <div class="field"><label for="hs-month">${esc(t('hs_month'))}</label><input type="month" id="hs-month" max="${today().slice(0, 7)}" value="${prevMonth()}"></div>
        <div class="field"><label for="hs-units">${esc(t('hs_units'))}</label><input type="number" inputmode="numeric" id="hs-units" class="tnum" min="0" step="1"></div>
        <div class="field"><label for="hs-amount">${esc(t('hs_amount'))}</label><input type="number" inputmode="numeric" id="hs-amount" class="tnum" min="0" step="1"></div>
      </div>
      <p class="form-err" id="hs-err" hidden></p>
      <button class="btn btn-primary" id="hs-add" type="button">${icon('plus')}<span>${esc(t('hs_add_btn'))}</span></button>
    </section>
    <div id="hs-body" class="stack"></div>`;
  $('#hs-add', root).addEventListener('click', addBill);
  $('#hs-body', root).addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-bill]');
    if (del) { app.change((s) => { s.bills = s.bills.filter((b) => b.id !== del.dataset.delBill); }); return; }
    const bar = e.target.closest('[data-bar]');
    if (bar) { selectedBar = bar.dataset.bar; updateHistory(); }
    if (e.target.closest('#hs-export')) exportCsv();
  });
}

function addBill() {
  const { t } = app;
  const month = $('#hs-month', root).value;
  const units = $('#hs-units', root).value;
  const amount = $('#hs-amount', root).value;
  const err = $('#hs-err', root);
  if (!month || units === '' || amount === '' || Number(units) < 0 || Number(amount) < 0) {
    err.textContent = t('err_hs_fields');
    err.hidden = false;
    return;
  }
  err.hidden = true;
  app.change((s) => {
    s.bills = [...s.bills.filter((b) => b.month !== month), { id: `b${Date.now()}`, month, units: Number(units), amount: Number(amount) }];
  });
  $('#hs-units', root).value = '';
  $('#hs-amount', root).value = '';
  // Step the month back so entering a year of bills is one pass.
  const [y, m] = month.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  $('#hs-month', root).value = isoDate(prev).slice(0, 7);
  app.toast(t('hs_added'));
}

function exportCsv() {
  const rows = [...app.state.bills].sort((a, b) => a.month.localeCompare(b.month));
  download('bijlihisaab-bills.csv', `month,units,amount\n${rows.map((b) => `${b.month},${b.units},${b.amount}`).join('\n')}\n`, 'text/csv');
}

function updateHistory() {
  const { state, t } = app;
  const body = $('#hs-body', root);
  const bills = [...state.bills].sort((a, b) => a.month.localeCompare(b.month));
  if (!bills.length) {
    body.innerHTML = `<section class="card"><div class="empty">
      <span class="empty-ic">${icon('history')}</span>
      <h2>${esc(t('hs_empty_title'))}</h2><p>${esc(t('hs_empty_body'))}</p></div></section>`;
    return;
  }
  const stats = historyStats(bills);
  const recent = bills.slice(-12);
  const maxU = Math.max(...recent.map((b) => b.units), 210);
  const axis = Math.ceil(maxU / 50) * 50;
  const sel = recent.find((b) => b.month === selectedBar) || recent.at(-1);
  const band = (u) => (u <= 100 ? 'seg-3' : u <= 200 ? 'seg-1' : 'seg-2');
  const pStreak = underLimitStreak(bills, 200);
  const lStreak = underLimitStreak(bills, 100);

  const dots = (n, goal) => Array.from({ length: goal }, (_, i) => `<i class="${i < Math.min(n, goal) ? 'on' : ''}"></i>`).join('');
  const streakRow = (name, n, goal, cap) => `
    <div class="streak">
      <div class="streak-top"><b>${esc(name)}</b><span class="tnum">${esc(t(n >= goal ? 'hs_streak_ok' : 'hs_streak', { n: Math.min(n, goal), goal }))}</span></div>
      <div class="dots" role="img" aria-label="${n}/${goal}">${dots(n, goal)}</div>
      <p class="note tight">${esc(t('hs_streak_note', { cap, goal }))}</p>
    </div>`;

  body.innerHTML = `
    <section class="card">
      <header class="card-head">${icon('chart-bar', 'head-ic')}<h2>${esc(t('hs_chart_title'))}</h2></header>
      <div class="bars" style="--axis:${axis}">
        <div class="bars-line" style="--y:${(200 / axis) * 100}%"><span>200</span></div>
        ${recent.map((b) => `
          <button class="bar ${band(b.units)}${b.month === sel.month ? ' is-sel' : ''}" type="button" data-bar="${b.month}" style="--h:${(b.units / axis) * 100}%" aria-label="${esc(niceDate(b.month, state.lang))}: ${b.units}">
            <span class="bar-fill"></span><span class="bar-label">${esc(niceDate(b.month, state.lang).split(' ')[0])}</span>
          </button>`).join('')}
      </div>
      <p class="bar-detail tnum"><b>${esc(niceDate(sel.month, state.lang))}</b> · ${fmt(sel.units)} ${esc(t('units_word'))} · Rs ${fmt(sel.amount)} · Rs ${(sel.amount / Math.max(sel.units, 1)).toFixed(1)}/${esc(t('unit_word'))}</p>
      <ul class="legend-row"><li><i class="dot seg-3"></i>≤100</li><li><i class="dot seg-1"></i>101–200</li><li><i class="dot seg-2"></i>&gt;200</li></ul>
    </section>

    <div class="tiles four">
      <div class="tile"><span>${esc(t('hs_avg_units'))}</span><b class="tnum">${fmt(stats.avgUnits)}</b></div>
      <div class="tile"><span>${esc(t('hs_avg_bill'))}</span><b class="tnum">Rs ${fmt(stats.avgAmount)}</b></div>
      <div class="tile warn"><span>${esc(t('hs_peak'))}</span><b class="tnum">${fmt(stats.peak.units)}</b></div>
      <div class="tile"><span>${esc(t('hs_total'))}</span><b class="tnum">Rs ${fmt(stats.totalAmount)}</b></div>
    </div>

    <section class="card">
      <header class="card-head">${icon('shield-check', 'head-ic')}<h2>${esc(t('hs_protect_title'))}</h2></header>
      ${streakRow(t('type_protected'), pStreak, 6, 200)}
      ${streakRow(t('type_lifeline'), lStreak, 12, 100)}
    </section>

    <section class="card">
      <header class="card-head">${icon('list-details', 'head-ic')}<h2>${esc(t('hs_list_title'))}</h2>
        <button class="btn btn-small head-side-btn" id="hs-export" type="button">${icon('download')}CSV</button></header>
      <ul class="list">${[...bills].reverse().map((b) => `
        <li><span>${esc(niceDate(b.month, state.lang))}<em class="tag">${fmt(b.units)} ${esc(t('units_word'))}</em></span>
        <b class="tnum">Rs ${fmt(b.amount)}</b>
        <button class="icon-btn small" type="button" data-del-bill="${esc(b.id)}" aria-label="${esc(t('delete'))}">${icon('trash')}</button></li>`).join('')}</ul>
    </section>`;
}
