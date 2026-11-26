// Titan GPS (v5.16.7, docs/HANDOFF.md §162): reading the Titan "synced data" CSV, matching its
// player names to the roster, and the weekly numbers the GPS tab shows. Pure functions, no React.
// Units as exported by Titan: distance in yards, top speed in mi/hr, high-speed accelerations
// and decelerations (4-8 m/s^2) as counts, speed band (12.5-22.4 mph) in yards, personal band
// (80% or faster of the athlete's top mph) in yards.

// ---- CSV -------------------------------------------------------------------------------
export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// header text (squashed) -> field. Titan writes "GPS Accel Zones  Count" with two spaces.
const FIELDS = [
  ['date', ['date']],
  ['name', ['player name', 'player', 'athlete', 'athlete name', 'name']],
  ['distance_yd', ['gps distance']],
  ['top_speed_mph', ['gps top speed']],
  ['accel_count', ['gps accel zones count']],
  ['decel_count', ['gps decel zones count']],
  ['high_speed_yd', ['gps speed bands distance']],
  ['personal_band_yd', ['gps personal bands distance']],
];
const REQUIRED = ['date', 'name', 'distance_yd', 'top_speed_mph'];

export const isoFromUs = (s) => {
  const str = String(s || '');
  let y, mo, d, m;
  if ((m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str))) { mo = m[1]; d = m[2]; y = m[3]; }
  else if ((m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(str))) { y = m[1]; mo = m[2]; d = m[3]; }
  else return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
};
// -> { v: number|null, blank: bool, bad: bool }: a blank cell and an unreadable one are told apart.
const numCell = (v) => { const s = String(v ?? '').trim(); if (s === '') return { v: null, blank: true, bad: false }; const n = Number(s); return Number.isFinite(n) ? { v: n, blank: false, bad: false } : { v: null, blank: false, bad: true }; };
export const METRICS = ['distance_yd', 'top_speed_mph', 'accel_count', 'decel_count', 'high_speed_yd', 'personal_band_yd'];

// -> { rows: [{ line, name, date, distance_yd, ... }], errors: [text], badRows: n }
export function parseTitan(text) {
  const grid = parseCsv(text);
  if (grid.length < 2) return { rows: [], errors: ['The file is empty.'], badRows: 0 };
  const head = grid[0].map(squash);
  const col = {};
  for (const [field, names] of FIELDS) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) col[field] = i; }
  const missing = REQUIRED.filter(f => col[f] == null);
  if (missing.length) {
    const label = { date: 'Date', name: 'Player Name', distance_yd: 'GPS Distance', top_speed_mph: 'GPS Top Speed' };
    return { rows: [], errors: [`This doesn't look like the Titan export: missing ${missing.map(f => label[f]).join(', ')}.`], badRows: 0 };
  }
  const present = METRICS.filter(k => col[k] != null);
  const rows = []; let badRows = 0, blankCells = 0, badNumbers = 0;
  grid.slice(1).forEach((r, k) => {
    const date = isoFromUs(r[col.date]);
    const name = String(r[col.name] ?? '').trim().replace(/\s+/g, ' ');
    if (!date || !name) { badRows++; return; }
    const row = { line: k + 2, name, date };
    for (const f of present) {
      const c = numCell(r[col[f]]);
      row[f] = c.v;
      if (c.blank) blankCells++;
      if (c.bad) badNumbers++;
    }
    rows.push(row);
  });
  return { rows, errors: [], badRows, present, blankCells, badNumbers };
}

// ---- names -----------------------------------------------------------------------------
export const normName = (s) => squash(s);

