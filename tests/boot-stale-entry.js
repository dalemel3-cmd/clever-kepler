// Run with: node tests/boot-stale-entry.js  (preview on :4173)
// v5.4.10: if the entry script 404s (stale cached index.html after a deploy), the page
// clears caches and reloads once by itself, and doesn't loop if it fails again.
import { chromium } from 'playwright';
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? ` -> ${d}` : ''}`); } };
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const failures of [1, 99]) {
    const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
    let n = 0, loads = 0;
    page.on('load', () => loads++);
    await page.route(/\/assets\/index-[^/]+\.js$/, r => (n++ < failures ? r.fulfill({ status: 404, body: '' }) : r.continue()));
    await page.goto(APP); await page.waitForTimeout(4000);
    const booting = await page.locator('#hpd-boot').count();
    if (failures === 1) check('one failed entry load -> auto reload -> app mounts', loads >= 2 && booting === 0, `loads=${loads} boot=${booting}`);
    else check('keeps failing -> reloads only once (no loop)', loads === 2, `loads=${loads}`);
    await page.context().close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
