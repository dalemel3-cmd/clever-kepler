// Plyomat CSV import: parsing and reconciliation.
//
// Pure functions only - no React, no Supabase. Every judgement call this file makes is
// a decision about someone's data, so it is kept testable in isolation and the UI layer
// only renders what buildImportPlan returns.
//
// The rule this file exists to honour (docs/HANDOFF.md §1): a row that cannot be
// imported is REPORTED, never silently dropped. The first sample export was 569 rows of
// which only 273 matched the roster - an importer that quietly kept 47% and said
// "done" would have been worse than no importer at all.

// --- CSV -------------------------------------------------------------------------

// Plyomat exports a UTF-8 BOM and quotes any field containing a comma - the local
// timestamp is literally `"9/1/26, 3:25 PM"`. A split(',') mangles every row from that
// column onward, so this is a real (if small) CSV reader: quoted fields, escaped
// quotes ("" inside a quoted field), and CRLF.
export const parseCsv = (text) => {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] !== undefined ? r[i] : '').trim()])));
};

// Values arrive with the unit glued on: "25.31 in", "127.7 ft·lb", or bare "2.34" for
// unitless RSI. parseFloat alone would silently accept "in" as part of nothing and
// return a number for garbage like "-" too, so the numeric part is matched explicitly.
export const parseMetric = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!isFinite(value)) return null;
  return { value, unit: (m[2] || '').trim() };
};

// --- Group / sport / grade -------------------------------------------------------

// Plyomat's "Athlete Groups" is a free-text, slash-separated field that mixes sport,
// graduating class, and organisational buckets: "Football SH", "Junior / WSOC",
// "Freshmen / Volleyball SH / WSOC", "Coaches". Keys here are lowercased group tokens;
// values are sports as spelled in settings.sportsList, because a sport this app does
// not recognise would strand the athlete outside every sport filter.
export const GROUP_SPORT_MAP = {
  'football sh': 'Football',
  'football': 'Football',
  'volleyball sh': 'Volleyball',
  'volleyball': 'Volleyball',
  'base': 'Baseball',
  'baseball': 'Baseball',
  'wbb': 'WBB',
  'mbb': 'MBB',
  'wsoc': 'WSOC',
  'softball': 'Softball',
  'tennis': 'Tennis',
  'cheer & dance': 'Cheer & Dance',
  'golf': 'Golf',
  'track & field': 'Track & Field',
  'wrestling': 'Wrestling',
  'vbb': 'VBB',
  'socc': 'SOCC',
};

// "Sophmore" is Plyomat's spelling, not a typo on this end - match what the file says.
export const GRADE_MAP = {
  'freshmen': '9th', 'freshman': '9th',
  'sophmore': '10th', 'sophomore': '10th',
  'junior': '11th',
  'senior': '12th',
};

// Groups that mean "this person is not an athlete on a roster".
const NON_ATHLETE_GROUPS = new Set(['coaches', 'coach', 'staff', 'test']);

// A multi-sport athlete ("Freshmen / Volleyball SH / WSOC") gets the FIRST sport listed,
// because athletes.sport is single-valued. The full original string is returned too so
// the preview can show the coach what was collapsed rather than hiding the choice.
export const parseGroups = (groupStr) => {
  const raw = String(groupStr || '').trim();
  const tokens = raw.split('/').map(t => t.trim()).filter(Boolean);
  let sport = '', grade = '', isNonAthlete = false;
  const unrecognized = [];

  for (const t of tokens) {
    const k = t.toLowerCase();
    if (NON_ATHLETE_GROUPS.has(k)) { isNonAthlete = true; continue; }
    if (GRADE_MAP[k] && !grade) { grade = GRADE_MAP[k]; continue; }
    if (GROUP_SPORT_MAP[k]) { if (!sport) sport = GROUP_SPORT_MAP[k]; continue; }
    if (!GRADE_MAP[k]) unrecognized.push(t);
  }
  return { sport, grade, isNonAthlete, unrecognized, raw };
};

// --- Test types -------------------------------------------------------------------

// Plyomat's "Primary Metric" is what actually determines the measurement; Protocol is
// the drill that produced it. Only Jump Height has a home in performance_tests today -
// PPS (peak power, ft·lb) and RSI (reactive strength index, unitless) are different
// quantities that would be nonsense ranked on an inches leaderboard, so they are
// reported as unsupported rather than coerced into a test type that fits.
export const METRIC_TEST_TYPE = {
  'jump height': { testType: 'vertical_jump', unit: 'in' },
};

export const testTypeForRow = (row) => METRIC_TEST_TYPE[String(row['Primary Metric'] || '').trim().toLowerCase()] || null;

// --- Name matching ----------------------------------------------------------------

