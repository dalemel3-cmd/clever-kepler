// Renders a lift leaderboard to a shareable PNG: 1080 wide, as tall as its rows
// (square minimum - fits a text message or a post). Pure canvas, no dependencies.
const W = 1080;
const ROW_H = 84;
const HEADER_H = 420;   // logo + title + subtitle
const FOOTER_H = 90;
const C = {
  bg: '#030e20', panel: '#0a1628', line: '#1f3252', gold: '#b89c5b',
  text: '#f3f5f8', muted: '#93a0b4', silver: '#c0c7d2', bronze: '#c2773a',
};

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null); // a missing logo must not block the export
  img.src = src;
});

// Shrinks text until it fits maxWidth, then ellipsizes as a last resort.
function fitText(ctx, text, maxWidth, font, minSize) {
  let size = font.size;
  const set = () => { ctx.font = `${font.weight} ${size}px ${font.family}`; };
  set();
  while (ctx.measureText(text).width > maxWidth && size > minSize) { size -= 1; set(); }
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {object} opts
 * @param {Array}  opts.rows      from buildLeaderboard (already ranked)
 * @param {string} opts.lift      e.g. "Squat"
 * @param {string} opts.sportLabel e.g. "Football" or "All teams"
 * @param {string} opts.rankLabel e.g. "Estimated 1RM"
 * @param {string} opts.valueLabel column label, e.g. "EST. 1RM"
 * @param {string} opts.periodLabel e.g. "Aug 3 – Sep 29, 2026"
 * @param {number} opts.limit     rows to draw (max 15 fit)
 * @returns {Promise<Blob>}
 */
export async function renderLeaderboardPng({ rows, lift, sportLabel, rankLabel, valueLabel, periodLabel, limit = 10, logoSrc = '/logo1.png' }) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* use fallbacks */ } }
  const display = '"Oswald", "Arial Narrow", Impact, sans-serif';
  const body = '"Inter", "Helvetica Neue", Arial, sans-serif';
  // Height follows the number of rows, so a 3-athlete board isn't mostly empty space;
  // never shorter than a square, so it still reads well as a post.
  const shownCount = Math.max(Math.min(rows.length, limit), 1);
  const H = Math.max(W, HEADER_H + shownCount * ROW_H + FOOTER_H);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  // Logo band
  const logo = await loadImage(logoSrc);
  let y = 56;
  if (logo) {
    const lh = 150, lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 28;
  } else {
    ctx.fillStyle = C.text; ctx.font = `700 64px ${display}`; ctx.textAlign = 'center';
    ctx.fillText('HUMAN PERFORMANCE', W / 2, y + 70); y += 110;
  }

  // Title block
  ctx.textAlign = 'center';
  ctx.fillStyle = C.gold;
  ctx.fillRect(W / 2 - 60, y, 120, 4);
  y += 62;
  ctx.fillStyle = C.text;
  ctx.fillText(fitText(ctx, `${lift} Leaderboard`.toUpperCase(), W - 120, { weight: 700, size: 64, family: display }, 36), W / 2, y);
  y += 46;
  ctx.fillStyle = C.muted;
  ctx.font = `500 28px ${body}`;
  ctx.fillText(fitText(ctx, `${sportLabel} · ${rankLabel} · ${periodLabel}`, W - 120, { weight: 500, size: 28, family: body }, 20), W / 2, y);
  y += 44;

  // Rows
  const shown = rows.slice(0, limit);
  const top = y;
  const rowH = ROW_H;
  const x0 = 60, x1 = W - 60;
  if (shown.length === 0) {
    ctx.fillStyle = C.muted; ctx.font = `500 32px ${body}`;
    ctx.fillText(`No ${lift} results in this period.`, W / 2, top + 120);
  }
  shown.forEach((r, i) => {
    const ry = top + i * rowH;
    const rank = i + 1;
    const medal = rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : null;
    ctx.fillStyle = i % 2 === 0 ? C.panel : C.bg;
    roundRect(ctx, x0, ry + 4, x1 - x0, rowH - 8, 14); ctx.fill();
    if (medal) { ctx.fillStyle = medal; roundRect(ctx, x0, ry + 4, 8, rowH - 8, 4); ctx.fill(); }

    const mid = ry + rowH / 2;
    ctx.textBaseline = 'middle';
    // rank
    ctx.textAlign = 'center';
    ctx.fillStyle = medal || C.muted;
    ctx.font = `700 ${Math.round(rowH * 0.45)}px ${display}`;
    ctx.fillText(String(rank), x0 + 60, mid);
    // name + detail
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    const name = fitText(ctx, r.athlete_name.toUpperCase(), 560, { weight: 700, size: Math.round(rowH * 0.36), family: display }, 18);
    ctx.fillText(name, x0 + 112, mid - rowH * 0.14);
    ctx.fillStyle = C.muted;
    ctx.font = `500 ${Math.round(rowH * 0.24)}px ${body}`;
    const detail = [r.sport, `${r.weight_lbs} × ${r.reps}`, r.bodyWeight ? `${Math.round(r.bodyWeight)} lb BW` : null].filter(Boolean).join('  ·  ');
    ctx.fillText(fitText(ctx, detail, 560, { weight: 500, size: Math.round(rowH * 0.24), family: body }, 14), x0 + 112, mid + rowH * 0.2);
    // value
    ctx.textAlign = 'right';
    ctx.fillStyle = rank === 1 ? C.gold : C.text;
    ctx.font = `700 ${Math.round(rowH * 0.46)}px ${display}`;
    ctx.fillText(r.display, x1 - 28, mid - rowH * 0.06);
    ctx.fillStyle = C.muted;
    ctx.font = `600 ${Math.round(rowH * 0.18)}px ${body}`;
    ctx.fillText(valueLabel, x1 - 28, mid + rowH * 0.28);
    ctx.textBaseline = 'alphabetic';
  });

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = C.muted;
  ctx.font = `500 22px ${body}`;
  const more = rows.length > shown.length ? `Top ${shown.length} of ${rows.length} athletes  ·  ` : '';
  ctx.fillText(`${more}Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, W / 2, H - 40);

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}

// Share sheet on iPad/iPhone (Save Image, AirDrop, Messages); plain download elsewhere.
export async function shareOrDownload(blob, filename) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename.replace(/\.png$/, '') }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
