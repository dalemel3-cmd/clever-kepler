import { useEffect, useState } from 'react';
import { supabase, markSignedInBefore, hasSignedInBefore } from '../supabaseClient';
import LoginScreen from './LoginScreen';

/**
 * Decides whether to show the app or the login screen.
 *
 * The important behavior here is the offline case. The weight-room kiosk has to keep
 * working when the gym WiFi drops: if this device has signed in before, we let the app
 * through even when the session can't be verified, so weigh-ins keep landing in the
 * offline queue instead of being lost behind a login wall. With RLS on, an expired
 * token simply means writes fail and get queued - which is exactly the path the queue
 * was built and tested for.
 */
export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'in' | 'out'
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data?.session) {
          markSignedInBefore();
          setStatus('in');
          return;
        }
        // No usable session. Only hold the user at the login screen if we could
        // actually have reached the server - otherwise this is the offline kiosk case.
        if (!navigator.onLine && hasSignedInBefore()) {
          setStatus('in');
          return;
        }
        setStatus('out');
      } catch (e) {
        // getSession only throws on storage problems; fail open for known devices.
        if (cancelled) return;
        setStatus(hasSignedInBefore() ? 'in' : 'out');
      }
    };

    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session) {
        markSignedInBefore();
        setStatus('in');
      } else if (event === 'SIGNED_OUT') {
        // An explicit sign-out always returns to the login screen, even offline.
        setStatus('out');
      }
      // Token refresh failures are deliberately ignored: they must not eject a
      // kiosk mid-session. The next successful refresh or reload re-resolves.
    });

    const onOnline = () => { setIsOnline(true); resolve(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (status === 'checking') {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--navy-950, #050b14)', color: 'var(--color-text-muted, #8b93a7)',
        fontSize: '14px', fontWeight: 700, letterSpacing: '0.05em',
      }}>
        Loading...
      </div>
    );
  }

  if (status === 'out') {
    return <LoginScreen offlineNotice={!isOnline} />;
  }

  return children;
}
