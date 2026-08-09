import { supabase } from '../supabaseClient';

// Remembers the last confirmed approval so an offline kiosk isn't stranded at a
// "pending" screen when it can't reach the server to re-check.
const APPROVED_CACHE_KEY = 'hpd_approved';

const cacheApproved = (yes) => {
  try {
    if (yes) localStorage.setItem(APPROVED_CACHE_KEY, '1');
    else localStorage.removeItem(APPROVED_CACHE_KEY);
  } catch (e) { /* private mode */ }
};

export const wasApproved = () => {
  try { return localStorage.getItem(APPROVED_CACHE_KEY) === '1'; } catch (e) { return false; }
};

export const clearApprovalCache = () => cacheApproved(false);

// Postgres/PostgREST codes meaning "public.coaches isn't there".
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST106', 'PGRST202']);
const looksMissing = (error) =>
  !!error && (
    MISSING_TABLE_CODES.has(error.code) ||
    /does not exist|not find the table|schema cache/i.test(String(error.message || ''))
  );

/**
 * Resolve whether the signed-in user may use the app.
 *
 * Returns one of:
 *   'approved'       - let them in
 *   'pending'        - signed up, awaiting approval
 *   'not-configured' - db/003_coach_approval.sql hasn't been run yet, so approval
 *                      isn't a concept in this database. Let them in; the app has
 *                      to keep working between deploying this build and running
 *                      the migration.
 *   'unknown'        - couldn't reach the server. Caller decides using wasApproved().
 */
// supabase-js retries a failing request rather than rejecting promptly, so an
// unreachable server left this promise pending and the app stuck on "Loading..."
// forever. Cap it: a slow answer is treated as no answer, and the caller falls
// back to the cached verdict.
const APPROVAL_TIMEOUT_MS = 4000;

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), APPROVAL_TIMEOUT_MS)),
]);

export async function checkApproval(userId) {
  if (!userId) return 'pending';
  try {
    const result = await withTimeout(
      supabase.from('coaches').select('approved').eq('user_id', userId).maybeSingle()
    );
    if (result?.timedOut) return 'unknown';
    const { data, error } = result;

    if (error) {
      if (looksMissing(error)) return 'not-configured';
      // Any other error (network, RLS oddity) is inconclusive rather than a denial:
      // treating it as denial would lock out a kiosk over a flaky connection.
      return 'unknown';
    }

    // No row: either the sign-up trigger hasn't fired yet or RLS is hiding it.
    // Both mean "not approved".
    const approved = !!(data && data.approved);
    cacheApproved(approved);
    return approved ? 'approved' : 'pending';
  } catch (e) {
    return 'unknown';
  }
}
