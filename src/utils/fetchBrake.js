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

// PostgREST returns at most 1,000 rows per request (Supabase's max-rows), and a longer
// result comes back cut short with no error. By 2026-11 lift_logs (1,218) and
// performance_tests (1,492) had passed it, so the daily full refresh quietly dropped the
// oldest history (v5.15.4, docs/HANDOFF.md §149). Any read that can pass 1,000 rows pages
// through here. `build()` returns a fresh, ordered query; pages are requested until one
// comes back short. Rows are de-duplicated by id (an insert during paging shifts the
// next page by one row).
export const PAGE_ROWS = 1000;
export async function fetchAllRows(build, { maxPages = 50 } = {}) {
  const rows = [];
  const seen = new Set();
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await build().range(p * PAGE_ROWS, p * PAGE_ROWS + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    const before = rows.length;
    for (const r of data || []) {
      if (r?.id != null) { if (seen.has(r.id)) continue; seen.add(r.id); }
      rows.push(r);
    }
    // Done on a short page. Also stop if the server ignored the range (sent more than a
    // page) or a page brought nothing new, rather than asking again up to maxPages times.
    if (!data || data.length !== PAGE_ROWS || rows.length === before) break;
  }
  return { data: rows, error: null };
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
    const { data, error } = await fetchAllRows(() => supabase.from(table).select(columns).gt('created_at', since).order('created_at', { ascending: false }).order('id'));
    if (error) return { error };
    onDelta(data || []);
    return { mode: 'delta', count: (data || []).length };
  }
  const { data, error } = await fetchAllRows(() => supabase.from(table).select(columns).order('created_at', { ascending: false }).order('id'));
  if (error) return { error };
  try { localStorage.setItem(stampKey, String(Date.now())); } catch { /* ignore */ }
  onFull(data || []);
  return { mode: 'full', count: (data || []).length };
}
