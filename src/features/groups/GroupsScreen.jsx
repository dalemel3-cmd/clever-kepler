import { getAthleteBaseline, isRpeLog, hasSleep } from '../../utils/athleteData';

export default function GroupsScreen({
  sportsList,
  showBulkBaselineStudio,
  setShowBulkBaselineStudio,
  bulkBaselineSport,
  setBulkBaselineSport,
  bulkBaselineDate,
  setBulkBaselineDate,
  athletes,
  reportData,
  handleBulkTeamBaseline,
  setSelectedSportFilter,
  setScreen,
  showToast,
  setTeamStatusSport,
  settings
}) {
  return (
    <div className="flex flex-col w-full pb-space-xl animate-slide-up">
      {/* Top Workspace Context & Action Bar */}
      <div className="flex flex-col gap-space-md pt-space-md mb-space-lg">
        {/* Breadcrumb & System Sub-header */}
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-space-xs font-label-md text-label-md uppercase tracking-wider text-text-muted">
              <span>Workspace</span>
              <span className="material-symbols-outlined text-sm text-text-muted">chevron_right</span>
              <span className="text-antique-gold font-bold">Sport Groups</span>
            </div>
            <h1 className="font-display text-headline-xl text-text-headline uppercase tracking-wide flex items-center gap-space-sm">
              Sport Groups & Readiness
              <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-collegiate-blue text-antique-gold border border-antique-gold/30 tracking-widest font-bold">
                {sportsList.length} SQUAD{sportsList.length !== 1 ? 'S' : ''} TRACKED
              </span>
            </h1>
            <p className="font-body-md text-body-md text-text-body max-w-2xl">
              Team-level biometric health, weigh-in compliance, internal training load, and squad baselines.
            </p>
          </div>
          {/* Quick Action Pill Buttons */}
          <div className="flex items-center flex-wrap gap-space-sm self-start sm:self-center">
            <div className="flex items-center gap-space-xs px-space-md py-space-sm rounded-xl bg-card-surface border border-card-border text-text-body font-label-md text-label-md uppercase tracking-wider">
              <span className="material-symbols-outlined text-antique-gold text-base">calendar_today</span>
              <span>Date: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <button
              onClick={() => setShowBulkBaselineStudio(!showBulkBaselineStudio)}
              className="flex items-center gap-space-xs px-space-md py-space-sm rounded-xl bg-antique-gold hover:bg-gold-hover text-antique-dark font-headline-md text-headline-md uppercase tracking-wider font-bold shadow-lg transition-all duration-150 active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">bolt</span>
              <span>{showBulkBaselineStudio ? 'Close Baseline Studio' : 'Bulk Team Baseline Studio'}</span>
            </button>
          </div>
        </div>
      </div>

      {showBulkBaselineStudio && (
        <div className="mb-space-lg p-space-lg bg-card-surface border border-antique-gold/40 rounded-xl flex flex-col gap-space-md animate-slide-up shadow-md">
          <div className="flex items-center gap-space-md">
            <div className="w-11 h-11 rounded-xl bg-antique-gold/20 border border-antique-gold flex items-center justify-center text-antique-gold shadow-[0_0_12px_rgba(184,156,91,0.3)]">
              <span className="material-symbols-outlined text-2xl">trending_up</span>
            </div>
            <div>
              <h3 className="font-display text-headline-lg font-bold m-0 text-antique-gold uppercase tracking-wide">
                Bulk Team Baseline Synchronization Studio
              </h3>
              <p className="font-body-sm text-body-sm text-text-muted mt-1">
                Select an entire sport team and designate a specific historical weigh-in date as their official baseline marker across all charts and dehydration alarms.
              </p>
            </div>
          </div>

          {(() => {
            const activeSport = bulkBaselineSport || (sportsList.length > 0 ? sportsList[0] : 'Football');
            const sportAthleteIds = new Set(athletes.filter(a => (a.sport || '').toLowerCase() === activeSport.toLowerCase()).map(a => a.id));
            const sportLogs = reportData.filter(l => sportAthleteIds.has(l.athlete_id) && l.weight_lbs && Number(l.weight_lbs) > 0);

            const dateGroups = {};
            sportLogs.forEach(l => {
              const dStr = l.created_at.slice(0, 10);
              if (!dateGroups[dStr]) dateGroups[dStr] = { date: dStr, logs: [], display: new Date(l.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) };
              dateGroups[dStr].logs.push(l);
            });
            const availableDates = Object.values(dateGroups).sort((a,b) => b.date.localeCompare(a.date));
            const selectedDateObj = availableDates.find(d => d.date === bulkBaselineDate) || availableDates[0];

            return (
              <div className="flex gap-space-md flex-wrap items-center justify-between bg-midnight/50 p-space-md rounded-xl border border-card-border">
                <div className="flex gap-space-md flex-wrap flex-1 min-w-[400px]">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                    <label className="font-label-md text-label-md font-bold text-text-muted uppercase tracking-wider">
                      1. SELECT SPORT GROUP
                    </label>
                    <select
                      value={activeSport}
                      onChange={(e) => { setBulkBaselineSport(e.target.value); setBulkBaselineDate(''); }}
                      className="p-2.5 bg-collegiate-dark border border-card-border rounded-lg text-text-headline font-body-md font-bold outline-none cursor-pointer"
                    >
                      {sportsList.map(s => (
                        <option key={s} value={s}>{s.toUpperCase()} ({athletes.filter(a => (a.sport || '').toLowerCase() === s.toLowerCase()).length} Athletes)</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                    <label className="font-label-md text-label-md font-bold text-text-muted uppercase tracking-wider">
                      2. SELECT HISTORICAL WEIGH-IN DATE
                    </label>
                    <select
                      value={selectedDateObj ? selectedDateObj.date : ''}
                      onChange={(e) => setBulkBaselineDate(e.target.value)}
                      disabled={availableDates.length === 0}
                      className={`p-2.5 bg-collegiate-dark border border-card-border rounded-lg font-body-md font-bold outline-none cursor-pointer ${availableDates.length > 0 ? 'text-text-headline' : 'text-text-muted'}`}
                    >
                      {availableDates.length > 0 ? (
                        availableDates.map(d => {
                          const avgW = Math.round(d.logs.reduce((s, x) => s + Number(x.weight_lbs), 0) / Math.max(1, d.logs.length));
                          return (
                            <option key={d.date} value={d.date}>
                              {d.display} ({d.logs.length} weighed in &middot; {avgW} lb avg)
                            </option>
                          );
                        })
                      ) : (
                        <option value="">No recorded weights for this sport yet</option>
                      )}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!selectedDateObj || selectedDateObj.logs.length === 0) {
                      showToast(`No weigh-in recordings found for ${activeSport} on the selected date.`, 'error');
                      return;
                    }
                    handleBulkTeamBaseline(activeSport, selectedDateObj.date, selectedDateObj.display, selectedDateObj.logs);
                  }}
                  disabled={!selectedDateObj}
                  className={`mt-4 sm:mt-0 flex items-center gap-space-xs px-space-md py-space-sm rounded-xl font-headline-md text-headline-md uppercase tracking-wider font-bold shadow transition-all duration-150 ${selectedDateObj ? 'bg-antique-gold hover:bg-gold-hover text-antique-dark shadow-[0_0_15px_rgba(184,156,91,0.4)] active:scale-95 cursor-pointer' : 'bg-card-border text-text-muted cursor-not-allowed'}`}
                >
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  <span>Set All of {activeSport.toUpperCase()} To {selectedDateObj ? selectedDateObj.date : 'Date'}</span>
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* 3x2 High Impact Team Readiness Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-lg w-full">
        {sportsList.filter(sport => athletes.some(a => (a.sport || '').toLowerCase() === sport.toLowerCase())).map(sport => {
          const sportAthletes = athletes.filter(a => (a.sport || '').toLowerCase() === sport.toLowerCase());

          let totalW = 0;
          let countW = 0;

          sportAthletes.forEach(a => {
            const baseInfo = getAthleteBaseline(a, reportData);
            let evalWeight = baseInfo ? baseInfo.weight_lbs : 0;
            if (!evalWeight) {
              const latestRecord = reportData
                .filter(r => r.athlete_id === a.id && r.weight_lbs && !isNaN(parseFloat(r.weight_lbs)) && parseFloat(r.weight_lbs) > 0)
                .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
              if (latestRecord) evalWeight = parseFloat(latestRecord.weight_lbs);
            }
            if (evalWeight > 0) {
              totalW += evalWeight;
              countW += 1;
            }
          });
          const avgW = countW > 0 ? Math.round(totalW / countW) : 0;

          const sportAthleteIds = new Set(sportAthletes.map(a => a.id));
          const sportLogs = reportData.filter(r => sportAthleteIds.has(r.athlete_id));
          const rpeLogs = sportLogs.filter(isRpeLog);
          const avgRpe = rpeLogs.length > 0 ? (rpeLogs.reduce((s, r) => s + (r.rpe || 0), 0) / rpeLogs.length) : 0;
          const sleepLogs = sportLogs.filter(hasSleep);
          const avgSleep = sleepLogs.length > 0 ? (sleepLogs.reduce((s, r) => s + Number(r.sleep_hrs), 0) / sleepLogs.length) : 0;

          return (
            <div
              key={sport}
              className="sport-card flex flex-col justify-between rounded-xl bg-card-surface border border-card-border hover:border-antique-gold/40 transition-all duration-200 shadow-md overflow-hidden relative group"
            >
              <div className="p-space-lg flex flex-col gap-space-md">
                {/* Top Status & Squad Monogram */}
                <div className="flex items-start justify-between gap-space-sm cursor-pointer" onClick={() => { setSelectedSportFilter(sport); setScreen('athletes'); }}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-space-xs">
                      <span className="font-display text-headline-lg text-text-headline uppercase tracking-wide">{sport}</span>
                    </div>
                  </div>
                </div>

                {/* Telemetry Matrix */}
                <div className="grid grid-cols-4 gap-space-xs p-space-sm rounded-lg bg-midnight border border-card-border/60">
                  <div className="flex flex-col cursor-pointer hover:bg-card-border/40 rounded p-1" onClick={() => { setSelectedSportFilter(sport); setScreen('athletes'); }}>
                    <span className="font-label-sm text-label-sm text-text-muted uppercase tracking-widest">Athletes</span>
                    <span className="font-metric-val text-metric-val text-text-headline">{sportAthletes.length}</span>
                    <span className="font-body-sm text-body-sm text-text-muted">Rostered</span>
                  </div>
                  <div className="flex flex-col cursor-pointer hover:bg-card-border/40 rounded p-1" onClick={() => { setTeamStatusSport(sport); setScreen('team-status'); }}>
                    <span className="font-label-sm text-label-sm text-text-muted uppercase tracking-widest">Avg Weight</span>
                    <span className={`font-metric-val text-metric-val ${avgW > 0 ? 'text-antique-gold' : 'text-card-border'}`}>{avgW > 0 ? avgW : '--'}</span>
                    <span className="font-body-sm text-body-sm text-text-muted">Pounds</span>
                  </div>
                  {settings.enableRpe ? (
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-text-muted uppercase tracking-widest">Avg RPE</span>
                      <span className={`font-metric-val text-metric-val ${avgRpe > 0 ? 'text-antique-gold' : 'text-card-border'}`}>{avgRpe > 0 ? avgRpe.toFixed(1) : '--'}</span>
                      <span className="font-body-sm text-body-sm text-text-muted">{avgRpe > 0 ? 'Active' : 'Unset'}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-text-muted uppercase tracking-widest">Avg RPE</span>
                      <span className="font-metric-val text-metric-val text-card-border">--</span>
                      <span className="font-body-sm text-body-sm text-text-muted">Disabled</span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-text-muted uppercase tracking-widest">Avg Sleep</span>
                    <span className={`font-metric-val text-metric-val ${avgSleep > 0 ? 'text-slate-accent' : 'text-card-border'}`}>{avgSleep > 0 ? avgSleep.toFixed(1) : '--'}</span>
                    <span className="font-body-sm text-body-sm text-text-muted">Hours</span>
                  </div>
                </div>
              </div>

              {/* Action Button Footer - stacked full-width (not a 3-up row): these
                  labels ("Weigh-In Status", "Set Team Baselines") don't fit a
                  third-width button without wrapping to multiple lines. */}
              <div className="p-space-md bg-collegiate-dark/60 border-t border-card-border/60 flex flex-col gap-space-sm">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedSportFilter(sport); setScreen('athletes'); }}
                  className="w-full flex items-center justify-center gap-space-xs py-space-sm px-space-md bg-collegiate-blue hover:bg-collegiate-blue/80 text-text-headline border border-card-border font-headline-md text-headline-md uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-lg">badge</span>
                  <span>View Roster</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setTeamStatusSport(sport); setScreen('team-status'); }}
                  className="w-full flex items-center justify-center gap-space-xs py-space-sm px-space-md bg-antique-gold hover:bg-gold-hover text-antique-dark font-headline-md text-headline-md uppercase tracking-wider rounded-lg transition-colors shadow font-bold whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-lg">assignment_turned_in</span>
                  <span>Weigh-In Status</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setBulkBaselineSport(sport); setBulkBaselineDate(''); setShowBulkBaselineStudio(true); }}
                  className="w-full flex items-center justify-center gap-space-xs py-space-sm px-space-md bg-transparent hover:bg-card-surface text-text-muted border border-card-border font-headline-md text-headline-md uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-lg">tune</span>
                  <span>Set Team Baselines</span>
                </button>
              </div>
            </div>
          );
        })}
        {sportsList.filter(sport => athletes.some(a => (a.sport || '').toLowerCase() === sport.toLowerCase())).length === 0 && (
          <div className="col-span-full text-center p-12 text-text-muted border border-card-border rounded-xl bg-card-surface/50">
            No sports currently tracked. Add athletes with sport tags to populate group statistics.
          </div>
        )}
      </div>

      {/* Bottom Global Summary Telemetry Bar */}
      {(() => {
        const activeSports = sportsList.filter(sport => athletes.some(a => (a.sport || '').toLowerCase() === sport.toLowerCase()));
        if (activeSports.length === 0) return null;
        return (
          <div className="mt-space-xl p-space-md rounded-xl bg-card-surface border border-card-border flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="flex items-center gap-space-xs text-antique-gold">
                <span className="material-symbols-outlined text-xl">hub</span>
                <span className="font-headline-md text-headline-md uppercase tracking-wider text-text-headline">Department Overview</span>
              </div>
              <div className="hidden sm:flex items-center gap-space-md font-label-md text-label-md text-text-muted border-l border-card-border pl-space-md">
                <span>Total Screened: <strong className="text-text-headline">{athletes.length} Athletes</strong></span>
                <span>Total Groups: <strong className="text-text-headline">{activeSports.length}</strong></span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
