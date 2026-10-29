// "Weekly card" program sheets (v5.12.0, docs/HANDOFF.md §139): one tab per week, the
// training days side by side (date over each day's Code | Exercise ... Set/Reps | % | Wt |
// Tempo columns), one row per set under each exercise - the cards printed for each athlete
// from a team workbook (MBB / WSOC Fall 26). Every such tab in the workbook is read and
// becomes one program (one week). The weights on a card are worked out for the athlete
// named on it, so only sets, reps, % and tempo are kept; written-in notes ("30 MIN",
// "Add Wt", "Add 5 to 10") stay as text. Pure.
import { defaultMaxMap } from './programData';
import { maxKeyFor, parseDate } from './programCsv';
import { SETREP_RE, SUB, addDays, isGrid } from './programGrid';
import { prescribedSets } from './periodization';

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const CODE_RE = /^\d{1,2}[a-z]?$/i;
const TEMPO_RE = /^[\dx]{3,5}$/i;
const SERIAL_RE = /^\d{5}(\.0+)?$/;
const str = (v) => String(v ?? '').trim();
const isDateCell = (v) => { const s = str(v); return SERIAL_RE.test(s) ? Number(s) > 40000 && Number(s) < 60000 : /^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(s); };
const ymdOf = (v) => {
  const s = str(v);
  if (SERIAL_RE.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000).toISOString().slice(0, 10);
  return parseDate(s) || '';
};
export const mondayOf = (ymd) => { const d = new Date(`${ymd}T12:00:00Z`); return addDays(ymd, -((d.getUTCDay() + 6) % 7)); };
const md = (ymd) => { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; };
const has = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text);

// The row with the day headers: a dated cell, then Set/Reps (and %, Wt, Tempo) per day.
function headerRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i] || [];
    const srs = r.map((c, j) => (SUB(c) === 'sr' ? j : -1)).filter(j => j >= 0);
    if (srs.length && r.some((c, j) => j < srs[0] && isDateCell(c))) return { i, srs };
  }
  return null;
}
export const isWeekCard = (rows) => !isGrid(rows) && !!headerRow(rows);

