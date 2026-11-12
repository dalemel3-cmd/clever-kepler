// Run with:  node tests/full-backup.js   (preview on :4173; Supabase stubbed)
// v5.16.1 Settings > Offline data recovery > Full backup (docs/HANDOFF.md §156): one tap
// copies every row of every table into a JSON file. A table past 1,000 rows is read a page
// at a time by id, each table is counted first, and nothing is saved unless every row came
// back. On an iPad the file goes through the share sheet and only counts once it is saved.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const fresh = () => ({
  athletes: [1, 2, 3].map(n => ({ id: uuid(n), name: `Backup ${n}`, sport: 'Football' })),
  weigh_ins: Array.from({ length: 2345 }, (_, i) => ({ id: uuid(10000 + i), athlete_id: uuid(1 + (i % 3)), athlete_name: 'x', sport: 'Football', weight_lbs: 180 + (i % 9), created_at: new Date(Date.UTC(2026, 3, 1) + i * 3600000).toISOString() })),
  lift_logs: [1, 2, 3, 4, 5].map(n => ({ id: uuid(500 + n), athlete_id: uuid(1), lift_type: 'Bench', weight_lbs: 200, reps: 1, created_at: new Date(Date.now() - 86400000).toISOString() })),
  performance_tests: [1, 2, 3, 4].map(n => ({ id: uuid(600 + n), athlete_id: uuid(2), test_type: 'vertical_jump', metric: 20 + n, created_at: new Date(Date.now() - 86400000).toISOString() })),
  programs: [{ id: uuid(700), name: 'Football Strength', sport: 'Football', days: [] }],
  workout_sessions: [],
  alert_status: [],
});
let db = fresh();
const backupGets = [];
let broken = null;      // a table whose rows fail to load
let shortBy = 0;        // rows the check-in copy comes back short of its count
let changeMidway = false; // delete one check-in and add another between two pages

