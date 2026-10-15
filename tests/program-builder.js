// Run with:  node tests/program-builder.js   (preview on :4173; Supabase stubbed)
// v5.7.0 Program Builder + Weight Room Card (docs/HANDOFF.md §120).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [
  { id: uuid(1), name: 'Caleb Osmon', sport: 'Football', position: 'LB' },
  { id: uuid(2), name: 'Luke Farver', sport: 'Football', position: 'WR' },
  { id: uuid(3), name: 'Vb Val', sport: 'Volleyball' },
];
const L = (a, lt, w, r) => ({ id: uuid(Math.floor(Math.random() * 1e9)), athlete_id: a, lift_type: lt, weight_lbs: w, reps: r, created_at: new Date(Date.now() - 86400000 * 3).toISOString() });
const old = { id: uuid(777), athlete_id: uuid(1), lift_type: 'Bench', weight_lbs: 300, reps: 1, created_at: new Date(Date.now() - 86400000 * 100).toISOString() };
const lifts = [old, L(uuid(1), 'Hang Clean', 205, 1), L(uuid(1), 'Bench', 226, 1), L(uuid(1), 'Front Squat', 335, 1), L(uuid(1), 'Deadlift', 405, 1), L(uuid(2), 'Bench', 185, 1)];
const SEED = { enableLiftTracker: true, liftTypes: ['Front Squat', 'Bench', 'Hang Clean', 'Deadlift'] };

