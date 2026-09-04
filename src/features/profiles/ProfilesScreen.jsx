import { useState } from 'react';
import { User, Search, X, ArrowUpRight, ArrowUp, ArrowDown, ChevronLeft, ChevronDown, ChevronUp, RefreshCw, Plus, TrendingUp, Clock, Zap, Activity, Trash2, Pencil, Target } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { CustomTooltip } from '../../components/CustomTooltip';
import { isPostPracticeLog, getAthleteBaseline, getCentralDateString, getCentralTimeString, centralWallTimeToISO, hasWeight, isRpeLog } from '../../utils/athleteData';
import { TEST_TYPES, TEST_TYPE_BY_KEY, formatMetric } from '../analytics/SpeedPowerPanel';

// Best (per better:'asc'|'desc') result for one athlete/test_type out of their logged
// performance_tests rows. Mirrors the reduction SpeedPowerPanel uses for its
// leaderboards, so a roster card's "Best Vertical" always agrees with what Analytics
// shows for the same athlete.
const bestTestFor = (tests, athleteId, testKey) => {
  const tt = TEST_TYPE_BY_KEY[testKey];
  const rows = tests.filter(t => t.athlete_id === athleteId && t.test_type === testKey);
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => {
    if (!best) return r;
    const better = tt ? tt.better : 'asc';
    return (better === 'desc' ? Number(r.metric) > Number(best.metric) : Number(r.metric) < Number(best.metric)) ? r : best;
  }, null);
};

// Where an athlete's PB for one test type stands against the rest of the roster - both
// program-wide and within their own sport. Ranked on the same best-result reduction the
// leaderboards use, so "#4 overall" here always agrees with where they'd land on the
// Analytics board for the same test.
const rankAthleteForTest = (tests, roster, athlete, testKey) => {
  const bests = [];
  for (const a of roster) {
    const b = bestTestFor(tests, a.id, testKey);
    if (b) bests.push({ athleteId: a.id, value: Number(b.metric) });
  }
  if (bests.length === 0) return null;
  const tt = TEST_TYPE_BY_KEY[testKey];
  const sorted = bests.sort((a, b) => tt.better === 'desc' ? b.value - a.value : a.value - b.value);
  const overallRank = sorted.findIndex(x => x.athleteId === athlete.id) + 1;
  if (overallRank === 0) return null; // this athlete has no result for this test

  const sportIds = new Set(roster.filter(a => (a.sport || 'General') === (athlete.sport || 'General')).map(a => a.id));
  const sportSorted = sorted.filter(x => sportIds.has(x.athleteId));
  const sportRank = sportSorted.findIndex(x => x.athleteId === athlete.id) + 1;

  // Percentile where 100% = best on the roster, so "improve" always means "raise this
  // number" regardless of which test type is being looked at.
  const percentile = Math.round((1 - (overallRank - 1) / sorted.length) * 100);

  return { overallRank, overallTotal: sorted.length, sportRank, sportTotal: sportSorted.length, percentile };
};

