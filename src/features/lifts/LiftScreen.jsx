import React from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Dumbbell, Award, Plus, ChevronLeft } from 'lucide-react';
import { getCentralDateString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';

// Estimated 1-rep max (Epley formula). Weight and reps are always stored as the raw
// set an athlete actually did - this is only used to rank/compare sets logged at
// different rep counts (245x5 vs 275x3), never stored back on the row itself.
export const estimate1RM = (weight, reps) => (reps <= 1 ? weight : weight * (1 + reps / 30));

// The best set an athlete has ever logged for a given lift, ranked by estimated 1RM
// - same "one PB per category" convention as bestTestFor in Speed & Power.
export function bestLiftFor(logs, athleteId, liftType) {
  let best = null;
  let bestEst = -Infinity;
  for (const l of logs) {
    if (l.athlete_id !== athleteId || l.lift_type !== liftType) continue;
    const est = estimate1RM(Number(l.weight_lbs), Number(l.reps));
    if (est > bestEst) { bestEst = est; best = l; }
  }
  return best ? { ...best, estimated1RM: Math.round(bestEst) } : null;
}

const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
const colorFor = (name) => avatarColors[name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length];
const initialsOf = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase();
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Avatar({ name, size = 42 }) {
  return (
    <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: '12px', background: colorFor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: `${Math.round(size * 0.36)}px`, flexShrink: 0 }}>
      {initialsOf(name)}
    </div>
  );
}