export const normalizeName = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, '')   // drop punctuation; "KJ" vs "K.J." should not differ
  .replace(/\s+/g, ' ')
  .trim();

// Levenshtein edit distance, normalized to a 0-1 similarity.
//
// This started as a cheaper greedy longest-common-subsequence ratio, which was wrong in
// the way that matters here: it collapses on transpositions and substitutions. The
// roster holds "Charlorte Velazquez" for the person Plyomat calls "Charlotte
// Velazquez" - one transposed pair - and the greedy version scored that below 0.8,
// which would have created a SECOND athlete record for someone already on the roster.
// Edit distance scores it 0.95. A duplicate athlete is not a cosmetic bug: their
// history splits across two ids and neither one is right afterwards.
export const similarity = (a, b) => {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
};

// Above FUZZY_THRESHOLD a name is treated as the same person automatically: that band
// only contains spelling slips ("Oliva"/"Olivia", "Brooklyn"/"Brooklynn").
//
// REVIEW_THRESHOLD..FUZZY_THRESHOLD is the genuinely ambiguous band - "KJ Shelton" vs
// "Kylee Shelton", "Abby Tibbs" vs "Tibbs Abbygail". Those are probably the same people,
// but "probably" is not good enough to either merge two athletes or split one in half,
// so they are neither auto-linked nor silently created: buildImportPlan returns them as
// needsReview for a human to decide. Guessing in this band is how a roster quietly
// grows two records for one athlete.
export const FUZZY_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.7;

// Returns { athlete, confidence } where confidence is 'exact' | 'reversed' | 'fuzzy'.
// Plyomat's First/Last columns are transposed for a handful of people ("Copp Sarah"),
// so a reversed match is tried before falling back to fuzzy.
export const matchAthlete = (fullName, roster) => {
  const target = normalizeName(fullName);
  if (!target) return null;

  for (const a of roster) {
    if (normalizeName(a.name) === target) return { athlete: a, confidence: 'exact' };
  }

  const parts = target.split(' ');
  if (parts.length === 2) {
    const flipped = `${parts[1]} ${parts[0]}`;
    for (const a of roster) {
      if (normalizeName(a.name) === flipped) return { athlete: a, confidence: 'reversed' };
    }
  }

  // Score against the name as given AND reversed, so a transposed-column name with a
  // spelling slip in it ("Tibbs Abbygail" for "Abby Tibbs") is still recognised as a
  // candidate rather than sailing past as an unrelated new person.
  const flipped = parts.length === 2 ? `${parts[1]} ${parts[0]}` : target;
  let best = null, bestScore = 0;
  for (const a of roster) {
    const rn = normalizeName(a.name);
    const score = Math.max(similarity(target, rn), similarity(flipped, rn));
    if (score > bestScore) { bestScore = score; best = a; }
  }
  if (best && bestScore >= FUZZY_THRESHOLD) {
    return { athlete: best, confidence: 'fuzzy', score: bestScore };
  }
  if (best && bestScore >= REVIEW_THRESHOLD) {
    return { athlete: best, confidence: 'review', score: bestScore };
  }
  return null;
};

// --- Plan -------------------------------------------------------------------------

export const fullNameOf = (row) =>
  `${String(row['Athlete First Name'] || '').trim()} ${String(row['Athlete Last Name'] || '').trim()}`.trim();

// A Plyomat Session ID is a per-capture UUID. Storing it on the row makes re-importing
// the same export a no-op instead of doubling every result, which matters because the
// obvious way to use this feature is to re-upload a file that grew a few rows.
export const PLYOMAT_NOTE_PREFIX = 'plyomat:';
export const sessionNote = (sessionId) => `${PLYOMAT_NOTE_PREFIX}${sessionId}`;

export const extractSessionIds = (existingTests) => new Set(
  (existingTests || [])
    .map(t => String(t.notes || ''))
    .filter(n => n.startsWith(PLYOMAT_NOTE_PREFIX))
    .map(n => n.slice(PLYOMAT_NOTE_PREFIX.length))
);

/**
 * Turn a raw CSV into an explicit, reviewable plan. Nothing here writes anything.
 *
 * @param csvText   raw file contents
 * @param roster    existing athletes [{id, name, sport, grade}]
 * @param options   { existingTests, createMissing }
 * @returns { tests, newAthletes, skipped, unsupported, duplicates, summary }
 */
