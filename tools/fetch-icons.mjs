// One-off: vendor Tabler icons (MIT) as an SVG sprite fragment.
// Usage: node tools/fetch-icons.mjs > /tmp/sprite.html
const ICONS = [
  'bolt', 'gauge', 'plug', 'flame', 'shield-check', 'wallet', 'receipt',
  'receipt-tax', 'trending-up', 'search', 'share', 'language', 'moon', 'sun',
  'alert-triangle', 'check', 'external-link', 'minus', 'plus', 'info-circle',
];

const out = [];
for (const name of ICONS) {
  const url = `https://api.iconify.design/tabler/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`FAIL ${name}: HTTP ${res.status}`); process.exit(1); }
  const svg = await res.text();
  const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').trim();
  out.push(`  <symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`);
}
console.log(out.join('\n'));
