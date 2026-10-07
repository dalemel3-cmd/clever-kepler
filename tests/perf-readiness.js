// Run with:  node tests/perf-readiness.js   (preview on :4173; Supabase stubbed)
// v5.5.0 Performance vs Readiness printout (docs/HANDOFF.md §114).
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
];
let n = 100;
const logs = [];
const wi = (a, d, w, base = false) => logs.push({ id: uuid(n++), athlete_id: a, sport: 'Football', weight_lbs: w, sleep_hrs: 8, created_at: at(d, 12), is_baseline: base });
const rpe = (a, d, v, m) => logs.push({ id: uuid(n++), athlete_id: a, sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: v, session_minutes: m, session_label: 'Practice', session_type: 'rpe', created_at: at(d, 22) });
for (const a of [1, 2, 3, 4]) wi(uuid(a), 30, 200, true);
wi(uuid(1), 20, 199); wi(uuid(1), 2, 194);           // test day 2: -6 lb
wi(uuid(2), 2, 200); wi(uuid(3), 2, 201); wi(uuid(4), 2, 196);
wi(uuid(1), 20, 199);
for (let d = 3; d < 30; d += 2) for (const a of [1, 3, 4]) rpe(uuid(a), d, 5, 60);
for (let d = 10; d < 30; d += 3) rpe(uuid(2), d, 3, 30);
for (let d = 3; d < 9; d++) rpe(uuid(2), d, 9, 100);  // heavy week going into the test
const vj = (a, d, v) => ({ id: uuid(n++), athlete_id: a, test_type: 'vertical_jump', test_variant: 'arm_swing', metric: v, created_at: at(d, 15) });
const tests = [
  vj(uuid(1), 20, 30), vj(uuid(1), 2, 27),
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
  check('4 football athletes on the test day (volleyball excluded)', rows.length === 4 && !/Vb Val/.test(txt), JSON.stringify(rows));
  const row = (nm) => rows.find(r => r.includes(nm)) || '';
  check('Dry Dan: −10% vs best, −6.0 lb (−3.0%), Act', /−10\.0%/.test(row('Dry Dan')) && /−6\.0 lb/.test(row('Dry Dan')) && /−3\.0%/.test(row('Dry Dan')) && /ACT/i.test(row('Dry Dan')), row('Dry Dan'));
  check('Tired Tom: spike A:C ≥ 1.5 + drop -> Act', /ACT/i.test(row('Tired Tom')) && (() => { const m = row('Tired Tom').match(/\b(\d\.\d\d)\b/); return m && +m[1] >= 1.5; })(), row('Tired Tom'));
  check('Fine Fred: PB, no flag', /PB/.test(row('Fine Fred')) && !/ACT|WATCH/i.test(row('Fine Fred')), row('Fine Fred'));
  check('Light Lou: down 4 lb, small dip -> Watch', /−4\.0 lb/.test(row('Light Lou')) && /WATCH/i.test(row('Light Lou')), row('Light Lou'));
  check('Act rows sorted first', /Dry Dan|Tired Tom/.test(rows[0]) && /Dry Dan|Tired Tom/.test(rows[1]));
  check('plain-language note for Dry Dan', /down 6\.0 lb \(3\.0%\), vertical jump −10%/i.test(txt), (txt.match(/down 6[^\n]*/) || [''])[0]);
  check('athlete pages: one per tested athlete', await page.getByTestId('pr-athlete-page').count() === 4);
  await page.getByTestId('pr-pages-toggle').uncheck();
  check('athlete pages toggle off', await page.getByTestId('pr-athlete-page').count() === 0);
  await page.getByTestId('pr-pages-toggle').check();
  const days = await page.locator('#pr-day option').count();
  check('test-day picker lists both test days', days === 2, String(days));
  await page.emulateMedia({ media: 'print' });
  check('print shows only the report', await page.locator('.pr-print-root').isVisible() && !(await page.locator('#root').isVisible()));
  const pdf = await page.pdf({ format: 'Letter', preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF = team page + 4 athlete pages', pdfPages === 5, String(pdfPages));
  await page.screenshot({ path: process.env.SHOT || '/dev/null', fullPage: true }).catch(() => {});
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(2000);
  check('also opens from the Readiness Report', await page.getByTestId('pr-open').count() === 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