async function run(cloud) {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 1000 } })).newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  const upserts = []; const selects = []; const server = new Map();
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(lifts) });
    if (url.includes('/rest/v1/programs')) {
      if (!cloud) return route.fulfill({ status: 404, headers: hdrs, body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.programs' in the schema cache" }) });
      if (method === 'POST') { const body = JSON.parse(req.postData()); upserts.push(body); [].concat(body).forEach(r => server.set(r.id, r)); return route.fulfill({ status: 201, headers: hdrs, body: '[]' }); }
      if (method === 'DELETE') return route.fulfill({ status: 204, headers: hdrs, body: '' });
      const u = new URL(url); const sel = u.searchParams.get('select') || ''; selects.push(sel);
      const idEq = u.searchParams.get('id');
      if (idEq) { const r = server.get(idEq.replace('eq.', '')); return route.fulfill({ status: 200, headers: { ...hdrs, 'content-range': '0-0/1' }, body: JSON.stringify(r || null) }); }
      return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([...server.values()].map(r => Object.fromEntries(sel.split(',').map(k => [k, r[k] ?? null])))) });
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  await page.goto(`${APP}/#programs`); await page.waitForTimeout(2000);
  const tag = cloud ? '[cloud]' : '[local]';
  check(`${tag} Programs screen loads`, /PROGRAM BUILDER/i.test(await page.locator('main').innerText()));
  check(`${tag} device-only banner ${cloud ? 'hidden' : 'shown'}`, (await page.getByTestId('pb-local').count()) === (cloud ? 0 : 1));
  await page.getByTestId('pb-sample').click(); await page.waitForTimeout(300);
  check(`${tag} sample: 2 days with exercises`, await page.getByTestId('pb-day').count() === 2 && await page.getByTestId('pb-block').count() >= 10);
  check(`${tag} maxes default to the app's lifts`, (await page.getByTestId('pb-max-squat').inputValue()) === 'Front Squat' && (await page.getByTestId('pb-max-clean').inputValue()) === 'Hang Clean');
  await page.getByTestId('pb-add-day').click();
  check(`${tag} add day -> 3`, await page.getByTestId('pb-day').count() === 3);
  const day3 = page.getByTestId('pb-day').nth(2);
  await day3.getByLabel('Day 3 focus').fill('Lower Strength');
  await day3.getByLabel('Exercise name').first().fill('Front Squat');
  await day3.getByLabel('Percent of which max').first().selectOption('squat');
  await day3.getByTestId('pb-mode-sets').first().click();
  await day3.getByLabel('Set 1 percent').fill('80');
  await day3.getByTestId('pb-add-set').first().click();
  check(`${tag} set-by-set rows`, await day3.getByTestId('pb-set').count() === 2);
  await page.getByTestId('pb-save').click(); await page.waitForTimeout(500);
  check(`${tag} saved + listed`, await page.getByTestId('pb-item').count() === 1);
  if (cloud) check('[cloud] save upserts to programs', upserts.length >= 1 && (upserts.flat()[0].days || []).length === 3, JSON.stringify(upserts).slice(0, 120));
  else check('[local] saved in localStorage', JSON.parse(await page.evaluate(() => localStorage.getItem('hpd_programs')))[0].days.length === 3);
  if (cloud) {
    check('[cloud] nothing stored on the device', await page.evaluate(() => localStorage.getItem('hpd_programs')) === null);
    check('[cloud] list loads summary columns only (no days)', selects.length > 0 && selects.every(x => x === '*' || !/days/.test(x)) && selects.some(x => /^id,name/.test(x)), JSON.stringify(selects));
    await page.reload(); await page.waitForTimeout(2000);
    check('[cloud] list after reload comes from the server', await page.getByTestId('pb-item').count() === 1);
    await page.getByTestId('pb-item').first().click(); await page.waitForTimeout(600);
    check('[cloud] opening loads the full program', await page.getByTestId('pb-day').count() === 3);
  }
  await page.getByTestId('pb-search').fill('zzz');
  check(`${tag} search filters the list`, await page.getByTestId('pb-item').count() === 0);
  await page.getByTestId('pb-search').fill('sample');
  check(`${tag} search finds by name`, await page.getByTestId('pb-item').count() === 1);
  await page.getByTestId('pb-search').fill('');
  await page.getByTestId('pb-print').click(); await page.waitForTimeout(800);
  await page.getByTestId('wr-who').selectOption('sport:Football'); await page.waitForTimeout(400);
  const cards = page.getByTestId('wr-card');
  check(`${tag} one card per Football athlete`, await cards.count() === 2);
  const c1 = cards.first();
  const t1 = await c1.innerText();
  check(`${tag} header: week · phase · 3-Day, name, maxes`, /WEEK 3 · STRENGTH \+ POWER · 3-DAY/i.test(t1) && /Caleb Osmon/i.test(t1), t1.slice(0, 160));
  let maxes = await c1.getByTestId('wr-max').allInnerTexts();
  check(`${tag} all-time window uses the 100-day-old 300 bench`, /BENCH 300/.test(maxes.join('|').replace(/\n/g, ' ')), JSON.stringify(maxes));
  await page.getByTestId('wr-window').selectOption('6w'); await page.waitForTimeout(300);
  maxes = await c1.getByTestId('wr-max').allInnerTexts();
  check(`${tag} 6-week window -> recent maxes only`, maxes.join('|').replace(/\n/g, ' ') === 'CLEAN 205|BENCH 226|SQUAT 335|TBDL 405', JSON.stringify(maxes));
  check(`${tag} footer names the window`, /Maxes: last 6 weeks/i.test(await c1.innerText()));
  const wts = await c1.getByTestId('wr-wt').allInnerTexts();
  // Hang clean 205 x 65/70/75/75% -> 135/145/155/155; squat 335 x 70% -> 235; bench 226 x 70% -> 160
  check(`${tag} working weights = max(45, round5(max x %))`, wts.slice(0, 4).join(',') === '135,145,155,155' && wts.includes('235') && wts.includes('160'), wts.filter(Boolean).join(','));
  check(`${tag} day 3 front squat 80% of 335 -> 270`, wts.includes('270'));
  const t2 = await cards.nth(1).innerText();
  check(`${tag} athlete with no clean max -> blank WT, dash in strip`, /Luke Farver/i.test(t2) && /CLEAN\s*—/.test(t2));
  check(`${tag} 3 days -> compact layout (3 columns)`, await c1.getByTestId('wr-day').count() === 3);
  await page.getByTestId('wr-edit-maxes').click();
  check(`${tag} max editor shows Lift Tracker max as placeholder`, (await page.getByLabel('Caleb Osmon Bench max').getAttribute('placeholder')) === '226');
  await page.getByLabel('Caleb Osmon Bench max').fill('250');
  await page.getByLabel('Luke Farver Clean max').fill('180');
  await page.getByTestId('wr-edit-maxes').click(); await page.waitForTimeout(400);
  const ovMax = (await c1.getByTestId('wr-max').allInnerTexts()).join('|').replace(/\n/g, ' ');
  check(`${tag} override replaces the max, marked with *`, /BENCH 250\*/.test(ovMax) && /entered by staff/.test(await c1.innerText()), ovMax);
  const ovWt = await c1.getByTestId('wr-wt').allInnerTexts();
  check(`${tag} bench 70% of 250 -> 175`, ovWt.includes('175'), ovWt.filter(Boolean).join(','));
  check(`${tag} override for an athlete with no logs fills their card`, /CLEAN\s*180\*/.test(await cards.nth(1).innerText()));
  if (cloud) check('[cloud] overrides + window saved with the program', upserts.some(u => [].concat(u).some(r => r.max_map?.window === '6w' && r.max_map?.overrides?.[athletes[0].id]?.bench === '250')));
  await page.getByTestId('wr-toggle-vel').click();
  check(`${tag} velocity toggle`, !/Target .* m\/s/.test(await c1.innerText()));
  await page.emulateMedia({ media: 'print' });
  check(`${tag} print shows only the cards`, await page.locator('.wr-print-root').isVisible() && !(await page.locator('#root').isVisible()));
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const mb = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/);
  check(`${tag} PDF: 2 landscape Letter pages`, pages === 2 && mb && Math.round(+mb[1]) === 792 && Math.round(+mb[2]) === 612, `${pages} ${mb && mb[0]}`);
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.getByTestId('pb-archive').click(); await page.waitForTimeout(400);
  check(`${tag} archive hides it from the list`, await page.getByTestId('pb-item').count() === 0 && await page.getByTestId('pb-show-archived').count() === 1);
  await page.getByTestId('pb-show-archived').click();
  check(`${tag} archived view lists it`, await page.getByTestId('pb-item').count() === 1);
  await browser.close();
}
(async () => { await run(false); await run(true); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); })();
