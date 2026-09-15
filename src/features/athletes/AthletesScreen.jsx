import { useState, useMemo } from 'react';
import { Search, X, Plus, ChevronLeft } from 'lucide-react';
import { isPostPracticeLog, hasWeight, isRpeLog, getAthleteBaseline } from '../../utils/athleteData';
import { bestTestFor } from '../profiles/ProfilesScreen';
import { formatMetric } from '../analytics/SpeedPowerPanel';
import { estimate1RM } from '../lifts/LiftScreen';

const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
const colorFor = (name) => avatarColors[name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length];
const initialsOf = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase();

// One badge per athlete - the same "needs attention" signal drives both the list's
// sort order and its right-hand badge, so a coach never sees a flagged badge on a
// row that isn't also near the top of the list.
//   danger  - a real weigh-in shows a drop at/past the dehydration threshold
//   warning - the athlete has logs, but never a real weigh-in to baseline against
//             (sleep/RPE only)
//   neutral - no logs of any kind yet
//   success - weighing in normally, no flag
const badgeFor = (athlete, logs, settings) => {
  if (logs.length === 0) return { tone: 'neutral', label: 'No logs' };
  const weightLogs = logs.filter(l => hasWeight(l) && !isPostPracticeLog(l) && !isRpeLog(l));
  if (weightLogs.length === 0) return { tone: 'warning', label: 'Needs baseline' };
  const latestWeight = Number(weightLogs[0].weight_lbs);
  const baseInfo = getAthleteBaseline(athlete, logs);
  const baselineWeight = baseInfo ? Number(baseInfo.weight_lbs) : (weightLogs.length > 1 ? Number(weightLogs[weightLogs.length - 1].weight_lbs) : null);
  const delta = (baselineWeight != null && weightLogs.length > 1) ? (latestWeight - baselineWeight) : 0;
  if (delta <= -settings.dehydrationThreshold) return { tone: 'danger', label: `${delta.toFixed(1)} lb` };
  return { tone: 'success', label: 'Current' };
};

const TONE_STYLE = {
  danger: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', color: '#f87171' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', color: '#f59e0b' },
  success: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', color: '#4ade80' },
  neutral: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)', color: 'var(--color-text-muted)' },
};

function Badge({ tone, children }) {
  const s = TONE_STYLE[tone] || TONE_STYLE.neutral;
  return (
    <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap', background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {children}
    </span>
  );
}

function Avatar({ name, size = 44 }) {
  return (
    <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: colorFor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: `${Math.round(size * 0.36)}px`, fontFamily: 'var(--font-display)', flexShrink: 0 }}>
      {initialsOf(name)}
    </div>
  );
}

