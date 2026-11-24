// Run with:  node tests/bulk-edit-who.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v5.16.3: Bulk Edit Lift Type shows who will change. Team chips, a ticked list with weight x reps,
// per-athlete unticking, a hint for athletes who also log a similar lift, and Undo.
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

const names = ['Ann Aker', 'Bo Boyd', 'Cy Cole', 'Dan Doe'];
const athletes = names.map((name, i) => ({ id: uuid(i + 1), name, sport: i === 3 ? 'WSOC' : 'Football', team: 'Varsity', grade: '11th', position: 'OL' }));
const L = (n, i, type, w, r, at) => ({ id: uuid(n), athlete_id: uuid(i + 1), athlete_name: names[i], sport: athletes[i].sport, lift_type: type, weight_lbs: w, reps: r, source: 'manual', created_at: at });
// Three football athletes and one WSOC athlete all logged "Squat" today; Cy also has Belt Squat history.
const liftLogs = [
  L(50, 0, 'Squat', 145, 3, ago(0)), L(51, 1, 'Squat', 205, 3, ago(0)), L(52, 2, 'Squat', 175, 3, ago(0)), L(53, 3, 'Squat', 95, 5, ago(0)),
  L(54, 2, 'Belt Squat', 300, 5, ago(10)), L(55, 0, 'Squat', 155, 3, ago(0)),
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors; page.patches = [];
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), {
    enableLiftTracker: true,
    liftTypes: ['Bench', 'Squat', 'Front Squat', 'Belt Squat', 'Deadlift'],
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
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await newPage(browser);
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
  await page.getByLabel('Bulk edit lift type').click(); await page.waitForTimeout(400);
  const dlg = page.locator('.modal-overlay').last();
  await dlg.getByRole('button', { name: 'Squat', exact: true }).first().click(); await page.waitForTimeout(300);

  console.log('\n[A] The panel shows who will change');
  check('team chips list both teams that logged it today', await page.getByTestId('bulk-sports').innerText().then(t => /Football/.test(t) && /WSOC/.test(t)));
  check('one row per athlete, all ticked (Ann has two sets)', await page.getByTestId('bulk-row').count() === 4 && /4 of 4 athletes selected \(5 sets\)/.test(await page.getByTestId('bulk-count').innerText()));
  const rows = await page.getByTestId('bulk-row').allInnerTexts();
  check('each row shows name, team and weight x reps', rows.some(r => /Ann Aker/.test(r) && /Football/.test(r) && /2 sets: 145×3, 155×3/.test(r)), rows[0]);
  check('an athlete who also logs Belt Squat gets a hint', rows.some(r => /Cy Cole/.test(r) && /Also has Belt Squat sets/.test(r)) && !rows.some(r => /Ann Aker/.test(r) && /Also has/.test(r)));

  console.log('\n[B] Team filter and unticking');
  await page.getByTestId('bulk-sports').getByRole('button', { name: 'Football', exact: true }).click(); await page.waitForTimeout(200);
  check('Football only: three rows, no WSOC', await page.getByTestId('bulk-row').count() === 3 && !/Dan Doe/.test(await page.getByTestId('bulk-who').innerText()));
  await dlg.getByRole('button', { name: 'Front Squat', exact: true }).last().click();
  await page.getByTestId('bulk-row').filter({ hasText: 'Cy Cole' }).locator('input').uncheck();
  check('unticking one updates the count and the button', /2 of 3 athletes selected/.test(await page.getByTestId('bulk-count').innerText()) && /Reassign 3 Sets/i.test(await dlg.innerText()));

  console.log('\n[C] Reassign changes only the ticked sets, and Undo puts them back');
  await dlg.getByRole('button', { name: /Reassign 3 Sets/i }).click(); await page.waitForTimeout(300);
  check('the confirm names who is left out', /Left as Squat: Cy Cole/.test(await page.locator('body').innerText()));
  await page.getByRole('button', { name: /^Reassign$/ }).click(); await page.waitForTimeout(700);
  const ids = (p) => decodeURIComponent(p.url).match(/[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}/g) || [];
  const changed = page.patches[0];
  check('one update sends Front Squat for Ann\'s two sets and Bo\'s, not Cy\'s', page.patches.length === 1 && changed.body.lift_type === 'Front Squat' && ids(changed).sort().join() === [uuid(50), uuid(51), uuid(55)].sort().join(), JSON.stringify(changed));
  check('the panel says what changed and offers Undo', /Changed 3 sets to "Front Squat"/.test(await page.getByTestId('bulk-result').innerText()) && await page.getByTestId('bulk-undo').isVisible());
  check('Cy stays unticked after the change (not re-ticked)', /0 of 1 athletes selected/.test(await page.getByTestId('bulk-count').innerText()));
  await page.getByTestId('bulk-undo').click(); await page.waitForTimeout(700);
  const undo = page.patches[1];
  check('Undo sends Squat back for the same three sets', undo?.body.lift_type === 'Squat' && ids(undo).sort().join() === [uuid(50), uuid(51), uuid(55)].sort().join() && /Put 3 sets back to "Squat"/.test(await page.getByTestId('bulk-result').innerText()), JSON.stringify(undo));
  check('no page errors', page.errors.length === 0, page.errors.join(' | '));

  console.log('\n[D] A save that fails says so, and Undo stays available');
  {
    const p2 = await newPage(browser);
    await p2.route(SUPA, async (route) => {
      const req = route.request();
      if (req.method() === 'PATCH' && req.url().includes('lift_logs')) return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"message":"boom"}' });
      return route.fallback();
    });
    await p2.goto(`${APP}/#lifts`); await p2.waitForTimeout(1800);
    await p2.getByLabel('Bulk edit lift type').click(); await p2.waitForTimeout(400);
    const d2 = p2.locator('.modal-overlay').last();
    await d2.getByRole('button', { name: 'Squat', exact: true }).first().click();
    await d2.getByRole('button', { name: 'Front Squat', exact: true }).last().click();
    await d2.getByRole('button', { name: /Reassign 5 Sets/i }).click(); await p2.waitForTimeout(300);
    await p2.getByRole('button', { name: /^Reassign$/ }).click(); await p2.waitForTimeout(900);
    const t = await p2.getByTestId('bulk-result').innerText();
    check('the failure is not reported as "nothing changed"; Undo is offered', /Couldn't save to the database/.test(t) && !/Nothing was changed/.test(t) && await p2.getByTestId('bulk-undo').isVisible(), t);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
