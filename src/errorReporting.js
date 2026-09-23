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
      } catch { /* best-effort only */ }

      await supabase.from('app_errors').insert([{
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        source: source || 'unknown',
        url: typeof location !== 'undefined' ? location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        app_version: APP_VERSION,
        coach_email: coachEmail,
      }]);
    } catch { /* never let error reporting itself break anything */ }
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
    handleIfStaleChunk(event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason) || 'Unhandled promise rejection';
    reportError(message, {
      stack: reason?.stack,
      source: 'unhandledrejection',
    });
    handleIfStaleChunk(message);
  });
}

// A deploy replaces every lazy-loaded screen chunk with a new content-hashed
// filename and deletes the old ones from the server - a tab that loaded its shell
// before (or across) a deploy fails to fetch a screen it hasn't opened yet with
// exactly this error. Before this fix, that was a dead end: the coach was stuck on
// an error screen and a normal refresh didn't help, because the still-active old
// service worker keeps serving its own cached shell (same stale chunk references)
// regardless - only a hard refresh, which happens to bypass it, actually worked.
const STALE_CHUNK_PATTERN = /dynamically imported module|loading chunk .* failed|importing a module script failed/i;
export const isStaleChunkError = (message) => STALE_CHUNK_PATTERN.test(String(message || ''));

const RELOAD_GUARD_KEY = 'hpd_stale_chunk_reload_at';

// Forces the browser past the stale service worker entirely - unregistering it and
// clearing its caches guarantees the next load fetches the current deployment's
// real index.html and chunk hashes from the network, rather than hoping a plain
// reload happens to bypass the SW the way a manual hard refresh does.
async function forceFreshReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* best-effort - still reload even if cleanup partially failed */ }
  window.location.reload();
}

// Returns true if this was recognized and a reload was triggered, so the caller
// (the React ErrorBoundary, or a global handler) can skip rendering its own
// fallback UI - the page is about to navigate away anyway.
export function handleIfStaleChunk(message) {
  if (!isStaleChunkError(message)) return false;
  // Guard against a reload loop if the deployment is genuinely broken (not just
  // stale) - only auto-reload once per 30s, then let the normal error path take
  // over so a real problem doesn't just spin silently forever.
  let lastReload = 0;
  try { lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0; } catch {}
  if (Date.now() - lastReload <= 30000) return false;
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())); } catch {}
  forceFreshReload();
  return true;
}

// Data-layer failures (a Supabase read/write the server rejected - RLS, a bad column,
// a constraint) used to be returned to the caller and never logged anywhere. Offline /
// network failures are skipped on purpose: they're expected on a flaky gym Wi-Fi and
// already handled by the local cache, so logging them would just bury real errors.
export function reportDataError(err, source) {
  if (!err) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const message = err.message || String(err);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) return;
  reportError(message, { stack: err.stack || (err.code ? `code ${err.code}` : undefined), source });
}
