import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const engine=process.env.QA_ENGINE||'chromium';
const base=(process.env.BASE_URL||'http://127.0.0.1:14314').replace(/\/$/,'');
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/logic-audit-20261101-v3/after');
const phase=process.env.QA_PHASE||'after';
const caseFilters=(process.env.QA_CASES||'').split(',').map(x=>x.trim()).filter(Boolean);
const report={phase,base,engine,startedAt:new Date().toISOString(),cases:[],navigations:[],mockRequests:[],unexpectedWrites:[],pageErrors:[],fatalErrors:[],ok:false};
await mkdir(output,{recursive:true});
let browser,context,page;
let armed=0;
let activeCase='';
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const screenshots=[];
async function screenshot(label){
 const file=label+'.jpg';
 await page.screenshot({path:path.join(output,file),type:'jpeg',quality:86,animations:'allow'});
 screenshots.push(file);return file;
}
async function go(route,width=1440,height=900){
 await page.setViewportSize({width,height});
 const response=await page.goto(base+route,{waitUntil:'load',timeout:25000});
 assert.equal(response?.status(),200,route);
 await page.evaluate(()=>document.fonts.ready);
 await wait(1000);
 report.navigations.push({case:activeCase,route,url:page.url(),status:response.status(),htmlSha256:hash(await response.body()),viewport:{width,height}});
}
async function run(name,fn){
 if(caseFilters.length&&!caseFilters.some(prefix=>name.startsWith(prefix)))return;
 activeCase=name;armed=0;
 const item={name,startedAt:new Date().toISOString(),passed:false,screenshots:[]};
 const first=screenshots.length;
 try{await fn(item);item.passed=true;}
 catch(error){item.error=error.message;try{await screenshot(name+'-failure');}catch{}}
 finally{armed=0;item.finishedAt=new Date().toISOString();item.screenshots=screenshots.slice(first);report.cases.push(item);await save();console.log((item.passed?'PASS ':'FAIL ')+name+(item.error?': '+item.error:''));}
}
async function save(){
 report.finishedAt=new Date().toISOString();
 report.ok=report.cases.length>0&&report.cases.every(x=>x.passed)&&!report.unexpectedWrites.length&&!report.pageErrors.length&&!report.fatalErrors.length;
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
async function openDialog(trigger,id){
 await page.locator(trigger).click();
 await page.waitForFunction(id=>document.getElementById(id)?.open===true,id);
 await wait(400);
}
async function closeDialog(id){
 await page.locator('#'+id+' [data-close-dialog]').click();
 await page.waitForFunction(id=>document.getElementById(id)?.open===false,id);
 await wait(100);
}
async function scrollDialog(id){
 const rect=await page.locator('#'+id).boundingBox();
 await page.mouse.move(rect.x+rect.width*.65,Math.min(page.viewportSize().height-40,rect.y+rect.height*.72));
 await page.mouse.wheel(0,1800);
 await page.waitForFunction(id=>document.getElementById(id)?.scrollTop>40,id);
 await wait(150);
 return await page.locator('#'+id).evaluate(d=>d.scrollTop);
}
function semantic(value){
 const u=new URL(value,base);return {path:u.pathname,query:[...u.searchParams].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])),hash:u.hash};
}
const close=async()=>{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});};
const timer=setTimeout(()=>{report.fatalErrors.push('Watchdog timeout');void close();},420000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{report.fatalErrors.push(signal);void close();});
try{
 browser=await playwright[engine].launch({headless:true});
 report.browserVersion=browser.version();
 context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(url.pathname==='/api/enquiry'){
   if(method==='POST'&&armed>0){
    armed--;const body=request.postDataJSON();report.mockRequests.push({case:activeCase,submissionId:body.submissionId,context:body.context,mocked:true});
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,id:body.submissionId})});
   }
   report.unexpectedWrites.push({case:activeCase,url:request.url(),method,reason:'Unarmed enquiry blocked'});
   return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Blocked by test harness.'})});
  }
  if(!['GET','HEAD','OPTIONS'].includes(method)){report.unexpectedWrites.push({case:activeCase,url:request.url(),method,reason:'Write blocked'});return route.abort('blockedbyclient');}
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(9000);
 page.on('pageerror',error=>report.pageErrors.push({case:activeCase,message:error.message}));
 await run('hero-advanced-search',async item=>{
  await go('/');
  await page.locator('.hero-search [name=purpose]').selectOption('rent');
  await page.locator('.hero-search [name=q]').fill('Dubai Hills');
  await page.locator('.search-filter').click();
  await page.waitForURL(url=>url.pathname==='/properties/');
  await wait(300);
  item.actual={url:page.url(),query:await page.locator('[data-filters] [name=q]').inputValue(),rent:await page.locator('[data-purpose=rent]').getAttribute('aria-pressed')};
  await screenshot(item.name);
  assert.equal(item.actual.query,'Dubai Hills');assert.equal(item.actual.rent,'true');assert.equal(new URL(item.actual.url).hash,'#filters');
 });
 await run('bedroom-exact-match',async item=>{
  await go('/properties/');
  await page.locator('.bedroom-options label').filter({hasText:/^1$/}).click();
  item.oneBedroom=await page.locator('[data-property-card]:not([hidden])').evaluateAll(cards=>cards.map(c=>({id:c.dataset.id,beds:Number(c.dataset.bedrooms)})));
  await screenshot(item.name+'-one');
  await page.locator('.bedroom-options label').filter({hasText:/^6\+$/}).click();
  item.sixPlus=await page.locator('[data-property-card]:not([hidden])').evaluateAll(cards=>cards.map(c=>({id:c.dataset.id,beds:Number(c.dataset.bedrooms)})));
  assert.equal(item.oneBedroom.length,0,'The supplied collection has no 1-bedroom record');assert.equal(item.sixPlus.length,8);assert.ok(item.sixPlus.every(c=>c.beds>=6));
 });
 await run('price-zero',async item=>{
  await go('/properties/');
  await page.locator('[data-filters] [name=max]').fill('0');await page.locator('[data-filters] [name=max]').press('Tab');
  item.actual={count:await page.locator('[data-property-card]:not([hidden])').count(),url:page.url()};
  await screenshot(item.name);assert.equal(item.actual.count,0,'A zero maximum must not mean an unlimited price');
 });
 await run('price-whole-aed-budget',async item=>{
  await go('/properties/');
  await page.locator('[name=min]').fill('123456');await page.locator('[name=max]').fill('70000001');await page.locator('[name=max]').press('Tab');
  item.valid=await page.locator('[data-filters]').evaluate(form=>({min:form.elements.min.validity.valid,max:form.elements.max.validity.valid,stepMin:form.elements.min.step,stepMax:form.elements.max.step}));
  assert.equal(item.valid.min,true);assert.equal(item.valid.max,true);
 });
 await run('mobile-invalid-range-stays-open',async item=>{
  await go('/properties/',390,740);
  await page.locator('.filter-disclosure>summary').click();
  await page.locator('[name=min]').fill('90000000');await page.locator('[name=max]').fill('60000000');
  await page.evaluate(()=>{window.testFilterSubmits=0;document.querySelector('[data-filters]').addEventListener('submit',()=>window.testFilterSubmits++);});
  await page.locator('[data-filters] [type=submit]').click();await wait(350);
  item.actual=await page.evaluate(()=>({open:document.querySelector('.filter-disclosure').open,error:document.querySelector('[data-filter-error]').textContent,focus:document.activeElement?.getAttribute('name'),invalid:document.querySelector('[name=max]').getAttribute('aria-invalid'),describedBy:document.querySelector('[name=max]').getAttribute('aria-describedby'),submits:window.testFilterSubmits}));
  await screenshot(item.name);assert.equal(item.actual.open,true);assert.match(item.actual.error,/maximum/i);assert.equal(item.actual.focus,'max');assert.equal(item.actual.submits,1,'The first pointer click must reach submit');assert.equal(item.actual.invalid,'true');assert.equal(item.actual.describedBy,'price-range-error');
 });
 await run('price-invalid-draft-preserves-results',async item=>{
  await go('/properties/?min=50000000&max=70000000');
  item.before={url:page.url(),ids:await page.locator('[data-property-card]:not([hidden])').evaluateAll(cards=>cards.map(c=>c.dataset.id))};
  await page.locator('[name=max]').fill('40000000');await page.locator('[name=max]').press('Tab');await wait(200);
  item.after={url:page.url(),ids:await page.locator('[data-property-card]:not([hidden])').evaluateAll(cards=>cards.map(c=>c.dataset.id)),error:await page.locator('[data-filter-error]').innerText()};
  await screenshot(item.name);assert.equal(item.before.ids.length,8);assert.equal(item.after.url,item.before.url);assert.deepEqual(item.after.ids,item.before.ids);assert.match(item.after.error,/maximum/i);
 });
 await run('price-invalid-shared-url',async item=>{
  const route='/properties/?purpose=rent&min=90000000&max=60000000';await go(route,390,740);
  item.actual={url:page.url(),count:await page.locator('[data-property-card]:not([hidden])').count(),label:await page.locator('[data-result-count]').innerText(),open:await page.locator('.filter-disclosure').evaluate(d=>d.open),rent:await page.locator('.purpose-tabs [data-purpose=rent]').getAttribute('aria-pressed')};
  await screenshot(item.name);assert.deepEqual(semantic(item.actual.url),semantic(route));assert.equal(item.actual.count,0);assert.equal(item.actual.label,'Invalid price range');assert.equal(item.actual.open,true);assert.equal(item.actual.rent,'true');assert.equal(await page.locator('[data-invalid-range]').isVisible(),true);
  await page.locator('[name=max]').fill('100000000');await page.locator('[name=max]').press('Tab');assert.equal(await page.locator('[data-invalid-range]').isVisible(),false);assert.equal(await page.locator('[data-no-results]').isVisible(),true);assert.equal(await page.locator('[data-filter-error]').innerText(),'');
 });
 await run('catalogue-return-own-context',async item=>{
  const origin='/properties/?features=pool&sort=price-high';
  await go(origin);
  const link=page.locator('[data-property-card]:not([hidden]) a').nth(1);const target=await link.getAttribute('href');const propertyId=await link.evaluate(a=>a.closest('[data-property-card]').dataset.id);
  await link.click();await page.waitForURL(url=>url.pathname===target);
  item.saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('luxury-realty:catalogue')));assert.equal(item.saved.propertyId,propertyId);
  item.href=await page.locator('.property-page .back-link').getAttribute('href');assert.deepEqual(semantic(item.href),semantic(origin));
  await page.locator('.property-page .back-link').click();await page.waitForURL(url=>url.pathname==='/properties/');
  await page.waitForFunction(()=>document.querySelector('[name=features][value=pool]')?.checked);
  assert.deepEqual(semantic(page.url()),semantic(origin));assert.equal(await page.locator('[data-sort]').inputValue(),'price-high');
  await page.waitForFunction(id=>document.activeElement?.closest('[data-property-card]')?.dataset.id===id,propertyId);item.returnFocus=propertyId;
 });
 await run('catalogue-return-stale-context',async item=>{
  await go('/properties/?features=pool&sort=price-high');
  await page.locator('[data-property-card]:not([hidden]) a').first().click();await page.waitForURL(url=>url.pathname.includes('/properties/dubai-hills-'));
  await page.locator('.brand-mark').click();await page.waitForURL(url=>url.pathname==='/');
  await page.locator('.selection-rail [data-id="dubai-hills-waterfront"] a').click();await page.waitForURL(url=>url.pathname==='/properties/dubai-hills-waterfront/');
  item.href=await page.locator('.property-page .back-link').getAttribute('href');
  await screenshot(item.name);assert.deepEqual(semantic(item.href),semantic('/properties/'),'A different property must not inherit an unrelated previous card return');
 });
 await run('rent-current-navigation',async item=>{
  await go('/properties/?purpose=rent');await openDialog('.menu-toggle','site-menu');
  item.active=await page.locator('#site-menu nav [aria-current=page]').evaluateAll(links=>links.map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')})));
  await screenshot(item.name);assert.equal(item.active.length,1);assert.equal(item.active[0].href,'/properties/?purpose=rent');await closeDialog('site-menu');
 });
 await run('inline-second-enquiry',async item=>{
  await go('/contacts/');armed=2;
  const form=page.locator('.contact-form-panel [data-enquiry-form]');
  const fill=async suffix=>{await form.locator('[name=name]').fill('Synthetic Verification '+suffix);await form.locator('[name=email]').fill('qa@example.invalid');await form.locator('[name=message]').fill('Local mocked test only. No real submission. '+suffix);await form.locator('[name=consent]').check();await wait(700);};
  await fill('one');await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.contact-form-panel form')?.dataset.complete==='true');
  const first=await form.getAttribute('data-submission-id');await fill('two');
  item.secondEnabled=await form.locator('[type=submit]').isEnabled();item.firstId=first;item.secondId=await form.getAttribute('data-submission-id');
  await screenshot(item.name);
  if(item.secondEnabled){await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.contact-form-panel form')?.dataset.complete==='true');}
  item.requests=report.mockRequests.filter(r=>r.case===item.name);
  assert.equal(item.secondEnabled,true,'The inline form must allow a new enquiry after success');assert.notEqual(item.secondId,item.firstId);assert.equal(item.requests.length,2);
 });
 await run('enquiry-reopen-scroll-context',async item=>{
  await go('/properties/dubai-hills-residence/',390,600);
  await openDialog('.property-advisor [data-enquiry]','enquiry-dialog');await page.locator('#enquiry-dialog [name=name]').fill('Preserved local draft');
  item.before=await scrollDialog('enquiry-dialog');await closeDialog('enquiry-dialog');
  await openDialog('.brochure-banner [data-enquiry]','enquiry-dialog');
  item.after=await page.locator('#enquiry-dialog').evaluate(d=>({scrollTop:d.scrollTop,context:d.querySelector('[data-enquiry-context]').textContent,name:d.querySelector('[name=name]').value}));
  await screenshot(item.name);assert.equal(item.after.scrollTop,0);assert.equal(item.after.name,'Preserved local draft');assert.match(item.after.context,/Brochure request/);await closeDialog('enquiry-dialog');
 });
 await run('menu-reopen-scroll',async item=>{
  await go('/',390,600);await openDialog('.menu-toggle','site-menu');item.before=await scrollDialog('site-menu');await closeDialog('site-menu');await openDialog('.menu-toggle','site-menu');
  item.after=await page.locator('#site-menu').evaluate(d=>d.scrollTop);await screenshot(item.name);assert.equal(item.after,0);await closeDialog('site-menu');
 });
 await run('mobile-wordmark-center',async item=>{
  item.measurements=[];
  for(const width of [390,320,1440]){
   await go('/',width,width<700?844:900);
   const value=await page.locator('.brand-word').evaluate(a=>{const i=a.querySelector('img'),r=a.getBoundingClientRect(),s=i.getBoundingClientRect();return {linkWidth:r.width,imageWidth:s.width,imageHeight:s.height,offset:(s.left+s.width/2)-(r.left+r.width/2),ratio:s.width/s.height};});
   item.measurements.push({width,...value});if(width===390)await screenshot(item.name);
  }
  assert.ok(item.measurements.every(m=>Math.abs(m.offset)<.5),'The visible wordmark must share the center of its link');assert.ok(item.measurements.every(m=>Math.abs(m.ratio-104/15.3906)<.03));
 });
 await go('/properties/');
 const records=await page.locator('[data-property-card]').evaluateAll(cards=>cards.map(c=>({id:c.dataset.id,href:c.querySelector('a').getAttribute('href'),image:c.querySelector('.property-media img').getAttribute('src'),features:c.dataset.features.split(',')})));
 assert.equal(records.length,8);
 for(const record of records){
  await run('property-identity-'+record.id,async item=>{
   await go(record.href,390,844);
   const triggers=page.locator('[data-gallery]');
   const canonical=JSON.parse(await page.locator('.property-hero [data-gallery]').getAttribute('data-gallery'));
   item.actual={features:await page.locator('.features-grid>div>span').allTextContents(),photos:canonical,hero:await page.locator('.property-hero>img').getAttribute('src'),buttonLabel:await page.locator('.property-hero [data-gallery]').innerText()};
   item.expected=record;item.triggerChecks=[];
   for(let i=0;i<await triggers.count();i++){
    const trigger=triggers.nth(i);const list=JSON.parse(await trigger.getAttribute('data-gallery')),index=Number(await trigger.getAttribute('data-gallery-index')||0);
    assert.deepEqual(list,canonical,'Every media trigger for a property must open its own same collection');
    await trigger.click();await page.waitForFunction(()=>document.querySelector('#gallery-dialog')?.open===true);
    await page.waitForFunction(({index,count})=>{const image=document.querySelector('[data-gallery-image]');return document.querySelector('[data-gallery-counter]')?.textContent===String(index+1)+' / '+count&&!document.querySelector('.gallery-stage')?.hasAttribute('aria-busy')&&image?.complete&&image.naturalWidth>0;},{index,count:canonical.length});
    const shown=await page.locator('[data-gallery-image]').evaluate(img=>({src:new URL(img.src).pathname,decoded:img.complete&&img.naturalWidth>0,alt:img.alt}));
    assert.equal(shown.src,list[index].src);assert.equal(shown.decoded,true);
    item.triggerChecks.push({index,shown});
    if(i===0)await screenshot(item.name+'-gallery');
    if(canonical.length===1)assert.equal(await page.locator('[data-gallery-next]').isVisible(),false);
    await closeDialog('gallery-dialog');
   }
   await page.locator('.property-features').scrollIntoViewIfNeeded();await screenshot(item.name+'-features');
   assert.deepEqual(item.actual.features.map(x=>x.toLowerCase()),record.features,'Detail amenities must match the record used by filters');
   assert.ok(canonical.some(photo=>photo.src===record.image),'The clicked card image must be present in its own gallery');
   assert.equal(item.actual.hero,canonical[0].src);
  });
 }
}catch(error){report.fatalErrors.push(error.stack||String(error));}
finally{clearTimeout(timer);await close();await save();console.log(JSON.stringify({phase,ok:report.ok,cases:report.cases.length,passed:report.cases.filter(x=>x.passed).length,failed:report.cases.filter(x=>!x.passed).map(x=>x.name),mockedRequests:report.mockRequests.length,output}));}
process.exitCode=report.ok?0:1;

