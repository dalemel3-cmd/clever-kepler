// Run with:  node tests/stress.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
/* HPD App stress test — intercepts ALL Supabase traffic (no prod writes). */
import { chromium } from 'playwright';

// CHROMIUM_PATH lets CI point at a preinstalled browser; otherwise Playwright's own.
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';

// ---------- mock data ----------
const SPORTS = ['Football', 'Basketball', 'Volleyball', 'Wrestling', 'Track & Field', 'Softball'];
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const N_ATHLETES = 150;
const athletes = Array.from({ length: N_ATHLETES }).map((_, i) => ({
  id: uuid(i + 1),
  name: `Athlete${i + 1} Test${i + 1}`,
  sport: SPORTS[i % SPORTS.length],
  team: i % 2 ? 'Varsity' : 'JV',
  grade: `${9 + (i % 4)}th`,
  position: 'WR',
  created_at: new Date(Date.now() - 90 * 864e5).toISOString(),
}));
// (null-name dirty-data probe runs separately at the end — see section 11)
const NULL_NAME_PROBE = process.env.NULL_NAME === '1';
if (NULL_NAME_PROBE) athletes.push({ id: uuid(9999), name: null, sport: 'Football', team: '', grade: '', position: '' });

// ~3000 weigh-in logs over last 25 days
let logs = [];
let logId = 0;
for (let d = 25; d >= 1; d--) {
  for (let i = 0; i < N_ATHLETES; i += 2) {   // every other athlete each day
    const a = athletes[i];
    const t = new Date(Date.now() - d * 864e5);
    t.setHours(7, (i * 7) % 60, 0, 0);
    logs.push({
      id: uuid(100000 + ++logId),
      athlete_id: a.id,
      athlete_name: a.name,
      sport: a.sport,
      weight_lbs: 180 + (i % 60) + Math.sin(d) * 3,
      sleep_hrs: 5 + ((i + d) % 5),
      created_at: t.toISOString(),
      session_type: d % 5 === 0 ? 'post_practice' : null,
      is_baseline: d === 25,
    });
  }
}
// sleep-only log as the LATEST record for athlete 1 (leaderboard corruption probe)
logs.push({
  id: uuid(999001), athlete_id: athletes[0].id, athlete_name: athletes[0].name,
  sport: athletes[0].sport, weight_lbs: 0, sleep_hrs: 8,
  created_at: new Date(Date.now() - 3600e3).toISOString(), session_type: null, is_baseline: false,
});
console.log(`mock: ${athletes.length} athletes, ${logs.length} logs`);

