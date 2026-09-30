// Run with:  node tests/password-reset.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.3: "Forgot password?" on the login screen emails a reset link (neutral reply,
// no account enumeration); opening the link shows Set new password - never straight
// into the app - and saving it signs the coach in. Expired links say so.
import { chromium } from 'playwright';
import { isAuthRoute } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};
const USER = { id: '00000007-0000-4000-8000-000000000007', email: 'coach@example.com', aud: 'authenticated', role: 'authenticated' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000007-0000-4000-8000-000000000007', email: 'coach@example.com', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const SESSION = { access_token: JWT, refresh_token: 'rec-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER };

async function newPage(browser, log) {
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) {
      log.push({ m, url, body: req.postData() });
      if (url.includes('/auth/v1/recover')) return route.fulfill({ status: 200, headers: h, body: '{}' });
      if (url.includes('/auth/v1/user') && m === 'PUT') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(USER) });
      if (url.includes('/auth/v1/user')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(USER) });
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(SESSION) });
    }
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  return page;
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Forgot password sends a reset email');
  let log = [];
  let page = await newPage(browser, log);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  check('password field hidden in reset mode', await page.locator('#login-password').count() === 0);
  await page.getByRole('button', { name: /EMAIL RESET LINK/ }).click(); await page.waitForTimeout(300);
  check('requires an email', /Enter the email/.test(await page.locator('body').innerText()));
  await page.locator('#login-email').fill('Coach@Example.com');
  await page.getByRole('button', { name: /EMAIL RESET LINK/ }).click(); await page.waitForTimeout(800);
  const rec = log.find(l => l.url.includes('/auth/v1/recover'));
  check('calls the recover endpoint with the lowercased email', rec && /coach@example\.com/.test(rec.body || ''), JSON.stringify(rec));
  check('redirects back to this app', rec && decodeURIComponent(rec.url).includes(`redirect_to=${APP}/`), rec?.url);
  check('neutral confirmation (no account enumeration)', /If coach@example\.com has an account, a reset link is on its way/.test(await page.locator('body').innerText()));
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  check('back to sign in', await page.locator('#login-password').count() === 1);

  console.log('\n[B] Opening the reset link asks for a new password first');
  log = [];
  page = await newPage(browser, log);
  await page.goto(`${APP}/#access_token=${JWT}&refresh_token=rec-refresh&expires_in=3600&token_type=bearer&type=recovery`); await page.waitForTimeout(2000);
  let body = await page.locator('body').innerText();
  check('shows Set a new password (not the app)', /SET A NEW PASSWORD/i.test(body) && !/OVERVIEW/i.test(body), body.slice(0, 200));
  check('tokens removed from the address bar', !/access_token/.test(page.url()), page.url());
  await page.locator('#new-password').fill('short');
  await page.locator('#new-password-confirm').fill('short');
  await page.getByRole('button', { name: /SAVE PASSWORD/ }).click(); await page.waitForTimeout(300);
  check('rejects a short password', /at least 8/.test(await page.locator('body').innerText()));
  await page.locator('#new-password').fill('newpass1234');
  await page.locator('#new-password-confirm').fill('newpass12345');
  await page.getByRole('button', { name: /SAVE PASSWORD/ }).click(); await page.waitForTimeout(300);
  check('rejects mismatched passwords', /do not match/.test(await page.locator('body').innerText()));
  await page.locator('#new-password-confirm').fill('newpass1234');
  await page.getByRole('button', { name: /SAVE PASSWORD/ }).click(); await page.waitForTimeout(2500);
  const put = log.find(l => l.m === 'PUT' && l.url.includes('/auth/v1/user'));
  check('new password sent to the auth service', put && /newpass1234/.test(put.body || ''));
  check('then the app opens', /OVERVIEW/i.test(await page.locator('body').innerText()));

  console.log('\n[C] Expired link');
  page = await newPage(browser, []);
  await page.goto(`${APP}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`); await page.waitForTimeout(1500);
  body = await page.locator('body').innerText();
  check('login screen explains the link expired', /expired or was already used/.test(body), body.slice(0, 300));
  check('error removed from the address bar', !/error_code/.test(page.url()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
