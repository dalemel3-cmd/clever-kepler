// Run with:  node tests/profile-subtext.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.8: the athlete profile header shows position and grade under the name
// ("Football · LB · 11th · <org>"), reading position out of the baseline-meta JSON the
// position column stores, and leaves out whatever is missing (no empty dots).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const athletes = [
  // Same shape production now has: position is the baseline-meta JSON (jsonb text form).
  { id: uuid(1), name: 'Max Eldridge', sport: 'Football', team: 'Varsity', grade: '11th', position: '{"bd": "2026-08-03T21:40:46.027+00:00", "bw": 168.1, "lid": null, "pos": "LB"}' },
  { id: uuid(2), name: 'Lily Cox', sport: 'Volleyball', team: 'Varsity', grade: '12th', position: '' },
  { id: uuid(3), name: 'No Info', sport: 'Golf', team: '', grade: '', position: '' },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ organizationName: 'Shiloh Athletics' })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  const sub = async (name) => {
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(1800);
    await page.getByText(name, { exact: true }).first().click(); await page.waitForTimeout(500);
    const full = page.getByRole('button', { name: /View Full Trends/i }).first();
    if (await full.count()) { await full.click(); await page.waitForTimeout(1200); }
    return page.locator('h1').filter({ hasText: name.toUpperCase() }).locator('xpath=following-sibling::span[1]').innerText().catch(async () => (await page.locator('main').innerText()).slice(0, 300));
  };

  const a = await sub('Max Eldridge');
  check('position + grade under the name', a.trim() === 'Football · LB · 11th · Shiloh Athletics', a);
  const b = await sub('Lily Cox');
  check('grade only when no position', b.trim() === 'Volleyball · 12th · Shiloh Athletics', b);
  const c = await sub('No Info');
  check('nothing missing shown as empty dots', c.trim() === 'Golf · Shiloh Athletics', c);

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
