// Run with:  node tests/lift-tracker.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// New feature: Lift Tracker (Bench, Squat, Deadlift, Hang Clean, Power Clean by
// default, plus whatever a coach adds in Settings -> Lift Types). Off by default,
// same opt-in convention as RPE and Speed & Power.
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
  { id: uuid(1), name: 'Lift Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  // Two athletes for the leaderboard's estimated-1RM ranking probe: a heavier single
  // vs a lighter but higher-rep set. Epley: 275x1 -> 275; 225x8 -> 225*(1+8/30) = 285.
  { id: uuid(2), name: 'Heavy Single', sport: 'Football', team: 'Varsity', grade: '12th', position: 'DL' },
  { id: uuid(3), name: 'High Rep Athlete', sport: 'Football', team: 'Varsity', grade: '12th', position: 'LB' },
];

const liftLogs = [
  { id: uuid(50), athlete_id: uuid(2), athlete_name: 'Heavy Single', sport: 'Football', lift_type: 'Squat', weight_lbs: 275, reps: 1, source: 'manual', created_at: ago(3) },
  { id: uuid(51), athlete_id: uuid(3), athlete_name: 'High Rep Athlete', sport: 'Football', lift_type: 'Squat', weight_lbs: 225, reps: 8, source: 'manual', created_at: ago(2) },
];

const newPage = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  page.writes = [];
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), {
    enableLiftTracker: opts.enableLiftTracker !== false,
    liftTypes: opts.liftTypes || ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'],
  });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/lift_logs')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(liftLogs) });
      if (method === 'POST') {
        const body = req.postDataJSON();
        const row = Array.isArray(body) ? body[0] : body;
        page.writes.push({ method, body: row });
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ ...row, id: uuid(900) }]) });
      }
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Off by default - no Lift Tracker nav item');
  {
    const page = await newPage(browser, { enableLiftTracker: false });
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2000);
    check('no Lift Tracker link in the sidebar', (await page.getByText('LIFT TRACKER', { exact: false }).count()) === 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Enabled: roster grid renders, click opens the entry modal with lift buttons');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('Lift Athlete appears on the roster', /Lift Athlete/i.test(body));
    await page.getByText('Lift Athlete', { exact: true }).first().click();
    await page.waitForTimeout(600);
    check('Bench option present', (await page.getByRole('button', { name: 'Bench', exact: true }).count()) > 0);
    check('Squat option present', (await page.getByRole('button', { name: 'Squat', exact: true }).count()) > 0);
    check('Deadlift option present', (await page.getByRole('button', { name: 'Deadlift', exact: true }).count()) > 0);
    check('Hang Clean option present', (await page.getByRole('button', { name: 'Hang Clean', exact: true }).count()) > 0);
    check('Power Clean option present', (await page.getByRole('button', { name: 'Power Clean', exact: true }).count()) > 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Logging a lift writes weight/reps/lift_type, then resets for a second lift');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByText('Lift Athlete', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Bench', exact: true }).click();
    await page.getByPlaceholder('245').fill('225');
    await page.getByPlaceholder('5', { exact: true }).fill('5');
    await page.getByRole('button', { name: /Log Lift/i }).click();
    await page.waitForTimeout(800);

    check('a write reached lift_logs', page.writes.length === 1, `writes: ${page.writes.length}`);
    if (page.writes.length) {
      const w = page.writes[0].body;
      check('correct athlete_id', w.athlete_id === uuid(1), w.athlete_id);
      check('correct lift_type', w.lift_type === 'Bench', w.lift_type);
      check('correct weight', Number(w.weight_lbs) === 225, w.weight_lbs);
      check('correct reps', Number(w.reps) === 5, w.reps);
    }
    check('success message shown', /Logged 225 lbs.*5 reps.*Bench/i.test(await page.locator('body').innerText()));

    // Fields reset (not the modal) so a second lift can be logged immediately.
    await page.getByRole('button', { name: 'Squat', exact: true }).click();
    await page.getByPlaceholder('245').fill('315');
    await page.getByPlaceholder('5', { exact: true }).fill('3');
    await page.getByRole('button', { name: /Log Lift/i }).click();
    await page.waitForTimeout(800);
    check('a second write reached lift_logs without reopening the athlete', page.writes.length === 2, `writes: ${page.writes.length}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] A coach-added custom lift type shows up as an option');
  {
    const page = await newPage(browser, { liftTypes: ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean', 'Front Squat'] });
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByText('Lift Athlete', { exact: true }).first().click();
    await page.waitForTimeout(600);
    check('custom "Front Squat" option present', (await page.getByRole('button', { name: 'Front Squat', exact: true }).count()) > 0);
  }

  console.log('\n[E] Leaderboard ranks by estimated 1RM, not raw weight');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Leaderboard/i }).click();
    await page.waitForTimeout(500);
    await page.getByLabel('Lift', { exact: true }).selectOption('Squat');
    await page.waitForTimeout(500);
    const body = await page.locator('body').innerText();
    // High Rep Athlete's 225x8 (est ~285) should outrank Heavy Single's 275x1 (est 275)
    // despite the lower raw weight - proves the ranking uses the Epley estimate, not
    // just the heaviest number logged.
    const upperBody = body.toUpperCase(); // names render uppercase via CSS text-transform
    const highRepIdx = upperBody.indexOf('HIGH REP ATHLETE');
    const heavySingleIdx = upperBody.indexOf('HEAVY SINGLE');
    check('both athletes appear on the Squat leaderboard', highRepIdx >= 0 && heavySingleIdx >= 0, body.slice(0, 300));
    check('High Rep Athlete (est. 285) ranks above Heavy Single (est. 275)', highRepIdx >= 0 && heavySingleIdx >= 0 && highRepIdx < heavySingleIdx,
      'a lower estimated 1RM ranked above a higher one');
    check('shows the actual best set, not just the estimate', /best: 225\s*[×x]\s*8/i.test(body), (body.match(/.{0,60}225.{0,60}/gi) || []).join(' || '));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
