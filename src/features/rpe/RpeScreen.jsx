import React from 'react';
import { Activity, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { initialsFor } from '../../utils/athleteData';
import { card, h3, label, optionStyle, selectStyle, axis, grid, th, td, tooltipStyle, fmt, pct, shortDate, Chip, Tile, Sparkline, useVisibleWidth, useMoreColumns, MoreColumnsToggle } from '../../components/DeepDiveUi';
import { buildRpeRows, flagsFor, sessionLoad } from './rpeMetrics';

// Performance > RPE: the in-depth, per-athlete session-RPE view. Analytics keeps its
// quick team load chart; this is where S&C staff dig into who is spiking, who is
// flat, and why. Styling follows AnalyticsScreen (card-glass cards, inline tokens).
const ratioTone = (r, spike) => (r == null ? 'muted' : r >= spike ? 'bad' : r < 0.8 ? 'warn' : 'ok');

function AthleteDetail({ row, settings, onOpenProfile }) {
  const track = settings.rpeTrackDuration !== false;
  const chart = row.weeks.map(w => ({ week: w.weeksAgo === 0 ? 'This wk' : `${w.weeksAgo}w ago`, load: Math.round(w.load), sessions: w.sessions }));
  const byLabel = new Map();
  for (const l of row.logs) {
    const k = l.session_label || 'Unlabeled';
    const cur = byLabel.get(k) || { n: 0, rpe: 0, load: 0 };
    cur.n += 1; cur.rpe += Number(l.rpe) || 0; cur.load += sessionLoad(l, track);
    byLabel.set(k, cur);
  }
  const recent = [...row.logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
  const chronic = Math.round(row.chronicWeekly || 0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <span style={label}>Weekly load vs chronic average ({chronic} AU/wk)</span>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={44} />
              <RechartsTooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={tooltipStyle}
                formatter={(v, n, p) => [`${v} AU · ${p.payload.sessions} session${p.payload.sessions === 1 ? '' : 's'}`, 'Load']}
              />
              {chronic > 0 && <ReferenceLine y={chronic} stroke="#b89c5b" strokeDasharray="4 4" />}
              <Bar dataKey="load" radius={[6, 6, 0, 0]}>
                {chart.map((c, i) => <Cell key={i} fill={i === chart.length - 1 ? '#a78bfa' : 'rgba(167, 139, 250, 0.45)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <span style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Dashed line: chronic weekly average ({settings.rpeChronicWeeks || 4}-week window). Bright bar: the past 7 days.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <span style={label}>By session type (all history)</span>
        {[...byLabel.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px' }}>
            <span style={{ fontWeight: 700 }}>{k}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{v.n} session{v.n === 1 ? '' : 's'} · avg RPE {(v.rpe / v.n).toFixed(1)} · {Math.round(v.load / v.n)} AU avg</span>
          </div>
        ))}
        <span style={{ ...label, marginTop: '8px' }}>Recent sessions</span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Session</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>RPE</th>
                {track && <th style={{ padding: '4px 6px', fontWeight: 700 }}>Min</th>}
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Load</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '6px', color: 'var(--color-text-muted)' }}>{shortDate(l.created_at)}</td>
                  <td style={{ padding: '6px' }}>{l.session_label || '—'}</td>
                  <td style={{ padding: '6px', fontWeight: 700, color: Number(l.rpe) >= (settings.rpeHighThreshold || 8) ? '#ef4444' : undefined }}>{l.rpe}</td>
                  {track && <td style={{ padding: '6px' }}>{l.session_minutes || '—'}</td>}
                  <td style={{ padding: '6px', fontWeight: 700 }}>{Math.round(sessionLoad(l, track))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={onOpenProfile} style={{ alignSelf: 'flex-start', marginTop: '4px', background: 'transparent', border: '1px solid var(--color-accent)', color: 'var(--color-accent)', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' }}>
          Open full profile
        </button>
      </div>
    </div>
  );
}

const SORTS = [
  { id: 'ratio', label: 'A:C ratio (highest first)', key: r => r.ratio ?? -1 },
  { id: 'acute', label: '7-day load', key: r => r.acuteLoad },
  { id: 'change', label: 'Week-over-week change', key: r => r.weekChange ?? -Infinity },
  { id: 'monotony', label: 'Monotony', key: r => r.monotony ?? -1 },
  { id: 'rpe', label: 'Average RPE', key: r => r.avgRpe ?? -1 },
  { id: 'name', label: 'Name (A–Z)', key: null },
];

export default function RpeScreen({ settings, athletes, reportData, setSelectedProfileId, fetchProfileData, setScreen, setProfileEntryScreen }) {
  const [sport, setSport] = React.useState('ALL');
  const [windowWeeks, setWindowWeeks] = React.useState(6);
  const [sortBy, setSortBy] = React.useState('ratio');
  const [query, setQuery] = React.useState('');
  const [openId, setOpenId] = React.useState(null);
  const [scrollRef, visibleWidth] = useVisibleWidth();
  const [more, toggleMore] = useMoreColumns('rpe');
  const spike = settings.rpeLoadSpikeRatio || 1.3;

  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const roster = React.useMemo(() => athletes.filter(a => (sport === 'ALL' || (a.sport || 'General') === sport)
    && (!query.trim() || a.name.toLowerCase().includes(query.trim().toLowerCase()))), [athletes, sport, query]);
  const rows = React.useMemo(() => {
    const r = buildRpeRows(roster, reportData, settings, { windowWeeks });
    const s = SORTS.find(x => x.id === sortBy) || SORTS[0];
    return s.key ? r.sort((a, b) => s.key(b) - s.key(a) || a.athlete.name.localeCompare(b.athlete.name)) : r.sort((a, b) => a.athlete.name.localeCompare(b.athlete.name));
  }, [roster, reportData, settings, windowWeeks, sortBy]);

  const openProfile = (id) => {
    setSelectedProfileId(id);
    if (fetchProfileData) fetchProfileData(id);
    if (setProfileEntryScreen) setProfileEntryScreen('rpe');
    setScreen('profiles');
  };

  if (!settings.enableRpe) {
    return (
      <div className="card-glass" style={{ ...card, alignItems: 'center', textAlign: 'center' }}>
        <h1 style={{ ...h3, fontSize: '22px' }}>Session RPE is turned off</h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Turn it on in Settings to track session RPE and training load.</p>
      </div>
    );
  }

  const reporting = rows.filter(r => r.sessions > 0);
  const spikes = rows.filter(r => r.ratio != null && r.ratio >= spike).length;
  const monotone = rows.filter(r => r.monotony != null && r.monotony > 2).length;
  const teamAvgRpe = reporting.length ? reporting.reduce((s, r) => s + r.avgRpe, 0) / reporting.length : null;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>PERFORMANCE &middot; RPE</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>SESSION RPE</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Per-athlete training load · last {windowWeeks} weeks{sport !== 'ALL' ? ` · ${sport}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Sport filter" value={sport} onChange={e => setSport(e.target.value)} className="input-glass" style={selectStyle}>
            <option value="ALL" style={optionStyle}>All Sports</option>
            {sports.map(s => <option key={s} value={s} style={optionStyle}>{s}</option>)}
          </select>
          <select aria-label="Window" value={windowWeeks} onChange={e => setWindowWeeks(Number(e.target.value))} className="input-glass" style={selectStyle}>
            {[4, 6, 8, 12].map(w => <option key={w} value={w} style={optionStyle}>Last {w} weeks</option>)}
          </select>
          <select aria-label="Sort" value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-glass" style={selectStyle}>
            {SORTS.map(s => <option key={s.id} value={s.id} style={optionStyle}>Sort: {s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Tile value={`${reporting.length}/${roster.length}`} text={`Reporting (${windowWeeks} wk)`} />
        <Tile value={teamAvgRpe == null ? '—' : teamAvgRpe.toFixed(1)} text="Avg RPE" />
        <Tile value={spikes} text={`A:C ≥ ${spike}`} tone={spikes ? 'bad' : null} />
        <Tile value={monotone} text="Monotony > 2.0" tone={monotone ? 'warn' : null} />
      </div>

      <div className="card-glass" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={h3}><Activity size={16} style={{ verticalAlign: '-2px', marginRight: '6px', color: '#a78bfa' }} />Athlete load table</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '0 1 420px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <MoreColumnsToggle more={more} onToggle={toggleMore} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input type="search" aria-label="Search athletes" placeholder="Search athletes" value={query} onChange={e => setQuery(e.target.value)} className="input-glass" style={{ ...selectStyle, width: '100%', paddingLeft: '34px' }} />
          </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {query ? `No athletes match "${query}".` : 'No session RPE logged for this group yet.'}
          </div>
        ) : (
          <div ref={scrollRef} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={th}>Athlete</th>
                  <th style={th} title="7-day load ÷ chronic weekly average">A:C</th>
                  <th style={th}>7-day load</th>
                  {more && <th style={th}>Chronic / wk</th>}
                  <th style={th}>Wk change</th>
                  {more && <th style={th} title="Foster monotony: mean daily load ÷ SD, last 7 days">Monotony</th>}
                  {more && <th style={th} title="Weekly load × monotony">Strain</th>}
                  {more && <th style={th}>Sessions</th>}
                  <th style={th}>Avg RPE</th>
                  {more && <th style={th} title={`Sessions at RPE ${settings.rpeHighThreshold || 8}+`}>Hard</th>}
                  <th style={th}>Trend</th>
                  <th style={th}>Flags</th>
                  <th style={th} aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const open = openId === r.athlete.id;
                  const flags = flagsFor(r, settings);
                  return (
                    <React.Fragment key={r.athlete.id}>
                      <tr
                        data-testid="rpe-row"
                        onClick={() => setOpenId(open ? null : r.athlete.id)}
                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: open ? 'rgba(167, 139, 250, 0.08)' : 'transparent' }}
                      >
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(167, 139, 250, 0.18)', color: '#c4b5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', flex: 'none' }}>{initialsFor(r.athlete.name)}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: 'var(--white)' }}>{r.athlete.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.athlete.sport || 'No sport'} · last {shortDate(r.lastSession)}</span>
                            </div>
                          </div>
                        </td>
                        <td style={td}><Chip tone={ratioTone(r.ratio, spike)}>{fmt(r.ratio, 2)}</Chip></td>
                        <td style={{ ...td, fontWeight: 700 }}>{fmt(r.acuteLoad)}</td>
                        {more && <td style={td}>{fmt(r.chronicWeekly)}</td>}
                        <td style={{ ...td, color: r.weekChange == null ? undefined : r.weekChange > 0.3 ? '#ef4444' : r.weekChange < -0.3 ? '#f59e0b' : undefined }}>{pct(r.weekChange)}</td>
                        {more && <td style={{ ...td, color: r.monotony > 2 ? '#f59e0b' : undefined }}>{fmt(r.monotony, 2)}</td>}
                        {more && <td style={td}>{fmt(r.strain)}</td>}
                        {more && <td style={td}>{r.sessions}</td>}
                        <td style={td}>{fmt(r.avgRpe, 1)}</td>
                        {more && <td style={td}>{r.highSessions}</td>}
                        <td style={td}><Sparkline values={r.weeks.map(w => w.load)} ariaLabel={`Weekly load, last ${r.weeks.length} weeks`} /></td>
                        <td style={td}><div style={{ display: 'flex', gap: '4px' }}>{flags.map(f => <Chip key={f.key} tone={f.tone}>{f.label}</Chip>)}</div></td>
                        <td style={td} aria-hidden="true">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={more ? 13 : 8} style={{ padding: '0 0 12px' }}>
                            <div style={{ position: 'sticky', left: 0, width: visibleWidth || '100%' }}>
                              <AthleteDetail row={r} settings={settings} onOpenProfile={() => openProfile(r.athlete.id)} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Load = RPE{settings.rpeTrackDuration !== false ? ' × minutes' : ''} (AU). A:C = past 7 days ÷ chronic weekly average ({settings.rpeChronicWeeks || 4} weeks); needs 2+ weeks of history.
          Monotony = mean daily load ÷ its SD over the last 7 days, rest days counted as 0; above 2.0 is the usual warning line. Strain = weekly load × monotony.
        </div>
      </div>
    </div>
  );
}
