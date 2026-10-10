// Scan a paper bill: OCR on the device (Tesseract, loaded from a CDN on first
// use and cached by the browser), parse the numbers, and let the user confirm
// them before anything changes. The photo never leaves the phone.

import { app } from '../app.js';
import { parseBillText } from '../billscan.js';
import { diagnoseBill } from '../insights.js';
import { fmt } from '../i18n.js';
import { esc, icon, openSheet, wireSheet, copyText } from '../ui.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
const MAX_SIDE = 2200; // big enough for small print, small enough to stay quick

let tesseract = null;

/** Downscale a phone photo before OCR: 12 MP is slow and no more accurate. */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const g = canvas.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.35)';
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function startScan() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => { if (input.files[0]) scan(input.files[0]); });
  input.click();
}

export async function scan(file) {
  const { t } = app;
  const dlg = document.getElementById('close-sheet');
  const url = URL.createObjectURL(file);
  dlg.innerHTML = `
    <div class="sheet-body">
      <header class="sheet-head"><h2 id="close-title">${esc(t('scan_title'))}</h2>
        <button class="icon-btn small" type="button" data-close aria-label="${esc(t('close'))}">${icon('x')}</button></header>
      <img class="scan-thumb" src="${url}" alt="">
      <div id="scan-body">
        <p class="note tight" id="scan-status">${esc(t('scan_loading'))}</p>
        <div class="scan-progress"><span id="scan-bar"></span></div>
        <p class="group-hint">${esc(t('scan_private'))}</p>
      </div>
    </div>`;
  wireSheet(dlg);
  dlg.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
  openSheet(dlg);

  const status = dlg.querySelector('#scan-status');
  const bar = dlg.querySelector('#scan-bar');
  try {
    if (!tesseract) {
      const mod = await import(TESSERACT);
      tesseract = mod.default ?? mod; // the ESM build only has a default export
    }
    const worker = await tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          status.textContent = t('scan_reading');
          bar.style.width = `${Math.round(m.progress * 100)}%`;
        }
      },
    });
    const { data } = await worker.recognize(await prepare(file));
    await worker.terminate();
    if (!dlg.open) return;
    showResult(dlg, parseBillText(data.text), data.text);
  } catch (err) {
    console.error('scan failed', err);
    if (!dlg.open) return;
    dlg.querySelector('#scan-body').innerHTML = `
      <div class="verdict v-warn">${icon('alert-circle')}<div><b>${esc(t('scan_failed'))}</b>
      <p>${esc(navigator.onLine ? t('scan_failed_body') : t('scan_offline'))}</p></div></div>`;
  }
}

function showResult(dlg, r, rawText) {
  const { t, state } = app;
  const field = (id, label, value, attrs = '') => `
    <div class="field"><label for="${id}">${esc(label)}</label>
      <input id="${id}" class="tnum${value === null ? ' is-missing' : ''}" value="${value ?? ''}" ${attrs}></div>`;
  dlg.querySelector('#scan-body').innerHTML = `
    <form method="dialog" id="scan-form">
      <p class="note tight">${esc(t(r.found ? 'scan_check' : 'scan_none'))}</p>
      <div class="form-grid">
        ${field('scan-units', t('hs_units'), r.units, 'type="number" inputmode="numeric" min="0"')}
        ${field('scan-amount', t('actual_bill_label'), r.amount, 'type="number" inputmode="numeric" min="0"')}
        ${field('scan-month', t('hs_month'), r.month, 'type="month"')}
        ${field('scan-load', t('scan_load'), r.loadKw, 'type="number" inputmode="decimal" min="0.5" max="50" step="0.5"')}
        ${r.fpaRate !== null ? field('scan-fpa', t('scan_fpa'), r.fpaRate, 'type="number" inputmode="decimal" step="0.0001"') : ''}
      </div>
      <div id="scan-verdict" aria-live="polite"></div>
      <label class="check-row"><input type="checkbox" id="scan-history" checked><span>${esc(t('scan_save_history'))}</span></label>
      <button class="btn btn-primary wide" type="submit">${icon('check')}<span>${esc(t('scan_apply'))}</span></button>
      <button class="btn btn-ghost scan-copy" type="button" id="scan-copy">${icon('copy')}<span>${esc(t('scan_copy'))}</span></button>
      <p class="group-hint">${esc(t('scan_copy_hint'))}</p>
    </form>`;
  dlg.querySelector('#scan-copy').addEventListener('click', async () => {
    if (await copyText(rawText)) app.toast(t('copied'));
  });
  // Live check: what the tariff says these numbers should cost.
  const verdict = () => {
    const units = Number(dlg.querySelector('#scan-units').value);
    const amount = Number(dlg.querySelector('#scan-amount').value);
    const load = Number(dlg.querySelector('#scan-load').value);
    const host = dlg.querySelector('#scan-verdict');
    if (!(units > 0 && amount > 0)) { host.innerHTML = ''; return; }
    const ctx = { ...app.plainCtx(units), ...(load > 0 && load <= 50 ? { loadKw: load } : {}) };
    const d = diagnoseBill(ctx, amount);
    const tone = d.verdict === 'match' ? 'ok' : d.verdict === 'explained' ? 'info' : 'warn';
    host.innerHTML = `<div class="verdict v-${tone}">${icon(tone === 'ok' ? 'circle-check' : tone === 'info' ? 'search' : 'alert-circle')}
      <div><b>${esc(t(`verdict_${d.verdict}`))}</b><p class="tnum">${esc(t('scan_vs', { est: fmt(d.computed), diff: fmt(Math.abs(d.diff)), dir: t(d.diff >= 0 ? 'scan_higher' : 'scan_lower'), pct: Math.abs(d.diffPct).toFixed(1) }))}</p></div></div>`;
  };
  dlg.querySelector('#scan-form').addEventListener('input', verdict);
  verdict();

  dlg.querySelector('#scan-form').addEventListener('submit', () => {
    const v = (id) => dlg.querySelector(`#${id}`)?.value ?? '';
    const units = v('scan-units');
    const amount = v('scan-amount');
    const month = v('scan-month');
    const load = v('scan-load');
    const fpa = v('scan-fpa');
    app.change((s) => {
      if (units !== '') s.units = Math.max(0, Math.min(2000, Math.round(Number(units))));
      if (amount !== '') s.actual = amount;
      if (load !== '' && Number(load) > 0 && Number(load) <= 50) s.profile.loadKw = Number(load);
      if (fpa !== '') s.profile.fpa = fpa;
      if (dlg.querySelector('#scan-history').checked && month && units !== '' && amount !== '') {
        s.bills = [...s.bills.filter((b) => b.month !== month), { id: `b${Date.now()}`, month, units: Number(units), amount: Number(amount) }];
      }
    });
    app.toast(t('scan_done'));
    document.getElementById('actual-input').value = state.actual;
    // Land on the full bill check, which explains any gap line by line.
    if (amount !== '') setTimeout(() => document.getElementById('audit-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  });
}
