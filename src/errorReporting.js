import { supabase } from './supabaseClient';
import { APP_VERSION } from './utils/athleteData';

// Lightweight production error capture (v5.1.2). Until now a real crash or exception
// only ever reached the browser console - nobody found out unless a coach happened to
// notice something looked wrong and sent a screenshot. This writes a row to
// public.app_errors instead, so errors are visible without waiting on that.
//
// Per-session caps, not per-error-type dedup: a genuinely repeating error (e.g. a bad
// render loop) would otherwise flood the table with hundreds of identical rows in
// seconds. A flat session cap is simpler than tracking unique messages and good enough
// for a triage feed - the first several occurrences of anything are already enough to
// diagnose it.
const MAX_REPORTS_PER_SESSION = 20;
let reportCount = 0;

export function reportError(message, { stack, source } = {}) {
  if (reportCount >= MAX_REPORTS_PER_SESSION) return;
  reportCount++;

  // Fire-and-forget: reporting a bug must never itself throw, and never blocks the
  // UI the coach is trying to use. Failure here (offline, not signed in yet, RLS
  // rejecting an unapproved account) is silently swallowed on purpose.
  (async () => {
    try {
      let coachEmail = null;
      try {
        const { data } = await supabase.auth.getSession();
        coachEmail = data?.session?.user?.email || null;
      } catch (e) { /* best-effort only */ }

      await supabase.from('app_errors').insert([{
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        source: source || 'unknown',
        url: typeof location !== 'undefined' ? location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        app_version: APP_VERSION,
        coach_email: coachEmail,
      }]);
    } catch (e) { /* never let error reporting itself break anything */ }
  })();
}

// Installs the two global catches that a React ErrorBoundary can't see on its own:
// errors thrown outside any component render (event handlers, timers, third-party
// scripts) and rejected promises nobody caught. Call once, at app startup.
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => {
    reportError(event.message || 'Unknown window error', {
      stack: event.error?.stack,
      source: 'window.onerror',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError(reason?.message || String(reason) || 'Unhandled promise rejection', {
      stack: reason?.stack,
      source: 'unhandledrejection',
    });
  });
}
