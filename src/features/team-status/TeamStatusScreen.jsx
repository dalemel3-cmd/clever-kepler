import { ChevronLeft, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { getCentralDateString, isPostPracticeLog } from '../../utils/athleteData';

// Dedicated per-team weigh-in compliance drill-down, separate from the general
// Athlete Roster grid. Requested because the roster's "last weighed in" readout was
// easy to misread against an athlete's BASELINE weight rather than their most recent
// actual weigh-in log — this screen is built purely off real log timestamps (today's
// records first, so "who hasn't weighed in" always means "no log today", not "hasn't
// hit baseline") and sorts athletes who still need to weigh in to the top.
export default function TeamStatusScreen({
  sport,
  athletes,
  reportData,
  setScreen,
  setSelectedProfileId,
  fetchProfileData
}) {
  const todayStr = getCentralDateString();
  const sportAthletes = athletes.filter(a => (a.sport || '') === sport);

  const rows = sportAthletes.map(a => {
    const logs = reportData
      .filter(r => r.athlete_id === a.id && r.weight_lbs && Number(r.weight_lbs) > 0 && !isPostPracticeLog(r))
      .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    const latest = logs[0] || null;
    const weighedInToday = !!latest && getCentralDateString(new Date(latest.created_at)) === todayStr;
    const daysSince = latest ? Math.floor((Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null;
    return { athlete: a, latest, weighedInToday, daysSince };
  });

  // Not weighed in today first (longest gap first within that group), then everyone
  // already checked in today, alphabetically.
  rows.sort((r1, r2) => {
    if (r1.weighedInToday !== r2.weighedInToday) return r1.weighedInToday ? 1 : -1;
    if (!r1.weighedInToday) {
      const d1 = r1.daysSince == null ? Infinity : r1.daysSince;
      const d2 = r2.daysSince == null ? Infinity : r2.daysSince;
      if (d1 !== d2) return d2 - d1;
    }
    return r1.athlete.name.localeCompare(r2.athlete.name);
  });

  const notYetCount = rows.filter(r => !r.weighedInToday).length;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <button
        onClick={() => setScreen('groups')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', background: 'transparent', border: 'none', padding: 0, fontSize: '13px', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}
      >
        <ChevronLeft size={16} /> BACK TO SPORT GROUPS
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
            {sport} &middot; WEIGH-IN STATUS
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Sorted by who still needs to weigh in today &middot; based on each athlete's most recent log, not baseline
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: notYetCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)', border: `1px solid ${notYetCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`, textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: notYetCount > 0 ? 'var(--status-error)' : 'var(--status-success)' }}>{notYetCount}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)' }}>NOT WEIGHED IN TODAY</div>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--status-success)' }}>{rows.length - notYetCount}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)' }}>WEIGHED IN TODAY</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.length === 0 && (
          <div className="card-glass" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No athletes tagged to {sport} yet.
          </div>
        )}
        {rows.map(({ athlete, latest, weighedInToday, daysSince }) => (
          <div
            key={athlete.id}
            onClick={() => { setSelectedProfileId(athlete.id); fetchProfileData(athlete.id); setScreen('profiles'); }}
            className="card-glass glow-card"
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', cursor: 'pointer', borderLeft: `4px solid ${weighedInToday ? 'var(--status-success)' : 'var(--status-error)'}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {weighedInToday ? <CheckCircle size={20} style={{ color: 'var(--status-success)' }} /> : <AlertTriangle size={20} style={{ color: 'var(--status-error)' }} />}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{athlete.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{athlete.position || athlete.team || ''}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {weighedInToday ? (
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-success)' }}>✅ Logged today &middot; {latest.weight_lbs} lbs</span>
              ) : latest ? (
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-error)', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  <Clock size={13} /> Last weigh-in {daysSince === 0 ? 'earlier today' : daysSince === 1 ? '1 day ago' : `${daysSince} days ago`} ({new Date(latest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                </span>
              ) : (
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-error)' }}>⚠ No weigh-in logged yet</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
