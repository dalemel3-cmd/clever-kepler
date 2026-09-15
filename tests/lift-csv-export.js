// Run with:  node tests/lift-csv-export.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.32.0: Lift Tracker gained a CSV export of every logged set. Icon-only, no label,
// and separated from the Log a Lift / Leaderboard tabs by a divider - deliberately not
// worded as a button an athlete tapping through the kiosk would read as part of
// logging their own lift.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Export Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
];
const liftLogs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Export Athlete', sport: 'Football', lift_type: 'Squat', weight_lbs: 225, reps: 8, source: 'manual', created_at: ago(1) },
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Export Athlete', sport: 'Football', lift_type: 'Bench', weight_lbs: 185, reps: 5, source: 'manual', created_at: ago(0) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableLiftTracker: true });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(liftLogs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Export button is icon-only, not a labeled call-to-action');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const btn = page.getByLabel('Export all lift logs to CSV');
    check('the export control exists', await btn.count() > 0);
    check('it carries no visible text label', (await btn.innerText()).trim() === '');
    check('it is not styled as an accent call-to-action (no gold fill)',
      await btn.evaluate(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)' || getComputedStyle(el).backgroundColor === 'transparent'));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Clicking it downloads a CSV with every logged set');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByLabel('Export all lift logs to CSV').click(),
    ]);
    check('filename matches the Shiloh_LiftLogs_<date>.csv convention', /^Shiloh_LiftLogs_\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
    const path = await download.path();
    const fs = await import('fs');
    const content = fs.readFileSync(path, 'utf-8');
    check('header row matches expected columns', content.startsWith('"Date","Athlete","Sport","Lift","Weight (lbs)","Reps","Est. 1RM"'), content.split('\n')[0]);
    check('both logged sets are present', content.includes('Squat') && content.includes('Bench'), content);
    check('estimated 1RM is computed, not just raw weight (225x8 -> 285, not 225)', content.includes('285'), content);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
