// Small DOM helpers shared by the views.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const el = (id) => document.getElementById(id);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape for HTML text and attribute values. Everything user-typed goes through this. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** Clamp a numeric input's text into [min, max]; '' and junk become `fallback`. */
export function num(value, { min = 0, max = Infinity, fallback = 0 } = {}) {
  const n = Number(value);
  if (value === '' || Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Paint the filled portion of a range slider. */
export function fillSlider(input, value, max) {
  input.style.setProperty('--p', `${Math.min(100, (value / max) * 100)}%`);
}

/** Open a <dialog> as a sheet, closing on backdrop click. */
export function openSheet(dialog) {
  if (!dialog.open) dialog.showModal();
}
export function wireSheet(dialog) {
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
}

/** Trigger a client-side file download. */
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];

/** '2026-09' → 'Sep 2026'; '2026-09-14' → '14 Sep'. Always Latin digits. */
export function niceDate(iso, lang = 'en', { year = true } = {}) {
  const names = lang === 'ur' ? MONTHS_UR : MONTHS_EN;
  const [y, m, d] = iso.split('-');
  const mon = names[+m - 1];
  if (d === undefined) return `${mon} ${y}`;
  return year ? `${+d} ${mon} ${y}` : `${+d} ${mon}`;
}
