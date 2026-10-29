// Run with:  node tests/program-week-cards-upload.js   (preview on :4173; Supabase stubbed)
// v5.12.0 (docs/HANDOFF.md §139): upload a workbook of weekly cards (one tab per week,
// days side by side) - every tab at once, grouped by team, phase per week, archived for
// past weeks - and a workbook with several weekly-grid tabs (one tab after another).
// Then Periodization counts every exercise and filters by main lift / movement.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
import { makeXlsx } from './lib/make-xlsx.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [{ id: uuid(1), name: 'Walker Gaines', sport: 'MBB' }, { id: uuid(2), name: 'Abby Tibbs', sport: 'WSOC' }, { id: uuid(3), name: 'A One', sport: 'Football' }];
const existing = [{ id: uuid(900), name: 'WSOC FALL 26', week_label: 'Week 10', phase: null, sport: 'WSOC', archived_at: null, updated_at: '2026-10-28T00:00:00Z', max_map: {}, days: [] }];

// Excel stores dates as day numbers (46300 = 10/5/2026) and 70% as 0.7.
const serial = (ymd) => Math.round((Date.UTC(...ymd.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0))) - Date.UTC(1899, 11, 30)) / 86400000);
const C = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const sheet = (name, cells, pctRefs = []) => {
  const rows = [];
  for (const [ref, v] of Object.entries(cells)) { const [, l, n] = ref.match(/^([A-Z]+)(\d+)$/); const r = rows[Number(n) - 1] || (rows[Number(n) - 1] = []); r[C(l)] = v; }
  return { name, pct: pctRefs, rows: Array.from(rows, r => Array.from(r || [], v => v ?? '')) };
};
const mbbWeek = (tab, d1, d2, extra = {}) => sheet(tab, {
  A1: 'Walker Gaines', AW1: extra.team ?? '', AW3: extra.title ?? '',
  A5: 'Band Pull Apart (2x 10)', A10: serial(d1), H10: 'Set/Reps', N10: 'Wt', Q10: 'Tempo', T10: serial(d2), AA10: 'Set/Reps', AG10: 'Wt', AJ10: 'Tempo',
  A11: '1A', B11: 'BARBELL ROW', H11: 4, N11: 115, T11: '1A', U11: 'POWER CLEAN', AA11: 2, AG11: 95,
  H12: 4, N12: 115, AA12: 2, H13: 'Rep Out (6)', AA13: 2,
  A20: '1B', B20: 'OFF SET PUSH UP', H20: '3x 8 ea', T20: '1B', U20: 'MB DEAD BUG', AA20: '3x 5',
  A29: '2A', B29: 'BENCH PRESS', H29: 2, K29: 0.7, N29: 90, T29: '2A', U29: 'FRONT SQUAT', AA29: 5, AG29: 135,
  H30: 2, K30: 0.75, N30: 100, Q30: 'Add 5 to 10', AA30: 4, AG30: 'Add Wt',
}, ['K29', 'K30']);
const wsocWeek = (tab, d1) => sheet(tab, {
  A1: 'Abby Tibbs', AG1: 'wsoc', AG3: "Fall 26'",
  A10: serial(d1), H10: 'Set/Reps', K10: '%', N10: 'Wt', Q10: 'Tempo',
  A11: '1A', B11: 'FRONT SQUAT', H11: 8, N11: 60, Q11: 'X2XX', H12: 6, Q12: 'X2XX', H13: 5, H14: 'Rep Out (10 Reps)',
  A20: '1B', B20: 'SIDE PLANK', H20: '3x 20s ea',
  A29: '2A', B29: 'REAR FOOT ELEVATED SPLIT SQUAT', H29: '4x 4ea', K29: 0.35, N29: 25,
}, ['K29']);
const cards = makeXlsx([
  mbbWeek('SH_9.14.26', '2026-09-14', '2026-09-15', { team: 'MBB', title: "Fall 26'" }),
  mbbWeek('SH_9.28.26', '2026-09-14', '2026-09-15'), // copied from 9/14, dates never changed
  wsocWeek('WSOC_9.14.26', '2026-09-14'),
  sheet('Rosters', { A1: 'WSOC Fall', A2: 'First', B2: 'Last' }),
]);
const gridTab = (title, team) => ({ name: `${team} WK10-13`, pct: ['D6'], rows: [
  ['Walker Gaines', '', 'Exercise', 'Bench Press', '', '', '', '', '', '', title],
  ['', '', 'Personal Best', 125],
  [],
  ['Day 1', '', 'Week 10 (10/26)', '', '', ''],
  ['', '', 'Set/ Rep', '%', 'WT', 'Tempo'],
  ['1a', 'Bench Press', '4x 4', 0.65, 80, ''],
  ['1b', 'DB Row', '3x 8 ea', '', '', ''],
] });
const grids = makeXlsx([gridTab('WSOC FALL 26', 'WSOC'), gridTab('MBB FALL 26', 'MBB')]);

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, liftTypes: ['Bench', 'Squat', 'Hang Clean', 'Power Clean'] })); } });
  const inserts = []; const saved = [...existing];
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = decodeURIComponent(req.url()); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/programs')) {
      if (m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; inserts.push(...rows); saved.push(...rows); return route.fulfill({ status: 201, headers: h, body: '' }); }
      if (/id=eq\./.test(url)) { const id = url.match(/id=eq\.([^&]+)/)[1]; return route.fulfill({ status: 200, headers: h, body: JSON.stringify(saved.find(p => p.id === id) || null) }); }
      if (/select=id,name,week_label,phase,sport,days/.test(url)) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(saved) });
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(saved.map(({ days, max_map, ...r }) => r)) });
    }
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#programs`); await page.waitForTimeout(2500);

  // 1. A workbook of weekly cards: every tab at once.
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'Workout Sheets MBB & WSOC.xlsx', mimeType: XLSX, buffer: cards });
  await page.waitForTimeout(900);
  const panel = page.getByTestId('pb-import');
  check('weekly-card workbook: every week tab in one preview (the roster tab is skipped)', await panel.count() === 1 && /3 weekly tabs/.test(await panel.innerText()) && await page.getByTestId('pb-wc-week').count() === 3, await panel.innerText().catch(() => ''));
  check('grouped by team: MBB (team found on one of its tabs) and WSOC (from the tab name)', await page.getByTestId('pb-wc-group').count() === 2 && (await page.getByTestId('pb-wc-team-0').inputValue()) === 'MBB' && (await page.getByTestId('pb-wc-team-1').inputValue()) === 'WSOC');
  check('names: "MBB Fall 26"; WSOC keeps the existing program\'s spelling "WSOC FALL 26"', (await page.getByTestId('pb-wc-name-0').inputValue()) === 'MBB Fall 26' && (await page.getByTestId('pb-wc-name-1').inputValue()) === 'WSOC FALL 26', `${await page.getByTestId('pb-wc-name-0').inputValue()} | ${await page.getByTestId('pb-wc-name-1').inputValue()}`);
  const weeks = await page.getByTestId('pb-wc-week').allInnerTexts();
  check('weeks numbered from the first tab, a skipped week keeps its number (9/28 = Week 3)', /Week 1 · 9\/14/.test(weeks[0]) && /Week 3 · 9\/28/.test(weeks[1]) && /Mon Tue/.test(weeks[1]), JSON.stringify(weeks));
  check('the tab copied with old dates is flagged and moved to its own week', /SH_9\.28\.26: The dates on this tab are for the week of 9\/14 - using the week in the tab name \(9\/28\)/.test(await page.getByTestId('pb-import-warnings').innerText()));
  check('past weeks: "Archive them" is ticked', await page.getByTestId('pb-wc-archive').isChecked());
  await page.getByTestId('pb-wc-phase').nth(0).fill('Capacity');
  await page.getByTestId('pb-wc-phase').nth(1).fill('Strength');
  await page.getByTestId('pb-wc-phase').nth(2).fill('Capacity');
  check('nothing saved before Import', inserts.length === 0);
  await page.getByRole('checkbox', { name: 'Import WSOC_9.14.26' }).uncheck();
  check('unticking a week updates the button', /Import 2 programs$/i.test((await page.getByTestId('pb-import-go').innerText()).trim()));
  await page.getByRole('checkbox', { name: 'Import WSOC_9.14.26' }).check();
  await page.getByTestId('pb-import-go').click(); await page.waitForTimeout(900);
  const w3 = inserts.find(p => p.week_label === 'Week 3') || {};
  check('Import: 3 programs in one request, team / name / phase / archived', inserts.length === 3 && w3.sport === 'MBB' && w3.name === 'MBB Fall 26' && w3.phase === 'Strength' && !!w3.archived_at && inserts.every(p => p.archived_at), JSON.stringify(inserts.map(p => [p.name, p.week_label, p.sport, p.phase, !!p.archived_at])));
  check('the copied tab\'s days land on its own week (9/28, 9/29)', w3.days?.map(d => d.date).join() === '2026-09-28,2026-09-29', JSON.stringify(w3.days?.map(d => d.date)));
  const bench = w3.days?.[0]?.blocks?.find(b => b.name === 'BENCH PRESS') || {};
  check('sets and % read from the card, the athlete\'s weights left out', bench.maxKey === 'bench' && bench.sets?.map(s => `${s.reps}@${s.pct}`).join() === '2@70,2@75' && bench.note === 'Add 5 to 10' && !JSON.stringify(w3).includes('"115"'), JSON.stringify(bench));
  check('closes with a confirmation; archived weeks stay out of the list', await page.getByTestId('pb-import').count() === 0 && /Imported 3 programs/.test(await page.getByTestId('pb-msg').innerText()) && (await page.getByTestId('pb-item').allInnerTexts()).every(t => !/Fall 26/.test(t) || /WSOC FALL 26/.test(t)));

  // 2. Periodization: every exercise counts.
  await page.getByTestId('pb-periodization').click(); await page.waitForTimeout(1200);
  await page.getByTestId('pz-team').selectOption('MBB'); await page.getByTestId('pz-view-week').click(); await page.waitForTimeout(300);
  check('volume defaults to Reps', (await page.getByTestId('pz-measure').inputValue()) === 'reps' && /Volume · Reps per week/i.test(await page.getByTestId('periodization').innerText()));
  let rows = await page.getByTestId('pz-row').allInnerTexts();
  check('MBB weekly: 9/14, the week off (9/21), 9/28', rows.length === 3 && /No training/.test(rows[1]) && /Strength/.test(rows[2]), JSON.stringify(rows));
  check('week of 9/14: 2 sessions, 16 sets, 72 reps; intensity from the bench %', /\t2\t16\t72\t/.test(rows[0]) && /73%/.test(rows[0]), rows[0]);
  check('main lifts from the names (Bench, Clean, Squat)', /Clean 3×2/.test(rows[0]) && /Bench 2×2 @ 70–75%/.test(rows[0]) && /Squat 2×5/.test(rows[0]), rows[0]);
  await page.getByTestId('pz-lift').selectOption('squat'); await page.waitForTimeout(300);
  rows = await page.getByTestId('pz-row').allInnerTexts();
  check('Squat filter: front squat written without a % still counts (2 sets, 9 reps)', /\t2\t2\t9\t/.test(rows[0]), rows[0]);
  check('no % in view -> the intensity chart says why', await page.getByTestId('pz-no-pct').count() === 1);
  await page.getByTestId('pz-lift').selectOption('m:core'); await page.waitForTimeout(300);
  rows = await page.getByTestId('pz-row').allInnerTexts();
  check('Movement filter (Core): MB dead bug 3 sets, 15 reps', /\t2\t3\t15\t/.test(rows[0]), rows[0]);
  await page.getByTestId('pz-lift').selectOption(''); await page.getByTestId('pz-team').selectOption('WSOC'); await page.waitForTimeout(300);
  rows = await page.getByTestId('pz-row').allInnerTexts();
  check('WSOC 9/14: rep-out reps count, timed sets count as sets (11 sets, 45 reps)', /\t1\t11\t45\t/.test(rows[0]), rows[0]);
  await page.getByTestId('pz-measure').selectOption('sets'); await page.waitForTimeout(200);
  check('the Volume choice is remembered', (await page.evaluate(() => localStorage.getItem('hpd_period_measure'))) === 'sets');
  await page.getByRole('button', { name: 'Close periodization' }).click(); await page.waitForTimeout(300);

  // 3. A workbook with two weekly-grid tabs: one tab, then the next.
  inserts.length = 0;
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'WK10-13.xlsx', mimeType: XLSX, buffer: grids });
  await page.waitForTimeout(900);
  check('two grid tabs: a Tab picker, the first tab shown', await page.getByTestId('pb-import-tab').count() === 1 && /tab "WSOC WK10-13"/.test(await page.getByTestId('pb-import').innerText()) && (await page.getByTestId('pb-grid-name').inputValue()) === 'WSOC FALL 26');
  await page.getByTestId('pb-import-tab').selectOption({ label: 'MBB WK10-13' }); await page.waitForTimeout(400);
  check('picking the other tab shows it', (await page.getByTestId('pb-grid-name').inputValue()) === 'MBB FALL 26');
  await page.getByTestId('pb-import-tab').selectOption({ label: 'WSOC WK10-13' }); await page.waitForTimeout(400);
  await page.getByTestId('pb-import-go').click(); await page.waitForTimeout(900);
  check('after importing a tab the next one opens', inserts.length === 1 && inserts[0].name === 'WSOC FALL 26' && await page.getByTestId('pb-import').count() === 1 && (await page.getByTestId('pb-grid-name').inputValue()) === 'MBB FALL 26', JSON.stringify(inserts.map(p => p.name)));
  await page.getByTestId('pb-import-go').click(); await page.waitForTimeout(900);
  check('last tab imported: closes', inserts.length === 2 && inserts[1].name === 'MBB FALL 26' && await page.getByTestId('pb-import').count() === 0 && /Imported 1 program\./.test(await page.getByTestId('pb-msg').innerText()));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'cards.xlsx', mimeType: XLSX, buffer: cards });
  await page.waitForTimeout(900);
  const side = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone width: the weekly-card preview has no sideways page scroll', side <= 0, `${side}px`);
  if (process.env.SHOT) { await page.setViewportSize({ width: 1280, height: 1100 }); await page.waitForTimeout(300); await page.getByTestId('pb-import').locator('.card-glass').first().screenshot({ path: process.env.SHOT }); }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
