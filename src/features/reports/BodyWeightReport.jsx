import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, X } from 'lucide-react';
import { buildBodyWeightReport, BW_PERIODS, BW_SORTS } from './bodyWeightData';

// Body Weight report (v5.9.0, docs/HANDOFF.md §133): the last 7 / 14 / 28 days of
// weigh-ins for a team - start, latest, change, vs baseline, range and a trend line per
// athlete - plus who hasn't weighed in. Prints on US Letter; two CSV downloads (the
// summary table, and every weigh-in in the period). Styling matches the Readiness Report.
const C = {
  navy900: '#061c41', navy700: '#133b78', navy100: '#e4eaf3',
  gold300: '#d3bf8c', gold500: '#b89c5b', gold700: '#93783f', white: '#ffffff',
  text: 'oklch(0.19 0.014 258)', muted: 'oklch(0.38 0.012 258)', faint: 'oklch(0.58 0.010 258)', border: 'oklch(0.88 0.006 258)',
  neutral100: 'oklch(0.94 0.004 258)',
  danger: 'oklch(0.55 0.16 25)', dangerBg: 'oklch(0.95 0.04 25)',
};
const DISPLAY = "'Oswald', Impact, sans-serif";
const BODY = "'Manrope', 'Inter', system-ui, sans-serif";
const th = (align = 'left') => ({ padding: '7px 6px', textAlign: align, fontWeight: 700, whiteSpace: 'nowrap' });
const td = (align = 'left', extra = {}) => ({ padding: '6px 6px', textAlign: align, ...extra });
const theadRow = { background: C.navy900, color: C.gold300, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 };
const rowLine = { borderBottom: `1px solid ${C.border}`, breakInside: 'avoid' };
const sub = { display: 'block', fontSize: 10, fontWeight: 500, color: C.faint, marginTop: 1 };
const pill = (bg, fg) => ({ padding: '3px 10px', borderRadius: 999, fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', background: bg, color: fg, whiteSpace: 'nowrap' });
const md = (day) => { const [, m, d] = day.split('-'); return `${+m}/${+d}`; };
const niceDay = (day, opts) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', opts);
// No sign on a value that rounds to zero ("0.0", not "−0.0").
const sign = (n, dp = 1) => { const a = Math.abs(n).toFixed(dp); return `${Number(a) === 0 ? '' : n > 0 ? '+' : '−'}${a}`; };
const lb = (n) => `${Number(n).toFixed(1)} lb`;
const dash = <span style={{ color: C.faint }}>—</span>;

// Weigh-ins across the period (x = day), with the baseline as a dashed gold line. The
// y-axis spans at least 2 lb so normal day-to-day noise doesn't look like a cliff.
function Trend({ series, dayList, baseW }) {
  const W = 88, H = 24, P = 3;
  const n = dayList.length;
  const idx = new Map(dayList.map((d, i) => [d, i]));
  const vals = series.map(p => p.w).concat(baseW != null ? [baseW] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { const mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
  const x = (d) => P + (n > 1 ? idx.get(d) / (n - 1) : 0.5) * (W - 2 * P);
  const y = (w) => P + (1 - (w - lo) / (hi - lo)) * (H - 2 * P);
  return (
    <svg data-testid="bw-trend" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: 'block' }}>
      {baseW != null && <line x1={P} x2={W - P} y1={y(baseW)} y2={y(baseW)} stroke={C.gold500} strokeWidth="1" strokeDasharray="3 2" />}
      {series.length > 1 && <polyline points={series.map(p => `${x(p.day).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ')} fill="none" stroke={C.navy900} strokeWidth="1.5" strokeLinejoin="round" />}
      {series.map(p => <circle key={p.day} cx={x(p.day)} cy={y(p.w)} r="1.8" fill={C.navy900} />)}
    </svg>
  );
}

function Doc({ data, team, showSport }) {
  const today = new Date().toLocaleDateString('en-US');
  const range = `${niceDay(data.from, { month: 'short', day: 'numeric' })} – ${niceDay(data.to, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const t = data.threshold;
  return (
    <div className="bw-doc" data-testid="body-weight-report" style={{ background: C.white, color: C.text, fontFamily: BODY, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tfoot><tr><td>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 8, marginTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
            <span>Shiloh Christian Human Performance · Body Weight · {today}</span>
            <span>Confidential · coaching and medical staff only</span>
          </div>
        </td></tr></tfoot>
        <tbody><tr><td>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, padding: '6px 0 16px', borderTop: `10px solid ${C.navy900}`, borderBottom: `3px solid ${C.gold500}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold700 }}>Human Performance · {team}</div>
              <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 600, fontSize: 48, lineHeight: 1.02, textTransform: 'uppercase', color: C.navy900 }}>Body Weight</h1>
              <div data-testid="bw-subline" style={{ fontSize: 14, color: C.muted }}>Last {data.days} days · {range} · {data.rows.length} of {data.rosterCount} athlete{data.rosterCount === 1 ? '' : 's'} weighed in</div>
            </div>
            <img src="/hp-logo.png" alt="Shiloh Christian Human Performance" style={{ height: 88, flexShrink: 0, margin: '6px -12px 0 0' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 6px' }}>
            <span data-testid="bw-pill-below" style={pill(data.belowBaseCount ? C.dangerBg : C.navy100, data.belowBaseCount ? C.danger : C.navy700)}>{data.belowBaseCount} more than {t} lb below baseline</span>
            {data.avgChange != null && <span data-testid="bw-pill-avg" style={pill(C.navy100, C.navy700)}>Avg change {sign(data.avgChange)} lb</span>}
            <span style={pill(C.neutral100, C.muted)}>{data.missing.length} not weighed in</span>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
            Start and Latest are the first and last weigh-in in the period (one a day; post-practice weigh-ins left out). Change = Latest − Start.
            vs Baseline = Latest − baseline, red when more than {t} lb below. Trend: each weigh-in in the period; dashed gold line = baseline.
          </p>

          {data.rows.length === 0 ? (
            <p style={{ padding: 24, textAlign: 'center', color: C.muted }}>No weigh-ins for this team in the last {data.days} days.</p>
          ) : (
            <table style={table}>
              <thead><tr style={theadRow}>
                <th style={th()}>Athlete</th>
                <th style={th('right')}>Baseline</th><th style={th('right')}>Start</th><th style={th('right')}>Latest</th>
                <th style={th('right')}>Change</th><th style={th('right')}>vs Baseline</th><th style={th('right')}>Low – High</th>
                <th style={th('right')}>#</th><th style={th()}>Trend</th>
              </tr></thead>
              <tbody>{data.rows.map(r => (
                <tr key={r.id} data-testid="bw-row" style={rowLine}>
                  <td style={td('left', { fontWeight: 700, color: C.navy900, whiteSpace: 'nowrap' })}>
                    {r.name}<span data-testid="bw-who" style={sub}>{[showSport && r.sport, r.pos].filter(Boolean).join(' · ') || '\u00a0'}</span>
                  </td>
                  <td style={td('right', { whiteSpace: 'nowrap' })}>{r.baseW == null ? dash : lb(r.baseW)}</td>
                  <td style={td('right', { whiteSpace: 'nowrap' })}>{lb(r.start.w)}<span style={sub}>{md(r.start.day)}</span></td>
                  <td style={td('right', { whiteSpace: 'nowrap', fontWeight: 700, color: C.navy900 })}>{lb(r.latest.w)}<span style={sub}>{md(r.latest.day)}</span></td>
                  <td style={td('right', { whiteSpace: 'nowrap', fontWeight: 700, color: r.bigLoss ? C.danger : C.text })}>
                    {r.change == null ? dash : <>{sign(r.change)} lb<span style={sub}>{sign(r.changePct)}%</span></>}
                  </td>
                  <td style={td('right', { whiteSpace: 'nowrap', fontWeight: 700, color: r.belowBase ? C.danger : C.text })}>
                    {r.vsBase == null ? dash : <>{sign(r.vsBase)} lb<span style={sub}>{sign(r.vsBasePct)}%</span></>}
                  </td>
                  <td style={td('right', { whiteSpace: 'nowrap', color: C.muted })}>{r.count > 1 ? `${r.low.toFixed(1)}–${r.high.toFixed(1)}` : '—'}</td>
                  <td style={td('right', { color: C.muted })}>{r.count}</td>
                  <td style={td('left', { padding: '4px 6px' })}><Trend series={r.series} dayList={data.dayList} baseW={r.baseW} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}

          {data.missing.length > 0 && (
            <section data-testid="bw-missing" style={{ marginTop: 22, breakInside: 'avoid' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 4, borderBottom: `2px solid ${C.navy900}` }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, textTransform: 'uppercase', color: C.navy900 }}>Not weighed in · last {data.days} days</span>
                <span style={{ fontSize: 12, color: C.muted }}>{data.missing.length} athlete{data.missing.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ columnCount: showSport ? 3 : 4, columnGap: 16, fontSize: 12, lineHeight: 1.7, paddingTop: 6 }}>
                {data.missing.map(m => (
                  <div key={m.id} data-testid="bw-missing-name" style={{ breakInside: 'avoid' }}>
                    {m.name}{showSport && m.sport ? <span style={{ color: C.faint }}> · {m.sport}</span> : null}
                    <span style={{ color: C.faint }}> · {m.daysAgo == null ? 'never' : `${m.daysAgo}d`}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </td></tr></tbody>
      </table>
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const field = { height: 40, padding: '0 10px', fontSize: 13, fontWeight: 700, borderRadius: 10 };
const opt = { background: 'var(--navy-900)', color: 'var(--color-text)' };
const ghostBtn = { ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const fx = (n, dp = 1) => (n == null ? '' : Number(n).toFixed(dp));
const read = (k, ok, d) => { try { const v = localStorage.getItem(k); return ok(v) ? v : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

export default function BodyWeightReport({ athletes, reportData, settings, initialSport, onClose }) {
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const [sport, setSport] = React.useState(() => (initialSport && initialSport !== 'ALL' && sports.includes(initialSport) ? initialSport : 'ALL'));
  const [days, setDays] = React.useState(() => Number(read('hpd_bw_period', v => BW_PERIODS.includes(Number(v)), 7)));
  const [sort, setSort] = React.useState(() => read('hpd_bw_sort', v => BW_SORTS.some(([k]) => k === v), 'name'));
  const pickDays = (d) => { setDays(d); save('hpd_bw_period', d); };
  const pickSort = (s) => { setSort(s); save('hpd_bw_sort', s); };
  const data = React.useMemo(() => buildBodyWeightReport({ athletes, reportData, settings, sport, days, sort }), [athletes, reportData, settings, sport, days, sort]);
  const team = sport === 'ALL' ? 'All Sports' : sport;
  const showSport = sport === 'ALL';

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('bw-printing');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('bw-printing'); };
  }, [onClose]);

  const download = (kind, rows) => {
    const blob = new Blob([rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `body-weight-${kind}-${team.replace(/\W+/g, '-').toLowerCase()}-last-${days}-days-${data.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const summaryCsv = () => {
    const rows = [['Athlete', 'Sport', 'Pos', 'Baseline lb', 'Start lb', 'Start date', 'Latest lb', 'Latest date', 'Change lb', 'Change %', 'vs Baseline lb', 'vs Baseline %', 'Low lb', 'High lb', 'Avg lb', 'Weigh-ins', 'Period']];
    const period = `Last ${days} days (${data.from} to ${data.to})`;
    data.rows.forEach(r => rows.push([r.name, r.sport, r.pos, fx(r.baseW), fx(r.start.w), r.start.day, fx(r.latest.w), r.latest.day, fx(r.change), fx(r.changePct), fx(r.vsBase), fx(r.vsBasePct), fx(r.low), fx(r.high), fx(r.avg), r.count, period]));
    data.missing.forEach(m => rows.push([m.name, m.sport, '', '', '', '', '', '', '', '', '', '', '', '', '', 0, period]));
    download('summary', rows);
  };
  const weighInsCsv = () => {
    const rows = [['Date', 'Time', 'Athlete', 'Sport', 'Pos', 'Weight lb', 'Type', 'Baseline lb', 'vs Baseline lb', 'vs Baseline %']];
    data.weighIns.forEach(w => rows.push([w.day, w.time, w.name, w.sport, w.pos, fx(w.w), w.type, fx(w.baseW), w.baseW == null ? '' : fx(w.w - w.baseW), w.baseW == null ? '' : fx(((w.w - w.baseW) / w.baseW) * 100)]));
    download('weigh-ins', rows);
  };

  return createPortal(
    <div className="bw-print-root" role="dialog" aria-modal="true" aria-label="Body weight report" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0b1220', overflowY: 'auto' }}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          html body.bw-printing > *:not(.bw-print-root), html body.bw-printing > #root { display: none !important; }
          .bw-print-root { position: static !important; background: #fff !important; overflow: visible !important; }
          .bw-controls { display: none !important; }
          .bw-sheet { box-shadow: none !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
      <div className="bw-controls" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(3,10,20,0.96)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="bw-team" style={label}>Team</label>
          <select id="bw-team" className="input-glass" style={field} value={sport} onChange={e => setSport(e.target.value)}>
            <option value="ALL" style={opt}>All sports</option>
            {sports.map(s => <option key={s} value={s} style={opt}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Period</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {BW_PERIODS.map(d => (
              <button key={d} type="button" data-testid={`bw-period-${d}`} aria-pressed={days === d} onClick={() => pickDays(d)}
                style={{ ...field, minWidth: 64, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${days === d ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`, background: days === d ? 'rgba(184,156,91,0.18)' : 'transparent', color: days === d ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                {d} days
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="bw-sort" style={label}>Sort</label>
          <select id="bw-sort" className="input-glass" style={field} value={sort} onChange={e => pickSort(e.target.value)}>
            {BW_SORTS.map(([k, t]) => <option key={k} value={k} style={opt}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" data-testid="bw-csv-summary" onClick={summaryCsv} style={ghostBtn}><Download size={16} aria-hidden="true" /> Summary CSV</button>
          <button type="button" data-testid="bw-csv-weighins" onClick={weighInsCsv} style={ghostBtn}><Download size={16} aria-hidden="true" /> Weigh-ins CSV</button>
          <button type="button" data-testid="bw-print" onClick={() => window.print()} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: '#030a14', border: 'none', cursor: 'pointer', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            <Printer size={16} aria-hidden="true" /> PDF / Print
          </button>
          <button type="button" onClick={onClose} aria-label="Close body weight report" style={{ ...field, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div className="bw-sheet" style={{ maxWidth: 816, margin: '0 auto', background: '#fff', padding: '0.5in', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', overflowX: 'auto' }}>
          <div style={{ minWidth: 680 }}><Doc data={data} team={team} showSport={showSport} /></div>
        </div>
      </div>
    </div>,
    document.body
  );
}
