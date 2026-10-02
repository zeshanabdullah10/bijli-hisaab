// Persistent app state. One JSON document under a single key so a backup is
// one file and a reset is one call. Earlier versions kept ~20 separate `bh_*`
// keys; those are read once to migrate and then left alone.

const KEY = 'bh2';

export const defaultState = () => ({
  v: 2,
  lang: 'en',
  theme: null, // 'light' | 'dark' | null = follow the system
  profile: {
    discoId: 'lesco',
    consumerType: 'unprotected',
    loadKw: 5,
    phase: 'single',
    onATL: true,
    fpa: '',
  },
  units: 300,
  budget: 20000,
  actual: '',
  solar: {
    enabled: false,
    mode: 'net_billing',
    importedPeak: '', importedOffPeak: '',
    exportedPeak: '', exportedOffPeak: '',
    buyback: '', buybackPeak: '',
    cost: '',
  },
  cycle: { startDate: '', startReading: '', cycleDays: 30, readings: [] },
  bills: [], // { id, month: 'YYYY-MM', units, amount }
  plan: { sel: {} }, // appliance id -> { qty, hours, watts }
  welcomed: false,
});

function read(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

function migrateV1() {
  const has = ['bh_units', 'bh_disco', 'bh_lang'].some((k) => read(k) !== null);
  if (!has) return null;
  const s = defaultState();
  s.lang = read('bh_lang') === 'ur' ? 'ur' : 'en';
  s.theme = ['light', 'dark'].includes(read('bh_theme')) ? read('bh_theme') : null;
  s.profile.discoId = read('bh_disco') || s.profile.discoId;
  s.profile.consumerType = read('bh_type') || s.profile.consumerType;
  s.profile.loadKw = Number(read('bh_load')) || s.profile.loadKw;
  s.profile.fpa = read('bh_fpa') || '';
  s.profile.onATL = read('bh_atl') !== '0';
  s.units = Number(read('bh_units')) || s.units;
  s.budget = Number(read('bh_budget')) || s.budget;
  s.actual = read('bh_actual') || '';
  s.solar.enabled = read('bh_solar') === '1';
  s.solar.mode = read('bh_solar_mode') || s.solar.mode;
  s.solar.importedPeak = read('bh_solar_imp_peak') || '';
  s.solar.importedOffPeak = read('bh_solar_imp_off') || '';
  s.solar.exportedPeak = read('bh_solar_exp_peak') || '';
  s.solar.exportedOffPeak = read('bh_solar_exp_off') || '';
  s.solar.buyback = read('bh_solar_buyback') || '';
  s.solar.buybackPeak = read('bh_solar_buyback_peak') || '';
  s.solar.cost = read('bh_solar_cost') || '';
  s.welcomed = true; // returning user: skip onboarding
  return s;
}

/** Deep-merge saved data over defaults so new fields never arrive undefined. */
function merge(base, saved) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return saved ?? base;
  const out = { ...base };
  for (const k of Object.keys(saved || {})) {
    out[k] = k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? merge(base[k], saved[k])
      : saved[k];
  }
  return out;
}

export function loadState() {
  const raw = read(KEY);
  if (raw) {
    try { return merge(defaultState(), JSON.parse(raw)); } catch { /* corrupt: fall through */ }
  }
  return migrateV1() || defaultState();
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode / quota */ }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Validate an imported backup; returns a full state or throws. */
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || data.v !== 2 || !data.profile) {
    throw new Error('Not a BijliHisaab backup');
  }
  return merge(defaultState(), data);
}