// Answers like PostgREST: HEAD with an exact count; rows ordered by id, after `id=gt.`, `limit` at most 1,000.
async function route(page) {
  await page.route(SUPA, async (r) => {
    const req = r.request(); const url = decodeURIComponent(req.url()); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-expose-headers': 'content-range' };
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return r.abort();
    if (isAuthRoute(url)) return fulfillAuth(r, url, h);
    if (url.includes('/rest/v1/coaches')) return r.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    const table = (url.match(/\/rest\/v1\/([a-z_]+)\?/) || [])[1];
    const rows = db[table];
    if (rows && m === 'HEAD') return r.fulfill({ status: 200, headers: { ...h, 'content-range': rows.length ? `0-0/${rows.length}` : `*/0` }, body: '' });
    if (rows && m === 'GET' && /select=\*/.test(url) && /order=id\.asc/.test(url)) {
      backupGets.push(url);
      if (broken === table) return r.fulfill({ status: 500, headers: h, body: JSON.stringify({ message: 'boom' }) });
      const after = (url.match(/id=gt\.([0-9a-f-]+)/) || [])[1] || '';
      const lim = Math.min(Number((url.match(/limit=(\d+)/) || [])[1] || 1000), 1000);
      let all = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
      if (table === 'weigh_ins' && shortBy) all = all.slice(0, all.length - shortBy);
      const body = JSON.stringify(all.filter(x => x.id > after).slice(0, lim));
      if (table === 'weigh_ins' && changeMidway && !after) {
        // After page 1 went out: one check-in from page 1 is deleted and a new one is logged.
        db.weigh_ins = db.weigh_ins.filter(x => x.id !== uuid(10010));
        db.weigh_ins.push({ id: uuid(99999), athlete_id: uuid(1), athlete_name: 'x', sport: 'Football', weight_lbs: 191, created_at: new Date().toISOString() });
      }
      return r.fulfill({ status: 200, headers: h, body });
    }
    if (table === 'athletes' && m === 'GET') return r.fulfill({ status: 200, headers: h, body: JSON.stringify(db.athletes) });
    return r.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0' }, body: '[]' });
  });
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await stubAuth(page);
  await route(page);
  let downloads = 0;
  page.on('download', () => { downloads++; });
  const text = () => page.locator('body').innerText();

  await page.goto(`${APP}/#settings`); await page.waitForTimeout(2500);
  const row = page.getByTestId('full-backup');
  const button = row.getByRole('button');
  await row.scrollIntoViewIfNeeded();
  check('Settings shows the full backup row, never saved from here', await row.count() === 1 && /never/.test(await page.getByTestId('full-backup-age').innerText()), await page.getByTestId('full-backup-age').innerText().catch(() => ''));

  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), button.click()]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const centralToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  check('the file is named with the Central date', dl.suggestedFilename() === `hpd-full-backup-${centralToday}.json`, dl.suggestedFilename());
  check('it holds every table', file.kind === 'hpd-full-backup' && Object.keys(db).every(t => Array.isArray(file.tables[t])), JSON.stringify(Object.keys(file.tables || {})));
  check('all 2,345 check-ins are in it (3 pages by id), none twice', file.tables.weigh_ins.length === 2345 && new Set(file.tables.weigh_ins.map(r => r.id)).size === 2345 && backupGets.filter(u => u.includes('/weigh_ins?')).length === 3 && backupGets.filter(u => u.includes('/weigh_ins?') && /id=gt\./.test(u)).length === 2, `${file.tables.weigh_ins.length} rows, ${backupGets.filter(u => u.includes('/weigh_ins?')).length} requests`);
  check('the counts match the tables', Object.keys(db).every(t => file.counts[t] === db[t].length && file.tables[t].length === db[t].length), JSON.stringify(file.counts));
  check('rows are complete (all columns)', file.tables.lift_logs[0].lift_type === 'Bench' && file.tables.programs[0].name === 'Football Strength' && !!file.app_version && !!file.created_at);
  await page.waitForTimeout(400);
  check('the row now says saved today, and a message gives the count', /today/.test(await page.getByTestId('full-backup-age').innerText()) && /Backup file created: 2,358 records/.test(await text()), await page.getByTestId('full-backup-age').innerText());

  // A check-in deleted and another logged while the copy is running: every row that exists
  // at the end is in the file (reading by position used to skip one without noticing).
  await page.evaluate(() => window.__hpdFetchBrake.reset());
  changeMidway = true;
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), button.click()]);
  changeMidway = false;
  const ids2 = new Set(JSON.parse(fs.readFileSync(await dl2.path(), 'utf8')).tables.weigh_ins.map(r => r.id));
  const missing = db.weigh_ins.filter(r => !ids2.has(r.id)).map(r => r.id);
  check('a check-in deleted and one added mid-copy: no live row is missed', missing.length === 0 && ids2.has(uuid(99999)), `missing ${missing.length}: ${missing.slice(0, 3).join(',')}`);
  db = fresh();

  // A table that fails to load: no file at all.
  await page.evaluate(() => window.__hpdFetchBrake.reset());
  downloads = 0; broken = 'lift_logs';
  await button.click(); await page.waitForTimeout(2500);
  check('a table that fails to load: nothing is saved, the coach is told in plain words', downloads === 0 && /Couldn't read the lifts/.test(await text()) && !/lift_logs/.test(await text()));
  broken = null;

  // Rows missing against the count: no file.
  await page.evaluate(() => window.__hpdFetchBrake.reset());
  shortBy = 7;
  await button.click(); await page.waitForTimeout(2500);
  check('a copy that comes back short of the count is refused', downloads === 0 && /check-ins came back incomplete \(2338 of 2345\)/.test(await text()), (await text()).match(/incomplete[^.]*/)?.[0] || '');
  shortBy = 0;

  // A database that answers with nothing at all (signed out, access rules changed).
  await page.evaluate(() => window.__hpdFetchBrake.reset());
  db = { athletes: [], weigh_ins: [], lift_logs: [], performance_tests: [], programs: [], workout_sessions: [], alert_status: [] };
  await button.click(); await page.waitForTimeout(2500);
  check('an empty answer is not saved as a backup', downloads === 0 && /roster came back empty/.test(await text()));
  db = fresh();
  check('...and none of those failures counted as a backup', /today/.test(await page.getByTestId('full-backup-age').innerText()) === true && await page.evaluate(() => Date.now() - Number(localStorage.getItem('hpd_last_full_backup_at')) > 5000));

  // The brake: a fifth try inside a minute is skipped.
  await page.evaluate(() => window.__hpdFetchBrake.reset());
  for (let i = 0; i < 4; i++) { await Promise.all([page.waitForEvent('download', { timeout: 20000 }), button.click()]); await page.waitForTimeout(300); }
  downloads = 0; backupGets.length = 0;
  await button.click(); await page.waitForTimeout(1500);
  check('a fifth backup inside a minute is skipped (no requests)', downloads === 0 && backupGets.length === 0 && /Wait a minute/.test(await text()));

  await page.setViewportSize({ width: 768, height: 1024 }); await page.waitForTimeout(300);
  const box = await button.boundingBox();
  check('iPad portrait: the button is at least 44 px tall and on screen', !!box && box.height >= 44 && box.x >= 0 && box.x + box.width <= 768, JSON.stringify(box));
  await ctx.close();

  // iPad / iPhone: a download link can do nothing in a home-screen app, so the file goes
  // through the share sheet from a second tap, and counts only when the sheet says saved.
  const ipad = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1' });
  const p2 = await ipad.newPage();
  await stubAuth(p2);
  await route(p2);
  await p2.addInitScript(() => {
    window.__shares = []; window.__shareResult = 'cancel';
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = (d) => {
      window.__shares.push({ name: d.files[0].name, type: d.files[0].type, size: d.files[0].size });
      return window.__shareResult === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('cancelled', 'AbortError'));
    };
  });
  let ipadDownloads = 0; p2.on('download', () => { ipadDownloads++; });
  await p2.goto(`${APP}/#settings`); await p2.waitForTimeout(2500);
  const row2 = p2.getByTestId('full-backup'); const btn2 = row2.getByRole('button');
  await row2.scrollIntoViewIfNeeded();
  await btn2.click(); await p2.waitForTimeout(2500);
  check('iPad: first tap prepares the file and asks for a second tap', /SAVE BACKUP FILE/i.test(await btn2.innerText()) && /Backup ready: 2,358 records/.test(await p2.getByTestId('full-backup-age').innerText()) && await p2.evaluate(() => window.__shares.length) === 0 && ipadDownloads === 0, await p2.getByTestId('full-backup-age').innerText());
  await btn2.click(); await p2.waitForTimeout(500);
  check('iPad: share sheet cancelled = not saved, nothing recorded, still ready', await p2.evaluate(() => window.__shares.length === 1 && localStorage.getItem('hpd_last_full_backup_at') === null) && /SAVE BACKUP FILE/i.test(await btn2.innerText()) && /Not saved yet/.test(await p2.locator('body').innerText()));
  await p2.evaluate(() => { window.__shareResult = 'ok'; });
  await btn2.click(); await p2.waitForTimeout(500);
  const shared = await p2.evaluate(() => window.__shares[1]);
  check('iPad: saved through the share sheet as a .json file, then it counts', /^hpd-full-backup-\d{4}-\d{2}-\d{2}\.json$/.test(shared?.name || '') && shared.type === 'application/json' && shared.size > 100000 && /today/.test(await p2.getByTestId('full-backup-age').innerText()) && /DOWNLOAD FULL BACKUP/i.test(await btn2.innerText()) && /Backup saved: 2,358 records/.test(await p2.locator('body').innerText()), JSON.stringify(shared));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