export default function ProfilesScreen({
  settings,
  selectedProfileId,
  setSelectedProfileId,
  filteredAthletes,
  search,
  setSearch,
  sportsList,
  selectedSportFilter,
  setSelectedSportFilter,
  reportData,
  fetchProfileData,
  athletes,
  profileData,
  handleSelectAthleteForEntry,
  handleEditClick,
  setManualEntryForm,
  setShowManualEntryModal,
  handleMakeDateBaselineMarker,
  handleDeleteWeighIn,
  setConfirmModal,
  handleBackFromProfile,
  performanceTests,
  updatePerformanceTest,
  deletePerformanceTest
}) {
  // Every threshold below comes from Settings - no magic numbers in the UI.
  const sleepDeficitBelow = settings.sleepThreshold;
  const sleepRecoveryAt = settings.sleepRecoveryHours;
  const sleepOptimalAt = settings.sleepTargetHours;
  const sleepChartTarget = settings.sleepChartTargetHours;
  const sleepBand = (h) => (h >= sleepOptimalAt ? 'optimal' : h >= sleepDeficitBelow ? 'adequate' : 'deficit');
  if (!selectedProfileId) {
    return (
      <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Hub Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <User size={14} /> ATHLETE INTELLIGENCE DIRECTORY
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', margin: 0, lineHeight: 1.1 }}>
              PERFORMANCE & BIOMETRIC PROFILES
            </h1>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Select an athlete to evaluate body weight fluctuation trends, sleep recovery patterns, and historical log ledgers over time.
            </div>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)', background: 'rgba(184, 156, 91, 0.15)', padding: '6px 16px', borderRadius: '20px', border: '1px solid rgba(184, 156, 91, 0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {filteredAthletes.length} ATHLETES LISTED
          </span>
        </div>

        {/* Search and Sport Filter Row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 280px', display: 'flex', alignItems: 'center' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="input-glass"
              placeholder="Search profile by athlete name or position..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: '48px', padding: '0 38px 0 44px', fontSize: '14px' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['ALL', ...sportsList].map(sport => (
              <button
                key={sport}
                onClick={() => setSelectedSportFilter(sport)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  border: selectedSportFilter === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedSportFilter === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.02)',
                  color: selectedSportFilter === sport ? 'var(--navy-950)' : 'var(--color-text)',
                  transition: 'all 0.2s'
                }}
              >
                {sport}
              </button>
            ))}
          </div>
        </div>

        {/* Glowing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
          {filteredAthletes.map(a => {
            const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
            const colorIdx = a.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length;
            const avatarBg = avatarColors[colorIdx];

            const aLogs = reportData.filter(r => r.athlete_id === a.id).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
            const latestLog = aLogs[0];

            // Current weight + trend vs the weigh-in before it (weight-only rows -
            // RPE/sleep-only logs don't carry a weight to trend against).
            const weightLogs = aLogs.filter(hasWeight);
            const currentWeight = weightLogs[0];
            const previousWeight = weightLogs[1];
            const weightDeltaLbs = currentWeight && previousWeight
              ? Number(currentWeight.weight_lbs) - Number(previousWeight.weight_lbs)
              : null;

            // Best-result Speed & Power tiles. Vertical/Board Jump show the PB only;
            // Fly 10 also gets a trend, comparing the two most recent attempts (not the
            // two best) so it reads as "is this athlete getting faster right now",
            // matching the "up or down" framing used for weight above.
            const tests = performanceTests || [];
            const bestVertical = bestTestFor(tests, a.id, 'vertical_jump');
            const bestBoard = bestTestFor(tests, a.id, 'board_jump');
            const bestFly = bestTestFor(tests, a.id, '10yd_fly');
            const flyAttempts = tests
              .filter(t => t.athlete_id === a.id && t.test_type === '10yd_fly')
              .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
            const latestFly = flyAttempts[0];
            const prevFly = flyAttempts[1];
            const flyTrendPct = latestFly && prevFly && Number(prevFly.metric) > 0
              ? ((Number(latestFly.metric) - Number(prevFly.metric)) / Number(prevFly.metric)) * 100
              : null;

            return (
              <div
                key={a.id}
                onClick={() => { setSelectedProfileId(a.id); fetchProfileData(a.id); }}
                className="card-glass glow-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '16px',
                    background: avatarBg, border: '2px solid rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 800, fontSize: '20px', fontFamily: 'var(--font-display)',
                    flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}>
                    {a.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, margin: 0, color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600, marginTop: '2px', textTransform: 'uppercase' }}>
                      {a.sport || 'General'} &middot; {a.position || 'Athlete'}
                    </div>
                  </div>
                </div>

                {/* KPI mini grid: current weight + trend, and best Speed & Power results */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Current Weight</span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {currentWeight ? `${currentWeight.weight_lbs} lb` : (latestLog ? '😴 Sleep Only' : 'No logs')}
                      {weightDeltaLbs !== null && Math.abs(weightDeltaLbs) >= 0.1 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 800, color: weightDeltaLbs < 0 ? '#f87171' : '#34d399' }}>
                          {weightDeltaLbs < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          {Math.abs(weightDeltaLbs).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Best Vertical</span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--color-accent)', marginTop: '2px' }}>
                      {bestVertical ? formatMetric(bestVertical.metric, bestVertical.unit) : '--'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Best Fly 10</span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--color-accent)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {bestFly ? formatMetric(bestFly.metric, bestFly.unit) : '--'}
                      {flyTrendPct !== null && Math.abs(flyTrendPct) >= 0.5 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 800, color: flyTrendPct < 0 ? '#34d399' : '#f87171' }}>
                          {flyTrendPct < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                          {Math.abs(flyTrendPct).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Best Broad Jump</span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--color-accent)', marginTop: '2px' }}>
                      {bestBoard ? formatMetric(bestBoard.metric, bestBoard.unit) : '--'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {latestLog && latestLog.created_at ? `Active: ${new Date(latestLog.created_at).toLocaleDateString()}` : 'No history yet'}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    VIEW TRENDS <ArrowUpRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {filteredAthletes.length === 0 && (
          <div className="card-glass" style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            No athletes found matching "{search}". Try adjusting your search filters above.
          </div>
        )}
      </div>
    );
  }

  // SELECTED ATHLETE PROFILE DASHBOARD
  const athlete = athletes.find(a => a.id === selectedProfileId);
  if (!athlete) {
    return (
      <div className="card-glass" style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Selected athlete profile not found.</p>
        <button onClick={() => setSelectedProfileId(null)} className="btn-secondary" style={{ marginTop: '16px' }}>Return to Profiles</button>
      </div>
    );
  }

  const sortedLogs = [...profileData].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  const weightLogs = sortedLogs.filter(l => hasWeight(l) && !isPostPracticeLog(l) && !isRpeLog(l));
  const postPracticeLogs = sortedLogs.filter(l => hasWeight(l) && isPostPracticeLog(l) && !isRpeLog(l)).reverse();
  const sleepLogs = sortedLogs.filter(l => l.sleep_hrs && Number(l.sleep_hrs) > 0);
  const rpeLogs = sortedLogs.filter(isRpeLog);

  const latestWeight = weightLogs.length > 0 ? Number(weightLogs[weightLogs.length-1].weight_lbs) : null;
  const baseInfo = getAthleteBaseline(athlete, sortedLogs.length ? sortedLogs : reportData);
  const baselineWeight = baseInfo ? baseInfo.weight_lbs : (weightLogs.length > 0 ? Number(weightLogs[0].weight_lbs) : null);
  const weightDelta = (latestWeight && baselineWeight && weightLogs.length > 1) ? (latestWeight - baselineWeight) : 0;
  const maxWeight = weightLogs.length > 0 ? Math.max(...weightLogs.map(l => Number(l.weight_lbs))) : '--';
  const minWeight = weightLogs.length > 0 ? Math.min(...weightLogs.map(l => Number(l.weight_lbs))) : '--';

  const avgSleep = sleepLogs.length > 0 ? (sleepLogs.reduce((sum, l) => sum + Number(l.sleep_hrs), 0) / sleepLogs.length).toFixed(1) : '--';
  const maxSleep = sleepLogs.length > 0 ? Math.max(...sleepLogs.map(l => Number(l.sleep_hrs))) : '--';
  const deficitNights = sleepLogs.filter(l => Number(l.sleep_hrs) < sleepDeficitBelow).length;
  const recoveryScore = sleepLogs.length > 0 ? Math.round((sleepLogs.filter(l => Number(l.sleep_hrs) >= sleepRecoveryAt).length / sleepLogs.length) * 100) : null;
  // Night-to-night trend, same up/down-vs-previous framing as the weight card above -
  // "did last night improve" is a different question from "what's the average", and a
  // coach glancing at the card wants both.
  const latestSleep = sleepLogs.length > 0 ? Number(sleepLogs[sleepLogs.length - 1].sleep_hrs) : null;
  const prevSleep = sleepLogs.length > 1 ? Number(sleepLogs[sleepLogs.length - 2].sleep_hrs) : null;
  const sleepDelta = (latestSleep != null && prevSleep != null) ? Number((latestSleep - prevSleep).toFixed(1)) : null;

  const todayMs = new Date().getTime();
  const daysMs = (days) => days * 24 * 60 * 60 * 1000;
  const recentRpe = rpeLogs.filter(l => (todayMs - new Date(l.created_at).getTime()) <= daysMs(7));
  const chronicRpe = rpeLogs.filter(l => (todayMs - new Date(l.created_at).getTime()) <= daysMs(settings.rpeChronicWeeks * 7));
  
  const acuteLoad = recentRpe.reduce((sum, l) => sum + ((l.rpe || 0) * (l.session_minutes || 0)), 0);
  const chronicLoadTotal = chronicRpe.reduce((sum, l) => sum + ((l.rpe || 0) * (l.session_minutes || 0)), 0);
  const chronicAvgWeeklyLoad = settings.rpeChronicWeeks > 0 ? (chronicLoadTotal / settings.rpeChronicWeeks) : 0;
  const acRatio = chronicAvgWeeklyLoad > 0 ? (acuteLoad / chronicAvgWeeklyLoad).toFixed(2) : '--';
  const avgRpeNum = recentRpe.length > 0 ? (recentRpe.reduce((sum, l) => sum + (l.rpe || 0), 0) / recentRpe.length).toFixed(1) : '--';
  const isDangerSpike = acRatio !== '--' && Number(acRatio) >= settings.rpeLoadSpikeRatio;

  const daysAgo = sortedLogs.length > 0 && sortedLogs[sortedLogs.length-1].created_at ? Math.floor((new Date() - new Date(sortedLogs[sortedLogs.length-1].created_at)) / (1000 * 60 * 60 * 24)) : null;

  const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
  const colorIdx = athlete.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length;
  const avatarBg = avatarColors[colorIdx];

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Control & Switcher Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
        <div onClick={() => (handleBackFromProfile ? handleBackFromProfile() : setSelectedProfileId(null))} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em', background: 'rgba(184, 156, 91, 0.12)', padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(184, 156, 91, 0.3)', transition: 'all 0.2s' }}>
          <ChevronLeft size={16} /> ALL PROFILES / {athlete.name.toUpperCase()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={12} style={{ cursor: 'pointer' }} onClick={() => fetchProfileData(athlete.id)} title="Refresh Data" /> SWITCH ATHLETE:
          </span>
          <select
            className="input-glass"
            value={selectedProfileId}
            onChange={e => {
              if (e.target.value) {
                setSelectedProfileId(e.target.value);
                fetchProfileData(e.target.value);
              }
            }}
            style={{ height: '38px', padding: '0 16px', fontSize: '13px', borderRadius: '8px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', minWidth: '220px' }}
          >
            {athletes.slice().sort((a,b) => a.name.localeCompare(b.name)).map(a => (
              <option key={a.id} value={a.id} style={{ background: '#0a192f', color: '#fff' }}>
                {a.name.toUpperCase()} &bull; {a.sport || 'General'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hero Athlete Dossier Card */}
      <div className="card-glass glow-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '28px', border: '1px solid rgba(184, 156, 91, 0.3)', position: 'relative', overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.4)' }}>
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '280px', height: '280px', background: 'radial-gradient(circle, rgba(184, 156, 91, 0.12) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '88px', height: '88px', borderRadius: '20px', background: avatarBg, border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: 800, flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            {athlete.name.split(' ').map(n=>n[0]).join('')}
          </div>
          <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, color: '#fff', letterSpacing: '0.02em' }}>{athlete.name}</span>
            <span style={{ fontSize: '15px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              <strong style={{ color: '#fff' }}>{athlete.sport || 'Athletics'}</strong> &middot; {settings.organizationName}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button onClick={() => handleSelectAthleteForEntry(athlete.id)} className="glow-card" style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', borderRadius: '8px', padding: '12px 22px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Plus size={18} /> LOG DATA
            </button>
            <button onClick={() => handleEditClick(athlete)} style={{ background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              EDIT INFO
            </button>
          </div>
        </div>

        {/* Executive KPI Stat Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', paddingTop: '8px' }}>

          <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>CURRENT BODY MASS</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                {latestWeight != null ? `${latestWeight} lb` : '😴 Sleep Only'}
              </span>
            </div>
            {latestWeight != null && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: weightDelta > 0 ? 'var(--status-success)' : weightDelta < 0 ? 'var(--status-error)' : 'var(--color-text-muted)' }}>
                {weightDelta > 0 ? `▲ +${weightDelta.toFixed(1)} lb from baseline` : weightDelta < 0 ? `▼ ${weightDelta.toFixed(1)} lb from baseline` : '• Unchanged vs baseline'}
              </span>
            )}
            {latestWeight == null && (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Scale weight not recorded</span>
            )}
          </div>

          <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AVERAGE SLEEP DURATION</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                {avgSleep} <span style={{ fontSize: '16px', color: 'var(--color-text-muted)' }}>hrs</span>
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: avgSleep !== '--' && sleepBand(Number(avgSleep)) === 'optimal' ? 'var(--status-success)' : avgSleep !== '--' && sleepBand(Number(avgSleep)) === 'adequate' ? '#f59e0b' : 'var(--status-error)' }}>
              {avgSleep !== '--' ? (sleepBand(Number(avgSleep)) === 'optimal' ? '🟢 Optimal Rest Standard' : sleepBand(Number(avgSleep)) === 'adequate' ? '🟡 Adequate Recovery' : '🔴 Sleep Deficit Warning') : 'No sleep data'}
            </span>
            {sleepDelta != null && Math.abs(sleepDelta) >= 0.1 && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: sleepDelta > 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
                {sleepDelta > 0 ? `▲ +${sleepDelta} hr` : `▼ ${sleepDelta} hr`} vs the night before
              </span>
            )}
          </div>

          <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>RECOVERY INDEX SCORE</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--color-accent)' }}>
                {recoveryScore != null ? `${recoveryScore}%` : '--'}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              {recoveryScore != null ? `${sleepLogs.length - deficitNights} / ${sleepLogs.length} sessions optimal` : 'Awaiting sleep check-ins'}
            </span>
          </div>

          <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>TOTAL RECORDED LOGS</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                {sortedLogs.length}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 700 }}>SESSIONS</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 700 }}>
              {daysAgo != null ? (daysAgo === 0 ? '✨ Active Today' : `Last active ${daysAgo}d ago`) : 'No historical sessions'}
            </span>
          </div>

          {settings.enableRpe && (
            <>
              <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: isDangerSpike ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>7-DAY A:C WORKLOAD RATIO</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: isDangerSpike ? '#ef4444' : '#60a5fa' }}>
                    {acRatio}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: isDangerSpike ? '#ef4444' : 'var(--color-text-muted)', fontWeight: 600 }}>
                  {isDangerSpike ? `⚠️ High Spike Risk (≥${settings.rpeLoadSpikeRatio})` : `Compared to ${settings.rpeChronicWeeks}-wk baseline`}
                </span>
              </div>
              <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>7-DAY CUMULATIVE LOAD</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                    {acuteLoad}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 700 }}>AU</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                  Average RPE: {avgRpeNum}
                </span>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Speed & Power sits right under the name card, ahead of body weight/sleep -
          the coach reads it first when checking on an athlete. */}
      {settings.enableSpeedPower && (
        <AthleteSpeedPowerCard
          athlete={athlete}
          athletes={athletes}
          performanceTests={performanceTests}
          updatePerformanceTest={updatePerformanceTest}
          deletePerformanceTest={deletePerformanceTest}
          setConfirmModal={setConfirmModal}
        />
      )}

      {/* Trend Analytics Section (2 Columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>

        {/* Body Weight Evolution Curve */}
        <div className="card-glass" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TrendingUp size={15} /> MASS EVOLUTION CURVE
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase' }}>
                BODY WEIGHT TRENDS
              </h3>
            </div>
            {weightLogs.length > 0 && (
              <div style={{ display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.25)', padding: '8px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>LOW</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{minWeight}</span>
                </div>
                <div>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>HIGH</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{maxWeight}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ height: '260px', position: 'relative', paddingTop: '16px', marginLeft: '-20px' }}>
            {weightLogs.length > 1 ? (() => {
              const trendData = weightLogs.slice(-20).map(d => ({
                date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
                Weight: Number(d.weight_lbs) || 0,
                isBaseline: d.is_baseline === true || d.is_baseline === 'true' || d.is_baseline === 1
              }));
              const validW = trendData.map(d=>d.Weight).filter(w => w > 0);
              const minW = validW.length > 0 ? Math.min(...validW) : 100;
              const maxW = validW.length > 0 ? Math.max(...validW) : 200;
              const latestBaseline = [...weightLogs].reverse().find(d => d.is_baseline);
              let baselineWeight = latestBaseline ? Number(latestBaseline.weight_lbs) : null;
              if (!baselineWeight) {
                try {
                  const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
                  if (customMap[athlete.id] && customMap[athlete.id].weight_lbs) {
                    baselineWeight = Number(customMap[athlete.id].weight_lbs);
                  } else if (athlete?.baseline_weight) {
                    baselineWeight = Number(athlete.baseline_weight);
                  }
                } catch(e) {}
              }
              if (!baselineWeight && weightLogs.length > 0) {
                baselineWeight = Number(weightLogs[0].weight_lbs);
              }

              return (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 15, right: 30, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorWeightProfile" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.5}/>
                        <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} minTickGap={20} />
                    <YAxis domain={[Math.floor(minW - 4), Math.ceil(maxW + 4)]} hide />
                    <RechartsTooltip content={<CustomTooltip units={{ Weight: 'lbs' }} />} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    {baselineWeight && (
                      <ReferenceLine y={baselineWeight} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Baseline: ${baselineWeight} lbs`, position: 'insideTopLeft', fill: '#10b981', fontSize: 11, fontWeight: 'bold' }} />
                    )}
                    {trendData.filter(d => d.isBaseline).map((d, idx) => (
                      <ReferenceLine key={idx} x={d.date} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'BASELINE SET', position: 'top', fill: '#3b82f6', fontSize: 9, fontWeight: 'bold' }} />
                    ))}
                    <Area type="monotone" dataKey="Weight" stroke="var(--color-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorWeightProfile)" activeDot={{ r: 7, fill: 'var(--color-accent)', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              );
            })() : weightLogs.length === 1 ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: '8px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-accent)' }}>{weightLogs[0].weight_lbs} lbs recorded</span>
                <span style={{ fontSize: '13px' }}>Need at least 2 weigh-in entries to generate visual trend line</span>
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: '12px', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '12px', border: '1px dashed rgba(139, 92, 246, 0.25)', padding: '24px' }}>
                <span style={{ fontSize: '24px' }}>😴</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#c084fc', textAlign: 'center' }}>SLEEP & RECOVERY ONLY TRACKING</span>
                <span style={{ fontSize: '13px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
                  This athlete is configured for recovery tracking without scale body mass recordings. No weight trends to display.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sleep Duration & Recovery Pattern */}
        <div className="card-glass" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={15} /> RECOVERY & REST PATTERN
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase' }}>
                SLEEP DURATION TRENDS
              </h3>
            </div>
            {sleepLogs.length > 0 && (
              <div style={{ display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.25)', padding: '8px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>PEAK REST</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#60a5fa' }}>{maxSleep}h</span>
                </div>
                <div>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>DEFICITS</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: deficitNights > 0 ? '#ef4444' : 'var(--status-success)' }}>{deficitNights}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ height: '260px', position: 'relative', paddingTop: '16px', marginLeft: '-20px' }}>
            {sleepLogs.length > 0 ? (() => {
              const sleepData = sleepLogs.slice(-14).map(d => ({
                date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
                Sleep: Number(d.sleep_hrs) || 0,
                fillColor: sleepBand(Number(d.sleep_hrs)) === 'optimal' ? '#34d399' : sleepBand(Number(d.sleep_hrs)) === 'adequate' ? '#f59e0b' : '#ef4444'
              }));

              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sleepData} margin={{ top: 15, right: 30, left: 10, bottom: 0 }}>
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} minTickGap={20} />
                    <YAxis domain={[0, 12]} hide />
                    <RechartsTooltip content={<CustomTooltip units={{ Sleep: 'hrs' }} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <ReferenceLine y={sleepChartTarget} stroke="rgba(184, 156, 91, 0.7)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: `${Number(sleepChartTarget).toFixed(1)}h Target`, position: 'insideTopLeft', fill: 'var(--color-accent)', fontSize: 11, fontWeight: 'bold' }} />
                    <Bar dataKey="Sleep" fill="#60a5fa" radius={[6, 6, 0, 0]} fillOpacity={0.9} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })() : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                No sleep duration recordings logged yet
              </div>
            )}
          </div>
        </div>

        {/* 3. Session RPE Trends (Only if enabled) */}
        {settings.enableRpe && (
          <div className="card-glass" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={15} /> INTERNAL LOAD TRACKING
                </span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase' }}>
                  SESSION LOAD & RPE TRENDS
                </h3>
              </div>
            </div>

            <div style={{ height: '260px', position: 'relative', paddingTop: '16px', marginLeft: '-20px' }}>
              {rpeLogs.length > 0 ? (() => {
                const rpeData = rpeLogs.slice(-20).map(d => ({
                  date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
                  RPE: Number(d.rpe) || 0,
                  Load: (Number(d.rpe) || 0) * (Number(d.session_minutes) || 0),
                  fillColor: Number(d.rpe) >= settings.rpeHighThreshold ? '#ef4444' : '#60a5fa'
                }));

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rpeData} margin={{ top: 15, right: 30, left: 10, bottom: 0 }}>
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} minTickGap={20} />
                      <YAxis domain={[0, settings.rpeScaleMax]} hide />
                      <RechartsTooltip content={<CustomTooltip units={{ RPE: '' }} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <ReferenceLine y={settings.rpeHighThreshold} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'HIGH RPE', position: 'insideTopLeft', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} />
                      <Bar dataKey="RPE" radius={[4, 4, 0, 0]}>
                        {rpeData.map((entry, index) => (
                          <cell key={`cell-${index}`} fill={entry.fillColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })() : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.1)', padding: '24px' }}>
                  <Target size={32} style={{ opacity: 0.5 }} />
                  <span style={{ fontSize: '15px', fontWeight: 700, textAlign: 'center' }}>NO RPE DATA RECORDED</span>
                  <span style={{ fontSize: '13px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
                    This athlete has not logged any session RPE values yet.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Post-Practice Sweat & Acute Weight Drop Tracker */}
      <div className="card-glass glow-card" style={{ padding: '32px', borderRadius: '24px', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.25) 0%, rgba(15, 23, 42, 0.7) 100%)', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <Zap size={28} />
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                • ACUTE EXERTIONAL MONITORING
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                POST-PRACTICE SWEAT LOSS &amp; HYDRATION TRACKER
              </h3>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 600 }}>
                Monitors rapid weight drops after high-heat drills and training without distorting official morning recovery trend charts.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setManualEntryForm(prev => ({
                ...prev,
                athleteId: athlete.id,
                date: getCentralDateString(),
                time: getCentralTimeString(),
                weight: '',
                successMsg: ''
              }));
              setShowManualEntryModal(true);
            }}
            style={{
              padding: '14px 22px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              border: 'none',
              color: '#fff',
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(59, 130, 246, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <span>➕ Log Post-Practice Weight</span>
          </button>
        </div>

        {postPracticeLogs.length === 0 ? (
          <div style={{ padding: '24px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.15)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
            No post-practice weight entries recorded yet. Use the button above to log acute weigh-ins after practice sessions!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {postPracticeLogs.map((plog, idx) => {
              const plogDate = new Date(plog.created_at);
              const pDate = plogDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const pTime = plogDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              const pWeight = parseFloat(plog.weight_lbs);

              // Find pre-practice/morning weight from the same day, or fallback to latest prior normal weigh-in
              const plogDateCentralStr = getCentralDateString(plogDate);
              const sameDayLogs = weightLogs.filter(wl => getCentralDateString(new Date(wl.created_at)) === plogDateCentralStr);
              let bWeight = null;
              if (sameDayLogs.length > 0) {
                bWeight = parseFloat(sameDayLogs[sameDayLogs.length - 1].weight_lbs);
              } else {
                const priorLogs = weightLogs.filter(wl => new Date(wl.created_at) <= plogDate);
                if (priorLogs.length > 0) {
                  bWeight = parseFloat(priorLogs[priorLogs.length - 1].weight_lbs);
                } else {
                  bWeight = baselineWeight ? parseFloat(baselineWeight) : (latestWeight ? parseFloat(latestWeight) : null);
                }
              }

              const drop = bWeight ? (bWeight - pWeight) : 0;
              const pctLoss = bWeight && bWeight > 0 ? ((drop / bWeight) * 100) : 0;
              const fluidOz = drop > 0 ? Math.round(drop * settings.fluidOzPerLb) : 0;
              const isSevere = drop >= settings.severeSweatLbs || pctLoss >= settings.severeSweatPct;

              return (
                <div key={plog.id || idx} style={{ padding: '18px 24px', borderRadius: '16px', background: 'rgba(0, 0, 0, 0.35)', border: isSevere ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ minWidth: '85px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff', display: 'block' }}>{pDate}</span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{pTime}</span>
                    </div>
                    <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    {bWeight && (
                      <>
                        <div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Pre-Practice / Morning</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--color-text-muted)' }}>{bWeight} lbs</span>
                        </div>
                        <div style={{ fontSize: '20px', color: 'var(--color-text-muted)', fontWeight: 800 }}>➔</div>
                      </>
                    )}
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Post-Practice Weight</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: '#fff' }}>{pWeight} lbs</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    {bWeight && (
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Acute Sweat Drop</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: drop > 0 ? '#ef4444' : '#34d399' }}>
                          {drop > 0 ? `-${drop.toFixed(1)} lbs` : `+${Math.abs(drop).toFixed(1)} lbs`} ({drop > 0 ? `-${pctLoss.toFixed(1)}%` : `+${Math.abs(pctLoss).toFixed(1)}%`})
                        </span>
                      </div>
                    )}
                    <div style={{ padding: '8px 16px', borderRadius: '12px', background: drop >= settings.severeSweatLbs ? 'rgba(239, 68, 68, 0.2)' : drop > settings.acuteDropLbs ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)', border: drop >= settings.severeSweatLbs ? '1px solid rgba(239, 68, 68, 0.4)' : drop > settings.acuteDropLbs ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)', color: drop >= settings.severeSweatLbs ? '#ef4444' : drop > settings.acuteDropLbs ? '#f97316' : '#60a5fa', fontWeight: 800, fontSize: '13px' }}>
                      💧 Rx: Drink {fluidOz > 0 ? fluidOz : settings.minFluidOz} oz fluids before tomorrow
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setManualEntryForm(p => ({
                          ...p,
                          athleteId: athlete.id,
                          weight: String(pWeight),
                          date: getCentralDateString(plogDate),
                          time: getCentralTimeString(plogDate),
                          sessionType: 'post_practice',
                          successMsg: '',
                          editingLogId: plog.id
                        }));
                        setShowManualEntryModal(true);
                      }}
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                      title="Fix a mis-entered date, time, or weight on this log"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Attributes Over Time - Full Chronological Ledger */}
      <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Activity size={14} /> COMPLETE ATTRIBUTE TIMELINE
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, margin: 0, color: '#fff', textTransform: 'uppercase' }}>
              HISTORICAL LOG LEDGER ({sortedLogs.length})
            </h3>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Comprehensive log of every check-in session showing body weight deltas, sleep duration, and recovery classifications over time.
            </div>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--color-accent)', background: 'rgba(184, 156, 91, 0.12)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(184, 156, 91, 0.25)', fontWeight: 700, textTransform: 'uppercase' }}>
            CHRONOLOGICAL ORDER (NEWEST FIRST)
          </span>
        </div>

        {sortedLogs.length > 0 ? (
          <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DATE & TIME</th>
                  <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>BODY WEIGHT</th>
                  <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SESSION DELTA</th>
                  <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SLEEP DURATION</th>
                  <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>RECOVERY STATUS</th>
                  {settings.enableRpe && <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>RPE / LOAD</th>}
                  <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.slice().reverse().map((log, idx, arr) => {
                  // Find older record with valid weight to compute delta
                  const currentW = log.weight_lbs && Number(log.weight_lbs) > 0 ? Number(log.weight_lbs) : null;
                  let prevW = null;
                  for (let j = idx + 1; j < arr.length; j++) {
                    if (arr[j].weight_lbs && Number(arr[j].weight_lbs) > 0) {
                      prevW = Number(arr[j].weight_lbs);
                      break;
                    }
                  }
                  const delta = (currentW && prevW) ? (currentW - prevW) : null;
                  const sleepH = Number(log.sleep_hrs);

                  return (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.03)' } }}>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ fontWeight: 700, color: '#fff', fontSize: '14px', display: 'block' }}>
                          {new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        {currentW ? (
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                            {currentW.toFixed(1)} <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>lb</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', background: isRpeLog(log) ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)', color: isRpeLog(log) ? '#60a5fa' : '#c084fc', padding: '4px 12px', borderRadius: '12px', fontWeight: 700, border: isRpeLog(log) ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)' }}>
                            {isRpeLog(log) ? '🎯 Session RPE' : '😴 Sleep Only Mode'}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        {delta != null ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                            background: delta > 0 ? 'rgba(52, 211, 153, 0.12)' : delta < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                            color: delta > 0 ? 'var(--status-success)' : delta < 0 ? 'var(--status-error)' : 'var(--color-text-muted)',
                            border: `1px solid ${delta > 0 ? 'rgba(52, 211, 153, 0.3)' : delta < 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'}`
                          }}>
                            {delta > 0 ? `▲ +${delta.toFixed(1)} lb` : delta < 0 ? `▼ ${delta.toFixed(1)} lb` : '• Unchanged'}
                          </span>
                        ) : currentW ? (
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Initial baseline</span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>--</span>
                        )}
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                          {log.sleep_hrs ? Number(log.sleep_hrs).toFixed(1) : '--'} <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>hrs</span>
                        </span>
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        {/* Only rate recovery when sleep was actually logged - sessions with no
                            sleep data (e.g. post-practice sweat checks) used to show a false
                            red "Sleep Deficit Warning". */}
                        {sleepH > 0 ? (
                          <span style={{
                            display: 'inline-block', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                            background: sleepBand(sleepH) === 'optimal' ? 'rgba(52, 211, 153, 0.15)' : sleepBand(sleepH) === 'adequate' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                            color: sleepBand(sleepH) === 'optimal' ? 'var(--status-success)' : sleepBand(sleepH) === 'adequate' ? '#f59e0b' : '#ef4444',
                            border: `1px solid ${sleepBand(sleepH) === 'optimal' ? 'rgba(52, 211, 153, 0.4)' : sleepBand(sleepH) === 'adequate' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                          }}>
                            {sleepBand(sleepH) === 'optimal' ? '🟢 Optimal Rest' : sleepBand(sleepH) === 'adequate' ? '🟡 Adequate Recovery' : '🔴 Sleep Deficit Warning'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>

                      {settings.enableRpe && (
                        <td style={{ padding: '16px 20px' }}>
                          {log.rpe != null ? (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: log.rpe >= settings.rpeHighThreshold ? '#ef4444' : '#60a5fa' }}>{log.rpe} <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>/ {settings.rpeScaleMax}</span></span>
                              {log.session_minutes ? <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>({log.rpe * log.session_minutes} AU)</span> : null}
                              {log.session_label && <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{log.session_label}</span>}
                            </div>
                          ) : <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                      )}

                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {currentW ? (
                            log.is_baseline ? (
                              <span style={{ fontSize: '11px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', padding: '6px 14px', borderRadius: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 0 10px rgba(184, 156, 91, 0.3)', whiteSpace: 'nowrap' }}>
                                ⭐ ACTIVE BASELINE MARKER
                              </span>
                            ) : (
                              <button
                                onClick={() => handleMakeDateBaselineMarker(log.id, athlete.id, currentW, new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), athlete.name)}
                                style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                                title={`Make this specific date and weight the official baseline marker for ${athlete.name || 'this athlete'}'s dehydration alerts. To set a baseline for a whole team/sport at once, use Bulk Team Baseline Studio under Teams & Rosters.`}
                              >
                                📍 MAKE BASELINE MARKER
                              </button>
                            )
                          ) : null}
                          {/* Correcting a mis-typed weight used to be possible only on
                              post-practice sweat checks, so a fat-fingered morning
                              weigh-in (169.9 for 160.9) could only be deleted and
                              re-entered - which loses the original timestamp and, if it
                              was the baseline, silently moves the marker. */}
                          <button
                            onClick={() => {
                              const d = new Date(log.created_at);
                              setManualEntryForm(p => ({
                                ...p,
                                athleteId: athlete.id,
                                weight: currentW != null ? String(currentW) : '',
                                date: getCentralDateString(d),
                                time: getCentralTimeString(d),
                                // Preserve what this row already is. Sending
                                // 'post_practice' for a morning weigh-in would reclassify
                                // it as a sweat check and drop it out of every weight
                                // trend and baseline calculation.
                                sessionType: isPostPracticeLog(log) ? 'post_practice' : 'morning',
                                successMsg: '',
                                editingLogId: log.id
                              }));
                              setShowManualEntryModal(true);
                            }}
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--white)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                            title="Correct a mis-entered date, time, or weight on this log"
                          >
                            <Pencil size={14} /> EDIT
                          </button>
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Recorded Session',
                                message: 'Delete this recorded weigh-in session?',
                                isDanger: true,
                                actionText: 'Delete',
                                onConfirm: async () => {
                                  await handleDeleteWeighIn(log.id, true);
                                  setTimeout(() => fetchProfileData(athlete.id), 300);
                                }
                              });
                            }}
                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                            title="Delete Log Entry"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', background: 'rgba(0,0,0,0.15)' }}>
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>📋</span>
            No check-in session logs recorded for this athlete yet. Click "+ LOG DATA" above or enter via Kiosk Mode.
          </div>
        )}
      </div>
    </div>
  );
}

// One athlete's Speed & Power section: PB + rankings per test type (as before), plus
// this session's additions - a per-test attempt HISTORY (so "did they go up or down"
// is answered by real numbers, not just the current trend arrow) and inline edit/delete
// on every row, so a mis-entered value or date gets corrected in place rather than
// requiring a delete-and-re-upload.
function AthleteSpeedPowerCard({ athlete, athletes, performanceTests, updatePerformanceTest, deletePerformanceTest, setConfirmModal }) {
  const tests = performanceTests || [];
  // Which test types have their history expanded. Best/rank shows by default; the full
  // list of attempts is a click away so the card isn't a wall of rows for an athlete
  // tested a dozen times.
  const [openHistory, setOpenHistory] = useState({});
  // { [testId]: { metric, date } } while a row is being edited.
  const [editing, setEditing] = useState({});
  const [savingId, setSavingId] = useState(null);

  const rankings = TEST_TYPES.map(tt => ({
    ...tt,
    best: bestTestFor(tests, athlete.id, tt.key),
    rank: rankAthleteForTest(tests, athletes, athlete, tt.key),
    attempts: tests
      .filter(t => t.athlete_id === athlete.id && t.test_type === tt.key)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  }));
  const attempted = rankings.filter(r => r.rank);
  // "Where they can improve" = the attempted test with the lowest percentile, i.e. the
  // one furthest from the top of the roster - not the lowest raw number, since a 15in
  // vertical and a 1.4s fly time aren't comparable on their own terms.
  const focusArea = attempted.length
    ? attempted.reduce((worst, r) => (r.rank.percentile < worst.rank.percentile ? r : worst))
    : null;

  const startEdit = (t) => setEditing(prev => ({ ...prev, [t.id]: { metric: String(t.metric), date: String(t.created_at).slice(0, 10) } }));
  const cancelEdit = (id) => setEditing(prev => { const next = { ...prev }; delete next[id]; return next; });

  const saveEdit = async (t) => {
    const draft = editing[t.id];
    if (!draft) return;
    const v = parseFloat(draft.metric);
    if (!isFinite(v) || v <= 0 || !draft.date) return;
    setSavingId(t.id);
    await updatePerformanceTest(t.id, {
      metric: v,
      created_at: centralWallTimeToISO(draft.date, '12:00'),
    });
    setSavingId(null);
    cancelEdit(t.id);
  };

  const confirmDelete = (t) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Test Result',
      message: `Delete this ${TEST_TYPE_BY_KEY[t.test_type]?.label || t.test_type} result (${formatMetric(t.metric, t.unit)} on ${String(t.created_at).slice(0, 10)})?`,
      isDanger: true,
      actionText: 'Delete',
      onConfirm: async () => { await deletePerformanceTest(t.id); },
    });
  };

  return (
    <div className="card-glass glow-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '20px' }}>
      <div>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={15} /> SPEED &amp; POWER
        </span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase' }}>
          TESTING PROFILE &amp; RANKINGS
        </h3>
      </div>

      {attempted.length === 0 ? (
        <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          No Speed &amp; Power results logged for {athlete.name} yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {rankings.map(r => {
              // Latest-vs-previous-attempt trend, same framing as the leaderboard badge -
              // moves every session, not just on a new PB.
              const trend = r.attempts.length >= 2
                ? (() => {
                    const delta = Number(r.attempts[0].metric) - Number(r.attempts[1].metric);
                    const improving = r.better === 'desc' ? delta > 0 : delta < 0;
                    const pct = r.attempts[1].metric ? (delta / Number(r.attempts[1].metric)) * 100 : 0;
                    return { delta, improving, pct };
                  })()
                : null;
              const isOpen = !!openHistory[r.key];

              return (
                <div key={r.key} style={{ padding: '16px 18px', borderRadius: '14px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.label}</span>
                  {r.best ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: '#fbbf24' }}>
                          {formatMetric(r.best.metric, r.best.unit)}
                        </span>
                        {trend && Math.abs(trend.pct) >= 0.1 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', fontSize: '11px', fontWeight: 800, color: trend.improving ? '#34d399' : '#f87171' }}>
                            {trend.delta < 0 ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                            {Math.abs(trend.pct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        #{r.rank.overallRank} of {r.rank.overallTotal} overall
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        #{r.rank.sportRank} of {r.rank.sportTotal} in {athlete.sport || 'General'}
                      </span>
                      <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: '2px' }}>
                        <div style={{ height: '100%', width: `${r.rank.percentile}%`, borderRadius: '3px', background: r.rank.percentile >= 66 ? '#34d399' : r.rank.percentile >= 33 ? '#fbbf24' : '#f87171' }} />
                      </div>

                      <button
                        type="button"
                        onClick={() => setOpenHistory(prev => ({ ...prev, [r.key]: !prev[r.key] }))}
                        style={{ marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '6px', borderRadius: '8px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', color: 'var(--color-text-muted)', fontSize: '10px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                      >
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isOpen ? 'Hide history' : `History (${r.attempts.length})`}
                      </button>

                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                          {r.attempts.map(t => {
                            const draft = editing[t.id];
                            const isBest = r.best && t.id === r.best.id;
                            return (
                              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                {draft ? (
                                  <>
                                    <input
                                      type="date"
                                      value={draft.date}
                                      max={getCentralDateString()}
                                      onChange={e => setEditing(prev => ({ ...prev, [t.id]: { ...prev[t.id], date: e.target.value } }))}
                                      style={{ flex: '1 1 auto', minWidth: 0, fontSize: '11px', padding: '4px 6px', borderRadius: '6px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                                    />
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={draft.metric}
                                      onChange={e => setEditing(prev => ({ ...prev, [t.id]: { ...prev[t.id], metric: e.target.value.replace(/[^0-9.]/g, '') } }))}
                                      style={{ width: '60px', fontSize: '11px', padding: '4px 6px', borderRadius: '6px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}
                                    />
                                    <button type="button" disabled={savingId === t.id} onClick={() => saveEdit(t)} style={{ fontSize: '10px', fontWeight: 800, color: '#34d399', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                      {savingId === t.id ? '…' : 'SAVE'}
                                    </button>
                                    <button type="button" onClick={() => cancelEdit(t.id)} style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                      CANCEL
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flex: '1 1 auto' }}>{String(t.created_at).slice(0, 10)}</span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: isBest ? '#fbbf24' : 'var(--white)' }}>{formatMetric(t.metric, t.unit)}</span>
                                    {isBest && <span title="Personal best" style={{ fontSize: '10px', color: '#fbbf24' }}>★</span>}
                                    <button type="button" onClick={() => startEdit(t)} aria-label="Edit result" style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', padding: '2px' }}>
                                      <Pencil size={12} />
                                    </button>
                                    <button type="button" onClick={() => confirmDelete(t)} aria-label="Delete result" style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', padding: '2px' }}>
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Not tested yet</span>
                  )}
                </div>
              );
            })}
          </div>

          {focusArea && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: focusArea.rank.percentile < 50 ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)', border: `1px solid ${focusArea.rank.percentile < 50 ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}` }}>
              <Target size={20} style={{ color: focusArea.rank.percentile < 50 ? '#f87171' : '#34d399', flexShrink: 0 }} />
              <div style={{ fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.5 }}>
                <strong>{focusArea.rank.percentile < 50 ? 'Focus area' : 'Strongest area'}: {focusArea.label}.</strong>{' '}
                {athlete.name} ranks #{focusArea.rank.sportRank} of {focusArea.rank.sportTotal} in {athlete.sport || 'General'}
                {' '}({focusArea.rank.percentile}th percentile overall){focusArea.rank.percentile < 50 ? ' — the biggest room for improvement among tested markers.' : ' — their best-ranked marker.'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
