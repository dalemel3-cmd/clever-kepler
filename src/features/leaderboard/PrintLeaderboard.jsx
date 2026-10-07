import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Image as ImageIcon } from 'lucide-react';
import { TIMEFRAMES, timeframeBounds, describeBounds } from '../lifts/liftRanking';
import { availableMetrics, buildPrintLeaderboard } from './printLeaderboardData';

// Printable metric leaderboard, built from the "HPD Metric Leaderboard" design handoff
// (docs/HANDOFF.md §106). The sheet is a fixed US Letter page (816x1056 CSS px); all
// measurements below are the handoff's. Opened from the Lift Tracker leaderboard and the
// Jumps & Sprints tab. PDF = the browser's print dialog (one Letter sheet per page);
// PNG = one 1632x2112 image per page.
const C = {
  navy900: '#061c41', navy700: '#133b78', gold500: '#b89c5b', gold700: '#93783f', white: '#ffffff',
  text: 'oklch(0.19 0.014 258)', muted: 'oklch(0.38 0.012 258)', faint: 'oklch(0.58 0.010 258)',
  border: 'oklch(0.88 0.006 258)', borderStrong: 'oklch(0.79 0.008 258)',
  success: 'oklch(0.58 0.11 152)', danger: 'oklch(0.55 0.16 25)',
};
const DISPLAY = "'Oswald', Impact, sans-serif";
const BODY = "'Manrope', 'Inter', system-ui, sans-serif";
const PAGE_W = 816, PAGE_H = 1056;
// Optional columns (toolbar toggles): pos, class, change vs first test, change vs last week.
const colsFor = (show, top) => {
  // With value columns on, the chart/change/best narrow so the name keeps its room.
  const tight = show.initial || show.recent;
  return ['40px', 'minmax(0,1fr)', show.pos && '36px', show.cls && '42px', top ? (tight ? '96px' : '128px') : (tight ? '80px' : '110px'),
    show.initial && '62px', show.recent && '62px', show.first && (tight ? '62px' : '84px'), show.week && (tight ? '62px' : '84px'), show.e1rm && '64px', show.lift ? '104px' : (tight ? '96px' : '112px')].filter(Boolean).join(' ');
};
const nameClamp = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.15, wordBreak: 'break-word' };
const toneColor = (t) => (t === 'up' ? C.success : t === 'down' ? C.danger : C.faint);
const LOGO = '/hp-logo.png';

const pageStyle = (padding) => ({
  width: PAGE_W, height: PAGE_H, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  background: C.white, borderTop: `10px solid ${C.navy900}`, padding, fontFamily: BODY, color: C.text,
  WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', overflow: 'hidden', flex: 'none',
});
const colHead = (cols, size, padding) => ({
  display: 'grid', gridTemplateColumns: cols, gap: 8, padding, borderBottom: `1px solid ${C.borderStrong}`,
  fontWeight: 700, fontSize: size, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint,
});
const HeadCells = ({ show }) => (<><div>Rk</div><div>Athlete</div>{show.pos && <div>Pos</div>}{show.cls && <div>Class</div>}<div>Progression</div>{show.initial && <div style={{ textAlign: 'right' }}>Initial (date)</div>}{show.recent && <div style={{ textAlign: 'right' }}>Recent (date)</div>}{show.first && <div style={{ textAlign: 'right' }}>{show.week ? 'vs 1st' : 'Change'}</div>}{show.week && <div style={{ textAlign: 'right' }}>vs Last Wk</div>}{show.e1rm && <div style={{ textAlign: 'right' }}>Est. 1RM</div>}<div style={{ textAlign: 'right' }}>{show.lift ? (show.initial ? 'Best set (date)' : 'Best set') : (show.initial ? 'Best (date)' : 'Best')}</div></>);
// Lifts show the set itself ("225 × 3"); jumps/sprints show the number.
const V = (r, k, show) => (show.lift ? (r[`${k}Set`] || r[k === 'best' ? 'value' : k]) : r[k === 'best' ? 'value' : k]);
const changeNote = (show) => [show.initial && 'Initial = first test (date); date under Best = when it was set', show.recent && 'Recent = latest test (date)',show.first && 'latest vs. first test', show.week && 'latest vs. last result a week+ ago'].filter(Boolean).join(' · ');

