// Program spreadsheet template, import and export (v5.11.0, docs/HANDOFF.md §137). Pure.
// One row per set (or per warm-up / finisher line). Rows with the same Program + Week
// become one program; rows with the same Date (or Day number) become one day; rows for
// the same Code + Exercise in a row become one exercise's sets. CSV, so it opens and
// saves in Excel / Google Sheets with no extra library (Excel: Save As "CSV UTF-8").
import { MAX_KEYS, defaultMaxMap, nextCode } from './programData';

export const TEMPLATE_HEADERS = ['Program', 'Week', 'Phase', 'Team', 'Date', 'Day', 'Focus', 'Section', 'Code', 'Exercise', 'Note', '% of', 'Set', 'Reps', '%', 'Weight (lb)', 'Tempo', 'Prescription', 'Velocity'];
const FIELD = ['program', 'week', 'phase', 'team', 'date', 'day', 'focus', 'section', 'code', 'exercise', 'note', 'maxKey', 'set', 'reps', 'pct', 'lb', 'tempo', 'rx', 'velocity'];
// Accepted header spellings (lower-case, spaces/punctuation removed except %).
const ALIASES = {
  program: ['program', 'programname', 'name'], week: ['week', 'weeklabel'], phase: ['phase', 'block', 'meso', 'mesocycle'],
  team: ['team', 'sport', 'defaultteam'], date: ['date'], day: ['day', 'daynumber', 'session'], focus: ['focus', 'dayfocus'],
  section: ['section', 'part', 'type'], code: ['code', 'blockcode', 'order'], exercise: ['exercise', 'exercisename', 'movement'],
  note: ['note', 'notes', 'cue', 'cues'], maxKey: ['%of', '%ofmax', 'percentof', 'maxlift', 'ofmax', 'basedon', 'max'],
  set: ['set', 'setnumber', 'set#', 'setno'], reps: ['reps', 'rep'], pct: ['%', 'pct', 'percent', 'percentage', 'intensity', '%1rm', '%max'],
  lb: ['weight', 'weightlb', 'weightlbs', 'lb', 'lbs', 'load', 'wt'],
  tempo: ['tempo'], rx: ['prescription', 'setsreps', 'setsxreps', 'rx', 'scheme'], velocity: ['velocity', 'vel', 'speed', 'velocitytarget'],
};
const norm = (h) => String(h || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s._\-#:/]+/g, '');

const COMMENTS = [
  '# HPD program template - one row per set. Delete these # lines or leave them (they are skipped).',
  '# Same Program + Week = one program (a training week). Same Date (or Day 1-4) = one day. Date as YYYY-MM-DD or M/D/YYYY.',
  '# Section: blank = exercise; Warm-up... = warm-up line; anything else (Core, Finisher) = finisher line. "% of": Clean, Bench, Squat, TBDL or OHP.',
  '# Exercise with sets: one row per set (Set, Reps, % or Weight (lb), Tempo). A weight is used as typed and wins over a %. Exercise written as text instead: leave Set/Reps/% blank and fill Prescription (e.g. 3x 8 ea).',
  '# Team must match a team name in the app for the program to show on the Lift Tracker tablets.',
];

// RFC 4180 CSV (quotes, commas and line breaks inside quotes), comma or semicolon.
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = (src.split(/\r?\n/).find(l => l.trim() && !l.trim().startsWith('#')) || '');
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// BOM so Excel reads the file as UTF-8 (en dashes, "·").
export const toCsv = (rows) => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mo = Number(m[1]), d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null; // present but unreadable
}

// "% of" -> max key: the key, its label, or a lift name ("Back Squat", "Hang Clean").
export function maxKeyFor(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s === 'none' || s === '-') return '';
  const hit = MAX_KEYS.find(([k, l]) => s === k || s === l.toLowerCase());
  if (hit) return hit[0];
  if (/clean|snatch/.test(s)) return 'clean';
  if (/bench/.test(s)) return 'bench';
  if (/squat/.test(s)) return 'squat';
  if (/dead|tbdl|trap|rdl/.test(s)) return 'dl';
  if (/ohp|overhead|military|push press|press/.test(s)) return 'ohp';
  return null; // unknown
}

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const sectionOf = (raw) => {
  const s = String(raw || '').trim();
  const l = s.toLowerCase();
  if (!l || ['lift', 'main', 'exercise', 'exercises', 'strength'].includes(l)) return { kind: 'lift' };
  if (l.startsWith('warm') || l.startsWith('pre')) return { kind: 'warm', title: ['warm-up', 'warmup', 'warm up', 'warm'].includes(l) ? 'Warm-Up' : s };
  return { kind: 'fin', title: ['finisher', 'fin'].includes(l) ? 'Finisher' : s };
};

