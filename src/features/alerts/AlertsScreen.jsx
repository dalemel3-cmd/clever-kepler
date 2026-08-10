import { CheckCircle, Flame, Check, RotateCcw, Eye } from 'lucide-react';

// Alerts is the live, operational "fire list" — today only, no filters, no export.
// It answers "who needs my attention right now", not "what happened this month"
// (that's Reports' job now — trend charts, date ranges, and rollups live there).
const STATUS_META = {
  open: { label: 'UNACTIONED', color: 'var(--status-error)' },
  acknowledged: { label: 'ACKNOWLEDGED', color: '#f59e0b' },
  resolved: { label: 'RESOLVED', color: 'var(--status-success)' }
};

function severityBadge(streak) {
  if (streak >= 3) return { label: `🔥 ${streak}-DAY STREAK`, bg: 'rgba(239, 68, 68, 0.25)', color: '#ef4444' };
  if (streak === 2) return { label: '⚠️ 2ND DAY RUNNING', bg: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b' };
  return null;
}

export default function AlertsScreen({
  dehydrationThreshold,
  sleepThreshold,
  renderNegativeSweatDropCards,
  getDailyAlerts,
  alertStatusFor,
  acknowledgeAlert,
  resolveAlert,
  reopenAlert
}) {
  const allAlerts = getDailyAlerts();
  const openCount = allAlerts.filter(a => alertStatusFor(a.alert_key) !== 'resolved').length;
  const resolvedCount = allAlerts.length - openCount;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 280px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.1em', marginBottom: '4px' }}>TRAINING SAFETY &middot; TODAY'S RISK ALERTS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, var(--text-3xl))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>ATHLETE RECOVERY ALERTS</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '6px' }}>Automated flags for mass loss (&gt;{dehydrationThreshold} lbs) and low sleep (&lt;{sleepThreshold}h) &middot; sorted most urgent first</div>
        </div>

        {allAlerts.length > 0 && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--status-error)' }}>{openCount}</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)' }}>UNRESOLVED</div>
            </div>
            <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--status-success)' }}>{resolvedCount}</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)' }}>RESOLVED</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {renderNegativeSweatDropCards()}
        {allAlerts.length === 0 ? (
          <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-text-muted)' }}>
            <CheckCircle size={32} style={{ color: 'var(--status-success)' }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>No risk alerts today. All athletes are fully recovered.</span>
          </div>
        ) : (
          allAlerts.map(alert => {
            const status = alertStatusFor(alert.alert_key);
            const meta = STATUS_META[status];
            const badge = severityBadge(alert.streak);
            const isResolved = status === 'resolved';
            return (
              <div
                key={alert.id}
                className="card-glass animate-slide-up"
                style={{
                  padding: '20px', borderLeft: `4px solid ${alert.color}`, display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', opacity: isResolved ? 0.6 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 320px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${alert.color}22`, color: alert.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {alert.icon}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700 }}>{alert.athlete_name}</span>
                      <span style={{ fontSize: '10px', background: `${alert.color}33`, color: alert.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{alert.type}</span>
                      {badge && (
                        <span style={{ fontSize: '10px', background: badge.bg, color: badge.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Flame size={11} /> {badge.label}
                        </span>
                      )}
                      <span style={{ fontSize: '10px', color: meta.color, fontWeight: 800, letterSpacing: '0.04em' }}>{meta.label}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{alert.message}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: alert.type === 'DEHYDRATION RISK' ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>{alert.action}</span>

                  {status === 'open' && (
                    <button
                      onClick={() => acknowledgeAlert(alert.alert_key, alert)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      title="Mark that you've seen and are handling this"
                    >
                      <Eye size={13} /> ACKNOWLEDGE
                    </button>
                  )}
                  {status !== 'resolved' && (
                    <button
                      onClick={() => resolveAlert(alert.alert_key, alert)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(16, 185, 129, 0.4)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      title="Mark as handled — athlete has been talked to / cleared"
                    >
                      <Check size={13} /> RESOLVE
                    </button>
                  )}
                  {status !== 'open' && (
                    <button
                      onClick={() => reopenAlert(alert.alert_key, alert)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      title="Reopen this alert"
                    >
                      <RotateCcw size={13} /> REOPEN
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
