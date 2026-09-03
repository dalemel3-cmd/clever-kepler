// Run with:  node tests/plyomat-ui.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// The logic is unit-tested in tests/plyomat-import.js. What this suite proves is the
// part that only exists in the browser: picking a file produces a REVIEWABLE PREVIEW and
// writes nothing, and the write only happens on an explicit confirm.
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

// One athlete on the roster, one not, one ambiguous sibling surname, one coach.
const athletes = [
  { id: uuid(1), name: 'ALEKSANDR KELLEY', sport: 'Football', team: 'Varsity', grade: '', position: 'WR' },
  { id: uuid(2), name: 'JAKE BODENSTEIN', sport: 'Football', team: 'Varsity', grade: '', position: 'OL' },
];

const CSV = [
  'Captured At (ISO),Captured At (Local),Athlete First Name,Athlete Last Name,Athlete Groups,Protocol,Primary Metric,Best,Best of Kept,Session ID',
  '2026-09-01T20:00:00Z,"9/1/26, 3:00 PM",ALEKSANDR,KELLEY,Football SH,Standing Vertical Jump,Jump Height,25.31 in,25.31 in,s1',
  '2026-09-01T20:01:00Z,"9/1/26, 3:01 PM",Brand,New,Junior / WSOC,Standing Vertical Jump,Jump Height,20.00 in,20.00 in,s2',
  '2026-09-01T20:02:00Z,"9/1/26, 3:02 PM",Mason,Melancon,Coaches,Load Power Profile,PPS,127.7 ft·lb,127.7 ft·lb,s3',
  '2026-09-01T20:03:00Z,"9/1/26, 3:03 PM",Rylee,Bodenstein,Football SH,Standing Vertical Jump,Jump Height,22.00 in,22.00 in,s4',
].join('\n');

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  const writes = { athletes: [], tests: [] };
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableSpeedPower: true });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes')) {
      if (method === 'POST') {
        const body = req.postDataJSON();
        const arr = Array.isArray(body) ? body : [body];
        writes.athletes.push(...arr);
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify(arr.map((a, i) => ({ ...a, id: uuid(500 + i) }))) });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    }
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/performance_tests')) {
      if (method === 'POST') {
        const body = req.postDataJSON();
        const arr = Array.isArray(body) ? body : [body];
        writes.tests.push(...arr);
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify(arr.map((t, i) => ({ ...t, id: uuid(600 + i) }))) });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  await page.goto(`${APP}/#analytics`);
  await page.waitForTimeout(2500);

  console.log('\n[A] The import panel is on the Analytics screen');
  let body = await page.locator('body').innerText();
  check('panel renders', /IMPORT JUMP RESULTS FROM A CSV/i.test(body), body.slice(0, 120));
  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n[B] Picking a file previews the plan and writes NOTHING');
  await page.setInputFiles('#plyomat-file', { name: 'plyomat.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
  await page.waitForTimeout(700);
  body = await page.locator('body').innerText();
  check('preview appeared', /WILL IMPORT/i.test(body), body.slice(0, 200));
  check('nothing was written to performance_tests yet', writes.tests.length === 0, `${writes.tests.length} writes`);
  check('nothing was written to athletes yet', writes.athletes.length === 0, `${writes.athletes.length} writes`);
  check('the unimportable rows are surfaced, not hidden', /will not be imported/i.test(body));
  check('the ambiguous name is raised for a decision', /Same person, or different\?/i.test(body));
  check('...naming the roster athlete it resembles', /JAKE BODENSTEIN/.test(body));
  check('new-athlete creation is disclosed up front', /will be added to the roster/i.test(body));

  console.log('\n[C] Confirming writes - and only what the preview promised');
  await page.getByRole('button', { name: /^IMPORT \d+ RESULTS?$/i }).click();
  await page.waitForTimeout(1200);
  check('performance_tests received the import', writes.tests.length === 2, `wrote ${writes.tests.length}, expected 2 (roster hit + created athlete)`);
  check('the coach row never reached the database', !writes.tests.some(t => /melancon/i.test(t.athlete_name || '')));
  check('the ambiguous row was NOT imported (left undecided)', !writes.tests.some(t => /rylee/i.test(t.athlete_name || '')));
  check('one athlete was created', writes.athletes.length === 1, JSON.stringify(writes.athletes));
  check('...with the sport parsed from its Plyomat group', writes.athletes[0] && writes.athletes[0].sport === 'WSOC', JSON.stringify(writes.athletes[0]));
  check('...and the graduating class too', writes.athletes[0] && writes.athletes[0].grade === '11th', JSON.stringify(writes.athletes[0]));
  check('rows carry source=plyomat', writes.tests.every(t => t.source === 'plyomat'), JSON.stringify(writes.tests[0]));
  check('rows carry the session id for dedupe', writes.tests.every(t => String(t.notes || '').startsWith('plyomat:')), JSON.stringify(writes.tests[0]));
  check('the captured date is kept, not overwritten with today',
    writes.tests.some(t => String(t.created_at).startsWith('2026-09-01')), JSON.stringify(writes.tests.map(t => t.created_at)));
  check('success is reported back to the coach', /Imported 2 results/i.test(await page.locator('body').innerText()));
  check('no page errors through the whole flow', errors.length === 0, errors.join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