// Spreadsheet rows -> programs (new ids), with plain-language warnings by row number.
export function rowsToPrograms(rows, { liftTypes = [], teams = [] } = {}) {
  const warnings = [];
  const data = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.some(c => String(c).trim()) && !String(r[0] || '').trim().startsWith('#'));
  if (!data.length) return { programs: [], warnings: [{ row: 0, message: 'The file is empty.' }] };
  const header = data.shift();
  const col = {};
  header.r.forEach((h, i) => { const k = norm(h); for (const f of FIELD) if (col[f] === undefined && ALIASES[f].includes(k)) col[f] = i; });
  if (col.exercise === undefined || col.program === undefined) {
    return { programs: [], warnings: [{ row: header.n, message: 'Missing the Program or Exercise column. Start from the template (Download template).' }] };
  }
  const get = (r, f) => (col[f] === undefined ? '' : String(r[col[f]] ?? '').trim());
  const teamSet = new Set(teams);
  const progs = new Map();
  let carry = {};
  let prevBlock = null;
  for (const { r, n } of data) {
    const v = {};
    for (const f of FIELD) v[f] = get(r, f);
    // Spreadsheet habit: leave repeated cells blank under the first one. Program-level
    // cells carry within a program, day-level cells within a day - never across.
    for (const f of ['program', 'week']) { if (v[f]) carry[f] = v[f]; else v[f] = carry[f] || ''; }
    if (!v.program) { warnings.push({ row: n, message: 'No program name - row skipped.' }); continue; }
    const pKey = `${v.program}|${v.week}`;
    if (pKey !== carry.pKey) carry = { program: carry.program, week: carry.week, pKey };
    // A new Day number starts a new day even when its Date cell is blank.
    if (v.day && v.day !== carry.day && !v.date) carry.date = '';
    for (const f of ['phase', 'team', 'day', 'date']) { if (v[f]) carry[f] = v[f]; else v[f] = carry[f] || ''; }
    const dayId = `${v.date}|${v.day}`;
    if (dayId !== carry.dayId) { carry.dayId = dayId; carry.focus = ''; }
    if (v.focus) carry.focus = v.focus; else v.focus = carry.focus || '';
    if (!progs.has(pKey)) {
      if (v.team && teams.length && !teamSet.has(v.team)) warnings.push({ row: n, message: `Team "${v.team}" isn't a team in the app, so it won't show on the tablets until it matches.` });
      progs.set(pKey, { id: uid(), name: v.program, week_label: v.week || null, phase: v.phase || null, sport: v.team || '', max_map: { ...defaultMaxMap(liftTypes), window: 'all' }, days: new Map() });
    }
    const p = progs.get(pKey);
    const teamCell = get(r, 'team');
    if (teamCell && teamCell !== p.sport) warnings.push({ row: n, message: `Team "${teamCell}" is different from this program's team ("${p.sport || 'none'}") - kept "${p.sport || 'none'}". Use a new Program or Week name for another team.` });
    const date = parseDate(v.date);
    if (date === null) warnings.push({ row: n, message: `Couldn't read the date "${v.date}" - use YYYY-MM-DD or M/D/YYYY.` });
    const dKey = date ? `d:${date}` : `n:${parseInt(v.day, 10) || 1}`;
    if (!p.days.has(dKey)) p.days.set(dKey, { id: uid(), date: date || '', focus: v.focus || '', warmTitle: 'Warm-Up', warm: [], blocks: [], finTitle: 'Finisher', fin: [], _order: date || `~${String(parseInt(v.day, 10) || 1).padStart(3, '0')}` });
    const d = p.days.get(dKey);
    if (!d.focus && v.focus) d.focus = v.focus;
    const sec = sectionOf(v.section);
    if (sec.kind !== 'lift') {
      const text = v.exercise || v.note;
      if (!text) continue;
      if (sec.kind === 'warm') { if (!d.warm.length) d.warmTitle = sec.title; d.warm.push(text); } else { if (!d.fin.length) d.finTitle = sec.title; d.fin.push(text); }
      prevBlock = null;
      continue;
    }
    const hasSet = !!(v.set || v.reps || v.pct || v.lb || v.tempo);
    // A set row under an exercise can leave Code/Exercise blank.
    if (!v.exercise && hasSet && prevBlock && prevBlock.day === d) { v.exercise = prevBlock.b.name; v.code = v.code || prevBlock.b.code; }
    if (!v.exercise) { warnings.push({ row: n, message: 'No exercise name - row skipped.' }); continue; }
    const last = d.blocks[d.blocks.length - 1];
    const same = last && prevBlock && prevBlock.day === d && prevBlock.b === last && last.name === v.exercise && (!v.code || v.code === last.code) && hasSet && last.sets.length > 0;
    let b = last;
    if (!same) {
      const mk = maxKeyFor(v.maxKey);
      if (mk === null) warnings.push({ row: n, message: `"% of" value "${v.maxKey}" isn't Clean, Bench, Squat, TBDL or OHP - left blank.` });
      b = { id: uid(), code: v.code || (last ? nextCode(last.code) : '1a'), name: v.exercise, note: v.note, maxKey: mk || '', rx: hasSet ? '' : v.rx, sets: [], velocity: v.velocity };
      d.blocks.push(b);
    }
    if (hasSet) {
      const pct = v.pct.replace(/%/g, '').trim();
      if (pct && !(Number(pct) > 0)) warnings.push({ row: n, message: `"%" value "${v.pct}" isn't a number - left blank.` });
      if (Number(pct) > 0 && !b.maxKey) warnings.push({ row: n, message: `${v.exercise} has a % but no "% of" lift, so no working weight can be worked out.` });
      const lb = v.lb.replace(/lbs?\.?$/i, '').trim();
      if (lb && !(Number(lb) > 0)) warnings.push({ row: n, message: `Weight "${v.lb}" isn't a number - left blank.` });
      b.sets.push({ reps: v.reps, pct: Number(pct) > 0 ? String(Number(pct)) : '', tempo: v.tempo.toUpperCase(), ...(Number(lb) > 0 ? { lb: String(Number(lb)) } : {}) });
    }
    prevBlock = { day: d, b };
  }
  const programs = [...progs.values()].map(p => ({
    ...p,
    days: [...p.days.values()].sort((a, b) => a._order.localeCompare(b._order)).map(({ _order, ...d }) => ({ ...d, blocks: d.blocks.length ? d.blocks : [] })),
  }));
  return { programs, warnings };
}