function TopPage({ m, team, period, data, show }) {
  const COLS_TOP = colsFor(show, true);
  return (
    <div className="lb-page" data-testid="lb-page" style={pageStyle('40px 52px 28px')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, paddingBottom: 20, borderBottom: `3px solid ${C.gold500}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold700 }}>Top 10 Leaderboard</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 56, lineHeight: 1.02, textTransform: 'uppercase', color: C.navy900 }}>{m.title}</div>
          <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>{team} · {show.lift ? 'Best set (lb × reps)' : `Best ${m.measure} (${m.unit})`} · {period} · {data.total} athlete{data.total === 1 ? '' : 's'} tested</div>
        </div>
        <img src={LOGO} alt="Shiloh Christian Human Performance" style={{ height: 100, flexShrink: 0, margin: '-12px -12px -12px 0' }} />
      </div>
      <div style={colHead(COLS_TOP, 11, '16px 0 10px')}><HeadCells show={show} /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {data.top.map(r => (
          <div key={r.id} data-testid="lb-row" style={{ flex: 1, display: 'grid', gridTemplateColumns: COLS_TOP, gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
            <div>
              {r.rank <= 3
                ? <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.gold500, color: C.navy900, fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.rank}</span>
                : <span style={{ width: 36, display: 'flex', justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 500, fontSize: 22, color: C.navy700 }}>{r.rank}</span>}
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.navy900, ...nameClamp }}>{r.name}</div>
            {show.pos && <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>{r.pos}</div>}
            {show.cls && <div style={{ fontSize: 14, color: C.muted }}>{r.grad}</div>}
            <svg width="100%" height="36" viewBox="0 0 128 36" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
              <line x1="0" y1="34" x2="128" y2="34" style={{ stroke: C.border, strokeWidth: 1 }} />
              <polyline points={r.pts} style={{ fill: 'none', stroke: C.navy700, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
              <circle cx={r.cx} cy={r.cy} r="3.5" style={{ fill: C.gold500, stroke: C.navy900, strokeWidth: 1.5 }} />
            </svg>
            {show.initial && (
              <div data-testid="lb-initial" style={{ textAlign: 'right', lineHeight: 1.1 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: show.lift ? 17 : 20, color: C.navy700, whiteSpace: 'nowrap' }}>{V(r, 'initial', show)}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{r.initialDate}</div>
              </div>
            )}
            {show.recent && (
              <div data-testid="lb-recent" style={{ textAlign: 'right', lineHeight: 1.1 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: show.lift ? 17 : 20, color: C.navy700, whiteSpace: 'nowrap' }}>{V(r, 'recent', show)}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{r.recentDate}</div>
              </div>
            )}
            {show.first && <div data-testid="lb-change-first" style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: toneColor(r.changeTone) }}>{r.change}</div>}
            {show.week && <div data-testid="lb-change-week" style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: toneColor(r.changeWeekTone) }}>{r.changeWeek}</div>}
            {show.e1rm && <div data-testid="lb-e1rm" style={{ textAlign: 'right', fontFamily: DISPLAY, fontWeight: 500, fontSize: 18, color: C.navy700 }}>{r.value}</div>}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 5 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: show.lift ? 24 : 30, color: C.navy900, whiteSpace: 'nowrap' }}>{V(r, 'best', show)}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 13, textTransform: 'uppercase', color: C.muted }}>{m.unit}</span>
              {show.initial && <span data-testid="lb-best-date" style={{ position: 'absolute', right: 0, bottom: -12, fontSize: 11, color: C.faint }}>{r.bestDate}</span>}
            </div>
          </div>
        ))}
        {data.top.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 15 }}>No {m.title} results for this team in this period.</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, gap: 16 }}>
        <div style={{ fontSize: 11, color: C.muted }}>Progression: each test{data.testSpan ? ` ${data.testSpan}` : ''}, up = improvement{changeNote(show) ? ` · Change: ${changeNote(show)}` : ''}{show.lift ? ' · Ranked by est. 1RM; change = est. 1RM lb' : ''}</div>
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 15, letterSpacing: '0.05em', color: C.gold700, whiteSpace: 'nowrap' }}>Champions for Life</div>
      </div>
    </div>
  );
}

function RosterPage({ m, team, period, pg, pageCount, show }) {
  const COLS_REST = colsFor(show, false);
  return (
    <div className="lb-page" data-testid="lb-page" style={pageStyle('36px 52px 28px')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, paddingBottom: 14, borderBottom: `3px solid ${C.gold500}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <img src={LOGO} alt="Shiloh Christian Human Performance" style={{ height: 64, flexShrink: 0, margin: '-8px -6px -8px -10px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, lineHeight: 1.05, textTransform: 'uppercase', color: C.navy900 }}>{m.title} · Full Roster</div>
            <div style={{ fontSize: 13, color: C.muted }}>{team} · {show.lift ? 'Best set (lb × reps)' : `Best ${m.measure} (${m.unit})`} · {period}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold700, whiteSpace: 'nowrap' }}>
          Ranks {pg.from}–{pg.to}<br /><span style={{ color: C.faint }}>Page {pg.n} of {pageCount}</span>
        </div>
      </div>
      <div style={colHead(COLS_REST, 10, '12px 0 8px')}><HeadCells show={show} /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {pg.rows.map(r => (
          <div key={r.id} data-testid="lb-row" style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: COLS_REST, gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 38, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 500, fontSize: 17, color: C.navy700 }}>{r.rank}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.navy900, ...nameClamp }}>{r.name}</div>
            {show.pos && <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{r.pos}</div>}
            {show.cls && <div style={{ fontSize: 12, color: C.muted }}>{r.grad}</div>}
            <svg width="100%" height="22" viewBox="0 0 128 36" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
              <polyline points={r.pts} style={{ fill: 'none', stroke: C.navy700, strokeWidth: 2.4, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
              <circle cx={r.cx} cy={r.cy} r="3.5" style={{ fill: C.navy900 }} />
            </svg>
            {show.initial && (
              <div style={{ textAlign: 'right', lineHeight: 1 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: show.lift ? 13 : 15, color: C.navy700, whiteSpace: 'nowrap' }}>{V(r, 'initial', show)}</span>
                <span style={{ fontSize: 9, color: C.faint, marginLeft: 4 }}>{r.initialDate}</span>
              </div>
            )}
            {show.recent && (
              <div style={{ textAlign: 'right', lineHeight: 1 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: show.lift ? 13 : 15, color: C.navy700, whiteSpace: 'nowrap' }}>{V(r, 'recent', show)}</span>
                <span style={{ fontSize: 9, color: C.faint, marginLeft: 4 }}>{r.recentDate}</span>
              </div>
            )}
            {show.first && <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: toneColor(r.changeTone) }}>{r.change}</div>}
            {show.week && <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: toneColor(r.changeWeekTone) }}>{r.changeWeek}</div>}
            {show.e1rm && <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontWeight: 500, fontSize: 14, color: C.navy700 }}>{r.value}</div>}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: show.lift ? 16 : 20, color: C.navy900, whiteSpace: 'nowrap' }}>{V(r, 'best', show)}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 11, textTransform: 'uppercase', color: C.muted }}>{m.unit}</span>
              {show.initial && <span style={{ fontSize: 9, color: C.faint }}>{r.bestDate}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, gap: 16 }}>
        <div style={{ fontSize: 11, color: C.muted }}>Shiloh Christian School Athletics · Human Performance</div>
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 14, letterSpacing: '0.05em', color: C.gold700 }}>Champions for Life</div>
      </div>
    </div>
  );
}

