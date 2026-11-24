// Run with:  node tests/strength-edit.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright. Supabase is stubbed.
//
// v5.16.4: Performance > Strength > an athlete's "Recent sets" can be edited in place (lift type,
// weight, reps). Edit only: no delete here, no date.
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

const athletes = [{ id: uuid(1), name: 'Corbin Miller', sport: 'Football', team: 'Varsity' }];
const set = (n, daysAgo, lift, w, reps) => ({ id: uuid(n), athlete_id: uuid(1), athlete_name: 'Corbin Miller', sport: 'Football', lift_type: lift, weight_lbs: w, reps, source: 'manual', created_at: new Date(Date.now() - daysAgo * DAY - 3600000).toISOString() });
const lifts = [set(100, 20, 'Hang Clean', 305, 3), set(101, 10, 'Hang Clean', 205, 1), set(102, 3, 'Hang Clean', 185, 1)];

const open = async (browser, failPatch = false) => {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.patches = []; page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e).slice(0, 200)));
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, liftTypes: ['Bench', 'Squat', 'Front Squat', 'Hang Clean'] })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/lift_logs')) {
      if (m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(lifts) });
      if (m === 'PATCH') { page.patches.push({ url, body: req.postDataJSON() }); return failPatch ? route.fulfill({ status: 500, headers: h, body: '{"message":"boom"}' }) : route.fulfill({ status: 204, headers: h, body: '' }); }
      if (m === 'DELETE') { page.patches.push({ deleted: true }); return route.fulfill({ status: 204, headers: h, body: '' }); }
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
  await page.getByRole('tablist', { name: 'Performance' }).getByRole('tab', { name: /^Strength$/ }).click(); await page.waitForTimeout(1000);
  await page.getByLabel('Lift').selectOption('Hang Clean'); await page.waitForTimeout(400);
  await page.getByTestId('strength-row').first().click(); await page.waitForTimeout(700);
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Edit a recent set in place');
  const page = await open(browser);
  const pencils = page.getByTitle('Edit this set');
  check('every recent set has a pencil, and there is no delete', await pencils.count() === 3 && !/delete/i.test(await page.locator('main').innerText()));
  await pencils.nth(1).click(); await page.waitForTimeout(300);
  check('the row turns into inputs for lift type, weight and reps (no date field)', await page.getByLabel('Edit weight').inputValue() === '205' && await page.getByLabel('Edit reps').inputValue() === '1' && await page.getByLabel('Edit lift type').inputValue() === 'Hang Clean' && await page.locator('input[type=date]').count() === 0);
  await page.getByLabel('Edit weight').fill('225'); await page.getByLabel('Edit reps').fill('2');
  await page.getByRole('button', { name: /^Save$/ }).click(); await page.waitForTimeout(800);
  check('Save sends only lift type, weight and reps for that set', page.patches.length === 1 && decodeURIComponent(page.patches[0].url).includes(uuid(101)) && JSON.stringify(page.patches[0].body) === JSON.stringify({ lift_type: 'Hang Clean', weight_lbs: 225, reps: 2 }), JSON.stringify(page.patches));
  const t = await page.locator('main').innerText();
  check('the table shows the new numbers and the editor is closed', /225 × 2/.test(t) && !/205 × 1/.test(t) && await page.getByTestId('strength-edit-row').count() === 0);

  console.log('\n[B] Cancel, invalid input, moving a set to another lift');
  await pencils.first().click(); await page.waitForTimeout(200);
  await page.getByLabel('Edit weight').fill('0');
  check('weight 0 cannot be saved', await page.getByRole('button', { name: /^Save$/ }).isDisabled());
  await page.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(200);
  check('Cancel closes the editor and sends nothing', await page.getByTestId('strength-edit-row').count() === 0 && page.patches.length === 1);
  await page.getByTitle('Edit this set').last().click(); await page.waitForTimeout(200);
  await page.getByLabel('Edit lift type').selectOption('Front Squat');
  await page.getByRole('button', { name: /^Save$/ }).click(); await page.waitForTimeout(800);
  check('changing the lift type sends it, and the set leaves the Hang Clean list', page.patches[1]?.body?.lift_type === 'Front Squat' && (await page.getByTitle('Edit this set').count()) === 2, JSON.stringify(page.patches[1]));
  check('no page errors', page.errors.length === 0, page.errors.join(' | '));

  console.log('\n[C] A save that fails puts the old values back and says so');
  const p2 = await open(browser, true);
  const before = await p2.locator('main').innerText();
  await p2.getByTitle('Edit this set').first().click(); await p2.waitForTimeout(200);
  await p2.getByLabel('Edit reps').fill('4');
  await p2.getByRole('button', { name: /^Save$/ }).click(); await p2.waitForTimeout(1200);
  check('the message shows and the editor stays open with what was typed, to retry', /Couldn't save that change/.test(await p2.locator('main').innerText()) && await p2.getByLabel('Edit reps').inputValue() === '4');
  await p2.getByRole('button', { name: 'Cancel' }).click(); await p2.waitForTimeout(300);
  const after = await p2.locator('main').innerText();
  check('after Cancel the table shows the saved numbers, not the unsaved ones', /185 × 1/.test(after) && !/185 × 4/.test(after), after.match(/185 × \d/)?.[0]);
  await p2.getByTitle('Edit this set').first().click(); await p2.waitForTimeout(200);
  await p2.getByLabel('Edit lift type').selectOption('Front Squat');
  await p2.getByRole('button', { name: /^Save$/ }).click(); await p2.waitForTimeout(1200);
  await p2.getByRole('button', { name: 'Cancel' }).click(); await p2.waitForTimeout(300);
  check('a failed lift-type move keeps the set in this list, with the message', (await p2.getByTitle('Edit this set').count()) === 3 && /Couldn't save that change/.test(await p2.locator('main').innerText()));

  console.log('\n[D] Input checks, unchanged save, keyboard');
  const p3 = await open(browser);
  await p3.getByTitle('Edit this set').first().click(); await p3.waitForTimeout(200);
  const save = p3.getByRole('button', { name: /^Save$/ });
  const bad = async (w, r) => { await p3.getByLabel('Edit weight').fill(w); await p3.getByLabel('Edit reps').fill(r); return save.isDisabled(); };
  check('3.5 reps, 3abc, Infinity, 1e3 and 9999 lb are refused', (await bad('185', '3.5')) && (await bad('185', '3abc')) && (await bad('Infinity', '1')) && (await bad('1e3', '1')) && (await bad('9999', '1')));
  check('a decimal weight is accepted', !(await bad('225.5', '2')));
  await p3.getByLabel('Edit weight').fill('185'); await p3.getByLabel('Edit reps').fill('1');
  await save.click(); await p3.waitForTimeout(600);
  check('saving with nothing changed sends nothing and closes', p3.patches.length === 0 && await p3.getByTestId('strength-edit-row').count() === 0);
  await p3.getByTitle('Edit this set').first().click(); await p3.waitForTimeout(200);
  await p3.getByLabel('Edit reps').fill('2'); await p3.getByLabel('Edit reps').press('Enter'); await p3.waitForTimeout(700);
  check('Enter saves', p3.patches.length === 1 && p3.patches[0].body.reps === 2);
  await p3.getByTitle('Edit this set').first().click(); await p3.waitForTimeout(200);
  await p3.getByLabel('Edit reps').press('Escape'); await p3.waitForTimeout(200);
  check('Escape cancels', await p3.getByTestId('strength-edit-row').count() === 0 && p3.patches.length === 1);

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
