import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {makeFakeGithub,saveToken,syncNow,exportJson} from './helpers.js';
const home=async p=>{await p.goto('/#/');await expect(p.locator('#mega-start')).toBeVisible();};
const start=async p=>{await home(p);await p.locator('#mega-start').click();await expect(p.locator('#mega-session')).toBeVisible();};
const cursor=p=>p.locator('#mega-session').getAttribute('data-cursor');
async function answer(p,right=true){const id=Number(await p.locator('#mega-session').getAttribute('data-qid'));const data=await (await p.request.get('/data/questions.json')).json();const q=data.questions.find(q=>q.id===id);await p.locator(`button.opt[data-orig="${right?q.correct:(q.correct+1)%q.options.length}"]`).click();await expect(p.locator('#mega-save')).toContainText('αποθηκεύτηκε');}
async function next(p){await p.locator('#mega-next').click();}

test('single test replaces every old route; existing answers and confirmed settings survive',async({page})=>{
 await home(page);
 await page.evaluate(async()=>{const {ctx}=await import('/src/app.js');ctx.progress.updateSettings({examDate:'2026-10-19',examTime:'11:30',examTentative:false});const q=ctx.questions[0];await ctx.progress.append({id:crypto.randomUUID(),t:Date.now()-10000,k:'answer',q:q.id,ch:q.correct,ok:true,ms:2000,m:'practice',s:'old',cf:null,sh:true,tl:null,hd:false,rc:false});});
 await page.reload();await expect(page.locator('.mega-ticket')).toContainText('19 Οκτωβρίου');await expect(page.locator('.mega-ticket')).toContainText('11:30');
 for(const route of ['#/setup/practice','#/session','#/summary','#/certification']){await page.goto('/'+route);await expect(page.locator('#mega-start')).toBeVisible();await expect(page.locator('#view')).not.toContainText('πιθανότητα');await expect(page.locator('.mode')).toHaveCount(0);}
 await page.goto('/#/stats');await expect(page.locator('#history-accuracy')).toContainText('1/1');
 await start(page);await answer(page);await page.goto('/#/stats');await expect(page.locator('#history-accuracy')).toContainText('2/2');
});
test('pause, reload, tab closure and reopening preserve question order, feedback and exact position',async({page,context})=>{
 await start(page);await answer(page,false);const first=await page.locator('.qtext').innerText();await page.reload();await expect(page.locator('.qtext')).toHaveText(first);await expect(page.locator('.verdict')).toHaveText('Λάθος — θα το ξαναδούμε');await expect(page.locator('button.opt').first()).toBeDisabled();
 await next(page);const question=await page.locator('.qtext').innerText(),options=await page.locator('button.opt').allTextContents();
 await page.locator('#mega-pause').click();await expect(page.locator('#mega-count')).toHaveText('1 / 560');await page.close();
 const reopened=await context.newPage();await start(reopened);await expect(reopened.locator('.qtext')).toHaveText(question);expect(await reopened.locator('button.opt').allTextContents()).toEqual(options);expect(await cursor(reopened)).toBe('1');
 await answer(reopened);await next(reopened);expect(await cursor(reopened)).toBe('2');
});
test('interrupted IndexedDB write recovers from the durable answer journal exactly once',async({page,context})=>{
 await start(page);
 await page.evaluate(()=>{IDBObjectStore.prototype.add=function(){throw new DOMException('simulated interruption','QuotaExceededError');};});
 const id=await page.locator('#mega-session').getAttribute('data-qid');await page.locator('button.opt').first().click();await expect(page.locator('#mega-error')).toBeVisible();await expect(page.locator('#mega-save')).not.toContainText('αποθηκεύτηκε');await page.close();
 const recovered=await context.newPage();await recovered.goto('/#/mega');await expect(recovered.locator('#mega-session')).toHaveAttribute('data-qid',id);await expect(recovered.locator('#mega-save')).toContainText('αποθηκεύτηκε');
 await recovered.reload();await next(recovered);expect(await cursor(recovered)).toBe('1');expect(await recovered.evaluate(async()=>{const {ctx}=await import('/src/app.js');return ctx.progress.state.counts.answers;})).toBe(1);
});
test('plan storage failure never pretends the run was saved',async({page})=>{
 await home(page);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='mm.mega.plans')throw new DOMException('full','QuotaExceededError');return original.call(this,k,v);};});
 await page.locator('#mega-start').click();await expect(page.getByRole('alert')).toContainText('Δεν αποθηκεύτηκε');await expect(page).toHaveURL(/#\/$/);
});
test('backup includes run plus old/new answers and restores into a fresh device',async({page,browser},info)=>{
 await start(page);await answer(page);await next(page);await answer(page,false);await next(page);
 const q=await page.locator('.qtext').innerText(),out=path.join(info.outputDir,'mega-backup.json');await exportJson(page,out);
 const saved=JSON.parse(fs.readFileSync(out));expect(saved.events).toHaveLength(2);expect(saved.megaPlans[0].queue).toHaveLength(560);expect(JSON.stringify(saved)).not.toMatch(/token|gistId/);
 const c=await browser.newContext({serviceWorkers:'block'}),b=await c.newPage();b.on('dialog',d=>d.accept());
 try{await b.goto('/#/settings');await b.locator('input[type=file]').setInputFiles(out);await expect(b.locator('.toast')).toContainText('2 νέες εγγραφές');await start(b);expect(await cursor(b)).toBe('2');await expect(b.locator('.qtext')).toHaveText(q);}finally{await c.close();}
});
test('two devices sync the same plan and position; concurrent slot answers do not double-advance',async({browser})=>{
 const gh=makeFakeGithub(),ca=await browser.newContext({serviceWorkers:'block'}),cb=await browser.newContext({serviceWorkers:'block'});
 await ca.route('https://api.github.com/**',gh.handler);await cb.route('https://api.github.com/**',gh.handler);
 const a=await ca.newPage(),b=await cb.newPage();
 try{
  await saveToken(a,'ghp_TESTONLY');await start(a);await answer(a);await next(a);await answer(a);await next(a);await syncNow(a);
  await saveToken(b,'ghp_TESTONLY');await start(b);expect(await cursor(b)).toBe('2');
  await start(a);await ca.setOffline(true);await cb.setOffline(true);await answer(a,false);await next(a);await answer(b,true);await next(b);
  await ca.setOffline(false);await cb.setOffline(false);await syncNow(a);await syncNow(b);await syncNow(a);
  await start(a);await start(b);expect(await cursor(a)).toBe('3');expect(await cursor(b)).toBe('3');expect(await a.locator('.qtext').innerText()).toBe(await b.locator('.qtext').innerText());
  const cloud=[...gh.gists.values()][0];expect(JSON.parse(cloud.files['moto-master-mega.json'].content).plans).toHaveLength(1);expect(JSON.parse(cloud.files['moto-master-progress.json'].content).events).toHaveLength(4);
 }finally{await ca.close();await cb.close();}
});
test('560 core answers are required for completion; completed runs remain in history',async({page})=>{
 await start(page);await page.evaluate(async()=>{const {ctx}=await import('/src/app.js');const p=ctx.progress,m=p.mega(),ev=m.plan.queue.slice(0,558).map((id,i)=>{const q=ctx.questions.find(q=>q.id===id);return {id:crypto.randomUUID(),t:m.plan.t+i+1,k:'answer',m:'mega',s:`${m.plan.id}:${i}`,q:id,ch:q.correct,ok:true,ms:2000,sh:true,cf:null,tl:null,hd:false,rc:false};});await p.append(ev);});
 await page.reload();expect(await cursor(page)).toBe('558');await expect(page.locator('.mega-complete')).toHaveCount(0);await answer(page);await next(page);await answer(page);await next(page);await expect(page.locator('.mega-complete')).toBeVisible();await expect(page.locator('#mega-count')).toHaveText('560 / 560');
 await home(page);await expect(page.locator('#mega-start')).toHaveText('Νέο Mega τεστ →');await page.locator('#mega-start').click();expect(await cursor(page)).toBe('0');expect(await page.evaluate(async()=>{const {ctx}=await import('/src/app.js');return ctx.progress.state.counts.answers;})).toBe(560);
});
test('small iPhone and desktop layouts, light/dark, have no horizontal overflow',async({page})=>{
 for(const width of [375,1280]){await page.setViewportSize({width,height:850});await home(page);for(const theme of ['light','dark']){await page.evaluate(async theme=>{const {ctx}=await import('/src/app.js');ctx.progress.updateSettings({theme});},theme);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('#mega-start')).toBeInViewport();}}
 await start(page);await answer(page,false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test.describe('offline',()=>{test.use({serviceWorkers:'allow'});test('installed assets resume the saved test without a network',async({page,context})=>{
 await start(page);await answer(page);await next(page);const q=await page.locator('.qtext').innerText();
 await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.ready.then(()=>!!navigator.serviceWorker.controller))).toBe(true);
 await context.setOffline(true);try{await page.reload();await expect(page.locator('.qtext')).toHaveText(q);expect(await cursor(page)).toBe('1');await answer(page);await next(page);await page.reload();expect(await cursor(page)).toBe('2');}finally{await context.setOffline(false);}
});});

test('a stalled online sync cannot block resuming the local run',async({page})=>{
 const gh=makeFakeGithub();await page.route('https://api.github.com/**',gh.handler);await saveToken(page,'ghp_TESTONLY');await start(page);await answer(page);await next(page);await syncNow(page);
 await page.unroute('https://api.github.com/**');await page.route('https://api.github.com/**',()=>{});await home(page);await page.locator('#mega-start').click();await expect(page.locator('#mega-session')).toBeVisible({timeout:20000});expect(await cursor(page)).toBe('1');await expect(page.locator('#sync-pill')).not.toHaveClass(/pill-synced/);
});
