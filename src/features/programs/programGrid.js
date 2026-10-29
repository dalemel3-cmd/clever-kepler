// "Weekly grid" program sheets (v5.11.0, docs/HANDOFF.md §137): the layout coaches
// already print - Day sections down the page, one column group per week across it
// (Week 10 (10/26) | Set/Rep | % | WT | Tempo), the exercise cell holding per-week
// variations ("Power Clean / Wk10: 3s @ Mid Shin / Wk11: ..."). Exported from Google
// Sheets or Excel as CSV, each week becomes one program and each Day one of its days.
// Pure; the upload preview rebuilds with the coach's choices (name, team, training days).
import { defaultMaxMap } from './programData';
import { maxKeyFor, parseCsv, toCsv } from './programCsv';

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`);
// A week header is the whole cell ("Week 10 (10/26)", "Wk 3") - not a cue like "Wk10: Pause".
const WEEK_RE = /^\s*w(?:ee)?k\s*\.?\s*(\d+)\s*(?:\(([^)]*)\))?\s*$/i;
const DAY_RE = /^\s*day\s*(\d+)\b\s*[-–:·(]?\s*([A-Za-z]*)/i;
const CODE_RE = /^\d{1,2}[a-z]?$/i;
export const SETREP_RE = /^\s*(\d+)\s*[x×]\s*(.+?)\s*$/i;
export const SUB = (h) => {
  const s = String(h || '').toLowerCase().replace(/\s+/g, '');
  if (/^set\/?rep|^sets?x?reps?|^sets?$|^sr$|^scheme/.test(s)) return 'sr';
  if (s === '%' || /^pct|^percent|^%of|^intensity/.test(s)) return 'pct';
  if (/^wt|^weight|^load|^lbs?$/.test(s)) return 'wt';
  if (/^tempo/.test(s)) return 'tempo';
  if (/^vel/.test(s)) return 'velocity';
  if (/^rpe/.test(s)) return 'rpe';
  return null;
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const defaultDayOffsets = (n) => ({ 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] }[n] || Array.from({ length: n }, (_, i) => Math.min(i, 6)));
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

// "10/26" -> the year that puts it closest to today; "10/26/2026" as written.
export function weekDate(text, today = new Date()) {
  const m = String(text || '').match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!m) return '';
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const pad = (n) => String(n).padStart(2, '0');
  if (m[3]) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(mo)}-${pad(d)}`;
  const y = today.getFullYear();
  const best = [y - 1, y, y + 1].map(yy => ({ yy, gap: Math.abs(new Date(yy, mo - 1, d) - today) })).sort((a, b) => a.gap - b.gap)[0].yy;
  return `${best}-${pad(mo)}-${pad(d)}`;
}

