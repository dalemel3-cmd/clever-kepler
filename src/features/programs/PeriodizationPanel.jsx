import React from 'react';
import { X } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LIFT_FILTERS, VOLUME_MEASURES, bucketize, bucketLabel, liftSummary, phaseSegments, sessionsFrom } from './periodization';

// Programs > Periodization (v5.11.0, docs/HANDOFF.md §137): how the prescribed training
// moves across days, weeks and months - volume and intensity as two charts on the same
// timeline (never one dual-axis chart), a phase strip, and the numbers as a table.
const VOLUME_COLOR = '#b89c5b';    // brand gold (bars)
const INTENSITY_COLOR = '#60a5fa'; // blue line; both >= 3:1 on the dark card
const lbl = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' };
const field = { height: '40px', padding: '0 10px', fontSize: '13px', fontWeight: 700, borderRadius: '10px' };
const opt = { background: 'var(--navy-900)', color: 'var(--color-text)' };
const seg = (on) => ({ ...field, cursor: 'pointer', minWidth: '76px', border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.18)'}`, background: on ? 'rgba(184,156,91,0.18)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-muted)' });
const th = { textAlign: 'left', padding: '8px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.12)' };
const td = { padding: '8px', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' };
const num = (v, dp = 0) => (v == null ? '—' : Number(v).toFixed(dp));
const fmtVol = (m, v) => (m === 'load' ? num(v, 1) : num(v));

function Tip({ active, payload, view, measure }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  const vName = (VOLUME_MEASURES.find(([k]) => k === measure) || [])[1];
  return (
    <div style={{ background: 'rgba(3,10,20,0.96)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: 'var(--color-text)', minWidth: '180px' }}>
      <div style={{ fontWeight: 800, marginBottom: '4px' }}>{bucketLabel(b.key, view, true)}</div>
      {b.sessions === 0 ? <div style={{ color: 'var(--color-text-muted)' }}>No training</div> : (
        <>
          {(b.phases.length > 0 || b.weeks.length > 0) && <div style={{ color: 'var(--color-text-muted)' }}>{[...b.weeks, ...b.phases].join(' · ')}</div>}
          <div>{b.sessions} session{b.sessions === 1 ? '' : 's'} · {b.sets} sets · {b.reps} reps</div>
          <div>{vName}: <b>{fmtVol(measure, b[measure])}</b></div>
          <div>Avg intensity: <b>{b.avg == null ? '—' : `${num(b.avg)}%`}</b> · Top: {b.top == null ? '—' : `${b.top}%`}</div>
        </>
      )}
    </div>
  );
}

export default function PeriodizationPanel({ loadAll, sports = [], initialSport, onClose }) {
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState('');
  const [sport, setSport] = React.useState(initialSport || 'ALL');
  const [view, setView] = React.useState(() => { try { return localStorage.getItem('hpd_period_view') || 'week'; } catch { return 'week'; } });
  const [lift, setLift] = React.useState('');
  const [measure, setMeasure] = React.useState('load');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const pickView = (v) => { setView(v); try { localStorage.setItem('hpd_period_view', v); } catch { /* ignore */ } };

  React.useEffect(() => {
    let live = true;
    loadAll().then(res => { if (!live) return; if (res.ok) setRows(res.rows); else setError("Couldn't load programs - check the connection and try again."); });
    return () => { live = false; };
  }, [loadAll]);

  const teams = React.useMemo(() => Array.from(new Set([...sports, ...(rows || []).map(p => p.sport).filter(Boolean)])).sort(), [sports, rows]);
  const { sessions, undated } = React.useMemo(() => sessionsFrom(rows || [], { sport, lift, from, to }), [rows, sport, lift, from, to]);
  const buckets = React.useMemo(() => bucketize(sessions, view), [sessions, view]);
  const segments = React.useMemo(() => phaseSegments(buckets), [buckets]);
  const chartData = buckets.map(b => ({ ...b, label: bucketLabel(b.key, view), avgPlot: b.avg == null ? null : Math.round(b.avg * 10) / 10, vol: b[measure] }));
  const vName = (VOLUME_MEASURES.find(([k]) => k === measure) || [])[1];
  const unitWord = view === 'day' ? 'day' : view === 'week' ? 'week' : 'month';
  const axis = { stroke: 'rgba(255,255,255,0.35)', fontSize: 11, tickLine: false };
  const chartWidth = Math.max(100, chartData.length * (view === 'day' ? 34 : 46));

  return (
    <div data-testid="periodization" className="card-glass" style={{ padding: '18px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, textTransform: 'uppercase' }}>Periodization</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Prescribed volume and intensity from your programs, by {unitWord}.</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close periodization" style={{ ...field, width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.18)' }}><X size={18} /></button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>Team</span>
          <select data-testid="pz-team" className="input-glass" style={field} value={sport} onChange={e => setSport(e.target.value)}>
            <option value="ALL" style={opt}>All programs</option>
            {teams.map(s => <option key={s} value={s} style={opt}>{s}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>View</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, t]) => <button key={k} type="button" data-testid={`pz-view-${k}`} aria-pressed={view === k} onClick={() => pickView(k)} style={seg(view === k)}>{t}</button>)}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>Lift</span>
          <select data-testid="pz-lift" className="input-glass" style={field} value={lift} onChange={e => setLift(e.target.value)}>
            {LIFT_FILTERS.map(([k, t]) => <option key={k} value={k} style={opt}>{t}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>Volume as</span>
          <select data-testid="pz-measure" className="input-glass" style={field} value={measure} onChange={e => setMeasure(e.target.value)}>
            {VOLUME_MEASURES.map(([k, t]) => <option key={k} value={k} style={opt}>{t}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>From</span>
          <input type="date" data-testid="pz-from" className="input-glass" style={field} value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>To</span>
          <input type="date" data-testid="pz-to" className="input-glass" style={field} value={to} onChange={e => setTo(e.target.value)} />
        </label>
      </div>

      {error && <div style={{ fontSize: '13px', color: '#f87171' }}>{error}</div>}
      {!rows && !error && <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Loading programs…</div>}
      {rows && sessions.length === 0 && (
        <div data-testid="pz-empty" style={{ fontSize: '14px', color: 'var(--color-text-muted)', padding: '12px 0' }}>
          No dated program days {sport === 'ALL' ? '' : `for ${sport} `}{from || to ? 'in this range ' : ''}yet. Give each day a Date in the builder (or in the upload template) to see it here.
        </div>
      )}

      {rows && sessions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: `${chartWidth}px` }}>
            <span style={lbl}>Phases</span>
            <div data-testid="pz-phases" style={{ display: 'flex', gap: '2px', margin: '6px 0 14px', paddingLeft: '44px' }}>
              {segments.map((s, i) => (
                <div key={`${s.start}_${i}`} title={s.label} style={{ flex: s.span, minWidth: 0, padding: '6px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: s.label === 'Off' ? 'transparent' : i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(184,156,91,0.14)', border: s.label === 'Off' ? '1px dashed rgba(255,255,255,0.15)' : 'none', color: s.label === 'Off' ? 'var(--color-text-muted)' : 'var(--color-text)' }}>{s.label}</div>
              ))}
            </div>
            <span style={lbl}>Volume · {vName} per {unitWord}</span>
            <div data-testid="pz-volume-chart" style={{ height: '180px', marginTop: '6px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" {...axis} axisLine={false} interval="preserveStartEnd" />
                  <YAxis {...axis} axisLine={false} width={44} allowDecimals={measure === 'load'} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<Tip view={view} measure={measure} />} />
                  <Bar dataKey="vol" fill={VOLUME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <span style={lbl}>Intensity · average % of max per {unitWord}</span>
            <div data-testid="pz-intensity-chart" style={{ height: '160px', marginTop: '6px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  {/* Band scale: each point sits over its bar in the volume chart above. */}
                  <XAxis dataKey="label" scale="band" {...axis} axisLine={false} interval="preserveStartEnd" />
                  <YAxis {...axis} axisLine={false} width={44} domain={[(min) => Math.max(0, Math.floor((min - 5) / 5) * 5), (max) => Math.min(110, Math.ceil((max + 5) / 5) * 5)]} unit="%" />
                  <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.25)' }} content={<Tip view={view} measure={measure} />} />
                  <Line type="monotone" dataKey="avgPlot" stroke={INTENSITY_COLOR} strokeWidth={2} dot={{ r: 4, fill: INTENSITY_COLOR, stroke: 'rgba(11,18,32,1)', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {rows && sessions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="pz-table" style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-text)' }}>
            <thead><tr>
              <th style={th}>{view === 'day' ? 'Date' : view === 'week' ? 'Week of' : 'Month'}</th>
              <th style={th}>Program · Week</th><th style={th}>Phase</th>{view === 'day' && <th style={th}>Focus</th>}
              <th style={{ ...th, textAlign: 'right' }}>Sessions</th><th style={{ ...th, textAlign: 'right' }}>Sets</th><th style={{ ...th, textAlign: 'right' }}>Reps</th>
              <th style={{ ...th, textAlign: 'right' }}>Load</th><th style={{ ...th, textAlign: 'right' }}>Avg %</th><th style={{ ...th, textAlign: 'right' }}>Top %</th>
              <th style={th}>Main lifts</th>
            </tr></thead>
            <tbody>{buckets.map(b => (
              <tr key={b.key} data-testid="pz-row" style={{ opacity: b.sessions ? 1 : 0.55 }}>
                <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>{bucketLabel(b.key, view, true)}</td>
                <td style={td}>{[b.programs.join(', '), b.weeks.join(', ')].filter(Boolean).join(' · ') || (b.sessions ? '' : 'No training')}</td>
                <td style={td}>{b.phases.join(' / ')}</td>
                {view === 'day' && <td style={td}>{b.focus.join(', ')}</td>}
                <td style={{ ...td, textAlign: 'right' }}>{b.sessions}</td>
                <td style={{ ...td, textAlign: 'right' }}>{b.sets}</td>
                <td style={{ ...td, textAlign: 'right' }}>{b.reps}</td>
                <td style={{ ...td, textAlign: 'right' }}>{num(b.load, 1)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{b.avg == null ? '—' : `${num(b.avg)}%`}</td>
                <td style={{ ...td, textAlign: 'right' }}>{b.top == null ? '—' : `${b.top}%`}</td>
                <td style={{ ...td, fontSize: '12px', color: 'var(--color-text-muted)' }}>{liftSummary(b.lifts).join(' · ')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {rows && (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Load = reps × % of max (5 reps at 70% = 3.5). Average intensity is weighted by reps. Counts exercises written set by set; ones written as text (e.g. "3x 8") aren't counted.
          {undated > 0 && ` ${undated} program day${undated === 1 ? '' : 's'} without a date ${undated === 1 ? "isn't" : "aren't"} shown.`}
        </p>
      )}
    </div>
  );
}
