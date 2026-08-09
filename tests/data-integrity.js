// Run with:  node tests/data-integrity.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
/* Focused probes: null-name crash, baseline-metadata wipe on edit, leaderboard corruption, real offline queue. */
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

// CHROMIUM_PATH lets CI point at a preinstalled browser; otherwise Playwright's own.
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const athletes = [
  // position holds JSON-encoded baseline metadata (as encodeAthleteMeta writes it)
  { id: uuid(1), name: 'Meta Baseline', sport: 'Football', team: 'Varsity', grade: '11th',
    position: JSON.stringify({ pos: 'QB', bw: 200.5, bd: '2026-08-01T12:00:00.000Z', lid: uuid(777) }) },
  { id: uuid(2), name: 'Sleep Only', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
  { id: uuid(3), name: null, sport: 'Football', team: '', grade: '', position: '' },
];
const logs = [
  { id: uuid(101), athlete_id: uuid(2), athlete_name: 'Sleep Only', sport: 'Football', weight_lbs: 185, sleep_hrs: 8, created_at: new Date(Date.now() - 5 * 864e5).toISOString(), session_type: null, is_baseline: false },
  { id: uuid(102), athlete_id: uuid(2), athlete_name: 'Sleep Only', sport: 'Football', weight_lbs: 0, sleep_hrs: 7, created_at: new Date(Date.now() - 3600e3).toISOString(), session_type: null, is_baseline: false }, // latest = sleep-only
  { id: uuid(103), athlete_id: uuid(1), athlete_name: 'Meta Baseline', sport: 'Football', weight_lbs: 199, sleep_hrs: 8, created_at: new Date(Date.now() - 2 * 864e5).toISOString(), session_type: null, is_baseline: false },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
  await stubAuth(page);
    await stubAuth(page);
    page.patches = [];
    await page.route(SUPA, async (route) => {
      const req = route.request(); const url = req.url(); const method = req.method();
      const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
      if (opts.killRest && url.includes('/rest/')) return route.abort('connectionfailed');
      if (url.includes('/rest/v1/athletes')) {
        if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.athletes || athletes) });
        if (method === 'PATCH') { page.patches.push({ table: 'athletes', url, body: req.postDataJSON() }); return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ ...(req.postDataJSON()), id: uuid(1) }]) }); }
      }
      if (url.includes('/rest/v1/weigh_ins')) {
        if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
        if (method === 'PATCH') { page.patches.push({ table: 'weigh_ins', url, body: req.postDataJSON() }); return route.fulfill({ status: 204, headers: hdrs, body: '' }); }
        if (method === 'POST') { page.patches.push({ table: 'weigh_ins:POST', body: req.postDataJSON() }); return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ ...(Array.isArray(req.postDataJSON()) ? req.postDataJSON()[0] : req.postDataJSON()), id: uuid(900) }]) }); }
      }
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    });
    return { ctx, page };
  };

  {
    const { ctx, page } = await newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    for (const s of ['dashboard', 'entry', 'profiles']) {
      await page.goto(`${APP}/#${s}`); await page.waitForTimeout(1400);
      const dead = await page.getByText('Something went wrong.').count();
      let detail = '';
      if (dead) detail = (await page.locator('details').innerText().catch(() => '')).split('\n')[0];
      console.log(`[A:NULL-NAME] #${s}: ${dead ? `CRASHED -> ${detail}` : 'ok'} pageErrors=${errs.length}`);
      if (dead) break;
    }
    await ctx.close();
  }

  {
    const { ctx, page } = await newPage({ athletes: athletes.slice(0, 2) });
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1500);
    await page.getByText('Meta Baseline').first().click(); await page.waitForTimeout(1200);
    // what does the app think the baseline is before edit?
    await page.getByRole('button', { name: 'EDIT INFO' }).click(); await page.waitForTimeout(900);
    // The roster edit form should now be open; just hit save without changing anything
    const save = page.getByRole('button', { name: /SAVE|UPDATE/i }).first();
    const btnTxt = await save.innerText().catch(() => '?');
    await save.click().catch(() => {});
    await page.waitForTimeout(1200);
    const athPatch = page.patches.filter((p) => p.table === 'athletes');
    console.log(`[B:META-WIPE] clicked "${btnTxt}", athletes PATCH bodies: ${JSON.stringify(athPatch.map((p) => p.body))}`);
    const posSent = athPatch[0] && athPatch[0].body && athPatch[0].body.position;
    console.log(`[B:META-WIPE] position sent to cloud: ${JSON.stringify(posSent)} ${posSent && !String(posSent).startsWith('{"') ? '→ JSON BASELINE METADATA WIPED ❗' : ''}`);
    await ctx.close();
  }

  {
    const { ctx, page } = await newPage({ athletes: athletes.slice(0, 2) });
    await page.goto(`${APP}/#reports`); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /CUSTOM BUILDER/ }).click(); await page.waitForTimeout(800);
    const dropsPanel = page.locator('div').filter({ hasText: /TOP WEIGHT DROPS/ }).last();
    const txt = (await dropsPanel.innerText().catch(() => '(not found)')).replace(/\n/g, ' | ').slice(0, 400);
    console.log(`[C:LEADERBOARD] Top Drops panel: ${txt}`);
    await ctx.close();
  }

  // ---------- D. hard network failure (fetch rejects): does save queue survive? ----------
  {
    const { ctx, page } = await newPage({ athletes: athletes.slice(0, 2) });
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
    // now kill REST
    await page.unroute(SUPA);
    await page.route(SUPA, (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      return route.abort('connectionfailed');
    });
    await page.getByPlaceholder('Search athletes by name...').fill('Meta');
    await page.waitForTimeout(400);
    await page.locator('text=Meta Baseline').first().click(); await page.waitForTimeout(600);
    await page.locator('input[aria-label="Body weight (lbs)"]').fill('190.0');
    await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const q1 = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
    console.log(`[D:NET-FAIL] queue after save during connection failure: ${q1} (1 expected)`);
    // keep failing for 12s of heartbeats — queue must survive
    await page.waitForTimeout(12000);
    const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length);
    console.log(`[D:NET-FAIL] queue after 12s of failed heartbeats: ${q2} ${q2 < q1 ? '→ DROPPED ❗' : '(preserved ✓)'}`);
    await ctx.close();
  }

  await browser.close();
})().catch((e) => { console.error('PROBE FAILURE:', e); process.exit(1); });
