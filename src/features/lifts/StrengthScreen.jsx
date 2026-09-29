import React from 'react';
import { Dumbbell, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { initialsFor } from '../../utils/athleteData';
import { card, h3, label, optionStyle, selectStyle, axis, grid, th, td, tooltipStyle, fmt, pct, shortDate, Chip, Tile, Sparkline, useVisibleWidth } from '../../components/DeepDiveUi';
import { estimate1RM } from './liftRanking';
import { buildStrengthRows, strengthFlags, latestBodyWeights, prHistory } from './liftMetrics';

// Performance > Strength: the in-depth, per-athlete view of the lifts logged in the
// Lift Tracker. The tracker keeps its leaderboard for quick looks; this is where S&C
// staff see who is progressing, who has plateaued, and each athlete's PR history.
const GOLD = '#b89c5b';

function AthleteDetail({ row, lift, allLogs, onOpenProfile }) {
  const chart = row.weeks.map(w => ({ week: w.weeksAgo === 0 ? 'This wk' : `${w.weeksAgo}w ago`, best: w.best == null ? null : Math.round(w.best), sets: w.sets }));
  // PR for every lift this athlete has logged, not just the one being ranked.
  const byLift = new Map();
  for (const l of allLogs) {
    if (l.athlete_id !== row.athlete.id) continue;
    if (!byLift.has(l.lift_type)) byLift.set(l.lift_type, []);
    byLift.get(l.lift_type).push(l);
  }
  const liftPrs = [...byLift.entries()].map(([name, logs]) => {
    const prs = prHistory(logs);
    return { name, pr: prs[prs.length - 1], sets: logs.length };
  }).sort((a, b) => b.pr.est - a.pr.est);
  const recent = [...row.logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
  const prIds = new Set(row.prs.map(p => p.id));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <span style={label}>{lift}: best est. 1RM by week (PR {row.pr} lb)</span>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={44} domain={['dataMin - 20', 'dataMax + 20']} allowDecimals={false} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [`${v} lb · ${p.payload.sets} set${p.payload.sets === 1 ? '' : 's'}`, 'Best est. 1RM']} />
              <ReferenceLine y={row.pr} stroke={GOLD} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="best" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <span style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Dashed line: all-time PR. Weeks with nothing logged are skipped.</span>

        <span style={{ ...label, marginTop: '8px' }}>PR history ({row.prs.length})</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {row.prs.slice(-8).map(p => (
            <span key={p.id} style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(184, 156, 91, 0.12)', color: GOLD, fontSize: '12px', fontWeight: 700 }}>
              {shortDate(p.created_at)} · {p.weight_lbs}×{p.reps} ({p.est})
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <span style={label}>All lifts: PRs</span>
        {liftPrs.map(x => (
          <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px' }}>
            <span style={{ fontWeight: 700, color: x.name === lift ? GOLD : undefined }}>{x.name}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{x.pr.weight_lbs}×{x.pr.reps} · est. {x.pr.est} · {shortDate(x.pr.created_at)} · {x.sets} set{x.sets === 1 ? "" : "s"}</span>
          </div>
        ))}
        <span style={{ ...label, marginTop: '8px' }}>Recent {lift} sets</span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Set</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Est. 1RM</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>% of PR</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(l => {
                const est = Math.round(estimate1RM(Number(l.weight_lbs), Number(l.reps)));
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '6px', color: 'var(--color-text-muted)' }}>{shortDate(l.created_at)}</td>
                    <td style={{ padding: '6px', fontWeight: 700 }}>{l.weight_lbs} × {l.reps}{prIds.has(l.id) && <span style={{ marginLeft: '6px', color: GOLD, fontSize: '11px', fontWeight: 800 }}>PR</span>}</td>
                    <td style={{ padding: '6px' }}>{est}</td>
                    <td style={{ padding: '6px', color: 'var(--color-text-muted)' }}>{Math.round((est / row.pr) * 100)}%</td>
                  </tr>
                );
              })}
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
  { id: 'pr', label: 'PR (est. 1RM)', key: r => r.pr },
  { id: 'relative', label: 'PR ÷ body weight', key: r => r.relative ?? -1 },
  { id: 'change', label: 'Trend (change in window)', key: r => r.change ?? -Infinity },
  { id: 'pctpr', label: 'Recent % of PR (lowest first)', key: r => -(r.pctOfPr ?? Infinity) },
  { id: 'volume', label: 'Volume', key: r => r.volume },
  { id: 'name', label: 'Name (A–Z)', key: null },
];

