import React from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Dumbbell, Award, Plus, Minus, ChevronLeft, Pencil, Trash2, Check, Download } from 'lucide-react';
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
const colorFor = (name) => avatarColors[(name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length];
const initialsOf = (name) => (name || '?').trim().split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase() || '?';
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Same escape/download convention ReportsScreen.jsx uses for its exports.
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const downloadCSV = (filename, headers, rows) => {
  const csvContent = [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

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
  updateLift,
  deleteLift,
  setConfirmModal,
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
  // Same "All / one sport" filter convention as the roster's own group pills - a
  // leaderboard mixing every sport together buried a team's own numbers under
  // whichever sport logs the most, so a coach checking their own team's PRs had to
  // scan past everyone else's.
  const [leaderboardSportFilter, setLeaderboardSportFilter] = React.useState('ALL');
  // Editing a previously-logged set (wrong weight/reps, or logged under the wrong
  // exercise entirely) - a separate small form inline in the Recent Lifts list,
  // rather than deleting and re-adding.
  const [editingLiftId, setEditingLiftId] = React.useState(null);
  const [editLiftType, setEditLiftType] = React.useState('');
  const [editWeight, setEditWeight] = React.useState('');
  const [editReps, setEditReps] = React.useState('');
  const [editSaving, setEditSaving] = React.useState(false);

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
  // All of today's logged sets (not deduped by athlete) - drives both the
  // "Today's session" recent row below and the session tonnage total.
  const todaysLogs = React.useMemo(() => (
    [...liftLogs]
      .filter(l => l.created_at && getCentralDateString(new Date(l.created_at)) === todayStr)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  ), [liftLogs, todayStr]);

  // Total lbs lifted today across every athlete's every set (weight x reps,
  // summed) - a quick "how much work got done today" number for the header,
  // computed straight from today's real logs rather than tracked separately.
  const sessionTonnage = React.useMemo(() => (
    Math.round(todaysLogs.reduce((sum, l) => sum + (Number(l.weight_lbs) || 0) * (Number(l.reps) || 0), 0))
  ), [todaysLogs]);

  // Today's session: whoever this coach has already logged a lift for today,
  // most-recently-logged first, capped at 8 - tapping one skips straight to their
  // entry modal instead of re-finding them in the roster below. Keeps the full
  // log (not just the lift type) so "+1 Set" can repeat the exact same set.
  const recentAthletes = React.useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const l of todaysLogs) {
      if (seen.has(l.athlete_id)) continue;
      seen.add(l.athlete_id);
      const athlete = athletes.find(a => a.id === l.athlete_id);
      if (!athlete) continue;
      out.push({ athlete, lastLift: l.lift_type, lastLog: l });
      if (out.length >= 8) break;
    }
    return out;
  }, [todaysLogs, athletes]);

  // Repeats an athlete's most recent set (same lift/weight/reps) with one tap,
  // for the common case of back-to-back identical sets - no need to reopen the
  // modal and retype the same numbers.
  const [repeatingId, setRepeatingId] = React.useState(null);
  const handleQuickRepeat = async (athlete, lastLog) => {
    setRepeatingId(athlete.id);
    await addLift({
      athlete_id: athlete.id,
      athlete_name: athlete.name,
      sport: athlete.sport || '',
      lift_type: lastLog.lift_type,
      weight_lbs: Number(lastLog.weight_lbs),
      reps: Number(lastLog.reps),
    });
    setRepeatingId(null);
  };

  const filteredAthletes = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes
      .filter(a => (sportFilter === 'ALL' || (a.sport || 'General') === sportFilter))
      .filter(a => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [athletes, sportFilter, search]);

  // Roster pagination - large programs (150-200+ athletes) were rendering every
  // filtered row at once. Page size is well above any existing test roster and
  // any single sport's real roster size, so this only engages for the
  // "All" view of a genuinely large program.
  const ROSTER_PAGE_SIZE = 50;
  const [rosterPage, setRosterPage] = React.useState(0);
  React.useEffect(() => { setRosterPage(0); }, [sportFilter, search]);
  const rosterPageCount = Math.max(1, Math.ceil(filteredAthletes.length / ROSTER_PAGE_SIZE));
  const pagedAthletes = React.useMemo(() => {
    const start = rosterPage * ROSTER_PAGE_SIZE;
    return filteredAthletes.slice(start, start + ROSTER_PAGE_SIZE);
  }, [filteredAthletes, rosterPage]);

  const selectedAthlete = athletes.find(a => a.id === entryAthleteId) || null;

  const openEntry = (athleteId) => {
    setEntryAthleteId(athleteId);
    setLiftType(liftTypes[0] || '');
    setWeight('');
    setReps('');
    setSuccessMsg('');
    setEditingLiftId(null);
  };

  const closeEntry = () => {
    setEntryAthleteId(null);
    setSuccessMsg('');
    setEditingLiftId(null);
  };

  const disableSave = saving || !liftType || !(parseFloat(weight) > 0) || !(parseInt(reps, 10) > 0);

  const startEditLift = (l) => {
    setEditingLiftId(l.id);
    setEditLiftType(l.lift_type);
    setEditWeight(String(l.weight_lbs));
    setEditReps(String(l.reps));
  };

  const cancelEditLift = () => setEditingLiftId(null);

  const disableEditSave = editSaving || !editLiftType || !(parseFloat(editWeight) > 0) || !(parseInt(editReps, 10) > 0);

  const handleSaveEditLift = async () => {
    if (disableEditSave) return;
    setEditSaving(true);
    await updateLift(editingLiftId, {
      lift_type: editLiftType,
      weight_lbs: parseFloat(editWeight),
      reps: parseInt(editReps, 10),
    });
    setEditSaving(false);
    setEditingLiftId(null);
  };

  const handleDeleteLift = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Lift Entry',
      message: 'Are you sure you want to permanently delete this logged set?',
      isDanger: true,
      actionText: 'Delete Entry',
      onConfirm: async () => {
        setEditSaving(true);
        await deleteLift(id);
        setEditSaving(false);
        setEditingLiftId(null);
      },
    });
  };

  // Every logged set, newest first - a coach-only export (kept icon-only, no label, so
  // an athlete tapping through the kiosk doesn't mistake it for part of the log-a-lift
  // flow and trigger a download).
  // Last name first, then first name, then newest-first within one athlete's own sets -
  // "athlete_name" is stored as one string ("Trent Butler"), so the sort key is just
  // its last whitespace-separated word.
  const lastNameOf = (fullName) => (fullName || '').trim().split(/\s+/).pop().toLowerCase();

  const handleExportCSV = () => {
    const sorted = [...liftLogs].sort((a, b) => {
      const lastCmp = lastNameOf(a.athlete_name).localeCompare(lastNameOf(b.athlete_name));
      if (lastCmp !== 0) return lastCmp;
      const nameCmp = (a.athlete_name || '').localeCompare(b.athlete_name || '');
      if (nameCmp !== 0) return nameCmp;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    const rows = sorted.map(l => [
      new Date(l.created_at).toLocaleDateString(),
      l.athlete_name || '',
      l.sport || '',
      l.lift_type,
      l.weight_lbs,
      l.reps,
      Math.round(estimate1RM(Number(l.weight_lbs), Number(l.reps))),
    ]);
    downloadCSV(
      `Shiloh_LiftLogs_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Athlete', 'Sport', 'Lift', 'Weight (lbs)', 'Reps', 'Est. 1RM'],
      rows
    );
  };

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
    const roster = leaderboardSportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === leaderboardSportFilter);
    const rosterIds = new Set(roster.map(a => a.id));
    const byAthlete = new Map();
    for (const l of liftLogs) {
      if (l.lift_type !== leaderboardLift || !rosterIds.has(l.athlete_id)) continue;
      const est = estimate1RM(Number(l.weight_lbs), Number(l.reps));
      const cur = byAthlete.get(l.athlete_id);
      if (!cur || est > cur.est) byAthlete.set(l.athlete_id, { ...l, est: Math.round(est) });
    }
    return [...byAthlete.values()].sort((a, b) => b.est - a.est);
  }, [liftLogs, leaderboardLift, leaderboardSportFilter, athletes]);

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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {tabBtn('log', 'Log a Lift', <Dumbbell size={15} />)}
          {tabBtn('leaderboard', 'Leaderboard', <Award size={15} />)}
          {/* Icon-only, no label, and set apart from the tabs above by a divider -
              a coach reaching for this knows what it does; an athlete tapping through
              the kiosk has no reason to read a bare icon as part of logging a lift. */}
          <div style={{ width: '1px', height: '24px', background: 'var(--color-border)', margin: '0 2px' }} />
          <button
            type="button"
            onClick={handleExportCSV}
            title="Export all lift logs to CSV"
            aria-label="Export all lift logs to CSV"
            style={{
              width: '38px', height: '38px', borderRadius: '10px', cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
              color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Download size={16} />
          </button>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Today's session &middot; {recentAthletes.length} logged
                  </div>
                  {sessionTonnage > 0 && (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {sessionTonnage.toLocaleString()} lbs lifted today
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', marginTop: '8px' }}>
                  {recentAthletes.map(({ athlete, lastLift, lastLog }) => (
                    <div
                      key={athlete.id}
                      className="card-glass"
                      style={{ flex: 'none', width: '128px', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px' }}
                    >
                      <button
                        type="button"
                        onClick={() => openEntry(athlete.id)}
                        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <Avatar name={athlete.name} size={36} />
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginTop: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{athlete.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{lastLift} &middot; {lastLog.weight_lbs}&times;{lastLog.reps}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickRepeat(athlete, lastLog)}
                        disabled={repeatingId === athlete.id}
                        title={`Log another ${lastLog.weight_lbs} lbs × ${lastLog.reps} ${lastLog.lift_type} set for ${athlete.name}`}
                        style={{ marginTop: '2px', padding: '5px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: repeatingId === athlete.id ? 'not-allowed' : 'pointer', border: '1px solid rgba(184, 156, 91, 0.4)', background: 'rgba(184, 156, 91, 0.1)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <Plus size={12} /> {repeatingId === athlete.id ? '...' : '1 Set'}
                      </button>
                    </div>
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
                {pagedAthletes.map((a, idx) => {
                  const lastLog = lastLiftByAthlete.get(a.id);
                  const lastWeightRow = lastWeightByAthlete.get(a.id);
                  // Three states, not two: an athlete who has genuinely never logged a
                  // lift is worth telling apart from one whose last log has simply aged
                  // past the expiry window - both need attention, but "never" points a
                  // coach toward onboarding them, not just re-testing.
                  const status = !lastLog
                    ? 'never'
                    : (new Date() - new Date(lastLog.created_at)) > settings.baselineExpiryDays * 24 * 60 * 60 * 1000
                      ? 'stale'
                      : 'current';
                  const statusStyle = {
                    stale: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.35)', label: 'Stale' },
                    never: { bg: 'rgba(255,255,255,0.03)', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.2)', label: 'Never Logged' },
                    current: { bg: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.1)', label: 'Current' },
                  }[status];
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
                        background: statusStyle.bg, color: statusStyle.color, border: statusStyle.border,
                      }}>
                        {statusStyle.label}
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
            {filteredAthletes.length > ROSTER_PAGE_SIZE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Showing {rosterPage * ROSTER_PAGE_SIZE + 1}&ndash;{Math.min((rosterPage + 1) * ROSTER_PAGE_SIZE, filteredAthletes.length)} of {filteredAthletes.length}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setRosterPage(p => Math.max(0, p - 1))}
                    disabled={rosterPage === 0}
                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: rosterPage === 0 ? 'not-allowed' : 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: rosterPage === 0 ? 'rgba(255,255,255,0.25)' : 'var(--color-text-muted)' }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterPage(p => Math.min(rosterPageCount - 1, p + 1))}
                    disabled={rosterPage >= rosterPageCount - 1}
                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: rosterPage >= rosterPageCount - 1 ? 'not-allowed' : 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: rosterPage >= rosterPageCount - 1 ? 'rgba(255,255,255,0.25)' : 'var(--color-text-muted)' }}
                  >
                    Next
                  </button>
                </div>
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
        <div className="card-glass" style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Award size={18} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#fff' }}>
                {leaderboardLift} Leaderboard
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['ALL', ...sports].map(sport => (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => setLeaderboardSportFilter(sport)}
                    style={{
                      padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      border: leaderboardSportFilter === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                      background: leaderboardSportFilter === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.02)',
                      color: leaderboardSportFilter === sport ? 'var(--navy-950)' : 'var(--color-text)',
                    }}
                  >
                    {sport === 'ALL' ? 'All' : sport}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {leaderboardRows.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '14px', padding: '32px 22px', textAlign: 'center' }}>
              No {leaderboardLift} results logged yet{leaderboardSportFilter !== 'ALL' ? ` for ${leaderboardSportFilter}` : ''}.
            </div>
          ) : (
            <div>
              {leaderboardRows.map((row, idx) => (
                <div
                  key={row.athlete_id}
                  onClick={() => openProfile(row.athlete_id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px',
                    padding: '14px 22px', cursor: 'pointer',
                    borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                    background: idx === 0 ? 'rgba(184, 156, 91, 0.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <span style={{
                      width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800,
                      background: idx === 0 ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                      color: idx === 0 ? 'var(--navy-950)' : 'var(--color-text-muted)',
                    }}>
                      {idx + 1}
                    </span>
                    <Avatar name={row.athlete_name} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.athlete_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{row.sport || 'General'} &middot; best set: {row.weight_lbs} lbs &times; {row.reps}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: idx === 0 ? 'var(--color-accent)' : '#fff' }}>{row.est}</div>
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
          style={{ position: 'fixed', inset: 0, zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.9)', overflowY: 'auto' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEntry(); }}
        >
          {/* maxHeight + its own scroll: on a short/mobile viewport (or once the
              keyboard is up for the weight/reps inputs) the card was taller than the
              visible screen, so its bottom - including the Log Lift button and the
              rounded corner - got clipped, with the roster peeking in underneath. */}
          <div className="card-glass glow-card animate-slide-up" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '24px', border: '1px solid rgba(184, 156, 91, 0.4)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
              {/* minWidth: 0 on both the grid item and the input itself - a number
                  input's intrinsic content width doesn't shrink below its min-content
                  size by default inside a grid track, so on a narrow screen the two
                  boxes were overflowing their 1fr columns and overlapping each other
                  instead of shrinking to fit. */}
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Weight (lbs)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    aria-label="Decrease weight by 5"
                    onClick={() => setWeight(String(Math.max(0, (parseFloat(weight) || 0) - 5)))}
                    style={{ width: '40px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    step="5"
                    placeholder="245"
                    className="input-glass"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: '52px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(184, 156, 91, 0.4)', textAlign: 'center' }}
                  />
                  <button
                    type="button"
                    aria-label="Increase weight by 5"
                    onClick={() => setWeight(String((parseFloat(weight) || 0) + 5))}
                    style={{ width: '40px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Reps</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    aria-label="Decrease reps by 1"
                    onClick={() => setReps(String(Math.max(1, (parseInt(reps, 10) || 1) - 1)))}
                    style={{ width: '40px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="5"
                    className="input-glass"
                    value={reps}
                    onChange={e => setReps(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: '52px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(184, 156, 91, 0.4)', textAlign: 'center' }}
                  />
                  <button
                    type="button"
                    aria-label="Increase reps by 1"
                    onClick={() => setReps(String((parseInt(reps, 10) || 0) + 1))}
                    style={{ width: '40px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: editingLiftId ? 'none' : '180px', overflowY: editingLiftId ? 'visible' : 'auto' }}>
                  {athleteRecentLifts.map(l => (
                    editingLiftId === l.id ? (
                      // Inline edit: correct the weight/reps, or move this set to a
                      // different exercise entirely if it was logged under the wrong one.
                      <div key={l.id} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.08)', border: '1px solid rgba(184, 156, 91, 0.35)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {liftTypes.map(lt => (
                            <button
                              key={lt}
                              type="button"
                              onClick={() => setEditLiftType(lt)}
                              style={{
                                padding: '6px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                border: editLiftType === lt ? '2px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.15)',
                                background: editLiftType === lt ? 'rgba(184, 156, 91, 0.18)' : 'rgba(255,255,255,0.02)',
                                color: editLiftType === lt ? '#fff' : 'var(--color-text-muted)',
                              }}
                            >
                              {lt}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                          <input
                            type="number"
                            step="5"
                            aria-label="Edit weight"
                            className="input-glass"
                            value={editWeight}
                            onChange={e => setEditWeight(e.target.value)}
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: '42px', padding: '0 12px', borderRadius: '8px', background: 'var(--navy-900)', color: '#fff', fontSize: '15px', fontWeight: 700, border: '1px solid rgba(184, 156, 91, 0.4)' }}
                          />
                          <input
                            type="number"
                            step="1"
                            min="1"
                            aria-label="Edit reps"
                            className="input-glass"
                            value={editReps}
                            onChange={e => setEditReps(e.target.value.replace(/[^0-9]/g, ''))}
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: '42px', padding: '0 12px', borderRadius: '8px', background: 'var(--navy-900)', color: '#fff', fontSize: '15px', fontWeight: 700, border: '1px solid rgba(184, 156, 91, 0.4)' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={handleSaveEditLift}
                            disabled={disableEditSave}
                            style={{ flex: 1, height: '36px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: disableEditSave ? 'not-allowed' : 'pointer', border: 'none', background: disableEditSave ? 'rgba(184, 156, 91, 0.3)' : 'var(--color-accent)', color: 'var(--navy-950)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          >
                            <Check size={14} /> {editSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditLift}
                            disabled={editSaving}
                            style={{ height: '36px', padding: '0 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--color-text-muted)' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLift(l.id)}
                            disabled={editSaving}
                            style={{ height: '36px', padding: '0 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                        <span style={{ color: 'var(--color-text-muted)', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.lift_type}</span>
                        <span style={{ color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{l.weight_lbs} lbs &times; {l.reps}</span>
                        <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleDateString()}</span>
                        <button
                          type="button"
                          onClick={() => startEditLift(l)}
                          title="Edit this entry"
                          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', flexShrink: 0 }}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    )
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
