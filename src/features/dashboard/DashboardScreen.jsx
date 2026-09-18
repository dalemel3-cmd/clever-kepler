import { CheckCircle } from 'lucide-react';
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
  setProfileEntryScreen,
  setUnweighedOnlyFilter,
  setManualEntryForm,
  setShowManualEntryModal,
  setSelectedSportFilter,
  dailyAlerts,
  alertStatusFor
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  
  const compliancePct = athletes.length > 0 ? Math.round((athletesRecordedToday.size / athletes.length) * 100) : 0;
  const unresolvedCount = dailyAlerts.filter(a => alertStatusFor(a.alert_key) !== 'resolved').length;
  
  const unrecordedAthletes = athletes.filter(a => !athletesRecordedToday.has(a.id));
  const isComplete = unrecordedAthletes.length === 0 && athletes.length > 0;
  const unresolved = dailyAlerts.filter(a => alertStatusFor(a.alert_key) !== 'resolved');
  
  const todayDateStr = getCentralDateString();
  const todaysRpeLogs = (reportData || []).filter(r => isRpeLog(r) && r.created_at && getCentralDateString(new Date(r.created_at)) === todayDateStr);
  
  const allSports = Array.from(new Set(athletes.map(a => a.sport || 'General')));

  const sportOf = (r) => (athletes.find(a => a.id === r.athlete_id)?.sport) || r.sport || 'General';
  const rpeBySport = allSports.map(sport => {
    const roster = athletes.filter(a => (a.sport || 'General') === sport);
    const logs = todaysRpeLogs.filter(r => sportOf(r) === sport);
    const responded = roster.filter(a => logs.some(l => l.athlete_id === a.id)).length;
    const isHard = logs.length > 0 && (logs.reduce((s, r) => s + (r.rpe || 0), 0) / logs.length) >= settings.rpeHighThreshold;
    return {
      sport,
      rosterCount: roster.length,
      logCount: logs.length,
      responded,
      pct: roster.length > 0 ? Math.round((responded / roster.length) * 100) : 0,
      avg: logs.length > 0 ? (logs.reduce((s, r) => s + (r.rpe || 0), 0) / logs.length) : null,
      isHard,
      hard: logs.filter(r => r.rpe >= settings.rpeHighThreshold).length
    };
  }).sort((a, b) => a.pct - b.pct);

  const respondedIds = new Set(todaysRpeLogs.map(r => r.athlete_id));
  const rpeRate = athletes.length > 0 ? Math.round((respondedIds.size / athletes.length) * 100) : 0;
  const avgRpe = todaysRpeLogs.length > 0 ? (todaysRpeLogs.reduce((s, r) => s + (r.rpe || 0), 0) / todaysRpeLogs.length).toFixed(1) : '0.0';

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto pb-space-xl animate-fade-in">
      {/* Top Command Center Bar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md py-space-md border-b border-[#2a313d]">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-primary">WORKSPACE</span>
            <span className="text-[#2a313d] font-label-sm text-label-sm">/</span>
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface">COMMAND CENTER</span>
          </div>
          <h1 className="font-display text-display uppercase tracking-tight text-on-surface flex items-center gap-space-sm">
            {greeting}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-space-xs flex-wrap">
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
            <span className="text-dim">&middot;</span>
            <span className="text-primary font-semibold">{athletes.length} rostered athletes</span>
            <span className="text-dim">&middot;</span>
            <span>{allSports.length} teams in-season</span>
            <span className="text-dim">&middot;</span>
            <span className="text-secondary font-medium">Session #{Math.max(todaySessions, executiveInsights?.todayCount || 0)} underway</span>
          </p>
        </div>

        {/* Live Performance Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
          <div className="bg-surface-container p-space-sm rounded-lg border border-[#2a313d] flex flex-col justify-between shadow-sm min-w-[130px]">
            <span className="font-label-sm text-label-sm text-dim uppercase tracking-wider">TOTAL ATHLETES</span>
            <div className="flex items-baseline gap-space-xs mt-1">
              <span className="font-metric-val text-metric-val text-on-surface">{athletes.length}</span>
            </div>
          </div>
          <div className="bg-surface-container p-space-sm rounded-lg border border-[#2a313d] flex flex-col justify-between shadow-sm min-w-[130px]">
            <span className="font-label-sm text-label-sm text-dim uppercase tracking-wider">SESSIONS TODAY</span>
            <div className="flex items-baseline gap-space-xs mt-1">
              <span className="font-metric-val text-metric-val text-on-surface">{Math.max(todaySessions, executiveInsights?.todayCount || executiveInsights?.todayRecordedCount || 0)}</span>
            </div>
          </div>
          <div className="bg-surface-container p-space-sm rounded-lg border border-[#2a313d] flex flex-col justify-between shadow-sm min-w-[130px]">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-dim uppercase tracking-wider">WEIGH-IN SYNC</span>
              <span className="material-symbols-outlined text-sm text-primary">scale</span>
            </div>
            <div className="flex items-baseline gap-space-xs mt-1">
              <span className="font-metric-val text-metric-val text-primary">{compliancePct}%</span>
              <span className="font-label-sm text-label-sm text-dim">({athletesRecordedToday.size}/{athletes.length})</span>
            </div>
          </div>
          <div className="bg-surface-container p-space-sm rounded-lg border border-[#2a313d] flex flex-col justify-between shadow-sm min-w-[130px]">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-error uppercase tracking-wider font-bold">NEEDS ATTENTION</span>
              {unresolvedCount > 0 && <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>}
            </div>
            <div className="flex items-baseline gap-space-xs mt-1">
              <span className={`font-metric-val text-metric-val ${unresolvedCount > 0 ? 'text-error' : 'text-on-surface'}`}>{unresolvedCount}</span>
              {unresolvedCount > 0 && <span className="font-label-sm text-label-sm text-error uppercase font-bold">URGENT</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Rapid Action Command Bar */}
      <div className="mt-space-md p-space-md bg-surface-container rounded-xl border border-[#2a313d] shadow-md flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-2xl">fitness_center</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-md text-headline-md uppercase text-on-surface">FACILITY DISPATCH</span>
              <span className="px-1.5 py-0.5 rounded bg-primary text-[#030a14] font-label-sm text-label-sm font-bold">LIVE QUEUE</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{unrecordedAthletes.length} athletes awaiting pre/post mass check.</p>
          </div>
        </div>

        {/* Actions Set */}
        <div className="flex flex-wrap items-center gap-space-sm">
          {!isComplete && (
            <button
              onClick={() => {
                setKioskTrackMode('both');
                try { localStorage.setItem('shiloh_kiosk_track_mode', 'both'); } catch (e) {}
                setUnweighedOnlyFilter(true);
                setScreen('entry');
              }}
              className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary text-[#030a14] hover:bg-primary-hover transition-all shadow-sm font-headline-md text-headline-md uppercase"
            >
              <span className="material-symbols-outlined text-base">bolt</span>
              <span>Start Weigh-Ins ({unrecordedAthletes.length} remaining)</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          )}

          {settings.enableRpe && (
            <button
              onClick={() => {
                setKioskTrackMode('rpe');
                try { localStorage.setItem('shiloh_kiosk_track_mode', 'rpe'); } catch (e) {}
                setUnweighedOnlyFilter(false);
                setScreen('entry');
              }}
              className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-[#2a313d] text-tertiary font-headline-md text-headline-md uppercase transition-colors"
            >
              <span className="material-symbols-outlined text-base">speed</span>
              <span>Session RPE Entry</span>
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
            className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-[#2a313d] text-on-surface font-headline-md text-headline-md uppercase transition-colors"
          >
            <span className="material-symbols-outlined text-base">post_add</span>
            <span>+ Manual Post-Practice Log</span>
          </button>
        </div>
      </div>

      {/* URGENT NEEDS ATTENTION (ALERT ROSTER SECTION) */}
      <div className="mt-space-lg flex flex-col gap-space-sm">
        <div className="flex items-center justify-between flex-wrap gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <div className="flex items-center gap-1.5 px-space-sm py-1 rounded bg-error-container border border-error/30 text-error font-label-md text-label-md uppercase">
              <span className="material-symbols-outlined text-sm">notification_important</span>
              <span>URGENT NEEDS ATTENTION ({unresolved.length} ATHLETES)</span>
            </div>
            <span className="font-body-sm text-body-sm text-dim hidden sm:inline">Athletes flagged by the system</span>
          </div>
          <div className="flex items-center gap-space-sm">
            {unresolved.length > 0 && (
              <button onClick={() => setScreen('alerts')} className="px-space-sm py-1 rounded bg-surface-container hover:bg-surface-container-high border border-[#2a313d] font-label-md text-label-md uppercase text-primary transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">send</span>
                <span>View All In Alerts</span>
              </button>
            )}
          </div>
        </div>

        {/* Alert Athletes List */}
        <div className="grid grid-cols-1 gap-space-xs">
          {unresolved.length === 0 ? (
            <div className="p-space-md rounded-xl bg-surface-container border border-[#2a313d] flex items-center gap-2 shadow-sm">
              <CheckCircle size={20} className="text-status-success" />
              <span className="font-body-md text-body-md text-on-surface">All athletes are currently within safe baseline and sleep limits.</span>
            </div>
          ) : (
            unresolved.slice(0, 5).map(item => {
              const initials = item.athlete_name ? item.athlete_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
              const status = alertStatusFor(item.alert_key);
              const isUrgent = item.color === '#ef4444' || item.streak >= 2;
              
              return (
                <div key={item.id} onClick={() => { setSelectedProfileId(item.athlete_id); fetchProfileData(item.athlete_id); setProfileEntryScreen?.(null); setScreen('profiles'); }} className={`p-space-md rounded-xl bg-surface-container hover:bg-surface-container-high border ${isUrgent ? 'border-error/40' : 'border-[#2a313d]'} transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-space-md shadow-sm cursor-pointer`}>
                  <div className="flex items-start sm:items-center gap-space-md">
                    <div className="w-12 h-12 rounded-lg bg-surface-container-high border border-[#2a313d] text-primary flex items-center justify-center font-headline-lg text-headline-lg shrink-0">
                      {initials}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-space-xs flex-wrap">
                        <span className="font-headline-md text-headline-md uppercase text-on-surface tracking-wide">{item.athlete_name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container-high border border-[#2a313d] font-label-sm text-label-sm text-on-surface-variant uppercase">{item.sport || 'General'}</span>
                        
                        <span className={`px-1.5 py-0.5 rounded ${isUrgent ? 'bg-error-container border-error/30 text-error' : 'bg-primary/15 border-primary/30 text-primary'} border font-label-sm text-label-sm uppercase font-bold flex items-center gap-1`}>
                          {isUrgent && <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>}
                          {item.type} {item.streak >= 2 && `(${item.streak}-DAY)`}
                        </span>
                        
                        {status === 'acknowledged' && (
                          <span className="px-1.5 py-0.5 rounded bg-surface-container-high border border-[#2a313d] text-amber-500 font-label-sm text-label-sm uppercase font-bold">
                            ACKNOWLEDGED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-space-md mt-1 font-body-sm text-body-sm text-on-surface-variant">
                        <span>{item.message}</span>
                        {item.action && (
                          <span className={`${isUrgent ? 'text-error' : 'text-primary'} font-bold`}>{item.action}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs flex-wrap self-end lg:self-center">
                    <button className="px-space-sm py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest border border-[#2a313d] text-on-surface font-label-md text-label-md uppercase transition-colors" onClick={(e) => { e.stopPropagation(); setScreen('alerts'); }}>
                      Review
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Split 2-Column Analytical Insights Grid */}
      <div className="mt-space-lg grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left Column: Load & Readiness */}
        <div className="lg:col-span-6 flex flex-col gap-space-md">
          <div className="p-space-md rounded-xl bg-surface-container border border-[#2a313d] shadow-sm flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between pb-space-xs">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-base">monitoring</span>
                  <span className="font-headline-md text-headline-md uppercase text-on-surface">TODAY'S INTERNAL TRAINING LOAD &amp; READINESS</span>
                </div>
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-secondary-container text-secondary border border-secondary/30 uppercase font-bold">
                  {todaysRpeLogs.length === 0 ? 'NO SESSIONS LOGGED YET' : `${respondedIds.size} of ${athletes.length} REPORTED · ${rpeRate}% · AVG ${avgRpe}`}
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Aggregated Rated Perceived Exertion (sRPE) &amp; biometric exertion telemetry across training zones.</p>
              
              {/* RPE Distribution Visualization */}
              <div className="mt-space-md grid grid-cols-2 gap-space-sm">
                {rpeBySport.length === 0 ? (
                  <div className="col-span-2 text-center text-dim font-body-md py-4">No sports active on roster.</div>
                ) : (
                  rpeBySport.map(s => {
                    const none = s.logCount === 0;
                    return (
                      <div key={s.sport} data-testid="rpe-sport-card" data-sport={s.sport} onClick={() => { setSelectedSportFilter(s.sport); setScreen('athletes'); }} className="p-space-sm rounded-lg bg-[#0e182a] border border-[#2a313d] cursor-pointer hover:border-primary/50 transition-colors">
                        <div className="flex items-start justify-between gap-space-xs">
                          <div className="flex flex-col min-w-0">
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase truncate" title={s.sport}>{s.sport}</span>
                            <span className="font-body-sm text-body-sm text-dim">
                              {s.logCount === 0 ? `${s.rosterCount} Athletes Listed` : `${s.logCount} Session${s.logCount !== 1 ? 's' : ''} Logged`}
                            </span>
                          </div>
                          {s.hard > 0 ? (
                            <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded border font-bold whitespace-nowrap bg-error-container border-error/30 text-error">
                              {s.hard} HARD
                            </span>
                          ) : (
                            <span className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded border font-bold whitespace-nowrap ${none ? 'bg-surface-container-high border-[#2a313d] text-dim' : 'bg-primary/20 border-primary/30 text-primary'}`}>
                              {none ? 'No Data' : (s.isHard ? 'Heavy Load' : 'Moderate/Recovery')}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-space-md">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-label-sm text-[10px] text-dim uppercase tracking-widest">TEAM AVG RPE</span>
                            <span className={`font-metric-val text-metric-val ${none ? 'text-dim' : (s.isHard ? 'text-error' : 'text-primary')}`}>
                              {none ? '—' : s.avg.toFixed(1)} <span className="font-body-sm text-body-sm text-dim">/ {settings.rpeScaleMax || 10}</span>
                            </span>
                          </div>
                          <div className="w-px h-9 bg-[#2a313d]" />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-label-sm text-[10px] text-dim uppercase tracking-widest">LOG RESPONSE RATE</span>
                            <span className="font-metric-val text-metric-val text-on-surface">{s.pct}%</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-end gap-1 h-14">
                           {(() => {
                             const last7Days = Array.from({ length: 7 }, (_, i) => {
                               const d = new Date();
                               d.setDate(d.getDate() - (6 - i));
                               return getCentralDateString(d);
                             });
                             const allRpeLogs = (reportData || []).filter(isRpeLog);
                             const sportWeekLogs = allRpeLogs.filter(r => sportOf(r) === s.sport);
                             return last7Days.map((dateStr, i) => {
                               const dayLogs = sportWeekLogs.filter(r => r.created_at && getCentralDateString(new Date(r.created_at)) === dateStr);
                               const dayAvg = dayLogs.length > 0 ? (dayLogs.reduce((acc, r) => acc + (r.rpe || 0), 0) / dayLogs.length) : null;
                               
                               if (dayAvg == null) {
                                 return <div key={i} className="w-full bg-transparent rounded-sm h-2"></div>;
                               }
                               
                               const pct = Math.min(100, (dayAvg / (settings.rpeScaleMax || 10)) * 100);
                               const barColor = dayAvg >= settings.rpeHighThreshold ? 'bg-[#f87171]' : (dayAvg >= Math.max(0, settings.rpeHighThreshold - 2) ? 'bg-[#b89c5b]' : 'bg-[#172338]');
                               return <div key={i} className={`w-full ${barColor} rounded-sm`} style={{ height: `${pct}%` }}></div>;
                             });
                           })()}
                        </div>
                        <span className="mt-1 block font-body-sm text-body-sm text-dim text-right">
                          {s.responded}/{s.rosterCount} athletes reported
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Weigh-ins Remaining by Sport */}
        <div className="lg:col-span-6 flex flex-col gap-space-md">
          <div className="p-space-md rounded-xl bg-surface-container border border-[#2a313d] shadow-sm flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between pb-space-xs">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-base">fact_check</span>
                  <span className="font-headline-md text-headline-md uppercase text-on-surface">WEIGH-INS REMAINING BY SPORT</span>
                </div>
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary font-bold">{athletesRecordedToday.size} OF {athletes.length} LOGGED</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Mandatory hydration &amp; baseline tracking accountability per athletic department directive.</p>
              
              {/* Sport Group Bars */}
              <div className="mt-space-md flex flex-col gap-space-md">
                {allSports.length === 0 ? (
                   <span className="text-dim font-body-md py-4">No sports active on roster.</span>
                ) : (
                   allSports.map(sport => {
                     const sportAthletes = athletes.filter(a => (a.sport || 'General') === sport);
                     const doneCount = sportAthletes.filter(a => athletesRecordedToday.has(a.id)).length;
                     const pct = sportAthletes.length > 0 ? Math.round((doneCount / sportAthletes.length) * 100) : 0;
                     
                     return (
                      <div key={sport} className="flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setSelectedSportFilter(sport); setScreen('athletes'); }}>
                        <div className="flex justify-between items-center text-on-surface font-label-md text-label-md">
                          <span className="uppercase">{sport}</span>
                          <span className={`font-mono font-semibold ${pct === 100 ? 'text-status-success' : (pct > 0 ? 'text-primary' : 'text-dim')}`}>
                            {doneCount} of {sportAthletes.length} logged ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-[#0e182a] border border-[#2a313d]/60 rounded-full h-3 overflow-hidden">
                          <div className={`${pct === 100 ? 'bg-status-success' : 'bg-primary'} h-3 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                     );
                   })
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
