import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X, Minus, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { getCentralDateString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { useDragScroll, DragScrollBar } from '../../hooks/useDragScroll';

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


export default function LiftScreen({
  settings,
  athletes,
  liftLogs,
  reportData,
  addLift,
  updateLift,
  deleteLift,
  bulkUpdateLiftType,
  setConfirmModal,
  setSelectedProfileId,
  fetchProfileData,
  setProfileEntryScreen,
  setScreen,
  isKioskMode,
  onActivateLiftKioskMode,
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
  const rosterSportDrag = useDragScroll();
  const leaderboardSportDrag = useDragScroll();

  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);

  // Most recent lift log per athlete, across every lift type - drives both the
  // "Today's session" recent row and each roster row's "last logged" / staleness
  // badge, so a coach can spot who hasn't touched the weight room in a while
  // without opening Profiles.
  const lastLiftByAthlete = React.useMemo(() => {
    const map = new Map();
    for (const l of (liftLogs || [])) {
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
    [...(liftLogs || [])]
      .filter(l => l.created_at && getCentralDateString(new Date(l.created_at)) === todayStr)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  ), [liftLogs, todayStr]);

  // Bulk-reassign a day's mislabeled lift type (e.g. a whole session logged as
  // "Bench" that should have been "Incline Bench") without touching the weight/reps
  // already recorded, and without deleting-and-relogging every set by hand.
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false);
  const [bulkDate, setBulkDate] = React.useState(todayStr);
  const [bulkFromType, setBulkFromType] = React.useState('');
  const [bulkToType, setBulkToType] = React.useState('');
  const [bulkSaving, setBulkSaving] = React.useState(false);
  const bulkMatches = React.useMemo(() => {
    if (!bulkFromType) return [];
    return (liftLogs || []).filter(l =>
      l.lift_type === bulkFromType &&
      l.created_at && getCentralDateString(new Date(l.created_at)) === bulkDate
    );
  }, [liftLogs, bulkFromType, bulkDate]);
  const openBulkEdit = () => {
    setBulkDate(todayStr);
    setBulkFromType('');
    setBulkToType('');
    setBulkEditOpen(true);
  };
  const closeBulkEdit = () => setBulkEditOpen(false);
  const handleBulkReassign = () => {
    if (!bulkMatches.length || !bulkToType || bulkToType === bulkFromType) return;
    setConfirmModal({
      isOpen: true,
      title: 'Reassign Lift Type',
      message: `Change ${bulkMatches.length} logged set${bulkMatches.length !== 1 ? 's' : ''} from "${bulkFromType}" to "${bulkToType}" on ${bulkDate}? Weights and reps are kept exactly as recorded - only the lift type changes.`,
      isDanger: false,
      actionText: 'Reassign',
      onConfirm: async () => {
        setBulkSaving(true);
        await bulkUpdateLiftType(bulkMatches.map(l => l.id), bulkToType);
        setBulkSaving(false);
        setBulkEditOpen(false);
      },
    });
  };

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
      if (out.length >= 6) break; // Limit to 6 for grid layout 3x2
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
    const sorted = [...(liftLogs || [])].sort((a, b) => {
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
    return (liftLogs || [])
      .filter(l => l.athlete_id === selectedAthlete.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8);
  }, [liftLogs, selectedAthlete]);

  const leaderboardRows = React.useMemo(() => {
    const roster = leaderboardSportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === leaderboardSportFilter);
    const rosterIds = new Set(roster.map(a => a.id));
    const byAthlete = new Map();
    for (const l of (liftLogs || [])) {
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

  // The athlete/lift-entry panel itself, shared between two very different
  // presentations: a coach's centered modal (unchanged) and Lift Kiosk Mode's
  // pinned top-of-screen card. In kiosk mode this stays visible across multiple
  // sets for the same athlete instead of popping up and closing per lift - the
  // coach asked for the selected name to "hang out at the top... until the lift
  // is over," which is also exactly where a future assigned-program view would
  // slot in below the name once that feature exists.
  const entryPanelInner = selectedAthlete && (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {!isKioskMode && (
            <div onClick={closeEntry} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontSize: '12px', fontWeight: 800, cursor: 'pointer', marginBottom: '8px' }} className="text-primary hover:text-primary-fixed transition-colors">
              <ChevronLeft size={14} /> BACK
            </div>
          )}
          <h3 className="font-display text-2xl font-bold text-on-surface uppercase m-0">{selectedAthlete.name}</h3>
          <div className="font-label-sm text-label-sm text-on-surface-variant mt-1 uppercase">{selectedAthlete.sport || 'General'}</div>
        </div>
        {isKioskMode ? (
          <button onClick={closeEntry} className="flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface font-label-md text-label-md uppercase font-bold transition-colors">
            <Check size={16} /> Done
          </button>
        ) : (
          <button onClick={closeEntry} className="bg-transparent border-none text-on-surface-variant hover:text-on-surface cursor-pointer">
            <X size={22} />
          </button>
        )}
      </div>

      {successMsg && (
        <div className="px-4 py-3 rounded-xl bg-secondary-container/20 border border-secondary-container/40 text-secondary font-label-md text-label-md">
          {successMsg}
        </div>
      )}

      <div>
        <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Lift</label>
        <div className="flex gap-2 flex-wrap">
          {liftTypes.map(lt => (
            <button
              key={lt}
              type="button"
              onClick={() => setLiftType(lt)}
              className={`px-4 py-2 rounded-xl font-label-md text-label-md transition-colors ${liftType === lt ? 'bg-primary-container text-on-primary-container font-bold border-2 border-primary' : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high border border-transparent'}`}
            >
              {lt}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Weight (lbs)</label>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Decrease weight by 5"
              onClick={() => setWeight(String(Math.max(0, (parseFloat(weight) || 0) - 5)))}
              className="w-10 shrink-0 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant transition-colors flex items-center justify-center border border-surface-container-highest"
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              step="5"
              placeholder="245"
              className="w-full min-w-0 h-12 px-4 rounded-xl bg-surface-container-highest text-on-surface font-display text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary border border-transparent"
              value={weight}
              onChange={e => setWeight(e.target.value)}
            />
            <button
              type="button"
              aria-label="Increase weight by 5"
              onClick={() => setWeight(String((parseFloat(weight) || 0) + 5))}
              className="w-10 shrink-0 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant transition-colors flex items-center justify-center border border-surface-container-highest"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Reps</label>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Decrease reps by 1"
              onClick={() => setReps(String(Math.max(1, (parseInt(reps, 10) || 1) - 1)))}
              className="w-10 shrink-0 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant transition-colors flex items-center justify-center border border-surface-container-highest"
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              step="1"
              min="1"
              placeholder="5"
              className="w-full min-w-0 h-12 px-4 rounded-xl bg-surface-container-highest text-on-surface font-display text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary border border-transparent"
              value={reps}
              onChange={e => setReps(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <button
              type="button"
              aria-label="Increase reps by 1"
              onClick={() => setReps(String((parseInt(reps, 10) || 0) + 1))}
              className="w-10 shrink-0 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant transition-colors flex items-center justify-center border border-surface-container-highest"
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
        className={`h-12 rounded-xl font-headline-md text-headline-md uppercase flex items-center justify-center gap-2 transition-all ${disableSave ? 'bg-primary-container/50 text-on-primary-container/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-fixed text-on-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5'}`}
      >
        <Plus size={18} /> {saving ? 'Saving...' : 'Log Lift'}
      </button>

      {athleteRecentLifts.length > 0 && (
        <div>
          <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-3">Recent Lifts</div>
          <div className={`flex flex-col gap-2 ${editingLiftId ? '' : 'max-h-48 overflow-y-auto'}`}>
            {athleteRecentLifts.map(l => (
              editingLiftId === l.id ? (
                <div key={l.id} className="p-3 rounded-xl bg-primary-container/10 border border-primary/30 flex flex-col gap-3">
                  <div className="flex gap-2 flex-wrap">
                    {liftTypes.map(lt => (
                      <button
                        key={lt}
                        type="button"
                        onClick={() => setEditLiftType(lt)}
                        className={`px-3 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${editLiftType === lt ? 'bg-primary-container text-on-primary-container border-2 border-primary' : 'bg-surface-container-highest text-on-surface-variant border border-transparent'}`}
                      >
                        {lt}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="5"
                      aria-label="Edit weight"
                      className="h-10 px-3 rounded-lg bg-surface-container-highest text-on-surface font-label-lg font-bold border border-transparent focus:border-primary focus:outline-none"
                      value={editWeight}
                      onChange={e => setEditWeight(e.target.value)}
                    />
                    <input
                      type="number"
                      step="1"
                      min="1"
                      aria-label="Edit reps"
                      className="h-10 px-3 rounded-lg bg-surface-container-highest text-on-surface font-label-lg font-bold border border-transparent focus:border-primary focus:outline-none"
                      value={editReps}
                      onChange={e => setEditReps(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEditLift}
                      disabled={disableEditSave}
                      className={`flex-1 h-9 rounded-lg font-label-md text-label-md font-bold flex items-center justify-center gap-1.5 ${disableEditSave ? 'bg-primary-container/50 text-on-primary-container/50 cursor-not-allowed' : 'bg-primary text-on-primary hover:bg-primary-fixed'}`}
                    >
                      <Check size={14} /> {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditLift}
                      disabled={editSaving}
                      className="px-3 h-9 rounded-lg font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLift(l.id)}
                      disabled={editSaving}
                      className="px-3 h-9 rounded-lg font-label-md text-label-md bg-error-container/20 text-error hover:bg-error-container/40 border border-error/30 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div key={l.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-container-highest">
                  <span className="text-on-surface-variant font-label-md text-label-md truncate min-w-0">{l.lift_type}</span>
                  <span className="text-on-surface font-label-md font-bold whitespace-nowrap">{l.weight_lbs} lbs × {l.reps}</span>
                  <span className="text-on-surface-variant font-label-sm text-label-sm whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => startEditLift(l)}
                    title="Edit this entry"
                    className="p-1 text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto pb-space-xl">
      {isKioskMode ? (
        /* Compact kiosk header: an athlete walking up to the rack needs "tap your
           name," not the coach's admin toolbar (leaderboard, CSV export, view
           toggles) or the descriptive copy meant for a coach reading a dashboard. */
        <div className="flex flex-col gap-1 pt-space-md pb-space-sm">
          <h1 className="font-headline-xl text-headline-xl tracking-tight text-on-surface uppercase">
            LIFT TRACKER
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Find your name below, then tap it to log your set.
          </p>
        </div>
      ) : (
        <>
          {/* Top Breadcrumb & Control Anchor */}
          <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-md pb-space-sm">
            <div className="flex items-center gap-space-xs font-label-md text-label-md tracking-widest text-outline uppercase">
              <span>WORKSPACE</span>
              <span className="material-symbols-outlined text-xs">chevron_right</span>
              <span className="text-primary font-bold">LIFT TRACKER &amp; WEIGHT ROOM FLOOR</span>
            </div>
          </div>

          {/* Hero Header & Action Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md py-space-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-2xl">fitness_center</span>
                </div>
                <h1 className="font-headline-xl text-headline-xl tracking-tight text-on-surface uppercase">
                  LIFT TRACKER &amp; WEIGHT ROOM FLOOR
                </h1>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
                Live athlete tracking, rack station load telemetrics, and rapid-fire set verification. Sorted dynamically by session engagement and velocity drops.
              </p>
            </div>

            {/* Action Toolbar & Segmented View */}
            <div className="flex flex-wrap items-center gap-space-xs">
              <button
                onClick={() => setView('log')}
                className={`flex items-center gap-1.5 px-space-md py-space-sm rounded-lg font-headline-md text-headline-md uppercase transition-all shadow-md active:scale-95 ${view === 'log' ? 'bg-primary-container hover:bg-primary text-on-primary-container' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'}`}
              >
                <span className="material-symbols-outlined text-lg">add</span>
                <span>LOG A LIFT / SET</span>
              </button>
              <button
                onClick={() => setView('leaderboard')}
                className={`flex items-center gap-1.5 px-space-md py-space-sm rounded-lg font-headline-md text-headline-md uppercase transition-colors ${view === 'leaderboard' ? 'bg-primary-container hover:bg-primary text-on-primary-container' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'}`}
              >
                <span className="material-symbols-outlined text-lg text-primary">military_tech</span>
                <span>LEADERBOARD</span>
              </button>
              <button onClick={handleExportCSV} className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors" title="Export CSV Data" aria-label="Export all lift logs to CSV">
                <span className="material-symbols-outlined text-lg">download</span>
              </button>
              <button
                onClick={openBulkEdit}
                className="flex items-center gap-1.5 px-space-md py-space-sm rounded-lg font-headline-md text-headline-md uppercase bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
                title="Reassign a day's mislabeled lift type across every matching set at once"
              >
                <span className="material-symbols-outlined text-lg">edit_note</span>
                <span>BULK EDIT</span>
              </button>
              {onActivateLiftKioskMode && (
                <button
                  onClick={onActivateLiftKioskMode}
                  className="flex items-center gap-1.5 px-space-md py-space-sm rounded-lg font-headline-md text-headline-md uppercase bg-primary hover:bg-primary-fixed text-on-primary shadow-md transition-all active:scale-95"
                  title="Hand the device to athletes to log their own sets"
                >
                  <span className="material-symbols-outlined text-lg">sensors</span>
                  <span>LIFT KIOSK MODE</span>
                </button>
              )}

              {/* Segmented View Controller */}
              <div className="flex items-center bg-surface-container-lowest p-1 rounded-lg gap-0.5 ml-1">
                <button className="p-1.5 rounded text-primary bg-surface-container-high transition-colors" id="view-grid-btn" title="Station Grid View">
                  <span className="material-symbols-outlined text-lg">view_cozy</span>
                </button>
                <button className="p-1.5 rounded text-on-surface-variant hover:text-on-surface transition-colors" id="view-list-btn" title="Roster Table View">
                  <span className="material-symbols-outlined text-lg">format_list_bulleted</span>
                </button>
                <button className="p-1.5 rounded text-on-surface-variant hover:text-on-surface transition-colors" id="view-stream-btn" title="Live Velocity Stream">
                  <span className="material-symbols-outlined text-lg">timeline</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {(isKioskMode || view === 'log') && (
        <>
          {isKioskMode && selectedAthlete && (
            <div className="sticky top-0 z-20 mt-space-md p-space-md rounded-xl bg-surface-container-low border border-primary/40 shadow-lg flex flex-col gap-space-md">
              {entryPanelInner}
            </div>
          )}

          {/* Search and Live Sport Chips */}
          <div className="flex flex-col gap-space-sm mt-space-md p-space-md bg-surface-container-low rounded-xl sticky top-0 z-10">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">search</span>
              <input
                className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-10 pr-24 py-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline"
                placeholder="Search athlete by name..."
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {search ? (
                  <button onClick={() => setSearch('')} className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm uppercase">Clear</button>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm">ESC TO CLEAR</span>
                )}
              </div>
            </div>
            
            <div ref={rosterSportDrag.ref} {...rosterSportDrag.dragHandlers} className="flex items-center gap-space-xs overflow-x-auto pb-1 scrollbar-none cursor-grab active:cursor-grabbing select-none">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap mr-1">GROUPS:</span>
              {['ALL', ...sports].map(sport => (
                <button
                  key={sport}
                  onClick={() => setSportFilter(sport)}
                  className={`sport-pill px-space-sm py-1 rounded font-label-md text-label-md whitespace-nowrap ${sportFilter === sport ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors'}`}
                >
                  {sport === 'ALL' ? 'All' : sport}
                </button>
              ))}
            </div>
            <DragScrollBar drag={rosterSportDrag} className="mt-1" />
          </div>

          {/* Live Weight Room Floor Section */}
          {recentAthletes.length > 0 && (
            <div className="flex flex-col gap-space-sm mt-space-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">ACTIVE TODAY</span>
                  <span className="text-on-surface-variant font-label-md text-label-md">• {recentAthletes.length} ATHLETES CURRENTLY LOGGED</span>
                </div>
                {sessionTonnage > 0 && (
                  <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-outline">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    <span>{sessionTonnage.toLocaleString()} LBS LIFTED TODAY</span>
                  </div>
                )}
              </div>

              {/* Active Rack Station Carousel Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-space-sm">
                {recentAthletes.map(({ athlete, lastLift, lastLog }) => {
                  return (
                    <div key={athlete.id} className="flex flex-col justify-between p-space-sm bg-surface-container-low hover:bg-surface-container rounded-xl transition-all hover:-translate-y-0.5 shadow-sm group">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between cursor-pointer" onClick={() => openEntry(athlete.id)}>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-primary-container/20 text-primary font-headline-md text-headline-md flex items-center justify-center">
                              {initialsOf(athlete.name).slice(0, 2)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-headline-md text-headline-md text-on-surface truncate uppercase">{athlete.name}</span>
                              <span className="font-label-sm text-label-sm text-outline uppercase">{athlete.sport || 'GENERAL'}</span>
                            </div>
                          </div>
                          {/* Could format lastLog.created_at more precisely if needed, here just keeping it short */}
                          <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm">
                            {new Date(lastLog.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        
                        <div className="p-2 rounded bg-surface-container-lowest flex flex-col gap-0.5 cursor-pointer" onClick={() => openEntry(athlete.id)}>
                          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">{lastLift}</span>
                          <div className="flex items-baseline justify-between">
                            <span className="font-metric-val text-metric-val text-primary tracking-tight">{lastLog.weight_lbs}<span className="text-xs font-normal text-on-surface-variant ml-0.5">lbs</span></span>
                            <span className="font-label-md text-label-md text-on-surface">{lastLog.reps} reps</span>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleQuickRepeat(athlete, lastLog)}
                        disabled={repeatingId === athlete.id}
                        className="mt-2 w-full py-1.5 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary font-label-md text-label-md uppercase text-primary transition-colors flex items-center justify-center gap-1"
                      >
                        {repeatingId === athlete.id ? (
                          <span>...</span>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-sm">add</span>
                            <span>+1 SET</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full Roster Log Section */}
          <div className="flex flex-col gap-space-sm mt-space-xl">
            {!isKioskMode && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-headline-lg text-headline-lg uppercase text-on-surface tracking-wide">
                    ROSTER LOGS &amp; WORKOUT ASSIGNMENTS
                  </h2>
                  <span className="font-label-sm text-label-sm text-outline uppercase">{filteredAthletes.length} REGISTERED ATHLETES • SORTED BY VELOCITY / RECENCY</span>
                </div>
              </div>
            )}

            {filteredAthletes.length === 0 ? (
              <div className="bg-surface-container-low rounded-xl p-space-xl text-center text-on-surface-variant">
                No athletes match "{search}".
              </div>
            ) : isKioskMode ? (
              /* Big tap-target tile picker - an athlete walking up finds their own
                 name by scanning tiles, not scrolling a dense admin table meant for
                 a coach reading bodyweight/status/last-set columns at a desk.
                 Tapping a tile opens the exact same lift-entry modal as the coach's
                 own "LOG SET" action - only the way you get there differs. */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-space-sm">
                {pagedAthletes.map((a) => {
                  const lastLog = lastLiftByAthlete.get(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => openEntry(a.id)}
                      className="flex flex-col items-center justify-center gap-2 p-space-md rounded-xl bg-surface-container hover:bg-primary-container active:scale-[0.97] transition-all shadow-sm text-center"
                    >
                      <div className="w-14 h-14 rounded-full bg-surface-container-highest text-primary font-headline-lg text-headline-lg flex items-center justify-center">
                        {initialsOf(a.name).slice(0, 2)}
                      </div>
                      <span className="font-headline-md text-headline-md text-on-surface uppercase leading-tight">{a.name}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">{a.sport || 'General'}</span>
                      {lastLog && (
                        <span className="font-label-sm text-label-sm text-outline">Last: {lastLog.lift_type} {lastLog.weight_lbs}×{lastLog.reps}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {isKioskMode && filteredAthletes.length > ROSTER_PAGE_SIZE && (
              <div className="flex items-center justify-between p-space-md flex-wrap gap-2">
                <span className="font-label-sm text-label-sm text-outline">
                  Showing {rosterPage * ROSTER_PAGE_SIZE + 1}–{Math.min((rosterPage + 1) * ROSTER_PAGE_SIZE, filteredAthletes.length)} of {filteredAthletes.length}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRosterPage(p => Math.max(0, p - 1))}
                    disabled={rosterPage === 0}
                    className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface font-label-md text-label-md transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterPage(p => Math.min(rosterPageCount - 1, p + 1))}
                    disabled={rosterPage >= rosterPageCount - 1}
                    className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface font-label-md text-label-md transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {!isKioskMode && filteredAthletes.length > 0 && (
              <div className="bg-surface-container-low rounded-xl overflow-hidden shadow-lg">
                {/* Table Header Bar */}
                <div className="grid grid-cols-12 px-space-md py-space-sm bg-surface-container-high text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                  <div className="col-span-4 sm:col-span-3">ATHLETE &amp; SPORT</div>
                  <div className="col-span-2 hidden md:block">BODYWEIGHT</div>
                  <div className="col-span-3 hidden sm:block">STATUS</div>
                  <div className="col-span-3 sm:col-span-2">LAST LOGGED SET</div>
                  <div className="col-span-5 sm:col-span-2 text-right">ACTION</div>
                </div>

                {/* Rows Container */}
                <div className="flex flex-col">
                  {pagedAthletes.map((a, idx) => {
                    const lastLog = lastLiftByAthlete.get(a.id);
                    const lastWeightRow = lastWeightByAthlete.get(a.id);
                    const status = !lastLog
                      ? 'never'
                      : (new Date() - new Date(lastLog.created_at)) > settings.baselineExpiryDays * 24 * 60 * 60 * 1000
                        ? 'stale'
                        : 'current';

                    return (
                      <div key={a.id} className="roster-row grid grid-cols-12 items-center px-space-md py-3.5 bg-surface-container hover:bg-surface-container-highest transition-colors border-b border-surface-container-high last:border-b-0 cursor-pointer" onClick={() => openEntry(a.id)}>
                        <div className="col-span-4 sm:col-span-3 flex items-center gap-space-sm">
                          <div className={`w-9 h-9 rounded bg-surface-container-highest ${status === 'stale' ? 'text-error' : (status === 'never' ? 'text-outline' : 'text-primary')} font-headline-md text-headline-md flex items-center justify-center shrink-0`}>
                            {initialsOf(a.name).slice(0, 2)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-label-lg text-label-lg text-on-surface uppercase truncate">{a.name}</span>
                            <div className="flex items-center gap-1">
                              <span className="font-label-sm text-label-sm text-on-surface-variant">{a.sport || 'General'}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="col-span-2 hidden md:flex flex-col">
                          {lastWeightRow ? (
                            <span className="font-metric-val text-metric-val text-on-surface">{Number(lastWeightRow.weight_lbs)} <span className="font-normal text-xs text-outline">lbs</span></span>
                          ) : (
                            <span className="font-metric-val text-metric-val text-outline">—</span>
                          )}
                        </div>

                        <div className="col-span-3 hidden sm:flex flex-col">
                          {status === 'stale' && <span className="px-2 py-0.5 rounded bg-error-container/30 text-error font-label-sm text-label-sm w-fit font-bold uppercase">STALE</span>}
                          {status === 'never' && <span className="px-2 py-0.5 rounded bg-surface-container-highest text-outline font-label-sm text-label-sm w-fit uppercase">NEVER LOGGED</span>}
                          {status === 'current' && <span className="px-2 py-0.5 rounded bg-secondary-container/20 text-secondary font-label-sm text-label-sm w-fit uppercase">CURRENT</span>}
                        </div>

                        <div className="col-span-3 sm:col-span-2 flex flex-col">
                          {lastLog ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="font-label-lg text-label-lg text-on-surface">{lastLog.weight_lbs} × {lastLog.reps}</span>
                              </div>
                              <span className="font-label-sm text-label-sm text-outline">{lastLog.lift_type} • {shortDate(lastLog.created_at)}</span>
                            </>
                          ) : (
                            <span className="font-label-sm text-label-sm text-outline">No logs</span>
                          )}
                        </div>

                        <div className="col-span-5 sm:col-span-2 flex items-center justify-end gap-1.5">
                          <button 
                            onClick={(e) => { e.stopPropagation(); openEntry(a.id); }}
                            className={`px-space-sm py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-headline-md text-headline-md uppercase transition-colors shadow-sm`}
                          >
                            LOG SET
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openProfile(a.id); }}
                            className="p-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface" 
                            title="View Athlete Dashboard"
                          >
                            <span className="material-symbols-outlined text-base">visibility</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredAthletes.length > ROSTER_PAGE_SIZE && (
                  <div className="flex items-center justify-between p-space-md border-t border-surface-container-high flex-wrap gap-2">
                    <span className="font-label-sm text-label-sm text-outline">
                      Showing {rosterPage * ROSTER_PAGE_SIZE + 1}–{Math.min((rosterPage + 1) * ROSTER_PAGE_SIZE, filteredAthletes.length)} of {filteredAthletes.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRosterPage(p => Math.max(0, p - 1))}
                        disabled={rosterPage === 0}
                        className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface font-label-md text-label-md transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setRosterPage(p => Math.min(rosterPageCount - 1, p + 1))}
                        disabled={rosterPage >= rosterPageCount - 1}
                        className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface font-label-md text-label-md transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'leaderboard' && (
        <div className="flex flex-col gap-space-sm mt-space-md">
          <div className="bg-surface-container-low rounded-xl overflow-hidden shadow-lg">
            <div className="p-space-md border-b border-surface-container-high flex flex-col gap-space-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">military_tech</span>
                <span className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-wide">
                  {leaderboardLift} Leaderboard
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-space-md">
                <select
                  aria-label="Lift"
                  value={leaderboardLift}
                  onChange={e => setLeaderboardLift(e.target.value)}
                  className="bg-surface-container text-on-surface font-label-md text-label-md px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {liftTypes.map(lt => (
                    <option key={lt} value={lt}>{lt}</option>
                  ))}
                </select>
                
                <div ref={leaderboardSportDrag.ref} {...leaderboardSportDrag.dragHandlers} className="flex items-center gap-space-xs overflow-x-auto pb-1 scrollbar-none cursor-grab active:cursor-grabbing select-none">
                  {['ALL', ...sports].map(sport => (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setLeaderboardSportFilter(sport)}
                      className={`px-space-sm py-1 rounded font-label-md text-label-md whitespace-nowrap ${leaderboardSportFilter === sport ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors'}`}
                    >
                      {sport === 'ALL' ? 'All' : sport}
                    </button>
                  ))}
                </div>
                <DragScrollBar drag={leaderboardSportDrag} className="mt-1" />
              </div>
            </div>

            {leaderboardRows.length === 0 ? (
              <div className="p-space-xl text-center text-on-surface-variant font-body-md text-body-md">
                No {leaderboardLift} results logged yet{leaderboardSportFilter !== 'ALL' ? ` for ${leaderboardSportFilter}` : ''}.
              </div>
            ) : (
              <div>
                {/* Top-3 podium */}
                {leaderboardRows.length >= 3 && (
                  <div className="grid grid-cols-3 gap-2 items-end p-space-md border-b border-surface-container-high bg-surface-container-lowest/50">
                    {[leaderboardRows[1], leaderboardRows[0], leaderboardRows[2]].map((row, col) => {
                      const rank = col === 1 ? 1 : col === 0 ? 2 : 3;
                      const isGold = rank === 1;
                      const podiumColor = rank === 1 ? 'text-primary' : rank === 2 ? 'text-[#94a3b8]' : 'text-[#b45309]';
                      const podiumBg = rank === 1 ? 'bg-primary-container/10 border-primary/40' : 'bg-surface-container border-surface-container-highest';
                      
                      return (
                        <div
                          key={row.athlete_id}
                          onClick={() => openProfile(row.athlete_id)}
                          className={`cursor-pointer rounded-xl flex flex-col items-center gap-1 text-center border p-3 transition-transform hover:-translate-y-1 ${podiumBg} ${isGold ? '-translate-y-2' : ''}`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-display text-xs font-bold ${rank === 1 ? 'bg-primary text-on-primary' : rank === 2 ? 'bg-[#94a3b8] text-surface' : 'bg-[#b45309] text-surface'}`}>
                            {rank}
                          </span>
                          <div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center font-headline-md text-headline-md mt-2 text-on-surface">
                            {initialsOf(row.athlete_name).slice(0, 2)}
                          </div>
                          <div className={`font-headline-md text-headline-md text-on-surface uppercase truncate max-w-full ${isGold ? 'mt-1' : ''}`}>{row.athlete_name}</div>
                          <div className="font-label-sm text-label-sm text-outline uppercase">{row.sport || 'GENERAL'}</div>
                          <div className={`font-display font-bold leading-none mt-1 ${isGold ? 'text-3xl' : 'text-2xl'} ${podiumColor}`}>{row.est}</div>
                          <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider">EST. 1RM</div>
                          <div className="font-label-sm text-label-sm text-on-surface-variant mt-1">{row.weight_lbs} lbs × {row.reps}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Remaining rows */}
                <div className="flex flex-col">
                  {leaderboardRows.map((row, idx) => (
                    <div
                      key={row.athlete_id}
                      onClick={() => openProfile(row.athlete_id)}
                      className={`flex items-center justify-between gap-3 px-space-md py-3 cursor-pointer border-b border-surface-container-high last:border-0 hover:bg-surface-container transition-colors ${idx === 0 ? 'bg-primary-container/5' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-7 h-7 rounded flex items-center justify-center shrink-0 font-display text-sm font-bold ${idx === 0 ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                          {idx + 1}
                        </span>
                        <div className="w-9 h-9 rounded bg-surface-container-highest flex items-center justify-center font-headline-md text-headline-md shrink-0 text-on-surface">
                          {initialsOf(row.athlete_name).slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <span className="font-label-lg text-label-lg text-on-surface uppercase truncate">{row.athlete_name}</span>
                          <span className="font-label-sm text-label-sm text-outline">{row.sport || 'GENERAL'} • best: {row.weight_lbs}×{row.reps}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-display text-xl font-bold ${idx === 0 ? 'text-primary' : 'text-on-surface'}`}>{row.est}</div>
                        <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider">EST. 1RM</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Athlete/lift-entry panel: a coach's centered modal, or (in kiosk mode)
          pinned inline at the top of the screen - see entryPanelInner above. */}
      {selectedAthlete && !isKioskMode && createPortal(
        <div
          className="modal-overlay animate-fade-in"
          style={{ position: 'fixed', inset: 0, zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.9)', overflowY: 'auto' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEntry(); }}
        >
          <div className="card-glass glow-card animate-slide-up bg-surface-container-low shadow-lg" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '24px', border: '1px solid rgba(255, 193, 116, 0.4)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {entryPanelInner}
          </div>
        </div>,
        document.body
      )}

      {bulkEditOpen && createPortal(
        <div
          className="modal-overlay animate-fade-in"
          style={{ position: 'fixed', inset: 0, zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.9)', overflowY: 'auto' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBulkEdit(); }}
        >
          <div className="card-glass glow-card animate-slide-up bg-surface-container-low shadow-lg" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '24px', border: '1px solid rgba(255, 193, 116, 0.4)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 className="font-display text-2xl font-bold text-on-surface uppercase m-0">Bulk Edit Lift Type</h3>
                <div className="font-label-sm text-label-sm text-on-surface-variant mt-1">Reassign a day's mislabeled sets - weights and reps stay exactly as logged.</div>
              </div>
              <button onClick={closeBulkEdit} className="bg-transparent border-none text-on-surface-variant hover:text-on-surface cursor-pointer">
                <X size={22} />
              </button>
            </div>

            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Date</label>
              <input
                type="date"
                value={bulkDate}
                onChange={e => setBulkDate(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-surface-container-highest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary border border-transparent"
              />
            </div>

            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Currently logged as</label>
              <div className="flex gap-2 flex-wrap">
                {liftTypes.map(lt => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setBulkFromType(lt)}
                    className={`px-4 py-2 rounded-xl font-label-md text-label-md transition-colors ${bulkFromType === lt ? 'bg-primary-container text-on-primary-container font-bold border-2 border-primary' : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high border border-transparent'}`}
                  >
                    {lt}
                  </button>
                ))}
              </div>
            </div>

            {bulkFromType && (
              <div className="px-4 py-3 rounded-xl bg-surface-container-highest text-on-surface-variant font-label-md text-label-md">
                {bulkMatches.length === 0
                  ? `No "${bulkFromType}" sets logged on ${bulkDate}.`
                  : `${bulkMatches.length} set${bulkMatches.length !== 1 ? 's' : ''} logged as "${bulkFromType}" on ${bulkDate}.`}
              </div>
            )}

            {bulkFromType && bulkMatches.length > 0 && (
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Change to</label>
                <div className="flex gap-2 flex-wrap">
                  {liftTypes.filter(lt => lt !== bulkFromType).map(lt => (
                    <button
                      key={lt}
                      type="button"
                      onClick={() => setBulkToType(lt)}
                      className={`px-4 py-2 rounded-xl font-label-md text-label-md transition-colors ${bulkToType === lt ? 'bg-primary-container text-on-primary-container font-bold border-2 border-primary' : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high border border-transparent'}`}
                    >
                      {lt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleBulkReassign}
              disabled={bulkSaving || !bulkFromType || !bulkToType || bulkMatches.length === 0}
              className={`h-12 rounded-xl font-headline-md text-headline-md uppercase flex items-center justify-center gap-2 transition-all ${bulkSaving || !bulkFromType || !bulkToType || bulkMatches.length === 0 ? 'bg-primary-container/50 text-on-primary-container/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-fixed text-on-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5'}`}
            >
              {bulkSaving ? 'Reassigning...' : `Reassign ${bulkMatches.length || ''} Set${bulkMatches.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
