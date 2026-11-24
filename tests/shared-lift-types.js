// Run with:  node tests/shared-lift-types.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright. Supabase is stubbed.
//
// v5.16.6: one lift list for every device. Each device copies the database's list into its own
// settings; Save All Settings sends a changed list back; an unreachable database changes nothing.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};
const CLOUD = ['Bench', 'Front Squat', 'Squat', 'Belt Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];

// opts: cloud (list | 'down'), local (settings.liftTypes | undefined), seen (this device's remembered cloud list)
const newPage = async (browser, { cloud = CLOUD, local, seen } = {}) => { // cloud: a list, 'down' (500) or 'empty' (no row)
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.upserts = []; page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e).slice(0, 200)));
  await stubAuth(page);
  await page.addInitScript(({ local, seen }) => {
    if (!localStorage.getItem('__init')) {
      localStorage.setItem('__init', '1');
      localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, ...(local ? { liftTypes: local } : {}) }));
      if (seen) localStorage.setItem('hpd_shared_lift_types', JSON.stringify(seen));
    }
  }, { local, seen });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/shared_settings')) {
      if (m === 'GET' && cloud === 'empty') return route.fulfill({ status: 200, headers: h, body: '[]' });
      if (m === 'GET') return cloud === 'down' ? route.fulfill({ status: 500, headers: h, body: '{"message":"boom"}' }) : route.fulfill({ status: 200, headers: h, body: JSON.stringify({ value: cloud }) });
      page.upserts.push(req.postDataJSON()); return route.fulfill({ status: 201, headers: h, body: '' });
    }
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: '[]' });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  return page;
};
const localList = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings')).liftTypes);

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] A device picks up the shared list');
  const a = await newPage(browser); // never set up: built-in list, no Front Squat
  await a.goto(`${APP}/#settings`); await a.waitForTimeout(2200);
  check('an iPad with the old built-in list now has Front Squat', (await localList(a)).includes('Front Squat') && (await localList(a)).join() === CLOUD.join(), String(await localList(a)));
  const b = await newPage(browser, { local: ['Bench', 'Squat'] }); // its own short list
  await b.goto(`${APP}/#settings`); await b.waitForTimeout(2200);
  check('a device with its own short list is brought to the shared list', (await localList(b)).join() === CLOUD.join(), String(await localList(b)));

  console.log('\n[B] A device is not overwritten while the cloud has not changed');
  const c = await newPage(browser, { local: ['Bench', 'Squat', 'Trap Bar Deadlift'], seen: CLOUD });
  await c.goto(`${APP}/#settings`); await c.waitForTimeout(2200);
  check('its unsaved local edit is left alone', (await localList(c)).join() === 'Bench,Squat,Trap Bar Deadlift', String(await localList(c)));
  const c2 = await newPage(browser, { cloud: [...CLOUD, 'Trap Bar Deadlift'], local: CLOUD, seen: CLOUD });
  await c2.goto(`${APP}/#settings`); await c2.waitForTimeout(2200);
  check('a list changed elsewhere is picked up', (await localList(c2)).includes('Trap Bar Deadlift'), String(await localList(c2)));

  console.log('\n[C] Save All Settings sends a changed list to the database');
  const d = await newPage(browser, { local: CLOUD, seen: CLOUD });
  await d.goto(`${APP}/#settings`); await d.waitForTimeout(2000);
  await d.getByLabel('Configuration section').selectOption({ label: 'LIFT TRACKER' }); await d.waitForTimeout(300);
  const field = d.locator('#setting-liftTypes');
  await field.click(); await field.press('End'); await field.pressSequentially(', Trap Bar Deadlift', { delay: 10 });
  await field.blur(); await d.waitForTimeout(200);
  await d.getByRole('button', { name: /Save All Settings/i }).first().click(); await d.waitForTimeout(900);
  check('one upsert with the cleaned list under key lift_types', d.upserts.length === 1 && d.upserts[0].key === 'lift_types' && d.upserts[0].value.join() === [...CLOUD, 'Trap Bar Deadlift'].join(), JSON.stringify(d.upserts));
  const e = await newPage(browser, { cloud: 'down', local: CLOUD });
  await e.goto(`${APP}/#settings`); await e.waitForTimeout(1800);
  await e.getByRole('button', { name: /Save All Settings/i }).first().click(); await e.waitForTimeout(600);
  check('a device that has never seen the cloud list does not overwrite it', e.upserts.length === 0);

  console.log('\n[C2] Restore Defaults and an emptied field never replace the shared list');
  const g = await newPage(browser, { local: CLOUD, seen: CLOUD });
  await g.goto(`${APP}/#settings`); await g.waitForTimeout(2000);
  await g.getByLabel('Configuration section').selectOption({ label: 'LIFT TRACKER' }); await g.waitForTimeout(300);
  await g.locator('#setting-liftTypes').fill(''); await g.locator('#setting-liftTypes').blur();
  await g.getByRole('button', { name: /Save All Settings/i }).first().click(); await g.waitForTimeout(800);
  check('an emptied list is not sent to the database', g.upserts.length === 0);
  const g2 = await newPage(browser, { local: CLOUD, seen: CLOUD });
  await g2.goto(`${APP}/#settings`); await g2.waitForTimeout(2000);
  const reset = g2.getByRole('button', { name: /Restore Defaults/i }).first();
  if (await reset.count()) { await reset.click(); await g2.waitForTimeout(300); await g2.getByRole('button', { name: /^Restore Defaults$/ }).last().click().catch(() => {}); await g2.waitForTimeout(500); }
  check('Restore Defaults keeps the shared lift list on the device', (await localList(g2)).join() === CLOUD.join(), String(await localList(g2)));

  console.log('\n[D] Database unreachable, or no row yet');
  const f = await newPage(browser, { cloud: 'down', local: ['Bench', 'Squat'] });
  await f.goto(`${APP}/#settings`); await f.waitForTimeout(2000);
  check('the device keeps its own list', (await localList(f)).join() === 'Bench,Squat');
  const h2 = await newPage(browser, { cloud: 'empty', local: ['Bench', 'Squat'] });
  await h2.goto(`${APP}/#settings`); await h2.waitForTimeout(2000);
  check('no row in the database: the device keeps its own list', (await localList(h2)).join() === 'Bench,Squat');
  check('no page errors', [a, b, c, c2, d, e, f, g, g2, h2].every(p => p.errors.length === 0), [a, b, c, c2, d, e, f, g, g2, h2].flatMap(p => p.errors).join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
