import { useState } from 'react';
import { Lock, LogIn, AlertTriangle } from 'lucide-react';
import { supabase, markSignedInBefore } from '../supabaseClient';
import { loadSettings } from '../settings';

export default function LoginScreen({ offlineNotice }) {
  const settings = loadSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        // Supabase returns a deliberately vague message for bad credentials;
        // separate out the genuinely actionable cases.
        const msg = String(signInError.message || '');
        if (/Failed to fetch|NetworkError|fetch/i.test(msg)) {
          setError('Cannot reach the server. Check the connection and try again.');
        } else if (/Email not confirmed/i.test(msg)) {
          setError('That account still needs its email confirmed in Supabase.');
        } else {
          setError('Email or password is incorrect.');
        }
        setBusy(false);
        return;
      }
      markSignedInBefore();
      // onAuthStateChange in AuthGate takes it from here.
    } catch (err) {
      setError('Cannot reach the server. Check the connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--navy-950, #050b14)',
    }}>
      <form
        onSubmit={submit}
        className="card-glass glow-card"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          borderRadius: '24px',
          border: '1px solid var(--color-accent)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'rgba(184, 156, 91, 0.15)', border: '1px solid var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)',
            flexShrink: 0,
          }}>
            <Lock size={26} />
          </div>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: 0,
              color: 'var(--white, #fff)', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.1,
            }}>
              {settings.programName || 'Human Performance'}
            </h1>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              {settings.organizationName || 'Sign in to continue'}
            </span>
          </div>
        </div>

        {offlineNotice && (
          <div style={{
            padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, lineHeight: 1.5,
            background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.45)', color: '#fbbf24',
            display: 'flex', gap: '10px', alignItems: 'flex-start',
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>You appear to be offline. Signing in for the first time on this device needs a connection.</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="login-email" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            className="input-glass"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            style={{ height: '50px', padding: '0 16px', fontSize: '16px', borderRadius: '12px', fontWeight: 600 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="login-password" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className="input-glass"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            style={{ height: '50px', padding: '0 16px', fontSize: '16px', borderRadius: '12px', fontWeight: 600 }}
          />
        </div>

        {error && (
          <div role="alert" style={{
            padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.45)', color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary glow-card"
          style={{
            height: '54px', fontSize: '16px', fontWeight: 800, borderRadius: '14px',
            background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none',
            cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '10px', opacity: busy ? 0.7 : 1,
          }}
        >
          <LogIn size={20} /> {busy ? 'SIGNING IN...' : 'SIGN IN'}
        </button>

        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
          Kiosk devices stay signed in — you only need to do this once per device.
        </span>
      </form>
    </div>
  );
}
