// Run with:  node tests/print-leaderboard.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.4.4: printable metric leaderboard (design handoff "HPD Metric Leaderboard").
// Top 10 on page 1, 22 per continuation page, every page exactly US Letter
// (816x1056) with no overflow; ranking/change/sparkline per the handoff; lower-is-
// better for sprint times; PDF prints only the sheets; PNG is 1632x2112 per page.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86400000;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const grades = ['12th', '11th', '10th', '9th'];
const athletes = Array.from({ length: 35 }, (_, i) => ({ id: uuid(i + 1), name: `Player ${String(i + 1).padStart(2, '0')}`, sport: 'Football', team: 'Varsity', position: ['OL', 'DL', 'LB', 'WR'][i % 4], grade: grades[i % 4] }));
athletes.push({ id: uuid(99), name: 'Vb Lifter', sport: 'Volleyball', position: '', grade: '10th' });
const days = [40, 25, 10, 2];
let n = 1000;
const lifts = [];
athletes.forEach((a, i) => days.forEach((d, j) => {
  if (i === 34 && j < 3) return; // one athlete tested once -> change "—"
  // Player 01 strongest (rank 1); Player 02 regresses (red change)
  const base = 400 - i * 5, w = i === 1 ? base + 30 - j * 10 : base + j * 5;
  lifts.push({ id: uuid(n++), athlete_id: a.id, athlete_name: a.name, lift_type: 'Squat', weight_lbs: w, reps: 1, created_at: new Date(Date.now() - d * DAY).toISOString() });
}));
const tests = [
  { id: uuid(5000), athlete_id: uuid(1), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.40, unit: 'sec', created_at: new Date(Date.now() - 20 * DAY).toISOString() },
  { id: uuid(5001), athlete_id: uuid(1), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.30, unit: 'sec', created_at: new Date(Date.now() - 5 * DAY).toISOString() },
  { id: uuid(5002), athlete_id: uuid(2), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.22, unit: 'sec', created_at: new Date(Date.now() - 5 * DAY).toISOString() },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, enableSpeedPower: true, liftTypes: ['Squat', 'Bench'], seasonStartDate: '2026-01-01' })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/lift_logs')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(lifts) });
    if (url.includes('/rest/v1/performance_tests')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(tests) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Opens from the Lift Tracker leaderboard');
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /LEADERBOARD/ }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Printable leaderboard/i }).click(); await page.waitForTimeout(1500);
  const dlg = page.getByRole('dialog', { name: 'Printable leaderboard' });
  check('print view opens', await dlg.count() === 1);
  await page.locator('#lb-team').selectOption('Football'); await page.waitForTimeout(400);
  const pages = dlg.getByTestId('lb-page');
  check('35 athletes -> 3 pages (10 + 22 + 3)', await pages.count() === 3, String(await pages.count()));
  const sizes = await pages.evaluateAll(ps => ps.map(p => [p.offsetWidth, p.offsetHeight, p.scrollHeight <= p.offsetHeight]));
  check('every page is exactly 816x1056 with no overflow', sizes.every(([w, h, ok]) => w === 816 && h === 1056 && ok), JSON.stringify(sizes));
  const counts = await pages.evaluateAll(ps => ps.map(p => p.querySelectorAll('[data-testid="lb-row"]').length));
  check('rows per page 10 / 22 / 3', JSON.stringify(counts) === '[10,22,3]', JSON.stringify(counts));

  console.log('\n[B] Ranking, change and labels');
  const p1 = await pages.nth(0).innerText();
  check('title + subline', /SQUAT/.test(p1) && /Football · Best Est\. 1RM \(lb\) · .* · 35 athletes tested/.test(p1), p1.slice(0, 200));
  const rows = pages.nth(0).getByTestId('lb-row');
  // Player 02's best (425, first test) beats Player 01's (415) even though Player 02 has
  // declined since: rank is by best in the period, change is latest vs first.
  const r1 = await rows.nth(0).innerText();
  const r2 = await rows.nth(1).innerText();
  check('rank 1 = best result in period (Player 02, 425)', /Player 02/.test(r1) && /425/.test(r1), r1);
  check('decline shown with a real minus sign (−30)', /−30/.test(r1), r1);
  check('rank 2 Player 01 415, improvement +15', /Player 01/.test(r2) && /415/.test(r2) && /\+15/.test(r2), r2);
  check('position + class year (OL, Class of 2027 for a senior)', /OL/.test(r2) && /2027/.test(r2), r2);
  const colors = await rows.evaluateAll(rs => rs.slice(0, 2).map(r => getComputedStyle(r.querySelector('[data-testid="lb-change-first"]')).color));
  check('decline and improvement in different colors (red / green)', colors[0] !== colors[1] && colors.every(Boolean), JSON.stringify(colors));
  const podium = await rows.evaluateAll(rs => rs.slice(0, 4).map(r => getComputedStyle(r.querySelector('span')).borderRadius));
  check('ranks 1-3 get gold circles, rank 4 does not', podium.slice(0, 3).every(b => b === '50%') && podium[3] !== '50%', JSON.stringify(podium));
  const p3 = await pages.nth(2).innerText();
  check('continuation header "Ranks 33–35 · Page 3 of 3"', /RANKS 33–35/i.test(p3) && /PAGE 3 OF 3/i.test(p3), p3.slice(0, 160));
  check('single-test athlete shows "—"', /Player 35[\s\S]*—/.test(p3), p3.slice(-200));
  check('other teams excluded', !/Vb Lifter/.test(await dlg.innerText()));

  console.log('\n[C] Top 10 only');
  await page.locator('#lb-scope').selectOption('top'); await page.waitForTimeout(300);
  check('one page', await pages.count() === 1);
  await page.locator('#lb-scope').selectOption('full');

  console.log('\n[D] Sprint metric: lower is better');
  await page.locator('#lb-metric').selectOption({ label: '10yd Fly' }); await page.waitForTimeout(400);
  const f = await pages.nth(0).getByTestId('lb-row').allInnerTexts();
  check('fastest (1.22) ranked first', /Player 02/.test(f[0]) && /1\.22/.test(f[0]), JSON.stringify(f));
  check('a faster time counts as improvement (−0.10)', /−0\.10/.test(f[1]), f[1]);

  console.log('\n[D1] Initial & best dates');
  const ini = await pages.nth(0).getByTestId('lb-initial').allInnerTexts();
  check('Player 01 initial 1.40 with its date', /1\.40\s*\n?\s*\d{1,2}\/\d{1,2}/.test(ini[1] || ''), JSON.stringify(ini));
  const rec = await pages.nth(0).getByTestId('lb-recent').allInnerTexts();
  check('Player 01 most recent 1.30 with its date', /1\.30\s*\n?\s*\d{1,2}\/\d{1,2}/.test(rec[1] || ''), JSON.stringify(rec));
  check('best date shown', await pages.nth(0).getByTestId('lb-best-date').count() >= 2);
  check('headers read Initial (date) / Best (date)', /INITIAL \(DATE\)/i.test(await pages.nth(0).innerText()) && /BEST \(DATE\)/i.test(await pages.nth(0).innerText()));
  await pages.nth(0).screenshot({ path: '/tmp/claude-0/-home-user-MoneyMase/9587e7dc-3753-5d82-8e64-81fff61e380c/scratchpad/lb_initial.png' });

  console.log('\n[D2] Column toggles');
  await page.getByTestId('lb-col-week').click(); await page.waitForTimeout(300);
  const wk = await pages.nth(0).getByTestId('lb-change-week').allInnerTexts();
  check('last week vs now: 1.40 (20d ago) -> 1.30 = −0.10; single result = —', wk[1] === '−0.10' && wk[0] === '—', JSON.stringify(wk));
  check('both change headers shown', /VS 1ST/i.test(await pages.nth(0).innerText()) && /VS LAST WK/i.test(await pages.nth(0).innerText()));
  await page.getByTestId('lb-col-first').click(); await page.getByTestId('lb-col-pos').click(); await page.getByTestId('lb-col-cls').click(); await page.waitForTimeout(300);
  const hdr = await pages.nth(0).innerText();
  check('pos/class/1st hidden when toggled off', !/\bPOS\b/.test(hdr) && !/\bCLASS\b/.test(hdr) && await pages.nth(0).getByTestId('lb-change-first').count() === 0, hdr.slice(0, 300));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_lb_columns') || '{}'));
  check('toggles remembered on this device', saved.week === true && saved.pos === false && saved.first === false, JSON.stringify(saved));
  for (const k of ['week', 'first', 'pos', 'cls']) await page.getByTestId(`lb-col-${k}`).click();
  await page.waitForTimeout(300);

  console.log('\n[E] PDF: print shows only the sheets, on Letter');
  await page.locator('#lb-metric').selectOption({ label: 'Squat' }); await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' });
  const vis = await page.evaluate(() => ({ app: [...document.body.children].filter(c => !c.classList.contains('lb-print-root') && getComputedStyle(c).display !== 'none' && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE').length, controls: getComputedStyle(document.querySelector('.lb-controls')).display }));
  check('app and controls hidden when printing', vis.app === 0 && vis.controls === 'none', JSON.stringify(vis));
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF has 3 pages', pdfPages === 3, String(pdfPages));
  const mb = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  check('PDF pages are US Letter (612x792 pt)', mb && Math.round(+mb[1]) === 612 && Math.round(+mb[2]) === 792, mb && mb[0]);
  await page.emulateMedia({ media: 'screen' });

  console.log('\n[F] PNG export');
  const downloads = [];
  page.on('download', d => downloads.push(d));
  await dlg.getByRole('button', { name: /^PNG$/ }).click();
  for (let i = 0; i < 40 && downloads.length < 3; i++) await page.waitForTimeout(500);
  check('one PNG per page', downloads.length === 3, String(downloads.length));
  if (downloads[0]) {
    const buf = await (await import('fs')).promises.readFile(await downloads[0].path());
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    check('PNG is 1632x2112 (2x Letter)', w === 1632 && h === 2112, `${w}x${h}`);
    check('file name names metric and team', /Leaderboard_Squat_Football/.test(downloads[0].suggestedFilename()), downloads[0].suggestedFilename());
    await (await import('fs')).promises.writeFile('/tmp/claude-0/-home-user-MoneyMase/9587e7dc-3753-5d82-8e64-81fff61e380c/scratchpad/lb_p1.png', buf);
  }

  console.log('\n[G] Also opens from Jumps & Sprints');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(`${APP}/#power`); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Printable leaderboard/i }).click(); await page.waitForTimeout(1200);
  check('opens on the jump/sprint metric', /10YD FLY/i.test(await page.getByTestId('lb-page').first().innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
