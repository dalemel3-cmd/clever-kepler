// Run with:  node tests/sync-and-ux.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
/* v4.3.0 probes: adaptive sync egress, focus refresh, honest status, no mock athletes,
   ghost weight placeholder, typed WIPE confirm, toast-instead-of-alert. */
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

// CHROMIUM_PATH lets CI point at a preinstalled browser; otherwise Playwright's own.
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const athletes = [
  { id: uuid(1), name: 'Probe Athlete', sport: 'Football', team: 'V', grade: '11th', position: 'QB' },
];
const logs = [
  { id: uuid(101), athlete_id: uuid(1), athlete_name: 'Probe Athlete', sport: 'Football', weight_lbs: 199, sleep_hrs: 8, created_at: new Date(Date.now() - 864e5).toISOString(), session_type: null, is_baseline: false },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
  await stubAuth(page);
    await stubAuth(page);
    page.counters = { fullFetch: 0, probe: 0, del: 0 };
    await page.route(SUPA, async (route) => {
      const req = route.request(); const url = req.url(); const method = req.method();
      const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'content-range': `0-0/${logs.length}`, 'access-control-expose-headers': 'Content-Range' };
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' } });
      if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
      if (opts.killRest && url.includes('/rest/')) return route.abort('connectionfailed');
      if (url.includes('/rest/v1/athletes')) {
        if (opts.killAthletes) return route.abort('connectionfailed');
        if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
      }
      if (url.includes('/rest/v1/weigh_ins')) {
        if (method === 'GET') {
          if (url.includes('select=*')) { page.counters.fullFetch++; return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) }); }
          page.counters.probe++;
          return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ created_at: logs[0].created_at }]) });
        }
        if (method === 'DELETE') { page.counters.del++; return route.fulfill({ status: 204, headers: hdrs, body: '' }); }
        if (method === 'POST') return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ ...logs[0], id: uuid(900) }]) });
        return route.fulfill({ status: 204, headers: hdrs, body: '' });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    });
    return { ctx, page };
  };

  // ---------- 1+2. Egress: probes not full fetches; focus triggers full fetch ----------
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2000);
    const initialFull = page.counters.fullFetch;
    page.counters.fullFetch = 0; page.counters.probe = 0;
    await page.waitForTimeout(45000); // realtime is down -> 10s probe cadence w/ backoff
    console.log(`[EGRESS] 45s idle (WS blocked): fullFetches=${page.counters.fullFetch} probes=${page.counters.probe} (initial load used ${initialFull}) ${page.counters.fullFetch <= 1 ? '✓ (was ~9 full pulls before)' : '❗'}`);
    const beforeFocus = page.counters.fullFetch;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(1500);
    console.log(`[FOCUS] visibilitychange -> +${page.counters.fullFetch - beforeFocus} full fetch (1 expected)`);
    await ctx.close();
  }

  // ---------- 3. No mock athletes when offline with empty cache ----------
  {
    const { ctx, page } = await newPage({ killRest: true });
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2500);
    const mock = await page.getByText('Jaylen Carter').count();
    const bodyText = await page.locator('body').innerText();
    const emptyOk = bodyText.includes('0') || bodyText.includes('No sports active');
    console.log(`[MOCK] offline+empty cache: 'Jaylen Carter' visible=${mock} (0 expected), empty-roster state=${emptyOk}`);
    // ---------- 4a. Honest status: server unreachable but WiFi "online" ----------
    await page.waitForTimeout(6000); // let a status tick run
    const header = await page.locator('body').innerText();
    const claimsLive = header.includes('CLOUD LIVE') || header.includes('CLOUD SYNCED & LIVE');
    const reconnecting = header.includes('RECONNECTING');
    console.log(`[STATUS] REST dead: claims live=${claimsLive} (false expected), shows reconnecting=${reconnecting} (true expected)`);
    await ctx.close();
  }

  // ---------- 4b. Honest status: healthy server shows live ----------
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(6500);
    const header = await page.locator('body').innerText();
    console.log(`[STATUS] REST healthy: shows CLOUD LIVE=${header.includes('CLOUD LIVE')} (true expected)`);
    await ctx.close();
  }

  // ---------- 5. Ghost placeholder, empty value ----------
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
    await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(600);
    const box = page.locator('input[aria-label="Body weight (lbs)"]');
    const val = await box.inputValue();
    const ph = await box.getAttribute('placeholder');
    const saveDisabled = await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().isDisabled();
    console.log(`[GHOST] value="${val}" (empty expected), placeholder="${ph}" ("199" expected), save disabled=${saveDisabled} (true expected)`);
    await ctx.close();
  }

  // ---------- 6. Typed WIPE confirmation ----------
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Clear All Historical Data/ }).click();
    await page.waitForTimeout(500);
    const input = page.locator('input[placeholder="WIPE"]');
    const hasInput = await input.count();
    const confirmBtn = page.getByRole('button', { name: 'Wipe Database' });
    const disabledBefore = await confirmBtn.isDisabled();
    await input.fill('WIPE');
    const disabledAfter = await confirmBtn.isDisabled();
    await confirmBtn.click(); await page.waitForTimeout(800);
    console.log(`[WIPE] typed-confirm input=${hasInput} (1), disabled before typing=${disabledBefore} (true), after=${disabledAfter} (false), DELETE fired after confirm=${page.counters.del > 0}`);
    await ctx.close();
  }

  // ---------- 7. Toast replaces alert (no blocking dialog) ----------
  {
    const { ctx, page } = await newPage();
    let dialogSeen = false;
    page.on('dialog', (d) => { dialogSeen = true; d.dismiss(); });
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Ping Devices/ }).click();
    await page.waitForTimeout(600);
    const toastVisible = await page.getByText(/Test ping sent/).count();
    console.log(`[TOAST] ping: toast visible=${toastVisible > 0} (true expected), blocking dialog=${dialogSeen} (false expected)`);
    await ctx.close();
  }

  await browser.close();
})().catch((e) => { console.error('PROBE FAILURE:', e); process.exit(1); });
