import { User, Search, X, ArrowUpRight, ChevronLeft, RefreshCw, Plus, TrendingUp, Clock, Zap, Activity, Trash2, Pencil, Target } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { CustomTooltip } from '../../components/CustomTooltip';
import { isPostPracticeLog, getAthleteBaseline, getCentralDateString, getCentralTimeString, hasWeight, isRpeLog } from '../../utils/athleteData';

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
  handleBackFromProfile
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

                {/* KPI mini row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Current Mass</span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
                      {latestLog && latestLog.weight_lbs && Number(latestLog.weight_lbs) > 0 ? `${latestLog.weight_lbs} lb` : (latestLog ? '😴 Sleep Only' : 'No logs')}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total Records</span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--color-accent)', marginTop: '2px' }}>
                      {aLogs.length} session{aLogs.length !== 1 ? 's' : ''}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>ATHLETE BIOMETRIC DOSSIER</span>
              <span style={{ fontSize: '11px', fontWeight: 700, background: weightLogs.length > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: weightLogs.length > 0 ? '#60a5fa' : '#c084fc', padding: '3px 10px', borderRadius: '12px', border: `1px solid ${weightLogs.length > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(139, 92, 246, 0.4)'}`, display: 'flex', alignItems: 'center', gap: '5px' }}>
                {weightLogs.length > 0 ? '⚖️ STANDARD TRACKING' : '😴 SLEEP ONLY MODE'}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, color: '#fff', letterSpacing: '0.02em' }}>{athlete.name}</span>
            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              <strong style={{ color: '#fff' }}>{athlete.sport || 'Athletics'}</strong> &middot; {athlete.team || settings.organizationName}{athlete.grade ? ` · Class of ${athlete.grade}` : ''} &middot; {athlete.position || 'General Athlete'}
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
