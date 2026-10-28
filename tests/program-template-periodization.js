// Run with:  node tests/program-template-periodization.js   (preview on :4173; Supabase stubbed)
// v5.11.0 Programs: download template, upload programs (preview + warnings), download a
// program as CSV, and the Periodization overview (daily / weekly / monthly).
import fs from 'fs';
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
import { makeXlsx } from './lib/make-xlsx.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [{ id: uuid(1), name: 'A One', sport: 'Football' }, { id: uuid(2), name: 'V Two', sport: 'Volleyball' }];
const S = (reps, pct) => ({ reps: String(reps), pct: String(pct), tempo: '' });
const B = (code, name, maxKey, sets, rx = '') => ({ id: `${code}${name}`, code, name, note: '', maxKey, rx, sets, velocity: '' });
const D = (id, date, focus, blocks) => ({ id, date, focus, warmTitle: 'Warm-Up', warm: [], blocks, finTitle: 'Core', fin: [] });
const programs = [
  { id: uuid(901), name: 'Fall Block', week_label: 'Week 1', phase: 'Accumulation', sport: 'Football', archived_at: null, updated_at: '2026-09-01T00:00:00Z', max_map: { squat: 'Squat', bench: 'Bench', window: 'all' },
    days: [D('a1', '2026-09-07', 'Lower', [B('1a', 'Back Squat', 'squat', [S(5, 70), S(5, 80)]), B('1b', 'Box Jump', '', [], '3x 3')]), D('a2', '2026-09-09', 'Upper', [B('1a', 'Bench', 'bench', [S(4, 70), S(4, 70), S(4, 70)])]), D('a3', '', 'Extra', [B('1a', 'Bench', 'bench', [S(5, 60)])])] },
  { id: uuid(902), name: 'Fall Block', week_label: 'Week 2', phase: 'Intensification', sport: 'Football', archived_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-02T00:00:00Z', max_map: {},
    days: [D('b1', '2026-09-14', 'Lower', [B('1a', 'Back Squat', 'squat', [S(3, 85), S(3, 85), S(3, 85)])])] },
  { id: uuid(903), name: 'Fall Block', week_label: 'Week 4', phase: 'Realization', sport: 'Football', archived_at: null, updated_at: '2026-09-03T00:00:00Z', max_map: {},
    days: [D('c1', '2026-09-28', 'Lower', [B('1a', 'Back Squat', 'squat', [S(2, 92), S(2, 92)])])] },
  { id: uuid(904), name: 'VB Strength', week_label: 'Week 1', phase: '', sport: 'Volleyball', archived_at: null, updated_at: '2026-09-04T00:00:00Z', max_map: {},
    days: [D('d1', '2026-09-08', 'Full', [B('1a', 'Back Squat', 'squat', [S(5, 65)])])] },
];
const upload = [
  'Program,Week,Phase,Team,Date,Day,Focus,Section,Code,Exercise,Note,% of,Set,Reps,%,Tempo,Prescription,Velocity',
  'Spring Block,Week 1,Hypertrophy,Football,3/2/2027,1,Lower,Warm-up,,Pogos x 10,,,,,,,,',
  ',,,,,,,,1a,Back Squat,,Squat,1,8,65,,,',
  ',,,,,,,,,,,,2,8,65,,,',
  ',,,,3/4/2027,2,Upper,,1a,Bench,,Bench,1,8,65,,,',
  'Spring Block,Week 2,Hypertrophy,Football,3/9/2027,1,Lower,,1a,Back Squat,,Squat,1,6,72,,,',
  ',,,,,,,,1b,Curl,,Biceps,1,10,,,,',
].join('\n');

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, liftTypes: ['Bench', 'Squat', 'Hang Clean', 'Trap Bar Deadlift'] })); } });
  const inserts = []; const allLoads = [];
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = decodeURIComponent(req.url()); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/programs')) {
      if (m === 'POST') { const b = req.postDataJSON(); inserts.push(...(Array.isArray(b) ? b : [b])); return route.fulfill({ status: 201, headers: h, body: '' }); }
      if (/id=eq\./.test(url)) { const id = url.match(/id=eq\.([^&]+)/)[1]; return route.fulfill({ status: 200, headers: h, body: JSON.stringify(programs.find(p => p.id === id) || null) }); }
      if (/select=id,name,week_label,phase,sport,days/.test(url)) { allLoads.push(url); return route.fulfill({ status: 200, headers: h, body: JSON.stringify(programs) }); }
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(programs.map(({ days, max_map, ...r }) => r)) });
    }
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#programs`); await page.waitForTimeout(2500);
  const grab = async (id) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(id).click()]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };

  // 1. Templates (menu: weekly grid / one row per set)
  await page.getByTestId('pb-template-menu').click();
  const gridTpl = await grab('pb-template-grid');
  check('weekly-grid template downloads', gridTpl.name === 'hpd-program-weekly-grid.csv' && /Day 1,,Week 1 \(9\/7\)/.test(gridTpl.text) && /Set\/Rep,%,WT,Tempo/.test(gridTpl.text), gridTpl.text.slice(0, 300));
  await page.getByTestId('pb-template-menu').click();
  const tpl = await grab('pb-template');
  const tLines = tpl.text.replace(/^﻿/, '').split(/\r\n/);
  check('template downloads as CSV', tpl.name === 'hpd-program-template.csv' && tpl.text.startsWith('﻿'), tpl.name);
  check('template: instructions, header, filled-in example week', /^# HPD program template/.test(tLines[0]) && tLines.includes('Program,Week,Phase,Team,Date,Day,Focus,Section,Code,Exercise,Note,% of,Set,Reps,%,Tempo,Prescription,Velocity') && tLines.some(l => /^Sample Program,Week 1,.*Hang Power Clean.*Clean,1,3,65,X1X/.test(l)), tLines.slice(0, 8).join(' | '));

  // 2. Upload -> preview -> import
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'spring.csv', mimeType: 'text/csv', buffer: Buffer.from(upload) });
  await page.waitForTimeout(500);
  const items = await page.getByTestId('pb-import-item').allInnerTexts();
  check('upload preview lists both weeks with days, exercises, sets', items.length === 2 && /Spring Block · Week 1/.test(items[0]) && /2 days/.test(items[0]) && /3 sets/.test(items[0]) && /Week 2/.test(items[1]), JSON.stringify(items));
  check('preview flags rows to check (row number + reason)', /Row 7: "% of" value "Biceps"/.test(await page.getByTestId('pb-import-warnings').innerText()), await page.getByTestId('pb-import-warnings').innerText());
  check('nothing saved before Import', inserts.length === 0);
  await page.getByRole('checkbox', { name: /Import Spring Block Week 2/ }).uncheck();
  check('unticking a program updates the button', /Import 1 program$/i.test((await page.getByTestId('pb-import-go').innerText()).trim()));
  await page.getByRole('checkbox', { name: /Import Spring Block Week 2/ }).check();
  await page.getByTestId('pb-import-go').click(); await page.waitForTimeout(800);
  check('Import saves 2 new programs in one request, with team, phase, dated days and sets', inserts.length === 2 && inserts[0].sport === 'Football' && inserts[0].phase === 'Hypertrophy' && inserts[0].days[0].date === '2027-03-02' && inserts[0].days[0].blocks[0].sets.length === 2 && inserts[0].days[0].warm[0] === 'Pogos x 10' && inserts[0].max_map.squat === 'Squat', JSON.stringify(inserts[0]).slice(0, 300));
  check('import closes with a confirmation; new programs in the list', await page.getByTestId('pb-import').count() === 0 && /Imported 2 programs/.test(await page.getByTestId('pb-msg').innerText()) && (await page.getByTestId('pb-item').allInnerTexts()).filter(t => /Spring Block/.test(t)).length === 2);
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'plan.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK') });
  await page.waitForTimeout(300);
  check('a broken Excel file gets plain help instead of an error', /Couldn't read that Excel file/.test(await page.getByTestId('pb-msg').innerText()));
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'program.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await page.waitForTimeout(300);
  check('a PDF gets "upload a .csv or .xlsx"', /isn't a spreadsheet/.test(await page.getByTestId('pb-msg').innerText()));

  // 2c. Real .xlsx straight from Excel / Google Sheets (2nd tab is the program; % stored as 0.6)
  const xbuf = makeXlsx([
    { name: 'Notes', rows: [['Coach notes'], ['Nothing to see here']] },
    { name: 'WSOC', pct: ['D6'], rows: [
      ['Abby Tibbs', '', 'Exercise', 'Back Squat', '', '', '', '', '', '', 'WSOC FALL 26'],
      ['', '', 'Personal Best', 140],
      [],
      ['Day 1', '', 'Week 10 (10/26)', '', '', ''],
      ['', '', 'Set/ Rep', '%', 'WT', 'Tempo'],
      ['2a', 'Back Squat\n(Perfect Sets = add 5 or 10 lbs)', '6x 4', 0.6, 85, 'X4XX'],
      ['2b', 'RDL', '6x 4', '', 95, '4XXX'],
    ] },
  ]);
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'WSOC Fall.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xbuf });
  await page.waitForTimeout(800);
  check('.xlsx: reads the program tab directly (no Save As CSV)', await page.getByTestId('pb-grid-options').count() === 1 && /tab "WSOC"/.test(await page.getByTestId('pb-import').innerText()) && (await page.getByTestId('pb-grid-name').inputValue()) === 'WSOC FALL 26', await page.getByTestId('pb-import').innerText().catch(() => ''));
  inserts.length = 0;
  await page.getByTestId('pb-import-go').click(); await page.waitForTimeout(800);
  const xs = inserts[0]?.days?.[0]?.blocks || [];
  check('.xlsx: 60% (stored as 0.6) -> 6 sets @ 60% of squat; RDL 95 lb kept as text', xs[0]?.maxKey === 'squat' && xs[0]?.sets?.length === 6 && xs[0]?.sets[0].pct === '60' && xs[1]?.rx === '6x 4 · @ 95 lb · tempo 4XXX', JSON.stringify(xs).slice(0, 300));

  // 2d. Drag and drop a file anywhere on the page
  const dropCsv = 'Program,Week,Team,Date,Exercise,% of,Set,Reps,%\nDropped,Week 1,Football,2027-01-04,Back Squat,Squat,1,5,70';
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.csv', { type: 'text/csv' })); window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true })); });
  await page.waitForTimeout(200);
  check('dragging a file over the page shows the drop target', await page.getByTestId('pb-drop').count() === 1);
  await page.evaluate((text) => { const dt = new DataTransfer(); dt.items.add(new File([text], 'dropped.csv', { type: 'text/csv' })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, dropCsv);
  await page.waitForTimeout(600);
  check('dropping it opens the upload preview', await page.getByTestId('pb-drop').count() === 0 && await page.getByTestId('pb-import').count() === 1 && /Dropped · Week 1/.test(await page.getByTestId('pb-import').innerText()));
  await page.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(300);

  // 2b. Weekly-grid upload (Day sections down, weeks across, like a printed sheet)
  const grid = [
    ['Abby Tibbs', '', 'Exercise', 'Back Squat', '', '', '', '', '', '', 'WSOC FALL 26'],
    ['', '', 'Personal Best', '140'],
    [],
    ['Day 1', '', 'Week 10 (10/26)', '', '', '', 'Week 11 (11/2)', '', '', ''],
    ['', '', 'Set/ Rep', '%', 'WT', 'Tempo', 'Set/ Rep', '%', 'WT', 'Tempo'],
    ['1a', 'Power Clean\nWk10: 3s @ Mid Shin\nWk11: Knee', '3x 4', '', '65-85', 'X3XX', '3x 3', '', '70-90', 'X3XX'],
    ['2a', 'Back Squat', '6x 4', '60%', '85', 'X4XX', '7x 3', '64%', '90', 'X4XX'],
    ['3', 'Week 1 and 2 (2 Rounds)\n40 Flutter Kicks\n20 Toe Touches', '2 Rounds', '', '', '', '2 Rounds', '', '', ''],
    [],
    ['Day 2', '', 'Week 10 (10/26)', '', '', '', 'Week 11 (11/2)', '', '', ''],
    ['', '', 'Set/ Rep', '%', 'WT', 'Tempo', 'Set/ Rep', '%', 'WT', 'Tempo'],
    ['1a', 'Chin Up', '3x 3', '', '', '4XXX', '3x 3', '', '', '5XXX'],
  ].map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n').replace(/\\n/g, '\n');
  inserts.length = 0;
  await page.getByTestId('pb-upload-input').setInputFiles({ name: 'WSOC Fall 26 - Abby.csv', mimeType: 'text/csv', buffer: Buffer.from(grid) });
  await page.waitForTimeout(500);
  check('grid sheet is recognised: options with name and team guessed', await page.getByTestId('pb-grid-options').count() === 1 && (await page.getByTestId('pb-grid-name').inputValue()) === 'WSOC FALL 26', await page.getByTestId('pb-grid-name').inputValue().catch(() => '(none)'));
  check('one program per week in the preview', JSON.stringify((await page.getByTestId('pb-import-item').allInnerTexts()).map(t => t.split('\n')[0])) === JSON.stringify(['WSOC FALL 26 · Week 10', 'WSOC FALL 26 · Week 11']), JSON.stringify(await page.getByTestId('pb-import-item').allInnerTexts()));
  check('2-day weeks default to Mon / Thu', (await page.getByTestId('pb-grid-day-1').inputValue()) === '0' && (await page.getByTestId('pb-grid-day-2').inputValue()) === '3' && /Mon,? 10\/26.*Thu,? 10\/29/.test((await page.getByTestId('pb-import-item').allInnerTexts())[0]), (await page.getByTestId('pb-import-item').allInnerTexts())[0]);
  if (process.env.SHOT2) await page.getByTestId('pb-import').locator('.card-glass').first().screenshot({ path: process.env.SHOT2 });
  await page.getByTestId('pb-grid-day-2').selectOption({ label: 'Wed' });
  await page.getByTestId('pb-grid-team').selectOption('Football');
  await page.getByTestId('pb-grid-phase').fill('In-season');
  check('changing a training day updates the dates', /Wed,? 10\/28/.test((await page.getByTestId('pb-import-item').allInnerTexts())[0]), (await page.getByTestId('pb-import-item').allInnerTexts())[0]);
  await page.getByTestId('pb-import-go').click(); await page.waitForTimeout(800);
  const g10 = inserts.find(p => p.week_label === 'Week 10') || {};
  check('grid import saves each week as a program with your choices', inserts.length === 2 && g10.name === 'WSOC FALL 26' && g10.sport === 'Football' && g10.phase === 'In-season' && g10.days.map(d => d.date).join() === '2026-10-26,2026-10-28', JSON.stringify(inserts.map(p => [p.week_label, p.sport, p.days.map(d => d.date)])));
  const sq = g10.days?.[0]?.blocks?.find(b => b.name === 'Back Squat') || {};
  check('grid: % of a lift -> sets with working weights; cues and finisher kept', sq.maxKey === 'squat' && sq.sets?.length === 6 && sq.sets[0].pct === '60' && g10.days[0].blocks[0].note === '3s @ Mid Shin' && g10.days[0].finTitle === 'Finisher · 2 Rounds' && g10.days[0].fin.length === 2, JSON.stringify(g10.days?.[0]).slice(0, 400));

  // 3. Download a program as CSV
  await page.getByTestId('pb-item').filter({ hasText: 'Week 1' }).filter({ hasText: 'Fall Block' }).first().click(); await page.waitForTimeout(600);
  const ex = await grab('pb-export');
  check('Download CSV: one program, template layout', ex.name === 'fall-block-week-1.csv' && /Fall Block,Week 1,Accumulation,Football,2026-09-07,1,Lower,,1a,Back Squat,,Squat,1,5,70/.test(ex.text) && /Box Jump,,,,,,,3x 3/.test(ex.text), ex.text.slice(0, 400));

  // 4. Periodization
  await page.getByTestId('pb-periodization').click(); await page.waitForTimeout(1200);
  const panel = page.getByTestId('periodization');
  check('overview loads every program incl. archived (one request)', await panel.count() === 1 && allLoads.length === 1);
  check('opens on the open program\'s team', (await page.getByTestId('pz-team').inputValue()) === 'Football');
  await page.getByTestId('pz-view-week').click(); await page.waitForTimeout(300);
  let rows = await page.getByTestId('pz-row').allInnerTexts();
  check('weekly: 4 weeks incl. the empty week 9/21', rows.length === 4 && /No training/.test(rows[2]), JSON.stringify(rows));
  check('week 1: 2 sessions, 5 sets, 22 reps, load 15.9, avg 72%, top 80%', /Week of Sep 7, 2026/.test(rows[0]) && /\t2\t5\t22\t15\.9\t72%\t80%/.test(rows[0]), rows[0]);
  check('week 2 (archived program still counted): avg 85%', /Intensification/.test(rows[1]) && /\t85%\t85%/.test(rows[1]), rows[1]);
  check('main lifts summary', /Squat 2×5 @ 70–80%/.test(rows[0]) && /Bench 3×4 @ 70%/.test(rows[0]), rows[0]);
  check('phase strip: Accumulation | Intensification | Off | Realization', JSON.stringify(await page.getByTestId('pz-phases').locator('div').allInnerTexts()).toUpperCase() === JSON.stringify(['Accumulation', 'Intensification', 'Off', 'Realization']).toUpperCase(), JSON.stringify(await page.getByTestId('pz-phases').locator('div').allInnerTexts()));
  check('two charts (volume bars, intensity line)', await page.getByTestId('pz-volume-chart').locator('.recharts-bar-rectangle').count() >= 3 && await page.getByTestId('pz-intensity-chart').locator('.recharts-line-curve').count() === 1);
  check('undated day mentioned, not plotted', /1 program day without a date isn't shown/.test(await panel.innerText()));
  await page.getByTestId('pz-view-day').click(); await page.waitForTimeout(300);
  rows = await page.getByTestId('pz-row').allInnerTexts();
  check('daily: one row per training day with focus', rows.length === 4 && /Mon, Sep 7, 2026/.test(rows[0]) && /Lower/.test(rows[0]) && /Upper/.test(rows[1]), JSON.stringify(rows));
  await page.getByTestId('pz-view-month').click(); await page.waitForTimeout(300);
  rows = await page.getByTestId('pz-row').allInnerTexts();
  check('monthly: September 2026, 4 sessions', rows.length === 1 && /September 2026/.test(rows[0]) && /\t4\t/.test(rows[0]), JSON.stringify(rows));
  check('view remembered', (await page.evaluate(() => localStorage.getItem('hpd_period_view'))) === 'month');
  await page.getByTestId('pz-view-week').click();
  await page.getByTestId('pz-lift').selectOption('bench'); await page.waitForTimeout(300);
  rows = await page.getByTestId('pz-row').allInnerTexts();
  check('lift filter (Bench): week 1 = 3 sets, 12 reps, 70%', /\t2\t3\t12\t8\.4\t70%\t70%/.test(rows[0]), rows[0]);
  await page.getByTestId('pz-lift').selectOption('');
  await page.getByTestId('pz-measure').selectOption('reps'); await page.waitForTimeout(300);
  check('volume as Reps relabels the chart', /Volume · Reps per week/i.test(await panel.innerText()));
  await page.getByTestId('pz-from').fill('2026-09-14'); await page.waitForTimeout(300);
  check('date range trims the timeline', (await page.getByTestId('pz-row').count()) === 3);
  await page.getByTestId('pz-from').fill('');
  await page.getByTestId('pz-team').selectOption('Volleyball'); await page.waitForTimeout(300);
  check('team filter', (await page.getByTestId('pz-row').count()) === 1 && /VB Strength/.test(await page.getByTestId('pz-row').first().innerText()));
  await page.getByTestId('pz-team').selectOption('ALL'); await page.waitForTimeout(300);
  await page.getByTestId('pz-to').fill('2020-01-01'); await page.waitForTimeout(300);
  check('empty range explains what to do', /No dated program days/.test(await page.getByTestId('pz-empty').innerText()));
  await page.getByTestId('pz-to').fill('');

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  const side = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone width: no sideways page scroll with the overview open', side <= 0, `${side}px`);
  if (process.env.SHOT) { await page.setViewportSize({ width: 1280, height: 1100 }); await page.waitForTimeout(300); await panel.screenshot({ path: process.env.SHOT }); }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
