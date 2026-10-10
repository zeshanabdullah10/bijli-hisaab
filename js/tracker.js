// Meter tracker and bill-history maths — pure functions, no DOM.
// Dates are ISO calendar days ('YYYY-MM-DD'); all arithmetic is in UTC days so
// daylight-saving and the viewer's time zone can never shift a result.

const DAY = 86400000;
const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
const round1 = (n) => Math.round(n * 10) / 10;

export const isoDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const daysBetween = (a, b) => toDay(b) - toDay(a);

export function addDays(iso, n) {
  const d = new Date((toDay(iso) + n) * DAY);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/**
 * Where this billing cycle is heading.
 * @param {object} p
 * @param {string} p.startDate     date of the opening meter reading
 * @param {number} p.startReading  the opening reading (kWh register)
 * @param {Array<{date: string, reading: number}>} p.readings  later readings
 * @param {number} [p.cycleDays=30]
 * @param {string} [p.today]       ISO date, injectable for tests
 * @returns {object} status: 'empty' | 'need_more' | 'ok', plus the numbers
 */
export function analyzeCycle({ startDate, startReading, readings = [], cycleDays = 30, today = isoDate() }) {
  if (!startDate || startReading === '' || startReading === null || Number.isNaN(Number(startReading))) {
    return { status: 'empty' };
  }
  const start = Number(startReading);
  const endDate = addDays(startDate, cycleDays);

  // Readings must move forward in both date and register; anything else is a
  // typo or a meter replacement and is set aside rather than poisoning the pace.
  const valid = [];
  const ignored = [];
  let prev = { date: startDate, reading: start };
  for (const r of [...readings].sort((a, b) => a.date.localeCompare(b.date))) {
    if (r.date > prev.date && r.reading >= prev.reading) { valid.push(r); prev = r; } else ignored.push(r);
  }

  const base = { endDate, cycleDays, valid, ignored, daysToEnd: daysBetween(today, endDate) };
  if (!valid.length) return { ...base, status: 'need_more', used: 0, daysElapsed: 0, daysLeft: cycleDays };

  const latest = valid.at(-1);
  const used = latest.reading - start;
  const daysElapsed = daysBetween(startDate, latest.date);
  const daysLeft = Math.max(0, cycleDays - daysElapsed);
  const avgPerDay = used / daysElapsed;

  // Recent pace: the trailing week, so a heatwave shows up before the average does.
  const ref = [{ date: startDate, reading: start }, ...valid]
    .filter((r) => daysBetween(r.date, latest.date) >= 7).at(-1);
  const recentPerDay = ref && ref.date !== latest.date
    ? (latest.reading - ref.reading) / daysBetween(ref.date, latest.date)
    : avgPerDay;

  const trend = recentPerDay > avgPerDay * 1.15 ? 'up' : recentPerDay < avgPerDay * 0.85 ? 'down' : 'steady';
  return {
    ...base, status: 'ok', latest, used, daysElapsed, daysLeft,
    avgPerDay: round1(avgPerDay), recentPerDay: round1(recentPerDay), trend,
    projected: Math.round(used + avgPerDay * daysLeft),
    projectedRecent: Math.round(used + recentPerDay * daysLeft),
    stale: daysBetween(latest.date, today) >= 3,
  };
}

/**
 * Daily allowance to finish the cycle at or under `limit` units.
 * perDay is null when the cycle is over; over > 0 means the limit is already broken.
 */
export function allowanceFor(limit, { used, daysLeft }) {
  const left = limit - used;
  return { limit, left, over: left < 0 ? -left : 0, perDay: daysLeft > 0 && left >= 0 ? round1(left / daysLeft) : null };
}

/**
 * Consecutive most-recent months at or under `limit` units. Months must be
 * back-to-back: a missing month breaks the run, because protection is judged
 * on consecutive bills.
 * @param {Array<{month: string, units: number}>} bills  month = 'YYYY-MM'
 */
export function underLimitStreak(bills, limit) {
  const idx = (m) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
  const sorted = [...bills].sort((a, b) => b.month.localeCompare(a.month));
  let streak = 0;
  let expect = null;
  for (const b of sorted) {
    if (b.units > limit) break;
    if (expect !== null && idx(b.month) !== expect) break;
    streak++;
    expect = idx(b.month) - 1;
  }
  return streak;
}

export function historyStats(bills) {
  if (!bills.length) return null;
  const sum = (k) => bills.reduce((a, b) => a + b[k], 0);
  const peak = bills.reduce((m, b) => (b.units > m.units ? b : m), bills[0]);
  return {
    count: bills.length,
    avgUnits: Math.round(sum('units') / bills.length),
    avgAmount: Math.round(sum('amount') / bills.length),
    totalAmount: Math.round(sum('amount')),
    peak,
  };
}

// ---------------------------------------------------------------- months

const monthIdx = (m) => +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1);
const idxMonth = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
export const addMonths = (m, n) => idxMonth(monthIdx(m) + n);

