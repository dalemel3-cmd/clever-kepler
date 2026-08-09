import { useState } from 'react';
import { Lock, LogIn, AlertTriangle, UserPlus } from 'lucide-react';
import { supabase, markSignedInBefore } from '../supabaseClient';
import { loadSettings } from '../settings';

/**
 * Turn a Supabase auth error into something a coach can act on.
 *
 * Everything that wasn't a network or confirmation problem used to be reported as
 * "Email or password is incorrect", which is wrong and actively misleading for the
 * common case of hitting the rate limit after a few fat-fingered attempts on a
 * phone keyboard. Only claim the password is wrong when the server actually said so.
 */
export function describeAuthError(err) {
  const msg = String(err?.message || '');
  const status = err?.status;

  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) {
    return 'Cannot reach the server. Check the connection and try again.';
  }
  if (status === 429 || /rate limit|too many requests/i.test(msg)) {
    return 'Too many sign-in attempts. Wait about a minute, then try again — this is a temporary lockout, not a wrong password.';
  }
  if (/Email not confirmed/i.test(msg)) {
    return 'That account still needs its email confirmed in Supabase.';
  }
  if (/Invalid login credentials|invalid_grant/i.test(msg)) {
    return 'Email or password is incorrect.';
  }
  if (status >= 500) {
    return 'The sign-in service is having trouble. Try again in a moment.';
  }
  // Anything unrecognised: show what the server said rather than guessing wrong.
  return msg || 'Could not sign in. Try again.';
}

export default function LoginScreen({ offlineNotice }) {
  const settings = loadSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isSignup = mode === 'signup';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (isSignup) {
      if (password.length < 8) {
        setError('Use a password of at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The two passwords do not match.');
        return;
      }
      return signUp();
    }
    setBusy(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        setError(describeAuthError(signInError));
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

  const signUp = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signUpError) {
        const msg = String(signUpError.message || '');
        if (/already registered|already exists/i.test(msg)) {
          setError('An account with that email already exists. Try signing in.');
        } else if (/signups not allowed|disabled/i.test(msg)) {
          setError('New accounts are turned off. Ask a coach to create one for you.');
        } else {
          setError(describeAuthError(signUpError));
        }
        setBusy(false);
        return;
      }
      markSignedInBefore();
      if (!data?.session) {
        // Email confirmation is on, so there's no session yet. AuthGate can't
        // take over; tell them here instead of leaving a dead screen.
        setNotice('Account created. Confirm your email, then sign in — a coach still needs to approve you before you can see athlete data.');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
        setBusy(false);
        return;
      }
      // Session exists: AuthGate re-resolves and shows the pending-approval screen.
    } catch (err) {
      setError('Cannot reach the server. Check the connection and try again.');
      setBusy(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
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
              {isSignup ? 'Request coach access' : (settings.organizationName || 'Sign in to continue')}
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

        {isSignup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="login-confirm" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Confirm password
            </label>
            <input
              id="login-confirm"
              type="password"
              autoComplete="new-password"
              className="input-glass"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
              style={{ height: '50px', padding: '0 16px', fontSize: '16px', borderRadius: '12px', fontWeight: 600 }}
            />
          </div>
        )}

        {notice && (
          <div style={{
            padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, lineHeight: 1.5,
            background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.4)', color: '#6ee7b7',
          }}>
            {notice}
          </div>
        )}

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
          {isSignup ? <UserPlus size={20} /> : <LogIn size={20} />}
          {busy ? (isSignup ? 'CREATING...' : 'SIGNING IN...') : (isSignup ? 'CREATE ACCOUNT' : 'SIGN IN')}
        </button>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          {isSignup ? (
            <>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Creating an account does not grant access on its own — an existing coach
                approves it before any athlete data is visible.
              </span>
              <button type="button" onClick={() => switchMode('signin')}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', padding: '4px' }}>
                Already have an account? Sign in
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Kiosk devices stay signed in — you only need to do this once per device.
              </span>
              <button type="button" onClick={() => switchMode('signup')}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', padding: '4px' }}>
                New coach? Create an account
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
