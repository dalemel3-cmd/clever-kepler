// One lift list for every device (v5.16.6, db/019_shared_settings.sql, docs/HANDOFF.md §161).
// The buttons in Settings > Lift Tracker > Lift Types used to live in each device's own
// browser, so an iPad without Front Squat logged Squat. The list now lives in one database
// row; a device reads it when the app opens and when it returns to the front, copies it into
// its own settings (so it still works offline) and sends a changed list back on Save.
import { supabase } from '../supabaseClient';
import { allowFetch } from './fetchBrake';

const KEY = 'lift_types';
const CACHE_KEY = 'hpd_shared_lift_types'; // the cloud's list as this device last saw it

export function cleanLiftTypes(list) {
  if (!Array.isArray(list)) return null;
  const out = [...new Set(list.map(x => String(x ?? '').trim()).filter(Boolean))].slice(0, 30).map(x => x.slice(0, 40));
  return out.length ? out : null;
}
export const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

export function cachedSharedLiftTypes() {
  try { return cleanLiftTypes(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch { return null; }
}
const remember = (list) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

// The cloud's list, or null when it can't be read (offline, brake, no row, table not there yet).
export async function fetchSharedLiftTypes() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  if (!allowFetch('shared-lift-types', { max: 4, windowMs: 60000 })) return null;
  try {
    const { data, error } = await supabase.from('shared_settings').select('value').eq('key', KEY).maybeSingle();
    if (error) return null;
    return cleanLiftTypes(data?.value);
  } catch { return null; }
}

// Writes the list for every device. Resolves { ok, list }.
export async function saveSharedLiftTypes(list) {
  const clean = cleanLiftTypes(list);
  if (!clean) return { ok: false };
  try {
    const { error } = await supabase.from('shared_settings').upsert({ key: KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return { ok: false };
    remember(clean);
    return { ok: true, list: clean };
  } catch { return { ok: false }; }
}

// Decides what this device should do with the cloud's list. `local` is the list in its own
// settings. Adopt the cloud's list the first time, or whenever the cloud's list has changed
// since this device last saw it; otherwise leave the device alone (it may have an unsaved edit).
export function adoptDecision(cloud, local) {
  if (!cloud) return { adopt: false };
  const seen = cachedSharedLiftTypes();
  const adopt = !sameList(cloud, local) && (!seen || !sameList(cloud, seen));
  remember(cloud);
  return { adopt, list: cloud };
}
