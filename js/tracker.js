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
