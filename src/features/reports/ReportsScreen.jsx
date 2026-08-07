import { useState } from 'react';
import { Printer, Zap, Sliders, Filter, CheckSquare, Square, AlertTriangle, Activity, Shield, Trash2 } from 'lucide-react';
import { getAthleteBaseline, getCentralDateString } from '../../utils/athleteData';

const LOG_TABLE_PAGE_SIZE = 250;

export default function ReportsScreen({
  reportData,
  reportSportFilter,
  reportTimeframe,
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
  showReportsLogAccordion,
  setShowReportsLogAccordion,
  handleMakeDateBaselineMarker,
  handleDeleteWeighIn
}) {
  // Incremental rendering for the raw log table - with months of data it was mounting
  // thousands of DOM rows at once, which crawls on older iPads.
  const [visibleLogRows, setVisibleLogRows] = useState(LOG_TABLE_PAGE_SIZE);

  // 1. Filter logs
  let filteredLogs = [...reportData];
  if (reportSportFilter !== 'ALL') {
    filteredLogs = filteredLogs.filter(r => r.sport === reportSportFilter);
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
  }

  const filteredAthletes = reportSportFilter === 'ALL' ? athletes : athletes.filter(a => a.sport === reportSportFilter);

  // 2. Dehydration Roster (LIVE status: Latest weigh-in vs Official Baseline, >=2% drop)
  const dehydrationList = [];
  filteredAthletes.forEach(a => {
    const aRecs = reportData.filter(x => x.athlete_id === a.id && x.weight_lbs && Number(x.weight_lbs) > 0).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
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
      if (dropPercent >= (dehydrationThreshold / 100)) {
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
  const expiredBaselinesList = [];
  filteredAthletes.forEach(a => {
    const aRecs = reportData.filter(r => r.athlete_id === a.id).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
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

  // 5. Weight Fluctuation Leaderboard (weight-carrying logs only - sleep-only logs with
  // weight 0/null used to register as huge bogus "drops" like 185 -> 0 lbs)
  const gains = [];
  filteredAthletes.forEach(a => {
    const aRecs = reportData.filter(r => r.athlete_id === a.id && r.weight_lbs && Number(r.weight_lbs) > 0).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
    if (aRecs.length >= 2) {
      const first = aRecs[0];
      const latest = aRecs[aRecs.length - 1];
      const diff = latest.weight_lbs - first.weight_lbs;
      gains.push({
        athlete_name: a.name,
        sport: a.sport,
        initial_weight: first.weight_lbs,
        latest_weight: latest.weight_lbs,
        diff
      });
    }
  });
  const topGains = [...gains].sort((a,b) => b.diff - a.diff).slice(0, 5);
  const topDrops = [...gains].sort((a,b) => a.diff - b.diff).slice(0, 5);

  // Toggles
  const showTeamSummary = reportMode === 'quick' || enabledMetrics.teamSummary;
  const showAcuteSweatLoss = reportMode === 'quick' || enabledMetrics.acuteSweatLoss;
  const showDehydration = reportMode === 'quick' || enabledMetrics.dehydration;
  const showSleepDeficit = reportMode === 'quick' || enabledMetrics.sleepDeficit;
  const showExpiredBaselines = reportMode === 'quick' || enabledMetrics.expiredBaselines;
  const showLeaderboard = reportMode === 'custom' && enabledMetrics.weightLeaderboard;
  const showRawLogs = reportMode === 'custom' ? enabledMetrics.rawLogs : true;

  const toggleMetric = (key) => {
    setEnabledMetrics(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="animate-slide-up report-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title & Action Buttons Header */}
      <div className="report-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div className="report-header-text">
          <div className="no-print" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALYTICS &middot; HUMAN PERFORMANCE</div>
          <img src="/logo1.png" alt="Human Performance - Shiloh Christian" className="only-print report-print-logo" style={{ display: 'none', height: '46px', width: 'auto', marginBottom: '10px' }} />
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {reportMode === 'quick' ? '⚡ QUICK PRIORITY READINESS REPORT' : '⚙️ CUSTOM METRIC PERFORMANCE REPORT'}
          </h1>
          <div className="no-print" style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {reportMode === 'quick' ? 'High-priority performance indicators (Dehydration risk, sleep deficits, baseline audits).' : 'Customized metric view tailored for coaching analysis.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginLeft: 'auto' }}>
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
              <option value="all">TIMEFRAME: ALL TIME</option>
              <option value="today">TIMEFRAME: TODAY</option>
              <option value="7d">TIMEFRAME: LAST 7 DAYS</option>
              <option value="30d">TIMEFRAME: LAST 30 DAYS</option>
            </select>
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
                { key: 'teamSummary', label: 'Team Readiness Summary', desc: 'Overview stats & readiness scores' },
                { key: 'acuteSweatLoss', label: 'Acute Sweat Loss', desc: 'Post-practice negative sweat drop' },
                { key: 'dehydration', label: 'Dehydration Roster', desc: `Athletes dropping ≥${dehydrationThreshold}% weight` },
                { key: 'sleepDeficit', label: 'Sleep Deficit Roster', desc: `Athletes logging <${sleepThreshold}h sleep` },
                { key: 'weightLeaderboard', label: 'Weight Leaderboard', desc: 'Top weight gains & drops' },
                { key: 'rawLogs', label: 'Log History Table', desc: 'Chronological weigh-in table' },
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
          {showAcuteSweatLoss && renderNegativeSweatDropCards(true)}
          {/* Section 2: Priority Dehydration Roster */}
          {showDehydration && (
            <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--status-error)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={20} style={{ color: 'var(--status-error)' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    DEHYDRATION & MASS DROP RISK (≥{dehydrationThreshold}% MASS LOSS)
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="no-print" style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                      onClick={() => setDehySortBy('drop')}
                      style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: dehySortBy === 'drop' ? 'var(--status-error)' : 'transparent', color: dehySortBy === 'drop' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
                    >
                      SORT: DROP %
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
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Clean! No athletes currently showing ≥{dehydrationThreshold}% body mass drops.</div>
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
                        return (b.drop_percent || 0) - (a.drop_percent || 0);
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

          {/* Section 4: Expired Baselines Roster */}
          {showExpiredBaselines && (
            <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--color-accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Shield size={20} style={{ color: 'var(--color-accent)' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    EXPIRED BASELINE AUDIT (&gt;{baselineExpiryDays} DAYS INACTIVE)
                  </h3>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)' }}>{expiredBaselinesList.length} ATHLETES NEED BASELINE</span>
              </div>

              {expiredBaselinesList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>All active athletes have logged weight within the last {baselineExpiryDays} days!</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(59, 130, 246, 0.1)', borderBottom: '1px solid rgba(59, 130, 246, 0.3)' }}>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>ATHLETE</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>SPORT / TEAM</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>INACTIVITY STATUS</th>
                        <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>LAST LOGGED DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiredBaselinesList.map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport} &middot; {item.team}</td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--color-accent)' }}>{item.status}</td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.last_date || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section 5: Weight Leaderboard (Custom Mode) */}
          {showLeaderboard && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📈 TOP WEIGHT GAINS (SEASON PROGRESSION)
                </h3>
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
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📉 TOP WEIGHT DROPS (MASS CUTS / LOSSES)
                </h3>
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

          {/* Section 6: Chronological Raw Log Table - excluded from Export to PDF (see
              print-summary-only rules in styles.css): it's the whole point of the on-screen
              report, but a 300+ row table isn't "summary" material for a printed handout, and
              it's what was single-handedly blowing the PDF out to a dozen pages. Still fully
              visible/scrollable on screen, and available via Settings > Export CSV. */}
          {showRawLogs && (
            <div className="card-glass no-print" style={{ overflow: 'hidden' }}>
              <div
                onClick={() => setShowReportsLogAccordion(!showReportsLogAccordion)}
                className="no-print"
                style={{ padding: '16px 24px', borderBottom: showReportsLogAccordion ? '1px solid var(--color-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', transition: 'background 0.2s' }}
                title="Click to expand or compress the table view"
              >
                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📑 CHRONOLOGICAL WEIGH-IN LOG HISTORY ({filteredLogs.length} RECORDS)</span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', background: 'rgba(184, 156, 91, 0.15)', padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--color-accent)' }}>
                  {showReportsLogAccordion ? '▼ HIDE TABLE' : '▲ SHOW TABLE'}
                </span>
              </div>

              <div className="only-print" style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'none' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                  CHRONOLOGICAL WEIGH-IN LOG HISTORY ({filteredLogs.length} RECORDS)
                </span>
              </div>

              {showReportsLogAccordion && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)' }}>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>ATHLETE</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>SPORT / TEAM</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>LATEST WEIGHT</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>LATEST SLEEP</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>LOG DATE</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', width: '60px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.slice(0, visibleLogRows).map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '16px', fontWeight: 600 }}>{log.athlete_name}</td>
                          <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{log.sport || 'N/A'}</td>
                          <td style={{ padding: '16px', fontWeight: 700, color: 'var(--color-accent)' }}>
                            {log.weight_lbs && Number(log.weight_lbs) > 0 ? `${log.weight_lbs} lbs` : <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>😴 Sleep Only</span>}
                          </td>
                          <td style={{ padding: '16px', fontWeight: 700, color: (log.sleep_hrs != null && log.sleep_hrs > 0 && log.sleep_hrs < sleepThreshold) ? 'var(--status-error)' : 'var(--color-text)' }}>
                            {log.sleep_hrs ? `${log.sleep_hrs} hrs` : '-'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            {new Date(log.created_at).toLocaleDateString()}
                          </td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                {log.weight_lbs && Number(log.weight_lbs) > 0 ? (
                                  log.is_baseline ? (
                                    <span style={{ fontSize: '10px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', padding: '4px 10px', borderRadius: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                      ⭐ BASELINE
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleMakeDateBaselineMarker(log.id, log.athlete_id, log.weight_lbs, new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), log.athlete_name)}
                                      className="no-print"
                                      style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}
                                      title="Make this specific date the official baseline marker"
                                    >
                                      📍 MAKE BASELINE
                                    </button>
                                  )
                                ) : null}
                                <button onClick={() => handleDeleteWeighIn(log.id)} className="no-print" style={{ background: 'transparent', border: 'none', color: 'var(--status-error)', cursor: 'pointer', padding: '4px' }}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredLogs.length > visibleLogRows && (
                    <div className="no-print" style={{ padding: '14px', display: 'flex', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <button
                        type="button"
                        onClick={() => setVisibleLogRows(v => v + LOG_TABLE_PAGE_SIZE)}
                        style={{ padding: '10px 24px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.15)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        ▼ SHOW {Math.min(LOG_TABLE_PAGE_SIZE, filteredLogs.length - visibleLogRows)} MORE ({filteredLogs.length - visibleLogRows} remaining)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
