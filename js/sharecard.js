// Shareable image cards (bill explanation, year in review). Drawn on a canvas
// so they work offline and travel well on WhatsApp; colours mirror the dark
// hero card so the image looks like the app in any theme.

const W = 1080;
const PAD = 72;
const C = {
  bg: '#14171c', panel: '#1f242c', text: '#f6f7f8', dim: 'rgba(246,247,248,0.62)',
  line: 'rgba(246,247,248,0.12)', volt: '#ffc61a', good: '#5fe0b0', bad: '#ff9a8c',
  seg: ['#7d838c', '#3987e5', '#eb6834', '#1baf7a', '#eda100'],
};
const FONT = '"Space Grotesk", "Noto Nastaliq Urdu", system-ui, sans-serif';

/**
 * @param {object} card
 * @param {string} card.kicker   small caps line at the top
 * @param {string} card.big      the headline number
 * @param {string} [card.bigUnit]
 * @param {string} [card.sub]
 * @param {Array<{amount: number, seg: number}>} [card.bar]  proportional bar
 * @param {Array<{label: string, value: string, tone?: string, seg?: number, strong?: boolean, gap?: boolean}>} card.rows
 * @param {string} card.footer
 * @param {boolean} [card.rtl]
 */
export async function renderCard(card) {
  try {
    await Promise.all([document.fonts.load(`700 40px "Space Grotesk"`), card.rtl ? document.fonts.load(`400 40px "Noto Nastaliq Urdu"`) : null]);
  } catch { /* draw with fallbacks */ }
  const lh = card.rtl ? 1.9 : 1.35;
  const rowH = card.rtl ? 86 : 66;
  const H = Math.max(1080, 560 + (card.bar ? 70 : 0) + card.rows.length * rowH + 140);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const x = (px) => (card.rtl ? W - px : px);
  const start = card.rtl ? 'right' : 'left';
  const end = card.rtl ? 'left' : 'right';
  g.direction = card.rtl ? 'rtl' : 'ltr';

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.75, 0, 0, W * 0.75, 0, 700);
  glow.addColorStop(0, 'rgba(255,198,26,0.22)');
  glow.addColorStop(1, 'rgba(255,198,26,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, 700);

  let y = PAD + 30;
  // brand
  g.fillStyle = C.volt;
  roundRect(g, x(PAD) - (card.rtl ? 56 : 0), y - 40, 56, 56, 14);
  g.fill();
  g.fillStyle = C.bg;
  g.font = `700 36px ${FONT}`;
  g.textAlign = 'center';
  g.fillText('⚡', x(PAD + 28), y);
  g.textAlign = start;
  g.fillStyle = C.text;
  g.font = `700 34px ${FONT}`;
  g.fillText('BijliHisaab', x(PAD + 76), y);

  y += 90;
  g.fillStyle = C.dim;
  g.font = `700 28px ${FONT}`;
  g.fillText(card.kicker, x(PAD), y);

  y += 30 + 150;
  g.fillStyle = C.volt;
  g.font = `700 150px ${FONT}`;
  g.fillText(card.big, x(PAD), y);
  if (card.bigUnit) {
    const w = g.measureText(card.big).width;
    g.fillStyle = C.dim;
    g.font = `600 44px ${FONT}`;
    g.fillText(card.bigUnit, x(PAD + w + 18), y);
  }
  if (card.sub) {
    y += 64;
    g.fillStyle = C.dim;
    g.font = `500 32px ${FONT}`;
    y = wrap(g, card.sub, x(PAD), y, W - PAD * 2, 32 * lh);
  }

  if (card.bar?.length) {
    y += 44;
    const total = card.bar.reduce((s, b) => s + b.amount, 0) || 1;
    let bx = PAD;
    const bw = W - PAD * 2;
    for (const b of card.bar) {
      const w = (b.amount / total) * bw;
      g.fillStyle = C.seg[b.seg] || C.seg[0];
      roundRect(g, card.rtl ? W - bx - w : bx, y, Math.max(4, w - 6), 22, 11);
      g.fill();
      bx += w;
    }
    y += 22;
  }

  y += 50;
  for (const r of card.rows) {
    if (r.gap) y += 18;
    g.strokeStyle = C.line;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(PAD, y);
    g.lineTo(W - PAD, y);
    g.stroke();
    y += rowH - 20;
    let lx = PAD;
    if (r.seg !== undefined) {
      g.fillStyle = C.seg[r.seg] || C.seg[0];
      g.beginPath();
      g.arc(x(PAD + 9), y - 11, 9, 0, Math.PI * 2);
      g.fill();
      lx += 32;
    }
    g.textAlign = start;
    g.fillStyle = r.strong ? C.text : C.dim;
    g.font = `${r.strong ? 700 : 500} ${r.strong ? 34 : 31}px ${FONT}`;
    g.fillText(fit(g, r.label, W - PAD * 2 - 300), x(lx), y);
    g.textAlign = end;
    g.fillStyle = r.tone === 'good' ? C.good : r.tone === 'bad' ? C.bad : C.text;
    g.font = `700 ${r.strong ? 40 : 33}px ${FONT}`;
    g.fillText(r.value, x(W - PAD), y);
    y += 20;
  }

  g.textAlign = start;
  g.fillStyle = C.dim;
  g.font = `500 24px ${FONT}`;
  wrap(g, card.footer, x(PAD), H - PAD - (card.rtl ? 40 : 24), W - PAD * 2, 24 * lh);
  return canvas;
}

/** Share the card as an image where the platform allows it, else download it. */
export async function shareCard(canvas, filename, text) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function wrap(g, text, x, y, max, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) {
      g.fillText(line, x, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y;
}
