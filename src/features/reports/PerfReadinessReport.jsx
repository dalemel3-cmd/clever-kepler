import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, X } from 'lucide-react';
import { buildPerfReadiness, perfMetrics } from './perfReadinessData';

// Performance vs Readiness printout (docs/HANDOFF.md §114): a test day's jump/sprint
// results next to body weight vs baseline and the training load going in, flagged
// where a drop lines up with something staff can act on. Page 1 is the team table;
// optional per-athlete history pages follow. Styling matches the Readiness Report.
const C = {
  navy900: '#061c41', navy700: '#133b78', navy100: '#e4eaf3',
  gold300: '#d3bf8c', gold500: '#b89c5b', gold700: '#93783f', gold900: '#6f5c33', white: '#ffffff',
  text: 'oklch(0.19 0.014 258)', muted: 'oklch(0.38 0.012 258)', faint: 'oklch(0.58 0.010 258)', border: 'oklch(0.88 0.006 258)',
  danger: 'oklch(0.55 0.16 25)', dangerBg: 'oklch(0.95 0.04 25)',
  success: 'oklch(0.58 0.11 152)', successDark: 'oklch(0.42 0.09 152)', successBg: 'oklch(0.95 0.03 152)', warningBg: 'oklch(0.95 0.05 75)',
};
const DISPLAY = "'Oswald', Impact, sans-serif";
const BODY = "'Manrope', 'Inter', system-ui, sans-serif";
const th = (align = 'left') => ({ padding: '7px 8px', textAlign: align, fontWeight: 700 });
const td = (align = 'left', extra = {}) => ({ padding: '6px 8px', textAlign: align, ...extra });
const theadRow = { background: C.navy900, color: C.gold300, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 };
const rowLine = { borderBottom: `1px solid ${C.border}`, breakInside: 'avoid' };
const md = (day) => { const [, m, d] = day.split('-'); return `${+m}/${+d}`; };
const longDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const sign = (n, dp = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}`;

const FlagPill = ({ flag }) => !flag ? <span style={{ color: C.faint }}>—</span> : (
  <span style={{ padding: '2px 8px', borderRadius: 999, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: flag === 'red' ? C.dangerBg : C.warningBg, color: flag === 'red' ? C.danger : C.gold900 }}>
    {flag === 'red' ? 'Act' : 'Watch'}
  </span>
);

// Shared cells for one result-in-context.
function Cells({ r, unit }) {
  return (
    <>
      <td style={td('right', { fontWeight: 700, color: C.navy900, whiteSpace: 'nowrap' })}>{r.valueText} <span style={{ fontWeight: 500, color: C.muted, fontSize: 11 }}>{unit}</span></td>
      <td style={td('right', { whiteSpace: 'nowrap', fontWeight: 700, color: r.pb ? C.successDark : r.drop ? C.danger : C.muted })}>
        {r.first ? <span style={{ fontWeight: 500, color: C.faint }}>1st test</span> : r.pb ? '▲ PB' : `−${Math.max(0, r.off).toFixed(1)}%`}
      </td>
      <td style={td('right', { whiteSpace: 'nowrap', color: r.low ? C.danger : C.text, fontWeight: r.low ? 700 : 500 })}>
        {r.dLb == null ? <span style={{ color: C.faint }}>—</span> : <>{sign(r.dLb)} lb <span style={{ color: C.muted, fontWeight: 500 }}>({sign(r.dPct)}%)</span></>}
      </td>
      <td style={td('right', { color: C.muted })}>{r.acute == null ? '—' : `${r.acute} AU`}</td>
      <td style={td('right', { whiteSpace: 'nowrap', fontWeight: 700, color: r.spike ? C.danger : C.text })}>{r.ratio == null ? <span style={{ color: C.faint, fontWeight: 500 }}>—</span> : r.ratio.toFixed(2)}</td>
      <td style={td('center')}><FlagPill flag={r.flag} /></td>
    </>
  );
}

function Doc({ metric, data, team, showPages }) {
  const t = data.thresholds;
  const today = new Date().toLocaleDateString('en-US');
  const title = `${metric.title}${metric.measure && !['Result', 'Time'].includes(metric.measure) ? ` · ${metric.measure}` : ''}`;
  return (
    <div className="pr-doc" data-testid="perf-readiness" style={{ background: C.white, color: C.text, fontFamily: BODY, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tfoot><tr><td>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 8, marginTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
            <span>Shiloh Christian Human Performance · Performance vs Readiness · {today}</span>
            <span>Confidential · coaching and medical staff only</span>
          </div>
        </td></tr></tfoot>
        <tbody><tr><td>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, padding: '6px 0 16px', borderTop: `10px solid ${C.navy900}`, borderBottom: `3px solid ${C.gold500}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold700 }}>Performance vs Readiness · {team}</div>
              <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, lineHeight: 1.02, textTransform: 'uppercase', color: C.navy900 }}>{title}</h1>
              <div style={{ fontSize: 14, color: C.muted }}>{data.day ? longDay(data.day) : 'No test day'} · {data.rows.length} athlete{data.rows.length === 1 ? '' : 's'} tested</div>
            </div>
            <img src="/hp-logo.png" alt="Shiloh Christian Human Performance" style={{ height: 88, flexShrink: 0, margin: '6px -12px 0 0' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 6px', fontSize: 12 }}>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontWeight: 700, background: C.dangerBg, color: C.danger }}>{data.redCount} act</span>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontWeight: 700, background: C.warningBg, color: C.gold900 }}>{data.goldCount} watch</span>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
            <b style={{ color: C.danger }}>Act</b>: {metric.title} {t.drop}%+ below the athlete's previous best <i>and</i> more than {t.lb} lb below baseline or A:C {t.spike}+ going in.{' '}
            <b style={{ color: C.gold900 }}>Watch</b>: one of those on its own. Weight = that day's weigh-in (or the latest in the 3 days before) vs baseline. Load = 7-day RPE load and acute:chronic ratio through the day before the test.
          </p>

          {data.rows.length === 0 ? (
            <p style={{ padding: 24, textAlign: 'center', color: C.muted }}>No {metric.title} results for this team.</p>
          ) : (
            <table style={table}>
              <thead><tr style={theadRow}>
                <th style={th()}>Athlete</th><th style={th()}>Pos</th><th style={th('right')}>Result</th><th style={th('right')}>vs best</th>
                <th style={th('right')}>Wt vs base</th><th style={th('right')}>7-day</th><th style={th('right')}>A:C</th><th style={th('center')}>Flag</th>
              </tr></thead>
              <tbody>{data.rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr data-testid="pr-row" style={{ ...rowLine, borderBottom: r.note && r.flag ? 'none' : rowLine.borderBottom }}>
                    <td style={td('left', { fontWeight: 700, color: C.navy900 })}>{r.name}</td>
                    <td style={td('left', { color: C.muted })}>{r.pos || ''}</td>
                    <Cells r={r} unit={metric.unit} />
                  </tr>
                  {r.note && r.flag && (
                    <tr style={rowLine}><td colSpan={8} style={td('left', { paddingTop: 0, fontSize: 11, color: r.flag === 'red' ? C.danger : C.gold900 })}>{r.note}</td></tr>
                  )}
                </React.Fragment>
              ))}</tbody>
            </table>
          )}

          {showPages && data.athletePages.map(p => (
            <section key={p.athleteId} data-testid="pr-athlete-page" style={{ breakBefore: 'page', pageBreakBefore: 'always', paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingBottom: 6, borderBottom: `2px solid ${C.navy900}` }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, textTransform: 'uppercase', color: C.navy900 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{[p.sport, p.pos].filter(Boolean).join(' · ')} · {title} · {p.hist.length} test{p.hist.length === 1 ? '' : 's'}</span>
              </div>
              <p data-testid="pr-summary" style={{ margin: '8px 0 10px', fontSize: 12, color: C.muted }}>
                {p.summary
                  ? <>Tests more than {t.lb} lb below baseline ({p.summary.lowN}) averaged <b style={{ color: C.text }}>{p.summary.lowAvg.toFixed(1)}% below best</b>, vs <b style={{ color: C.text }}>{p.summary.restAvg.toFixed(1)}%</b> otherwise ({p.summary.restN}).</>
                  : 'Not enough tests both at and below baseline weight to compare yet.'}
              </p>
              <table style={table}>
                <thead><tr style={theadRow}>
                  <th style={th()}>Date</th><th style={th('right')}>Result</th><th style={th('right')}>vs best</th>
                  <th style={th('right')}>Wt vs base</th><th style={th('right')}>7-day</th><th style={th('right')}>A:C</th><th style={th('center')}>Flag</th>
                </tr></thead>
                <tbody>{p.hist.map(h => (
                  <tr key={h.id} style={rowLine}>
                    <td style={td('left', { color: C.muted, fontWeight: h.day === data.day ? 700 : 500 })}>{md(h.day)}</td>
                    <Cells r={h} unit={metric.unit} />
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ))}
        </td></tr></tbody>
      </table>
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const field = { height: 40, padding: '0 10px', fontSize: 13, fontWeight: 700, borderRadius: 10 };
const opt = { background: 'var(--navy-900)', color: 'var(--color-text)' };
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function PerfReadinessReport({ athletes, reportData, performanceTests, settings, initialMetricKey, initialSport, onClose }) {
  const metrics = React.useMemo(() => perfMetrics(performanceTests), [performanceTests]);
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const [metricKey, setMetricKey] = React.useState(() => (metrics.some(m => m.key === initialMetricKey) ? initialMetricKey : metrics[0]?.key));
  // Built mainly for football: open on Football unless the screen was already filtered.
  const [sport, setSport] = React.useState(() => (initialSport && initialSport !== 'ALL' ? initialSport : sports.includes('Football') ? 'Football' : 'ALL'));
  const [day, setDay] = React.useState(null);
  const [showPages, setShowPages] = React.useState(true);
  const metric = metrics.find(m => m.key === metricKey) || metrics[0];
  const data = React.useMemo(() => buildPerfReadiness({ metric, athletes, reportData, performanceTests, settings, sport, day, withAthletePages: showPages }),
    [metric, athletes, reportData, performanceTests, settings, sport, day, showPages]);
  const team = sport === 'ALL' ? 'All Sports' : sport;

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('pr-printing');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('pr-printing'); };
  }, [onClose]);

  const exportCsv = () => {
    const rows = [['Date', 'Athlete', 'Sport', 'Pos', 'Result', 'Unit', 'Off best %', 'PB', 'Weight', 'Baseline', 'Wt vs base lb', 'Wt vs base %', '7-day load', 'A:C', 'Flag', 'Note']];
    const add = (r) => rows.push([r.day, r.name, r.sport, r.pos, r.valueText, metric.unit, r.off == null ? '' : r.off.toFixed(1), r.pb ? 'yes' : '', r.curW ?? '', r.baseW ?? '', r.dLb == null ? '' : r.dLb.toFixed(1), r.dPct == null ? '' : r.dPct.toFixed(1), r.acute ?? '', r.ratio == null ? '' : r.ratio.toFixed(2), r.flag === 'red' ? 'act' : r.flag === 'gold' ? 'watch' : '', r.note]);
    if (showPages) data.athletePages.forEach(p => p.hist.forEach(add)); else data.rows.forEach(add);
    const blob = new Blob([rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `perf-vs-readiness-${(metric?.title || 'metric').replace(/\W+/g, '-')}-${data.day || ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return createPortal(
    <div className="pr-print-root" role="dialog" aria-modal="true" aria-label="Performance vs readiness" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0b1220', overflowY: 'auto' }}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          html body.pr-printing > *:not(.pr-print-root), html body.pr-printing > #root { display: none !important; }
          .pr-print-root { position: static !important; background: #fff !important; overflow: visible !important; }
          .pr-controls { display: none !important; }
          .pr-sheet { box-shadow: none !important; padding: 0 !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
      <div className="pr-controls" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(3,10,20,0.96)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="pr-metric" style={label}>Metric</label>
          <select id="pr-metric" className="input-glass" style={field} value={metric?.key || ''} onChange={e => { setMetricKey(e.target.value); setDay(null); }}>
            {metrics.map(x => <option key={x.key} value={x.key} style={opt}>{x.title}{!['Result', 'Time'].includes(x.measure) ? ` (${x.measure})` : ''}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="pr-team" style={label}>Team</label>
          <select id="pr-team" className="input-glass" style={field} value={sport} onChange={e => { setSport(e.target.value); setDay(null); }}>
            <option value="ALL" style={opt}>All sports</option>
            {sports.map(s => <option key={s} value={s} style={opt}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="pr-day" style={label}>Test day</label>
          <select id="pr-day" className="input-glass" style={field} value={data.day || ''} onChange={e => setDay(e.target.value)}>
            {data.days.map(d => <option key={d} value={d} style={opt}>{new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric' })}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
          <input data-testid="pr-pages-toggle" type="checkbox" checked={showPages} onChange={e => setShowPages(e.target.checked)} /> Athlete pages
        </label>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <button type="button" onClick={exportCsv} disabled={!metric} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', textTransform: 'uppercase' }}>
            <Download size={16} aria-hidden="true" /> CSV
          </button>
          <button type="button" data-testid="pr-print" onClick={() => window.print()} disabled={!metric} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: '#030a14', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
            <Printer size={16} aria-hidden="true" /> PDF / Print
          </button>
          <button type="button" onClick={onClose} aria-label="Close performance vs readiness" style={{ ...field, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {!metric ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No jump or sprint results logged yet.</div>
      ) : (
        <div style={{ padding: 16 }}>
          <div className="pr-sheet" style={{ maxWidth: 816, margin: '0 auto', background: '#fff', padding: '0.5in', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}><Doc metric={metric} data={data} team={team} showPages={showPages} /></div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
