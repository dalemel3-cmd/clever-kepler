// Run with:  node tests/lift-edit.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.31.0: Lift Tracker entries can now be corrected in place - a coach can fix a
// fat-fingered weight/rep count, or move a set logged under the wrong exercise
// entirely, from the "Recent Lifts" list in the entry modal. useLiftLogs.js already
// had updateLift/deleteLift; this wires them into the UI for the first time.
// Also covers the Weight/Reps input grid no longer overlapping on a narrow modal.
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
  { id: uuid(1), name: 'Edit Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
];

// Logged 225x5 as "Squat" but it was actually a Bench set at 235x3 - the exact
// "wrong category, wrong numbers" case this feature is for.
const liftLogs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Edit Athlete', sport: 'Football', lift_type: 'Squat', weight_lbs: 225, reps: 5, source: 'manual', created_at: ago(0) },
];

const newPage = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  page.patches = [];
  page.deletes = [];
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), {
    enableLiftTracker: true,
    liftTypes: ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'],
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
      if (method === 'PATCH') { page.patches.push({ url, body: req.postDataJSON() }); return route.fulfill({ status: 204, headers: hdrs, body: '' }); }
      if (method === 'DELETE') { page.deletes.push(url); return route.fulfill({ status: 204, headers: hdrs, body: '' }); }
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Weight and Reps inputs do not overlap in the entry modal');
  {
    const page = await newPage(browser, { viewport: { width: 390, height: 800 } });
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByText('Edit Athlete', { exact: true }).first().click();
    await page.waitForTimeout(600);
    const weightBox = await page.getByPlaceholder('245').boundingBox();
    const repsBox = await page.getByPlaceholder('5', { exact: true }).boundingBox();
    check('both inputs are present', weightBox !== null && repsBox !== null);
    check('Weight and Reps boxes do not overlap horizontally', weightBox && repsBox && (weightBox.x + weightBox.width) <= repsBox.x + 1,
      `weight=${JSON.stringify(weightBox)}, reps=${JSON.stringify(repsBox)}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Editing a logged set: pencil opens inline edit, Save PATCHes weight/reps/lift_type');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByText('Edit Athlete', { exact: true }).first().click();
    await page.waitForTimeout(600);
    check('the mis-logged set appears in Recent Lifts', /Squat/.test(await page.locator('body').innerText()));

    await page.getByTitle('Edit this entry').first().click();
    await page.waitForTimeout(400);
    // Move it from Squat to Bench - the "wrong category" correction.
    await page.getByRole('button', { name: 'Bench', exact: true }).last().click();
    const weightInput = page.getByLabel('Edit weight');
    await weightInput.fill('235');
    const repsInput = page.getByLabel('Edit reps');
    await repsInput.fill('3');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForTimeout(800);

    check('a PATCH reached lift_logs', page.patches.length === 1, `patches: ${page.patches.length}`);
    if (page.patches.length) {
      const body = page.patches[0].body;
      check('lift_type moved to Bench', body.lift_type === 'Bench', body.lift_type);
      check('weight corrected to 235', Number(body.weight_lbs) === 235, body.weight_lbs);
      check('reps corrected to 3', Number(body.reps) === 3, body.reps);
    }
    const body = await page.locator('body').innerText();
    check('the row now reads the corrected values', /Bench/.test(body) && /235 lbs.*3/.test(body), body.slice(0, 300));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Deleting a logged set removes it and reaches the network');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByText('Edit Athlete', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByTitle('Edit this entry').first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForTimeout(400);
    // Confirm dialog (app's own custom confirm modal, not a native one).
    await page.getByRole('button', { name: /Delete Entry/i }).click();
    await page.waitForTimeout(800);
    check('a DELETE reached lift_logs', page.deletes.length === 1, `deletes: ${page.deletes.length}`);
    const body = await page.locator('body').innerText();
    check('Recent Lifts no longer lists the deleted set', !/Squat/.test(body) || !/225 lbs/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
