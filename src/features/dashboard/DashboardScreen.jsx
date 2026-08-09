import { CheckCircle, Zap, Activity, Target, AlertTriangle } from 'lucide-react';
import { getCentralDateString, getCentralTimeString, isRpeLog } from '../../utils/athleteData';

export default function DashboardScreen({
  settings,
  setKioskTrackMode,
  athletes,
  reportData,
  executiveInsights,
  todaySessions,
  athletesRecordedToday,
  setSelectedProfileId,
  fetchProfileData,
  setScreen,
  setUnweighedOnlyFilter,
  setManualEntryForm,
  setShowManualEntryModal,
  setSelectedSportFilter,
  dailyAlerts,
  alertStatusFor
}) {
  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>WORKSPACE &middot; DASHBOARD</div>
          <h1 className="text-3xl" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {(() => {
              const hour = new Date().getHours();
              if (hour < 12) return 'GOOD MORNING';
              if (hour < 17) return 'GOOD AFTERNOON';
              return 'GOOD EVENING';
            })()}
          </h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} &middot; {athletes.length} athletes &middot; Ready for sessions</div>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Athletes</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, color: 'var(--white)' }}>{athletes.length}</span>
          </div>
          <div style={{ width: '1px', height: '44px', background: 'var(--color-border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sessions Today</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, color: 'var(--color-accent)' }}>{Math.max(todaySessions, executiveInsights.todayCount || executiveInsights.todayRecordedCount || 0)}</span>
          </div>
        </div>
      </div>

      {/* Top Fold: Executive Insights, Pre-Session Banner & Live Monitoring */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 1. Pre-Session Action Banner */}
        {(() => {
          const unrecordedAthletes = athletes.filter(a => !athletesRecordedToday.has(a.id));
          const isComplete = unrecordedAthletes.length === 0 && athletes.length > 0;
          return (
            <div className="card-glass glow-card animate-fade-in" style={{
              padding: '22px 28px',
              borderRadius: '20px',
              border: isComplete ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid rgba(194, 164, 80, 0.45)',
              background: isComplete ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.03) 100%)' : 'linear-gradient(135deg, rgba(194, 164, 80, 0.15) 0%, rgba(19, 21, 28, 0.7) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: isComplete ? 'rgba(34, 197, 94, 0.2)' : 'rgba(194, 164, 80, 0.2)',
                  border: isComplete ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(194, 164, 80, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isComplete ? 'var(--status-success)' : 'var(--color-accent)'
                }}>
                  {isComplete ? <CheckCircle size={26} /> : <Zap size={26} />}
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: isComplete ? 'var(--status-success)' : 'var(--color-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block' }}>
                    {isComplete ? '• SESSION COMPLETE' : '• PRE-SESSION MONITORING'}
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '4px 0 0 0', lineHeight: 1.1 }}>
                    {isComplete ? "All Athletes Weighed In Today!" : "Start today's session"}
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontWeight: 600 }}>
                    {isComplete ? "100% compliance achieved across all teams today." : `${unrecordedAthletes.length} Athlete${unrecordedAthletes.length !== 1 ? 's' : ''} Not Yet Weighed In`}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {!isComplete && (
                  <button
                    onClick={() => {
                      // Set the mode explicitly: this row is a "what am I logging?" picker,
                      // so landing on the kiosk in whatever mode it was left in would make
                      // the button lie about what it does.
                      setKioskTrackMode('both');
                      try { localStorage.setItem('shiloh_kiosk_track_mode', 'both'); } catch (e) {}
                      setUnweighedOnlyFilter(true);
                      setScreen('entry');
                    }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #d4af37 0%, #a68220 100%)',
                      border: 'none',
                      color: '#0a0d14',
                      fontFamily: 'var(--font-display)',
                      fontSize: '13px',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(212, 175, 55, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexShrink: 0,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span>Start Weigh-Ins</span>
                    <span>➔</span>
                  </button>
                )}
                {settings.enableRpe && (
                  <button
                    onClick={() => {
                      setKioskTrackMode('rpe');
                      try { localStorage.setItem('shiloh_kiosk_track_mode', 'rpe'); } catch (e) {}
                      // RPE is logged after a session by whoever trained, not just by the
                      // athletes who missed a morning weigh-in, so don't carry the
                      // unweighed-only filter into it.
                      setUnweighedOnlyFilter(false);
                      setScreen('entry');
                    }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '12px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(96, 165, 250, 0.5)',
                      color: '#60a5fa',
                      fontFamily: 'var(--font-display)',
                      fontSize: '13px',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexShrink: 0,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Target size={15} />
                    <span>Session RPE</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setManualEntryForm(prev => ({
                      ...prev,
                      athleteId: athletes.length > 0 ? athletes[0].id : '',
                      date: getCentralDateString(),
                      time: getCentralTimeString(),
                      weight: '',
                      successMsg: ''
                    }));
                    setShowManualEntryModal(true);
                  }}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    background: 'rgba(30, 58, 138, 0.4)',
                    border: '1px solid rgba(96, 165, 250, 0.5)',
                    color: '#60a5fa',
                    fontFamily: 'var(--font-display)',
                    fontSize: '13px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(37, 99, 235, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>⚡ Post-Practice / Manual Log</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* 2. NEEDS ATTENTION Row Section — pulled straight from the same canonical
            dailyAlerts list Alerts uses (dehydration + sleep, with severity streaks),
            instead of a separate dehydration-only recompute. Keeps this in lockstep with
            whatever a coach has already acknowledged/resolved on the Alerts screen. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>NEEDS ATTENTION</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            {dailyAlerts.filter(a => alertStatusFor(a.alert_key) !== 'resolved').length > 0 && (
              <button
                onClick={() => setScreen('alerts')}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                VIEW ALL IN ALERTS →
              </button>
            )}
          </div>
          {(() => {
            const unresolved = dailyAlerts.filter(a => alertStatusFor(a.alert_key) !== 'resolved');

            if (unresolved.length === 0) {
              return (
                <div className="card-glass" style={{ padding: '18px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(34, 197, 94, 0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CheckCircle size={20} style={{ color: 'var(--status-success)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--white)' }}>All athletes are currently within safe baseline and sleep limits.</span>
                </div>
              );
            }

            // dailyAlerts already arrives sorted most-urgent-first (streak, then magnitude);
            // show the top handful here and leave the rest for the full Alerts screen.
            const preview = unresolved.slice(0, 5);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {preview.map((item) => {
                  const initials = item.athlete_name ? item.athlete_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
                  const status = alertStatusFor(item.alert_key);
                  return (
                    <div key={item.id} className="card-glass" onClick={() => { setSelectedProfileId(item.athlete_id); fetchProfileData(item.athlete_id); setScreen('profiles'); }} style={{
                      padding: '16px 24px',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      background: 'rgba(255,255,255,0.02)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-display)',
                          fontSize: '15px',
                          fontWeight: 800,
                          color: '#fff'
                        }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--white)' }}>{item.athlete_name}</span>
                            {item.streak >= 2 && (
                              <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.25)', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>🔥 {item.streak}-DAY</span>
                            )}
                            {status === 'acknowledged' && (
                              <span style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 800 }}>ACKNOWLEDGED</span>
                            )}
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{item.sport} &middot; {item.message}</span>
                        </div>
                      </div>
                      <div style={{
                        padding: '6px 14px',
                        borderRadius: '16px',
                        background: `${item.color}22`,
                        border: `1px solid ${item.color}55`,
                        color: item.color,
                        fontFamily: 'var(--font-display)',
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.type}
                      </div>
                    </div>
                  );
                })}
                {unresolved.length > preview.length && (
                  <button
                    onClick={() => setScreen('alerts')}
                    className="card-glass"
                    style={{ padding: '12px', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    +{unresolved.length - preview.length} more unresolved — view all in Alerts →
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* 3. Session RPE Analytics (Only shown if RPE is enabled) */}
        {settings.enableRpe && (() => {
          const todayDateStr = getCentralDateString();
          // created_at is a UTC ISO string; comparing its prefix against the program's
          // Central date silently dropped every evening session (7pm CT is already
          // tomorrow in UTC). Convert first, the same way every other screen does.
          const todaysRpeLogs = (reportData || []).filter(r => isRpeLog(r) && r.created_at && getCentralDateString(new Date(r.created_at)) === todayDateStr);
          const avgRpe = todaysRpeLogs.length > 0 ? (todaysRpeLogs.reduce((acc, r) => acc + (r.rpe || 0), 0) / todaysRpeLogs.length).toFixed(1) : 0;
          const outliers = todaysRpeLogs.filter(r => r.rpe >= settings.rpeHighThreshold);
          // Response rate counts athletes who reported, not logs filed. An athlete who
          // rates a lift and a run on the same day files two rows, which used to push the
          // rate over 100%.
          const respondedIds = new Set(todaysRpeLogs.map(r => r.athlete_id));
          const rpeRate = athletes.length > 0
            ? Math.round((athletes.filter(a => respondedIds.has(a.id)).length / athletes.length) * 100)
            : 0;

          // Per-sport breakdown, mirroring the accountability tracker below so each program
          // can be read on its own once more teams are loaded. Sport comes from the roster
          // (the source of truth), falling back to whatever the log recorded.
          const sportOf = (r) => (athletes.find(a => a.id === r.athlete_id)?.sport) || r.sport || 'General';
          const rpeBySport = Array.from(new Set(athletes.map(a => a.sport || 'General'))).map(sport => {
            const roster = athletes.filter(a => (a.sport || 'General') === sport);
            const logs = todaysRpeLogs.filter(r => sportOf(r) === sport);
            const responded = roster.filter(a => logs.some(l => l.athlete_id === a.id)).length;
            return {
              sport,
              rosterCount: roster.length,
              logCount: logs.length,
              responded,
              pct: roster.length > 0 ? Math.round((responded / roster.length) * 100) : 0,
              avg: logs.length > 0 ? (logs.reduce((s, r) => s + (r.rpe || 0), 0) / logs.length) : null,
              hard: logs.filter(r => r.rpe >= settings.rpeHighThreshold).length,
            };
          }).sort((a, b) => a.pct - b.pct);

          return (
            <div className="card-glass glow-card" style={{ padding: '28px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '4px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Target size={14} /> INTERNAL LOAD METRICS
                  </span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', margin: '4px 0 0 0', letterSpacing: '0.03em' }}>
                    TODAY'S SESSION LOAD
                  </h3>
                </div>
                {/* The avg/response pair now lives on each team card. What stays up here is
                    a roll-up pill, matching the accountability tracker's summary below. */}
                <div style={{
                  padding: '8px 18px',
                  borderRadius: '20px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {todaysRpeLogs.length === 0
                      ? 'NO SESSIONS LOGGED YET'
                      : `${respondedIds.size} of ${athletes.length} REPORTED \u00b7 ${rpeRate}% \u00b7 AVG ${avgRpe}`}
                  </span>
                </div>
              </div>

              {outliers.length > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '16px', padding: '16px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <AlertTriangle size={14} /> {outliers.length} OUTLIERS (RPE ≥ {settings.rpeHighThreshold})
                  </span>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {outliers.map(r => {
                      const athlete = athletes.find(a => a.id === r.athlete_id);
                      const initials = r.athlete_name ? r.athlete_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
                      return (
                        <div key={r.id} onClick={() => { setSelectedProfileId(r.athlete_id); fetchProfileData(r.athlete_id); setScreen('profiles'); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                            {r.rpe}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)' }}>{r.athlete_name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{athlete?.sport || 'General'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Per-sport load, same card shape as WEIGH-INS REMAINING BY SPORT below. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {rpeBySport.length === 0 ? (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', padding: '12px 0' }}>No sports active on roster.</span>
                ) : rpeBySport.map(s => {
                  const none = s.logCount === 0;
                  const isHard = s.avg != null && s.avg >= settings.rpeHighThreshold;
                  return (
                    <div key={s.sport} data-testid={`rpe-sport-card`} data-sport={s.sport} className="glow-card" style={{
                      padding: '20px',
                      borderRadius: '18px',
                      background: none ? 'rgba(255,255,255,0.02)' : (isHard ? 'rgba(239, 68, 68, 0.04)' : 'rgba(59, 130, 246, 0.04)'),
                      border: none ? '1px solid rgba(255,255,255,0.08)' : (isHard ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(59, 130, 246, 0.25)'),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--white)', display: 'block', letterSpacing: '0.02em' }}>{s.sport}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                            {s.logCount === 0 ? `${s.rosterCount} Athletes Listed` : `${s.logCount} Session${s.logCount !== 1 ? 's' : ''} Logged`}
                          </span>
                        </div>
                        {s.hard > 0 && (
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: '12px',
                            whiteSpace: 'nowrap',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            letterSpacing: '0.04em'
                          }}>
                            {s.hard} HARD
                          </span>
                        )}
                      </div>

                      {/* The pair that used to sit in the panel header, now per team. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TEAM AVG RPE</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: none ? 'var(--color-text-muted)' : (isHard ? '#ef4444' : '#60a5fa') }}>
                            {none ? '\u2014' : s.avg.toFixed(1)} <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>/ {settings.rpeScaleMax}</span>
                          </span>
                        </div>
                        <div style={{ width: '1px', height: '36px', background: 'var(--color-border)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LOG RESPONSE RATE</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: 'var(--white)' }}>
                            {s.pct}%
                          </span>
                        </div>
                      </div>

                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${s.pct}%`,
                          borderRadius: '4px',
                          background: isHard ? 'linear-gradient(90deg, #f87171 0%, #dc2626 100%)' : 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
                          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                        }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Reported Today</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--white)' }}>
                          {s.responded}/{s.rosterCount} athletes
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {todaysRpeLogs.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>
                  No RPE logs recorded yet today.
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. Full-Width Gamified Compliance Hub: WEIGH-INS REMAINING */}
        <div className="card-glass glow-card" style={{ padding: '28px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '4px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={14} /> SESSION ACCOUNTABILITY TRACKER
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', margin: '4px 0 0 0', letterSpacing: '0.03em' }}>
                WEIGH-INS REMAINING BY SPORT
              </h3>
            </div>
            {(() => {
              const totalAthletes = athletes.length;
              const totalDone = athletes.filter(a => athletesRecordedToday.has(a.id)).length;
              const allDone = totalAthletes > 0 && totalDone === totalAthletes;
              return (
                <div style={{
                  padding: '8px 18px',
                  borderRadius: '20px',
                  background: allDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(184, 156, 91, 0.15)',
                  border: allDone ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(184, 156, 91, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: allDone ? 'var(--status-success)' : 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {allDone ? '🎉 ALL TEAMS COMPLIANT' : `${totalDone} of ${totalAthletes} ROSTER CHECKED IN`}
                  </span>
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {(() => {
              const allSports = Array.from(new Set(athletes.map(a => a.sport || 'General')));
              if (allSports.length === 0) return <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', padding: '12px 0' }}>No sports active on roster.</span>;

              return allSports.map((sport) => {
                const sportAthletes = athletes.filter(a => (a.sport || 'General') === sport);
                const doneCount = sportAthletes.filter(a => athletesRecordedToday.has(a.id)).length;
                const countLeft = sportAthletes.length - doneCount;
                const pct = sportAthletes.length > 0 ? Math.round((doneCount / sportAthletes.length) * 100) : 0;
                const isDone = countLeft === 0 && sportAthletes.length > 0;

                return (
                  <div key={sport} onClick={() => { setSelectedSportFilter(sport); setScreen('roster'); }} className="glow-card" style={{
                    padding: '20px',
                    borderRadius: '18px',
                    background: isDone ? 'rgba(34, 197, 94, 0.04)' : 'rgba(255,255,255,0.025)',
                    border: isDone ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--white)', display: 'block', letterSpacing: '0.02em' }}>{sport}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>{sportAthletes.length} Athletes Listed</span>
                      </div>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: isDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                        color: isDone ? 'var(--status-success)' : '#f97316',
                        letterSpacing: '0.04em'
                      }}>
                        {isDone ? 'DONE ✓' : `${countLeft} LEFT`}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: '4px',
                        background: isDone ? 'var(--status-success)' : 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 700 }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Daily Compliance</span>
                      <span style={{ color: 'var(--white)' }}>{pct}% ({doneCount}/{sportAthletes.length})</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
