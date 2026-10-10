// Bill photo → numbers. Pure text parsing of what OCR read off a paper bill;
// the OCR itself runs on the device (views/scan.js). OCR on a crumpled,
// tabular bill is noisy, so everything here is a suggestion the user confirms.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** OCR-typical confusions inside numbers: O→0, L/I/|→1, S→5, B→8, commas as thousands (text is uppercased). */
function toNumber(raw) {
  if (raw == null) return null;
  const s = raw.replace(/O/g, '0').replace(/[LI|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// A number starts with a digit, or with a look-alike (l7,100) that real digits
// follow, so letters inside ordinary words are never read as numbers.
const NUM = String.raw`((?:\d|[OIL|](?=[0-9OILSB|,]*\d))[0-9OILSB|,]*(?:\.\d+)?)`;

/**
 * First number after any of `labels`, within `reach` characters (labels and
 * values are often on different lines in the bill's tables).
 */
function after(text, labels, { reach = 60, min = -Infinity, max = Infinity, whole = false } = {}) {
  for (const label of labels) {
    const re = new RegExp(`${label}[^0-9-]{0,${reach}}?(-?)${NUM}`, 'g');
    for (const m of text.matchAll(re)) {
      // Rupee amounts have no paise on a bill, so "12.345" is OCR for "12,345".
      const n = toNumber(whole && /^\d{1,3}(\.\d{3})+$/.test(m[2]) ? m[2].replace(/\./g, '') : m[2]);
      if (n !== null) {
        const v = m[1] ? -n : n;
        if (v >= min && v <= max) return v;
      }
    }
  }
  return null;
}

/**
 * The meter table. Bills print it as a header row (… LOAD PREVIOUS PRESENT
 * MF UNITS) over a value row, which OCR returns as two lines, so labels are
 * no help. The value row gives itself away: two increasing readings next to
 * each other, with their difference printed later on the same line.
 */
function meterRow(text) {
  const lines = text.split('\n');
  let fallback = null;
  for (let li = 0; li < lines.length; li++) {
    const nums = lines[li].split(/[\s|[\]]+/).filter((w) => /^\d[\d,]*$/.test(w)).map((w) => Number(w.replace(/,/g, '')));
    for (let i = 0; i + 1 < nums.length; i++) {
      const [a, b] = [nums[i], nums[i + 1]];
      if (!(a >= 100 && b >= a && b - a <= 5000)) continue;
      const header = lines[li - 1] || '';
      const load = /LOAD/.test(header) && i > 0 && nums[i - 1] > 0 && nums[i - 1] <= 50 ? nums[i - 1] : null;
      const hit = { prev: a, pres: b, units: b - a, load };
      if (nums.slice(i + 2).includes(b - a)) return hit;
      fallback ??= /PREV|PRES/.test(header) ? hit : null;
    }
  }
  return fallback;
}

/** "SEP 26", "SEP-2026", "SEPT 2026", "09/2026" → '2026-09'. */
function billMonth(text) {
  const near = text.match(/BILL(?:ING)?\s*MONTH[^A-Z0-9]{0,20}([A-Z]{3,9})[\s\-/.']*(\d{2,4})/);
  const any = near || text.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s\-/.']+(\d{2}|20\d{2})\b/);
  if (any) {
    const mi = MONTHS.indexOf(any[1].slice(0, 3));
    if (mi >= 0) {
      const y = any[2].length === 2 ? 2000 + Number(any[2]) : Number(any[2]);
      if (y >= 2015 && y <= 2099) return `${y}-${String(mi + 1).padStart(2, '0')}`;
    }
  }
  const numeric = text.match(/BILL(?:ING)?\s*MONTH[^0-9]{0,20}(\d{1,2})[\-/.](20\d{2})/);
  if (numeric && +numeric[1] >= 1 && +numeric[1] <= 12) return `${numeric[2]}-${numeric[1].padStart(2, '0')}`;
  return null;
}

/**
 * @param {string} raw  OCR text
 * @returns {{month: string|null, units: number|null, amount: number|null,
 *            loadKw: number|null, fpaRate: number|null,
 *            prevReading: number|null, presReading: number|null, found: number}}
 */
export function parseBillText(raw) {
  const text = String(raw || '').toUpperCase().replace(/[ \t]+/g, ' ');

  const row = meterRow(text);
  let units = after(text, [String.raw`UNITS?\s*CONSUMED`, String.raw`CONSUMED\s*UNITS`, String.raw`TOTAL\s*UNITS`], { min: 0, max: 5000 }) ?? row?.units ?? null;
  const prevReading = row?.prev ?? after(text, [String.raw`PREV(?:IOUS)?\.?\s*READING`], { min: 0, max: 9999999 });
  const presReading = row?.pres ?? after(text, [String.raw`PRES(?:ENT)?\.?\s*READING`, String.raw`CURRENT\s*READING`], { min: 0, max: 9999999 });
  if (units === null && prevReading !== null && presReading !== null && presReading >= prevReading && presReading - prevReading <= 5000) {
    units = presReading - prevReading;
  }
  units ??= after(text, [String.raw`\bUNITS\b`], { reach: 20, min: 0, max: 5000 });

  const amount = after(text, [
    String.raw`PAYABLE\s*WITHIN\s*DUE\s*DATE`, String.raw`AMOUNT\s*PAYABLE\s*WITHIN`, String.raw`WITHIN\s*DUE\s*DATE`,
    String.raw`NET\s*AMOUNT\s*PAYABLE`, String.raw`TOTAL\s*PAYABLE`, String.raw`AMOUNT\s*PAYABLE`, String.raw`CURRENT\s*BILL`,
  ], { reach: 80, min: 1, max: 2000000, whole: true });

  const loadKw = row?.load ?? after(text, [String.raw`SANCTIONED\s*LOAD`, String.raw`SANC\.?\s*LOAD`, String.raw`\bLOAD\b`], { reach: 30, min: 0.1, max: 100 });
  const fpaRate = after(text, [String.raw`F\.?\s*P\.?\s*A\.?\s*@`, String.raw`FUEL\s*(?:PRICE|CHARGES?)\s*ADJ(?:USTMENT)?\.?\s*@`, String.raw`F\.?\s*C\.?\s*A\.?\s*@`], { reach: 12, min: -10, max: 15 });
  const month = billMonth(text);

  const out = { month, units, amount, loadKw, fpaRate, prevReading, presReading };
  out.found = ['month', 'units', 'amount', 'loadKw'].filter((k) => out[k] !== null).length;
  return out;
}
