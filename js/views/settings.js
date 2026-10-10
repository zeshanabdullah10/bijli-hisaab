// Settings and first-run sheets. Everything that describes the household's
// connection lives here; the Bill tab only shows a one-line summary.

import { app } from '../app.js';
import {
  clearState, parseBackup, saveState, switchHousehold, addHousehold, renameHousehold, removeHousehold,
} from '../store.js';
import { VERSION } from '../version.js';
import { startScan } from './scan.js';
import { $, esc, icon, num, openSheet, wireSheet, download } from '../ui.js';

const settingsDlg = () => document.getElementById('settings-sheet');
const welcomeDlg = () => document.getElementById('welcome-sheet');

function segHTML(name, options, current) {
  const idx = Math.max(0, options.findIndex((o) => o.value === current));
  return `<div class="seg ${options.length === 2 ? 'two' : ''}" style="--seg-n:${options.length};--active:${idx}" role="radiogroup">
    <span class="seg-thumb" aria-hidden="true"></span>
    ${options.map((o) => `<label class="seg-item"><input type="radio" name="${name}" value="${o.value}" ${o.value === current ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}
  </div>`;
}

function bindSeg(dlg, name, onPick) {
  const radios = [...dlg.querySelectorAll(`input[name=${name}]`)];
  radios.forEach((r) => r.addEventListener('change', (e) => {
    e.target.closest('.seg').style.setProperty('--active', radios.indexOf(e.target));
    onPick(e.target.value);
  }));
}

const discoOptions = () => app.discos.discos
  .map((d) => `<option value="${d.id}" ${d.id === app.state.profile.discoId ? 'selected' : ''}>${esc(d.name_en)} · ${esc(app.state.lang === 'ur' ? d.region_ur : d.region_en)}</option>`).join('');

/** Display name of a household: its own, or "Home 2". */
export function homeName(h, i) {
  return h.name || app.t('home_n', { n: i + 1 });
}

async function setState(next) {
  app.state = next;
  await app.setDisco(app.state.profile.discoId);
  saveState(app.state);
  app.rebuild();
}

function homesHTML() {
  const { state, t } = app;
  const disco = (h) => {
    const id = h.id === state.active ? state.profile.discoId : h.data?.profile?.discoId;
    return app.discos.discos.find((d) => d.id === id)?.name_en || '';
  };
  return `
      <p class="sheet-label">${esc(t('homes_title'))}</p>
      <div class="group homes">
        ${state.households.map((h, i) => `
        <div class="row home-row${h.id === state.active ? ' is-active' : ''}">
          <button class="home-pick" type="button" data-home="${h.id}" aria-pressed="${h.id === state.active}" aria-label="${esc(t('homes_switch', { name: homeName(h, i) }))}">${icon(h.id === state.active ? 'circle-check' : 'map-pin')}</button>
          <input class="home-name" type="text" maxlength="30" data-rename="${h.id}" value="${esc(h.name)}" placeholder="${esc(homeName(h, i))}" aria-label="${esc(t('homes_name'))}">
          <span class="home-disco">${esc(disco(h))}</span>
          ${state.households.length > 1 ? `<button class="icon-btn small" type="button" data-remove-home="${h.id}" aria-label="${esc(t('delete'))}">${icon('trash')}</button>` : ''}
        </div>`).join('')}
      </div>
      <button class="btn btn-small homes-add" type="button" id="s-add-home">${icon('plus')}${esc(t('homes_add'))}</button>
      <p class="group-hint">${esc(t('homes_hint'))}</p>`;
}

function wireHomes(dlg) {
  dlg.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', async () => {
    await setState(switchHousehold(app.state, b.dataset.home));
    buildSettings();
    app.toast(app.t('homes_switched'));
  }));
  dlg.querySelectorAll('[data-rename]').forEach((inp) => inp.addEventListener('change', () => {
    app.state = renameHousehold(app.state, inp.dataset.rename, inp.value.trim());
    app.change();
    renderHomeChip();
  }));
  dlg.querySelectorAll('[data-remove-home]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(app.t('homes_remove_confirm'))) return;
    await setState(removeHousehold(app.state, b.dataset.removeHome));
    buildSettings();
  }));
  $('#s-add-home', dlg).addEventListener('click', async () => {
    await setState(addHousehold(app.state, ''));
    buildSettings();
    app.toast(app.t('homes_added'));
  });
}

/** Header chip with the active home's name; only when there is more than one. */
export function renderHomeChip() {
  const chip = document.getElementById('home-chip');
  const { state } = app;
  const i = state.households.findIndex((h) => h.id === state.active);
  chip.hidden = state.households.length < 2;
  chip.querySelector('span').textContent = homeName(state.households[i], i);
}

async function pickDisco(id) {
  await app.setDisco(id);
  app.rebuild();
}

export function openSettings() {
  buildSettings();
  openSheet(settingsDlg());
}

function buildSettings() {
  const { state, t } = app;
  const p = state.profile;
  const dlg = settingsDlg();
  dlg.innerHTML = `
    <div class="sheet-body">
      <header class="sheet-head"><h2 id="settings-title">${esc(t('settings_title'))}</h2>
        <button class="icon-btn small" type="button" data-close aria-label="${esc(t('close'))}">${icon('x')}</button></header>

      ${homesHTML()}

      <p class="sheet-label">${esc(t('set_language'))}</p>
      ${segHTML('s-lang', [{ value: 'en', label: 'English' }, { value: 'ur', label: 'اردو' }], state.lang)}

      <p class="sheet-label">${esc(t('set_theme'))}</p>
      ${segHTML('s-theme', [{ value: 'auto', label: t('theme_auto') }, { value: 'light', label: t('theme_light') }, { value: 'dark', label: t('theme_dark') }], state.theme || 'auto')}

      <p class="sheet-label">${esc(t('set_connection'))}</p>
      <div class="group">
        <div class="row"><label class="row-label" for="s-disco">${esc(t('disco_label'))}</label>
          <select id="s-disco" class="row-select">${discoOptions()}</select></div>
        <div class="row"><label class="row-label" for="s-type">${esc(t('consumer_type'))}</label>
          <select id="s-type" class="row-select">${['unprotected', 'protected', 'lifeline'].map((v) => `<option value="${v}" ${v === p.consumerType ? 'selected' : ''}>${esc(t(`type_${v}`))}</option>`).join('')}</select></div>
        <div class="row"><label class="row-label" for="s-load">${esc(t('load_label'))}</label>
          <input type="number" inputmode="decimal" id="s-load" class="row-input tnum" min="0" max="50" step="0.5" value="${p.loadKw}"></div>
        <div class="row"><span class="row-label">${esc(t('phase_label'))}</span>
          <div class="mini-seg" role="radiogroup">
            <label><input type="radio" name="s-phase" value="single" ${p.phase === 'single' ? 'checked' : ''}><span>${esc(t('phase_single'))}</span></label>
            <label><input type="radio" name="s-phase" value="three" ${p.phase === 'three' ? 'checked' : ''}><span>${esc(t('phase_three'))}</span></label>
          </div></div>
        <div class="row row-switch"><span class="row-label">${esc(t('filer_label'))}</span>
          <span class="switch"><input type="checkbox" id="s-atl" ${p.onATL ? 'checked' : ''} aria-label="${esc(t('filer_label'))}"><span class="switch-track"></span></span></div>
        <div class="row"><label class="row-label" for="s-meter">${esc(t('meter_label'))}</label>
          <select id="s-meter" class="row-select">${['standard', 'tou'].map((v) => `<option value="${v}" ${v === (p.meter || 'standard') ? 'selected' : ''}>${esc(t(`meter_${v}`))}</option>`).join('')}</select></div>
        <div class="row"><label class="row-label" for="s-duty">${esc(t('duty_label'))}</label>
          <select id="s-duty" class="row-select">${['auto', 'yes', 'no'].map((v) => `<option value="${v}" ${v === (p.duty || 'auto') ? 'selected' : ''}>${esc(t(`duty_${v}`, { def: t(app.disco.electricity_duty.on_bill ? 'duty_yes' : 'duty_no') }))}</option>`).join('')}</select></div>
        <div class="row"><label class="row-label" for="s-fpa">${esc(t('fpa_label'))}</label>
          <input type="number" inputmode="decimal" id="s-fpa" class="row-input tnum" min="-10" max="20" step="0.01" placeholder="auto" value="${esc(p.fpa)}"></div>
      </div>
      <p class="group-hint">${esc(t('fpa_hint'))} ${esc(t('meter_hint'))} ${esc(t('duty_hint'))}</p>
      ${app.disco.tariff_note_en ? `<p class="group-hint">${icon('info-circle')} ${esc(state.lang === 'ur' ? app.disco.tariff_note_ur : app.disco.tariff_note_en)}</p>` : ''}

      <p class="sheet-label">${esc(t('set_data'))}</p>
      <div class="action-row">
        <button class="btn btn-secondary" id="s-export" type="button">${icon('download')}<span>${esc(t('set_export'))}</span></button>
        <button class="btn btn-secondary" id="s-import" type="button">${icon('upload')}<span>${esc(t('set_import'))}</span></button>
        <button class="btn btn-ghost danger" id="s-reset" type="button">${icon('trash')}<span>${esc(t('set_reset'))}</span></button>
        <input type="file" id="s-file" accept="application/json,.json" hidden>
      </div>
      <p class="group-hint">${esc(t('set_data_note'))}</p>

      <p class="sheet-label">${esc(t('set_about'))}</p>
      <p class="about">BijliHisaab v${VERSION} · MIT · <a href="https://github.com/zeshanabdullah10/bijli-hisaab" target="_blank" rel="noopener">GitHub</a><br>
      ${esc(t('rates_chip', { date: app.tariff.effective_date }))}</p>
    </div>`;
  wireSheet(dlg);
  wireHomes(dlg);

  bindSeg(dlg, 's-lang', (v) => { app.state.lang = v; app.rebuild(); buildSettings(); });
  bindSeg(dlg, 's-theme', (v) => { app.state.theme = v === 'auto' ? null : v; applyTheme(); app.change(); });
  $('#s-disco', dlg).addEventListener('change', (e) => pickDisco(e.target.value).then(buildSettings));
  $('#s-type', dlg).addEventListener('change', (e) => { app.change((s) => { s.profile.consumerType = e.target.value; }); app.rebuild(); });
  $('#s-load', dlg).addEventListener('input', (e) => app.change((s) => { s.profile.loadKw = num(e.target.value, { max: 50 }); }));
  dlg.querySelectorAll('input[name=s-phase]').forEach((r) => r.addEventListener('change', (e) => app.change((s) => { s.profile.phase = e.target.value; })));
  $('#s-atl', dlg).addEventListener('change', (e) => app.change((s) => { s.profile.onATL = e.target.checked; }));
  $('#s-meter', dlg).addEventListener('change', (e) => { app.change((s) => { s.profile.meter = e.target.value; }); app.rebuild(); });
  $('#s-duty', dlg).addEventListener('change', (e) => app.change((s) => { s.profile.duty = e.target.value; }));
  $('#s-fpa', dlg).addEventListener('input', (e) => app.change((s) => { s.profile.fpa = e.target.value; }));

  $('#s-export', dlg).addEventListener('click', () => {
    download(`bijlihisaab-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(app.state, null, 2));
  });
  $('#s-import', dlg).addEventListener('click', () => $('#s-file', dlg).click());
  $('#s-file', dlg).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      app.state = parseBackup(await file.text());
      await app.setDisco(app.state.profile.discoId);
      saveState(app.state);
      applyTheme();
      app.rebuild();
      dlg.close();
      app.toast(app.t('set_imported'));
    } catch {
      app.toast(app.t('set_import_bad'));
    }
  });
  $('#s-reset', dlg).addEventListener('click', () => {
    if (!confirm(app.t('set_reset_confirm'))) return;
    clearState();
    location.hash = '#/bill';
    location.reload();
  });
}

