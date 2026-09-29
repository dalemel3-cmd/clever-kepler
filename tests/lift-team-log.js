// Run with:  node tests/lift-team-log.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.1: Lift Tracker "Team Log" - one lift + date for a whole team, weight x reps
// per athlete, one save. Blank rows skipped, bad rows block the save, past dates land
// at noon Central, PR preview against each athlete's current best.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86400000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Ann Adams', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Ben Brown', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Cal Cole', sport: 'Football', team: 'Varsity' },
  { id: uuid(4), name: 'Vb Vee', sport: 'Volleyball', team: 'Varsity' },
];
const lifts = [{ id: uuid(90), athlete_id: uuid(1), athlete_name: 'Ann Adams', lift_type: 'Bench', weight_lbs: 200, reps: 1, created_at: new Date(Date.now() - 20 * DAY).toISOString() }];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const posted = [];
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/lift_logs') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(lifts) });
    if (url.includes('/rest/v1/lift_logs') && m === 'POST') {
      const rows = req.postDataJSON(); posted.push(...rows); page.posts = (page.posts || 0) + 1;
      return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows.map((r, i) => ({ ...r, id: uuid(500 + posted.length + i) }))) });
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Discreet Team Log button opens the sheet');
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2500);
  const btn = page.getByRole('button', { name: /Team log/i });
  check('icon button present', await btn.count() === 1);
  await btn.click(); await page.waitForTimeout(500);
  const dlg = page.getByRole('dialog', { name: /Team Log/i });
  check('dialog opens', await dlg.count() === 1);
  check('defaults to first team (Football: 3 rows)', await dlg.getByTestId('team-lift-row').count() === 3, String(await dlg.getByTestId('team-lift-row').count()));
  check('save disabled with nothing entered', await dlg.getByRole('button', { name: /^Save/ }).isDisabled());

  console.log('\n[B] Entry, PR preview and validation');
  await dlg.getByLabel('Ann Adams weight (lbs)').fill('215');
  check('PR preview vs existing 200', /est\. 215 · PR/.test(await dlg.getByTestId('team-lift-row').nth(0).innerText()));
  await dlg.getByLabel('Ben Brown weight (lbs)').fill('185');
  await dlg.getByLabel('Ben Brown reps').fill('5');
  await dlg.getByLabel('Cal Cole weight (lbs)').fill('9999');
  check('bad row blocks save', await dlg.getByRole('button', { name: /^Save/ }).isDisabled() && /1 row need/.test(await dlg.innerText()));
  await dlg.getByLabel('Cal Cole weight (lbs)').fill('');
  check('2 ready', /2 ready to save/.test(await dlg.innerText()));

  console.log('\n[C] Past date save');
  const past = new Date(Date.now() - 3 * DAY).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await dlg.getByLabel('Date', { exact: true }).fill(past);
  await dlg.getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(1200);
  check('whole sheet saved in ONE request', page.posts === 1, String(page.posts));
  check('2 rows posted (blank Cal skipped)', posted.length === 2, JSON.stringify(posted));
  const ann = posted.find(r => r.athlete_name === 'Ann Adams'), ben = posted.find(r => r.athlete_name === 'Ben Brown');
  check('default reps (1) applied to Ann', ann?.reps === 1 && ann?.weight_lbs === 215 && ann?.lift_type === 'Bench');
  check('per-row reps kept for Ben', ben?.reps === 5 && ben?.weight_lbs === 185);
  check('past date saved at noon Central', ann && new Date(ann.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }) === '12'
    && new Date(ann.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) === past, ann?.created_at);
  check('success message', /Saved 2 Bench sets/.test(await dlg.innerText()));
  check('saved rows cleared', await dlg.getByLabel('Ann Adams weight (lbs)').inputValue() === '');

  console.log('\n[D] Team switch');
  await dlg.getByLabel('Team', { exact: true }).selectOption('Volleyball'); await page.waitForTimeout(300);
  check('switches roster', await dlg.getByTestId('team-lift-row').count() === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape closes', await page.getByRole('dialog', { name: /Team Log/i }).count() === 0);

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