// The exercise cell for one week: base name, that week's variation, notes in brackets.
export function exerciseForWeek(cell, weekNo) {
  const lines = String(cell || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const base = [], notes = [], variants = [];
  for (const l of lines) {
    const v = l.match(/^w(?:ee)?k\s*\.?\s*(\d+)\s*(?:(?:-|–|&|to|and)\s*(\d+))?\s*:\s*(.+)$/i);
    if (v) variants.push({ from: Number(v[1]), to: Number(v[2] || v[1]), text: v[3].trim() });
    else if (/^\(.*\)$/.test(l)) notes.push(l.slice(1, -1).trim());
    else base.push(l);
  }
  const v = variants.find(x => weekNo >= x.from && weekNo <= x.to);
  const name = base[0] || v?.text || variants[0]?.text || '';
  const note = [base[0] && v ? v.text : '', ...base.slice(1), ...notes].filter(Boolean).join(' · ');
  return { name, note };
}

// Is this CSV the weekly-grid layout? (a "Week N" header row and a "Day N" row)
export function isGrid(rows) {
  const flat = rows.slice(0, 80);
  const hasWeek = flat.some(r => r.filter(c => WEEK_RE.test(c)).length >= 1 && r.some(c => DAY_RE.test(c) || WEEK_RE.test(c)));
  const hasDay = flat.some(r => r.some(c => DAY_RE.test(c)));
  const isRows = flat.some(r => r.some(c => /^program$/i.test(String(c).trim())) && r.some(c => /^exercise$/i.test(String(c).trim())));
  return hasWeek && hasDay && !isRows;
}

// Read the grid once: weeks (label, number, date, columns), days with exercises and
// each exercise's cells per week, plus guesses for the program name and team.
export function parseGrid(rows, { teams = [], today = new Date() } = {}) {
  const warnings = [];
  let weeks = null, firstWeekCol = Infinity, codeCol = null, nameCol = null;
  const days = [];
  let day = null, ex = null;
  const top = [];
  rows.forEach((r, i) => {
    const n = i + 1;
    const weekCols = r.map((c, j) => (WEEK_RE.test(c) ? j : -1)).filter(j => j >= 0);
    const dayCell = r.findIndex((c, j) => DAY_RE.test(c) && (weekCols.length ? j < weekCols[0] : true));
    if (dayCell >= 0) {
      day = { no: Number(String(r[dayCell]).match(DAY_RE)[1]), label: String(r[dayCell]).trim(), exercises: [], row: n };
      days.push(day); ex = null;
      if (codeCol == null) codeCol = dayCell;
    }
    if (weekCols.length) {
      // Sub-headers (Set/Rep, %, WT, Tempo) are on this row or the next one.
      const subRow = [r, rows[i + 1] || []].find(rr => rr.filter(c => SUB(c)).length >= 2) || [];
      const list = weekCols.map((c, k) => {
        const m = String(r[c]).match(WEEK_RE);
        const end = k + 1 < weekCols.length ? weekCols[k + 1] : Math.max(r.length, subRow.length);
        const cols = {};
        for (let j = c; j < end; j++) { const s = SUB(subRow[j]); if (s && cols[s] === undefined) cols[s] = j; }
        if (cols.sr === undefined) cols.sr = c;
        return { label: `Week ${m[1]}`, no: Number(m[1]), date: weekDate(m[2], today), cols };
      });
      if (!weeks) weeks = list;
      firstWeekCol = Math.min(firstWeekCol, weekCols[0]);
      return;
    }
    if (!weeks) { top.push(r); return; }
    if (r.filter(c => SUB(c)).length >= 2) return; // a repeated sub-header row
    // Exercise rows: code + name to the left of the week columns.
    const left = r.slice(0, firstWeekCol);
    const ci = codeCol != null && CODE_RE.test(String(left[codeCol] || '').trim()) ? codeCol : left.findIndex(c => CODE_RE.test(String(c).trim()));
    const code = ci >= 0 ? String(left[ci]).trim() : '';
    const nameIdx = (() => { for (let j = (ci >= 0 ? ci + 1 : 0); j < left.length; j++) if (String(left[j]).trim() && !CODE_RE.test(String(left[j]).trim())) return j; return -1; })();
    const name = nameIdx >= 0 ? String(left[nameIdx]).trim() : '';
    if (nameCol == null && nameIdx >= 0) nameCol = nameIdx;
    const cellsFor = (w) => Object.fromEntries(Object.entries(w.cols).map(([k, j]) => [k, String(r[j] ?? '').trim()]));
    if (code || name) {
      if (!day) { day = { no: 1, label: 'Day 1', exercises: [], row: n }; days.push(day); }
      ex = { code, name, row: n, weeks: weeks.map(cellsFor) };
      day.exercises.push(ex);
    } else if (ex) {
      // Write-in rows under an exercise: keep a value only where that week was empty.
      weeks.forEach((w, k) => {
        const c = cellsFor(w);
        const cur = ex.weeks[k];
        if (!Object.values(cur).some(Boolean) && Object.values(c).some(Boolean)) ex.weeks[k] = c;
      });
    }
  });
  if (!weeks) return { weeks: [], days: [], warnings: [{ row: 0, message: 'No "Week" columns found (e.g. "Week 10 (10/26)").' }] };
  if (weeks.some(w => !w.date)) warnings.push({ row: 0, message: 'Some week headers have no date - add it in brackets, e.g. "Week 10 (10/26)", to put those weeks on the calendar.' });
  // Guesses for the program name (a title-looking cell above the grid) and team.
  const kv = {};
  for (const r of top) { const k = String(r.find(c => String(c).trim()) || '').trim().toLowerCase(); const v = r.filter(c => String(c).trim())[1]; if (v && ['program', 'team', 'phase'].includes(k)) kv[k] = String(v).trim(); }
  const skip = /^(exercise|personal best|pb|max|maxes|name|program|team|phase)$/i;
  const cells = top.flat().map(c => String(c).trim()).filter(c => c && !skip.test(c) && !/^[\d.\s%]+$/.test(c));
  const teamHit = teams.find(t => cells.some(c => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(c))) || '';
  const title = cells.find(c => teamHit && c.toLowerCase().includes(teamHit.toLowerCase())) || cells.find(c => /fall|spring|summer|winter|block|program|phase|off.?season|in.?season/i.test(c)) || '';
  const team = kv.team ? (teams.find(t => t.toLowerCase() === kv.team.toLowerCase()) || kv.team) : teamHit;
  return { weeks, days, warnings, guess: { name: kv.program || title, team, phase: kv.phase || '' } };
}

// One prescription cell -> the app's exercise: set-by-set rows when it has a % of a
// lift the app can work weights from, otherwise the coach's own text.
function blockFor(e, wk, weekCells, warnings) {
  const { name, note } = exerciseForWeek(e.name, wk.no);
  let { sr = '', pct = '', wt = '', tempo = '', velocity = '', rpe = '' } = weekCells;
  if (!sr && SETREP_RE.test(pct)) { sr = pct; pct = ''; } // set/rep typed one column over
  const pctNum = /^\s*\d+(\.\d+)?\s*%?\s*$/.test(pct) ? Number(pct.replace('%', '')) : null;
  const pctText = pctNum == null ? pct.trim() : ''; // e.g. "add 10 from last week"
  const m = sr.match(SETREP_RE);
  const mk = maxKeyFor(name) || '';
  const wtTxt = !wt ? '' : /^\d+(\.0+)?$/.test(wt) ? `${Number(wt)} lb` : /^\d+\s*[-–]\s*\d+$/.test(wt) ? `${wt.replace(/\s/g, '')} lb` : wt;
  const b = { id: uid(), code: e.code, name, note, maxKey: '', rx: '', sets: [], velocity };
  if (m && pctNum != null && mk && Number(m[1]) <= 15) {
    b.maxKey = mk;
    b.sets = Array.from({ length: Number(m[1]) }, () => ({ reps: m[2], pct: String(pctNum), tempo: tempo.toUpperCase() }));
    return b;
  }
  if (pctNum != null && !mk) warnings.push({ row: e.row, message: `${name} (${wk.label}) has ${pctNum}% but no lift the app can take it from - kept as text.` });
  b.rx = [sr, wtTxt && `@ ${wtTxt}`, pctNum != null ? `@ ${pctNum}%` : pctText, rpe && `RPE ${rpe}`, tempo && `tempo ${tempo.toUpperCase()}`].filter(Boolean).join(' · ');
  return b;
}

const isCircuit = (e, cells) => /round/i.test(cells.sr || '') || (!/[a-z]$/i.test(e.code) && String(e.name).split(/\n/).filter(Boolean).length > 2);

// Parsed grid + the coach's choices -> one program per week.
export function buildGridPrograms(grid, { name = '', team = '', phase = '', dayOffsets = null, liftTypes = [] } = {}) {
  const warnings = [...grid.warnings];
  const offsets = dayOffsets || defaultDayOffsets(grid.days.length);
  const programs = grid.weeks.map((wk, k) => ({
    id: uid(), name: name || 'Imported program', week_label: wk.label, phase: phase || null, sport: team || '',
    max_map: { ...defaultMaxMap(liftTypes), window: 'all' },
    days: grid.days.map((d, di) => {
      const day = { id: uid(), date: wk.date ? addDays(wk.date, offsets[di] ?? di) : '', focus: '', warmTitle: 'Warm-Up', warm: [], blocks: [], finTitle: 'Finisher', fin: [] };
      for (const e of d.exercises) {
        const cells = e.weeks[k] || {};
        if (isCircuit(e, cells)) {
          // A circuit (e.g. "3 | Core / 40 Flutter Kicks / ..." with "2 Rounds"): the
          // movements become the day's finisher lines; a first line without a number is its title.
          const lines = String(e.name).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
          const moves = lines.filter(l => !/^w(?:ee)?k\b|^week/i.test(l));
          const title = moves.length > 1 && !/^\d/.test(moves[0]) ? moves.shift() : 'Finisher';
          if (!day.fin.length) day.finTitle = cells.sr ? `${title} · ${cells.sr}` : title;
          day.fin.push(...(moves.length ? moves : lines));
          continue;
        }
        day.blocks.push(blockFor(e, wk, cells, warnings));
      }
      return day;
    }),
  }));
  return { programs, warnings: warnings.filter((w, i, a) => a.findIndex(x => x.message === w.message) === i) };
}

export const dayChoices = (firstWeekDate) => {
  const base = firstWeekDate ? weekdayOf(firstWeekDate) : 1;
  return Array.from({ length: 7 }, (_, off) => ({ off, label: WEEKDAYS[(base + off) % 7] }));
};

// Downloadable grid template: the same layout as a printed week-across sheet.
export function gridTemplateCsv() {
  const weeks = [['Week 1 (9/7)', 1], ['Week 2 (9/14)', 2], ['Week 3 (9/21)', 3], ['Week 4 (9/28)', 4]];
  const head = (label) => [label, '', ...weeks.flatMap(([w]) => [w, '', '', ''])];
  const sub = ['Code', 'Exercise', ...weeks.flatMap(() => ['Set/Rep', '%', 'WT', 'Tempo'])];
  const ex = (code, name, cells) => [code, name, ...cells.flat()];
  const rows = [
    ['# HPD weekly grid template - Day sections down, one column group per week across. Save as CSV and use Upload programs.'],
    ['# % + a lift in the name (Squat, Bench, Clean, Deadlift/RDL, Press) = working weights per athlete. WT/text = printed as written.'],
    ['# Per-week variations go in the exercise cell on their own lines: "Wk1: 3s @ Mid Shin". Notes in (brackets).'],
    ['Program', 'Fall Block'],
    ['Team', ''],
    ['Phase', 'Strength'],
    [],
    head('Day 1'), sub,
    ex('1a', 'Hang Clean\nWk1-2: Pause at Knee\nWk3-4: Full', [['3x 3', '65%', '', 'X1X'], ['3x 3', '70%', '', 'X1X'], ['4x 2', '75%', '', 'X1X'], ['4x 2', '80%', '', 'X1X']]),
    ex('1b', 'Box Jump', [['3x 3', '', 'BW', ''], ['3x 3', '', 'BW', ''], ['3x 4', '', 'BW', ''], ['3x 4', '', 'BW', '']]),
    ex('2a', 'Back Squat\n(Perfect sets = add 5 or 10 lbs)', [['4x 6', '65%', '', '3XX'], ['4x 5', '70%', '', '3XX'], ['5x 4', '75%', '', 'X2X'], ['5x 3', '80%', '', 'X2X']]),
    ex('2b', 'RDL', [['3x 8', '', '95', '3XX'], ['3x 8', 'add 10 from last week', '', '3XX'], ['3x 6', 'add 10 from last week', '', '3XX'], ['3x 6', 'add 10 from last week', '', '3XX']]),
    ex('3', 'Core\n40 Flutter Kicks\n20 Toe Touches\n10 Superman', [['2 Rounds', '', '', ''], ['2 Rounds', '', '', ''], ['3 Rounds', '', '', ''], ['3 Rounds', '', '', '']]),
    [],
    head('Day 2'), sub,
    ex('1a', 'Bench Press', [['4x 6', '65%', '', '3XX'], ['4x 5', '70%', '', '3XX'], ['5x 4', '75%', '', 'X2X'], ['5x 3', '80%', '', 'X2X']]),
    ex('1b', 'Chin Up\nWk1-3: Eccentric\nWk4: 2 Pos. ISO', [['3x 3', '', '', '4XXX'], ['3x 3', '', '', '5XXX'], ['3x 3', '', '', '6XXX'], ['3x 3', '', '', 'X5XX']]),
    ex('2a', 'Ring Rows', [['3x 12', '', '', '2XXX'], ['3x 12', '', '', '2XXX'], ['3x 12', '', '', '2XXX'], ['3x 12', '', '', '2XXX']]),
  ];
  return toCsv(rows);
}

export { parseCsv };
