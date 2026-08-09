import { Clock, RefreshCw, LogOut } from 'lucide-react';
import { supabase, clearSignedInBefore } from '../supabaseClient';
import { clearApprovalCache } from './approval';
import { loadSettings } from '../settings';

export default function PendingApproval({ email, onRecheck, rechecking }) {
  const settings = loadSettings();

  const signOut = async () => {
    clearSignedInBefore();
    clearApprovalCache();
    try { await supabase.auth.signOut(); } catch (e) { /* offline: local state already cleared */ }
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', background: 'var(--navy-950, #050b14)',
    }}>
      <div
        className="card-glass"
        style={{
          width: '100%', maxWidth: '460px', padding: '32px',
          display: 'flex', flexDirection: 'column', gap: '20px',
          borderRadius: '24px', border: '1px solid rgba(234, 179, 8, 0.5)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24', flexShrink: 0,
          }}>
            <Clock size={26} />
          </div>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, margin: 0,
              color: 'var(--white, #fff)', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.15,
            }}>
              Waiting for approval
            </h1>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              {email || 'Your account'}
            </span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Your account was created, but a coach at{' '}
          <strong style={{ color: 'var(--white)' }}>{settings.organizationName}</strong> still has to
          approve it before you can see athlete data.
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Ask them to open <strong style={{ color: 'var(--color-accent)' }}>Settings → Coach Access</strong>{' '}
          and approve you. Then tap below.
        </p>

        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="btn-primary"
          style={{
            height: '50px', fontSize: '15px', fontWeight: 800, borderRadius: '14px',
            background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none',
            cursor: rechecking ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          }}
        >
          <RefreshCw size={18} style={{ animation: rechecking ? 'spin 1s linear infinite' : 'none' }} />
          {rechecking ? 'CHECKING...' : "I'VE BEEN APPROVED — CHECK AGAIN"}
        </button>

        <button
          type="button"
          onClick={signOut}
          style={{
            height: '44px', fontSize: '13px', fontWeight: 700, borderRadius: '12px',
            background: 'transparent', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