// Embeds the two Google fonts as data URLs so the PNG renders in Oswald/Manrope
// rather than a fallback. Any failure (offline) just exports with system fonts.
let fontCssPromise = null;
const fontEmbedCSS = () => {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      const url = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Oswald:ital,wght@0,400;0,500;0,600;1,400&display=swap';
      let css = await (await fetch(url)).text();
      const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])];
      for (const u of urls) {
        const blob = await (await fetch(u)).blob();
        const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
        css = css.split(u).join(data);
      }
      return css;
    })().catch(() => '');
  }
  return fontCssPromise;
};

const label = { fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const field = { height: 40, padding: '0 10px', fontSize: 13, fontWeight: 700, borderRadius: 10 };
const opt = { background: 'var(--navy-900)', color: 'var(--color-text)' };

export default function PrintLeaderboard({ athletes, liftLogs, performanceTests, settings, initialMetricKey, initialSport = 'ALL', onClose }) {
  const liftTypes = settings.liftTypes && settings.liftTypes.length ? settings.liftTypes : ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];
  const metrics = React.useMemo(() => availableMetrics({ liftTypes, liftLogs, performanceTests }), [liftTypes.join('|'), liftLogs, performanceTests]); // eslint-disable-line react-hooks/exhaustive-deps
  // Open on the metric the coach was looking at; if it has no results, the first metric
  // of the same kind (a lift, or a jump/sprint) rather than jumping to something unrelated.
  const [metricKey, setMetricKey] = React.useState(() => {
    if (metrics.some(x => x.key === initialMetricKey)) return initialMetricKey;
    const kind = String(initialMetricKey || '').split(':')[0];
    return (metrics.find(x => x.kind === kind) || metrics[0])?.key;
  });
  const [scope, setScope] = React.useState('full');
  const [sport, setSport] = React.useState(initialSport);
  const [frame, setFrame] = React.useState('season');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [periodOverride, setPeriodOverride] = React.useState('');
  const [busy, setBusy] = React.useState('');
  // Column toggles, remembered on this device.
  const [show, setShow] = React.useState(() => {
    const d = { pos: true, cls: true, initial: true, recent: true, first: true, week: false, e1rm: false };
    try { return { ...d, ...JSON.parse(localStorage.getItem('hpd_lb_columns') || '{}') }; } catch { return d; }
  });
  const toggleCol = (k) => setShow(prev => {
    const next = { ...prev, [k]: !prev[k] };
    try { localStorage.setItem('hpd_lb_columns', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const sheetsRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);

  const m = metrics.find(x => x.key === metricKey) || metrics[0];
  const showEff = { ...show, lift: m?.kind === 'lift', e1rm: !!show.e1rm && m?.kind === 'lift' };
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const bounds = timeframeBounds(frame, { seasonStartDate: settings.seasonStartDate, from, to });
  const autoPeriod = (() => {
    if (frame === 'all' || (!bounds.start && !bounds.end)) return 'All Time';
    if (frame === 'season') return `${settings.seasonName || 'Season'} ${new Date().getFullYear()}`.trim();
    return describeBounds(frame, bounds);
  })();
  const period = periodOverride.trim() || autoPeriod;
  const team = sport === 'ALL' ? (settings.organizationName || 'All Teams') : sport;
  const data = React.useMemo(() => buildPrintLeaderboard({ metric: m, athletes, liftLogs, performanceTests, bounds, sport, fullRoster: scope === 'full' }),
    [m, athletes, liftLogs, performanceTests, bounds.start, bounds.end, sport, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the 816px sheets to the screen for preview; print and PNG always use 1:1.
  React.useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / PAGE_W));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('lb-printing');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('lb-printing'); };
  }, [onClose]);

  const fileBase = `Leaderboard_${(m?.title || 'metric')}_${team}`.replace(/[^A-Za-z0-9_.-]+/g, '-');

  const exportPdf = () => window.print();
  const exportPng = async () => {
    setBusy('png');
    try {
      const { toPng } = await import('html-to-image');
      const css = await fontEmbedCSS();
      const pages = [...sheetsRef.current.querySelectorAll('.lb-page')];
      for (let i = 0; i < pages.length; i++) {
        const dataUrl = await toPng(pages[i], { pixelRatio: 2, width: PAGE_W, height: PAGE_H, cacheBust: true, fontEmbedCSS: css || undefined, backgroundColor: '#ffffff' });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${fileBase}${pages.length > 1 ? `_p${i + 1}` : ''}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      }
    } finally {
      setBusy('');
    }
  };

  return createPortal(
    <div className="lb-print-root" role="dialog" aria-modal="true" aria-label="Printable leaderboard" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0b1220', overflowY: 'auto' }}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0; }
          /* html body... beats the Reports print rule that forces #root to display:block */
          html body.lb-printing > *:not(.lb-print-root), html body.lb-printing > #root { display: none !important; }
          html body.lb-printing .lb-page { overflow: hidden !important; }
          .lb-print-root { position: static !important; background: #fff !important; overflow: visible !important; }
          .lb-controls { display: none !important; }
          .lb-sheets-wrap { height: auto !important; display: block !important; }
          .lb-sheets { transform: none !important; padding: 0 !important; gap: 0 !important; width: auto !important; height: auto !important; }
          .lb-page { break-after: page; page-break-after: always; box-shadow: none !important; }
          .lb-page:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="lb-controls" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(3,10,20,0.96)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lb-metric" style={label}>Metric</label>
          <select id="lb-metric" className="input-glass" style={field} value={m?.key || ''} onChange={e => setMetricKey(e.target.value)}>
            {metrics.map(x => <option key={x.key} value={x.key} style={opt}>{x.title}{x.kind === 'test' && x.measure !== 'Result' && x.measure !== 'Time' ? ` (${x.measure})` : ''}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lb-scope" style={label}>Scope</label>
          <select id="lb-scope" className="input-glass" style={field} value={scope} onChange={e => setScope(e.target.value)}>
            <option value="full" style={opt}>Full roster</option>
            <option value="top" style={opt}>Top 10 only</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lb-team" style={label}>Team</label>
          <select id="lb-team" className="input-glass" style={field} value={sport} onChange={e => setSport(e.target.value)}>
            <option value="ALL" style={opt}>All sports</option>
            {sports.map(s => <option key={s} value={s} style={opt}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lb-frame" style={label}>Period</label>
          <select id="lb-frame" className="input-glass" style={field} value={frame} onChange={e => setFrame(e.target.value)}>
            {TIMEFRAMES.map(t => <option key={t.id} value={t.id} style={opt}>{t.label}</option>)}
          </select>
        </div>
        {frame === 'custom' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="lb-from" style={label}>From</label>
              <input id="lb-from" type="date" className="input-glass" style={field} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="lb-to" style={label}>To</label>
              <input id="lb-to" type="date" className="input-glass" style={field} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lb-period" style={label}>Period label</label>
          <input id="lb-period" className="input-glass" style={{ ...field, width: 170 }} placeholder={autoPeriod} value={periodOverride} onChange={e => setPeriodOverride(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Columns</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['pos', 'Pos'], ['cls', 'Class'], ['initial', 'Initial & best dates'], ['recent', 'Most recent'], ['first', '1st test vs now'], ['week', 'Last week vs now'], ...(m?.kind === 'lift' ? [['e1rm', 'Est. 1RM']] : [])].map(([k, t]) => (
              <button key={k} type="button" data-testid={`lb-col-${k}`} aria-pressed={!!show[k]} onClick={() => toggleCol(k)}
                style={{ ...field, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${show[k] ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`, background: show[k] ? 'rgba(184,156,91,0.18)' : 'transparent', color: show[k] ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{data.pageCount} page{data.pageCount === 1 ? '' : 's'} · {data.total} athletes</span>
          <button type="button" onClick={exportPdf} disabled={!m} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: '#030a14', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
            <Printer size={16} aria-hidden="true" /> PDF / Print
          </button>
          <button type="button" onClick={exportPng} disabled={!m || !!busy} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', textTransform: 'uppercase' }}>
            <ImageIcon size={16} aria-hidden="true" /> {busy === 'png' ? 'Saving…' : 'PNG'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close printable leaderboard" style={{ ...field, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {!m ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No lift or jump/sprint results logged yet.</div>
      ) : (
        <div className="lb-sheets-wrap" style={{ height: (PAGE_H * data.pageCount + 24 * (data.pageCount - 1)) * scale + 48, display: 'flex', justifyContent: 'center' }}>
          <div ref={sheetsRef} className="lb-sheets" style={{ width: PAGE_W, padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 24, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            <TopPage m={m} team={team} period={period} data={data} show={showEff} />
            {data.pages.map(pg => <RosterPage key={pg.n} m={m} team={team} period={period} pg={pg} pageCount={data.pageCount} show={showEff} />)}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
