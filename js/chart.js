// Hand-rolled SVG chart of the slab cliff. Under landing-slab billing the
// total is piecewise-linear in units (rate × units + per-kW fixed + %-taxes),
// so a polyline through the slab boundaries is exact — no plotting library
// needed, and the whole app stays dependency-free.

import { computeBill } from './tariff.js';
import { fmt } from './i18n.js';

const SLAB_COLORS = ['#2e7d32', '#558b2f', '#827717', '#b08600', '#c26a00', '#c9551f', '#bf4117', '#b3261e'];

export function renderCliffChart({ host, ctx, consumerType, units, t }) {
  const cls = ctx.tariff.consumer_classes.domestic[consumerType];
  const MAX_U = Math.max(800, units + 100);
  const billAt = (u) => computeBill({ ...ctx, units: u, consumerType }).total;

  // Sample exactly at boundaries and midpoints; within a slab the curve is linear.
  const bounds = cls.slabs.map((s) => s.up_to).filter((u) => u !== null && u <= MAX_U);
  const xs = [0, ...bounds, MAX_U];
  for (let i = 0; i < bounds.length; i++) {
    const lo = i === 0 ? 0 : bounds[i - 1];
    xs.push(Math.floor((lo + bounds[i]) / 2));
  }
  xs.sort((a, b) => a - b);
  if (!xs.includes(units)) xs.push(units);

  const W = 640;
  const H = 300;
  const M = { top: 18, right: 16, bottom: 34, left: 58 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const maxY = billAt(MAX_U);
  const px = (u) => M.left + (u / MAX_U) * iw;
  const py = (rs) => M.top + ih - (rs / maxY) * ih;

  // One filled segment per slab so the colors encode where the money goes.
  const segs = [];
  let prevU = 0;
  let prevY = py(billAt(0));
  cls.slabs.forEach((s, i) => {
    const u = s.up_to === null ? MAX_U : Math.min(s.up_to, MAX_U);
    if (u <= prevU) return;
    const y = py(billAt(u));
    const up_to = s.up_to === null ? MAX_U : s.up_to;
    segs.push(`<polygon points="${px(prevU)},${M.top + ih} ${px(prevU)},${prevY} ${px(u)},${y} ${px(u)},${M.top + ih}" fill="${SLAB_COLORS[i % SLAB_COLORS.length]}" opacity="0.14"/>`);
    segs.push(`<line x1="${px(prevU)}" y1="${prevY}" x2="${px(u)}" y2="${y}" stroke="${SLAB_COLORS[i % SLAB_COLORS.length]}" stroke-width="2.5" stroke-linecap="round"/>`);
    if (up_to !== null && up_to <= MAX_U) {
      segs.push(`<line x1="${px(u)}" y1="${M.top}" x2="${px(u)}" y2="${M.top + ih}" stroke="#b3261e" stroke-dasharray="4 4" opacity="0.55"/>`);
      segs.push(`<text x="${px(u)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#b3261e">${up_to}</text>`);
    }
    prevU = u;
    prevY = y;
  });

  // Gridlines + y labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxY * f) / 5000) * 5000);
  const grid = yTicks.map((v) =>
    `<line x1="${M.left}" y1="${py(v)}" x2="${W - M.right}" y2="${py(v)}" stroke="#000" opacity="0.07"/>
     <text x="${M.left - 6}" y="${py(v) + 4}" text-anchor="end" font-size="10" fill="#667">${fmt(v / 1000)}k</text>`,
  ).join('');

  // "You are here" marker
  const yHere = py(billAt(units));
  const marker = `
    <line x1="${M.left}" y1="${yHere}" x2="${px(units)}" y2="${yHere}" stroke="#0b5c3f" stroke-dasharray="3 3" opacity="0.7"/>
    <circle cx="${px(units)}" cy="${yHere}" r="5" fill="#0b5c3f" stroke="#fff" stroke-width="2"/>
    <text x="${px(units)}" y="${yHere - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#0b5c3f">Rs ${fmt(billAt(units))}</text>`;

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('cliff_title')}" style="width:100%;height:auto;display:block;direction:ltr">
      ${grid}
      ${segs.join('')}
      <line x1="${M.left}" y1="${M.top + ih}" x2="${W - M.right}" y2="${M.top + ih}" stroke="#334" stroke-width="1"/>
      <text x="${W - M.right}" y="${H - 12}" text-anchor="end" font-size="11" fill="#667">${t('units_label').replace(/ \(.*\)/, '')} →</text>
      ${marker}
    </svg>`;
}
