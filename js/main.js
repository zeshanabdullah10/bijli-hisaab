// BijliHisaab entry point: load data, route between tabs, keep views in sync.

import { app } from './app.js';
import { billView } from './views/bill.js';
import { trackView } from './views/track.js';
import { planView } from './views/plan.js';
import { learnView } from './views/learn.js';
import { openSettings, applyTheme, maybeWelcome } from './views/settings.js';
import { $$, el } from './ui.js';

const VIEWS = { bill: billView, track: trackView, plan: planView, learn: learnView };
const built = new Set();
let current = null;

// ---------------------------------------------------------------- static text

function applyStaticTexts() {
  const { t, state } = app;
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ur' ? 'rtl' : 'ltr';
  $$('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
  el('rates-chip').textContent = t('rates_chip', { date: app.tariff.effective_date });
  el('disclaimer').textContent = t('disclaimer');
  el('data-updated').textContent = t('data_updated', { date: app.tariff.verified_on });
}

// ---------------------------------------------------------------- routing

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { route: VIEWS[path] ? path : 'bill', params: new URLSearchParams(query) };
}

/** One-off scenario links (#/bill?u=300&t=protected&d=lesco&k=5) seed the inputs. */
async function applyScenario(params) {
  if (!params.has('u') && !params.has('t') && !params.has('d')) return false;
  const u = Number(params.get('u'));
  const type = params.get('t');
  const disco = params.get('d');
  const kw = Number(params.get('k'));
  if (disco && app.discos.discos.some((d) => d.id === disco)) await app.setDisco(disco);
  app.change((s) => {
    if (Number.isFinite(u) && params.has('u')) s.units = Math.max(0, Math.min(2000, Math.round(u)));
    if (['unprotected', 'protected', 'lifeline'].includes(type)) s.profile.consumerType = type;
    if (Number.isFinite(kw) && kw > 0 && kw <= 50) s.profile.loadKw = kw;
  });
  history.replaceState(null, '', '#/bill');
  return true;
}

async function route() {
  const { route: name, params } = parseHash();
  let seeded = false;
  if (name === 'bill') seeded = await applyScenario(params);
  const view = VIEWS[name];
  if (!built.has(name)) { view.build(); built.add(name); }
  Object.entries(VIEWS).forEach(([id]) => { el(`view-${id}`).hidden = id !== name; });
  $$('[data-route]').forEach((a) => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (current !== name) {
    window.scrollTo({ top: 0 });
    if (name !== 'bill') el('mini-total').hidden = true;
  }
  current = name;
  view.update();
  if (name === 'learn' && params.has('term')) learnView.focusTerm(params.get('term'));
  if (seeded) app.toast(app.t('scenario_loaded'));
}

// ---------------------------------------------------------------- boot

async function boot() {
  const [discos, appliances, learn] = await Promise.all([
    fetch('data/discos.json').then((r) => r.json()),
    fetch('data/appliances.json').then((r) => r.json()),
    fetch('data/learn.json').then((r) => r.json()),
  ]);
  app.discos = discos;
  app.appliances = appliances;
  app.learn = learn;
  await app.setDisco(app.state.profile.discoId);

  applyTheme();
  applyStaticTexts();

  app.on('change', () => VIEWS[current]?.update());
  app.on('rebuild', () => {
    applyStaticTexts();
    [...built].forEach((id) => VIEWS[id].build());
    VIEWS[current]?.update();
  });

  el('lang-toggle').addEventListener('click', () => {
    app.state.lang = app.state.lang === 'en' ? 'ur' : 'en';
    app.rebuild();
  });
  el('settings-btn').addEventListener('click', openSettings);
  window.addEventListener('hashchange', route);

  await route();
  maybeWelcome();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch((err) => {
  document.body.innerHTML =
    `<div class="boot-error"><p>Failed to load BijliHisaab (${err.message}). Serve over HTTP, see README.</p></div>`;
});