export default function LiftScreen({
  settings,
  athletes,
  liftLogs,
  reportData,
  addLift,
  setSelectedProfileId,
  fetchProfileData,
  setProfileEntryScreen,
  setScreen,
}) {
  const liftTypes = settings.liftTypes && settings.liftTypes.length ? settings.liftTypes : ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];

  const [view, setView] = React.useState('log'); // 'log' | 'leaderboard'
  const [search, setSearch] = React.useState('');
  const [sportFilter, setSportFilter] = React.useState('ALL');
  const [entryAthleteId, setEntryAthleteId] = React.useState(null);
  const [liftType, setLiftType] = React.useState(liftTypes[0] || '');
  const [weight, setWeight] = React.useState('');
  const [reps, setReps] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [leaderboardLift, setLeaderboardLift] = React.useState(liftTypes[0] || '');

  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);

  // Most recent lift log per athlete, across every lift type - drives both the
  // "Today's session" recent row and each roster row's "last logged" / staleness
  // badge, so a coach can spot who hasn't touched the weight room in a while
  // without opening Profiles.
  const lastLiftByAthlete = React.useMemo(() => {
    const map = new Map();
    for (const l of liftLogs) {
      const cur = map.get(l.athlete_id);
      if (!cur || new Date(l.created_at) > new Date(cur.created_at)) map.set(l.athlete_id, l);
    }
    return map;
  }, [liftLogs]);

  // Most recent real body weight per athlete (weigh-ins only - post-practice sweat
  // checks and RPE-only rows don't carry a trustworthy weight), for the row's meta
  // line. Falls back to nothing shown if an athlete has never weighed in.
  const lastWeightByAthlete = React.useMemo(() => {
    const map = new Map();
    for (const r of (reportData || [])) {
      if (!hasWeight(r) || isPostPracticeLog(r) || isRpeLog(r)) continue;
      const cur = map.get(r.athlete_id);
      if (!cur || new Date(r.created_at) > new Date(cur.created_at)) map.set(r.athlete_id, r);
    }
    return map;
  }, [reportData]);

  const todayStr = getCentralDateString();
  // Today's session: whoever this coach has already logged a lift for today,
  // most-recently-logged first, capped at 8 - tapping one skips straight to their
  // entry modal instead of re-finding them in the roster below.
  const recentAthletes = React.useMemo(() => {
    const todays = [...liftLogs]
      .filter(l => l.created_at && getCentralDateString(new Date(l.created_at)) === todayStr)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const seen = new Set();
    const out = [];
    for (const l of todays) {
      if (seen.has(l.athlete_id)) continue;
      seen.add(l.athlete_id);
      const athlete = athletes.find(a => a.id === l.athlete_id);
      if (!athlete) continue;
      out.push({ athlete, lastLift: l.lift_type });
      if (out.length >= 8) break;
    }
    return out;
  }, [liftLogs, athletes, todayStr]);

  const filteredAthletes = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes
      .filter(a => (sportFilter === 'ALL' || (a.sport || 'General') === sportFilter))
      .filter(a => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [athletes, sportFilter, search]);

  const selectedAthlete = athletes.find(a => a.id === entryAthleteId) || null;

  const openEntry = (athleteId) => {
    setEntryAthleteId(athleteId);
    setLiftType(liftTypes[0] || '');
    setWeight('');
    setReps('');
    setSuccessMsg('');
  };

  const closeEntry = () => {
    setEntryAthleteId(null);
    setSuccessMsg('');
  };

  const disableSave = saving || !liftType || !(parseFloat(weight) > 0) || !(parseInt(reps, 10) > 0);

  const handleSave = async () => {
    if (disableSave || !selectedAthlete) return;
    setSaving(true);
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    await addLift({
      athlete_id: selectedAthlete.id,
      athlete_name: selectedAthlete.name,
      sport: selectedAthlete.sport || '',
      lift_type: liftType,
      weight_lbs: w,
      reps: r,
    });
    setSaving(false);
    setSuccessMsg(`Logged ${w} lbs × ${r} reps — ${liftType} for ${selectedAthlete.name}.`);
    // Fields reset so the same athlete can immediately log a second lift (e.g. bench
    // then squat in the same visit) without re-selecting their card.
    setWeight('');
    setReps('');
  };

  const athleteRecentLifts = React.useMemo(() => {
    if (!selectedAthlete) return [];
    return liftLogs
      .filter(l => l.athlete_id === selectedAthlete.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8);
  }, [liftLogs, selectedAthlete]);

  const leaderboardRows = React.useMemo(() => {
    const rosterIds = new Set(athletes.map(a => a.id));
    const byAthlete = new Map();
    for (const l of liftLogs) {
      if (l.lift_type !== leaderboardLift || !rosterIds.has(l.athlete_id)) continue;
      const est = estimate1RM(Number(l.weight_lbs), Number(l.reps));
      const cur = byAthlete.get(l.athlete_id);
      if (!cur || est > cur.est) byAthlete.set(l.athlete_id, { ...l, est: Math.round(est) });
    }
    return [...byAthlete.values()].sort((a, b) => b.est - a.est);
  }, [liftLogs, leaderboardLift, athletes]);

  const openProfile = (id) => {
    setSelectedProfileId(id);
    if (fetchProfileData) fetchProfileData(id);
    if (setProfileEntryScreen) setProfileEntryScreen('lifts');
    setScreen('profiles');
  };

  const tabBtn = (key, label, icon) => (
    <button
      type="button"
      onClick={() => setView(key)}
      style={{
        padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer',
        border: view === key ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.12)',
        background: view === key ? 'rgba(184, 156, 91, 0.15)' : 'transparent',
        color: view === key ? 'var(--color-accent)' : 'var(--color-text-muted)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>WORKSPACE &middot; LIFT TRACKER</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Dumbbell size={26} /> LIFT TRACKER
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Recent athletes and today's session surface first. The full roster is one search away, sorted by session frequency instead of A&ndash;Z.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {tabBtn('log', 'Log a Lift', <Dumbbell size={15} />)}
          {tabBtn('leaderboard', 'Leaderboard', <Award size={15} />)}
        </div>
      </div>

      {view === 'log' && (
        <>
          {/* Sticky so the search box, "today's session" recents, and group filters stay
              put while the athlete list below scrolls - on an iPad with a full team
              loaded, a coach was having to scroll all the way back to the top just to
              search for the next athlete or switch groups. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              background: 'var(--navy-950)',
              paddingTop: '4px',
              paddingBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="input-glass"
                placeholder="Search athlete by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: '48px', padding: '0 38px 0 44px', fontSize: '14px' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {recentAthletes.length > 0 && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '14px' }}>
                  Today's session &middot; {recentAthletes.length} logged
                </div>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', marginTop: '8px' }}>
                  {recentAthletes.map(({ athlete, lastLift }) => (
                    <button
                      key={athlete.id}
                      type="button"
                      onClick={() => openEntry(athlete.id)}
                      className="card-glass"
                      style={{ flex: 'none', width: '128px', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <Avatar name={athlete.name} size={36} />
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{athlete.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{lastLift}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '14px' }}>
              Filter by group
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {['ALL', ...sports].map(sport => (
                <button
                  key={sport}
                  onClick={() => setSportFilter(sport)}
                  style={{
                    padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                    cursor: 'pointer',
                    border: sportFilter === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                    background: sportFilter === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.02)',
                    color: sportFilter === sport ? 'var(--navy-950)' : 'var(--color-text)',
                  }}
                >
                  {sport === 'ALL' ? 'All' : sport}
                </button>
              ))}
            </div>
          </div>

          <div className="card-glass" style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '16px 18px 8px' }}>
              {sportFilter === 'ALL' ? 'All Athletes' : sportFilter} &middot; {filteredAthletes.length} athlete{filteredAthletes.length !== 1 ? 's' : ''}
            </div>
            {filteredAthletes.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No athletes match "{search}".
              </div>
            ) : (
              <div>
                {filteredAthletes.map((a, idx) => {
                  const lastLog = lastLiftByAthlete.get(a.id);
                  const lastWeightRow = lastWeightByAthlete.get(a.id);
                  const isStale = !lastLog || (new Date() - new Date(lastLog.created_at)) > settings.baselineExpiryDays * 24 * 60 * 60 * 1000;
                  return (
                    <div
                      key={a.id}
                      onClick={() => openEntry(a.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px', cursor: 'pointer', borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <Avatar name={a.name} size={42} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {lastWeightRow ? `${Number(lastWeightRow.weight_lbs)} lbs · ` : ''}
                          {lastLog ? `last logged ${shortDate(lastLog.created_at)}` : 'never logged'}
                        </div>
                      </div>
                      <span style={{
                        padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                        background: isStale ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.06)',
                        color: isStale ? '#f59e0b' : 'var(--color-text-muted)',
                        border: isStale ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255,255,255,0.1)',
                      }}>
                        {isStale ? 'Stale' : 'Current'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEntry(a.id); }}
                        style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: 'none', background: 'var(--color-accent)', color: 'var(--navy-950)', whiteSpace: 'nowrap' }}
                      >
                        Log Set
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card-glass" style={{ padding: '18px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Recent/today's session replaces re-scanning the whole roster A&ndash;Z every practice, a single search field replaces name search plus a row of sport pills fighting for space, and each row now states weight and last-logged date so a stale athlete stands out without opening Profiles.
            </div>
          </div>
        </>
      )}

      {view === 'leaderboard' && (
        <div className="card-glass glow-card" style={{ padding: '28px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <select
            aria-label="Lift"
            value={leaderboardLift}
            onChange={e => setLeaderboardLift(e.target.value)}
            className="input-glass"
            style={{ height: '42px', padding: '0 14px', fontSize: '14px', fontWeight: 700, borderRadius: '10px', maxWidth: '280px' }}
          >
            {liftTypes.map(lt => (
              <option key={lt} value={lt} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{lt}</option>
            ))}
          </select>

          {leaderboardRows.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>
              No {leaderboardLift} results logged yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboardRows.map((row, idx) => (
                <div
                  key={row.athlete_id}
                  onClick={() => openProfile(row.athlete_id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    padding: '14px 18px', borderRadius: '14px', cursor: 'pointer',
                    background: idx === 0 ? 'rgba(184, 156, 91, 0.1)' : 'rgba(255,255,255,0.02)',
                    border: idx === 0 ? '1px solid rgba(184, 156, 91, 0.35)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 800, color: idx === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)', width: '24px' }}>
                      {idx + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{row.athlete_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{row.sport || 'General'} &middot; best set: {row.weight_lbs} lbs &times; {row.reps}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--color-accent)' }}>{row.est}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>est. 1RM</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Entry modal - rendered through a portal straight onto <body>, escaping the
          scrollable roster list underneath. The roster's scroll container uses
          -webkit-overflow-scrolling: touch for iPad momentum scrolling, and Safari
          has a long-standing bug where a position: fixed descendant of a
          touch-scrolling container drifts along with that container's scroll
          instead of staying pinned to the viewport - so on an iPad, tapping
          "Log Set" opened the modal but it kept sliding with the roster underneath
          it instead of popping up in place. Escaping the scroll container via
          createPortal sidesteps the bug entirely. */}
      {selectedAthlete && createPortal(
        <div
          className="modal-overlay animate-fade-in"
          style={{ position: 'fixed', inset: 0, zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.9)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEntry(); }}
        >
          <div className="card-glass glow-card animate-slide-up" style={{ width: '100%', maxWidth: '480px', borderRadius: '24px', border: '1px solid rgba(184, 156, 91, 0.4)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div onClick={closeEntry} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-accent)', fontSize: '12px', fontWeight: 800, cursor: 'pointer', marginBottom: '8px' }}>
                  <ChevronLeft size={14} /> BACK
                </div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#fff', textTransform: 'uppercase' }}>{selectedAthlete.name}</h3>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{selectedAthlete.sport || 'General'}</div>
              </div>
              <button onClick={closeEntry} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            {successMsg && (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#4ade80', fontSize: '13px', fontWeight: 700 }}>
                {successMsg}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Lift</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {liftTypes.map(lt => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setLiftType(lt)}
                    style={{
                      padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      border: liftType === lt ? '2px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.15)',
                      background: liftType === lt ? 'rgba(184, 156, 91, 0.18)' : 'rgba(255,255,255,0.02)',
                      color: liftType === lt ? '#fff' : 'var(--color-text-muted)',
                    }}
                  >
                    {lt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Weight (lbs)</label>
                <input
                  type="number"
                  step="5"
                  placeholder="245"
                  className="input-glass"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  style={{ width: '100%', height: '52px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(184, 156, 91, 0.4)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Reps</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="5"
                  className="input-glass"
                  value={reps}
                  onChange={e => setReps(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ width: '100%', height: '52px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(184, 156, 91, 0.4)' }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={disableSave}
              className="btn-primary glow-card"
              style={{ height: '52px', borderRadius: '16px', fontSize: '15px', fontWeight: 800, background: disableSave ? 'rgba(184, 156, 91, 0.3)' : 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', cursor: disableSave ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Plus size={18} /> {saving ? 'Saving...' : 'Log Lift'}
            </button>

            {athleteRecentLifts.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Recent Lifts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {athleteRecentLifts.map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{l.lift_type}</span>
                      <span style={{ color: '#fff', fontWeight: 700 }}>{l.weight_lbs} lbs &times; {l.reps}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{new Date(l.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
