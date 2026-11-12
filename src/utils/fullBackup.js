// Full backup (v5.16.1, docs/HANDOFF.md §156): every row of the tables a coach can read,
// as one JSON file kept outside the app. The database is on Supabase's free plan, which
// has no automatic backups, so until this the records existed in one place only.
// Each table is counted first and the file is refused unless every row came back:
// a backup that is quietly short is worse than none.
import { supabase } from '../supabaseClient';
import { allowFetch } from './fetchBrake';
import { getCentralDateString } from './athleteData';

export const BACKUP_TABLES = ['athletes', 'weigh_ins', 'lift_logs', 'performance_tests', 'programs', 'workout_sessions', 'alert_status'];
export const LAST_BACKUP_KEY = 'hpd_last_full_backup_at';
const LABEL = { athletes: 'athletes', weigh_ins: 'check-ins', lift_logs: 'lifts', performance_tests: 'tests', programs: 'programs', workout_sessions: 'workout sessions', alert_status: 'alert notes' };
const PAGE = 1000; // Supabase sends at most 1,000 rows a request

// Every row of one table, a page at a time by id. Not by position: a check-in added or
// deleted while this runs would shift the pages, and a row could be skipped unnoticed.
async function readTable(table) {
  const rows = [];
  let last = null;
  for (let p = 0; p < 500; p++) {
    let q = supabase.from(table).select('*').order('id').limit(PAGE);
    if (last != null) q = q.gt('id', last);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
    last = data[data.length - 1].id;
  }
  return null; // past 500,000 rows: more than this should vouch for
}

export async function buildFullBackup({ appVersion = '' } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: "You're offline. Connect to download a backup." };
  if (!allowFetch('full-backup', { max: 4, windowMs: 60000 })) return { error: 'Too many tries in a minute. Wait a minute and try again.' };
  const tables = {}, counts = {};
  for (const t of BACKUP_TABLES) {
    const head = await supabase.from(t).select('id', { count: 'exact', head: true });
    if (head.error || head.count == null) return { error: `Couldn't read the ${LABEL[t]}. Nothing was saved; try again.` };
    const rows = await readTable(t);
    if (!rows) return { error: `Couldn't read the ${LABEL[t]}. Nothing was saved; try again.` };
    // Rows added while it ran are fine (more than counted); fewer means it is incomplete.
    if (rows.length < head.count) return { error: `The copy of the ${LABEL[t]} came back incomplete (${rows.length} of ${head.count}). Nothing was saved; try again.` };
    tables[t] = rows;
    counts[t] = rows.length;
  }
  // A database that answers with nothing (signed out, access rules changed) is not a backup.
  if (!counts.athletes) return { error: 'The roster came back empty, so nothing was saved. Check that you are signed in and try again.' };
  return { backup: { kind: 'hpd-full-backup', format: 1, app_version: appVersion, created_at: new Date().toISOString(), counts, tables } };
}

// Named with the Central date (the UTC date is already tomorrow from 6 pm).
export const backupFileName = (d = new Date()) => `hpd-full-backup-${getCentralDateString(d)}.json`;
export const backupFile = (backup) => new File([JSON.stringify(backup)], backupFileName(new Date(backup.created_at)), { type: 'application/json' });

// Whole days since a backup was last saved from this device, or null if never.
export function daysSinceBackup(now = Date.now()) {
  let t = 0;
  try { t = Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0; } catch { /* ignore */ }
  return t ? Math.max(0, Math.floor((now - t) / 86400000)) : null;
}
const markSaved = () => { try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* ignore */ } };

// iPhone and iPad (an iPad can report itself as a Mac). In a home-screen app there, a plain
// download link can do nothing at all, with no error (WebKit bug 275288), so the file goes
// through the share sheet ("Save to Files"), which reports whether it was saved or cancelled.
// The share sheet only opens straight from a tap, so the screen asks for a second tap.
export function needsShareSheet() {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

// Resolves { saved, cancelled }. Call it directly from a tap.
export async function saveBackupFile(file) {
  if (needsShareSheet() && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { return { saved: false, cancelled: e?.name === 'AbortError' }; }
    markSaved();
    return { saved: true, via: 'share' };
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60000); // long enough to answer a save prompt
  markSaved();
  return { saved: true, via: 'download' };
}
