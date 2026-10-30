// Run with:  node tests/program-manual-weight.js   (preview on :4173; Supabase stubbed)
// v5.15.1: a program set can carry a manual weight (lb) instead of a % of max. The tablet
// pre-fills it and the athlete bumps it up or down with the same stepper as a % weight;
// it logs to Lift Tracker when the exercise is linked to a lift. Also the editor (typing
// one clears the other), the Weight Room Card and the CSV template.
import { register } from 'node:module';
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
register('./lib/src-resolve.mjs', import.meta.url);
const { setWeight, manualLb, buildCard } = await import('../src/features/programs/programData.js');
const { buildWorkoutDay } = await import('../src/features/programs/workoutSession.js');
const { parseCsv, toCsv, rowsToPrograms, programsToRows } = await import('../src/features/programs/programCsv.js');

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const central = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
const TODAY = central(new Date());
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const clean = { id: 'b1', code: '1a', name: 'Hang Clean', note: '', maxKey: 'clean', rx: '', velocity: '', sets: [{ reps: '3', pct: '', lb: '65', tempo: '' }, { reps: '3', pct: '', lb: '65', tempo: '' }] };
const squat = { id: 'b2', code: '1b', name: 'Back Squat', note: '', maxKey: 'squat', rx: '', velocity: '', sets: [{ reps: '5', pct: '70', tempo: '' }, { reps: '5', pct: '70', lb: '135', tempo: '' }] };
const rdl = { id: 'b3', code: '2a', name: 'Barbell RDL', note: '', maxKey: '', rx: '', velocity: '', sets: [{ reps: '8', pct: '', lb: '95', tempo: '' }] };
const program = { id: uuid(900), name: 'MBB Power', week_label: 'Week 10', phase: 'Power', sport: 'MBB', max_map: { clean: 'Power Clean', bench: 'Bench', squat: 'Squat', dl: '', ohp: '', window: 'all' }, days: [{ id: 'd1', date: TODAY, focus: 'Power', warmTitle: 'Warm-Up', warm: [], blocks: [clean, squat, rdl], finTitle: 'Core', fin: [] }] };

console.log('\n[A] Weight math');
check('manual weight is used as typed', setWeight({ lb: '65' }, 300) === 65 && manualLb({ lb: '' }) === null);
check('% of max still works', setWeight({ pct: '70' }, 300) === 210);
check('manual weight wins over a %', setWeight({ pct: '70', lb: '135' }, 300) === 135);
const wd = buildWorkoutDay(program, program.days[0], { squat: 300 });
check('tablet: clean sets pre-fill 65 with no clean max, no % shown', wd[0].sets.every(s => s.wt === 65 && s.pct === null) && wd[0].loggable, JSON.stringify(wd[0].sets));
check('tablet: squat 70% = 210, manual 135 wins on set 2', wd[1].sets[0].wt === 210 && wd[1].sets[0].pct === 70 && wd[1].sets[1].wt === 135 && wd[1].sets[1].pct === null, JSON.stringify(wd[1].sets));
check('tablet: manual weight with no lift link shows but is checked off', wd[2].sets[0].wt === 95 && !wd[2].loggable);
const card = buildCard(program, { id: uuid(1), name: 'X' }, []);
const rows = card.days[0].blocks[0].rows;
check('Weight Room Card prints 65 lb and no %', rows.every(r => r.wt === 65 && r.pct === ''), JSON.stringify(rows));

console.log('\n[B] CSV');
const back = rowsToPrograms(parseCsv(toCsv(programsToRows([program]))), { liftTypes: ['Power Clean', 'Squat'] });
const bb = back.programs[0]?.days[0]?.blocks || [];
check('export -> import keeps manual weights', bb[0]?.sets.every(s => s.lb === '65') && bb[1]?.sets[1]?.lb === '135' && bb[1]?.sets[0]?.pct === '70' && !bb[1]?.sets[0]?.lb && bb[2]?.sets[0]?.lb === '95', JSON.stringify(bb.map(b => b.sets)));
check('template has a Weight (lb) column', programsToRows([program])[0].includes('Weight (lb)'));
const hand = rowsToPrograms(parseCsv('Program,Team,Date,Exercise,% of,Set,Reps,Weight\nMBB,MBB,2026-11-02,Power Clean,Clean,1,3,65 lb\nMBB,MBB,2026-11-02,Power Clean,Clean,2,3,abc\n'), { liftTypes: ['Power Clean'] });
check('a "Weight" column reads "65 lb"; a bad weight is flagged', hand.programs[0]?.days[0]?.blocks[0]?.sets[0]?.lb === '65' && hand.warnings.some(w => /Weight "abc"/.test(w.message)), JSON.stringify(hand));

