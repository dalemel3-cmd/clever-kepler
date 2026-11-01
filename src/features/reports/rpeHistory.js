// Every session RPE row, for the Progress Card training strip (v5.15.0, docs/HANDOFF.md
// §144). The app keeps only the last dataWindowDays of check-ins in memory, but the strip
// now counts all sessions, so the card asks for just the RPE rows (small columns, a few
// hundred rows a season) and merges them with what is loaded. Kept for a few minutes so
// reopening the card doesn't refetch. Offline, braked or failed: null, and the card uses
// the loaded rows as they are.
import { supabase } from '../../supabaseClient';
import { allowFetch, fetchAllRows } from '../../utils/fetchBrake';
import { reportDataError } from '../../errorReporting';
import { isRpeLog } from '../../utils/athleteData';

const COLS = 'id,created_at,athlete_id,athlete_name,sport,weight_lbs,session_type,rpe,session_minutes,session_label';
const TTL = 5 * 60000;
let cache = null; // { at, rows }

export async function fetchRpeHistory() {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  if (!allowFetch('weigh_ins:rpe_history', { max: 3, windowMs: 60000 })) return null;
  try {
    // Paged by 1,000 and de-duplicated by id (fetchAllRows).
    const { data, error } = await fetchAllRows(() => supabase.from('weigh_ins').select(COLS).gt('rpe', 0)
      .order('created_at', { ascending: false }).order('id', { ascending: true }), { maxPages: 20 });
    if (error) { reportDataError(error, 'weigh_ins:rpe_history'); return null; }
    const out = (data || []).filter(isRpeLog);
    cache = { at: Date.now(), rows: out };
    return out;
  } catch { return null; }
}
