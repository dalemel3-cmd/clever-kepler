// Run with:  node tests/select-visibility.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// A native <option> popup does not reliably inherit the .input-glass dark background on
// most platforms - it renders on the OS's own light popup, so text colored for a dark
// background (light/white) was invisible against it until the browser's hover state
// happened to add contrast. EntryScreen's roster filters already carry the fix
// (explicit background + color per <option>); the Analytics sport filter and the
// Speed & Power athlete/test pickers did not.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [{ id: uuid(1), name: 'Visible Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' }];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableSpeedPower: true });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

// Native <select> popups are painted by the OS, outside the normal render tree, so
// getComputedStyle on an <option> does not reflect what a person actually sees in the
// open dropdown - it always reports *some* inherited color/background from the page,
// which almost always differ from each other regardless of whether the option was
// styled at all. That made an early version of this probe pass identically against the
// broken build and the fixed one - it wasn't testing anything real.
//
// What CAN be verified honestly: whether the option carries an explicit inline
// background/color at all, matching the fix already proven in EntryScreen's roster
// filters. That is a presence check, not a rendered-pixel check, and this comment says
// so rather than dressing it up as more than it is.
const checkOptionStyled = async (page, selector, label) => {
  const opts = await page.locator(`${selector} option`).evaluateAll(els =>
    els.map(el => ({
      text: el.textContent,
      hasBackground: !!(el.style.background || el.style.backgroundColor),
      hasColor: !!el.style.color,
    }))
  );
  check(`${label}: has options to check`, opts.length > 0, 'no <option> elements found');
  for (const o of opts) {
    check(`${label}: "${o.text}" option has an explicit background + color set`,
      o.hasBackground && o.hasColor,
      `inline background set=${o.hasBackground} inline color set=${o.hasColor}`);
  }
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await newPage(browser);
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);

  console.log('\n[A] Analytics sport filter');
  await checkOptionStyled(page, 'select[aria-label="Sport filter"]', 'Sport filter');

  console.log('\n[B] Speed & Power athlete picker');
  await checkOptionStyled(page, '#sp-athlete', 'Athlete picker');

  console.log('\n[C] Speed & Power test-type picker');
  await checkOptionStyled(page, '#sp-type', 'Test picker');

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