/** The bill for the same calendar month one year earlier, or null. */
export function sameMonthLastYear(bills, month) {
  const target = addMonths(month, -12);
  return bills.find((b) => b.month === target) || null;
}

/**
 * Units outlook for the `n` months after the latest bill. Electricity use in
 * Pakistan is dominated by the season, so a month is forecast from the same
 * month last year, scaled by how the last three months compare with the same
 * three a year earlier (you bought an AC, you started switching it off...).
 * Without a year-ago bill it falls back to the recent average.
 * @returns {Array<{month: string, units: number, basis: 'last_year'|'recent'}>}
 */
export function forecastMonths(bills, n = 3) {
  if (bills.length < 3) return [];
  const byMonth = new Map(bills.map((b) => [b.month, b.units]));
  const latest = [...byMonth.keys()].sort().at(-1);
  const recent = [0, 1, 2].map((k) => addMonths(latest, -k));

  let scale = 1;
  const now = recent.map((m) => byMonth.get(m));
  const then = recent.map((m) => byMonth.get(addMonths(m, -12)));
  if (now.every((u) => u !== undefined) && then.every((u) => u !== undefined)) {
    const a = now.reduce((s, u) => s + u, 0);
    const b = then.reduce((s, u) => s + u, 0);
    if (b > 0) scale = Math.max(0.6, Math.min(1.6, a / b));
  }
  const known = recent.map((m) => byMonth.get(m)).filter((u) => u !== undefined);
  const recentAvg = known.reduce((s, u) => s + u, 0) / known.length;

  return Array.from({ length: n }, (_, k) => {
    const month = addMonths(latest, k + 1);
    const ago = byMonth.get(addMonths(month, -12));
    return ago !== undefined
      ? { month, units: Math.round(ago * scale), basis: 'last_year' }
      : { month, units: Math.round(recentAvg), basis: 'recent' };
  });
}

// ---------------------------------------------------------------- reminders

const icsEscape = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const icsDate = (iso) => iso.replaceAll('-', '');

/**
 * An iCalendar file with an all-day "read the meter" event every `everyDays`
 * days from `from` up to the cycle end, plus a "cycle ends" event. Calendar
 * apps import it once and remind offline, which a PWA cannot do reliably.
 */
export function buildIcs({ from, endDate, everyDays = 3, title, body, endTitle, stamp = '20260101T000000Z' }) {
  const events = [];
  for (let d = addDays(from, everyDays); d < endDate; d = addDays(d, everyDays)) {
    events.push({ date: d, summary: title });
  }
  events.push({ date: endDate, summary: endTitle });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BijliHisaab//Meter reminders//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:bh-${icsDate(e.date)}-${events.indexOf(e)}@bijlihisaab`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      `DESCRIPTION:${icsEscape(body)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT18H', `DESCRIPTION:${icsEscape(e.summary)}`, 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Why a new meter reading cannot be accepted, as an i18n key, or null if it
 * can. Readings must move forward in both date and register.
 */
export function readingError(cycle, date, raw, today = isoDate()) {
  if (!date || raw === '' || raw === null || raw === undefined || Number.isNaN(Number(raw))) return 'err_need_reading';
  const reading = Number(raw);
  const c = analyzeCycle({ ...cycle, today });
  const prev = c.valid?.at(-1) || { date: cycle.startDate, reading: Number(cycle.startReading) };
  if (date > today) return 'err_future';
  if (date <= prev.date) return 'err_date_order';
  if (reading < prev.reading) return 'err_reading_lower';
  return null;
}

/**
 * Should the app nudge for a reading? Only during a live cycle, when the
 * newest reading is `after` days old or more and today is not dismissed.
 * @returns {{days: number, last: {date: string, reading: number}}|null}
 */
export function readingDue(cycle, { today = isoDate(), after = 3, dismissed = '' } = {}) {
  if (!cycle?.startDate || dismissed === today) return null;
  const c = analyzeCycle({ ...cycle, today });
  if (c.status === 'empty') return null;
  const last = c.valid?.at(-1) || { date: cycle.startDate, reading: Number(cycle.startReading) };
  const days = daysBetween(last.date, today);
  if (days < after || daysBetween(today, c.endDate) < -3) return null;
  return { days, last };
}
