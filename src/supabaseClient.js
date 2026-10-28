import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cwfpjlomlvkburugolky.supabase.co'
// Publishable key (v5.10.1, docs/RUNBOOK.md). Supabase retires the legacy JWT `anon` key
// at the end of 2026; the publishable key has the same low privileges (Row Level
// Security still decides what a signed-in coach can see) and is meant to ship in apps.
// Built in on purpose, so the app keeps working with no build-time settings at all.
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2DNcJ1rW-cm9NT_OrrYpSA_QTLyiDqs'

// "JWT issued at future": right after a token refresh, a device whose clock runs a
// little behind the auth server can present a token the database sees as not valid yet.
// The read failed once and the roster came up empty until a manual refresh (seen on
// 2026-10-01). It clears within a second or two, so retry those requests - and only
// those - a couple of times before giving up.
const SKEW_RE = /issued at future|nbf|not yet valid/i;
const skewSafeFetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 401 || attempt >= 2) return res;
    let body = '';
    try { body = await res.clone().text(); } catch { return res; }
    if (!SKEW_RE.test(body)) return res;
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: skewSafeFetch },
  auth: {
    // The weight-room kiosk must stay signed in indefinitely: the session is
    // persisted to localStorage and refreshed in the background, so an iPad that
    // comes online periodically never has to be signed in again.
    persistSession: true,
    autoRefreshToken: true,
    // No magic-link or OAuth redirects in use, so don't scan the URL for tokens.
    detectSessionInUrl: false,
    storageKey: 'hpd_auth',
  },
})

// Marker used to distinguish "never signed in on this device" from "signed in
// before but currently offline". Without it, an offline kiosk with an expired
// token would be locked out mid-practice and weigh-ins couldn't be queued.
export const SIGNED_IN_BEFORE_KEY = 'hpd_signed_in_before'

export const markSignedInBefore = () => {
  try { localStorage.setItem(SIGNED_IN_BEFORE_KEY, '1') } catch { /* private mode */ }
}

export const hasSignedInBefore = () => {
  try { return localStorage.getItem(SIGNED_IN_BEFORE_KEY) === '1' } catch { return false }
}

export const clearSignedInBefore = () => {
  try { localStorage.removeItem(SIGNED_IN_BEFORE_KEY) } catch { /* private mode */ }
}
