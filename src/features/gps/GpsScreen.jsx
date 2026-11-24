import React from 'react';
import { Activity, Upload } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../supabaseClient';
import { reportDataError } from '../../errorReporting';
import { allowFetch, fetchAllRows } from '../../utils/fetchBrake';
import { getCentralDateString } from '../../utils/athleteData';
import { card, h3, label, optionStyle, selectStyle, axis, grid, th, td, tooltipStyle, fmt as fmt1, Tile } from '../../components/DeepDiveUi';
import { parseTitan, buildImport, weeklyTotals, recentAverage, weekStart } from './gpsData';

// Performance > GPS (v5.16.7, docs/HANDOFF.md §162): football's Titan GPS numbers. A day's table
// for the team, weekly trends per athlete, and an upload of the Titan "synced data" CSV that
// is checked and shown before anything is saved. Loading the same days again replaces them.
const SPORT = 'Football';
const HISTORY_DAYS = 120;
const COLS = [
  { key: 'distance_yd', head: 'Distance (yd)', d: 0, tip: 'GPS distance in yards' },
  { key: 'top_speed_mph', head: 'Top speed (mph)', d: 1, tip: 'Top speed in miles per hour' },
  { key: 'accel_count', head: 'Hi-speed accels', d: 0, tip: 'High-speed accelerations, 4 to 8 m/s²' },
  { key: 'decel_count', head: 'Hi-speed decels', d: 0, tip: 'High-speed decelerations, 4 to 8 m/s²' },
  { key: 'high_speed_yd', head: 'Speed band (yd)', d: 0, tip: 'Yards between 12.5 and 22.4 mph' },
  { key: 'personal_band_yd', head: 'Personal band (yd)', d: 0, tip: 'Yards at 80% or more of the athlete’s own top mph' },
];
// Whole numbers get thousands separators (6,440); one decimal stays as is (17.0).
const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? '—' : d ? fmt1(n, d) : Math.round(Number(n)).toLocaleString('en-US'));
const sel = { ...selectStyle, height: '44px' };
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const btn = { height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--color-accent)', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' };

const Chart = ({ k, title, color, unit, chart }) => (
  <div style={{ minWidth: 0 }}>
    <span style={label}>{title}</span>
    <div style={{ width: '100%', height: 150 }}>
      <ResponsiveContainer>
        <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={44} allowDecimals={false} domain={k === 'top' ? ['dataMin - 1', 'dataMax + 1'] : [0, 'auto']} />
          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${unit}`, title]} />
          <Line type="monotone" dataKey={k} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

function AthleteDetail({ totals }) {
  const have = totals.filter(w => w.days);
  if (!have.length) return <div style={{ padding: '16px', color: 'var(--color-text-muted)' }}>No GPS sessions for this athlete in the last 8 weeks.</div>;
  const chart = totals.map(w => ({ week: longDate(w.week), distance: w.distance_yd == null ? null : Math.round(w.distance_yd), fast: w.high_speed_yd == null ? null : Math.round(w.high_speed_yd), top: w.top_speed_mph }));
  const last = totals[totals.length - 1];
  const avg = recentAverage(totals, 'distance_yd');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '16px' }}>
        <Chart chart={chart} k="distance" title="Weekly distance (yd)" color="#60a5fa" unit="yd" />
        <Chart chart={chart} k="fast" title="Weekly speed band (yd)" color="#fbbf24" unit="yd" />
        <Chart chart={chart} k="top" title="Top speed of the week (mph)" color="#34d399" unit="mph" />
      </div>
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
        <div style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600, marginTop: '6px' }}>Weekly totals; top speed is the week's highest.</div>
      </div>
    </div>
  );
}

export default function GpsScreen({ athletes }) {
  const roster = React.useMemo(() => athletes.filter(a => a.sport === SPORT), [athletes]);
  const byId = React.useMemo(() => new Map(roster.map(a => [a.id, a])), [roster]);
  const [sessions, setSessions] = React.useState(null); // null = loading
  const [loadError, setLoadError] = React.useState('');
  const [day, setDay] = React.useState('');
  const [sortBy, setSortBy] = React.useState('distance_yd');
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

  const totalsFor = (id) => weeklyTotals(sessions || [], id, 8, dayNow || today);

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>PERFORMANCE &middot; GPS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>GPS</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{SPORT} · Titan{dayNow ? ` · ${longDate(dayNow)}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Day" value={dayNow} onChange={e => { setDay(e.target.value); setOpenId(null); }} className="input-glass" style={sel} disabled={!days.length}>
            {days.length === 0 && <option value="">No days yet</option>}
            {days.map(d => <option key={d} value={d} style={optionStyle}>{longDate(d)}</option>)}
          </select>
          <select aria-label="Sort" value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-glass" style={sel}>
            {COLS.map(c => <option key={c.key} value={c.key} style={optionStyle}>Sort: {c.head}</option>)}
            <option value="name" style={optionStyle}>Sort: Name (A–Z)</option>
          </select>
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

      {loadError && <div role="alert" style={{ color: '#f87171', fontWeight: 700, fontSize: '13px' }}>{loadError}</div>}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Tile value={dayRows.length} text={`Athletes tracked · ${dayNow ? longDate(dayNow) : '—'}`} />
        <Tile value={fmt(avg('distance_yd'))} text="Avg distance (yd)" />
        <Tile value={fmt(avg('high_speed_yd'))} text="Avg speed band (yd)" />
        <Tile value={top ? fmt(top.v, 1) : '—'} text={top ? `Top speed · ${top.n}` : 'Top speed (mph)'} />
        <Tile value={weekSessions.length} text={`Athlete-days, week of ${longDate(weekOf)}`} />
      </div>

      <div className="card-glass" style={card}>
        <h2 style={h3}><Activity size={16} style={{ verticalAlign: '-2px', marginRight: '6px', color: '#60a5fa' }} />{dayNow ? `${longDate(dayNow)} · team` : 'Team'}</h2>
        {sessions === null ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : dayRows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No GPS data yet. Use Upload Titan CSV to add a session.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={th}>Athlete</th>
                  {COLS.map(c => <th key={c.key} style={th} title={c.tip}>{c.head}</th>)}
                </tr>
              </thead>
              <tbody>
                {dayRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr data-testid="gps-row" tabIndex={0} aria-expanded={openId === r.athlete_id} onClick={() => setOpenId(openId === r.athlete_id ? null : r.athlete_id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(openId === r.athlete_id ? null : r.athlete_id); } }} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: openId === r.athlete_id ? 'rgba(255,255,255,0.04)' : undefined }}>
                      <td style={{ ...td, fontWeight: 700 }}>{r.athlete.name}</td>
                      {COLS.map(c => <td key={c.key} style={td}>{fmt(r[c.key], c.d)}</td>)}
                    </tr>
                    {openId === r.athlete_id && (
                      <tr><td colSpan={COLS.length + 1} style={{ padding: '0 0 12px' }}><AthleteDetail totals={totalsFor(r.athlete_id)} /></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
          Units as exported by Titan: yards, mph. Accels and decels are high-speed (4–8 m/s²). Speed band is 12.5–22.4 mph; personal band is 80% or faster of the athlete's own top mph. Tap a row for weekly trends.
        </div>
      </div>
    </div>
  );
}
