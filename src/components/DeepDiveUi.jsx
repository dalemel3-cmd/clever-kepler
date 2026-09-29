import React from 'react';

// Shared look for the Performance deep-dive tabs (RPE, Strength): same card, heading,
// chip and sparkline styles as AnalyticsScreen, so the tabs read as one family.
export const card = {
  padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.10)',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
  display: 'flex', flexDirection: 'column', gap: '16px',
};
export const h3 = { fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', margin: 0, letterSpacing: '0.03em' };
export const label = { fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
export const optionStyle = { background: 'var(--navy-900)', color: 'var(--color-text)' };
export const selectStyle = { height: '38px', padding: '0 12px', fontSize: '13px', fontWeight: 700, borderRadius: '10px' };
export const axis = { stroke: 'var(--color-text-muted)', fontSize: 11 };
export const grid = 'rgba(255,255,255,0.06)';
export const th = { padding: '10px 10px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' };
export const td = { padding: '10px', fontSize: '13px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
export const tooltipStyle = { background: 'var(--navy-900)', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '12px' };
export const TONE = {
  bad: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#ef4444' },
  warn: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b' },
  ok: { bg: 'rgba(16, 185, 129, 0.15)', fg: '#10b981' },
  muted: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--color-text-muted)' },
};

export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d));
export const pct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`);
export const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function Chip({ tone = 'muted', children }) {
  const c = TONE[tone];
  return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function Tile({ value, text, tone }) {
  return (
    <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px', flex: '1 1 130px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, color: tone ? TONE[tone].fg : 'var(--white)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={label}>{text}</div>
    </div>
  );
}

// Tiny weekly trend line (oldest -> newest). Null values are skipped, not drawn as 0.
export function Sparkline({ values, color = '#a78bfa', ariaLabel }) {
  const w = 96, h = 28;
  const nums = values.filter(v => v != null);
  const max = Math.max(...nums, 1), min = Math.min(...nums, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => (v == null ? null : [(i / Math.max(values.length - 1, 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)])).filter(Boolean);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} role="img" aria-label={ariaLabel}>
      {pts.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth="2" />}
      {last && <circle cx={last[0]} cy={last[1]} r="3" fill={color} />}
    </svg>
  );
}

// The table scrolls sideways on narrow screens; an expanded detail row is pinned to
// the visible width so its charts aren't stretched off-screen with the columns.
export function useVisibleWidth() {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  });
  return [ref, width];
}