export const buildImportPlan = (csvText, roster = [], options = {}) => {
  const { existingTests = [], createMissing = true } = options;
  const rows = parseCsv(csvText);
  const alreadyImported = extractSessionIds(existingTests);

  const tests = [];
  const skipped = [];
  const unsupported = [];
  const duplicates = [];
  // Keyed by normalized name so several rows for one new athlete produce one create.
  const newAthletes = new Map();
  const needsReview = new Map();

  for (const row of rows) {
    const name = fullNameOf(row);
    const sessionId = String(row['Session ID'] || '').trim();
    const groups = parseGroups(row['Athlete Groups']);

    if (!name) { skipped.push({ row, name: '(blank)', reason: 'no athlete name in the row' }); continue; }
    if (groups.isNonAthlete) { skipped.push({ row, name, reason: `group "${groups.raw}" is not a roster group` }); continue; }

    const tt = testTypeForRow(row);
    if (!tt) {
      unsupported.push({ row, name, metric: row['Primary Metric'] || '(none)', protocol: row['Protocol'] || '(none)' });
      continue;
    }

    // "Best of Kept" is the best rep that passed Plyomat's own quality filter, which is
    // the number a coach would read off the device. It is blank on a row or two, so
    // "Best" is the fallback rather than the default.
    const parsed = parseMetric(row['Best of Kept']) || parseMetric(row['Best']);
    if (!parsed || parsed.value <= 0) {
      skipped.push({ row, name, reason: `no usable value (Best of Kept=${row['Best of Kept'] || 'blank'}, Best=${row['Best'] || 'blank'})` });
      continue;
    }

    if (sessionId && alreadyImported.has(sessionId)) { duplicates.push({ row, name }); continue; }

    const match = matchAthlete(name, roster);

    // Ambiguous name: close to someone on the roster, but not close enough to act on.
    // Held out of BOTH buckets - importing it under the existing athlete could graft one
    // person's jumps onto another, and creating a new athlete could split one person's
    // history in two. The coach resolves these in the preview.
    if (match && match.confidence === 'review') {
      const key = normalizeName(name);
      if (!needsReview.has(key)) {
        needsReview.set(key, {
          csvName: name,
          candidate: match.athlete,
          score: match.score,
          group: groups.raw,
          suggestedSport: groups.sport,
          suggestedGrade: groups.grade,
          rowCount: 0,
          // The built rows travel WITH the review item. Without them a coach could
          // answer "same person" and still import nothing, because the decision would
          // have had no rows left to apply to.
          rows: [],
        });
      }
      const rec = needsReview.get(key);
      rec.rowCount++;
      rec.rows.push({
        athlete_id: null,
        pendingAthleteKey: key,
        athlete_name: name,
        sport: groups.sport || match.athlete.sport || '',
        test_type: tt.testType,
        metric: parsed.value,
        unit: parsed.unit || tt.unit,
        source: 'plyomat',
        notes: sessionId ? sessionNote(sessionId) : '',
        created_at: row['Captured At (ISO)'] || new Date().toISOString(),
      });
      continue;
    }

    let athleteId = match ? match.athlete.id : null;
    let athleteName = match ? match.athlete.name : name;
    let sport = match ? (match.athlete.sport || groups.sport) : groups.sport;

    if (!match) {
      if (!createMissing) {
        skipped.push({ row, name, reason: 'not on the roster', group: groups.raw, suggestedSport: groups.sport });
        continue;
      }
      const key = normalizeName(name);
      if (!newAthletes.has(key)) {
        newAthletes.set(key, {
          name, sport: groups.sport, grade: groups.grade,
          group: groups.raw, unrecognizedGroup: groups.unrecognized, rowCount: 0,
        });
      }
      const rec = newAthletes.get(key);
      rec.rowCount++;
      athleteName = rec.name;
      sport = rec.sport;
    }

    tests.push({
      // athlete_id is null for a to-be-created athlete; the writer fills it in once the
      // athlete row exists, keyed by pendingAthleteKey.
      athlete_id: athleteId,
      pendingAthleteKey: athleteId ? null : normalizeName(name),
      athlete_name: athleteName,
      sport: sport || '',
      test_type: tt.testType,
      metric: parsed.value,
      unit: parsed.unit || tt.unit,
      source: 'plyomat',
      notes: sessionId ? sessionNote(sessionId) : '',
      created_at: row['Captured At (ISO)'] || new Date().toISOString(),
      matchConfidence: match ? match.confidence : 'new',
    });
  }

  const createdList = [...newAthletes.values()];
  const reviewList = [...needsReview.values()];
  return {
    tests,
    newAthletes: createdList,
    needsReview: reviewList,
    skipped,
    unsupported,
    duplicates,
    summary: {
      rowsInFile: rows.length,
      toImport: tests.length,
      athletesToCreate: createdList.length,
      needsReview: reviewList.length,
      rowsAwaitingReview: reviewList.reduce((s, r) => s + r.rowCount, 0),
      skipped: skipped.length,
      unsupported: unsupported.length,
      duplicates: duplicates.length,
      fuzzyMatches: tests.filter(t => t.matchConfidence === 'fuzzy').length,
      reversedMatches: tests.filter(t => t.matchConfidence === 'reversed').length,
    },
  };
};
