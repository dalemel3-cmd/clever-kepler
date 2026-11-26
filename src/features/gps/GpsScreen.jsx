import React from 'react';
import { Activity, Upload } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { supabase } from '../../supabaseClient';
import { reportDataError } from '../../errorReporting';
import { allowFetch, fetchAllRows } from '../../utils/fetchBrake';
import { getCentralDateString } from '../../utils/athleteData';
import { card, h3, label, optionStyle, selectStyle, axis, grid, th, td, tooltipStyle, fmt as fmt1, Tile, Sparkline, Chip } from '../../components/DeepDiveUi';
import { parseTitan, buildImport, weeklyTotals, recentAverage, weekStart, windowDays, seriesFor, teamAverage, compact, acuteChronic, meanOf, priorValues } from './gpsData';
import { baselineOf, changeVs } from '../../utils/swc';
import { useSharedSesoi } from '../../utils/sharedSesoi';
import { useSharedValue, cleanGameDays } from '../../utils/sharedValue';
import SesoiPanel from '../../components/SesoiPanel';

// Performance > GPS (v5.16.7, docs/HANDOFF.md §162): football's Titan GPS numbers. A day's table
// for the team, weekly trends per athlete, and an upload of the Titan "synced data" CSV that
// is checked and shown before anything is saved. Loading the same days again replaces them.
const SPORT = 'Football';
const HISTORY_DAYS = 120;
const COLS = [
  { key: 'distance_yd', short: 'Dist (yd)', head: 'Distance (yd)', d: 0, tip: 'GPS distance in yards' },
  { key: 'top_speed_mph', short: 'Top mph', head: 'Top speed (mph)', d: 1, tip: 'Top speed in miles per hour' },
  { key: 'accel_count', short: 'Accels', head: 'Hi-speed accels', d: 0, tip: 'High-speed accelerations, 4 to 8 m/s²' },
  { key: 'decel_count', short: 'Decels', head: 'Hi-speed decels', d: 0, tip: 'High-speed decelerations, 4 to 8 m/s²' },
  { key: 'high_speed_yd', short: 'Band (yd)', head: 'Speed band (yd)', d: 0, tip: 'Yards between 12.5 and 22.4 mph' },
  { key: 'personal_band_yd', short: 'Personal (yd)', head: 'Personal band (yd)', d: 0, tip: 'Yards at 80% or more of the athlete’s own top mph' },
];
// Whole numbers get thousands separators (6,440); one decimal stays as is (17.0).
const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : d ? fmt1(n, d) : Math.round(Number(n)).toLocaleString('en-US'));
const sel = { ...selectStyle, height: '44px' };
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const btn = { height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--color-accent)', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' };

