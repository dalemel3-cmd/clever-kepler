// Run with:  node tests/offline-queue.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.3: lifts and jump/sprint results saved with no connection are queued on the
// device and upload later - once, with the id they were created with - instead of
// looking saved and never reaching the cloud. Real rejections are not queued.
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
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let mode = 'offline'; // 'offline' | 'online' | 'reject'
  const server = new Map(); // id -> row, what the "cloud" holds
  const posts = [];
  await stubAuth(page);
  await page.addInitScript(() => {
    localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, enableSpeedPower: true }));
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      // A pre-v5.3.3 set that failed to upload and was stranded in the cache.
      localStorage.setItem('shiloh_lift_logs', JSON.stringify([{ id: 'opt_1700000000000', athlete_id: '00000002-0000-4000-8000-000000000002', athlete_name: 'Ben Brown', sport: 'Football', lift_type: 'Squat', weight_lbs: 300, reps: 3, source: 'manual', created_at: '2026-09-20T15:00:00.000Z' }]));
    }
  });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/lift_logs')) {
      if (mode === 'offline') return route.abort('internetdisconnected');
      if (m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify([...server.values()]) });
      if (m === 'POST') {
        if (mode === 'reject') return route.fulfill({ status: 400, headers: h, body: JSON.stringify({ code: '23514', message: 'violates check constraint' }) });
        const rows = req.postDataJSON(); posts.push({ url, prefer: req.headers()['prefer'] || '', rows });
        const inserted = rows.filter(r => !server.has(r.id)); inserted.forEach(r => server.set(r.id, r));
        return route.fulfill({ status: 201, headers: h, body: JSON.stringify(inserted) });
      }
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  const openTeamLog = async () => {
    await page.getByRole('button', { name: /Team log/i }).click(); await page.waitForTimeout(400);
    return page.getByRole('dialog', { name: /Team Log/i });
  };
  const pill = () => page.getByRole('button', { name: /waiting to upload/i });

  console.log('\n[A] No connection: sets are kept and queued, not lost');
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2500);
  let dlg = await openTeamLog();
  await dlg.getByLabel('Ann Adams weight (lbs)').fill('225');
  await dlg.getByLabel('Ben Brown weight (lbs)').fill('205');
  await dlg.getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(800);
  check('honest "no connection" message', /No connection\. 2 Bench sets are saved on this device/.test(await dlg.innerText()), (await dlg.innerText()).slice(-200));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const q1 = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_pending_lift_logs') || '[]'));
  check('2 rows in the device queue with real UUIDs', q1.length === 2 && q1.every(r => UUID_RE.test(r.id)), JSON.stringify(q1.map(r => r.id)));
  check('header shows "2 waiting to upload"', /2 waiting to upload/.test(await pill().innerText().catch(() => '')));

  console.log('\n[B] Survives a reload while still offline');
  await page.reload(); await page.waitForTimeout(2500);
  check('still queued after reload', (await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_pending_lift_logs') || '[]'))).length === 2);
  check('pill still shown', await pill().count() === 1);

  console.log('\n[C] Connection back: uploads once, with the same ids');
  mode = 'online';
  await pill().click(); await page.waitForTimeout(1500);
  const sentIds = posts.flatMap(p => p.rows.map(r => r.id));
  check('queued rows uploaded with their original ids', q1.every(r => sentIds.includes(r.id)), JSON.stringify(sentIds));
  check('sent as idempotent upsert (on_conflict=id, ignore duplicates)', posts.every(p => /on_conflict=id/.test(p.url) && /ignore-duplicates/.test(p.prefer)), JSON.stringify(posts.map(p => [p.url.split('?')[1], p.prefer])));
  check('cloud has each set exactly once', [...server.values()].filter(r => r.lift_type === 'Bench').length === 2);
  check('queue emptied, pill gone', (await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_pending_lift_logs') || '[]'))).length === 0 && await pill().count() === 0);
  check('no "pending" field leaked into the database payload', posts.every(p => p.rows.every(r => !('pending' in r))));

  console.log('\n[D] Stranded pre-v5.3.3 set is rescued');
  await page.reload(); await page.waitForTimeout(3000);
  const squat = [...server.values()].find(r => r.lift_type === 'Squat');
  check('old opt_ Squat 300x3 uploaded with a real UUID', !!squat && UUID_RE.test(squat.id) && squat.weight_lbs === 300, JSON.stringify(squat));
  check('no opt_ rows left in the cache', !(await page.evaluate(() => localStorage.getItem('shiloh_lift_logs'))).includes('opt_'));
  const before = server.size;
  await page.reload(); await page.waitForTimeout(2500);
  check('a second reload uploads nothing new', server.size === before);

  console.log('\n[E] A real rejection is not queued');
  mode = 'reject';
  dlg = await openTeamLog();
  await dlg.getByLabel('Ann Adams weight (lbs)').fill('135');
  await dlg.getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(800);
  check('says it was refused, not "saved"', /refused/.test(await dlg.innerText()));
  check('nothing queued for retry', (await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_pending_lift_logs') || '[]'))).length === 0);

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
