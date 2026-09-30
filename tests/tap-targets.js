// Run with:  node tests/tap-targets.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.4 (Fitts's law): on touch screens every button, tab, select and text input on
// the main screens (and the Lift Kiosk) is at least 44x44 px. Desktop (fine pointer)
// is left exactly as designed.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const APP='http://127.0.0.1:4173'; const SUPA='**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const athletes=[{id:uuid(1),name:'Ann Adams',sport:'Football'},{id:uuid(2),name:'Ben Brown',sport:'Football'}];
const lifts=[{id:uuid(9),athlete_id:uuid(1),lift_type:'Bench',weight_lbs:200,reps:3,created_at:new Date().toISOString()}];
const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
let pass=0,fail=0;const check=(n,ok,d='')=>{if(ok){pass++;console.log(`  PASS  ${n}`);}else{fail++;console.log(`  FAIL  ${n}${d?` -> ${d}`:''}`);}};
const page=await (await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'})).newPage();
await stubAuth(page);
await page.addInitScript(()=>localStorage.setItem('hpd_settings',JSON.stringify({enableLiftTracker:true,enableRpe:true,enableSpeedPower:true})));
await page.route(SUPA,async r=>{const u=r.request().url(),m=r.request().method();const h={'access-control-allow-origin':'*','content-type':'application/json'};
 if(m==='OPTIONS')return r.fulfill({status:200,headers:{...h,'access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 if(u.includes('/realtime/'))return r.abort(); if(isAuthRoute(u))return fulfillAuth(r,u,h);
 if(u.includes('/coaches'))return r.fulfill({status:200,headers:h,body:JSON.stringify([{approved:true}])});
 if(u.includes('/athletes'))return r.fulfill({status:200,headers:h,body:JSON.stringify(athletes)});
 if(u.includes('/lift_logs'))return r.fulfill({status:200,headers:h,body:JSON.stringify(lifts)});
 return r.fulfill({status:200,headers:h,body:'[]'});});
const small=async(screen)=>page.evaluate((screen)=>{const out=[];for(const el of document.querySelectorAll('button,a[href],input,select,[role=tab]')){const r=el.getBoundingClientRect();const st=getComputedStyle(el);if(!r.width||!r.height||st.visibility==='hidden'||el.type==='hidden')continue;if(r.bottom<0||r.top>window.innerHeight*3)continue;if(r.width<44||r.height<44){const lbl=(el.getAttribute('aria-label')||el.innerText||el.placeholder||el.name||el.type||'').trim().replace(/\s+/g,' ').slice(0,40);out.push(`${screen}\t${el.tagName.toLowerCase()}\t${Math.round(r.width)}x${Math.round(r.height)}\t${lbl}`);}}return out;},screen);
const res=[];
for(const s of ['dashboard','alerts','entry','lifts','groups','athletes','analytics','rpe','strength','power','reports','settings']){await page.goto(`${APP}/#${s}`);await page.waitForTimeout(1500);res.push(...await small(s));}
// kiosk + lift kiosk
await page.goto(`${APP}/#lifts`);await page.waitForTimeout(1200);
const lk=page.getByRole('button',{name:'Activate Lift Kiosk Mode'}); if(await lk.count()){await lk.click();await page.waitForTimeout(1200);res.push(...await small('lift-kiosk'));}
check('touch: no control under 44x44 on any main screen or the Lift Kiosk', res.length===0, '\n'+res.join('\n'));
// Desktop: the touch rule must not apply.
const d=await (await b.newContext({viewport:{width:1280,height:860},serviceWorkers:'block'})).newPage();
await stubAuth(d);
await d.route(SUPA,async r=>{const u=r.request().url(),m=r.request().method();const h={'access-control-allow-origin':'*','content-type':'application/json'};
 if(m==='OPTIONS')return r.fulfill({status:200,headers:{...h,'access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 if(u.includes('/realtime/'))return r.abort(); if(isAuthRoute(u))return fulfillAuth(r,u,h);
 if(u.includes('/coaches'))return r.fulfill({status:200,headers:h,body:JSON.stringify([{approved:true}])});
 return r.fulfill({status:200,headers:h,body:'[]'});});
await d.goto(`${APP}/#dashboard`);await d.waitForTimeout(1500);
const tabH=await d.getByRole('tab').first().evaluate(e=>e.getBoundingClientRect().height);
check('desktop sub-tabs keep their compact height', tabH<44, String(tabH));
console.log(`\n${fail===0?'ALL PROBES PASSED':'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
await b.close();process.exit(fail===0?0:1);