const inserted = [];   // captured POST bodies
let athleteInserts = [];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));

  let supaCalls = 0;
  await page.route(SUPA, async (route) => {
    supaCalls++;
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (url.includes('/rest/v1/athletes')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
      if (method === 'POST') { const b = req.postDataJSON(); athleteInserts.push(b); const arr = Array.isArray(b) ? b : [b]; const out = arr.map((x, i) => ({ ...x, id: uuid(50000 + athleteInserts.length * 10 + i) })); return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify(out) }); }
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    }
    if (url.includes('/rest/v1/weigh_ins')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
      if (method === 'POST') { const b = req.postDataJSON(); const arr = Array.isArray(b) ? b : [b]; arr.forEach((x) => inserted.push(x)); const out = arr.map((x, i) => ({ ...x, id: uuid(700000 + inserted.length * 10 + i) })); return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify(out) }); }
      return route.fulfill({ status: 204, headers: hdrs, body: '' });
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  const t0 = Date.now();
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  console.log(`\n[LOAD] first paint+settle in ${Date.now() - t0}ms, supabase calls so far: ${supaCalls}`);

  const checkAlive = async (label) => {
    const dead = await page.getByText('Something went wrong.').count();
    if (dead) {
      const detail = await page.locator('details').innerText().catch(() => '(no detail)');
      console.log(`[CRASH] app hit ErrorBoundary at ${label}: ${detail.split('\n').slice(0, 3).join(' | ').slice(0, 300)}`);
      return false;
    }
    return true;
  };

  if (NULL_NAME_PROBE) {
    // Only run the dirty-data crash probe, then exit.
    for (const s of ['dashboard', 'entry', 'profiles', 'roster']) {
      await page.goto(`${APP}/#${s}`); await page.waitForTimeout(1000);
      const alive = await checkAlive(`#${s} (null-name athlete in roster)`);
      console.log(`[NULL-NAME] #${s}: ${alive ? 'survived' : 'CRASHED (white error screen)'}`);
      if (!alive) break;
    }
    await browser.close();
    return;
  }

  // ---------- 1. visit every screen ----------
  for (const s of ['dashboard', 'entry', 'groups', 'profiles', 'alerts', 'reports', 'settings']) {
    const t = Date.now();
    await page.goto(`${APP}/#${s}`);
    await page.waitForTimeout(1200);
    console.log(`[NAV] #${s} settled in ~${Date.now() - t}ms  (pageErrors=${pageErrors.length})`);
  }

  // alerts tabs
  await page.goto(`${APP}/#alerts`); await page.waitForTimeout(500);
  for (const tab of ['WEEKLY', 'MONTHLY', 'DAILY']) {
    const b = page.getByRole('button', { name: tab, exact: true }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(600); }
  }
  console.log(`[ALERTS] tabs ok (pageErrors=${pageErrors.length})`);

  // ---------- 2. render-time probe on dashboard with big data ----------
  await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(300);
  const renderProbe = await page.evaluate(() => new Promise((res) => {
    const t = performance.now();
    let frames = 0, long = 0;
    const obs = new PerformanceObserver((l) => { long += l.getEntries().length; });
    try { obs.observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const step = () => { frames++; if (performance.now() - t < 6000) requestAnimationFrame(step); else res({ frames, longTasks: long, fps: (frames / 6).toFixed(1) }); };
    requestAnimationFrame(step);
  }));
  console.log(`[PERF] dashboard 6s idle: ~${renderProbe.fps} fps, longTasks=${renderProbe.longTasks}`);

  // ---------- 3. kiosk entry: rapid numpad + save ----------
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(800);
  await page.getByPlaceholder('Search athletes by name...').fill('Athlete2 ');
  await page.waitForTimeout(400);
  const card = page.locator('text=Athlete2 Test2').first();
  await card.click(); await page.waitForTimeout(600);

  // weight input is prefilled with last weight — clear then rapid-type via numpad
  const weightBox = page.locator('input[aria-label="Body weight (lbs)"]');
  await weightBox.fill('');
  for (const k of ['2', '0', '5', '.', '3']) await page.getByRole('button', { name: k, exact: true }).first().click({ delay: 20 });
  const wVal = await weightBox.inputValue();
  console.log(`[ENTRY] numpad typed -> weight="${wVal}"`);
  const preInserts = inserted.length;
  await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().click();
  await page.waitForTimeout(1500);
  console.log(`[ENTRY] save -> weigh_in POSTs: ${inserted.length - preInserts}, payload=${JSON.stringify(inserted[inserted.length - 1] || null)}`);

  // ---------- 4. double-click save race ----------
  await page.getByPlaceholder('Search athletes by name...').fill('Athlete4 ');
  await page.waitForTimeout(400);
  await page.locator('text=Athlete4 Test4').first().click(); await page.waitForTimeout(500);
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('222.2');
  const pre2 = inserted.length;
  const saveBtn = page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first();
  await saveBtn.evaluate((el) => { el.click(); el.click(); }); // 2 clicks in one JS task = before re-render
  await page.waitForTimeout(1800);
  console.log(`[RACE] double-click save -> ${inserted.length - pre2} POSTs (1 expected)`);

  // ---------- 5. weird values ----------
  const weird = async (label, val) => {
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(400);
    await page.getByPlaceholder('Search athletes by name...').fill('Athlete6 ');
    await page.waitForTimeout(350);
    await page.locator('text=Athlete6 Test6').first().click(); await page.waitForTimeout(400);
    await page.locator('input[aria-label="Body weight (lbs)"]').fill(val);
    const pre = inserted.length;
    const btn = page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first();
    await btn.click().catch(() => {});
    await page.waitForTimeout(900);
    // dismiss possible overwrite confirm
    const conf = page.getByRole('button', { name: /Override Log/ });
    if (await conf.count()) { await conf.click(); await page.waitForTimeout(900); }
    const posted = inserted.slice(pre).map((p) => p.weight_lbs);
    console.log(`[WEIRD] weight "${label}" -> POSTs: ${JSON.stringify(posted)}`);
    await page.keyboard.press('Escape').catch(() => {});
    const x = page.locator('button[title="Close modal"]');
    if (await x.count()) await x.first().click().catch(() => {});
  };
  await weird('0', '0');
  await weird('999999999', '999999999');
  await weird('1.2.3', '1.2.3');

  // ---------- 6. manual entry modal: cleared date crash probe ----------
  await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Post-Practice \/ Manual Log/ }).click();
  await page.waitForTimeout(500);
  await page.locator('input[type="date"]').fill('');           // clear the date
  await page.locator('input[type="number"]').fill('201.5');
  const preErr = pageErrors.length;
  await page.getByRole('button', { name: /SAVE MANUAL RECORD/ }).click().catch(() => {});
  await page.waitForTimeout(700);
  console.log(`[MANUAL] cleared-date save -> new pageErrors: ${pageErrors.length - preErr} ${pageErrors.slice(preErr).join(' | ')}`);
  // negative weight
  await page.locator('input[type="date"]').fill('2026-08-06').catch(() => {});
  await page.locator('input[type="number"]').fill('-50');
  const preNeg = inserted.length;
  await page.getByRole('button', { name: /SAVE MANUAL RECORD/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  console.log(`[MANUAL] weight -50 accepted? POSTs: ${JSON.stringify(inserted.slice(preNeg).map((p) => p.weight_lbs))}`);
  const closeX = page.locator('div').filter({ hasText: 'COACH MANUAL LOG STUDIO' }).getByRole('button').first();
  await closeX.click().catch(() => {});

  // ---------- 7. offline queue behavior ----------
  await ctx.setOffline(true);
  await page.goto(`${APP}/#entry`).catch(() => {});
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Search athletes by name...').fill('Athlete8 ');
  await page.waitForTimeout(350);
  await page.locator('text=Athlete8 Test8').first().click(); await page.waitForTimeout(400);
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('215.0');
  await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
  console.log(`[OFFLINE] queued after offline save: ${queued}`);
  await ctx.setOffline(false);
  const preSync = inserted.length;
  await page.waitForTimeout(7000); // let 5s heartbeat sync
  const queuedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
  console.log(`[OFFLINE] back online -> queue=${queuedAfter}, synced POSTs=${inserted.length - preSync}`);

  // ---------- 8. failing-server queue-drop probe ----------
  // queue one record, then make weigh_ins POST return 500 and watch the queue
  await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
    q.push({ action: 'insert', record: { athlete_id: '00000001-0000-4000-8000-000000000001', athlete_name: 'Athlete1 Test1', sport: 'Football', weight_lbs: 199.9, sleep_hrs: 7, created_at: new Date().toISOString() } });
    localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify(q));
  });
  await page.unroute(SUPA);
  await page.route(SUPA, async (route) => {
    const req = route.request();
    const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (url.includes('/rest/v1/weigh_ins') && (method === 'POST' || method === 'PATCH'))
      return route.fulfill({ status: 500, headers: hdrs, body: JSON.stringify({ message: 'simulated server error' }) });
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  const qBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
  await page.waitForTimeout(7000); // heartbeat attempts sync against 500s
  const qAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
  const vault = await page.evaluate(() => (JSON.parse(localStorage.getItem('shiloh_permanent_vault') || '[]')).filter(v => v.synced === false).length);
  console.log(`[QUEUE-DROP] queue before=${qBefore} after-500s=${qAfter} (unsynced-in-vault=${vault}) ${qAfter < qBefore ? '→ RECORDS DROPPED FROM QUEUE DESPITE SERVER 500s ❗' : ''}`);

  // ---------- 9. rapid screen-switch soak ----------
  const preSoakErr = pageErrors.length;
  const soakT = Date.now();
  for (let i = 0; i < 30; i++) {
    for (const s of ['dashboard', 'entry', 'reports', 'profiles', 'alerts']) {
      await page.goto(`${APP}/#${s}`);
      await page.waitForTimeout(60);
    }
  }
  const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
  console.log(`[SOAK] 150 screen switches in ${((Date.now() - soakT) / 1000).toFixed(1)}s, newErrors=${pageErrors.length - preSoakErr}, heap=${mem}MB`);

  // ---------- 10. reports with full table open ----------
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(1500);
  const show = page.getByText(/SHOW TABLE/);
  if (await show.count()) { await show.click(); await page.waitForTimeout(1500); }
  const rows = await page.locator('table tbody tr').count();
  console.log(`[REPORTS] table rows rendered in DOM: ${rows}`);

  console.log('\n===== ERROR SUMMARY =====');
  console.log('pageErrors:', pageErrors.length);
  pageErrors.slice(0, 12).forEach((e) => console.log('  PE:', e));
  const uniqCE = [...new Set(consoleErrors)];
  console.log('console errors (unique):', uniqCE.length);
  uniqCE.slice(0, 12).forEach((e) => console.log('  CE:', e));
  console.log('total mock supabase calls:', supaCalls);
  console.log('total weigh_in inserts captured:', inserted.length);

  await browser.close();
})().catch((e) => { console.error('HARNESS FAILURE:', e); process.exit(1); });
