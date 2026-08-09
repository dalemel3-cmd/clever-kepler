// Run with:  node tests/offline-recovery.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
/* Recovery probe: queued record survives 500s, then auto-uploads when server recovers. */
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

// CHROMIUM_PATH lets CI point at a preinstalled browser; otherwise Playwright's own.
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const athletes = [{ id: uuid(1), name: 'Rec Overy', sport: 'Football', team: 'V', grade: '11th', position: 'QB' }];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await stubAuth(page);
  let failing = true;
  const posts = [];
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
      if (method === 'POST') {
        if (failing) return route.fulfill({ status: 500, headers: hdrs, body: JSON.stringify({ message: 'down' }) });
        const b = req.postDataJSON(); (Array.isArray(b) ? b : [b]).forEach((x) => posts.push(x));
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ ...(Array.isArray(b) ? b[0] : b), id: uuid(900) }]) });
      }
      return route.fulfill({ status: 204, headers: hdrs, body: '' });
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
  await page.locator('text=Rec Overy').first().click(); await page.waitForTimeout(500);
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('210.0');
  await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().click().catch(() => {});
  await page.waitForTimeout(8000); // server down: save fails, heartbeat retries fail
  const qDown = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
  console.log(`[RECOVERY] queue while server down (post-save +8s): ${qDown} (1 expected)`);
  failing = false; // server comes back
  await page.waitForTimeout(8000); // next heartbeats should drain the queue
  const qUp = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
  console.log(`[RECOVERY] queue after server recovery: ${qUp} (0 expected), uploaded=${JSON.stringify(posts.map((p) => p.weight_lbs))}`);
  const badge = await page.getByText(/UNSYNCED/).count();
  console.log(`[RECOVERY] unsynced badge visible after drain: ${badge} (0 expected)`);
  await browser.close();
})().catch((e) => { console.error('PROBE FAILURE:', e); process.exit(1); });