console.log('\n[C] Rack tablet: bump the manual weight and log it');
const athletes = [{ id: uuid(1), name: 'Mbb Max', sport: 'MBB' }];
const SEED = { enableLiftTracker: true, liftTypes: ['Bench', 'Squat', 'Power Clean'], dataWindowDays: 30 };
const browser = await chromium.launch(LAUNCH_OPTS);
{
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 1300 }, serviceWorkers: 'block' })).newPage();
  await stubAuth(page);
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify(s)); } }, SEED);
  const liftPosts = [];
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = decodeURIComponent(req.url()); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/rpc/programs_for_tablets')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([program]) });
    if (url.includes('/rest/v1/lift_logs')) {
      if (m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; liftPosts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows) }); }
      return route.fulfill({ status: 200, headers: h, body: '[]' });
    }
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Activate Lift Kiosk Mode' }).click(); await page.waitForTimeout(1500);
  await page.getByText('Mbb Max', { exact: true }).first().click(); await page.waitForTimeout(900);
  const w = () => page.getByTestId('wo-weight').evaluateAll(els => els.map(e => e.value));
  check('clean sets pre-fill 65 lb (squat: no max for 70%, manual 135)', JSON.stringify(await w()) === '["65","65","","135"]', JSON.stringify(await w()));
  const panel = await page.getByTestId('workout-panel').innerText();
  check('set label reads "3 reps · 65 lb" (no %)', /3 reps · 65 lb/.test(panel) && !/% · 65 lb/.test(panel), panel.slice(0, 300));
  await page.getByRole('button', { name: 'More Set 1 weight' }).first().click();
  await page.getByRole('button', { name: 'More Set 1 weight' }).first().click();
  check('athlete bumps it up: 65 -> 75', (await w())[0] === '75', JSON.stringify(await w()));
  await page.getByTestId('wo-log').first().click(); await page.waitForTimeout(800);
  const p = liftPosts[0] || {};
  check('logs to Lift Tracker as Power Clean 75 × 3', p.lift_type === 'Power Clean' && Number(p.weight_lbs) === 75 && Number(p.reps) === 3, JSON.stringify(p));
  check('the RDL (no lift link) shows 95 lb and is checked off', /8 reps · 95 lb/.test(await page.getByTestId('workout-panel').innerText()) && await page.getByTestId('wo-done').count() === 1);
}

console.log('\n[D] Program editor');
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' })).newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/programs')) return route.fulfill({ status: 404, headers: h, body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.programs' in the schema cache" }) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#programs`); await page.waitForTimeout(2000);
  await page.getByTestId('pb-sample').click(); await page.waitForTimeout(300);
  await page.getByTestId('pb-add-day').click();
  const day = page.getByTestId('pb-day').last();
  await day.getByLabel('Exercise name').first().fill('Power Clean');
  await day.getByTestId('pb-mode-sets').first().click();
  await day.getByLabel('Set 1 percent').fill('70');
  await day.getByLabel('Set 1 weight (lb)').fill('65');
  check('typing a weight clears the %', (await day.getByLabel('Set 1 percent').inputValue()) === '' && (await day.getByLabel('Set 1 weight (lb)').inputValue()) === '65');
  check('no lift picked: hint explains the tablet behaviour', await day.getByTestId('pb-lb-hint').count() === 1);
  await day.getByLabel('Percent of which max').first().selectOption('clean');
  check('lift picked: hint goes away', await day.getByTestId('pb-lb-hint').count() === 0);
  await day.getByTestId('pb-add-set').first().click();
  check('a new set copies the weight', (await day.getByLabel('Set 2 weight (lb)').inputValue()) === '65');
  await day.getByLabel('Set 2 percent').fill('75');
  check('typing a % clears the weight', (await day.getByLabel('Set 2 weight (lb)').inputValue()) === '' && (await day.getByLabel('Set 2 percent').inputValue()) === '75');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('set rows fit a phone (no sideways scroll at 390 px)', sideways <= 0, String(sideways));
}
await browser.close();
console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
