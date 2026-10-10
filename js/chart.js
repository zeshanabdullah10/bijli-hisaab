// Slab-cliff chart, Apple-Stocks style: one accent line with a soft area
// gradient, hairline slab boundaries, a floating "you are here" pill, and
// drag-to-explore. Under landing-slab billing the total is piecewise-linear
// in units, so a polyline through the slab boundaries is exact. All colors
// come from CSS custom properties, so the chart follows light/dark for free.

import { computeBill } from './tariff.js';
import { fmt } from './i18n.js';

export function renderCliffChart({ host, ctx, consumerType, units, t, onDrag }) {
  const cls = ctx.tariff.consumer_classes.domestic[consumerType];
  const MAX_U = Math.max(800, units + 100);
  const billAt = (u) => computeBill({ ...ctx, units: u, consumerType }).total;

  const W = 640;
  const H = 280;
  const M = { top: 30, right: 14, bottom: 30, left: 50 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const maxY = billAt(MAX_U);
  const px = (u) => M.left + (u / MAX_U) * iw;
  const py = (rs) => M.top + ih - (rs / maxY) * ih;

  // Sample at slab boundaries and midpoints; linear inside each slab.
  const bounds = cls.slabs.map((s) => s.up_to).filter((u) => u !== null && u <= MAX_U);
  const xs = [0, ...bounds, MAX_U];
  for (let i = 0; i < bounds.length; i++) {
    const lo = i === 0 ? 0 : bounds[i - 1];
    xs.push(Math.floor((lo + bounds[i]) / 2));
  }
  // The current-units point must join the sorted sample list BEFORE sorting:
  // appended afterwards it becomes the polyline's last vertex and the path
  // draws a straight segment backwards from the right edge to the marker.
  if (!xs.includes(units)) xs.push(units);
  xs.sort((a, b) => a - b);

  const pts = xs.map((u) => [px(u), py(billAt(u))]);
  const linePath = 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  const areaPath = `${linePath} L${px(MAX_U).toFixed(1)},${M.top + ih} L${M.left},${M.top + ih} Z`;

  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const v = Math.round((maxY * f) / 5000) * 5000;
    return `<line x1="${M.left}" y1="${py(v)}" x2="${W - M.right}" y2="${py(v)}" stroke="var(--hairline)" stroke-width="1"/>
            <text x="${M.left - 7}" y="${py(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--text-3)">${fmt(v / 1000)}k</text>`;
  }).join('');

  const boundaries = bounds.map((b) => `
    <line x1="${px(b)}" y1="${M.top - 4}" x2="${px(b)}" y2="${M.top + ih}" stroke="var(--danger)" stroke-width="1" stroke-dasharray="3 5" opacity="0.4"/>
    <text x="${px(b)}" y="${H - 10}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text-3)">${b}</text>`).join('');

  const yHere = py(billAt(units));
  const xHere = px(units);
  const flipLabel = xHere > W - 110;
  const pillText = `Rs ${fmt(billAt(units))}`;
  const pillW = pillText.length * 6.4 + 18;
  const marker = `
    <line x1="${xHere}" y1="${yHere}" x2="${xHere}" y2="${M.top + ih}" stroke="var(--chart-line)" stroke-width="1" opacity="0.35"/>
    <circle cx="${xHere}" cy="${yHere}" r="9" fill="var(--chart-line)" opacity="0.18"/>
    <circle cx="${xHere}" cy="${yHere}" r="5" fill="var(--chart-line)" stroke="var(--surface)" stroke-width="2.5"/>
    <g transform="translate(${flipLabel ? xHere - 14 : xHere + 14}, ${Math.max(M.top + 8, yHere - 14)})">
      <rect x="${flipLabel ? -pillW : 0}" y="-13" width="${pillW}" height="19" rx="9.5" fill="var(--text)" opacity="0.88"/>
      <text x="${flipLabel ? -pillW / 2 : pillW / 2}" y="0.5" text-anchor="middle" dominant-baseline="middle" font-size="10.5" font-weight="700" fill="var(--surface)">${pillText}</text>
    </g>`;

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('cliff_title')}: ${units}">
      <defs>
        <linearGradient id="bh-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-fill-a)"/>
          <stop offset="100%" stop-color="var(--chart-fill-b)"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaPath}" fill="url(#bh-area)"/>
      <path d="${linePath}" fill="none" stroke="var(--chart-line)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${boundaries}
      <line x1="${M.left}" y1="${M.top + ih}" x2="${W - M.right}" y2="${M.top + ih}" stroke="var(--hairline)" stroke-width="1.5"/>
      ${marker}
    </svg>`;

  if (onDrag) wireDrag(host, onDrag, MAX_U);
}

// Listeners live on the persistent host, never on the SVG: every re-render
// replaces the SVG node, which would orphan the pointer mid-drag and leave a
// stale handler reading a detached element's zero rect.
function wireDrag(host, onDrag, MAX_U) {
  if (host._dragAbort) host._dragAbort.abort();
  const ac = new AbortController();
  host._dragAbort = ac;
  const opts = { signal: ac.signal };
  const PLOT_L = 50;        // M.left in viewBox units
  const PLOT_R = 640 - 14;  // W - M.right

  const unitsFromEvent = (e) => {
    const svg = host.querySelector('svg');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0) return null;
    const x = ((e.clientX - r.left) / r.width) * 640;
    const u = ((x - PLOT_L) / (PLOT_R - PLOT_L)) * MAX_U;
    return Math.round(Math.max(0, Math.min(MAX_U, u)));
  };

  const move = (e) => {
    if (!host._dragging) return;
    const u = unitsFromEvent(e);
    if (u === null) return;
    e.preventDefault();
    onDrag(u);
  };
  const down = (e) => {
    host._dragging = true;
    try { host.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    move(e);
  };
  const up = () => { host._dragging = false; };

  host.addEventListener('pointerdown', down, opts);
  host.addEventListener('pointermove', move, opts);
  host.addEventListener('pointerup', up, opts);
  host.addEventListener('pointercancel', up, opts);
}

/**
 * Cycle burn-up chart: cumulative units through the billing cycle. Solid line
 * for what the meter has recorded, dashed line for where the current pace
 * lands, and the slab limits as horizontal hairlines, so "will I cross 200?"
 * is answered by looking at where two lines meet.
 */
export function renderCycleChart({ host, points, cycleDays, projected, limits, labels }) {
  const W = 360;
  const H = 200;
  const M = { top: 14, right: 32, bottom: 24, left: 4 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const peak = Math.max(projected, points.at(-1).units);
  const maxY = limits.find((l) => l >= peak * 1.05) ?? Math.ceil((peak * 1.1) / 50) * 50;
  const px = (d) => M.left + (d / cycleDays) * iw;
  const py = (u) => M.top + ih - (Math.min(u, maxY) / maxY) * ih;
  const last = points.at(-1);

  const xy = points.map((p) => `${px(p.day).toFixed(1)},${py(p.units).toFixed(1)}`);
  const line = `M${xy.join(' L')}`;
  const area = `${line} L${px(last.day).toFixed(1)},${M.top + ih} L${px(0)},${M.top + ih} Z`;

  const crossed = (l) => projected > l;
  const rules = limits.filter((l) => l <= maxY).map((l) => `
    <line x1="${M.left}" y1="${py(l)}" x2="${W - M.right}" y2="${py(l)}" stroke="${crossed(l) ? 'var(--danger)' : 'var(--text-3)'}" stroke-width="1" stroke-dasharray="3 5" opacity="${crossed(l) ? 0.7 : 0.45}"/>
    <text x="${W - M.right + 6}" y="${py(l) + 3.5}" font-size="10.5" font-weight="700" fill="${crossed(l) ? 'var(--danger)' : 'var(--text-3)'}">${l}</text>`).join('');

  const dots = points.slice(1).map((p) =>
    `<circle cx="${px(p.day).toFixed(1)}" cy="${py(p.units).toFixed(1)}" r="2.75" fill="var(--surface)" stroke="var(--chart-line)" stroke-width="1.75"/>`).join('');

  const projPill = `${fmt(projected)}`;
  const pillW = projPill.length * 6.4 + 14;
  const yEnd = py(projected);

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${labels.aria}">
      <defs>
        <linearGradient id="bh-cyc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-fill-a)"/>
          <stop offset="100%" stop-color="var(--chart-fill-b)"/>
        </linearGradient>
      </defs>
      ${rules}
      <path d="${area}" fill="url(#bh-cyc)"/>
      <line x1="${px(last.day)}" y1="${py(last.units)}" x2="${px(cycleDays)}" y2="${yEnd}" stroke="var(--chart-line)" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round" opacity="0.75"/>
      <path d="${line}" fill="none" stroke="var(--chart-line)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      <circle cx="${px(cycleDays)}" cy="${yEnd}" r="4.5" fill="var(--chart-line)" opacity="0.5"/>
      <g transform="translate(${px(cycleDays) - 8}, ${Math.max(M.top + 10, yEnd - 16)})">
        <rect x="${-pillW}" y="-11" width="${pillW}" height="19" rx="9.5" fill="var(--text)" opacity="0.88"/>
        <text x="${-pillW / 2}" y="0" text-anchor="middle" dominant-baseline="middle" font-size="10.5" font-weight="700" fill="var(--surface)">${projPill}</text>
      </g>
      <line x1="${M.left}" y1="${M.top + ih}" x2="${W - M.right}" y2="${M.top + ih}" stroke="var(--hairline)" stroke-width="1.5"/>
      <text x="${M.left}" y="${H - 6}" font-size="10.5" fill="var(--text-3)">${labels.start}</text>
      <text x="${px(last.day)}" y="${H - 6}" font-size="10.5" font-weight="700" text-anchor="middle" fill="var(--text-2)">${labels.latest}</text>
      <text x="${W - M.right}" y="${H - 6}" font-size="10.5" text-anchor="end" fill="var(--text-3)">${labels.end}</text>
    </svg>`;
}
