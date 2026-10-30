// Run with:  node tests/progress-card.js   (preview on :4173; Supabase stubbed)
// v5.6.0 Athlete Progress Card (docs/HANDOFF.md §119).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (d, h = 15) => { const t = new Date(Date.now() - d * 86400000); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [
  { id: uuid(1), name: 'COLTON MCDANIEL', sport: 'Football', position: 'DB', grade: '11th' },
  { id: uuid(2), name: 'Peer Two', sport: 'Football', position: 'DB', grade: '10th' },
  { id: uuid(3), name: 'Peer Three', sport: 'Football', position: 'DB', grade: '12th' },
  { id: uuid(4), name: 'Lineman', sport: 'Football', position: 'OL', grade: '12th' },
  { id: uuid(5), name: 'Full Load', sport: 'Football', position: 'QB', grade: '12th' },
];
let n = 100;
const lift = (a, d, lt, w, r) => ({ id: uuid(n++), athlete_id: a, lift_type: lt, weight_lbs: w, reps: r, created_at: at(d) });
const lifts = [
  lift(uuid(1), 60, 'Front Squat', 185, 3), lift(uuid(1), 30, 'Front Squat', 205, 3), lift(uuid(1), 2, 'Front Squat', 225, 3), // PR
  lift(uuid(1), 60, 'Bench', 185, 1), lift(uuid(1), 30, 'Bench', 205, 1), lift(uuid(1), 2, 'Bench', 190, 1),                   // 7.3% off best -> focus
  lift(uuid(2), 30, 'Front Squat', 300, 1), lift(uuid(3), 30, 'Front Squat', 200, 1), lift(uuid(4), 30, 'Front Squat', 400, 1),
];
const vj = (a, d, v) => ({ id: uuid(n++), athlete_id: a, test_type: 'vertical_jump', test_variant: 'hands_on_hips', metric: v, unit: 'in', created_at: at(d) });
for (const lt of ['Hang Clean', 'Back Squat', 'Deadlift', 'Trap Bar Deadlift']) lifts.push(lift(uuid(5), 30, lt, 200, 3), lift(uuid(5), 3, lt, 205, 3), lift(uuid(2), 30, lt, 210, 1));
for (const lt of ['Front Squat', 'Bench']) lifts.push(lift(uuid(5), 30, lt, 190, 3), lift(uuid(5), 3, lt, 200, 3));
const tests = [{ id: uuid(9100), athlete_id: uuid(5), test_type: 'vertical_jump', test_variant: 'arm_swing', metric: 28, unit: 'in', created_at: at(20) }, { id: uuid(9101), athlete_id: uuid(5), test_type: 'vertical_jump', test_variant: 'arm_swing', metric: 29, unit: 'in', created_at: at(3) },
  { id: uuid(9102), athlete_id: uuid(5), test_type: 'board_jump', test_variant: 'arm_swing', metric: 96, unit: 'in', created_at: at(20) }, { id: uuid(9103), athlete_id: uuid(5), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.21, unit: 'sec', created_at: at(20) },
  vj(uuid(5), 40, 25), vj(uuid(5), 3, 27), vj(uuid(1), 60, 24), vj(uuid(1), 30, 26), vj(uuid(1), 2, 25.5), vj(uuid(2), 30, 22), vj(uuid(3), 30, 28)];