export default function StrengthScreen({ settings, athletes, liftLogs, reportData, setSelectedProfileId, fetchProfileData, setScreen, setProfileEntryScreen }) {
  const liftTypes = settings.liftTypes && settings.liftTypes.length ? settings.liftTypes : ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];
  const [lift, setLift] = React.useState(liftTypes[0] || '');
  const [sport, setSport] = React.useState('ALL');
  const [windowWeeks, setWindowWeeks] = React.useState(8);
  const [sortBy, setSortBy] = React.useState('pr');
  const [query, setQuery] = React.useState('');
  const [openId, setOpenId] = React.useState(null);
  const [scrollRef, visibleWidth] = useVisibleWidth();

  const bodyWeights = React.useMemo(() => latestBodyWeights(reportData), [reportData]);
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const roster = React.useMemo(() => athletes.filter(a => (sport === 'ALL' || (a.sport || 'General') === sport)
    && (!query.trim() || a.name.toLowerCase().includes(query.trim().toLowerCase()))), [athletes, sport, query]);
  const rows = React.useMemo(() => {
    const r = buildStrengthRows(roster, liftLogs, { lift, windowWeeks, bodyWeights });
    const s = SORTS.find(x => x.id === sortBy) || SORTS[0];
    return s.key ? r.sort((a, b) => s.key(b) - s.key(a) || a.athlete.name.localeCompare(b.athlete.name)) : r.sort((a, b) => a.athlete.name.localeCompare(b.athlete.name));
  }, [roster, liftLogs, lift, windowWeeks, bodyWeights, sortBy]);

  const openProfile = (id) => {
    setSelectedProfileId(id);
    if (fetchProfileData) fetchProfileData(id);
    if (setProfileEntryScreen) setProfileEntryScreen('strength');
    setScreen('profiles');
  };

  const prsInWindow = rows.reduce((s, r) => s + r.prsInWindow, 0);
  const newPrAthletes = rows.filter(r => r.prDaysAgo <= 14).length;
  const plateaued = rows.filter(r => strengthFlags(r).some(f => f.key === 'stall' || f.key === 'down')).length;
  const withBw = rows.filter(r => r.relative != null);
  const avgRel = withBw.length ? withBw.reduce((s, r) => s + r.relative, 0) / withBw.length : null;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>PERFORMANCE &middot; STRENGTH</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>STRENGTH</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            {lift} progress per athlete · last {windowWeeks} weeks{sport !== 'ALL' ? ` · ${sport}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Lift" value={lift} onChange={e => { setLift(e.target.value); setOpenId(null); }} className="input-glass" style={selectStyle}>
            {liftTypes.map(l => <option key={l} value={l} style={optionStyle}>{l}</option>)}
          </select>
          <select aria-label="Sport filter" value={sport} onChange={e => setSport(e.target.value)} className="input-glass" style={selectStyle}>
            <option value="ALL" style={optionStyle}>All Sports</option>
            {sports.map(s => <option key={s} value={s} style={optionStyle}>{s}</option>)}
          </select>
          <select aria-label="Window" value={windowWeeks} onChange={e => setWindowWeeks(Number(e.target.value))} className="input-glass" style={selectStyle}>
            {[4, 8, 12, 16].map(w => <option key={w} value={w} style={optionStyle}>Last {w} weeks</option>)}
          </select>
          <select aria-label="Sort" value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-glass" style={selectStyle}>
            {SORTS.map(s => <option key={s.id} value={s.id} style={optionStyle}>Sort: {s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Tile value={`${rows.length}/${roster.length}`} text={`Logged ${lift}`} />
        <Tile value={prsInWindow} text={`PRs (${windowWeeks} wk)`} tone={prsInWindow ? 'ok' : null} />
        <Tile value={newPrAthletes} text="New PR, last 14 days" tone={newPrAthletes ? 'ok' : null} />
        <Tile value={plateaued} text="Plateau / down" tone={plateaued ? 'warn' : null} />
        <Tile value={avgRel == null ? '—' : `${avgRel.toFixed(2)}×`} text="Avg PR ÷ body wt" />
      </div>

      <div className="card-glass" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={h3}><Dumbbell size={16} style={{ verticalAlign: '-2px', marginRight: '6px', color: '#60a5fa' }} />{lift} progress table</h2>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '0 1 260px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input type="search" aria-label="Search athletes" placeholder="Search athletes" value={query} onChange={e => setQuery(e.target.value)} className="input-glass" style={{ ...selectStyle, width: '100%', paddingLeft: '34px' }} />
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {query ? `No athletes match "${query}".` : `No ${lift} sets logged for this group yet.`}
          </div>
        ) : (
          <div ref={scrollRef} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={th}>Athlete</th>
                  <th style={th} title="All-time best estimated 1RM (Epley)">PR (est.)</th>
                  <th style={th}>PR set</th>
                  <th style={th} title="PR ÷ latest weigh-in">× Body wt</th>
                  <th style={th} title="Best of the later half of the window vs the earlier half">Trend</th>
                  <th style={th} title="Best set in the later half of the window as a % of PR">Recent % PR</th>
                  <th style={th}>PRs</th>
                  <th style={th}>Sets</th>
                  <th style={th} title="Weight × reps, all sets in the window">Volume</th>
                  <th style={th}>Weekly best</th>
                  <th style={th}>Flags</th>
                  <th style={th} aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const open = openId === r.athlete.id;
                  const flags = strengthFlags(r);
                  return (
                    <React.Fragment key={r.athlete.id}>
                      <tr
                        data-testid="strength-row"
                        onClick={() => setOpenId(open ? null : r.athlete.id)}
                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: open ? 'rgba(96, 165, 250, 0.08)' : 'transparent' }}
                      >
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(96, 165, 250, 0.18)', color: '#93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', flex: 'none' }}>{initialsFor(r.athlete.name)}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: 'var(--white)' }}>{r.athlete.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.athlete.sport || 'No sport'} · last {shortDate(r.lastSet.created_at)}</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, fontWeight: 800, color: GOLD }}>{r.pr}</td>
                        <td style={td}>{r.prSet.weight_lbs}×{r.prSet.reps} <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{shortDate(r.prSet.created_at)}</span></td>
                        <td style={td}>{r.relative == null ? '—' : `${r.relative.toFixed(2)}×`}</td>
                        <td style={{ ...td, color: r.change == null ? undefined : r.change > 0 ? '#10b981' : r.change < -0.05 ? '#ef4444' : undefined }}>{pct(r.change)}</td>
                        <td style={td}>{r.pctOfPr == null ? '—' : `${Math.round(r.pctOfPr * 100)}%`}</td>
                        <td style={td}>{r.prsInWindow}</td>
                        <td style={td}>{r.sets}</td>
                        <td style={td}>{r.volume ? fmt(r.volume) : '—'}</td>
                        <td style={td}><Sparkline values={r.weeks.map(w => w.best)} color="#60a5fa" ariaLabel={`Weekly best ${lift}, last ${r.weeks.length} weeks`} /></td>
                        <td style={td}><div style={{ display: 'flex', gap: '4px' }}>{flags.map(f => <Chip key={f.key} tone={f.tone}>{f.label}</Chip>)}</div></td>
                        <td style={td} aria-hidden="true">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={12} style={{ padding: '0 0 12px' }}>
                            <div style={{ position: 'sticky', left: 0, width: visibleWidth || '100%' }}>
                              <AthleteDetail row={r} lift={lift} allLogs={liftLogs} onOpenProfile={() => openProfile(r.athlete.id)} />
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
          PR = best estimated 1RM ever logged (Epley: weight × (1 + reps ÷ 30)), the same number the Lift Tracker leaderboard ranks by.
          Trend compares the best set in the later half of the window with the earlier half. Plateau = still logging but no PR in 8+ weeks.
          Body weight is the latest weigh-in.
        </div>
      </div>
    </div>
  );
}
