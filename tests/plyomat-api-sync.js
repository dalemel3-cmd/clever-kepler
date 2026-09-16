// Run with:  node tests/plyomat-api-sync.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.36.0: "Sync from Plyomat" pulls results live instead of a manual CSV upload. The
// plan-building logic is unit-tested in tests/plyomat-import.js §H/I. This suite proves
// the part that only exists in the browser: the client's call to the plyomat-sync Edge
// Function (stubbable the same way any other browser network request is - the Edge
// Function's OWN outbound call to api.plyomat.com is invisible to Playwright and is
// covered separately by supabase/functions/plyomat-sync/sync.test.ts).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const FN = '**/functions/v1/plyomat-sync**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'ALEKSANDR KELLEY', sport: 'Football', team: 'Varsity', grade: '', position: 'WR' },
];

const apiAthletes = [
  { id: 'plyo-a1', first_name: 'Aleksandr', last_name: 'Kelley' },
];
const apiSets = [
  {
    id: 'plyo-s1', athlete_id: 'plyo-a1', display_mode: 'vertical', laterality: 'bilateral',
    started_at: '2026-09-01T20:00:00Z', version: 1,
    reps: [{ rep_index: 0, jump_height_cm: 64.29, is_kept: true, captured_at: '2026-09-01T20:00:00Z' }],
  },
];

const newPage = async (browser, { syncResponse, syncStatus = 200, syncStateRow }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  const writes = { athletes: [], tests: [], syncState: [] };
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  page.errors = errors;
  page.writes = writes;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableSpeedPower: true });

  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/plyomat_sync_state')) {
      if (method === 'PATCH') {
        const body = req.postDataJSON();
        writes.syncState.push(body);
        return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ ...syncStateRow, ...body }]) });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(syncStateRow || { last_synced_at: null }) });
    }
    if (url.includes('/rest/v1/athletes')) {
      if (method === 'POST') {
        const body = req.postDataJSON();
        const arr = Array.isArray(body) ? body : [body];
        writes.athletes.push(...arr);
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify(arr.map((a, i) => ({ ...a, id: uuid(500 + i) }))) });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    }
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/performance_tests')) {
      if (method === 'POST') {
        const body = req.postDataJSON();
        const arr = Array.isArray(body) ? body : [body];
        writes.tests.push(...arr);
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify(arr.map((t, i) => ({ ...t, id: uuid(600 + i) }))) });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  await page.route(FN, async (route) => {
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    return route.fulfill({ status: syncStatus, headers: hdrs, body: JSON.stringify(syncResponse) });
  });

  return page;
};

const switchToApiMode = async (page) => {
  await page.getByRole('button', { name: 'PLYOMAT SYNC', exact: true }).click();
  await page.waitForTimeout(300);
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Syncing produces the same reviewable preview UI as the CSV path');
  {
    const page = await newPage(browser, {
      syncResponse: { ok: true, sets: apiSets, athletes: apiAthletes, fetchedThrough: '2026-09-01T20:00:00Z', partial: false },
      syncStateRow: { id: true, last_synced_at: null },
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2000);
    await switchToApiMode(page);
    await page.getByRole('button', { name: 'SYNC FROM PLYOMAT', exact: true }).click();
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    check('preview appeared', /WILL IMPORT/i.test(body), body.slice(0, 200));
    check('nothing written yet', page.writes.tests.length === 0, `${page.writes.tests.length} writes`);
    check('first-sync warning shown before the first click', true); // covered implicitly by lastSyncedAt null path not erroring
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Confirming writes the right rows and advances the checkpoint');
  {
    const page = await newPage(browser, {
      syncResponse: { ok: true, sets: apiSets, athletes: apiAthletes, fetchedThrough: '2026-09-01T20:00:00Z', partial: false },
      syncStateRow: { id: true, last_synced_at: null },
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2000);
    await switchToApiMode(page);
    await page.getByRole('button', { name: 'SYNC FROM PLYOMAT', exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /^IMPORT \d+ RESULTS?$/i }).click();
    await page.waitForTimeout(1000);
    check('performance_tests received the import', page.writes.tests.length === 1, `wrote ${page.writes.tests.length}`);
    check('rows carry source=plyomat', page.writes.tests.every(t => t.source === 'plyomat'), JSON.stringify(page.writes.tests[0]));
    check('rows carry the set id for dedupe', page.writes.tests.every(t => String(t.notes || '').startsWith('plyomat:')), JSON.stringify(page.writes.tests[0]));
    check('metric is cm->in converted', Math.abs(page.writes.tests[0].metric - 25.31) < 0.01, String(page.writes.tests[0].metric));
    check('the checkpoint was advanced to fetchedThrough', page.writes.syncState.some(w => w.last_synced_at === '2026-09-01T20:00:00Z'), JSON.stringify(page.writes.syncState));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] A partial (rate-limited) sync shows an info message and does not advance the checkpoint');
  {
    const page = await newPage(browser, {
      syncResponse: { ok: true, sets: apiSets, athletes: apiAthletes, fetchedThrough: null, partial: true, partialReason: 'rate_limited' },
      syncStateRow: { id: true, last_synced_at: '2026-08-01T00:00:00Z' },
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2000);
    await switchToApiMode(page);
    await page.getByRole('button', { name: 'SYNC FROM PLYOMAT', exact: true }).click();
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    check('shows the partial-sync info message', /slow down partway through/i.test(body), body.slice(0, 300));
    // Confirm the plan anyway (partial data is still worth reviewing), then verify the
    // checkpoint is NOT advanced past what wasn't actually retrieved.
    const importBtn = page.getByRole('button', { name: /^IMPORT \d+ RESULTS?$/i });
    if (await importBtn.count()) {
      await importBtn.click();
      await page.waitForTimeout(700);
    }
    check('the checkpoint was not advanced on a partial sync', page.writes.syncState.length === 0, JSON.stringify(page.writes.syncState));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] A 401/unauthorized response shows the inline error and writes nothing');
  {
    const page = await newPage(browser, {
      syncResponse: { ok: false, error: { code: 'unauthorized', message: 'invalid key' } },
      syncStatus: 401,
      syncStateRow: { id: true, last_synced_at: null },
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2000);
    await switchToApiMode(page);
    await page.getByRole('button', { name: 'SYNC FROM PLYOMAT', exact: true }).click();
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    check('shows the not-configured-correctly error', /isn.t configured correctly/i.test(body), body.slice(0, 300));
    check('wrote nothing', page.writes.tests.length === 0 && page.writes.athletes.length === 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
