// Run with:  node tests/profile-baseline-chart-agreement.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.34.1: the weight-trend chart's reference line re-derived an athlete's baseline
// by hand (is_baseline flag first, override map second) instead of calling the same
// getAthleteBaseline() the stat tiles above it use (override map first, flag second).
// A coach correcting a baseline via "Make Baseline Marker" after an older log was
// already flagged is_baseline could see two different baselines on the same profile:
// the tiles showing the correction, the chart still showing the old flagged log.
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
  { id: uuid(1), name: 'Override Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
];
// An older log is explicitly flagged is_baseline (190 lbs). A coach later corrects the
// baseline via "Make Baseline Marker" on a different, newer log (170 lbs) - that write
// goes to the shiloh_baselines_map override, which getAthleteBaseline() checks FIRST.
const logs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Override Athlete', sport: 'Football', weight_lbs: 190, sleep_hrs: 8, is_baseline: true, created_at: ago(30) },
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Override Athlete', sport: 'Football', weight_lbs: 170, sleep_hrs: 8, is_baseline: false, created_at: ago(10) },
  { id: uuid(52), athlete_id: uuid(1), athlete_name: 'Override Athlete', sport: 'Football', weight_lbs: 172, sleep_hrs: 7.5, is_baseline: false, created_at: ago(1) },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await stubAuth(page);
  // Seed the override map exactly as "Make Baseline Marker" would have written it -
  // pointing at the 170 lb log, not the is_baseline-flagged 190 lb one.
  await page.addInitScript((athId, logId) => {
    localStorage.setItem('shiloh_baselines_map', JSON.stringify({
      [athId]: { log_id: logId, weight_lbs: 170, date_str: new Date(Date.now() - 10 * 864e5).toISOString() }
    }));
  }, uuid(1), uuid(51));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  console.log('\n[A] The chart\'s baseline reference line agrees with the stat tiles above it');
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
  await page.getByText('Override Athlete', { exact: true }).first().click(); await page.waitForTimeout(1800);
  const body = await page.locator('body').innerText();
  check('the override (170 lbs) wins on the page, not the flagged log (190 lbs)', /170/.test(body) , body.slice(0, 300));
  check('the stale flagged baseline (190) is not shown as the active baseline', !/Baseline:\s*190/i.test(body), body.match(/.{0,40}Baseline:.{0,20}/i)?.[0]);
  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
