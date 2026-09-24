import { Activity } from 'lucide-react';
import { computeAcuteChronicLoad, isRpeLog } from '../../utils/athleteData';

// Session Load for the Reports handout, scoped to whatever the report filters narrow
// to. The old version was four program-wide totals (session count, average RPE,
// cumulative AU), which didn't help anyone decide anything. Coaches act on a team, and
// more often on one athlete, so this is now:
//   - one athlete selected: that athlete's A:C ratio, acute load and session list
//   - otherwise: a per-athlete table sorted by A:C ratio, so spikes rise to the top
// The A:C ratio always uses the athlete's full RPE history (the chronic window needs
// weeks of data). Timeframe filters only affect the session counts, averages and lists.
export function SessionLoadSection({ athletes, reportData, filteredLogs, settings, scopeLabel, singleAthlete }) {
  const spike = settings.rpeLoadSpikeRatio;
  const loadOf = (l) => (Number(l.rpe) || 0) * (settings.rpeTrackDuration ? (Number(l.session_minutes) || 0) : 1);
  const acwrFor = (athleteId) => computeAcuteChronicLoad(
    reportData.filter(r => r.athlete_id === athleteId && isRpeLog(r)),
    { chronicWeeks: settings.rpeChronicWeeks, trackDuration: settings.rpeTrackDuration }
  );
  const ratioColor = (ratio) => ratio == null ? 'var(--color-text-muted)' : ratio >= spike ? 'var(--status-error)' : ratio < 0.8 ? '#f59e0b' : '#10b981';
  const fmtRatio = (ratio) => ratio == null ? '--' : ratio.toFixed(2);

  const th = { padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#ef4444' };
  const td = { padding: '10px 14px', fontSize: '13px' };

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Activity size={20} style={{ color: '#ef4444' }} />
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          SESSION LOAD &middot; {scopeLabel}
        </h3>
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>
        A:C spike threshold {spike} &middot; under 0.8 = underloaded
      </span>
    </div>
  );

  if (singleAthlete) {
    const sessions = filteredLogs.filter(isRpeLog).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const ac = acwrFor(singleAthlete.id);
    const avgRpe = sessions.length ? (sessions.reduce((s, l) => s + (Number(l.rpe) || 0), 0) / sessions.length).toFixed(1) : '--';
    const tile = (value, label, color = '#fff') => (
      <div style={{ padding: '12px 18px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{label}</div>
      </div>
    );
    return (
      <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #ef4444' }}>
        {header}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {tile(fmtRatio(ac.ratio), 'A:C Ratio', ratioColor(ac.ratio))}
          {tile(`${Math.round(ac.acuteLoad)} AU`, '7-Day Load')}
          {tile(`${Math.round(ac.chronicAvgWeeklyLoad)} AU`, `${settings.rpeChronicWeeks}-Wk Avg / Week`)}
          {tile(avgRpe, 'Avg RPE (period)')}
        </div>
        {ac.ratio == null && (
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Needs 2+ weeks of RPE history before an A:C ratio means anything.</div>
        )}
        {sessions.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No RPE sessions logged in this period.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <th style={th}>DATE</th>
                  <th style={th}>SESSION</th>
                  <th style={th}>RPE</th>
                  {settings.rpeTrackDuration && <th style={th}>MINUTES</th>}
                  <th style={th}>LOAD</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ ...td, fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td style={td}>{l.session_label || '--'}</td>
                    <td style={{ ...td, fontWeight: 700, color: Number(l.rpe) >= settings.rpeHighThreshold ? 'var(--status-error)' : undefined }}>{l.rpe}</td>
                    {settings.rpeTrackDuration && <td style={td}>{l.session_minutes || '--'}</td>}
                    <td style={{ ...td, fontWeight: 700 }}>{loadOf(l)} AU</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const rpeInPeriod = filteredLogs.filter(isRpeLog);
  const rows = athletes.map(a => {
    const mine = rpeInPeriod.filter(l => l.athlete_id === a.id);
    const ac = acwrFor(a.id);
    return {
      id: a.id,
      name: a.name,
      sport: a.sport || '--',
      sessions: mine.length,
      avgRpe: mine.length ? mine.reduce((s, l) => s + (Number(l.rpe) || 0), 0) / mine.length : null,
      periodLoad: mine.reduce((s, l) => s + loadOf(l), 0),
      acuteLoad: ac.acuteLoad,
      ratio: ac.ratio,
    };
  }).filter(r => r.sessions > 0 || r.acuteLoad > 0)
    // Spikes first, then the rest by ratio, then athletes with no ratio yet by load.
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.periodLoad - a.periodLoad);
  const spikes = rows.filter(r => r.ratio != null && r.ratio >= spike).length;

  return (
    <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #ef4444' }}>
      {header}
      {rows.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No RPE sessions logged for this group in this period.</div>
      ) : (
        <>
          <div style={{ fontSize: '12px', fontWeight: 700, color: spikes ? 'var(--status-error)' : 'var(--color-text-muted)' }}>
            {spikes ? `${spikes} athlete${spikes === 1 ? '' : 's'} at or above the ${spike} spike threshold` : 'No load spikes'} &middot; {rows.length} athletes reporting
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <th style={th}>ATHLETE</th>
                  <th style={th}>SPORT</th>
                  <th style={th}>A:C RATIO</th>
                  <th style={th}>7-DAY LOAD</th>
                  <th style={th}>SESSIONS (PERIOD)</th>
                  <th style={th}>AVG RPE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                    <td style={{ ...td, fontSize: '12px', color: 'var(--color-text-muted)' }}>{r.sport}</td>
                    <td style={{ ...td, fontWeight: 800, color: ratioColor(r.ratio) }}>{fmtRatio(r.ratio)}</td>
                    <td style={td}>{Math.round(r.acuteLoad)} AU</td>
                    <td style={td}>{r.sessions}</td>
                    <td style={td}>{r.avgRpe == null ? '--' : r.avgRpe.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