export function applyTheme() {
  const th = app.state.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
}

// ---------------------------------------------------------------- welcome

export function maybeWelcome() {
  if (app.state.welcomed) return;
  buildWelcome();
  const dlg = welcomeDlg();
  dlg.addEventListener('close', () => app.change((s) => { s.welcomed = true; }), { once: true });
  openSheet(dlg);
}

// Step two: three ways in, so nobody lands on a wall of numbers.
function buildStart() {
  const { t } = app;
  const dlg = welcomeDlg();
  const opt = (id, ic, title, body) => `
    <button class="start-opt" type="button" id="${id}">
      <span class="start-ic">${icon(ic)}</span>
      <span class="start-text"><b>${esc(title)}</b><span>${esc(body)}</span></span>
      ${icon('arrow-right', 'start-go')}
    </button>`;
  dlg.innerHTML = `
    <div class="sheet-body welcome">
      <h2 id="welcome-title">${esc(t('start_title'))}</h2>
      <p class="note">${esc(t('start_body'))}</p>
      <div class="start-opts">
        ${opt('st-scan', 'photo', t('start_scan'), t('start_scan_body'))}
        ${opt('st-units', 'receipt', t('start_units'), t('start_units_body'))}
        ${opt('st-track', 'calendar-stats', t('start_track'), t('start_track_body'))}
      </div>
      <button class="btn btn-ghost wide" type="button" data-close>${esc(t('start_skip'))}</button>
    </div>`;
  wireSheet(dlg);
  const done = () => dlg.close();
  $('#st-scan', dlg).addEventListener('click', () => { done(); app.go('bill'); startScan(); });
  $('#st-units', dlg).addEventListener('click', () => {
    done();
    app.go('bill');
    setTimeout(() => { const u = document.getElementById('units-input'); u.focus(); u.select(); u.scrollIntoView({ block: 'center' }); }, 120);
  });
  $('#st-track', dlg).addEventListener('click', () => { done(); app.go('track'); });
}

