// Run with:  node tests/auth.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database
// and never contact the real auth service.
//
// Covers the login gate, session persistence (the kiosk requirement), the offline
// fallback that must NOT lock an offline kiosk out, and sign-out.

import { chromium } from 'playwright';

// CHROMIUM_PATH lets CI point at a preinstalled browser; otherwise Playwright's own.
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const athletes = [{ id: uuid(1), name: 'Auth Probe', sport: 'Football', team: 'V', grade: '11th', position: 'QB' }];
const logs = [{
  id: uuid(101), athlete_id: uuid(1), athlete_name: 'Auth Probe', sport: 'Football',
  weight_lbs: 200, sleep_hrs: 7, created_at: new Date(Date.now() - 864e5).toISOString(),
  session_type: null, is_baseline: true,
}];

const makeSession = (email = 'coach@example.com') => ({
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: uuid(7), email, aud: 'authenticated', role: 'authenticated' },
});

const results = [];
const check = (label, actual, expected) => {
  const pass = actual === expected;
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${actual} (expected ${expected})`);
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  // Shared route handler. `authState.valid` controls whether the fake auth server
  // accepts the credentials.
  const authState = { valid: true, signInCalls: 0 };

  const newCtx = async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route(SUPA, async (route) => {
      const req = route.request();
      const url = req.url();
      const m = req.method();
      const h = {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
        'access-control-expose-headers': 'Content-Range',
        'content-range': `0-0/${logs.length}`,
      };
      if (m === 'OPTIONS') {
        return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      }
      if (url.includes('/realtime/')) return route.abort();

      // --- fake auth endpoints ---
      if (url.includes('/auth/v1/token')) {
        authState.signInCalls++;
        if (!authState.valid) {
          return route.fulfill({ status: 400, headers: h, body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
        }
        return route.fulfill({ status: 200, headers: h, body: JSON.stringify(makeSession()) });
      }
      if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers: h, body: '' });
      if (url.includes('/auth/v1/user')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(makeSession().user) });
      // Approved by default so the pre-approval tests exercise what they intend.
      if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ user_id: makeSession().user.id, email: 'coach@example.com', approved: true }]) });

      // --- data endpoints ---
      if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
      if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
      return route.fulfill({ status: 200, headers: h, body: '[]' });
    });
    return { ctx, page };
  };

  const seeded = (page) => page.evaluate((s) => {
    localStorage.setItem('hpd_auth', JSON.stringify(s));
    localStorage.setItem('hpd_signed_in_before', '1');
  }, makeSession());


  // Route helper for the approval tests: same fake auth, plus a controllable
  // public.coaches response.
  const stubAuthLocal = (page) => page.addInitScript((s) => {
    try {
      localStorage.setItem('hpd_auth', JSON.stringify(s));
      localStorage.setItem('hpd_signed_in_before', '1');
    } catch (e) {}
  }, makeSession());

  const routeWith = (page, opts) => page.route(SUPA, async (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-expose-headers': 'Content-Range', 'content-range': `0-0/${logs.length}` };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers: h, body: '' });
    if (url.includes('/auth/v1/signup')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(makeSession('newcoach@example.com')) });
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(makeSession()) });
    if (url.includes('/rest/v1/coaches')) {
      if (opts.coachesMissing) {
        return route.fulfill({ status: 404, headers: h, body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.coaches' in the schema cache" }) });
      }
      if (opts.coachesError) return route.abort('connectionfailed');
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(opts.coaches || []) });
    }
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  // ---------- 1. A fresh device is gated ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    check('fresh device shows login', /SIGN IN/i.test(body), true);
    check('fresh device hides dashboard', body.toUpperCase().includes('TOTAL ATHLETES'), false);
    await ctx.close();
  }

  // ---------- 2. Bad credentials are rejected, app stays locked ----------
  {
    authState.valid = false;
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.locator('#login-email').fill('coach@example.com');
    await page.locator('#login-password').fill('wrong');
    await page.getByRole('button', { name: /SIGN IN/i }).click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    check('bad password shows an error', /incorrect/i.test(body), true);
    check('bad password does not unlock', body.toUpperCase().includes('TOTAL ATHLETES'), false);
    await ctx.close();
    authState.valid = true;
  }

  // ---------- 3. Good credentials unlock the app ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.locator('#login-email').fill('coach@example.com');
    await page.locator('#login-password').fill('correct-horse');
    await page.getByRole('button', { name: /SIGN IN/i }).click();
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('valid login reaches dashboard', body.toUpperCase().includes('TOTAL ATHLETES'), true);
    const marker = await page.evaluate(() => localStorage.getItem('hpd_signed_in_before'));
    check('device marked as previously signed in', marker, '1');
    await ctx.close();
  }

  // ---------- 4. Kiosk requirement: session survives a reload ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await seeded(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('stored session skips the login screen', body.toUpperCase().includes('TOTAL ATHLETES'), true);
    check('no re-login prompted', /SIGN IN$/im.test(body.split('\n')[0] || ''), false);
    await ctx.close();
  }

  // ---------- 5. Offline kiosk must NOT be locked out ----------
  // A gym with no WiFi must still be able to record weigh-ins into the offline queue.
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await page.evaluate(() => {
      localStorage.setItem('hpd_signed_in_before', '1');
      localStorage.removeItem('hpd_auth'); // no usable session
    });
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('known device offline is let through', body.toUpperCase().includes('TOTAL ATHLETES'), true);
    await ctx.close();
  }

  // ---------- 6. Unknown device offline still gets the login screen ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { localStorage.removeItem('hpd_auth'); localStorage.removeItem('hpd_signed_in_before'); });
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('unknown device offline stays locked', /SIGN IN/i.test(body), true);
    check('offline notice explains why', /offline/i.test(body), true);
    await ctx.close();
  }

  // ---------- 7. Sign-out returns to the login screen ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await seeded(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.goto(`${APP}/#settings`);
    await page.waitForTimeout(2000);
    let body = await page.locator('body').innerText();
    check('settings shows the signed-in email', body.includes('coach@example.com'), true);
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Sign Out', exact: true }).last().click();
    await page.waitForTimeout(2000);
    body = await page.locator('body').innerText();
    check('sign-out returns to login', /SIGN IN/i.test(body), true);
    await ctx.close();
  }

  // ---------- 8. Sign-out warns when weigh-ins are still queued ----------
  {
    const { ctx, page } = await newCtx();
    await page.goto(APP, { waitUntil: 'load' });
    await seeded(page);
    await page.evaluate(() => localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify([
      { action: 'insert', record: { athlete_id: 'x', athlete_name: 'Auth Probe', weight_lbs: 199, created_at: new Date().toISOString() } },
    ])));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.goto(`${APP}/#settings`);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    check('sign-out warns about unsynced logs', /1 Unsynced Log/i.test(body), true);
    await ctx.close();
  }


  // ---------- 9. Approval gating ----------
  // The coaches table decides who gets in. These mirror the SQL-level checks
  // already verified against the database (pending sees 0 athletes and cannot
  // self-approve) at the UI layer.
  {
    // 9a. Pending user is held at the waiting screen, not shown an empty app.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubAuthLocal(page);
    await routeWith(page, { coaches: [{ approved: false }] });
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    let body = await page.locator('body').innerText();
    check('pending user sees waiting screen', /Waiting for approval/i.test(body), true);
    check('pending user cannot see the app', body.toUpperCase().includes('TOTAL ATHLETES'), false);
    await ctx.close();
  }
  {
    // 9b. Approved user goes straight in.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubAuthLocal(page);
    await routeWith(page, { coaches: [{ approved: true }] });
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('approved user reaches the app', body.toUpperCase().includes('TOTAL ATHLETES'), true);
    await ctx.close();
  }
  {
    // 9c. Before the migration runs, coaches doesn't exist. The app must still work.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubAuthLocal(page);
    await routeWith(page, { coachesMissing: true });
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('pre-migration (no coaches table) still works', body.toUpperCase().includes('TOTAL ATHLETES'), true);
    await ctx.close();
  }
  {
    // 9d. Approval cached, then the server becomes unreachable: a kiosk must not
    // be demoted to the pending screen mid-session.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubAuthLocal(page);
    await page.addInitScript(() => { try { localStorage.setItem('hpd_approved', '1'); } catch (e) {} });
    await routeWith(page, { coachesError: true });
    await page.goto(APP, { waitUntil: 'load' });
    // Longer than the approval-check timeout, so the fallback has resolved.
    await page.waitForTimeout(7000);
    const body = await page.locator('body').innerText();
    check('previously-approved kiosk survives an unreachable server', body.toUpperCase().includes('TOTAL ATHLETES'), true);
    await ctx.close();
  }
  {
    // 9e. Sign-up leads to the waiting screen, never straight into the app.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await routeWith(page, { coaches: [{ approved: false }] });
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Create an account/i }).click();
    await page.waitForTimeout(400);
    await page.locator('#login-email').fill('newcoach@example.com');
    await page.locator('#login-password').fill('averylongpassword');
    await page.locator('#login-confirm').fill('averylongpassword');
    await page.getByRole('button', { name: /CREATE ACCOUNT/i }).click();
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    check('new signup lands on waiting screen', /Waiting for approval/i.test(body), true);
    check('new signup does not reach the app', body.toUpperCase().includes('TOTAL ATHLETES'), false);
    await ctx.close();
  }
  {
    // 9f. Sign-up validates before it hits the network.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await routeWith(page, { coaches: [{ approved: false }] });
    await page.goto(APP, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Create an account/i }).click();
    await page.waitForTimeout(400);
    await page.locator('#login-email').fill('newcoach@example.com');
    await page.locator('#login-password').fill('averylongpassword');
    await page.locator('#login-confirm').fill('DIFFERENT');
    await page.getByRole('button', { name: /CREATE ACCOUNT/i }).click();
    await page.waitForTimeout(800);
    const body = await page.locator('body').innerText();
    check('mismatched passwords are rejected', /do not match/i.test(body), true);
    await ctx.close();
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('PROBE FAILURE:', e); process.exit(1); });
