// Run with:  node tests/body-weight-report.js   (preview on :4173; Supabase stubbed)
// v5.9.0 Body Weight report (docs/HANDOFF.md §133): 7 / 14 / 28-day periods, start /
// latest / change / vs baseline per athlete, not-weighed-in list, two CSV downloads, print.
import fs from 'fs';
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (d) => new Date(Date.now() - d * 86400000 - 60000).toISOString();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const athletes = [
  { id: uuid(1), name: 'Down Dan', sport: 'Football', position: 'WR' },
  { id: uuid(2), name: 'Gain Gus', sport: 'Football', position: 'OL' },
  { id: uuid(3), name: 'Once Ollie', sport: 'Football', position: 'QB' },
  { id: uuid(4), name: 'Old Owen', sport: 'Football', position: 'LB' },
  { id: uuid(5), name: 'Never Ned', sport: 'Football', position: 'DB' },
  { id: uuid(6), name: 'Vb Val', sport: 'Volleyball' },
];
let n = 100;
const logs = [];
const wi = (a, d, w, extra = {}) => logs.push({ id: uuid(n++), athlete_id: uuid(a), sport: 'Football', weight_lbs: w, sleep_hrs: 0, created_at: ago(d), is_baseline: false, ...extra });
wi(1, 25, 200, { is_baseline: true }); wi(1, 10, 199); wi(1, 5, 197); wi(1, 1, 195);
wi(1, 0.9, 192, { session_type: 'post_practice' });          // post-practice: CSV only
wi(2, 25, 180, { is_baseline: true }); wi(2, 3, 182); wi(2, 0, 184);
logs.push({ id: uuid(n++), athlete_id: uuid(2), sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: 7, session_minutes: 60, session_label: 'Lift', session_type: 'rpe', created_at: ago(1) });
wi(3, 25, 210, { is_baseline: true }); wi(3, 2, 209);
wi(4, 25, 190, { is_baseline: true }); wi(4, 12, 189);
wi(6, 2, 150);
const SEED = { dehydrationThreshold: 2, dataWindowDays: 30 };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify(s)); } }, SEED);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') {
      // The live sync gets everything; the separate older-history request gets nothing extra.
      const body = url.includes('created_at=lt.') ? '[]' : JSON.stringify(logs);
      return route.fulfill({ status: 200, headers: { ...h, 'content-range': `*/${logs.length}`, 'access-control-expose-headers': 'content-range' }, body });
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  await page.goto(`${APP}/#reports`); await page.waitForTimeout(2500);
  await page.getByTestId('bw-open').click(); await page.waitForTimeout(1200);
  const doc = page.getByTestId('body-weight-report');
  check('opens from the Reports tab', await doc.count() === 1);
  check('opens on the Reports sport (All sports)', (await page.locator('#bw-team').inputValue()) === 'ALL');
  check('All sports: sport under each name + volleyball athlete', (await page.getByTestId('bw-who').allInnerTexts()).some(t => /^Football · WR$/.test(t)) && /Vb Val/.test(await doc.innerText()));
  await page.locator('#bw-team').selectOption('Football'); await page.waitForTimeout(200);
  if ((await page.getByTestId('bw-period-7').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('bw-period-7').click();
  await page.waitForTimeout(200);

  const rows = async () => page.getByTestId('bw-row').allInnerTexts();
  const row = async (nm) => (await rows()).find(r => r.includes(nm)) || '';
  const missing = async () => page.getByTestId('bw-missing-name').allInnerTexts();
  let r = await rows();
  check('7 days: Dan, Gus, Ollie weighed in (volleyball, Owen, Ned not)', r.length === 3 && !/Vb Val|Old Owen|Never Ned/.test(r.join('|')), JSON.stringify(r));
  check('one team: position only under the name', (await page.getByTestId('bw-who').allInnerTexts()).includes('WR'));
  const dan = await row('Down Dan');
  check('Dan: baseline 200.0, start 197.0, latest 195.0', /200\.0 lb/.test(dan) && /197\.0 lb/.test(dan) && /195\.0 lb/.test(dan), dan);
  check('Dan: change −2.0 lb, vs baseline −5.0 lb', /−2\.0 lb/.test(dan) && /−5\.0 lb/.test(dan), dan);
  check('post-practice weigh-in left out of the table', !/192\.0/.test(dan), dan);
  check('Gus: change +2.0, vs baseline +4.0 (RPE row ignored)', /\+2\.0 lb/.test(await row('Gain Gus')) && /\+4\.0 lb/.test(await row('Gain Gus')), await row('Gain Gus'));
  check('Ollie: one weigh-in -> no change, count 1', /—/.test(await row('Once Ollie')) && /\b1\b/.test(await row('Once Ollie')), await row('Once Ollie'));
  check('trend line per athlete', await page.getByTestId('bw-trend').count() === 3);
  check('pill: 1 more than 2 lb below baseline', /1 more than 2 lb below baseline/i.test(await page.getByTestId('bw-pill-below').innerText()), await page.getByTestId('bw-pill-below').innerText());
  const m7 = await missing();
  check('not weighed in: Owen (12d) and Ned (never)', m7.length === 2 && m7.some(x => /Old Owen.*12d/.test(x)) && m7.some(x => /Never Ned.*never/.test(x)), JSON.stringify(m7));
  check('subline: last 7 days, 3 of 5 weighed in', /Last 7 days/.test(await page.getByTestId('bw-subline').innerText()) && /3 of 5/.test(await page.getByTestId('bw-subline').innerText()), await page.getByTestId('bw-subline').innerText());

  await page.getByTestId('bw-period-14').click(); await page.waitForTimeout(200);
  r = await rows();
  check('14 days: Owen appears, only Ned missing', r.some(x => /Old Owen/.test(x)) && (await missing()).length === 1, JSON.stringify(await missing()));
  check('14 days: Dan start 199.0, change −4.0 lb in red', /199\.0 lb/.test(await row('Down Dan')) && /−4\.0 lb/.test(await row('Down Dan')), await row('Down Dan'));
  await page.getByTestId('bw-period-28').click(); await page.waitForTimeout(200);
  check('28 days: Dan start 200.0, change −5.0 lb', /−5\.0 lb[\s\S]*−5\.0 lb/.test(await row('Down Dan')), await row('Down Dan'));
  check('period remembered', (await page.evaluate(() => localStorage.getItem('hpd_bw_period'))) === '28');
  await page.locator('#bw-sort').selectOption('change'); await page.waitForTimeout(200);
  check('sort by biggest loss: Dan first', /Down Dan/.test((await rows())[0] || ''), (await rows())[0]);
  await page.locator('#bw-sort').selectOption('base'); await page.waitForTimeout(200);
  check('sort by furthest below baseline: Dan first, Gus last', /Down Dan/.test((await rows())[0]) && /Gain Gus/.test((await rows()).slice(-1)[0]), JSON.stringify((await rows()).map(x => x.split('\n')[0])));

  const grab = async (id) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(id).click()]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };
  const sum = await grab('bw-csv-summary');
  const sLines = sum.text.split('\n');
  check('summary CSV: file name names team + period', /^body-weight-summary-football-last-28-days-\d{4}-\d{2}-\d{2}\.csv$/.test(sum.name), sum.name);
  check('summary CSV: header + 5 athletes (Ned with 0 weigh-ins)', /^Athlete,Sport,Pos,Baseline lb,Start lb/.test(sLines[0]) && sLines.length === 6 && sLines.some(l => /^Never Ned,Football,,.*,0,Last 28 days/.test(l)), sum.text);
  check('summary CSV: Dan 200.0 -> 195.0, -5.0 lb vs baseline', sLines.some(l => /^Down Dan,Football,WR,200\.0,200\.0,.*195\.0,.*-5\.0,-2\.5,-5\.0,-2\.5/.test(l)), sLines.find(l => /Down Dan/.test(l)));
  const wcsv = await grab('bw-csv-weighins');
  const wLines = wcsv.text.split('\n');
  check('weigh-ins CSV: every weigh-in in 28 days incl. post-practice, no RPE rows', /^Date,Time,Athlete,Sport,Pos,Weight lb,Type/.test(wLines[0]) && wLines.some(l => /Down Dan.*192\.0,Post-practice/.test(l)) && !wLines.some(l => /,0\.0,(Weigh-in|Post-practice),/.test(l)) && wLines.length - 1 === 12, `${wLines.length - 1} rows`);
  check('weigh-ins CSV: vs baseline per row', wLines.some(l => /Down Dan,Football,WR,195\.0,Weigh-in,200\.0,-5\.0,-2\.5/.test(l)), wLines.filter(l => /Down Dan/.test(l)).join(' | '));

  await page.emulateMedia({ media: 'print' });
  check('print shows only the report', await page.locator('.bw-print-root').isVisible() && !(await page.locator('#root').isVisible()));
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape closes it', await doc.count() === 0);

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  await page.getByTestId('bw-open').click(); await page.waitForTimeout(800);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone width: no sideways page scroll with the report open', sideways <= 0, `${sideways}px`);

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