function buildWelcome() {
  const { state, t } = app;
  const dlg = welcomeDlg();
  dlg.innerHTML = `
    <div class="sheet-body welcome">
      <span class="brand-mark big"><svg aria-hidden="true"><use href="#i-bolt"/></svg></span>
      <h2 id="welcome-title">${esc(t('welcome_title'))}</h2>
      <p class="note">${esc(t('welcome_body'))}</p>
      ${segHTML('w-lang', [{ value: 'en', label: 'English' }, { value: 'ur', label: 'اردو' }], state.lang)}
      <div class="group">
        <div class="row"><label class="row-label" for="w-disco">${esc(t('disco_label'))}</label>
          <select id="w-disco" class="row-select">${discoOptions()}</select></div>
      </div>
      <p class="sheet-label">${esc(t('consumer_type'))}</p>
      ${segHTML('w-type', ['unprotected', 'protected', 'lifeline'].map((v) => ({ value: v, label: t(`type_${v}`) })), state.profile.consumerType)}
      <p class="group-hint">${esc(t('welcome_type_hint'))}</p>
      <button class="btn btn-primary wide" type="button" id="w-next">${esc(t('welcome_go'))}</button>
    </div>`;
  wireSheet(dlg);
  $('#w-next', dlg).addEventListener('click', () => buildStart());
  bindSeg(dlg, 'w-lang', (v) => { app.state.lang = v; app.rebuild(); buildWelcome(); });
  bindSeg(dlg, 'w-type', (v) => app.change((s) => { s.profile.consumerType = v; }));
  $('#w-disco', dlg).addEventListener('change', (e) => pickDisco(e.target.value).then(buildWelcome));
}
