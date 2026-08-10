// App Version Tracking & Cloud Helpers
export const APP_VERSION = 'v4.12.1';

// Anchoring "today"/date-picker defaults to the program's timezone (rather than
// each device's own OS timezone) keeps every coach's device agreeing on what
// calendar day a practice session falls on, which matters most for evening or
// post-practice entries made close to midnight.
//
// Configured in Settings; App pushes the value here on load and on save so these
// pure helpers stay usable without threading settings through every call site.
let PROGRAM_TIMEZONE = 'America/Chicago';
let SEASON_START_DATE = '2026-08-03';

export const configureProgramContext = ({ programTimezone, seasonStartDate } = {}) => {
  if (programTimezone) {
    // Reject an invalid zone rather than letting Intl throw on every date format.
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: programTimezone });
      PROGRAM_TIMEZONE = programTimezone;
    } catch (e) {
      console.warn('Invalid program timezone, keeping', PROGRAM_TIMEZONE, e);
    }
  }
  if (seasonStartDate) SEASON_START_DATE = seasonStartDate;
};

export const getProgramTimezone = () => PROGRAM_TIMEZONE;

// Season start rendered the way dates appear elsewhere in the UI.
const seasonStartDisplay = () => {
  const d = new Date(`${SEASON_START_DATE}T12:00:00`);
  return isNaN(d.getTime()) ? SEASON_START_DATE : d.toLocaleDateString();
};

// Returns the given instant's date as "YYYY-MM-DD" in the program's timezone.
export const getCentralDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROGRAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

// Returns the given instant's time as "HH:MM" (24-hour) in the program's timezone.
export const getCentralTimeString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PROGRAM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(p => [p.type, p.value]));
  // Intl reports midnight as "24" with some engines - normalize to "00".
  const hour = lookup.hour === '24' ? '00' : lookup.hour;
  return `${hour}:${lookup.minute}`;
};

// Milliseconds the given timezone is ahead of UTC at the given instant.
const getTimeZoneOffsetMs = (date, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).map(p => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  return asUTC - date.getTime();
};

// Interprets "YYYY-MM-DD" + "HH:MM" as a wall-clock time in the program's timezone
// (America/Chicago) and returns the corresponding UTC ISO string, so manual log
// entries land on the same calendar day no matter what timezone the device is in.
// Returns null when the date/time is unparsable.
export const centralWallTimeToISO = (dateStr, timeStr = '12:00') => {
  if (!dateStr) return null;
  const guess = new Date(`${dateStr}T${timeStr || '12:00'}:00Z`);
  if (isNaN(guess.getTime())) return null;
  let offset = getTimeZoneOffsetMs(guess, PROGRAM_TIMEZONE);
  let ts = guess.getTime() - offset;
  // Second pass corrects entries that land right around a DST transition.
  const offset2 = getTimeZoneOffsetMs(new Date(ts), PROGRAM_TIMEZONE);
  if (offset2 !== offset) ts = guess.getTime() - offset2;
  return new Date(ts).toISOString();
};

export const isValidUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Sanity bounds for a human body weight entry (lbs). Rejects 0, negatives, and
// fat-fingered values like 9999999 before they pollute charts and averages.
let WEIGHT_BOUNDS = { min: 0, max: 1000 };
export const configureWeightBounds = (min, max) => {
  if (isFinite(min)) WEIGHT_BOUNDS.min = Number(min);
  if (isFinite(max)) WEIGHT_BOUNDS.max = Number(max);
};
export const isPlausibleWeight = (w) => typeof w === 'number' && !isNaN(w) && w > WEIGHT_BOUNDS.min && w <= WEIGHT_BOUNDS.max;
export const getWeightBounds = () => ({ ...WEIGHT_BOUNDS });

// ---- Cached localStorage JSON reads ----
// Hot paths (alert scans, baseline lookups, post-practice checks) used to JSON.parse
// these maps out of localStorage once per RECORD per render - O(athletes x logs)
// parses per frame. Cache the parsed maps briefly; writers invalidate immediately so
// same-render reads never see stale data from this device.
const JSON_CACHE_TTL_MS = 2000;
const jsonCache = new Map(); // storageKey -> { at, value }