// "Rep Out (6)" -> "6+" (as many as possible, at least 6); everything else as written.
const repsText = (v) => { const m = str(v).match(/^rep\s*out\s*\(?\s*(\d+)/i); return m ? `${m[1]}+` : str(v); };
const pctOf = (v) => {
  const s = str(v);
  let m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (m) return Number(m[1]);
  m = s.match(/^0?\.\d+$|^1(\.0+)?$/);
  return m ? Math.round(Number(s) * 1000) / 10 : null;
};
const isWeight = (v) => /^\d+(\.\d+)?(\s*[-–]\s*\d+(\.\d+)?)?\s*(lbs?)?$/i.test(str(v));

function blockOf(e, warnings, tab) {
  const lines = e.name.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const name = lines.filter(l => !/^\(.*\)$/.test(l)).join(' ').replace(/\s+/g, ' ');
  const notes = lines.filter(l => /^\(.*\)$/.test(l)).map(l => l.slice(1, -1).trim());
  const tempos = [];
  for (const x of e.rows) {
    if (x.tempo) { if (TEMPO_RE.test(x.tempo)) tempos.push(x.tempo.toUpperCase()); else notes.push(x.tempo); }
    if (x.wt && !isWeight(x.wt)) notes.push(x.wt); // the card's own numbers are that athlete's weights
  }
  const b = { id: uid(), code: e.code.toUpperCase().replace(/^(\d+)([A-Z])$/, (m, n, l) => `${n}${l.toLowerCase()}`), name, note: [...new Set(notes)].join(' · '), maxKey: '', rx: '', sets: [], velocity: '' };
  const mk = maxKeyFor(name) || '';
  const setRows = e.rows.filter(x => x.sr);
  const m = setRows[0]?.sr.match(SETREP_RE);
  if (setRows.length <= 1 && m) {
    // One line like "3x 8 ea" or "4x 4ea @ 35%".
    const pct = pctOf(setRows[0].pct);
    if (pct != null && mk && Number(m[1]) <= 15) {
      b.maxKey = mk;
      b.sets = Array.from({ length: Number(m[1]) }, () => ({ reps: m[2], pct: String(pct), tempo: tempos[0] || '' }));
    } else b.rx = [setRows[0].sr, pct != null ? `@ ${pct}%` : '', tempos[0] ? `tempo ${tempos[0]}` : ''].filter(Boolean).join(' · ');
    return b;
  }
  // One row per set (5 / 4 / 3 / Rep Out (6); 2+1; 3 ea), % where the card has one.
  b.sets = setRows.map(x => { const p = pctOf(x.pct); return { reps: repsText(x.sr), pct: p == null ? '' : String(p), tempo: TEMPO_RE.test(x.tempo) ? x.tempo.toUpperCase() : '' }; });
  if (b.sets.some(s => s.pct)) {
    if (mk) b.maxKey = mk;
    else warnings.push({ tab, row: e.row, message: `${name} has a % but no lift the app can take it from - kept without weights.` });
  }
  return b;
}

// One tab -> { tab, prefix, team, title, weekStart, days, warnings }, or null if it isn't
// a weekly card. The week comes from the tab name ("SH_10.12.26") when it has one - a tab
// copied from the week before often keeps the old dates - and from the day headers if not.
export function parseWeekCard(rows, { tab = '', teams = [], today = new Date() } = {}) {
  const h = headerRow(rows);
  if (!h) return null;
  const hr = rows[h.i] || [];
  const warnings = [];
  const groups = [];
  h.srs.forEach((sr, k) => {
    const lo = k ? groups[k - 1].last + 1 : 0;
    const next = h.srs[k + 1] ?? Infinity;
    const cols = { sr };
    let last = sr;
    for (let j = sr + 1; j < Math.min(next, hr.length); j++) {
      if (isDateCell(hr[j])) break;
      const s = SUB(hr[j]);
      if (s && cols[s] === undefined) { cols[s] = j; last = j; }
    }
    let code = -1;
    for (let j = lo; j < sr && code < 0; j++) if (isDateCell(hr[j])) code = j;
    for (let j = lo; j < sr && code < 0; j++) if (rows.slice(h.i + 1, h.i + 80).some(r => CODE_RE.test(str(r?.[j])))) code = j;
    // An unlabelled % column (values like "70%" between Set/Reps and Wt).
    if (cols.pct === undefined) {
      const stop = Math.min(...[cols.wt, cols.tempo, next].filter(x => x !== undefined));
      for (let j = sr + 1; j < stop && cols.pct === undefined; j++) if (rows.slice(h.i + 1, h.i + 80).some(r => /^\d+(\.\d+)?%$/.test(str(r?.[j])))) cols.pct = j;
    }
    groups.push({ sr, cols, last, code, date: code >= 0 && isDateCell(hr[code]) ? ymdOf(hr[code]) : '' });
  });

  // Week: tab name first, else the day headers.
  const cellDates = groups.map(g => g.date).filter(Boolean);
  const nm = tab.match(/(\d{1,2})[._-](\d{1,2})(?:[._-](\d{2,4}))?/);
  let weekStart = cellDates.length ? mondayOf(cellDates[0]) : '';
  let shift = 0;
  if (nm) {
    const yy = nm[3] ? (nm[3].length === 4 ? nm[3] : `20${nm[3].slice(0, 2)}`) : (cellDates[0] || String(today.getFullYear())).slice(0, 4);
    const named = parseDate(`${nm[1]}/${nm[2]}/${yy}`);
    if (named) {
      const start = mondayOf(named);
      if (weekStart && weekStart !== start) {
        shift = Math.round((new Date(`${start}T12:00:00Z`) - new Date(`${weekStart}T12:00:00Z`)) / 86400000);
        warnings.push({ tab, row: h.i + 1, message: `The dates on this tab are for the week of ${md(weekStart)} - using the week in the tab name (${md(start)}).` });
      }
      weekStart = start;
    }
  }

  const days = [];
  groups.forEach((g, k) => {
    if (g.code < 0) return;
    const exs = [];
    let cur = null;
    for (let r = h.i + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const code = str(row[g.code]);
      if (CODE_RE.test(code)) { const name = str(row[g.code + 1]); cur = name ? { code, name, row: r + 1, rows: [] } : null; if (cur) exs.push(cur); }
      if (!cur) continue;
      const cell = (key) => (g.cols[key] !== undefined ? str(row[g.cols[key]]) : '');
      const x = { sr: cell('sr'), pct: cell('pct'), wt: cell('wt'), tempo: cell('tempo') };
      if (x.sr || x.pct || x.wt || x.tempo) cur.rows.push(x);
    }
    let warm = [];
    for (let r = h.i - 1; r >= Math.max(0, h.i - 6) && !warm.length; r--) warm = str(rows[r]?.[g.code]).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const day = { id: uid(), date: g.date ? addDays(g.date, shift) : '', focus: '', warmTitle: 'Warm-Up', warm: /^off$/i.test(warm.join(' ')) ? [] : warm, blocks: [], finTitle: 'Also', fin: [] };
    for (const e of exs) {
      // A numbered item without a letter ("2 | FLY 10 + 10") or a written-out circuit
      // ("Group Core: / 1-3 Rounds / Flutter Kicks ...") is extra work, not a lift.
      const lines = e.name.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (/^\d+$/.test(e.code) || (!e.rows.some(x => x.sr) && (lines.length > 2 || /group core|\brounds?\b/i.test(e.name)))) {
        if (lines.length > 1 && /:$/.test(lines[0])) { day.finTitle = lines[0].replace(/:$/, ''); day.fin.push(...lines.slice(1)); } else day.fin.push(lines.join(' / '));
        continue;
      }
      day.blocks.push(blockOf(e, warnings, tab));
    }
    if (!day.blocks.length && !day.fin.length) return; // a day off / an empty column
    if (!day.date) warnings.push({ tab, row: h.i + 1, message: `Day ${k + 1} has no date - add one above its Set/Reps column to put it on the calendar.` });
    days.push(day);
  });

  // Team and season title from the tab name and the card's top rows (not the warm-up lists).
  const top = rows.slice(0, Math.min(h.i, 4)).flat().map(str).filter(c => c && !c.includes('\n'));
  const team = teams.find(t => has(tab, t)) || teams.find(t => top.some(c => has(c, t))) || '';
  const title = (top.find(c => /\b(fall|spring|summer|winter|off.?season|in.?season|pre.?season)\b/i.test(c) && c.length < 40) || '').replace(/['’]+$/, '').trim();
  const prefix = tab.replace(/[\s._-]*\d{1,2}[._-]\d{1,2}([._-]\d{2,4})?.*$/, '').trim() || tab;
  return { tab, prefix, team, title, weekStart, days, warnings };
}

export const cardCounts = (card) => {
  let ex = 0, sets = 0;
  for (const d of card.days) for (const b of d.blocks) { ex += 1; sets += prescribedSets(b).length; }
  return { days: card.days.length, ex, sets };
};

// Tabs grouped by their name before the date ("SH_9.14.26" -> "SH"); a group's team is the
// first one found on any of its tabs, its default name "<team> <season title>".
export function cardGroups(cards) {
  const out = [];
  for (const c of cards) {
    let g = out.find(x => x.prefix === c.prefix);
    if (!g) { g = { prefix: c.prefix, cards: [], team: '', title: '' }; out.push(g); }
    g.cards.push(c);
    if (!g.team && c.team) g.team = c.team;
    if (!g.title && c.title) g.title = c.title;
  }
  for (const g of out) {
    g.cards.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    g.name = [g.team || g.prefix, g.title].filter(Boolean).join(' ');
  }
  return out;
}

// Week number inside the group, counted from its first tab (a week off keeps its number).
export const weekNo = (first, weekStart) => (first && weekStart ? Math.round((new Date(`${weekStart}T12:00:00Z`) - new Date(`${first}T12:00:00Z`)) / (7 * 86400000)) + 1 : null);

// The coach's choices -> programs, one per ticked tab.
export function weekCardPrograms(groups, { opts = {}, phases = {}, picked = null, archived = false, liftTypes = [], now = new Date() } = {}) {
  const programs = [];
  for (const g of groups) {
    const o = opts[g.prefix] || {};
    const first = g.cards[0]?.weekStart;
    for (const c of g.cards) {
      if (picked && !picked.has(c.tab)) continue;
      const n = weekNo(first, c.weekStart);
      programs.push({
        id: uid(), name: (o.name ?? g.name) || 'Imported program', week_label: n ? `Week ${n}` : c.tab, phase: (phases[c.tab] || '').trim() || null, sport: o.team ?? g.team ?? '',
        max_map: { ...defaultMaxMap(liftTypes), window: 'all' }, archived_at: archived ? now.toISOString() : null,
        days: c.days.map(d => ({ ...d, id: uid(), blocks: d.blocks.map(b => ({ ...b, id: uid(), sets: b.sets.map(s => ({ ...s })) })) })),
      });
    }
  }
  return programs;
}