// The roster athlete for a Titan name: { athlete, kind: 'exact' | 'partial' } or null.
// Exact (ignoring case and spacing) first. Then, only for names of three or more plain words, the
// last two words ("xcdelta Cal Delta" -> "cal delta"): reported as 'partial' so the owner sees it.
// Names with an apostrophe or hyphen are never guessed, and a name two athletes share never is.
export function matchAthlete(name, athletes) {
  const full = normName(name);
  if (!full) return null;
  const hits = (key) => athletes.filter(a => normName(a.name) === key);
  const exact = hits(full);
  if (exact.length === 1) return { athlete: exact[0], kind: 'exact' };
  if (exact.length > 1) return null;
  if (/['’\-]/.test(String(name))) return null;
  const words = full.split(' ');
  if (words.length > 2) { const p = hits(words.slice(-2).join(' ')); if (p.length === 1) return { athlete: p[0], kind: 'partial' }; }
  return null;
}

const isZeroRow = (r, present) => present.every(k => !r[k]);

// What an upload would do. `manual`: { titanName: athleteId | 'skip' } chosen by hand.
// Saved rows carry only the columns that are in the file, so a column Titan left out never
// blanks what is already saved. `needsLook` lists every name that was not an exact match (to be
// chosen by hand, or matched by its last two words), and stays listed after a choice is made.
export function buildImport(parsed, athletes, manual = {}) {
  const byId = new Map(athletes.map(a => [a.id, a]));
  const present = parsed.present || METRICS;
  const out = new Map();           // athleteId|date -> row to save
  const look = new Map();          // titan name -> { name, count, suggested: athleteId|null }
  let skippedZero = 0, duplicates = 0, skippedByHand = 0, outOfRange = 0;
  const dates = new Set(), athleteIds = new Set();
  for (const r of parsed.rows) {
    if (isZeroRow(r, present)) { skippedZero++; continue; }
    const auto = matchAthlete(r.name, athletes);
    if (!auto || auto.kind !== 'exact') {
      const cur = look.get(r.name) || { name: r.name, count: 0, suggested: auto ? auto.athlete.id : null };
      cur.count++; look.set(r.name, cur);
    }
    const m = manual[r.name];
    if (m === 'skip') { skippedByHand++; continue; }
    const a = m && byId.has(m) ? byId.get(m) : (auto ? auto.athlete : null);
    if (!a) continue;
    if ((r.distance_yd ?? 0) > 30000 || (r.distance_yd ?? 0) < 0 || (r.top_speed_mph ?? 0) > 35 || (r.top_speed_mph ?? 0) < 0) outOfRange++;
    const key = `${a.id}|${r.date}`;
    if (out.has(key)) duplicates++;
    const row = { athlete_id: a.id, session_date: r.date, source: 'titan' };
    for (const f of present) row[f] = r[f];
    out.set(key, row);
    dates.add(r.date); athleteIds.add(a.id);
  }
  const needsLook = [...look.values()].map(x => ({ ...x, chosen: manual[x.name] || x.suggested || '' }));
  const unresolved = needsLook.filter(x => !x.chosen).length;
  return { rows: [...out.values()], needsLook, unresolved, skippedZero, duplicates, skippedByHand, outOfRange, days: [...dates].sort(), athleteCount: athleteIds.size, present };
}

// ---- weeks -----------------------------------------------------------------------------
const DAY = 86400000;
const utcDay = (iso) => Date.parse(`${iso}T00:00:00Z`);
// The Monday on or before an ISO date.
export const weekStart = (iso) => { const t = utcDay(iso); const dow = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dow * DAY).toISOString().slice(0, 10); };

// Weekly totals for one athlete, oldest first, the `weeks` weeks ending with the week of `today`.
// Weeks with no sessions are empty (null), not zero.
export function weeklyTotals(sessions, athleteId, weeks, today) {
  const thisWeek = weekStart(today);
  const out = Array.from({ length: weeks }, (_, i) => ({ week: new Date(utcDay(thisWeek) - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10), days: 0, distance_yd: null, high_speed_yd: null, personal_band_yd: null, top_speed_mph: null, accel_count: null, decel_count: null }));
  const idx = new Map(out.map((w, i) => [w.week, i]));
  for (const s of sessions) {
    if (s.athlete_id !== athleteId) continue;
    const w = out[idx.get(weekStart(s.session_date))];
    if (!w) continue;
    w.days++;
    for (const k of ['distance_yd', 'high_speed_yd', 'personal_band_yd', 'accel_count', 'decel_count']) if (s[k] != null) w[k] = (w[k] || 0) + Number(s[k]);
    if (s.top_speed_mph != null) w.top_speed_mph = Math.max(w.top_speed_mph ?? 0, Number(s.top_speed_mph));
  }
  return out;
}

// Average of the `n` weeks before the latest week that has data, for "this week vs recent".
export const recentAverage = (totals, key, n = 4) => {
  const past = totals.slice(0, -1).filter(w => w[key] != null).slice(-n);
  return past.length ? past.reduce((s, w) => s + w[key], 0) / past.length : null;
};

// ---- team views (v5.16.9) ----------------------------------------------------------------
const isoMinus = (iso, n) => new Date(utcDay(iso) - n * DAY).toISOString().slice(0, 10);

// The days anyone has a session in the `n` days ending with `end`, oldest first.
export function windowDays(sessions, end, n) {
  if (!end) return [];
  const start = isoMinus(end, n - 1);
  return [...new Set(sessions.filter(s => s.session_date >= start && s.session_date <= end).map(s => s.session_date))].sort();
}

// One athlete's value for each of `dates` (null where they have no session that day).
export function seriesFor(sessions, athleteId, dates, key) {
  const by = new Map();
  for (const s of sessions) if (s.athlete_id === athleteId && s[key] != null) by.set(s.session_date, Number(s[key]));
  return dates.map(d => (by.has(d) ? by.get(d) : null));
}

// The team's average for each of `dates`, over the athletes who have a value that day.
export function teamAverage(sessions, athleteIds, dates, key) {
  const ids = new Set(athleteIds);
  return dates.map(d => {
    const v = sessions.filter(s => s.session_date === d && ids.has(s.athlete_id) && s[key] != null).map(s => Number(s[key]));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
}

// Short text for a grid cell: 6439.9 yd -> "6.4k", 495.6 -> "496", 17.22 mph -> "17.2".
export function compact(v, key) {
  if (v == null || Number.isNaN(v)) return '';
  if (key === 'top_speed_mph') return v.toFixed(1);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

// ---- acute : chronic (v5.17.0) -----------------------------------------------------------
// For each athlete with a session in the 28 days ending `end`: totals of `key` over the last 7,
// 14 and 28 days (inclusive of `end`), and two ratios against the chronic weekly average
// (28-day total / 4): 7:28 = 7-day total / weekly average; 14:28 = (14-day total / 2) / weekly
// average. 1.0 = this week like the last four. `building` = under 3 weeks of history before `end`,
// so the chronic number is still filling in.
// `loadedFrom`: the first day the screen loaded; a 28-day window reaching before it is incomplete,
// so every athlete reads building for such a day.
export function acuteChronic(sessions, athletes, end, key, loadedFrom = null) {
  if (!end) return [];
  const from = (n) => isoMinus(end, n - 1);
  const f7 = from(7), f14 = from(14), f28 = from(28), f21 = isoMinus(end, 20);
  const out = [];
  for (const a of athletes) {
    let s7 = 0, s14 = 0, s28 = 0, days = 0, first = null;
    for (const s of sessions) {
      if (s.athlete_id !== a.id || s.session_date > end) continue;
      if (first == null || s.session_date < first) first = s.session_date;
      const v = s[key] == null ? null : Number(s[key]);
      if (s.session_date < f28 || v == null) continue;
      days++; s28 += v;
      if (s.session_date >= f14) s14 += v;
      if (s.session_date >= f7) s7 += v;
    }
    if (!days) continue;
    const weekly = s28 / 4;
    out.push({ athlete: a, sum7: s7, sum14: s14, sum28: s28, days, ratio7: weekly > 0 ? s7 / weekly : null, ratio14: weekly > 0 ? (s14 / 2) / weekly : null, building: first > f21 || (loadedFrom != null && f28 < loadedFrom) });
  }
  return out;
}

// Average of the non-empty values (for the Trends sort), or null.
export const meanOf = (vals) => { const v = vals.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// An athlete's values for `key` in the `days` days before `end` (not including `end`): the
// baseline the SWC is worked out from (v5.17.1).
// `keepDay` (v5.17.2): only days it returns true for, e.g. only game days or only practice days.
export function priorValues(sessions, athleteId, end, key, days = 28, keepDay = null) {
  const from = isoMinus(end, days);
  return sessions.filter(s => s.athlete_id === athleteId && s.session_date >= from && s.session_date < end && s[key] != null && (!keepDay || keepDay(s.session_date))).map(s => Number(s[key]));
}