const readCachedJson = (key) => {
  const hit = jsonCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < JSON_CACHE_TTL_MS) return hit.value;
  let value = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed && typeof parsed === 'object') value = parsed;
  } catch (e) {}
  jsonCache.set(key, { at: now, value });
  return value;
};

export const invalidateAthleteDataCache = (key) => {
  if (key) jsonCache.delete(key);
  else jsonCache.clear();
};

const getPostPracticeMap = () => readCachedJson('shiloh_post_practice_logs');
export const getBaselinesMap = () => readCachedJson('shiloh_baselines_map');

export const parseAthleteMeta = (posStr) => {
  if (!posStr || typeof posStr !== 'string') return { pos: posStr || '' };
  if (posStr.startsWith('{"') && posStr.endsWith('}')) {
    try {
      const parsed = JSON.parse(posStr);
      return {
        pos: parsed.pos !== undefined ? parsed.pos : '',
        bw: parsed.bw !== undefined ? Number(parsed.bw) : undefined,
        bd: parsed.bd,
        lid: parsed.lid
      };
    } catch(e) {
      return { pos: posStr };
    }
  }
  return { pos: posStr };
};

export const encodeAthleteMeta = (existingPos, baselineWeight, baselineDate, baselineLogId) => {
  const current = parseAthleteMeta(existingPos);
  return JSON.stringify({
    pos: current.pos || '',
    bw: baselineWeight !== undefined && baselineWeight !== null ? Number(baselineWeight) : current.bw,
    bd: baselineDate || current.bd,
    lid: baselineLogId !== undefined ? baselineLogId : current.lid
  });
};

export const isPostPracticeLog = (rec) => {
  if (!rec) return false;
  if (rec.session_type === 'post_practice' || rec.is_post_practice) return true;
  try {
    const ppMap = getPostPracticeMap();
    if (rec.id && ppMap[rec.id]) return true;
    if (rec.athlete_id && rec.created_at) {
      if (ppMap[`${rec.athlete_id}_${rec.created_at}`]) return true;
      const t = new Date(rec.created_at).getTime();
      if (!isNaN(t) && ppMap[`${rec.athlete_id}_${t}`]) return true;
      const prefix = String(rec.created_at).slice(0, 16);
      if (ppMap[`${rec.athlete_id}_${prefix}`]) return true;
    }
  } catch(e) {}
  return false;
};

export const markLogAsPostPractice = (rec) => {
  if (!rec) return;
  try {
    const ppMap = JSON.parse(localStorage.getItem('shiloh_post_practice_logs') || '{}');
    if (rec.id) ppMap[rec.id] = true;
    if (rec.athlete_id && rec.created_at) {
      ppMap[`${rec.athlete_id}_${rec.created_at}`] = true;
      const t = new Date(rec.created_at).getTime();
      if (!isNaN(t)) ppMap[`${rec.athlete_id}_${t}`] = true;
      const prefix = String(rec.created_at).slice(0, 16);
      ppMap[`${rec.athlete_id}_${prefix}`] = true;
    }
    localStorage.setItem('shiloh_post_practice_logs', JSON.stringify(ppMap));
    invalidateAthleteDataCache('shiloh_post_practice_logs');
  } catch(e) {}
};

