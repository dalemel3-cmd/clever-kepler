import { CheckCircle } from 'lucide-react';

export default function AlertsScreen({
  dehydrationThreshold,
  sleepThreshold,
  alertsTab,
  setAlertsTab,
  renderNegativeSweatDropCards,
  getDailyAlerts,
  getWeeklyAlertsList,
  getWeeklyAlerts,
  getMonthlyAlerts
}) {
  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 280px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.1em', marginBottom: '4px' }}>TRAINING SAFETY &middot; RISK ALERTS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, var(--text-3xl))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>ATHLETE RECOVERY ALERTS</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '6px' }}>Automated flags for rapid mass loss (&gt;{dehydrationThreshold}%) and low sleep (&lt;{sleepThreshold}h)</div>
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
          {['DAILY', 'WEEKLY', 'MONTHLY'].map(tab => (
            <button
              key={tab}
              onClick={() => setAlertsTab(tab)}
              style={{
                background: alertsTab === tab ? 'var(--color-accent)' : 'transparent',
                color: alertsTab === tab ? 'var(--navy-950)' : 'var(--color-text-muted)',
                border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {alertsTab === 'DAILY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {renderNegativeSweatDropCards()}
          {getDailyAlerts().length === 0 ? (
            <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-text-muted)' }}>
              <CheckCircle size={32} style={{ color: 'var(--status-success)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>No risk alerts today. All athletes are fully recovered.</span>
            </div>
          ) : (
            getDailyAlerts().map(alert => (
              <div key={alert.id} className="card-glass animate-slide-up" style={{ padding: '20px', borderLeft: `4px solid ${alert.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${alert.color}22`, color: alert.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {alert.icon}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700 }}>{alert.athlete_name}</span>
                      <span style={{ fontSize: '10px', background: `${alert.color}33`, color: alert.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{alert.type}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{alert.message}</span>
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: alert.type === 'DEHYDRATION RISK' ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: 700 }}>{alert.action}</span>
              </div>
            ))
          )}
        </div>
      )}

      {alertsTab === 'WEEKLY' && (
        <>
        <div className="card-glass glow-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>Past 7 Days - Categorized Alert Volume</h3>
          <div style={{ height: '260px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
            {(() => {
              const weekData = getWeeklyAlerts();
              const maxCount = Math.max(...weekData.map(d => d.count), 1);
              return weekData.map((item, i) => {
                const totalHeightPx = Math.max((item.count / maxCount) * 200, 6);
                const weightHeightPx = item.count > 0 ? (item.weightCount / item.count) * totalHeightPx : 0;
                const sleepHeightPx = item.count > 0 ? (item.sleepCount / item.count) * totalHeightPx : 0;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: item.count > 0 ? 'var(--white)' : 'var(--color-text-muted)' }}>{item.count}</span>
                      {item.count > 0 && <span style={{ fontSize: '10px', display: 'block', color: 'var(--color-text-muted)' }}>({item.weightCount}💧 {item.sleepCount}🌙)</span>}
                    </div>
                    <div style={{ width: '100%', maxWidth: '44px', height: `${totalHeightPx}px`, background: 'var(--navy-800)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {weightHeightPx > 0 && <div style={{ height: `${weightHeightPx}px`, background: 'var(--status-error)', width: '100%' }} title={`Mass Loss Alerts: ${item.weightCount}`} />}
                      {sleepHeightPx > 0 && <div style={{ height: `${sleepHeightPx}px`, background: '#f59e0b', width: '100%' }} title={`Sleep Alerts: ${item.sleepCount}`} />}
                      {item.count === 0 && <div style={{ height: '100%', background: 'var(--navy-600)', width: '100%' }} />}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)' }}>{item.day}</span>
                  </div>
                );
              });
            })()}
          </div>
          <div style={{ display: 'flex', gap: '20px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', background: 'var(--status-error)', borderRadius: '3px' }}/> 💧 Mass Loss / Dehydration</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '3px' }}/> 🌙 CNS / Low Sleep Deficits</div>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--white)' }}>Athletes to Monitor (Since Monday)</h3>
          {getWeeklyAlertsList().length === 0 ? (
            <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-text-muted)' }}>
              <CheckCircle size={24} style={{ color: 'var(--status-success)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>No alerts triggered this week.</span>
            </div>
          ) : (
            getWeeklyAlertsList().map(alert => (
              <div key={alert.id} className="card-glass animate-slide-up" style={{ padding: '16px 20px', borderLeft: `4px solid ${alert.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${alert.color}22`, color: alert.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {alert.icon}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700 }}>{alert.athlete_name}</span>
                      <span style={{ fontSize: '9px', background: `${alert.color}33`, color: alert.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{alert.type}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{alert.message}</span>
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: alert.type === 'DEHYDRATION RISK' ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: 700 }}>{alert.action}</span>
              </div>
            ))
          )}
        </div>
        </>
      )}

      {alertsTab === 'MONTHLY' && (
        <div className="card-glass glow-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>30-Day Risk & Deficit Heat Map</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
            {getMonthlyAlerts().map((item, i) => {
              let bgColor = 'var(--navy-800)';
              let border = '1px solid rgba(255,255,255,0.05)';
              if (item.count > 0 && item.count <= 2) { bgColor = 'rgba(245, 158, 11, 0.25)'; border = '1px solid rgba(245, 158, 11, 0.5)'; }
              if (item.count > 2) { bgColor = 'rgba(239, 68, 68, 0.3)'; border = '1px solid rgba(239, 68, 68, 0.6)'; }

              return (
                <div key={i} style={{
                  aspectRatio: '1',
                  background: bgColor,
                  border,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  padding: '4px',
                  boxShadow: item.count > 2 ? '0 0 10px rgba(239, 68, 68, 0.2)' : 'none'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--white)', opacity: 0.6, fontWeight: 700 }}>{item.date.getDate()}</span>
                  {item.count > 0 ? (
                    <>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--white)' }}>{item.count}</span>
                      <div style={{ display: 'flex', gap: '2px', fontSize: '10px' }}>
                        {item.hasWeight && <span>💧</span>}
                        {item.hasSleep && <span>🌙</span>}
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: '12px', opacity: 0.2 }}>✔</span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '20px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'var(--navy-800)', borderRadius: '2px' }}/> 0 Alerts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'rgba(245, 158, 11, 0.4)', borderRadius: '2px' }}/> 1-2 Alerts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'rgba(239, 68, 68, 0.6)', borderRadius: '2px' }}/> 3+ Alerts</div>
            <span>|</span>
            <span>💧 Mass Drop Flag</span>
            <span>🌙 Low Sleep Flag</span>
          </div>
        </div>
      )}
    </div>
  );
}