const logs = [];
for (let d = 60; d >= 1; d -= 5) logs.push({ id: uuid(n++), athlete_id: uuid(5), sport: 'Football', weight_lbs: 190, sleep_hrs: 0, created_at: at(d, 11), is_baseline: d === 60 }, { id: uuid(n++), athlete_id: uuid(1), sport: 'Football', weight_lbs: 175 + (60 - d) / 10, sleep_hrs: 0, created_at: at(d, 12), is_baseline: d === 60 });
const rpe = (a, d, v) => ({ id: uuid(n++), athlete_id: a, sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: v, session_minutes: 60, session_label: 'Lift', session_type: 'rpe', created_at: at(d, 22) });
logs.push(rpe(uuid(1), 2, 6), rpe(uuid(1), 5, 7), rpe(uuid(1), 9, 8), rpe(uuid(2), 2, 5), rpe(uuid(2), 5, 5), rpe(uuid(2), 9, 5), rpe(uuid(2), 12, 5), rpe(uuid(1), 40, 9));
const SEED = { enableLiftTracker: true, enableSpeedPower: true, liftTypes: ['Front Squat', 'Bench', 'Hang Clean'], dataWindowDays: 90 };
(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(tests) });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(lifts) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2500);
  await page.getByText('COLTON MCDANIEL', { exact: true }).first().click(); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /View Full Trends/i }).click(); await page.waitForTimeout(1500);
  await page.getByTestId('pc-open').click(); await page.waitForTimeout(1200);
  const card = page.getByTestId('progress-card');
  check('opens from the athlete profile', await card.count() === 1);
  const txt = await card.innerText();
  check('header: name title-cased, sport · pos · class · testing span', /Colton McDaniel/i.test(txt) && /Football · DB · Class of 2028 · Testing/.test(txt), txt.slice(0, 200));
  const metrics = await page.getByTestId('pc-metric').allInnerTexts();
  const order = metrics.map(m => m.split('\n')[0]);
  check('all 10 testing metrics + body mass, in order', JSON.stringify(order) === JSON.stringify(['VERTICAL (HANDS ON HIPS)', 'VERTICAL (ARM SWING)', 'BROAD JUMP', 'FLY 10', 'BENCH PRESS', 'HANG CLEAN', 'FRONT SQUAT', 'BACK SQUAT', 'DEADLIFT', 'TRAP BAR DEADLIFT', 'BODY MASS']), JSON.stringify(order));
  check('untested metrics read N/A', metrics.filter(m => /N\/A/.test(m)).length === 7 && /N\/A/.test(metrics[2]) && /Not tested yet/.test(metrics[2]), metrics[2]);
  const fs = metrics.find(m => /^FRONT SQUAT/i.test(m)) || '';
  check('Front Squat shows the set 225 × 3 with PR pill', /225 × 3/.test(fs) && /\bPR\b/.test(fs), fs);
  check('Front Squat change since first test in est. lb, rank in DB group', /\+44 lb est\. since/.test(fs) && /#3 of 5 Football/.test(fs), JSON.stringify(fs));
  const vt = metrics.find(m => /VERTICAL \(HANDS/i.test(m)) || '';
  check('Vertical: +1.5 in since first, no PR (best was earlier)', /\+1\.5 in since/.test(vt) && !/\bPR\b/.test(vt), vt);
  const bench = metrics.find(m => /^BENCH PRESS/i.test(m)) || '';
  check('big number = personal best (Bench 205 × 1), chart labels most recent (190 × 1)', /205 × 1/.test(bench) && (await page.getByTestId('pc-metric').filter({ hasText: /^BENCH PRESS/i }).getByTestId('pc-recent').textContent()) === '190 × 1', bench);
  const vtRecent = await page.getByTestId('pc-metric').filter({ hasText: /VERTICAL \(HANDS/i }).getByTestId('pc-recent').textContent();
  check('vertical HOH: best 26.0 in the box, 25.5 on the chart', /26\.0/.test(vt) && vtRecent === '25.5', `${vt} | ${vtRecent}`);
  // v5.15.0: Training counts every session by default (the 40-day-old one too), with a
  // range picker in the toolbar.
  let tr = await page.getByTestId('pc-training').innerText();
  check('training strip, all sessions: 4 sessions, avg RPE 7.5, logged 4 / 5 (80%)', /4\s*SESSIONS/i.test(tr) && /7\.5\s*AVG RPE/i.test(tr) && /4 \/ 5/.test(tr) && /80% of team session days/.test(tr) && /Since \w{3} \d{1,2}/.test(tr), tr.replace(/\n/g, ' | '));
  check('training range defaults to All sessions', await page.getByTestId('pc-trange').inputValue() === 'all');
  await page.getByTestId('pc-trange').selectOption('4w'); await page.waitForTimeout(200);
  tr = await page.getByTestId('pc-training').innerText();
  check('last 4 weeks: 3 sessions, avg RPE 7.0, logged 3 / 4 (75%)', /3\s*SESSIONS/i.test(tr) && /7\.0\s*AVG RPE/i.test(tr) && /3 \/ 4/.test(tr) && /75% of team session days/.test(tr) && /Last 4 weeks/.test(tr), tr.replace(/\n/g, ' | '));
  await page.getByTestId('pc-trange').selectOption('custom'); await page.waitForTimeout(200);
  const cd = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await page.getByTestId('pc-tfrom').fill(cd(10)); await page.getByTestId('pc-tto').fill(cd(4)); await page.waitForTimeout(200);
  tr = await page.getByTestId('pc-training').innerText();
  check('custom dates: 2 sessions, logged 2 / 2 (100%), range printed', /2\s*SESSIONS/i.test(tr) && /7\.5\s*AVG RPE/i.test(tr) && /2 \/ 2/.test(tr) && /100% of team session days/.test(tr) && /\w{3} \d{1,2} – \w{3} \d{1,2}, \d{4}/.test(tr), tr.replace(/\n/g, ' | '));
  await page.getByTestId('pc-tfrom').fill(cd(60)); await page.getByTestId('pc-tto').fill(cd(50)); await page.waitForTimeout(200);
  check('a range with no sessions says so', /No session RPE logged ·/.test(await page.getByTestId('pc-training').innerText()));
  check('range choice remembered', JSON.parse(await page.evaluate(() => localStorage.getItem('hpd_pc_trange'))) === 'custom');
  await page.getByTestId('pc-trange').selectOption('all'); await page.waitForTimeout(200);
  const sp = await page.getByTestId('pc-spark').first().locator('svg').evaluate(e => [e.getAttribute('width'), e.getAttribute('height')]);
  check('charts are larger: 150 x 60', sp[0] === '150' && sp[1] === '60', JSON.stringify(sp));
  const overlap = await page.getByTestId('pc-metric').evaluateAll(rows => rows.filter(r => !r.dataset.na).map(r => { const t = r.firstElementChild; return t.scrollWidth - t.clientWidth; }));
  check('number rows fit beside the larger chart (no overflow)', overlap.every(v => v <= 0), JSON.stringify(overlap));
  const cut = await page.getByTestId('pc-metric').evaluateAll(rows => rows.map(r => { const l = r.firstElementChild.firstElementChild; return l.scrollWidth - l.clientWidth; }));
  check('metric names are not cut off', cut.every(v => v <= 0), JSON.stringify(cut));
  check('× BW under lift best: front squat 248 / 180.5 = 1.37× BW', /1\.37× BW/.test(fs), fs);
  const tiles = await page.getByTestId('pc-tile').allInnerTexts();
  check('tiles: 1 PR, 3/3 improved, 3 in top 5 Football', /^1\b/.test(tiles[0]) && /3 \/ 3/.test(tiles[1]) && /^3\b/.test(tiles[2]), JSON.stringify(tiles));
  const focus = await page.getByTestId('pc-focus').allInnerTexts();
  check('focus: Bench 7.3% below best of 205 × 1', focus.length >= 1 && /Bench/.test(focus[0]) && /7\.3% below your best of 205 × 1/.test(focus[0]), JSON.stringify(focus));
  await page.getByTestId('pc-note-input').fill('Great block. Keep driving the squat.');
  check("coach's note prints what's typed", /Great block\. Keep driving the squat\./.test(await page.getByTestId('pc-note').innerText()));
  await page.getByTestId('pc-toggle-note').click();
  check("coach's note toggles off", await page.getByTestId('pc-note').count() === 0);
  await page.getByTestId('pc-toggle-note').click();
  await page.getByTestId('pc-toggle-training').click(); await page.getByTestId('pc-toggle-xbw').click(); await page.waitForTimeout(200);
  check('training + × BW toggles hide them', await page.getByTestId('pc-training').count() === 0 && !/× BW/.test(await card.innerText()));
  await page.getByTestId('pc-toggle-training').click(); await page.getByTestId('pc-toggle-xbw').click();
  await page.getByTestId('pc-toggle-e1rm').click();
  check('est. 1RM toggle adds the estimate', /Est\. 1RM 248 lb/.test(await card.innerText()));
  await page.getByTestId('pc-toggle-e1rm').click();
  await page.getByTestId('pc-toggle-lifts').click(); await page.waitForTimeout(200);
  const noLifts = await page.getByTestId('pc-metric').allInnerTexts();
  check('all-lifts toggle hides every lift', noLifts.length === 5 && !noLifts.some(m => /BENCH|SQUAT|CLEAN|DEADLIFT/i.test(m)), JSON.stringify(noLifts.map(m => m.split('\n')[0])));
  await page.getByTestId('pc-toggle-lifts').click();
  await page.getByTestId('pc-metric-toggle-broad').click(); await page.getByTestId('pc-metric-toggle-tbdl').click(); await page.waitForTimeout(200);
  const fewer = (await page.getByTestId('pc-metric').allInnerTexts()).map(m => m.split('\n')[0]);
  check('individual metric toggles remove just those rows', fewer.length === 9 && !fewer.includes('BROAD JUMP') && !fewer.includes('TRAP BAR DEADLIFT'), JSON.stringify(fewer));
  check('metric choices remembered', JSON.parse(await page.evaluate(() => localStorage.getItem('hpd_pc_hidden'))).broad === true);
  await page.getByTestId('pc-metric-toggle-broad').click(); await page.getByTestId('pc-metric-toggle-tbdl').click();
  await page.getByTestId('pc-toggle-focus').click(); await page.waitForTimeout(200);
  check('focus toggle hides Focus Next Block, note becomes 02', await page.getByTestId('pc-focus-section').count() === 0 && /02\s*COACH'S NOTE/i.test(await page.getByTestId('pc-note').innerText()));
  await page.getByTestId('pc-toggle-focus').click();
  const fits = () => card.evaluate(el => { const inner = el.firstElementChild.getBoundingClientRect(); const outer = el.getBoundingClientRect(); return [Math.round(inner.height), Math.round(outer.height), el.dataset.fit]; });
  let box = await fits();
  check('content fits the page box', box[0] <= box[1] + 1, JSON.stringify(box));
  await page.emulateMedia({ media: 'print' });
  check('print shows only the card', await page.locator('.pc-print-root').isVisible() && !(await page.locator('#root').isVisible()));
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF is exactly one Letter page', pages === 1, String(pages));
  await page.emulateMedia({ media: 'screen' });
  await card.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
  // Worst case: an athlete with every metric tested, est. 1RM on, long note -> one page.
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
  await page.getByText('Full Load', { exact: true }).first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /View Full Trends/i }).click(); await page.waitForTimeout(1200);
  await page.getByTestId('pc-open').click(); await page.waitForTimeout(1000);
  await page.getByTestId('pc-toggle-e1rm').click();
  await page.getByTestId('pc-note-input').fill('Long note. '.repeat(30));
  await page.waitForTimeout(400);
  const full = page.getByTestId('progress-card');
  check('worst case: every metric has data', (await page.getByTestId('pc-metric').allInnerTexts()).filter(m => /N\/A/.test(m)).length === 0);
  const fb = await full.evaluate(el => { const i = el.firstElementChild.getBoundingClientRect(); const o = el.getBoundingClientRect(); return [Math.round(i.height), Math.round(o.height), el.dataset.fit]; });
  check('worst case shrinks to fit the page', fb[0] <= fb[1] + 1, JSON.stringify(fb));
  await page.emulateMedia({ media: 'print' });
  const pdf2 = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  check('worst case PDF is one page', (pdf2.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1);
  await page.emulateMedia({ media: 'screen' });
  const fullFit = await page.getByTestId('pc-metric').evaluateAll(rows => rows.map(r => { const t = r.firstElementChild; const l = t.firstElementChild; return Math.max(t.scrollWidth - t.clientWidth, l.scrollWidth - l.clientWidth); }));
  check('worst case (PRs everywhere): names whole, numbers fit beside the charts', fullFit.every(v => v <= 0), JSON.stringify(fullFit));
  check('worst case: PR shows as one "PR · date" tag', /^PR · \w{3} \d{1,2}$/i.test((await page.getByTestId('pc-pr').first().innerText()).trim()), await page.getByTestId('pc-pr').first().innerText());
  await page.emulateMedia({ media: 'screen' });
  await full.screenshot({ path: (process.env.SHOT || '/dev/null').replace('.png', '_full.png') }).catch(() => {});
  await page.getByTestId('pc-toggle-e1rm').click();
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
