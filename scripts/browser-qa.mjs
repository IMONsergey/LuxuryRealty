import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE || '/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const port=Number(process.env.QA_PORT||14313),base=process.env.BASE_URL||`http://127.0.0.1:${port}`,artifacts=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts');
await mkdir(artifacts,{recursive:true});
const report={project:'luxury-realty',startedAt:new Date().toISOString(),widths:[],checks:[],pageErrors:[],assetFailures:[],mockedRequests:[],ok:false};
let serverOutput='',browser,releaseHeldRequest;
const server=process.env.BASE_URL?null:spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(port),'--ignore-lock'],{cwd:process.cwd(),env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
server?.stdout.on('data',chunk=>serverOutput+=chunk.toString());server?.stderr.on('data',chunk=>serverOutput+=chunk.toString());
let cleanup;
function stopOwnedProcesses(){
 return cleanup??=(async()=>{
  releaseHeldRequest?.();await browser?.close();
  if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(1500)]);if(server.exitCode===null)server.kill('SIGKILL');}
 })();
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{void stopOwnedProcesses().finally(()=>process.exit(code));});
const check=name=>report.checks.push(name);
function semanticURL(value){
 const url=new URL(String(value),base);
 const parameters=[...url.searchParams.entries()].sort(([keyA,valueA],[keyB,valueB])=>keyA.localeCompare(keyB)||valueA.localeCompare(valueB));
 return {origin:url.origin,pathname:url.pathname,parameters,hash:url.hash};
}
function sameURL(actual,expected){return JSON.stringify(semanticURL(actual))===JSON.stringify(semanticURL(expected));}
function observe(page){
 page.setDefaultTimeout(15000);
 page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.on('response',response=>{if(response.status()>=400&&/\/(?:assets|fonts)\//.test(response.url()))report.assetFailures.push({url:response.url(),status:response.status()});});
}
async function ready(){
 const until=Date.now()+45000;
 while(Date.now()<until){if(server&&server.exitCode!==null)throw new Error(`Astro exited ${server.exitCode}: ${serverOutput.slice(-6000)}`);try{if((await fetch(base)).ok)return;}catch{}await delay(250);}
 throw new Error(`Astro did not start: ${serverOutput.slice(-6000)}`);
}
async function settle(page){
 await page.evaluate(async()=>{
  await document.fonts.ready;
  [...document.images].filter(image=>image.getAttribute('src')).forEach(image=>image.loading='eager');
  // Eager loading and srcset selection take effect asynchronously after layout.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 try{
  await page.waitForFunction(()=>[...document.images].filter(image=>image.getAttribute('src')).every(image=>image.complete&&image.naturalWidth>0),null,{timeout:20000});
  // A corrupt file must still fail even if its header exposed natural dimensions.
  await page.evaluate(async()=>{for(const image of [...document.images].filter(image=>image.getAttribute('src')))await image.decode();});
 }catch(error){
  const images=await page.evaluate(()=>[...document.images].filter(image=>image.getAttribute('src')).map(image=>({src:image.getAttribute('src'),currentSrc:image.currentSrc,complete:image.complete,width:image.naturalWidth,height:image.naturalHeight})).filter(image=>!image.complete||!image.width));
  throw new Error(`Images did not load and decode on ${page.url()}: ${JSON.stringify(images)}; ${error.message}`);
 }
}
async function dialogState(page,id,open=true){await page.waitForFunction(({id,open})=>document.getElementById(id)?.open===open,{id,open});}
async function galleryPhoto(page,index,total){await page.waitForFunction(({index,total})=>{const image=document.querySelector('[data-gallery-image]');return document.querySelector('[data-gallery-counter]')?.textContent===`${index} / ${total}`&&image?.complete&&image.naturalWidth>0&&!document.querySelector('.gallery-stage')?.hasAttribute('aria-busy');},{index,total});}
async function formIdle(form){await form.page().waitForFunction(selector=>document.querySelector(selector)?.dataset.sending==='false',await form.evaluate(element=>{element.id||='qa-enquiry-form';return `#${element.id}`;}));}
async function focused(locator){await locator.page().waitForFunction(selector=>document.querySelector(selector)===document.activeElement,await locator.evaluate(element=>{element.id||=`qa-focus-${Math.random().toString(36).slice(2)}`;return `#${element.id}`;}));}
async function fillForm(form){await form.locator('[name=name]').fill('Website Verification');await form.locator('[name=email]').fill('qa@example.invalid');await form.locator('[name=phone]').fill('+10000000000');await form.locator('[name=message]').fill('Synthetic UI verification. No real enquiry is sent.');await form.locator('[name=consent]').check();await delay(850);}

try{
 await ready();browser=await chromium.launch({headless:true,handleSIGINT:false,handleSIGTERM:false});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const page=await context.newPage();observe(page);
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:width>768?900:844});
  const response=await page.goto(base,{waitUntil:'networkidle'});assert.equal(response?.status(),200);await settle(page);
  const measured=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,h1:document.querySelectorAll('h1').length,broken:[...document.images].filter(image=>image.getAttribute('src')&&(!image.complete||!image.naturalWidth)).map(image=>image.getAttribute('src'))}));
  assert.equal(measured.h1,1);assert.ok(measured.scroll<=width+1,`Home overflows at ${width}: ${measured.scroll}`);assert.ok(measured.body<=width+1);assert.deepEqual(measured.broken,[]);
  report.widths.push(measured);await page.evaluate(()=>scrollTo(0,0));
  if(width===1440||width===390)await page.screenshot({path:path.join(artifacts,`home-${width}.png`)});
 }
 check('Original home, fonts and assets load at 1440/768/390/320; one h1; no horizontal overflow');
 await page.setViewportSize({width:390,height:844});
 const menuButton=page.locator('.menu-toggle');await menuButton.click();await dialogState(page,'site-menu');
 await page.keyboard.press('Escape');await dialogState(page,'site-menu',false);await focused(menuButton);
 await menuButton.click();await page.locator('#site-menu [data-enquiry]').click();await dialogState(page,'enquiry-dialog');
 await page.keyboard.press('Escape');await dialogState(page,'enquiry-dialog',false);await focused(menuButton);
 check('Mobile menu and menu-to-enquiry Escape paths restore focus to the visible menu button');

 await page.setViewportSize({width:1440,height:900});
 await page.goto(base+'/properties/',{waitUntil:'networkidle'});
 await page.setViewportSize({width:390,height:844});await page.locator('.filter-disclosure>summary').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.filter-disclosure')?.open===false);
 assert.equal(await page.locator('[data-filters]').isVisible(),false);
 await page.setViewportSize({width:1440,height:900});await page.locator('[data-filters]').waitFor({state:'visible'});
 check('Catalogue filters remain available after resizing from mobile back to desktop');
 const query=page.locator('[data-filters] [name=q]');await query.fill('NoMatchingResidenceXYZ');await page.locator('[data-filters] [type=submit]').click();
 await page.locator('[data-no-results]').waitFor({state:'visible'});assert.match(await page.locator('[data-result-count]').innerText(),/^0 /);
 await page.locator('[data-filters] [type=reset]').click();await page.waitForFunction(()=>document.querySelector('[data-result-count]')?.textContent==='8 properties');
 const catalogueURL='/properties/?q=Dubai&beds=6&type=villa&features=pool&sort=price-high';
 await page.goto(base+catalogueURL,{waitUntil:'networkidle'});await settle(page);
 const visibleCards=page.locator('[data-property-card]:not([hidden])');assert.ok(await visibleCards.count()>0);assert.ok(await visibleCards.count()<8);
 assert.equal(await query.inputValue(),'Dubai');assert.equal(await page.locator('[data-sort]').inputValue(),'price-high');await page.reload({waitUntil:'networkidle'});assert.equal(await query.inputValue(),'Dubai');
 const propertyLink=visibleCards.first().locator('a');await propertyLink.scrollIntoViewIfNeeded();const propertyHref=await propertyLink.getAttribute('href');await propertyLink.click();await page.waitForURL(base+propertyHref);
 const back=page.locator('.property-page .back-link');assert.deepEqual(semanticURL(await back.evaluate(link=>link.href)),semanticURL(catalogueURL));await back.click();await page.waitForURL(url=>sameURL(url,catalogueURL));assert.equal(await query.inputValue(),'Dubai');assert.equal(await page.locator('[data-sort]').inputValue(),'price-high');
 assert.equal(await page.locator('[name=features][value=pool]').isChecked(),true);await focused(visibleCards.first().locator('a'));await visibleCards.first().locator('a').click();await page.waitForURL(base+propertyHref);await settle(page);
 check('Catalogue search/empty/reset/filter/sort/reload work; property return restores the original query and selected filters');
 const galleryButton=page.locator('.property-hero [data-gallery]');await galleryButton.click();await dialogState(page,'gallery-dialog');await galleryPhoto(page,1,4);
 await page.locator('[data-gallery-next]').click();await galleryPhoto(page,2,4);await page.keyboard.press('ArrowLeft');await galleryPhoto(page,1,4);
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await galleryPhoto(page,4,4);
 const galleryOriginals=JSON.parse(await galleryButton.getAttribute('data-gallery'));
 assert.equal(new URL(await page.locator('[data-gallery-image]').getAttribute('src'),base).pathname,galleryOriginals[3].src);
 await page.keyboard.press('Escape');await dialogState(page,'gallery-dialog',false);await focused(galleryButton);
 check('Property gallery decodes before showing the matching photo/counter, keeps the latest rapid navigation request, and restores focus');

 const posted=[];const held=new Promise(resolve=>releaseHeldRequest=resolve);
 await page.route('**/api/enquiry',async route=>{
  const payload=route.request().postDataJSON();posted.push(payload);const n=posted.length;
  if(n===1)return route.abort('failed');
  if(n===2){await held;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Storage unavailable. Please retry.'})});}
  if(n===3)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:'00000000-0000-4000-8000-000000000000'})});
  if(n===4)return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:'Please check the highlighted fields.',fields:{email:'Please confirm this email.'}})});
  return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,id:payload.submissionId})});
 });
 const openForm=page.locator('.property-advisor [data-enquiry]');await openForm.click();await dialogState(page,'enquiry-dialog');
 const form=page.locator('#enquiry-dialog [data-enquiry-form]'),submit=form.locator('[type=submit]'),status=form.locator('.form-status');
 await submit.click();assert.equal(posted.length,0);assert.equal(await form.locator('[aria-invalid=true]').count(),3);await fillForm(form);
 const originalContext=await form.getAttribute('data-context');await submit.click();await formIdle(form);assert.equal(posted.length,1);assert.notEqual(await form.getAttribute('data-complete'),'true');assert.equal(await form.locator('[name=email]').inputValue(),'qa@example.invalid');
 await page.keyboard.press('Escape');await openForm.click();await dialogState(page,'enquiry-dialog');await submit.click();await page.waitForFunction(()=>document.querySelector('#enquiry-dialog form')?.dataset.sending==='true');assert.equal(await form.locator('[name=email]').isDisabled(),true);assert.equal(await form.locator('textarea').isDisabled(),true);
 await form.evaluate(element=>element.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await page.keyboard.press('Escape');await page.locator('.brochure-banner [data-enquiry]').click();await dialogState(page,'enquiry-dialog');assert.equal(await form.getAttribute('data-context'),originalContext);assert.equal(await form.locator('[name=email]').isDisabled(),true);await delay(150);assert.equal(posted.length,2);
 releaseHeldRequest();await formIdle(form);assert.match(await status.innerText(),/Storage unavailable/);assert.equal(await form.locator('[name=email]').isEnabled(),true);
 await submit.click();await formIdle(form);assert.equal(posted.length,3);assert.notEqual(await form.getAttribute('data-complete'),'true');assert.match(await status.innerText(),/could not be confirmed/);
 assert.ok(posted.slice(0,3).every(item=>item.submissionId===posted[0].submissionId&&item.startedAt===posted[0].startedAt));
 check('Network failure and same-context reopen preserve fields/UUID/start time; pending fields/context are protected; duplicate submit and mismatched receipt cannot report success');
 await form.locator('[name=message]').fill('Changed synthetic UI message. No real enquiry is sent.');await submit.click();await formIdle(form);assert.equal(posted.length,4);assert.notEqual(posted[3].submissionId,posted[0].submissionId);assert.equal(await form.locator('[name=email]').getAttribute('aria-invalid'),'true');assert.match(await form.locator('[data-error-for=email]').innerText(),/confirm this email/);
 await submit.click();await formIdle(form);assert.equal(posted.length,5);assert.equal(posted[4].submissionId,posted[3].submissionId);assert.equal(await form.getAttribute('data-complete'),'true');assert.match(await status.innerText(),/has been saved/);assert.equal(await submit.isDisabled(),true);
 await page.screenshot({path:path.join(artifacts,'enquiry-confirmed.png')});await page.keyboard.press('Escape');await openForm.click();await dialogState(page,'enquiry-dialog');assert.equal(await form.locator('[name=name]').inputValue(),'');assert.equal(await submit.isEnabled(),true);assert.notEqual(await form.getAttribute('data-submission-id'),posted[4].submissionId);await page.keyboard.press('Escape');
 check('Changed payload obtains a new UUID; field errors remain visible; unchanged retry confirms matching receipt; success reopen starts a clean enquiry');
 report.mockedRequests=posted.map(item=>({project:item.project,context:item.context,submissionId:item.submissionId,startedAt:item.startedAt,consent:item.consent}));

 for(const route of ['/developments/','/developments/ava-at-palm/','/developments/orla/','/developments/six-senses/','/developments/atlantis/','/insights/','/insights/spaces-worth-living-in/','/contacts/','/privacy/']){
  const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response?.status(),200,route);assert.equal(await page.locator('h1').count(),1,route);await settle(page);
  if(route==='/developments/six-senses/'){assert.match(await page.locator('.development-detail-hero .eyebrow').innerText(),/^Dubai Marina, Dubai$/i);assert.equal(await page.locator('a[href="https://six-senses-imon.vercel.app"]').count(),1);}
  if(route==='/insights/'){await page.locator('[data-category=places]').click();assert.equal(await page.locator('[data-insight-category]:not([hidden])').count(),1);}
  if(route==='/contacts/'){const contact=page.locator('.contact-form-panel [data-enquiry-form]');await contact.locator('[type=submit]').click();assert.equal(await contact.locator('[aria-invalid=true]').count(),3);assert.equal(posted.length,5);}
 }
 const missing=await page.goto(base+'/missing-page-for-qa/',{waitUntil:'networkidle'});assert.equal(missing?.status(),404);
 check('All page templates, four development routes and current project links work; Six Senses shows Dubai Marina; insights filter, contact validation and 404 work');
 await page.setViewportSize({width:390,height:844});
 for(const route of ['/properties/','/properties/dubai-hills-residence/','/developments/six-senses/','/insights/','/contacts/']){
  await page.goto(base+route,{waitUntil:'networkidle'});await settle(page);const width=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(width<=391,`${route} overflows at 390: ${width}`);
 }
 check('Catalogue, property, development, insights and contact templates fit a 390px viewport');
 const motionContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const motion=await motionContext.newPage();observe(motion);await motion.goto(base,{waitUntil:'networkidle'});await settle(motion);await motion.locator('h1').waitFor({state:'visible'});await delay(950);
 await motion.screenshot({path:path.join(artifacts,'home-motion-1440.png')});
 const rail=motion.locator('.selection-rail');await rail.focus();await motion.keyboard.press('End');await motion.locator('[data-rail-next=".selection-rail"]').waitFor({state:'visible'});
 await motion.waitForFunction(()=>document.querySelector('[data-rail-next=".selection-rail"]')?.disabled===true);
 await motion.keyboard.press('Home');await motion.waitForFunction(()=>document.querySelector('[data-rail-prev=".selection-rail"]')?.disabled===true);
 check('Normal-motion card rail reaches both real snap boundaries and disables the correct control');
 const summaries=motion.locator('.service>summary');await summaries.nth(1).click();await summaries.nth(2).click();await delay(350);
 assert.equal(await motion.locator('.service[open]').count(),1);assert.equal(await motion.locator('.service').nth(2).getAttribute('open'),'');
 await motion.screenshot({path:path.join(artifacts,'services-motion-1440.png')});
 check('Rapid service changes settle to one open, fully expanded panel');
 await motion.setViewportSize({width:390,height:844});await motion.waitForFunction(()=>getComputedStyle(document.querySelector('[data-hero-parallax]')).transform==='none');
 await motion.setViewportSize({width:1440,height:900});await motion.evaluate(()=>scrollTo({top:240,behavior:'instant'}));await delay(500);
 assert.ok(await motion.evaluate(()=>document.querySelector('.site-header').getBoundingClientRect().top===0));
 await motion.emulateMedia({reducedMotion:'reduce'});await motion.waitForFunction(()=>getComputedStyle(document.querySelector('[data-hero-parallax]')).transform==='none');
 assert.ok(await motion.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await motionContext.close();
 check('Resizing clears mobile parallax, the header remains anchored, and a live reduced-motion change restores a static page');
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.assetFailures,[]);report.ok=true;
}catch(error){report.error=error.stack||String(error);process.exitCode=1;}
finally{
 await stopOwnedProcesses();
 report.finishedAt=new Date().toISOString();await writeFile(path.join(artifacts,'browser-qa.json'),JSON.stringify(report,null,2));await writeFile(path.join(artifacts,'dev-server.log'),serverOutput);console.log(JSON.stringify(report,null,2));
}
