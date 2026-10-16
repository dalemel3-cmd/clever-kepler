// Usage guards (v5.8.0, docs/HANDOFF.md). After the v5.7.6 refetch loop burned 40 GB of
// Supabase egress in one night (Free plan: 5 GB/month), every bulk download goes through
// here so a future bug costs a few MB, not the month's quota.
import { supabase } from '../supabaseClient';
import { reportError } from '../errorReporting';

const hits = new Map();       // key -> recent timestamps (ms)
const reported = new Map();   // key -> last time we logged a trip

// Safety brake: allow at most `max` calls per `windowMs` for one key. Over the limit the
// call is refused (return false) and one app_errors row is written per 10 minutes.
export function allowFetch(key, { max = 6, windowMs = 60000 } = {}) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    if (now - (reported.get(key) || 0) > 600000) {
      reported.set(key, now);
      try { reportError(`Fetch brake tripped: ${key} called ${list.length + 1}x in ${Math.round(windowMs / 1000)}s - request skipped`, { source: 'fetch-brake' }); } catch { /* ignore */ }
    }
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

// Test hook so a Playwright run can inspect / reset the brake.
if (typeof window !== 'undefined') window.__hpdFetchBrake = { hits, reset: () => { hits.clear(); reported.clear(); } };

const FULL_REFRESH_MS = 24 * 3600 * 1000;

// Load a whole history table (lift_logs, performance_tests) without re-downloading it on
// every app open. With a cache: only rows newer than the newest cached row (2 min overlap
// for clock skew). A full download (which also catches edits/deletes made while this
// device was closed) happens at most once a day per device, or when there's no cache.
// Realtime keeps an open app current in between.
export async function loadHistoryTable({ table, columns, cached, stampKey, onFull, onDelta }) {
  let last = 0;
  try { last = Number(localStorage.getItem(stampKey) || 0); } catch { /* ignore */ }
  const newest = cached.reduce((m, r) => (r.created_at && r.created_at > m ? r.created_at : m), '');
  const incremental = cached.length > 0 && newest && Date.now() - last < FULL_REFRESH_MS;
  if (!allowFetch(`${table}:${incremental ? 'delta' : 'full'}`, { max: 4, windowMs: 60000 })) return { skipped: true };
  if (incremental) {
    const since = new Date(new Date(newest).getTime() - 120000).toISOString();
    const { data, error } = await supabase.from(table).select(columns).gt('created_at', since).order('created_at', { ascending: false });
    if (error) return { error };
    onDelta(data || []);
    return { mode: 'delta', count: (data || []).length };
  }
  const { data, error } = await supabase.from(table).select(columns).order('created_at', { ascending: false });
  if (error) return { error };
  try { localStorage.setItem(stampKey, String(Date.now())); } catch { /* ignore */ }
  onFull(data || []);
  return { mode: 'full', count: (data || []).length };
}
