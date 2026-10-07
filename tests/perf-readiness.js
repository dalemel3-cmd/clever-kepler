// Run with:  node tests/perf-readiness.js   (preview on :4173; Supabase stubbed)
// v5.5.0/5.5.1 Performance vs Readiness printout (docs/HANDOFF.md §114-115).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (d, h = 14) => { const t = new Date(Date.now() - d * 86400000); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const athletes = [
  { id: uuid(1), name: 'DRY DAN', sport: 'Football', position: 'WR' },     // down 6 lb + vertical down -> Act
  { id: uuid(2), name: 'Tired Tom', sport: 'Football', position: 'LB' },   // A:C spike + vertical down -> Act
  { id: uuid(3), name: 'Fine Fred', sport: 'Football', position: 'DB' },   // PB, normal weight -> no flag
  { id: uuid(4), name: 'Light Lou', sport: 'Football', position: 'RB' },   // down 4 lb, vertical fine -> Watch
  { id: uuid(5), name: 'Vb Val', sport: 'Volleyball' },
  { id: uuid(6), name: 'Slow Sam', sport: 'Football', position: 'TE' },  // jump down 13%, weight fine -> no flag
];
let n = 100;
const logs = [];
const wi = (a, d, w, base = false) => logs.push({ id: uuid(n++), athlete_id: a, sport: 'Football', weight_lbs: w, sleep_hrs: 8, created_at: at(d, 12), is_baseline: base });
const rpe = (a, d, v, m) => logs.push({ id: uuid(n++), athlete_id: a, sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: v, session_minutes: m, session_label: 'Practice', session_type: 'rpe', created_at: at(d, 22) });
for (const a of [1, 2, 3, 4, 6]) wi(uuid(a), 30, 200, true);
wi(uuid(6), 2, 200);
wi(uuid(1), 20, 199); wi(uuid(1), 2, 194);           // test day 2: -6 lb
wi(uuid(2), 2, 200); wi(uuid(3), 2, 201); wi(uuid(4), 2, 196);
wi(uuid(1), 20, 199);
for (let d = 3; d < 30; d += 2) for (const a of [1, 3, 4]) rpe(uuid(a), d, 5, 60);
for (let d = 10; d < 30; d += 3) rpe(uuid(2), d, 3, 30);
for (let d = 3; d < 9; d++) rpe(uuid(2), d, 9, 100);  // heavy week going into the test
const vj = (a, d, v) => ({ id: uuid(n++), athlete_id: a, test_type: 'vertical_jump', test_variant: 'arm_swing', metric: v, created_at: at(d, 15) });
const tests = [
  vj(uuid(1), 20, 30), vj(uuid(1), 2, 26.5),
  vj(uuid(6), 20, 30), vj(uuid(6), 2, 26),
  vj(uuid(2), 20, 28), vj(uuid(2), 2, 25.5),
  vj(uuid(3), 20, 26), vj(uuid(3), 2, 27.5),
  vj(uuid(4), 20, 24), vj(uuid(4), 2, 23.8),
  vj(uuid(5), 2, 20),
];
const SEED = { enableRpe: true, enableSpeedPower: true, rpeTrackDuration: true, rpeChronicWeeks: 4, rpeLoadSpikeRatio: 1.3, dehydrationThreshold: 2, dataWindowDays: 60 };

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
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  await page.goto(`${APP}/#power`); await page.waitForTimeout(2500);
  await page.getByTestId('pr-open').first().click(); await page.waitForTimeout(1200);
  const doc = page.getByTestId('perf-readiness');
  check('opens', await doc.count() === 1);
  check('defaults to Football', (await page.locator('#pr-team').inputValue()) === 'Football');
  const rows = await page.getByTestId('pr-row').allInnerTexts();
  const txt = (await doc.innerText());
  const head = await doc.locator('thead').first().innerText();
  check('columns: Most recent, Best, Baseline, Weight', /MOST RECENT/i.test(head) && /BEST/i.test(head) && /BASELINE/i.test(head) && /WEIGHT/i.test(head) && !/VS BEST|WT VS BASE|RESULT/i.test(head), head);
  check('5 football athletes on the test day (volleyball excluded)', rows.length === 5 && !/Vb Val/.test(txt), JSON.stringify(rows));
  const row = (nm) => rows.find(r => r.includes(nm)) || '';
  const flagged = (nm) => /\bFLAG\b/i.test(row(nm));
  check('Dry Dan: recent 26.5, best 30.0, baseline 200.0, weight 194.0 -> flagged', /26\.5/.test(row('Dry Dan')) && /30\.0/.test(row('Dry Dan')) && /200\.0 lb/.test(row('Dry Dan')) && /194\.0 lb/.test(row('Dry Dan')) && flagged('Dry Dan'), row('Dry Dan'));
  check('Slow Sam: jump −13% but weight fine -> not flagged', !flagged('Slow Sam'), row('Slow Sam'));
  check('Light Lou: weight −2% but jump fine -> not flagged', !flagged('Light Lou'), row('Light Lou'));
  check('Tired Tom: spike alone -> not flagged', !flagged('Tired Tom'), row('Tired Tom'));
  check('Fine Fred: new PB marked', /\u25B2/.test(row('Fine Fred')) && !flagged('Fine Fred'), row('Fine Fred'));
  check('flagged first', /Dry Dan/.test(rows[0]));
  check('plain note on the flag', /vertical jump 11\.7% off best, down 3\.0% body weight \(6\.0 lb\)/i.test(txt), (txt.match(/off best[^\n]*/) || [''])[0]);
  await page.getByTestId('pr-drop').fill('10');
  await page.waitForTimeout(200);
  check('custom jump threshold 10% -> Slow Sam still needs weight; Dry Dan only', (await page.getByTestId('pr-row').allInnerTexts()).filter(r => /\bFLAG\b/i.test(r)).length === 1);
  await page.getByTestId('pr-weight').fill('1.5');
  await page.getByTestId('pr-drop').fill('0.5');
  await page.waitForTimeout(200);
  const f2 = (await page.getByTestId('pr-row').allInnerTexts()).filter(r => /\bFLAG\b/i.test(r)).map(r => r.split('\n')[0]);
  check('custom thresholds (0.5% / 1.5%) -> Dry Dan + Light Lou', f2.length === 2 && f2.some(x => /Light Lou/.test(x)), JSON.stringify(f2));
  check('thresholds remembered', JSON.parse(await page.evaluate(() => localStorage.getItem('hpd_pr_thresholds'))).weight === '1.5');
  await page.getByTestId('pr-drop').fill('11'); await page.getByTestId('pr-weight').fill('2'); await page.waitForTimeout(200);
  check('athlete pages: one per tested athlete', await page.getByTestId('pr-athlete-page').count() === 5);
  await page.getByTestId('pr-pages-toggle').uncheck();
  check('athlete pages toggle off', await page.getByTestId('pr-athlete-page').count() === 0);
  await page.getByTestId('pr-pages-toggle').check();
  const days = await page.locator('#pr-day option').count();
  check('test-day picker lists both test days', days === 2, String(days));
  await page.emulateMedia({ media: 'print' });
  check('print shows only the report', await page.locator('.pr-print-root').isVisible() && !(await page.locator('#root').isVisible()));
  const pdf = await page.pdf({ format: 'Letter', preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF = team page + 5 athlete pages', pdfPages === 6, String(pdfPages));
  await page.screenshot({ path: process.env.SHOT || '/dev/null', fullPage: true }).catch(() => {});
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(2000);
  check('also opens from the Readiness Report', await page.getByTestId('pr-open').count() === 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
