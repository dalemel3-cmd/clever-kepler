import { Printer, Zap, Sliders, Filter, CheckSquare, Square, AlertTriangle, Activity, Shield, Download, User } from 'lucide-react';
import { SessionLoadSection } from './SessionLoadSection';
import { getAthleteBaseline, getCentralDateString, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';

export default function ReportsScreen({
  settings,
  reportData,
  reportSportFilter,
  reportTimeframe,
  reportRangeStart,
  setReportRangeStart,
  reportRangeEnd,
  setReportRangeEnd,
  reportAthleteFilter,
  setReportAthleteFilter,
  athletes,
  dehydrationThreshold,
  sleepThreshold,
  baselineExpiryDays,
  reportMode,
  enabledMetrics,
  setEnabledMetrics,
  setReportMode,
  setReportSportFilter,
  setReportTimeframe,
  sportsList,
  reportLoading,
  renderNegativeSweatDropCards,
  dehySortBy,
  setDehySortBy,
  alertStatusMap
}) {

  // 1. Filter logs
  let filteredLogs = [...reportData];
  if (reportSportFilter !== 'ALL') {
    filteredLogs = filteredLogs.filter(r => r.sport === reportSportFilter);
  }
  if (reportAthleteFilter !== 'ALL') {
    filteredLogs = filteredLogs.filter(r => r.athlete_id === reportAthleteFilter);
  }
  const now = new Date();
  if (reportTimeframe === 'today') {
    const todayCentralStr = getCentralDateString(now);
    filteredLogs = filteredLogs.filter(r => getCentralDateString(new Date(r.created_at)) === todayCentralStr);
  } else if (reportTimeframe === '7d') {
    const cut = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filteredLogs = filteredLogs.filter(r => new Date(r.created_at) >= cut);
  } else if (reportTimeframe === '30d') {
    const cut = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    filteredLogs = filteredLogs.filter(r => new Date(r.created_at) >= cut);
  } else if (reportTimeframe === 'range' && (reportRangeStart || reportRangeEnd)) {
    const startBound = reportRangeStart ? new Date(reportRangeStart + 'T00:00:00') : null;
    const endBound = reportRangeEnd ? new Date(reportRangeEnd + 'T23:59:59') : null;
    filteredLogs = filteredLogs.filter(r => {
      const t = new Date(r.created_at);
      if (startBound && t < startBound) return false;
      if (endBound && t > endBound) return false;
      return true;
    });
  }

  const filteredAthletes = (reportSportFilter === 'ALL' ? athletes : athletes.filter(a => a.sport === reportSportFilter))
    .filter(a => reportAthleteFilter === 'ALL' || a.id === reportAthleteFilter);

  // 2. Dehydration Roster (LIVE status: Latest weigh-in vs Official Baseline, >=2% drop)
  // Post-practice sweat-check logs are excluded - comparing those against baseline
  // false-flags every athlete as dehydrated after a normal practice (same fix already
  // applied on Dashboard and in the Alerts daily-alert computation).
  const dehydrationList = [];
  filteredAthletes.forEach(a => {
    const aRecs = reportData.filter(x => x.athlete_id === a.id && x.weight_lbs && Number(x.weight_lbs) > 0 && !isPostPracticeLog(x) && !isRpeLog(x)).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
    if (aRecs.length === 0) return;
    const latestLog = aRecs[aRecs.length - 1];

    const baseInfo = getAthleteBaseline(a, reportData);
    const activeBaseline = baseInfo ? { id: baseInfo.id, weight_lbs: baseInfo.weight_lbs } : null;
    const baselineDateStr = baseInfo ? baseInfo.date_str : 'Established';

    if (activeBaseline && activeBaseline.weight_lbs && latestLog.weight_lbs) {
      const baseW = Number(activeBaseline.weight_lbs);
      const currW = Number(latestLog.weight_lbs);
      const drop = baseW - currW;
      const dropPercent = drop / baseW;
      if (drop > dehydrationThreshold) {
        dehydrationList.push({
          id: latestLog.id,
          athlete_name: a.name,
          sport: a.sport || 'N/A',
          prev_weight: baseW,
          baseline_date: baselineDateStr,
          curr_weight: currW,
          drop_lbs: drop,
          drop_percent: (dropPercent * 100).toFixed(1),
          date: new Date(latestLog.created_at).toLocaleDateString()
        });
      }
    }
  });

  // 3. Sleep Deficit Roster (<sleepThreshold h)
  const sleepDeficitList = filteredLogs.filter(r => r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold);

  // 4. Expired Baselines (>baselineExpiryDays Inactivity)
  // A baseline expires from lack of weigh-ins, so only weight-carrying logs count as
  // activity here. Session RPE entries have no weight - letting them count made an
  // athlete who logs RPE but never steps on the scale look permanently current, so their
  // stale baseline never surfaced.
  const expiredBaselinesList = [];
  filteredAthletes.forEach(a => {
    const aRecs = reportData.filter(r => r.athlete_id === a.id && !isRpeLog(r) && r.weight_lbs && Number(r.weight_lbs) > 0).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
    if (aRecs.length === 0) {
      expiredBaselinesList.push({ athlete_name: a.name, sport: a.sport, team: a.team, status: 'No Weight Log Yet' });
    } else {
      const lastLog = aRecs[aRecs.length - 1];
      const gapDays = Math.floor((now - new Date(lastLog.created_at)) / (1000 * 60 * 60 * 24));
      if (gapDays >= baselineExpiryDays) {
        expiredBaselinesList.push({ athlete_name: a.name, sport: a.sport, team: a.team, status: `${gapDays} Days Inactive`, last_date: new Date(lastLog.created_at).toLocaleDateString() });
      }
    }
  });

  // 5. Weight Fluctuation Leaderboard - week-over-week, not season-long. Latest weigh-in
  // vs. the most recent weigh-in from 7+ days before it (weight-carrying logs only -
  // sleep-only logs with weight 0/null used to register as huge bogus "drops" like
  // 185 -> 0 lbs; post-practice sweat checks are excluded too, or a normal fluid loss
  // reads as a week of weight loss).
  const gains = [];
  filteredAthletes.forEach(a => {
    const aRecs = reportData.filter(r => r.athlete_id === a.id && r.weight_lbs && Number(r.weight_lbs) > 0 && !isPostPracticeLog(r) && !isRpeLog(r)).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
    if (aRecs.length === 0) return;
    const latest = aRecs[aRecs.length - 1];
    const weekAgoCutoff = new Date(latest.created_at).getTime() - 7 * 24 * 60 * 60 * 1000;
    const priorLogs = aRecs.filter(r => r !== latest && new Date(r.created_at).getTime() <= weekAgoCutoff);
    if (priorLogs.length === 0) return;
    const weekAgo = priorLogs[priorLogs.length - 1];
    const diff = latest.weight_lbs - weekAgo.weight_lbs;
    gains.push({
      athlete_name: a.name,
      sport: a.sport,
      initial_weight: weekAgo.weight_lbs,
      latest_weight: latest.weight_lbs,
      diff
    });
  });
  const topGains = [...gains].sort((a,b) => b.diff - a.diff).slice(0, 5);
  const topDrops = [...gains].sort((a,b) => a.diff - b.diff).slice(0, 5);

  // 7. Case-file: full alert lifecycle history for a single selected athlete (audit trail —
  // when each alert fired, and whether/when/who resolved it).
  const caseFileAthlete = reportAthleteFilter !== 'ALL' ? athletes.find(a => a.id === reportAthleteFilter) : null;
  const caseFileHistory = caseFileAthlete
    ? Object.values(alertStatusMap || {})
        .filter(s => s.athlete_id === reportAthleteFilter)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    : [];

  // Toggles
  const showAcuteSweatLoss = reportMode === 'quick' || enabledMetrics.acuteSweatLoss;
  const showDehydration = reportMode === 'quick' || enabledMetrics.dehydration;
  const showSleepDeficit = reportMode === 'quick' || enabledMetrics.sleepDeficit;
  const showExpiredBaselines = reportMode === 'quick' || enabledMetrics.expiredBaselines;
  const showLeaderboard = reportMode === 'custom' && enabledMetrics.weightLeaderboard;
  const showSessionLoad = settings.enableRpe && (reportMode === 'quick' || enabledMetrics.sessionLoad !== false);

  const toggleMetric = (key) => {
    setEnabledMetrics(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const exportReportCSV = () => {
    const headers = ['Athlete', 'Sport', 'Weight (lbs)', 'Sleep (hrs)', 'Date'];
    if (settings.enableRpe) {
      headers.push('RPE', 'Session Minutes', 'Session Load', 'Session Label');
    }
    
    const rows = filteredLogs.map(log => {
      const row = [
        log.athlete_name || '', log.sport || '', log.weight_lbs || '', log.sleep_hrs || '',
        new Date(log.created_at).toLocaleString()
      ];
      if (settings.enableRpe) {
        row.push(
          log.rpe || '', 
          log.session_minutes || '', 
          (log.rpe && log.session_minutes) ? (log.rpe * log.session_minutes) : '',
          log.session_label || ''
        );
      }
      return row;
    });
    
    // Helper to escape CSV fields
    const escapeCSV = (field) => {
      if (field == null) return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Report_${reportSportFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-slide-up report-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title & Action Buttons Header */}
      <div className="report-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div className="report-header-text">
          <div className="no-print" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALYTICS &middot; HUMAN PERFORMANCE</div>
          <img src="/logo1.png" alt={`${settings.programName} - ${settings.organizationName}`} className="only-print report-print-logo" style={{ display: 'none', height: '46px', width: 'auto', marginBottom: '10px' }} />
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {reportMode === 'quick' ? '⚡ QUICK PRIORITY READINESS REPORT' : '⚙️ CUSTOM METRIC PERFORMANCE REPORT'}
          </h1>
          <div className="no-print" style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {reportMode === 'quick' ? 'High-priority performance indicators (Dehydration risk, sleep deficits, baseline audits).' : 'Customized metric view tailored for coaching analysis.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginLeft: 'auto' }}>
          <button
            onClick={exportReportCSV}
            className="no-print"
            style={{ padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, background: 'rgba(255,255,255,0.06)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '8px', cursor: 'pointer' }}
            title="Export the currently filtered log rows as CSV"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="btn-primary no-print"
            style={{ padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800 }}
          >
            <Printer size={16} /> Export to PDF
          </button>
        </div>
      </div>

      {/* Mode & Filters Toolbar (hidden in PDF print) */}
      <div className="card-glass no-print" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* Mode Switcher */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setReportMode('quick')}
              style={{
                padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
                background: reportMode === 'quick' ? 'var(--color-accent)' : 'transparent',
                color: reportMode === 'quick' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}
            >
              <Zap size={15} /> QUICK PRIORITY REPORT
            </button>
            <button
              onClick={() => setReportMode('custom')}
              style={{
                padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
                background: reportMode === 'custom' ? 'var(--color-accent)' : 'transparent',
                color: reportMode === 'custom' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}
            >
              <Sliders size={15} /> CUSTOM BUILDER
            </button>
          </div>

          {/* Dropdown Filters & Record Count */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '12px', fontWeight: 800, color: 'var(--white)' }}>
              TOTAL LOGS: {filteredLogs.length}
            </span>

            {/* Sport Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={14} style={{ color: 'var(--color-accent)' }} />
              <select
                value={reportSportFilter}
                onChange={e => setReportSportFilter(e.target.value)}
                style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="ALL">ALL SPORTS</option>
                {sportsList.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
              </select>
            </div>

            {/* Timeframe Filter */}
            <select
              value={reportTimeframe}
              onChange={e => setReportTimeframe(e.target.value)}
              style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              <option value="all">TIMEFRAME: ALL LOADED ({settings.dataWindowDays} DAYS)</option>
              <option value="today">TIMEFRAME: TODAY</option>
              <option value="7d">TIMEFRAME: LAST 7 DAYS</option>
              <option value="30d">TIMEFRAME: LAST 30 DAYS</option>
              <option value="range">TIMEFRAME: CUSTOM RANGE...</option>
            </select>

            {reportTimeframe === 'range' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="date"
                  value={reportRangeStart}
                  onChange={e => setReportRangeStart(e.target.value)}
                  style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', fontWeight: 600 }}
                />
                <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>to</span>
                <input
                  type="date"
                  value={reportRangeEnd}
                  onChange={e => setReportRangeEnd(e.target.value)}
                  style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', fontWeight: 600 }}
                />
              </div>
            )}

            {/* Athlete Filter — narrows the whole report to one athlete's case file */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={14} style={{ color: 'var(--color-accent)' }} />
              <select
                value={reportAthleteFilter}
                onChange={e => setReportAthleteFilter(e.target.value)}
                style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', maxWidth: '200px' }}
              >
                <option value="ALL">ALL ATHLETES</option>
                {athletes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Custom Metric Selector Panel */}
        {reportMode === 'custom' && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              SELECT METRICS & SECTIONS TO INCLUDE IN REPORT:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              {[
                { key: 'acuteSweatLoss', label: 'Acute Sweat Loss', desc: 'Post-practice negative sweat drop' },
                { key: 'dehydration', label: 'Dehydration Roster', desc: `Athletes down more than ${dehydrationThreshold} lbs` },
                { key: 'sleepDeficit', label: 'Sleep Deficit Roster', desc: `Athletes logging <${sleepThreshold}h sleep` },
                { key: 'weightLeaderboard', label: 'Weight Leaderboard', desc: 'Top weight gains & drops' },
                ...(settings.enableRpe ? [{ key: 'sessionLoad', label: 'Session Load', desc: 'Per-athlete RPE load & A:C ratio' }] : []),
              ].map(item => {
                const isSelected = enabledMetrics[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => toggleMetric(item.key)}
                    style={{
                      padding: '12px 14px', borderRadius: '8px',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.02)',
                      border: isSelected ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s'
                    }}
                  >
                    {isSelected ? <CheckSquare size={18} style={{ color: 'var(--color-accent)' }} /> : <Square size={18} style={{ color: 'var(--color-text-muted)' }} />}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--white)' : 'var(--color-text-muted)' }}>{item.label}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{item.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {reportLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading report data...</div>
      ) : (
        <>
          {/* Athlete Case File — full alert lifecycle audit trail for one athlete, only
              shown when the athlete filter narrows the report to a single person. This is
              the "show me every alert this athlete triggered" audit view. */}
          {caseFileAthlete && (
            <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #a78bfa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User size={20} style={{ color: '#a78bfa' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  CASE FILE: {caseFileAthlete.name} &middot; {caseFileHistory.length} ALERTS ON RECORD
                </h3>
              </div>
              {caseFileHistory.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No alert history recorded for this athlete.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(167, 139, 250, 0.1)', borderBottom: '1px solid rgba(167, 139, 250, 0.3)' }}>
                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#a78bfa' }}>ALERT TYPE</th>
                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#a78bfa' }}>STATUS</th>
                        <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#a78bfa' }}>LAST UPDATED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caseFileHistory.map((h, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>{h.alert_type}</td>
                          <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: h.status === 'resolved' ? 'var(--status-success)' : h.status === 'acknowledged' ? '#f59e0b' : 'var(--status-error)' }}>{h.status}</td>
                          <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(h.updated_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {showAcuteSweatLoss && renderNegativeSweatDropCards(true)}
          {/* Section 2: Priority Dehydration Roster */}
          {showDehydration && (
            <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--status-error)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={20} style={{ color: 'var(--status-error)' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      DEHYDRATION & MASS DROP RISK (&gt;{dehydrationThreshold} LBS DOWN)
                    </h3>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: '2px' }}>
                      Measured from each athlete's baseline date, not week-to-week - see "Baseline Weight (Date)" below.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="no-print" style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                      onClick={() => setDehySortBy('drop')}
                      style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: dehySortBy === 'drop' ? 'var(--status-error)' : 'transparent', color: dehySortBy === 'drop' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
                    >
                      SORT: LBS DOWN
                    </button>
                    <button
                      onClick={() => setDehySortBy('name')}
                      style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: dehySortBy === 'name' ? 'var(--color-accent)' : 'transparent', color: dehySortBy === 'name' ? 'var(--navy-950)' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
                    >
                      SORT: NAME
                    </button>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--status-error)' }}>{dehydrationList.length} ATHLETES AT RISK</span>
                </div>
              </div>

              {dehydrationList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Clean! No athletes currently down more than {dehydrationThreshold} lbs.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>ATHLETE</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>SPORT</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>BASELINE WEIGHT (DATE)</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>CURRENT WEIGHT</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>TOTAL DROP</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>LOG DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dehydrationList].sort((a, b) => {
                        if (dehySortBy === 'name') return (a.athlete_name || '').localeCompare(b.athlete_name || '');
                        return (b.drop_lbs || 0) - (a.drop_lbs || 0);
                      }).map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{item.prev_weight} lbs</span>
                            {item.baseline_date && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>({item.baseline_date})</span>}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--status-error)' }}>{item.curr_weight} lbs</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--status-error)' }}>
                            -{item.drop_lbs.toFixed(1)} lbs (-{item.drop_percent}%)
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Sleep Deficiency Roster */}
          {showSleepDeficit && (
            <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Activity size={20} style={{ color: '#f59e0b' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    CRITICAL SLEEP DEFICIENCY (&lt;{sleepThreshold} HOURS LOGGED)
                  </h3>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>{sleepDeficitList.length} LOGS AFFECTED</span>
              </div>

              {sleepDeficitList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Optimal CNS sleep scores recorded across all athletes!</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>ATHLETE</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>SPORT</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>SLEEP LOGGED</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>RECOMMENDED ACTION</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>LOG DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sleepDeficitList.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{item.sleep_hrs} hrs</td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Reduce High-Intensity CNS Volume</td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Expired Baselines - a compact per-sport name list rather than a
              full-width table. It's a housekeeping to-do, not an alert, so it shouldn't take
              more room on the printed handout than the alerts above it. */}
          {showExpiredBaselines && (
            <div className="card-glass" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '4px solid var(--color-accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={16} style={{ color: 'var(--color-accent)' }} />
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Baseline needed (no weigh-in in {baselineExpiryDays}+ days)
                  </h3>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)' }}>{expiredBaselinesList.length} ATHLETES</span>
              </div>
              {expiredBaselinesList.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Everyone has weighed in within the last {baselineExpiryDays} days.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(expiredBaselinesList.reduce((acc, item) => {
                    const key = item.sport || 'Unassigned';
                    (acc[key] = acc[key] || []).push(item);
                    return acc;
                  }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([sport, items]) => (
                    <div key={sport} style={{ fontSize: '12px', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 800, color: 'var(--color-accent)' }}>{sport} ({items.length}):</span>{' '}
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {items.map(item => `${item.athlete_name} (${item.last_date ? item.status.replace(' Days Inactive', 'd') : 'never'})`).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 5: Weight Leaderboard (Custom Mode) */}
          {showLeaderboard && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📈 TOP WEIGHT GAINS (WEEK-TO-WEEK)
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: '2px' }}>Latest weigh-in vs. 7+ days prior</div>
                </div>
                {topGains.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.athlete_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.sport} ({item.initial_weight} → {item.latest_weight} lbs)</div>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>+{item.diff.toFixed(1)} lbs</span>
                  </div>
                ))}
              </div>

              <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📉 TOP WEIGHT DROPS (WEEK-TO-WEEK)
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: '2px' }}>Latest weigh-in vs. 7+ days prior</div>
                </div>
                {topDrops.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.athlete_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.sport} ({item.initial_weight} → {item.latest_weight} lbs)</div>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444' }}>{item.diff.toFixed(1)} lbs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5d: Session Load Analytics (RPE) */}
          {showSessionLoad && (
            <SessionLoadSection
              athletes={filteredAthletes}
              reportData={reportData}
              filteredLogs={filteredLogs}
              settings={settings}
              scopeLabel={caseFileAthlete ? caseFileAthlete.name : (reportSportFilter === 'ALL' ? 'All Sports' : reportSportFilter)}
              singleAthlete={caseFileAthlete}
            />
          )}

        </>
      )}
    </div>
  );
}
