// Tariff freshness check, run monthly by .github/workflows/tariff-freshness.yml.
// FPA changes every month and QTA every quarter, so a tariff file that has not
// been re-verified for ~5 weeks is probably wrong somewhere. This script reads
// every tariff set, reports what to re-check, and tells the workflow whether
// to open an issue. It never edits data: a human with a source link does that.
//
//   node tools/freshness.mjs [--today YYYY-MM-DD]

import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const STALE_AFTER_DAYS = 35;

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/**
 * @param {Array<{set: string, file: string, tariff: object}>} sets
 * @param {string} today ISO date
 * @returns {{stale: boolean, title: string, body: string, rows: Array}}
 */
export function freshnessReport(sets, today) {
  const rows = sets.map(({ set, file, tariff }) => {
    const age = dayNum(today) - dayNum(tariff.verified_on);
    const adj = Object.fromEntries((tariff.adjustments_per_kwh || []).map((a) => [a.id, a]));
    return {
      set, file, age,
      stale: age > STALE_AFTER_DAYS,
      verified: tariff.verified_on,
      effective: tariff.effective_date,
      fpa: adj.fpa ? `${adj.fpa.rate} (${adj.fpa.name_en})` : 'n/a',
      qta: adj.qta ? `${adj.qta.rate} (${adj.qta.name_en})` : 'n/a',
    };
  });
  const stale = rows.some((r) => r.stale);
  const month = today.slice(0, 7);
  const body = [
    `Monthly tariff check for **${month}**. FPA is notified monthly and QTA quarterly by NEPRA; a stale rate makes every estimate wrong.`,
    '',
    '| Tariff set | File | Verified | Age (days) | FPA now | QTA now |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.set} | \`${r.file}\` | ${r.verified} | ${r.age}${r.stale ? ' ⚠️' : ''} | ${r.fpa} | ${r.qta} |`),
    '',
    '### To do',
    '- [ ] Check NEPRA for the latest FCA/FPA decision (https://nepra.org.pk) and update `adjustments_per_kwh` → `fpa`',
    '- [ ] Check whether a new quarterly adjustment (QTA) took effect and update `qta`',
    '- [ ] Check for a new base-tariff SRO (slab rates, fixed charges)',
    '- [ ] Add a `sources` entry for every changed number, bump `verified_on`, run `npm test`',
    '',
    `_Opened automatically because a tariff file was last verified more than ${STALE_AFTER_DAYS} days ago._`,
  ].join('\n');
  return { stale, title: `Tariff check: ${month}`, body, rows };
}

function loadSets(root) {
  const base = join(root, 'data', 'tariffs');
  return readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    const index = JSON.parse(readFileSync(join(base, d.name, 'index.json'), 'utf8'));
    const file = `data/tariffs/${d.name}/${index.default}.json`;
    return { set: d.name, file, tariff: JSON.parse(readFileSync(join(root, file), 'utf8')) };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--today');
  const today = i > 0 ? process.argv[i + 1] : new Date().toISOString().slice(0, 10);
  const report = freshnessReport(loadSets(join(dirname(fileURLToPath(import.meta.url)), '..')), today);
  console.log(report.body);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `stale=${report.stale}\ntitle=${report.title}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `body<<__BH_EOF__\n${report.body}\n__BH_EOF__\n`);
  }
}
