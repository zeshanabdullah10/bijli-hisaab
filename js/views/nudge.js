// "Time to read the meter" banner, shown above every tab while a cycle is
// live and the newest reading is a few days old. One field, one tap.

import { app } from '../app.js';
import { readingDue, readingError, isoDate } from '../tracker.js';
import { fmt } from '../i18n.js';
import { esc, icon, el } from '../ui.js';

let wired = false;

export function renderNudge() {
  const host = el('nudge');
  const { state, t } = app;
  const today = isoDate();
  const due = readingDue(state.cycle, { today, dismissed: state.nudgeDismissed });
  if (!due) { host.hidden = true; host.innerHTML = ''; return; }
  if (host.hidden || host.dataset.days !== String(due.days)) {
    host.dataset.days = due.days;
    host.innerHTML = `
      <div class="nudge-top">${icon('bell')}
        <p><b>${esc(t('nudge_title'))}</b><span>${esc(t('nudge_body', { days: due.days, reading: fmt(due.last.reading) }))}</span></p>
        <button class="icon-btn small" type="button" id="nudge-x" aria-label="${esc(t('nudge_later'))}">${icon('x')}</button></div>
      <form class="nudge-form" id="nudge-form">
        <input type="number" inputmode="decimal" class="tnum" id="nudge-reading" min="0" step="1" placeholder="${esc(t('nudge_placeholder'))}" aria-label="${esc(t('cy_reading'))}">
        <button class="btn btn-primary" type="submit">${icon('plus')}<span>${esc(t('cy_add_btn'))}</span></button>
      </form>
      <p class="form-err" id="nudge-err" hidden></p>`;
  }
  host.hidden = false;
  if (!wired) { wire(); wired = true; }
}

function wire() {
  const host = el('nudge');
  host.addEventListener('click', (e) => {
    if (!e.target.closest('#nudge-x')) return;
    app.change((s) => { s.nudgeDismissed = isoDate(); });
  });
  host.addEventListener('submit', (e) => {
    e.preventDefault();
    const { t } = app;
    const today = isoDate();
    const raw = host.querySelector('#nudge-reading').value;
    const bad = readingError(app.state.cycle, today, raw, today);
    const err = host.querySelector('#nudge-err');
    if (bad) { err.textContent = t(bad); err.hidden = false; return; }
    app.change((s) => { s.cycle.readings.push({ date: today, reading: Number(raw) }); });
    app.toast(t('cy_added'));
  });
}
