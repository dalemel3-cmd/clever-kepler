import { TrendingUp, CheckCircle, ClipboardList } from 'lucide-react';
import { getAthleteBaseline } from '../../utils/athleteData';

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
  setTeamStatusSport
}) {
  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>SPORT GROUPS</h2>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{sportsList.length} sport{sportsList.length !== 1 ? 's' : ''} tracked</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => setShowBulkBaselineStudio(!showBulkBaselineStudio)}
            style={{ padding: '8px 16px', borderRadius: '12px', background: showBulkBaselineStudio ? 'var(--color-accent)' : 'rgba(184, 156, 91, 0.15)', color: showBulkBaselineStudio ? 'var(--navy-950)' : 'var(--color-accent)', border: '1px solid var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
          >
            <TrendingUp size={16} />
            {showBulkBaselineStudio ? 'CLOSE BASELINE STUDIO ▲' : 'BULK TEAM BASELINE STUDIO ▼'}
          </button>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Bulk Team Baseline Synchronization Studio */}
      {showBulkBaselineStudio && (
      <div className="card-glass glow-card animate-slide-up" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', border: '1px solid rgba(184, 156, 91, 0.4)', background: 'rgba(184, 156, 91, 0.05)', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(184, 156, 91, 0.2)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', boxShadow: '0 0 12px rgba(184, 156, 91, 0.3)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
              BULK TEAM BASELINE SYNCHRONIZATION STUDIO
            </h3>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Select an entire sport team and designate a specific historical weigh-in date as their official baseline marker across all charts and dehydration alarms.
            </div>
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
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '18px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: '1 1 400px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 200px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    1. SELECT SPORT GROUP
                  </label>
                  <select
                    value={activeSport}
                    onChange={(e) => { setBulkBaselineSport(e.target.value); setBulkBaselineDate(''); }}
                    style={{ padding: '10px 14px', background: 'var(--navy-900)', border: '1px solid var(--color-border)', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                  >
                    {sportsList.map(s => (
                      <option key={s} value={s}>{s.toUpperCase()} ({athletes.filter(a => (a.sport || '').toLowerCase() === s.toLowerCase()).length} Athletes)</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 240px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    2. SELECT HISTORICAL WEIGH-IN DATE
                  </label>
                  <select
                    value={selectedDateObj ? selectedDateObj.date : ''}
                    onChange={(e) => setBulkBaselineDate(e.target.value)}
                    disabled={availableDates.length === 0}
                    style={{ padding: '10px 14px', background: 'var(--navy-900)', border: '1px solid var(--color-border)', borderRadius: '8px', color: availableDates.length > 0 ? '#fff' : 'var(--color-text-muted)', fontSize: '14px', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
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
                className="btn-primary"
                style={{ padding: '14px 28px', fontSize: '14px', background: !selectedDateObj ? 'rgba(255,255,255,0.1)' : 'var(--color-accent)', color: !selectedDateObj ? 'rgba(255,255,255,0.4)' : 'var(--navy-950)', fontWeight: 800, cursor: selectedDateObj ? 'pointer' : 'not-allowed', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', height: 'fit-content', whiteSpace: 'nowrap', boxShadow: selectedDateObj ? '0 0 15px rgba(184, 156, 91, 0.4)' : 'none', marginTop: '18px' }}
              >
                <CheckCircle size={18} /> SET ALL OF {activeSport.toUpperCase()} TO {selectedDateObj ? selectedDateObj.date : 'DATE'}
              </button>
            </div>
          );
        })()}
      </div>
      )}

      {/* Sport Groups Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {sportsList.map(sport => {
          const sportAthletes = athletes.filter(a => (a.sport || '').toLowerCase() === sport.toLowerCase());

          // Calculate baseline/average weight for this sport group (prioritizing synchronized team baseline markers)
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

          return (
            <div
              key={sport}
              onClick={() => { setSelectedSportFilter(sport); setScreen('roster'); }}
              className="card-glass glow-card"
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                cursor: 'pointer',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                transition: 'transform 0.2s, border-color 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--white)' }}>
                {sport}
              </div>
              <div style={{ display: 'flex', gap: '48px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 800, lineHeight: 1, color: 'var(--white)' }}>
                    {sportAthletes.length}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ATHLETES
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 800, lineHeight: 1, color: countW > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {avgW > 0 ? avgW : '--'}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    AVG LB
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setTeamStatusSport(sport); setScreen('team-status'); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(184, 156, 91, 0.12)', border: '1px solid rgba(184, 156, 91, 0.35)', color: 'var(--color-accent)', fontSize: '12px', fontWeight: 800, letterSpacing: '0.02em', cursor: 'pointer' }}
                title="See who on this team hasn't weighed in yet, sorted by most recent log"
              >
                <ClipboardList size={15} /> WEIGH-IN STATUS
              </button>
            </div>
          );
        })}
        {sportsList.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>
            No sports currently tracked. Add athletes with sport tags to populate group statistics.
          </div>
        )}
      </div>
    </div>
  );
}
