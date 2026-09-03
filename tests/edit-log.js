// Run with:  node tests/edit-log.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Editing a past log. This existed only on post-practice sweat checks, so a mis-typed
// morning weigh-in (169.9 for 160.9) could previously only be deleted and re-entered.
// Exposing it on morning rows also exposed a latent data-loss bug: the modal collects
// weight/date/time but sent sleep_hrs: 0 with them, which zeroed sleep on any row it
// touched. Post-practice rows carry no sleep, so it never showed.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [{ id: uuid(1), name: 'Typo Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' }];
const BAD_ID = uuid(51);
const logs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Typo Athlete', sport: 'Football', weight_lbs: 157.8, sleep_hrs: 8, session_type: null, is_baseline: true, created_at: ago(20) },
  // The fat-fingered morning weigh-in: 169.9 where 160.9 was meant. Carries 8h sleep.
  { id: BAD_ID, athlete_id: uuid(1), athlete_name: 'Typo Athlete', sport: 'Football', weight_lbs: 169.9, sleep_hrs: 8, session_type: null, is_baseline: false, created_at: ago(2) },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  page.patches = [];
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
      if (method === 'PATCH') { page.patches.push({ url, body: req.postDataJSON() }); return route.fulfill({ status: 204, headers: hdrs, body: '' }); }
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  console.log('\n[A] A morning weigh-in offers an Edit control');
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
  await page.getByText('Typo Athlete').first().click(); await page.waitForTimeout(1800);
  const editButtons = page.getByRole('button', { name: /^EDIT$/i });
  const n = await editButtons.count();
  check('edit buttons present in the log ledger', n >= 2, `found ${n}`);
  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n[B] Correcting the weight PATCHes the right row');
  // The ledger is newest-first, so the first row is the bad 169.9 entry.
  await editButtons.first().click();
  await page.waitForTimeout(1000);
  const modal = await page.locator('body').innerText();
  check('edit modal opened', /EDIT LOG ENTRY/i.test(modal), modal.slice(0, 120));
  check('modal is prefilled with the existing weight', /169\.9/.test(modal), 'weight not carried into the form');

  const weightField = page.locator('input[type="number"], input[inputmode="decimal"]').filter({ hasNot: page.locator('[disabled]') }).first();
  await weightField.fill('160.9');
  await page.getByRole('button', { name: /SAVE CHANGES/i }).click();
  await page.waitForTimeout(1600);

  const patch = page.patches.find(p => p.url.includes(BAD_ID)) || page.patches[0];
  check('a PATCH was issued', !!patch, `patches: ${page.patches.length}`);
  if (patch) {
    check('PATCH targets the edited row', patch.url.includes(BAD_ID), patch.url.slice(-80));
    check('weight corrected to 160.9', Number(patch.body.weight_lbs) === 160.9, JSON.stringify(patch.body));
    // The regression this whole probe exists for.
    check('sleep preserved at 8h, not zeroed', Number(patch.body.sleep_hrs) === 8,
      `sleep_hrs=${patch.body.sleep_hrs} — editing a weigh-in wiped the sleep value`);
    check('row not reclassified as post-practice', patch.body.session_type !== 'post_practice',
      `session_type=${patch.body.session_type}`);
    check('is_baseline not named in the payload', !('is_baseline' in patch.body),
      'naming it risks clearing a baseline marker on an unrelated edit');
  }
  check('still no page errors', errors.length === 0, errors.join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
