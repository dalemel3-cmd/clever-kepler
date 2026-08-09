import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cwfpjlomlvkburugolky.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZnBqbG9tbHZrYnVydWdvbGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNjMyMTQsImV4cCI6MjEwMDkzOTIxNH0.qcdyTHhg2Cyrtq3mpBP2_91IGQbiiWAOWvb8NFgfLNw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
  try { localStorage.setItem(SIGNED_IN_BEFORE_KEY, '1') } catch (e) { /* private mode */ }
}

export const hasSignedInBefore = () => {
  try { return localStorage.getItem(SIGNED_IN_BEFORE_KEY) === '1' } catch (e) { return false }
}

export const clearSignedInBefore = () => {
  try { localStorage.removeItem(SIGNED_IN_BEFORE_KEY) } catch (e) { /* private mode */ }
}