export default function AthletesScreen({
  settings,
  isAddingAthlete,
  filteredAthletes,
  athletes,
  search,
  setSearch,
  sportsList,
  selectedSportFilter,
  setSelectedSportFilter,
  setIsAddingAthlete,
  setEditingAthleteId,
  newAthlete,
  setNewAthlete,
  reportData,
  performanceTests,
  liftLogs,
  setSelectedProfileId,
  fetchProfileData,
  setScreen,
  setProfileEntryScreen,
  editingAthleteId,
  handleUpdateAthlete,
  handleCreateAthlete,
  saving,
  handleDeleteAthlete,
  handleSelectAthleteForEntry,
}) {
  // Per-athlete computed rows: logs, badge/tone, and the one metric that matters
  // most for this athlete (weight delta if flagged, otherwise their best test) -
  // computed once here so the list and the sort share the exact same numbers.
  const rows = useMemo(() => {
    return filteredAthletes.map(a => {
      const logs = reportData.filter(r => r.athlete_id === a.id || (!r.athlete_id && r.athlete_name === a.name)).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
      const badge = badgeFor(a, logs, settings);
      const bestVertical = bestTestFor(performanceTests || [], a.id, 'vertical_jump');
      const bestFly = bestTestFor(performanceTests || [], a.id, '10yd_fly');
      const metric = badge.tone === 'danger' || badge.tone === 'warning'
        ? { val: badge.label, lbl: badge.tone === 'danger' ? 'Since baseline' : 'Status' }
        : bestVertical
          ? { val: formatMetric(bestVertical.metric, bestVertical.unit), lbl: 'Best vertical' }
          : bestFly
            ? { val: formatMetric(bestFly.metric, bestFly.unit), lbl: 'Best fly 10' }
            : { val: 'Not tested', lbl: 'Best vertical' };
      const latestWeightLog = logs.find(l => hasWeight(l) && !isPostPracticeLog(l) && !isRpeLog(l));
      return { athlete: a, logs, badge, metric, latestWeight: latestWeightLog ? Number(latestWeightLog.weight_lbs) : null };
    });
  }, [filteredAthletes, reportData, performanceTests, settings]);

  // "Needs attention" first: danger, then warning, then neutral (no data at all is
  // still worth a glance), then success/current athletes last, alphabetical within
  // each group so the order doesn't jump around as new logs come in.
  const TONE_RANK = { danger: 0, warning: 1, neutral: 2, success: 3 };
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const r = TONE_RANK[a.badge.tone] - TONE_RANK[b.badge.tone];
    return r !== 0 ? r : a.athlete.name.localeCompare(b.athlete.name);
  }), [rows]);

  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const selectedId = selectedAthleteId && sortedRows.some(r => r.athlete.id === selectedAthleteId)
    ? selectedAthleteId
    : (sortedRows[0]?.athlete.id ?? null);
  const selectedRow = sortedRows.find(r => r.athlete.id === selectedId) || null;

  const openTrends = (athleteId) => {
    setSelectedProfileId(athleteId);
    fetchProfileData(athleteId);
    // So the Full Trends screen's back chevron returns here instead of falling
    // through to the old standalone Profiles picker grid.
    setProfileEntryScreen?.('athletes');
    setScreen('profiles');
  };

  const startEdit = (athlete) => {
    setEditingAthleteId(athlete.id);
    setNewAthlete({ name: athlete.name, sport: athlete.sport, team: athlete.team, grade: athlete.grade || '', position: athlete.position });
    setIsAddingAthlete(true);
  };

  if (isAddingAthlete) {
    return (
      <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div onClick={() => setIsAddingAthlete(false)} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
            <ChevronLeft size={16} /> Back
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Full Name</span>
            <input type="text" className="input-glass" placeholder="e.g. John Doe" value={newAthlete.name} onChange={e => setNewAthlete({ ...newAthlete, name: e.target.value })} style={{ height: '48px', padding: '0 16px', fontSize: '14px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Sport</span>
            <input type="text" list="athletes-sports-datalist" className="input-glass" placeholder="e.g. Football or choose from tags below" value={newAthlete.sport} onChange={e => setNewAthlete({ ...newAthlete, sport: e.target.value })} style={{ height: '48px', padding: '0 16px', fontSize: '14px' }} />
            <datalist id="athletes-sports-datalist">
              {sportsList.map(s => <option key={s} value={s} />)}
            </datalist>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {sportsList.map(sport => (
                <button
                  key={sport}
                  type="button"
                  onClick={() => setNewAthlete({ ...newAthlete, sport })}
                  style={{
                    padding: '6px 12px', borderRadius: '20px',
                    border: newAthlete.sport === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                    background: newAthlete.sport === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.03)',
                    color: newAthlete.sport === sport ? 'var(--navy-950)' : 'var(--color-text-muted)',
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  {sport}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Team</span>
              <input type="text" className="input-glass" placeholder="e.g. Varsity" value={newAthlete.team} onChange={e => setNewAthlete({ ...newAthlete, team: e.target.value })} style={{ height: '48px', padding: '0 16px', fontSize: '16px' }} />
            </div>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Grade</span>
              <input type="text" className="input-glass" placeholder="e.g. 10th" value={newAthlete.grade} onChange={e => setNewAthlete({ ...newAthlete, grade: e.target.value })} style={{ height: '48px', padding: '0 16px', fontSize: '16px' }} />
            </div>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Position</span>
              <input type="text" className="input-glass" placeholder="e.g. WR" value={newAthlete.position} onChange={e => setNewAthlete({ ...newAthlete, position: e.target.value })} style={{ height: '48px', padding: '0 16px', fontSize: '16px' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={editingAthleteId ? handleUpdateAthlete : handleCreateAthlete}
              disabled={!newAthlete.name || saving}
              className="btn-primary"
              style={{ height: '56px', fontSize: '18px' }}
            >
              {saving ? 'Saving...' : (editingAthleteId ? 'Save Changes' : 'Create Athlete')}
            </button>

            {editingAthleteId && (
              <button
                onClick={handleDeleteAthlete}
                disabled={saving}
                style={{ height: '56px', background: 'transparent', color: 'var(--status-error)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                Delete Athlete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>WORKSPACE &middot; ATHLETES</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>ATHLETES</h1>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            One list, not two - select an athlete to open their profile on the right, no separate Profiles screen to reconcile.
          </div>
        </div>
        <button
          onClick={() => { setIsAddingAthlete(true); setEditingAthleteId(null); setNewAthlete({ name: '', sport: '', team: '', grade: '', position: '' }); }}
          className="btn-primary glow-card"
          style={{ height: '40px', padding: '0 20px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-accent)', color: 'var(--navy-950)', border: '1px solid var(--color-accent)', borderRadius: '8px', cursor: 'pointer' }}
        >
          <Plus size={18} strokeWidth={2.5} /> Add Athlete
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '20px', alignItems: 'start' }} className="athletes-layout">
        {/* LEFT: consolidated list */}
        <div className="card-glass glow-card" style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="input-glass"
              placeholder="Search athletes by name or position..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: '46px', padding: '0 38px 0 44px', fontSize: '14px' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X size={18} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '14px 0 4px' }}>
            {['ALL', ...sportsList].map(sport => (
              <button
                key={sport}
                onClick={() => setSelectedSportFilter(sport)}
                style={{
                  padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  border: selectedSportFilter === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedSportFilter === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.02)',
                  color: selectedSportFilter === sport ? 'var(--navy-950)' : 'var(--color-text)',
                }}
              >
                {sport === 'ALL' ? 'All' : sport}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 4px' }}>
            {sortedRows.length} athlete{sortedRows.length !== 1 ? 's' : ''} &middot; sorted by needs attention
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflowY: 'auto' }}>
            {sortedRows.map(({ athlete: a, badge, metric }, idx) => (
              <div
                key={a.id}
                onClick={() => setSelectedAthleteId(a.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 8px', cursor: 'pointer', borderRadius: '10px',
                  borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  background: a.id === selectedId ? 'rgba(184, 156, 91, 0.12)' : 'transparent',
                }}
              >
                <Avatar name={a.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{a.sport || 'General'} &middot; {a.team || 'Varsity'}</div>
                </div>
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <div style={{ textAlign: 'right', minWidth: '90px', flex: 'none' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{metric.val}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{metric.lbl}</div>
                </div>
              </div>
            ))}
            {sortedRows.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No athletes match "{search}".
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: drill-in profile panel */}
        {selectedRow ? (() => {
          const { athlete: a, logs, badge } = selectedRow;
          const weightLogs = logs.filter(l => hasWeight(l) && !isPostPracticeLog(l) && !isRpeLog(l));
          const currentWeight = weightLogs[0] ? Number(weightLogs[0].weight_lbs) : null;
          const baseInfo = getAthleteBaseline(a, logs);
          const bestVertical = bestTestFor(performanceTests || [], a.id, 'vertical_jump');
          const latestRpe = logs.find(isRpeLog);
          // Best estimated 1RM across every lift this athlete has logged, whichever
          // exercise it happened to be - same Epley estimate the Lift Tracker
          // leaderboard ranks on, so this number can never disagree with that board.
          const bestLift = (liftLogs || []).filter(l => l.athlete_id === a.id).reduce((best, l) => {
            const est = estimate1RM(Number(l.weight_lbs), Number(l.reps));
            return (!best || est > best.est) ? { est: Math.round(est), liftType: l.lift_type } : best;
          }, null);
          const lastActive = logs[0]?.created_at ? new Date(logs[0].created_at).toLocaleDateString() : null;

          const historyLabel = (l) => {
            if (l.is_baseline === true || l.is_baseline === 'true' || l.is_baseline === 1) return 'Baseline set';
            if (isRpeLog(l)) return 'RPE logged';
            if (isPostPracticeLog(l)) return 'Post-practice';
            if (hasWeight(l)) return 'Weigh-in';
            return 'Log';
          };
          const historyValue = (l) => {
            if (isRpeLog(l)) return `${l.rpe} / ${settings.rpeScaleMax}`;
            if (hasWeight(l)) return `${l.weight_lbs} lb`;
            return '—';
          };

          return (
            <div className="card-glass glow-card" style={{ borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <Avatar name={a.name} size={56} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {a.sport || 'General'} &middot; {a.team || 'Varsity'}{lastActive ? ` · Active ${lastActive}` : ''}
                  </div>
                </div>
              </div>
              <div><Badge tone={badge.tone}>{badge.label}</Badge></div>

              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Biometric &amp; performance</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--color-accent)' }}>{currentWeight != null ? `${currentWeight} lb` : '—'}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Current weight</div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--color-accent)' }}>{baseInfo ? `${baseInfo.weight_lbs} lb` : '—'}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{baseInfo ? `Baseline (${baseInfo.date_str})` : 'Baseline'}</div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: bestVertical ? '18px' : '13px', fontWeight: 700, color: bestVertical ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {bestVertical ? formatMetric(bestVertical.metric, bestVertical.unit) : 'Not tested'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Best vertical</div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: latestRpe ? '18px' : '13px', fontWeight: 700, color: latestRpe ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {latestRpe ? `${latestRpe.rpe} / ${settings.rpeScaleMax}` : 'No RPE logged'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Most recent RPE</div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: bestLift ? '18px' : '13px', fontWeight: 700, color: bestLift ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {bestLift ? `${bestLift.est} lb` : 'No lifts logged'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{bestLift ? `Best est. 1RM (${bestLift.liftType})` : 'Best est. 1RM'}</div>
                </div>
              </div>

              {logs.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Recent log history</div>
                  <div>
                    {logs.slice(0, 3).map((l, i) => (
                      <div key={l.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < Math.min(2, logs.length - 1) ? '1px solid rgba(255,255,255,0.06)' : 'none', fontSize: '13px' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{new Date(l.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} &mdash; {historyLabel(l)}</span>
                        <span style={{ fontWeight: 700, color: badge.tone === 'danger' && hasWeight(l) && !isRpeLog(l) ? '#f87171' : '#fff' }}>{historyValue(l)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSelectAthleteForEntry(a.id)}
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: 'none', background: 'var(--color-accent)', color: 'var(--navy-950)' }}
                >
                  Log Entry
                </button>
                <button
                  onClick={() => openTrends(a.id)}
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff' }}
                >
                  View Full Trends
                </button>
                <button
                  onClick={() => startEdit(a)}
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: 'var(--color-text-muted)' }}
                >
                  Edit Info
                </button>
              </div>
            </div>
          );
        })() : (
          <div className="card-glass" style={{ borderRadius: '18px', padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No athletes to show.
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 960px) {
          .athletes-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
