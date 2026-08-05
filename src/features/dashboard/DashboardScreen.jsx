import { CheckCircle, Zap } from 'lucide-react';
import { getAthleteBaseline } from '../../utils/athleteData';

export default function DashboardScreen({
  athletes,
  executiveInsights,
  todaySessions,
  athletesRecordedToday,
  reportData,
  setSelectedProfileId,
  fetchProfileData,
  setScreen,
  setUnweighedOnlyFilter,
  setManualEntryForm,
  setShowManualEntryModal,
  setSelectedSportFilter
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
                    {isComplete ? "All Athletes Weighed In Today!" : `${unrecordedAthletes.length} Athlete${unrecordedAthletes.length !== 1 ? 's' : ''} Not Yet Weighed In`}
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontWeight: 600 }}>
                    {isComplete ? "100% compliance achieved across all teams today." : "Start today's session to quickly record weights and recovery metrics."}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {!isComplete && (
                  <button
                    onClick={() => {
                      setUnweighedOnlyFilter(true);
                      setScreen('entry');
                    }}
                    style={{
                      padding: '14px 24px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #d4af37 0%, #a68220 100%)',
                      border: 'none',
                      color: '#0a0d14',
                      fontFamily: 'var(--font-display)',
                      fontSize: '15px',
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
                <button
                  onClick={() => {
                    setManualEntryForm(prev => ({
                      ...prev,
                      athleteId: athletes.length > 0 ? athletes[0].id : '',
                      date: new Date().toISOString().slice(0, 10),
                      time: new Date().toTimeString().slice(0, 5),
                      weight: '',
                      successMsg: ''
                    }));
                    setShowManualEntryModal(true);
                  }}
                  style={{
                    padding: '14px 22px',
                    borderRadius: '14px',
                    background: 'rgba(30, 58, 138, 0.4)',
                    border: '1px solid rgba(96, 165, 250, 0.5)',
                    color: '#60a5fa',
                    fontFamily: 'var(--font-display)',
                    fontSize: '15px',
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

        {/* 2. NEEDS ATTENTION Row Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>NEEDS ATTENTION</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          </div>
          {(() => {
            const attentionItems = [];
            athletes.forEach(ath => {
              const baseInfo = getAthleteBaseline(ath, reportData);
              const base = baseInfo ? parseFloat(baseInfo.weight_lbs) : 0;
              if (!base || base <= 0) return;

              const latestRec = reportData
                .filter(r => r.athlete_id === ath.id && r.weight_lbs && !isNaN(parseFloat(r.weight_lbs)) && parseFloat(r.weight_lbs) > 0)
                .sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0))[0];

              if (!latestRec) return;

              const currentWt = parseFloat(latestRec.weight_lbs);
              const dropLbs = base - currentWt;
              if (dropLbs > 5.0) {
                attentionItems.push({
                  id: ath.id,
                  name: ath.name,
                  sport: ath.sport || 'Athlete',
                  reason: `dropped ${dropLbs.toFixed(1)} lbs from baseline (${currentWt} lbs vs ${base} lbs base)`,
                  badge: `-${dropLbs.toFixed(1)} LB`,
                  dropLbs: dropLbs,
                  isLoss: true
                });
              }
            });

            // Sort from highest weight drop to lowest
            attentionItems.sort((a, b) => (b.dropLbs || 0) - (a.dropLbs || 0));

            if (attentionItems.length === 0) {
              return (
                <div className="card-glass" style={{ padding: '18px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(34, 197, 94, 0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CheckCircle size={20} style={{ color: 'var(--status-success)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--white)' }}>All athletes are currently within safe baseline limits (no athletes down &gt;5 lbs from baseline).</span>
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {attentionItems.map((item, index) => {
                  const initials = item.name ? item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
                  return (
                    <div key={index} className="card-glass" onClick={() => { setSelectedProfileId(item.id); fetchProfileData(item.id); setScreen('profiles'); }} style={{
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
                          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--white)', display: 'block' }}>{item.name}</span>
                          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{item.sport} &middot; {item.reason}</span>
                        </div>
                      </div>
                      <div style={{
                        padding: '6px 14px',
                        borderRadius: '16px',
                        background: item.isLoss ? 'rgba(239, 68, 68, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                        border: item.isLoss ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(249, 115, 22, 0.35)',
                        color: item.isLoss ? '#ef4444' : '#f97316',
                        fontFamily: 'var(--font-display)',
                        fontSize: '14px',
                        fontWeight: 800,
                        letterSpacing: '0.04em'
                      }}>
                        {item.badge}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

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