const Chart = ({ k, title, color, unit, chart, band }) => (
  <div style={{ minWidth: 0 }}>
    <span style={label}>{title}</span>
    <div style={{ width: '100%', height: 150 }}>
      <ResponsiveContainer>
        <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={44} allowDecimals={false} domain={k === 'top' ? ['dataMin - 1', 'dataMax + 1'] : [0, 'auto']} />
          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${unit}`, title]} />
          {band && <ReferenceArea y1={band.lo} y2={band.hi} fill="#94a3b8" fillOpacity={0.22} stroke="none" ifOverflow="extendDomain" />}
          <Line type="monotone" dataKey={k} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

function AthleteDetail({ totals, daily, bands = {} }) {
  const have = totals.filter(w => w.days);
  if (!have.length) return <div style={{ padding: '16px', color: 'var(--color-text-muted)' }}>No GPS sessions for this athlete in the last 8 weeks.</div>;
  // The charts are daily: one point per session day (days with no session are left out).
  const chart = daily.map(s => ({ week: longDate(s.session_date), distance: s.distance_yd == null ? null : Math.round(Number(s.distance_yd)), fast: s.high_speed_yd == null ? null : Math.round(Number(s.high_speed_yd)), top: s.top_speed_mph == null ? null : Number(s.top_speed_mph) }));
  const last = totals[totals.length - 1];
  const avg = recentAverage(totals, 'distance_yd');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '16px' }}>
        <Chart chart={chart} band={bands.distance_yd} k="distance" title="Daily distance (yd)" color="#60a5fa" unit="yd" />
        <Chart chart={chart} band={bands.high_speed_yd} k="fast" title="Daily speed band (yd)" color="#fbbf24" unit="yd" />
        <Chart chart={chart} band={bands.top_speed_mph} k="top" title="Daily top speed (mph)" color="#34d399" unit="mph" />
      </div>
      {Object.keys(bands).length > 0 && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Grey band: the athlete's usual (average of the 28 days before the chosen day) plus or minus the larger of SWC and SESOI. The chosen day outside it is a real change.</div>}
      {last.distance_yd != null && avg != null && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Week of {longDate(last.week)}: {fmt(last.distance_yd)} yd vs {fmt(avg)} yd average of the earlier weeks{avg > 0 ? ` (${Math.round((last.distance_yd / avg - 1) * 100) >= 0 ? '+' : ''}${Math.round((last.distance_yd / avg - 1) * 100)}%)` : ''}. A week that is not finished yet reads low.
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead><tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '4px 6px' }}>Week of</th><th style={{ padding: '4px 6px' }}>Days</th>
            {COLS.map(c => <th key={c.key} style={{ padding: '4px 6px' }} title={c.tip}>{c.head}</th>)}
          </tr></thead>
          <tbody>
            {[...totals].reverse().filter(w => w.days).map(w => (
              <tr key={w.week} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '6px' }}>{longDate(w.week)}</td><td style={{ padding: '6px' }}>{w.days}</td>
                {COLS.map(c => <td key={c.key} style={{ padding: '6px', fontVariantNumeric: 'tabular-nums' }}>{fmt(w[c.key], c.d)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600, marginTop: '6px' }}>Charts: each session day, last 28 days. Table: weekly totals; top speed is the week's highest.</div>
      </div>
    </div>
  );
}

const shortDay = (iso) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}`; };
const viewBtn = (on) => ({ height: '44px', padding: '0 16px', borderRadius: '10px', border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'}`, background: on ? 'rgba(184, 156, 91, 0.2)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer' });

// Trends (v5.16.9): every athlete by every session day for one number, shaded light (less) to
// dark (more) on one hue, with the team average as a line on top. Tap a cell for that day's numbers.
function TrendsView({ sessions, roster, end, games = new Set() }) {
  const [metric, setMetric] = React.useState('distance_yd');
  const [weeks, setWeeks] = React.useState(4);
  const [picked, setPicked] = React.useState(null); // { athleteId, date }
  const [order, setOrder] = React.useState('name'); // 'name' | 'high' | 'low' (average over the window)
  const col = COLS.find(c => c.key === metric);
  const dates = React.useMemo(() => windowDays(sessions, end, weeks * 7), [sessions, end, weeks]);
  const rows = React.useMemo(() => roster
    .map(a => { const values = seriesFor(sessions, a.id, dates, metric); return { athlete: a, values, avg: meanOf(values) }; })
    .filter(r => r.avg != null)
    .sort((x, y) => (order === 'high' ? y.avg - x.avg : order === 'low' ? x.avg - y.avg : 0) || x.athlete.name.localeCompare(y.athlete.name)), [roster, sessions, dates, metric, order]);
  const avgs = React.useMemo(() => teamAverage(sessions, rows.map(r => r.athlete.id), dates, metric), [sessions, rows, dates, metric]);
  const all = rows.flatMap(r => r.values.filter(v => v != null));
  const max = all.length ? Math.max(...all) : 0, min = all.length ? Math.min(...all) : 0;
  // Lowest value in the grid = faint (almost the card), highest = bright blue, so day-to-day
  // differences show. Bright cells get dark text so the number stays readable.
  const alpha = (v) => 0.06 + 0.84 * (max > min ? (v - min) / (max - min) : 0.5);
  const shade = (v) => (v == null ? 'transparent' : `rgba(96, 165, 250, ${alpha(v).toFixed(3)})`);
  const ink = (v) => (v != null && alpha(v) > 0.6 ? '#0a1120' : 'var(--white)');
  const pick = picked && dates.includes(picked.date) && sessions.find(s => s.athlete_id === picked.athleteId && s.session_date === picked.date);
  const pickName = picked && roster.find(a => a.id === picked.athleteId)?.name;
  const cell = { width: '52px', minWidth: '52px', height: '44px', padding: 0, border: 'none', borderRadius: '6px', color: 'var(--white)', fontSize: '12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', cursor: 'pointer' };
  if (!dates.length || !rows.length) return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No GPS sessions in this window.</div>;
  return (
    <div data-testid="gps-trends" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Trend metric" value={metric} onChange={e => { setMetric(e.target.value); setPicked(null); }} className="input-glass" style={sel}>
          {COLS.map(c => <option key={c.key} value={c.key} style={optionStyle}>{c.head}</option>)}
        </select>
        <select aria-label="Trend window" value={weeks} onChange={e => { setWeeks(Number(e.target.value)); setPicked(null); }} className="input-glass" style={sel}>
          {[2, 4, 8].map(w => <option key={w} value={w} style={optionStyle}>Last {w} weeks</option>)}
        </select>
        <select aria-label="Trend sort" value={order} onChange={e => setOrder(e.target.value)} className="input-glass" style={sel}>
          <option value="name" style={optionStyle}>Sort: Athlete (A–Z)</option>
          <option value="high" style={optionStyle}>Sort: Largest average</option>
          <option value="low" style={optionStyle}>Sort: Smallest average</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{rows.length} athletes · {dates.length} session days up to {longDate(end)}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={label}>Team average · {col.head}</span>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer>
            <LineChart data={dates.map((d, i) => ({ day: shortDay(d), avg: avgs[i] == null ? null : +avgs[i].toFixed(col.d) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={44} allowDecimals={false} domain={metric === 'top_speed_mph' ? ['dataMin - 1', 'dataMax + 1'] : [0, 'auto']} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v, col.d), `Team average, ${col.head}`]} />
              <Line type="monotone" dataKey="avg" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--navy-900)', zIndex: 1 }}>Athlete</th>
              {dates.map(d => <th key={d} style={{ ...th, padding: '4px', textAlign: 'center', color: games.has(d) ? 'var(--color-accent)' : th.color }} title={games.has(d) ? 'Game day' : undefined}>{shortDay(d)}{games.has(d) ? ' ★' : ''}</th>)}
              <th style={{ ...th, padding: '4px 8px' }} title="Average of this athlete's session days in the window">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.athlete.id} data-testid="gps-trend-row">
                <td style={{ ...td, fontWeight: 700, position: 'sticky', left: 0, background: 'var(--navy-900)', zIndex: 1 }}>{r.athlete.name}</td>
                {r.values.map((v, i) => (
                  <td key={dates[i]} style={{ padding: 0 }}>
                    {v == null
                      ? <div role="img" style={{ ...cell, cursor: 'default', border: '1px dashed rgba(255,255,255,0.08)' }} aria-label={`${r.athlete.name}, ${longDate(dates[i])}: no session`} />
                      : <button type="button" data-testid="gps-cell" onClick={() => setPicked({ athleteId: r.athlete.id, date: dates[i] })} aria-label={`${r.athlete.name}, ${longDate(dates[i])}: ${fmt(v, col.d)} ${col.head}`} title={`${fmt(v, col.d)}`} style={{ ...cell, background: shade(v), color: ink(v), outline: picked && picked.athleteId === r.athlete.id && picked.date === dates[i] ? '2px solid var(--color-accent)' : undefined }}>{compact(v, metric)}</button>}
                  </td>
                ))}
                <td data-testid="gps-trend-rowavg" style={{ ...td, fontWeight: 800, padding: '0 8px' }}>{compact(r.avg, metric)}</td>
              </tr>
            ))}
            <tr data-testid="gps-trend-avg">
              <td style={{ ...td, fontWeight: 800, color: 'var(--color-accent)', position: 'sticky', left: 0, background: 'var(--navy-900)', zIndex: 1 }}>TEAM AVERAGE</td>
              {avgs.map((v, i) => <td key={dates[i]} style={{ padding: 0 }}><div style={{ ...cell, cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', background: shade(v), color: ink(v), border: '1px solid var(--color-accent)' }}>{compact(v, metric)}</div></td>)}
              <td style={{ ...td, fontWeight: 800, color: 'var(--color-accent)', padding: '0 8px' }} title="Average of the athletes' averages">{compact(meanOf(rows.map(r => r.avg)), metric)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
        <span>Less ({fmt(min, col.d)})</span>
        {[0, 0.25, 0.5, 0.75, 1].map(f => <span key={f} aria-hidden="true" style={{ width: '22px', height: '12px', borderRadius: '3px', background: shade(min + f * (max - min)) }} />)}
        <span>More ({fmt(max, col.d)})</span>
        <span>· dashed: no session · k = thousand</span>
      </div>
      {pick && (
        <div data-testid="gps-cell-detail" role="status" style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', fontSize: '13px' }}>
          <strong>{pickName} · {longDate(pick.session_date)}</strong>{' · '}
          {COLS.map(c => `${c.head} ${fmt(pick[c.key], c.d)}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

// Acute : chronic (v5.17.0): this week's (and the last two weeks') load against the athlete's
// own 4-week weekly average, for the chosen GPS number. Same zones as the RPE tab: at or above the
// spike ratio is a spike, under 0.8 is low. Top speed is a peak, not a load, so it isn't offered.
// The "Vs usual" chip: the day's value against the athlete's usual (SWC / SESOI, v5.17.1).
function usualChip(v, col, sesoi) {
  if (!v || !v.base || !v.ch) return <span title={!v || !v.base ? 'Needs 3 sessions in the 28 days before this day' : 'No value for this number on this day'} aria-label={!v || !v.base ? 'Not enough earlier sessions' : 'No value this day'} style={{ color: 'var(--color-text-muted)' }}>—</span>;
  const { base, ch } = v;
  const tip = `Usual ${fmt(base.mean, col.d)} · SWC ${fmt(base.swc, col.d)} · SESOI ${sesoi != null ? fmt(sesoi, col.d) : 'not set'} · change ${ch ? (ch.diff >= 0 ? '+' : '−') + fmt(Math.abs(ch.diff), col.d) : '—'}`;
  if (ch.dir === 'trivial') return <span title={tip} aria-label={`Usual. ${tip}`}><Chip tone="muted">Usual</Chip></span>;
  const up = ch.dir === 'up';
  return <span title={tip} aria-label={`${up ? 'Above' : 'Below'} usual. ${tip}`}><Chip tone={col.key === 'top_speed_mph' && up ? 'ok' : 'warn'}>{up ? '▲ +' : '▼ −'}{fmt(Math.abs(ch.diff), col.d)}</Chip></span>;
}

// The smallest difference each GPS number can show; the SWC threshold never goes below it.
const STEP = { distance_yd: 1, top_speed_mph: 0.1, accel_count: 1, decel_count: 1, high_speed_yd: 1, personal_band_yd: 1 };

const LOAD_COLS = COLS.filter(c => c.key !== 'top_speed_mph');
const acTone = (r, spike) => (r == null ? 'muted' : r >= spike ? 'bad' : r < 0.8 ? 'warn' : 'ok');
function AcuteChronicView({ sessions, roster, end, spike, loadedFrom }) {
  const [metric, setMetric] = React.useState('distance_yd');
  const [order, setOrder] = React.useState('ratio7');
  const col = LOAD_COLS.find(c => c.key === metric);
  const rows = React.useMemo(() => {
    const r = acuteChronic(sessions, roster, end, metric, loadedFrom);
    const key = order === 'low' ? 'ratio7' : order === 'ratio14' ? 'ratio14' : 'ratio7';
    // Building rows and rows with no ratio go last in the ratio sorts: their numbers aren't real yet.
    const later = (x) => (x.building || x[key] == null ? 1 : 0);
    return r.sort((x, y) => (order === 'name' ? 0 : later(x) - later(y) || (order === 'low' ? (x[key] ?? 0) - (y[key] ?? 0) : (y[key] ?? 0) - (x[key] ?? 0))) || x.athlete.name.localeCompare(y.athlete.name));
  }, [sessions, roster, end, metric, order, loadedFrom]);
  const ready = rows.filter(r => !r.building && r.ratio7 != null);
  const spikes = ready.filter(r => r.ratio7 != null && r.ratio7 >= spike).length;
  const low = ready.filter(r => r.ratio7 != null && r.ratio7 < 0.8).length;
  const status = (r) => (r.building ? <Chip tone="muted">Building</Chip> : r.ratio7 == null ? <Chip tone="muted">—</Chip> : r.ratio7 >= spike ? <Chip tone="bad">Spike</Chip> : r.ratio7 < 0.8 ? <Chip tone="warn">Low</Chip> : <Chip tone="ok">In range</Chip>);
  if (!rows.length) return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No GPS sessions in the 28 days up to {longDate(end)}.</div>;
  return (
    <div data-testid="gps-ac" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Load metric" value={metric} onChange={e => setMetric(e.target.value)} className="input-glass" style={sel}>
          {LOAD_COLS.map(c => <option key={c.key} value={c.key} style={optionStyle}>{c.head}</option>)}
        </select>
        <select aria-label="Load sort" value={order} onChange={e => setOrder(e.target.value)} className="input-glass" style={sel}>
          <option value="ratio7" style={optionStyle}>Sort: 7:28 highest</option>
          <option value="ratio14" style={optionStyle}>Sort: 14:28 highest</option>
          <option value="low" style={optionStyle}>Sort: 7:28 lowest</option>
          <option value="name" style={optionStyle}>Sort: Athlete (A–Z)</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Up to {longDate(end)} · {rows.length} athletes</span>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Tile value={spikes} text={`7:28 at or above ${spike}`} tone={spikes ? 'bad' : null} />
        <Tile value={low} text="7:28 under 0.8" tone={low ? 'warn' : null} />
        <Tile value={ready.length - spikes - low} text="In range" tone="ok" />
        <Tile value={rows.filter(r => r.building).length} text="Building (under 3 weeks of data)" />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={th}>Athlete</th>
              <th style={th} title="Total over the last 7 days">7 days</th>
              <th style={th} title="Total over the last 14 days">14 days</th>
              <th style={th} title="Total over the last 28 days">28 days</th>
              <th style={th} title="28-day total ÷ 4">Weekly avg (28 d)</th>
              <th style={th} title="7-day total ÷ weekly average of the last 28 days">A:C 7:28</th>
              <th style={th} title="14-day total ÷ 2 ÷ weekly average of the last 28 days">A:C 14:28</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.athlete.id} data-testid="gps-ac-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ ...td, fontWeight: 700 }}>{r.athlete.name}</td>
                <td style={td}>{fmt(r.sum7)}</td>
                <td style={td}>{fmt(r.sum14)}</td>
                <td style={td}>{fmt(r.sum28)}</td>
                <td style={td}>{fmt(r.sum28 / 4)}</td>
                <td style={td}><Chip tone={r.building ? 'muted' : acTone(r.ratio7, spike)}>{fmt1(r.ratio7, 2)}</Chip></td>
                <td style={td}><Chip tone={r.building ? 'muted' : acTone(r.ratio14, spike)}>{fmt1(r.ratio14, 2)}</Chip></td>
                <td style={td}>{status(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600, lineHeight: 1.5 }}>
        {col.head}, totals over the 7, 14 and 28 days up to the chosen day. A:C 7:28 = last 7 days ÷ the weekly average of the last 28; A:C 14:28 = last 14 days ÷ 2 ÷ that same weekly average. 1.0 = in line with the last four weeks. Spike at or above {spike} (the RPE tab's setting; the chronic window here is always 28 days), low under 0.8. "Building" = under 3 weeks of GPS history, so the 28-day average is still filling in.
      </div>
    </div>
  );
}

export default function GpsScreen({ athletes, settings = {} }) {
  const roster = React.useMemo(() => athletes.filter(a => a.sport === SPORT), [athletes]);
  const byId = React.useMemo(() => new Map(roster.map(a => [a.id, a])), [roster]);
  const [sessions, setSessions] = React.useState(null); // null = loading
  const [loadError, setLoadError] = React.useState('');
  const [day, setDay] = React.useState('');
  const [sortBy, setSortBy] = React.useState('distance_yd');
  const [view, setView] = React.useState('day'); // 'day' | 'trends' | 'ac'
  const [sesoi, saveSesoi] = useSharedSesoi();
  // Game days (v5.17.2), marked by a coach for every device; the "usual" can compare game days
  // with game days and practices with practices (remembered on this device).
  const [gameDays, saveGameDays] = useSharedValue('gps_game_days', cleanGameDays, { dates: [] });
  const games = React.useMemo(() => new Set(gameDays.dates), [gameDays]);
  const [usualMode, setUsualMode] = React.useState(() => { try { return localStorage.getItem('hpd_gps_usual_mode') === 'type' ? 'type' : 'all'; } catch { return 'all'; } });
  const pickUsualMode = (m) => { setUsualMode(m); try { localStorage.setItem('hpd_gps_usual_mode', m); } catch { /* ignore */ } };
  const [gameMsg, setGameMsg] = React.useState('');
  const [gameBusy, setGameBusy] = React.useState(false);
  const toggleGame = async () => {
    if (!dayNow || gameBusy) return;
    setGameBusy(true);
    const on = !games.has(dayNow);
    setGameMsg('');
    const res = await saveGameDays(v => ({ dates: on ? [...new Set([...v.dates, dayNow])].sort() : v.dates.filter(d => d !== dayNow) }));
    setGameBusy(false);
    if (!res.ok) setGameMsg("Couldn't save. Check the connection and try again.");
  };
  const loadedFrom = React.useMemo(() => new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10), []);
  const [openId, setOpenId] = React.useState(null);
  const [preview, setPreview] = React.useState(null); // { fileName, parsed, manual }
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState(null);   // { tone, text }
  const fileRef = React.useRef(null);

  const load = React.useCallback(async (force = false) => {
    if (!force && !allowFetch('gps:sessions', { max: 6, windowMs: 60000 })) return;
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
    const { data, error } = await fetchAllRows(() => supabase.from('gps_sessions').select('id,athlete_id,session_date,distance_yd,top_speed_mph,accel_count,decel_count,high_speed_yd,personal_band_yd').gte('session_date', since).order('session_date', { ascending: false }).order('id'));
    if (error) { reportDataError(error, 'gps_sessions:fetch'); setLoadError('Could not load GPS data. Try again in a moment.'); setSessions(s => s || []); return; }
    setLoadError(''); setSessions(data || []);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const days = React.useMemo(() => [...new Set((sessions || []).map(s => s.session_date))].sort().reverse(), [sessions]);
  const dayNow = days.includes(day) ? day : (days[0] || '');
  const dayRows = React.useMemo(() => {
    const rows = (sessions || []).filter(s => s.session_date === dayNow && byId.has(s.athlete_id)).map(s => ({ ...s, athlete: byId.get(s.athlete_id) }));
    return rows.sort((a, b) => sortBy === 'name' ? a.athlete.name.localeCompare(b.athlete.name) : (Number(b[sortBy]) || 0) - (Number(a[sortBy]) || 0) || a.athlete.name.localeCompare(b.athlete.name));
  }, [sessions, dayNow, byId, sortBy]);
  const today = getCentralDateString();
  const weekOf = dayNow ? weekStart(dayNow) : weekStart(today);
  const weekSessions = React.useMemo(() => (sessions || []).filter(s => byId.has(s.athlete_id) && weekStart(s.session_date) === weekOf), [sessions, byId, weekOf]);

  const avg = (k) => { const v = dayRows.filter(r => r[k] != null).map(r => Number(r[k])); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const top = dayRows.reduce((m, r) => (Number(r.top_speed_mph) > (m?.v ?? -1) ? { v: Number(r.top_speed_mph), n: r.athlete.name } : m), null);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setNotice(null);
    let text = '';
    try { text = await f.text(); } catch { setNotice({ tone: 'bad', text: "Couldn't read that file." }); return; }
    const parsed = parseTitan(text);
    if (parsed.errors.length) { setPreview(null); setNotice({ tone: 'bad', text: parsed.errors[0] }); return; }
    setPreview({ fileName: f.name, parsed, manual: {} });
  };
  const result = React.useMemo(() => (preview ? buildImport(preview.parsed, roster, preview.manual) : null), [preview, roster]);

  const confirm = async () => {
    if (!result || !result.rows.length || saving) return;
    setSaving(true);
    const nowIso = new Date().toISOString();
    let failed = false;
    for (let i = 0; i < result.rows.length; i += 200) {
      const chunk = result.rows.slice(i, i + 200).map(r => ({ ...r, updated_at: nowIso }));
      const { error } = await supabase.from('gps_sessions').upsert(chunk, { onConflict: 'athlete_id,session_date' });
      if (error) { reportDataError(error, 'gps_sessions:save'); failed = true; break; }
    }
    setSaving(false);
    if (failed) { setNotice({ tone: 'bad', text: "Couldn't save all of it. Some days may be saved. Upload the same file again: it replaces days rather than adding to them." }); await load(true); return; }
    setNotice({ tone: 'ok', text: `Saved ${result.rows.length} athlete-days (${result.days.length} day${result.days.length === 1 ? '' : 's'}, ${result.athleteCount} athletes).` });
    setPreview(null);
    await load(true);
    if (result.days.length) setDay(result.days[result.days.length - 1]);
  };

  // The team's session days in the 28 days up to the chosen day, for the table's trend lines.
  const trendCol = COLS.find(c => c.key === sortBy) || COLS[0]; // the trend line shows what the table is sorted by
  const sparkDates = React.useMemo(() => windowDays(sessions || [], dayNow, 28), [sessions, dayNow]);
  const sparkValues = React.useMemo(() => {
    const m = new Map();
    const idx = new Map(sparkDates.map((d, i) => [d, i]));
    for (const s of sessions || []) {
      const i = idx.get(s.session_date);
      if (i == null || s[trendCol.key] == null) continue;
      if (!m.has(s.athlete_id)) m.set(s.athlete_id, Array(sparkDates.length).fill(null));
      m.get(s.athlete_id)[i] = Number(s[trendCol.key]);
    }
    return m;
  }, [sessions, sparkDates, trendCol.key]);
  // Each row's change against the athlete's usual for the sorted number (SWC / SESOI, v5.17.1).
  // 'type': only earlier days of the same kind as the chosen day (game vs practice).
  const keepDay = React.useMemo(() => {
    if (usualMode !== 'type' || !dayNow) return null;
    const isGame = games.has(dayNow);
    return (d) => games.has(d) === isGame;
  }, [usualMode, dayNow, games]);
  const vsUsual = React.useMemo(() => {
    const m = new Map();
    for (const r of dayRows) {
      const base = baselineOf(priorValues(sessions || [], r.athlete_id, dayNow, trendCol.key, 28, keepDay), sesoi[trendCol.key], STEP[trendCol.key]);
      m.set(r.athlete_id, { base, ch: changeVs(r[trendCol.key], base) });
    }
    return m;
  }, [dayRows, sessions, dayNow, trendCol.key, sesoi, keepDay]);
  const bandsFor = (id) => {
    const out = {};
    for (const k of ['distance_yd', 'high_speed_yd', 'top_speed_mph']) {
      const b = baselineOf(priorValues(sessions || [], id, dayNow, k, 28, keepDay), sesoi[k], STEP[k]);
      if (b) out[k] = { lo: Math.max(0, +(b.mean - b.threshold).toFixed(1)), hi: +(b.mean + b.threshold).toFixed(1) };
    }
    return out;
  };
  const totalsFor = (id) => weeklyTotals(sessions || [], id, 8, dayNow || today);
  // This athlete's session days, oldest first: the 28 days up to the chosen day.
  const dailyFor = (id) => {
    const end = dayNow || today;
    const start = new Date(Date.parse(`${end}T00:00:00Z`) - 27 * 86400000).toISOString().slice(0, 10);
    return (sessions || []).filter(s => s.athlete_id === id && s.session_date >= start && s.session_date <= end).sort((a, b) => (a.session_date < b.session_date ? -1 : 1));
  };

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>PERFORMANCE &middot; GPS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>GPS</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{SPORT} · Titan{dayNow ? ` · ${longDate(dayNow)}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Day" value={dayNow} onChange={e => { setDay(e.target.value); setOpenId(null); setGameMsg(''); }} className="input-glass" style={sel} disabled={!days.length}>
            {days.length === 0 && <option value="">No days yet</option>}
            {days.map(d => <option key={d} value={d} style={optionStyle}>{longDate(d)}{games.has(d) ? ' · Game' : ''}</option>)}
          </select>
          {view === 'day' && <select aria-label="Sort" value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-glass" style={sel}>
            {COLS.map(c => <option key={c.key} value={c.key} style={optionStyle}>Sort: {c.head}</option>)}
            <option value="name" style={optionStyle}>Sort: Name (A–Z)</option>
          </select>}
          {dayNow && <button type="button" data-testid="gps-game-toggle" aria-pressed={games.has(dayNow)} aria-busy={gameBusy} disabled={gameBusy} onClick={toggleGame} title="Mark the chosen day as a game day (for every device)" style={{ ...btn, ...(games.has(dayNow) ? {} : { border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--color-text-muted)' }) }}>{games.has(dayNow) ? '★ Game day' : 'Mark game day'}</button>}
          {view === 'day' && <select aria-label="Usual from" value={usualMode} onChange={e => pickUsualMode(e.target.value)} className="input-glass" style={sel}>
            <option value="all" style={optionStyle}>Usual: all days</option>
            <option value="type" style={optionStyle}>Usual: game vs practice</option>
          </select>}
          <SesoiPanel items={COLS.map(c => ({ key: c.key, label: c.head, unit: c.key === 'top_speed_mph' ? 'mph' : c.key.endsWith('_count') ? 'count' : 'yd' }))} values={sesoi} onSave={saveSesoi} />
          <button type="button" style={btn} onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload Titan CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Titan CSV file" onChange={onFile} style={{ display: 'none' }} />
        </div>
      </div>

      {notice && <div role="status" data-testid="gps-notice" style={{ padding: '12px 16px', borderRadius: '10px', background: notice.tone === 'ok' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: notice.tone === 'ok' ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '13px' }}>{notice.text}</div>}

      {preview && result && (
        <div className="card-glass" style={card} data-testid="gps-preview">
          <h2 style={h3}>Check before saving</h2>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{preview.fileName}</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Tile value={result.rows.length} text="Athlete-days to save" tone={result.rows.length ? 'ok' : null} />
            <Tile value={result.days.length} text="Days" />
            <Tile value={result.athleteCount} text="Athletes matched" />
            <Tile value={result.unresolved} text="Names not matched" tone={result.unresolved ? 'warn' : null} />
            <Tile value={result.skippedZero} text="All-zero rows skipped" />
          </div>
          {result.needsLook.length > 0 && <div style={{ ...label }}>Names to check (not an exact match for a roster name)</div>}
          {result.needsLook.map(u => (
            <div key={u.name} data-testid="gps-unmatched" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
              <span style={{ fontWeight: 700 }}>“{u.name}” ({u.count} row{u.count === 1 ? '' : 's'}) is</span>
              <select aria-label={`Match ${u.name}`} value={u.chosen} onChange={e => setPreview(p => ({ ...p, manual: { ...p.manual, [u.name]: e.target.value } }))} className="input-glass" style={sel}>
                <option value="" style={optionStyle}>Pick an athlete…</option>
                {roster.map(a => <option key={a.id} value={a.id} style={optionStyle}>{a.name}</option>)}
                <option value="skip" style={optionStyle}>Skip these rows</option>
              </select>
              {!u.chosen && <span style={{ color: '#fbbf24', fontWeight: 700 }}>not saved until matched</span>}
            </div>
          ))}
          {preview.parsed.badRows > 0 && <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>{preview.parsed.badRows} row{preview.parsed.badRows === 1 ? '' : 's'} had no readable date or name and will be skipped.</div>}
          {result.present.length < 6 && <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>This file has no {['distance_yd', 'top_speed_mph', 'accel_count', 'decel_count', 'high_speed_yd', 'personal_band_yd'].filter(k => !result.present.includes(k)).join(', ')} column; what is already saved for it stays as it is.</div>}
          {preview.parsed.blankCells > 0 && <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>{preview.parsed.blankCells} blank cell{preview.parsed.blankCells === 1 ? '' : 's'} will be saved as empty.</div>}
          {preview.parsed.badNumbers > 0 && <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>{preview.parsed.badNumbers} value{preview.parsed.badNumbers === 1 ? ' is' : 's are'} not a number and will be saved as empty.</div>}
          {result.outOfRange > 0 && <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>{result.outOfRange} row{result.outOfRange === 1 ? ' has' : 's have'} a distance over 30,000 or a top speed over 35 mph: check the units in Titan are yards and mph.</div>}
          {result.duplicates > 0 && <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>{result.duplicates} row{result.duplicates === 1 ? ' repeats' : 's repeat'} an athlete already in the file for that day; the later row is used.</div>}
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Days already saved are replaced by this file, not added to.</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={{ ...btn, opacity: !result.rows.length || saving ? 0.5 : 1, cursor: !result.rows.length || saving ? 'not-allowed' : 'pointer' }} disabled={!result.rows.length || saving} onClick={confirm}>{saving ? 'Saving…' : `Save ${result.rows.length} athlete-days`}</button>
            <button type="button" style={{ ...btn, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--color-text-muted)' }} onClick={() => setPreview(null)} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}

      {gameMsg && <div role="alert" style={{ color: '#f87171', fontWeight: 700, fontSize: '13px' }}>{gameMsg}</div>}
      {loadError && <div role="alert" style={{ color: '#f87171', fontWeight: 700, fontSize: '13px' }}>{loadError}</div>}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Tile value={dayRows.length} text={`Athletes tracked · ${dayNow ? longDate(dayNow) : '—'}`} />
        <Tile value={fmt(avg('distance_yd'))} text="Avg distance (yd)" />
        <Tile value={fmt(avg('high_speed_yd'))} text="Avg speed band (yd)" />
        <Tile value={top ? fmt(top.v, 1) : '—'} text={top ? `Top speed · ${top.n}` : 'Top speed (mph)'} />
        <Tile value={weekSessions.length} text={`Athlete-days, week of ${longDate(weekOf)}`} />
      </div>

      <div className="card-glass" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={h3}><Activity size={16} style={{ verticalAlign: '-2px', marginRight: '6px', color: '#60a5fa' }} />{view === 'ac' ? 'Acute : chronic load' : view === 'trends' ? 'Team trends' : dayNow ? `${longDate(dayNow)} · ${games.has(dayNow) ? 'game day' : 'team'}` : 'Team'}</h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="group" aria-label="GPS view">
            <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')} style={viewBtn(view === 'day')}>Day table</button>
            <button type="button" aria-pressed={view === 'trends'} onClick={() => setView('trends')} style={viewBtn(view === 'trends')}>Trends</button>
            <button type="button" aria-pressed={view === 'ac'} onClick={() => setView('ac')} style={viewBtn(view === 'ac')}>Acute : Chronic</button>
          </div>
        </div>
        {sessions !== null && dayNow && view === 'trends' ? (
          <TrendsView sessions={sessions} roster={roster} end={dayNow} games={games} />
        ) : sessions !== null && dayNow && view === 'ac' ? (
          <AcuteChronicView sessions={sessions} roster={roster} end={dayNow} spike={Number(settings.rpeLoadSpikeRatio) || 1.3} loadedFrom={loadedFrom} />
        ) : sessions === null ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : dayRows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No GPS data yet. Use Upload Titan CSV to add a session.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={th}>Athlete</th>
                  {COLS.map(c => <th key={c.key} style={th} title={`${c.head}: ${c.tip}`}>{c.short}</th>)}
                  <th style={th} title={`${trendCol.head} on each session day in the 28 days up to the chosen day; follows the Sort`}>28-day trend</th>
                  <th style={th} title={`${trendCol.head} on the chosen day vs the athlete's usual (28 days before); a change counts only past the larger of SWC and SESOI`}>Vs usual</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr data-testid="gps-row" tabIndex={0} aria-expanded={openId === r.athlete_id} onClick={() => setOpenId(openId === r.athlete_id ? null : r.athlete_id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(openId === r.athlete_id ? null : r.athlete_id); } }} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: openId === r.athlete_id ? 'rgba(255,255,255,0.04)' : undefined }}>
                      <td style={{ ...td, fontWeight: 700 }}>{r.athlete.name}</td>
                      {COLS.map(c => <td key={c.key} style={td}>{fmt(r[c.key], c.d)}</td>)}
                      <td style={td} data-testid="gps-spark"><Sparkline values={sparkValues.get(r.athlete_id) || []} fromZero={trendCol.key !== 'top_speed_mph'} color="#60a5fa" ariaLabel={`${r.athlete.name}: ${trendCol.head} on each session day, last 28 days`} /></td>
                      <td style={td} data-testid="gps-vs-usual">{usualChip(vsUsual.get(r.athlete_id), trendCol, sesoi[trendCol.key])}</td>
                    </tr>
                    {openId === r.athlete_id && (
                      <tr><td colSpan={COLS.length + 3} style={{ padding: '0 0 12px' }}><AthleteDetail totals={totalsFor(r.athlete_id)} daily={dailyFor(r.athlete_id)} bands={bandsFor(r.athlete_id)} /></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
          Units as exported by Titan: yards, mph. Accels and decels are high-speed (4–8 m/s²). Speed band is 12.5–22.4 mph; personal band is 80% or faster of the athlete's own top mph. Vs usual compares the chosen day with the athlete's own average of the 28 days before it (with Usual: game vs practice, only earlier game days for a game day and only practices for a practice; ★ marks game days); it only shows a change bigger than both the SWC (0.2 × their spread) and your SESOI (SWC / SESOI button). The 28-day trend line shows the number the table is sorted by, one point per team session day (the dot is the athlete's latest); tap a row for full charts, or switch to Trends for the whole team by day.
        </div>
      </div>
    </div>
  );
}