// Program(s) -> spreadsheet rows (header first). Same layout as the template, so an
// exported program can be edited in Excel and uploaded again.
export function programsToRows(programs) {
  const out = [TEMPLATE_HEADERS];
  const label = (k) => (MAX_KEYS.find(([key]) => key === k) || [])[1] || '';
  for (const p of programs) {
    (p.days || []).forEach((d, di) => {
      const base = [p.name || '', p.week_label || '', p.phase || '', p.sport || '', d.date || '', String(di + 1), d.focus || ''];
      const row = (section, code, exercise, note, ofMax, set, reps, pct, lb, tempo, rx, vel) => out.push([...base, section, code, exercise, note, ofMax, set, reps, pct, lb, tempo, rx, vel]);
      for (const w of d.warm || []) row(d.warmTitle || 'Warm-Up', '', w, '', '', '', '', '', '', '', '', '');
      for (const b of d.blocks || []) {
        if (!b.name) continue;
        if (b.sets?.length) b.sets.forEach((s, i) => row('', b.code || '', b.name, i === 0 ? b.note || '' : '', label(b.maxKey), String(i + 1), s.reps ?? '', s.pct ?? '', s.lb ?? '', s.tempo || '', '', i === 0 ? b.velocity || '' : ''));
        else row('', b.code || '', b.name, b.note || '', label(b.maxKey), '', '', '', '', '', b.rx || '', b.velocity || '');
      }
      for (const f of d.fin || []) row(d.finTitle || 'Finisher', '', f, '', '', '', '', '', '', '', '', '');
    });
  }
  return out;
}

// The downloadable template: instructions + a filled-in example week.
export function templateCsv(example) {
  const rows = programsToRows([example]);
  return toCsv([...COMMENTS.map(c => [c]), ...rows]);
}
