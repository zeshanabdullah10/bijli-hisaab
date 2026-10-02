// Shared application context: state, loaded tariff data, language and a tiny
// change bus. Views import `app`; nothing here knows about any view.

import { loadState, saveState } from './store.js';
import { makeT } from './i18n.js';

const listeners = { change: new Set(), rebuild: new Set() };

export const app = {
  state: loadState(),
  tariff: null,
  disco: null,
  discos: null,
  appliances: null,
  learn: null,
  t: null,

  /** Mutate state, persist, and tell the active view to refresh values. */
  change(mutator) {
    if (mutator) mutator(this.state);
    saveState(this.state);
    listeners.change.forEach((fn) => fn());
  },

  /** Structure changed (language, DISCO, import/reset): rebuild every view. */
  rebuild() {
    this.t = makeT(this.state.lang);
    saveState(this.state);
    listeners.rebuild.forEach((fn) => fn());
  },

  on(event, fn) { listeners[event].add(fn); },

  /**
   * The tariff-engine context for the current profile. `withSolar: false`
   * gives the "no panels" comparison bill.
   */
  ctx({ withSolar = true, units = this.state.units } = {}) {
    const { profile: p, solar: s } = this.state;
    const num = (v) => (v === '' ? null : Number(v));
    return {
      tariff: this.tariff,
      disco: this.disco,
      units,
      consumerType: p.consumerType,
      loadKw: p.loadKw,
      fpaOverride: p.fpa === '' ? null : Number(p.fpa),
      onATL: p.onATL,
      phase: p.phase,
      solar: withSolar && s.enabled
        ? {
            mode: s.mode,
            importedUnits: units,
            importedPeak: num(s.importedPeak),
            importedOffPeak: num(s.importedOffPeak),
            exportedPeak: s.exportedPeak === '' ? 0 : Number(s.exportedPeak),
            exportedOffPeak: s.exportedOffPeak === '' ? 0 : Number(s.exportedOffPeak),
            buybackPerUnit: s.buyback === '' ? undefined : Number(s.buyback),
            buybackPeakPerUnit: s.buybackPeak === '' ? undefined : Number(s.buybackPeak),
          }
        : null,
    };
  },

  /** Same context without solar and without `units`, for what-if maths. */
  plainCtx(units = this.state.units) {
    return this.ctx({ withSolar: false, units });
  },

  async loadTariff(setId) {
    const index = await fetch(`data/tariffs/${setId}/index.json`).then((r) => r.json());
    this.tariff = await fetch(`data/tariffs/${setId}/${index.default}.json`).then((r) => r.json());
  },

  async setDisco(id) {
    this.disco = this.discos.discos.find((d) => d.id === id) || this.discos.discos[0];
    this.state.profile.discoId = this.disco.id;
    if (!this.tariff || this.disco.tariff_set !== this.tariff.tariff_set) {
      await this.loadTariff(this.disco.tariff_set);
    }
  },

  toast(message) {
    const host = document.getElementById('toast');
    host.textContent = message;
    host.classList.add('show');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => host.classList.remove('show'), 2200);
  },

  go(route) { location.hash = `#/${route}`; },
};

app.t = makeT(app.state.lang);