export const getAthleteBaseline = (athlete, allLogs = []) => {
  if (!athlete) return null;
  const athId = athlete.id || athlete.athlete_id;

  let baseWeight = null;
  let baseDate = seasonStartDisplay();
  let baseLogId = null;

  // 1. Check custom override map first - it's the common case (fetchAthletes populates
  // it for every athlete with metadata) and needs no scan of the full log list.
  try {
    const customMap = getBaselinesMap();
    if (customMap[athId] && customMap[athId].weight_lbs && Number(customMap[athId].weight_lbs) > 0) {
      baseWeight = parseFloat(customMap[athId].weight_lbs);
      baseLogId = customMap[athId].log_id || 'map_base';
      const dVal = customMap[athId].date_str || customMap[athId].date;
      baseDate = dVal ? (!isNaN(new Date(dVal).getTime()) ? new Date(dVal).toLocaleDateString() : dVal) : seasonStartDisplay();
      return { weight_lbs: baseWeight, date_str: baseDate, id: baseLogId };
    }
  } catch(e) {}

  // Only filter + sort the full log list when no override exists.
  const athleteRecords = allLogs
    .filter(r => (r.athlete_id === athId || r.id === athId) && hasWeight(r) && !isPostPracticeLog(r) && !isRpeLog(r))
    .sort((a, b) => new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0));

  // 2. Check for explicit is_baseline === true log (most recent first)
  const explicitBaseLog = [...athleteRecords].reverse().find(r => r.is_baseline === true || r.is_baseline === 'true' || r.is_baseline === 1);
  if (explicitBaseLog && explicitBaseLog.weight_lbs) {
    baseWeight = parseFloat(explicitBaseLog.weight_lbs);
    baseDate = explicitBaseLog.created_at ? new Date(explicitBaseLog.created_at).toLocaleDateString() : (explicitBaseLog.date || seasonStartDisplay());
    return { weight_lbs: baseWeight, date_str: baseDate, id: explicitBaseLog.id };
  }

  // 3. Check for a weigh-in recorded on the configured season start date.
  const seasonStartLog = [...athleteRecords].reverse().find(r => {
    const dStr = r.created_at || r.date || '';
    if (typeof dStr === 'string' && dStr.includes(SEASON_START_DATE)) return true;
    const parsed = new Date(dStr);
    return !isNaN(parsed.getTime()) && parsed.toLocaleDateString() === seasonStartDisplay();
  });
  if (seasonStartLog && seasonStartLog.weight_lbs) {
    baseWeight = parseFloat(seasonStartLog.weight_lbs);
    baseDate = seasonStartDisplay();
    return { weight_lbs: baseWeight, date_str: baseDate, id: seasonStartLog.id };
  }

  // 4. Check athlete table baseline_weight or position metadata
  const meta = parseAthleteMeta(athlete.position || '');
  const bw = athlete.baseline_weight || meta.bw || meta.baseline_weight;
  if (bw && Number(bw) > 0) {
    baseWeight = parseFloat(bw);
    baseDate = meta.bd || athlete.baseline_date || seasonStartDisplay();
    return { weight_lbs: baseWeight, date_str: baseDate, id: 'meta_base' };
  }

  // 5. Fallback: if they have logs, take their second to last log or first ever log as baseline
  if (athleteRecords.length > 1) {
    const fallbackLog = athleteRecords[athleteRecords.length - 2];
    baseWeight = parseFloat(fallbackLog.weight_lbs);
    baseDate = fallbackLog.created_at ? new Date(fallbackLog.created_at).toLocaleDateString() : (fallbackLog.date || 'Established');
    return { weight_lbs: baseWeight, date_str: baseDate, id: fallbackLog.id };
  } else if (athleteRecords.length === 1) {
    const fallbackLog = athleteRecords[0];
    baseWeight = parseFloat(fallbackLog.weight_lbs);
    baseDate = fallbackLog.created_at ? new Date(fallbackLog.created_at).toLocaleDateString() : (fallbackLog.date || 'Established');
    return { weight_lbs: baseWeight, date_str: baseDate, id: fallbackLog.id };
  }

  return null;
};

// RPE & Training Load Predicates
export const isRpeLog   = (r) => r?.session_type === 'rpe' || (r?.rpe != null && !r?.weight_lbs);
export const hasWeight  = (r) => r?.weight_lbs != null && Number(r.weight_lbs) > 0;
export const hasSleep   = (r) => r?.sleep_hrs != null && Number(r.sleep_hrs) > 0;
