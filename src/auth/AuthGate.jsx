import { useCallback, useEffect, useState } from 'react';
import { supabase, markSignedInBefore, hasSignedInBefore } from '../supabaseClient';
import { checkApproval, wasApproved } from './approval';
import LoginScreen from './LoginScreen';
import PendingApproval from './PendingApproval';

/**
 * Decides whether to show the app, the login screen, or the pending-approval screen.
 *
 * Two behaviors here are deliberate and easy to break:
 *
 * 1. Offline kiosk. The weight room has to keep working when the WiFi drops. A device
 *    that has signed in before is let through even when the session or approval can't
 *    be verified, so weigh-ins keep landing in the offline queue instead of being lost
 *    behind a login wall. With RLS on, an expired token just means writes fail and get
 *    queued - the path the queue was built and tested for.
 *
 * 2. Migration ordering. This build ships before db/003_coach_approval.sql is run. Until
 *    it is, public.coaches doesn't exist and approval isn't a concept, so 'not-configured'
 *    means let everyone signed in through. The app must not break in that window.
 */
export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'in' | 'out' | 'pending'
  const [email, setEmail] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const resolve = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session) {
        // Only hold at the login screen if we could actually have reached the
        // server - otherwise this is the offline kiosk case.
        if (!navigator.onLine && hasSignedInBefore()) {
          setStatus('in');
          return;
        }
        setStatus('out');
        return;
      }

      markSignedInBefore();
      setEmail(session.user?.email || '');

      const verdict = await checkApproval(session.user?.id);
      if (verdict === 'approved' || verdict === 'not-configured') {
        setStatus('in');
      } else if (verdict === 'unknown') {
        // Couldn't reach the server. Trust the last known answer rather than
        // stranding a kiosk mid-session.
        setStatus(wasApproved() || !navigator.onLine ? 'in' : 'pending');
      } else {
        setStatus('pending');
      }
    } catch (e) {
      setStatus(hasSignedInBefore() ? 'in' : 'out');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const safeResolve = async () => { if (!cancelled) await resolve(); };

    safeResolve();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setEmail('');
        setStatus('out');
        return;
      }
      if (session) {
        markSignedInBefore();
        setEmail(session.user?.email || '');
        // Re-resolve rather than assuming: a fresh sign-in still needs approval.
        safeResolve();
      }
      // Token refresh failures are deliberately ignored: they must not eject a
      // kiosk mid-session. The next successful refresh or reload re-resolves.
    });

    const onOnline = () => { setIsOnline(true); safeResolve(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [resolve]);

  const recheck = async () => {
    setRechecking(true);
    await resolve();
    setRechecking(false);
  };

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

  if (status === 'out') return <LoginScreen offlineNotice={!isOnline} />;
  if (status === 'pending') return <PendingApproval email={email} onRecheck={recheck} rechecking={rechecking} />;
  return children;
}
