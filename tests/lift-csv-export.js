// Run with:  node tests/lift-csv-export.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.32.0: Lift Tracker gained a CSV export of every logged set. Icon-only, no label,
// and separated from the Log a Lift / Leaderboard tabs by a divider - deliberately not
// worded as a button an athlete tapping through the kiosk would read as part of
// logging their own lift.
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

const athletes = [
  { id: uuid(1), name: 'Export Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  { id: uuid(2), name: 'Adam Zed', sport: 'Football', team: 'Varsity', grade: '11th', position: 'DL' },
  { id: uuid(3), name: 'Zach Adams', sport: 'Football', team: 'Varsity', grade: '12th', position: 'LB' },
];
// Deliberately out of last-name order, and deliberately mixed first names so a
// naive full-name sort ("Adam Zed" before "Zach Adams") would land in the wrong
// place if the export sorted on anything but the last name.
const liftLogs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Export Athlete', sport: 'Football', lift_type: 'Squat', weight_lbs: 225, reps: 8, source: 'manual', created_at: ago(1) },
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Export Athlete', sport: 'Football', lift_type: 'Bench', weight_lbs: 185, reps: 5, source: 'manual', created_at: ago(0) },
  { id: uuid(52), athlete_id: uuid(2), athlete_name: 'Adam Zed', sport: 'Football', lift_type: 'Bench', weight_lbs: 200, reps: 5, source: 'manual', created_at: ago(2) },
  { id: uuid(53), athlete_id: uuid(3), athlete_name: 'Zach Adams', sport: 'Football', lift_type: 'Squat', weight_lbs: 300, reps: 3, source: 'manual', created_at: ago(2) },
  // Old set, outside a 7- or 30-day window - used by the time-frame probe.
  { id: uuid(54), athlete_id: uuid(1), athlete_name: 'Export Athlete', sport: 'Football', lift_type: 'Deadlift', weight_lbs: 405, reps: 1, source: 'manual', created_at: ago(45) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableLiftTracker: true });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(liftLogs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Export button is icon-only, not a labeled call-to-action');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const btn = page.getByLabel('Export lifts to CSV');
    check('the export control exists', await btn.count() > 0);
    // The icon is a Material Symbols ligature, so its glyph name ("download") is DOM
    // text - ignore aria-hidden icon spans and require no other text.
    check('it carries no visible text label', await btn.evaluate(el => [...el.childNodes].every(n =>
      (n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true') || !(n.textContent || '').trim())));
    check('it is not styled as an accent call-to-action (no gold fill)',
      await btn.evaluate(el => getComputedStyle(el).backgroundColor !== 'rgb(184, 156, 91)'));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Clicking it downloads a CSV with every logged set');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => { await page.getByLabel('Export lifts to CSV').click(); await page.getByRole('button', { name: /Download CSV/i }).click(); })(),
    ]);
    check('filename names who, lift and time frame', /^Shiloh_Lifts_All_AllLifts_AllTime_\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), download.suggestedFilename());
    const path = await download.path();
    const fs = await import('fs');
    const content = fs.readFileSync(path, 'utf-8');
    check('header row matches expected columns', content.startsWith('"Date","Athlete","Sport","Lift","Weight (lbs)","Reps","Est. 1RM"'), content.split('\n')[0]);
    check('both logged sets are present', content.includes('Squat') && content.includes('Bench'), content);
    check('estimated 1RM is computed, not just raw weight (225x8 -> 285, not 225)', content.includes('285'), content);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Rows are sorted by last name, not first name or date logged');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => { await page.getByLabel('Export lifts to CSV').click(); await page.getByRole('button', { name: /Download CSV/i }).click(); })(),
    ]);
    const path = await download.path();
    const fs = await import('fs');
    const content = fs.readFileSync(path, 'utf-8');
    // Expected last-name order: Adams (Zach), Athlete (Export), Zed (Adam) - a
    // first-name or date sort would put "Zach Adams" last, not first.
    const idxAdams = content.indexOf('Zach Adams');
    const idxExport = content.indexOf('Export Athlete');
    const idxZed = content.indexOf('Adam Zed');
    check('all three athletes are present', idxAdams >= 0 && idxExport >= 0 && idxZed >= 0, content);
    check('sorted by last name (Adams, Athlete, Zed) - not first name or date', idxAdams < idxExport && idxExport < idxZed,
      `Adams@${idxAdams}, Athlete@${idxExport}, Zed@${idxZed}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] Export options: who, lift and time frame');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByLabel('Export lifts to CSV').click(); await page.waitForTimeout(300);
    const panel = page.getByRole('dialog');
    check('export options panel opens', await panel.count() === 1);
    check('shows the matching set count before downloading', /5 sets/.test(await panel.innerText()), await panel.innerText());
    await panel.getByRole('button', { name: 'Last 7 days' }).click();
    check('7-day window drops the 45-day-old set', /4 sets/.test(await panel.innerText()), await panel.innerText());
    await panel.getByRole('button', { name: 'One athlete' }).click();
    check('download disabled until an athlete is picked', await panel.getByRole('button', { name: /Download CSV/i }).isDisabled());
    await panel.getByLabel('Athlete').selectOption(uuid(1));
    await panel.getByLabel('Lift').selectOption('Squat');
    check('one athlete + Squat + 7 days = 1 set', /1 set\b/.test(await panel.innerText()), await panel.innerText());
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: /Download CSV/i }).click()]);
    const fs = await import('fs');
    const content = fs.readFileSync(await download.path(), 'utf-8');
    check('file only contains that athlete', content.includes('Export Athlete') && !content.includes('Zach Adams') && !content.includes('Adam Zed'), content);
    check('file only contains Squat', content.includes('Squat') && !content.includes('Bench') && !content.includes('Deadlift'), content);
    check('filename names the athlete and lift', /^Shiloh_Lifts_Export-Athlete_Squat_/.test(download.suggestedFilename()), download.suggestedFilename());
    check('panel closes after export', await page.getByRole('dialog').count() === 0);
  }

  console.log('\n[E] Leaderboard: rank options and PNG image');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Leaderboard/i }).first().click(); await page.waitForTimeout(500);
    await page.locator('select[aria-label="Lift"]').selectOption('Squat'); await page.waitForTimeout(300);
    // Position in the ranked list (skipping the top-3 podium, which is ordered 2-1-3).
    const order = async () => {
      const rows = await page.locator('[data-testid="leaderboard-row"]').allInnerTexts();
      const up = rows.map(r => r.toUpperCase());
      const e = up.findIndex(r => r.includes('EXPORT ATHLETE')), z = up.findIndex(r => r.includes('ZACH ADAMS'));
      if (e < 0 || z < 0) return `missing (export=${e}, zach=${z})`;
      return e < z ? 'export-first' : 'zach-first';
    };
    // Squat: Export 225x8 (est 285) vs Zach 300x3 (est 330, heaviest 300) -> Zach first either way
    check('est. 1RM ranks Zach (330) above Export (285)', await order() === 'zach-first', await order());
    await page.getByLabel('Rank by').selectOption('heaviest'); await page.waitForTimeout(300);
    check('rank label switches to HEAVIEST SET', /HEAVIEST SET/.test(await page.locator('body').innerText()));
    check('heaviest set still has Zach (300) above Export (225)', await order() === 'zach-first', await order());
    await page.getByLabel('Rank by').selectOption('relative'); await page.waitForTimeout(300);
    check('pound-for-pound explains athletes without a weigh-in', /left out: no weigh-in on record/i.test(await page.locator('body').innerText()));
    await page.getByLabel('Rank by').selectOption('est1rm');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /Download PNG/i }).click()]);
    const fs = await import('fs');
    const buf = fs.readFileSync(await download.path());
    check('downloads a PNG file', buf.slice(1, 4).toString() === 'PNG', download.suggestedFilename());
    // Height follows the row count (3 athletes here), so a short board isn't mostly empty.
    check('PNG is 1080 wide and sized to its rows', buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) > 700 && buf.readUInt32BE(20) < 1100, `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
    check('filename names the lift', /^Leaderboard_Squat_/.test(download.suggestedFilename()), download.suggestedFilename());
    fs.writeFileSync('/tmp/claude-0/leaderboard-test.png', buf);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
