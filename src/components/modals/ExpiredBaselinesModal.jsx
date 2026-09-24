import { Shield, X } from 'lucide-react';

// Drill-down list of athletes whose baseline weight has expired. Split out of App.jsx.
export function ExpiredBaselinesModal({
  baselineExpiryDays,
  expiredBaselinesList,
  setScreen,
  setSearch,
  setShowExpiredBaselinesModal,
}) {
  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.95)' }}>
      <div className="card-glass glow-card" style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: '20px', border: '1px solid var(--color-accent)', boxShadow: '0 20px 50px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(184, 156, 91, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
              <Shield size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>EXPIRED BASELINES (&gt;{baselineExpiryDays} DAYS)</h3>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{expiredBaselinesList.length} Athletes require baseline weight verification</div>
            </div>
          </div>
          <button onClick={() => setShowExpiredBaselinesModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', padding: '4px' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {expiredBaselinesList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              ✔ All active roster athletes have recorded an updated weight within the past {baselineExpiryDays} days!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {expiredBaselinesList.map(a => (
                <div key={a.id} style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--white)' }}>{a.athlete_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Sport: {a.sport || 'N/A'} | Last Weigh-In: {a.last_weigh_in_date || 'Never'}</div>
                  </div>
                  <button
                    onClick={() => {
                      setShowExpiredBaselinesModal(false);
                      setSearch(a.athlete_name);
                      setScreen('athletes');
                    }}
                    style={{ padding: '8px 14px', background: 'rgba(184, 156, 91, 0.15)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    Inspect Profile ➔
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
          <button onClick={() => setShowExpiredBaselinesModal(false)} className="btn-primary" style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '10px' }}>
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
