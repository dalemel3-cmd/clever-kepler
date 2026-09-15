// Run with:  node tests/athletes-est-1rm.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.33.0: the Athletes screen's profile panel gained a "Best est. 1RM" tile - the
// same Epley estimate the Lift Tracker leaderboard ranks on, taken across every
// lift this athlete has ever logged (whichever exercise happened to be their best),
// so the profile panel's strength number can never disagree with the leaderboard.
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
  { id: uuid(1), name: 'Strong Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  { id: uuid(2), name: 'No Lifts Athlete', sport: 'Football', team: 'Varsity', grade: '10th', position: 'WR' },
];
// Best set is the 225x8 Squat (Epley est. ~285), not the heavier-looking 275x1 Bench -
// proves the tile reduces across every lift type, and by the estimate, not raw weight.
const liftLogs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Strong Athlete', sport: 'Football', lift_type: 'Bench', weight_lbs: 275, reps: 1, source: 'manual', created_at: ago(2) },
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Strong Athlete', sport: 'Football', lift_type: 'Squat', weight_lbs: 225, reps: 8, source: 'manual', created_at: ago(1) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
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

  console.log('\n[A] Profile panel shows the best estimated 1RM across every lift');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    await page.getByText('Strong Athlete', { exact: true }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('tile is labeled with the winning lift type', /best est\. 1rm \(squat\)/i.test(body), body.slice(0, 400));
    check('shows the Epley estimate (225x8 -> 285), not the heavier raw single (275)', /285 lb/.test(body), body.slice(0, 400));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] An athlete with no lift logs reads as such, not a crash or blank tile');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    await page.getByText('No Lifts Athlete', { exact: true }).first().click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('reads "No lifts logged" instead of a blank/undefined tile', /no lifts logged/i.test(body), body.slice(0, 400));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
