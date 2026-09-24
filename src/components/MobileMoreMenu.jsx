import { AlertTriangle, Dumbbell, FileText, Grid, Settings, Sliders, X } from 'lucide-react';
import { APP_VERSION } from '../utils/athleteData';

// Mobile/tablet "More" sheet from the bottom nav. Split out of App.jsx.
export function MobileMoreMenu({
  coachInitials,
  screen,
  setIsAddingAthlete,
  setProfileEntryScreen,
  setSaved,
  setScreen,
  setSelectedProfileId,
  setShowMobileMore,
  settings,
  unresolvedDailyAlertsCount,
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(3, 10, 20, 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
         onClick={() => setShowMobileMore(false)}>
      <div className="card-glass animate-slide-up" 
           onClick={e => e.stopPropagation()} 
           style={{ width: '100%', maxWidth: '540px', maxHeight: '88vh', overflowY: 'auto', padding: '28px', background: 'var(--navy-950)', borderRadius: '24px', border: '1px solid var(--color-accent)', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7), 0 0 24px rgba(184, 156, 91, 0.25)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.15)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
              <Sliders size={18} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--white)' }}>MORE TOOLS & ANALYTICS</h3>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Tap to switch workspace section</span>
            </div>
          </div>
          <button onClick={() => setShowMobileMore(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {settings.enableLiftTracker && (
            <div onClick={() => { setScreen('lifts'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setProfileEntryScreen(null); setIsAddingAthlete(false); }}
                 className="card-glass glow-card"
                 style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'lifts' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'lifts' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Dumbbell size={24} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>LIFT TRACKER</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Log Bench, Squat, Deadlift & more</div>
              </div>
            </div>
          )}
          <div onClick={() => { setScreen('groups'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setProfileEntryScreen(null); setIsAddingAthlete(false); }}
               className="card-glass glow-card"
               style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'groups' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'groups' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Grid size={24} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>TEAMS</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Team comparison averages</div>
            </div>
          </div>

          <div onClick={() => { setScreen('alerts'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setProfileEntryScreen(null); setIsAddingAthlete(false); }}
               className="card-glass glow-card"
               style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'alerts' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'alerts' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <AlertTriangle size={24} style={{ color: unresolvedDailyAlertsCount > 0 ? '#ef4444' : 'var(--color-accent)' }} />
              {unresolvedDailyAlertsCount > 0 && (
                <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
                  {unresolvedDailyAlertsCount}
                </span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>Alerts & Deficits</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Rest warnings & fluctuations</div>
            </div>
          </div>

          <div onClick={() => { setScreen('reports'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setProfileEntryScreen(null); setIsAddingAthlete(false); }}
               className="card-glass glow-card"
               style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'reports' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'reports' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <FileText size={24} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>Reports & CSV</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Export database & spreadsheets</div>
            </div>
          </div>

          <div onClick={() => { setScreen('settings'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setProfileEntryScreen(null); setIsAddingAthlete(false); }}
               className="card-glass glow-card"
               style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'settings' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'settings' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Settings size={24} style={{ color: 'var(--color-accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>System Settings</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Admin configuration & cache</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '4px', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-950)', fontWeight: 800, fontSize: '12px' }}>{coachInitials}</div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)' }}>{settings.coachName}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{settings.organizationName}</div>
            </div>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', background: 'rgba(59, 130, 246, 0.15)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>{APP_VERSION}</span>
        </div>

      </div>
    </div>
  );
}
