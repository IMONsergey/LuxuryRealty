import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const playwright=require('playwright');
const engine=process.env.ENGINE||'chromium';
assert.ok(['chromium','webkit','firefox'].includes(engine),'ENGINE must be chromium, webkit or firefox');
const port=Number(process.env.QA_PORT||14328);
const base=process.env.BASE_URL||`http://127.0.0.1:${port}`;
assert.ok(['127.0.0.1','localhost','::1','[::1]'].includes(new URL(base).hostname),'This mock-only suite must target a loopback preview');
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/content-migration');
const properties=JSON.parse(await readFile('src/data/properties.json','utf8'));
const approvedCaseTitles=new Map([
 ['EXCEPTIONAL 3BR-LOFT | DESIGNER UPGRADE | SEA VIEW','Exceptional 3BR-loft | Designer upgrade | Sea view'],
 ['UPGRADED 2BR | MARINA VIEW | INVESTOR DEAL','Upgraded 2BR | Marina view | Investor deal'],
]);
const archived=p=>/sold|rented|archived|withdrawn/i.test(p.saleStatus||p.status);
const current=properties.filter(p=>!archived(p));
const buy=current.filter(p=>p.purpose==='buy'&&!p.isDevelopment);
const rent=current.filter(p=>p.purpose==='rent'&&!p.isDevelopment);
const developments=current.filter(p=>p.isDevelopment);
const old=properties.filter(archived);
const detailFixture=buy.find(p=>p.photos.length>=5&&(p.videos||[]).some(video=>/vimeo\.com/.test(video.url)))||buy.find(p=>p.photos.length>=5);
const filmFixture=current.find(p=>(p.videos||[]).some(video=>/vimeo\.com/.test(video.url)));
const filterFixture=buy.find(p=>p.location&&p.type&&p.bedrooms!==null&&p.price>0&&p.features.length>=2);
assert.ok(detailFixture&&filmFixture&&filterFixture,'The source collection must supply real fixtures');
await mkdir(output,{recursive:true});
async function sourceFiles(directory){const found=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())found.push(...await sourceFiles(file));else if(entry.isFile())found.push(file);}return found;}
async function sourceSnapshot(){const hashes={};for(const file of [...await sourceFiles('src'),'scripts/content-browser-qa.mjs','package.json','astro.config.mjs'].sort())hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');return hashes;}
const sourceHashes=await sourceSnapshot();
const report={project:'luxury-realty',engine,sourceHashes,sourceMode:process.env.BASE_URL?'existing-loopback-preview':'astro-dev-current-source',startedAt:new Date().toISOString(),sourceCounts:{total:properties.length,current:current.length,buy:buy.length,rent:rent.length,developments:developments.length,archived:old.length},checks:[],pageErrors:[],consoleErrors:[],assetFailures:[],mockedEnquiries:[],mockedFilms:[],blockedWrites:[],screenshots:[],ok:false};
let browser,context,page,server,serverOutput='',cleanup,timeout=false,releasePending,expectedGalleryFailure=false;
const mockedApiFailures=new Set();
let apiMode='unavailable',heldResponse=null;
function errorText(error){return error?.stack||String(error);}
async function stopOwnedProcesses(){
 return cleanup??=(async()=>{
  releasePending?.();
  await Promise.race([browser?.close().catch(()=>{}),delay(5000)]);
  if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(1500)]);if(server.exitCode===null)server.kill('SIGKILL');}
 })();
}
async function persist(){report.finishedAt=new Date().toISOString();report.elapsedMs=Date.parse(report.finishedAt)-Date.parse(report.startedAt);await writeFile(path.join(output,engine+'-report.json'),JSON.stringify(report,null,2));await writeFile(path.join(output,engine+'-server.log'),serverOutput);}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{report.error='Interrupted by '+signal;void stopOwnedProcesses().then(persist).finally(()=>process.exit(code));});
const deadline=setTimeout(()=>{timeout=true;void stopOwnedProcesses();},285000);
async function step(name,action){
 const start=Date.now();
 try {await action();report.checks.push({name,ok:true,elapsedMs:Date.now()-start});console.log('PASS '+name);}
 catch(error){report.checks.push({name,ok:false,elapsedMs:Date.now()-start,error:errorText(error)});throw error;}
}
async function ready(){
 const until=Date.now()+40000;
 while(Date.now()<until&&!timeout){
  if(server&&server.exitCode!==null)throw new Error('Astro exited '+server.exitCode+': '+serverOutput.slice(-4000));
  try {if((await fetch(base,{signal:AbortSignal.timeout(1500)})).ok)return;}catch{}
  await delay(200);
 }
 throw new Error('Preview startup timed out: '+serverOutput.slice(-4000));
}
function comparableURL(raw){const url=new URL(String(raw),base);return url.pathname+'?'+[...url.searchParams.entries()].sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv)).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}
async function screenshot(name){const filename=engine+'-'+name+'.png';await page.screenshot({path:path.join(output,filename)});report.screenshots.push(filename);}
async function overflow(){
 const state=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,h1:document.querySelectorAll('h1').length,title:document.querySelector('h1')?.textContent?.trim()}));
 assert.equal(state.h1,1,'Exactly one h1 on '+page.url());assert.ok(state.title,'Non-empty page heading');assert.ok(state.document<=state.viewport+1,`${page.url()} document overflow: ${JSON.stringify(state)}`);assert.ok(state.body<=state.viewport+1,`${page.url()} body overflow: ${JSON.stringify(state)}`);
}
async function visibleMedia(){
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 await page.waitForFunction(()=>Array.from(document.images).filter(image=>{
  const rect=image.getBoundingClientRect();return Boolean(image.getAttribute('src'))&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight;
 }).every(image=>image.complete&&image.naturalWidth>0),null,{timeout:12000});
 await page.evaluate(async()=>{for(const image of Array.from(document.images)){const rect=image.getBoundingClientRect();if(image.getAttribute('src')&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight)await image.decode();}});
}
async function visit(route){const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:20000});assert.equal(response?.status(),200,route);await page.locator('h1').waitFor({state:'visible'});await visibleMedia();await overflow();}
async function dialog(id,open=true){await page.waitForFunction(({id,open})=>document.getElementById(id)?.open===open,{id,open});}
async function focus(locator){await page.waitForFunction(selector=>document.querySelector(selector)===document.activeElement,await locator.evaluate(element=>{element.id||='qa-focus-'+Math.random().toString(36).slice(2);return '#'+element.id;}));}
async function count(expected){await page.waitForFunction(expected=>document.querySelector('[data-result-count]')?.textContent===expected+' '+(expected===1?'property':'properties'),expected);}
async function visibleIds(){return page.locator('[data-property-grid] [data-property-card]:not([hidden])').evaluateAll(nodes=>nodes.map(node=>node.dataset.id));}
async function ids(expected){await page.waitForFunction(expected=>JSON.stringify(Array.from(document.querySelectorAll('[data-property-grid] [data-property-card]:not([hidden])')).map(node=>node.dataset.id))===JSON.stringify(expected),expected);}
async function openFilters(){
 await page.locator('[data-catalogue][data-initialized="true"]').waitFor({state:'attached'});
 if(!await page.locator('#catalogue-filter-dialog').evaluate(element=>element.open))await page.locator('[data-filter-open]').click();
 await dialog('catalogue-filter-dialog');
 await page.locator('[data-filters] [name=location]').waitFor({state:'visible'});
}
async function applyFilters(){
 await page.locator('[data-filters] [data-filter-apply]').click();
 await dialog('catalogue-filter-dialog',false);
}
async function openFeatureOptions(){
 const groups=await page.locator('[data-filters] details').all();
 for(const group of groups)if(await group.locator('[name=features]').count()&&!await group.evaluate(node=>node.open))await group.locator(':scope > summary').click();
}
async function checkValue(name,value){const locator=page.locator('[data-filters] [name="'+name+'"]');const values=await locator.evaluateAll(elements=>elements.map(element=>element.value));const index=values.indexOf(value);assert.ok(index>=0,`Missing visible filter ${name}=${value}`);const input=locator.nth(index);if(!await input.isChecked())await input.locator('..').click();assert.equal(await input.isChecked(),true);}
async function galleryPhoto(index,total){await page.waitForFunction(({index,total})=>{const image=document.querySelector('[data-gallery-image]');return document.querySelector('[data-gallery-counter]')?.textContent===index+' / '+total&&image?.complete&&image.naturalWidth>0&&!document.querySelector('.gallery-stage')?.hasAttribute('aria-busy');},{index,total});}
async function idleForm(){await page.waitForFunction(()=>document.querySelector('#enquiry-dialog form')?.dataset.sending==='false');}
async function mediaAndMenu(width){
 await visit('/');
 if(width===1440){
  const hero=page.locator('.hero-search');await hero.locator('[name=purpose]').selectOption('rent');await hero.locator('[name=q]').fill('Palm Jumeirah');
  await hero.locator('[data-hero-filter-open]').click();await dialog('hero-filter-dialog');
  const draft=page.locator('[data-hero-filters]');
  assert.equal(await draft.evaluate(form=>new FormData(form).get('purpose')),'rent','The hero modal retains the entered transaction');
  assert.equal(await draft.locator('[name=q]').inputValue(),'Palm Jumeirah','The hero modal retains the entered query');
  await page.keyboard.press('Escape');await dialog('hero-filter-dialog',false);
  await page.setViewportSize({width:390,height:844});const mobile=page.locator('.hero-mobile-search');await mobile.waitFor({state:'visible'});
  await mobile.click();await dialog('hero-filter-dialog');
  assert.equal(await draft.evaluate(form=>new FormData(form).get('purpose')),'rent','Mobile CTA retains the desktop transaction');
  assert.equal(await draft.locator('[name=q]').inputValue(),'Palm Jumeirah','Mobile CTA retains the desktop query');
  await page.keyboard.press('Escape');await dialog('hero-filter-dialog',false);
  await page.setViewportSize({width:1440,height:900});await hero.locator('[name=purpose]').selectOption('buy');await hero.locator('[name=q]').fill('');
 }
 const video=page.locator('[data-hero-film]'),control=page.locator('[data-hero-film-control]');
 assert.equal(await video.count(),1,'The imported hero film is present');
 assert.equal(await video.evaluate(node=>node.paused),true,'Reduced motion starts paused');
 assert.equal(await video.getAttribute('src'),null,'Reduced motion does not preload the movie');
 await screenshot('home-static-'+width);
 await control.click();await page.waitForFunction(()=>{const video=document.querySelector('[data-hero-film]');return video&&!video.paused&&video.readyState>=2;});
 assert.equal(await control.getAttribute('aria-pressed'),'true');
 await control.click();await page.waitForFunction(()=>document.querySelector('[data-hero-film]')?.paused===true);assert.equal(await control.getAttribute('aria-pressed'),'false');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const video=document.querySelector('[data-hero-film]');return video&&!video.paused&&video.readyState>=2;});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-hero-film]')?.paused===true);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-hero-parallax]')).transform==='none');
 const menu=page.locator('.menu-toggle');await menu.click();await dialog('site-menu');
 for(let index=0;index<3;index++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#site-menu').contains(document.activeElement)),true,'Menu retains keyboard focus');}
 await page.keyboard.press('Escape');await dialog('site-menu',false);await focus(menu);
 await menu.click();await page.locator('#site-menu [data-enquiry]').click();await dialog('enquiry-dialog');await page.keyboard.press('Escape');await dialog('enquiry-dialog',false);await focus(menu);await overflow();
}
async function catalogueCounts(width){
 await visit('/properties/');
 assert.equal(await page.locator('[data-property-card]').count(),110);await count(49);await ids(buy.slice(0,24).map(p=>p.id));
 const cardTitles=await page.locator('[data-property-card]').evaluateAll(cards=>cards.map(card=>({id:card.dataset.id,raw:card.dataset.title,search:card.dataset.search,heading:card.querySelector('.property-card-heading h3')?.textContent?.trim(),detail:card.querySelector('.property-card-detail')?.textContent?.trim()||''})));
 const titleWords=value=>value.replace(/[|·]/g,' ').replace(/\s+/g,' ').trim();
 for(const property of properties){
  const card=cardTitles.find(card=>card.id===property.id);assert.ok(card,property.id);
  assert.equal(card.raw,property.title,'Raw sort title is preserved: '+property.id);
  assert.ok(card.search.includes(property.title),'Raw search title is preserved: '+property.id);
  assert.equal(titleWords([card.heading,card.detail].filter(Boolean).join(' ')),titleWords(approvedCaseTitles.get(property.title)||property.title),'All title phrases remain visible with only reviewed casing: '+property.id);
  assert.ok(![card.heading,card.detail].join(' ').includes('|'),'Source separators are presentation only: '+property.id);
 }

 await page.locator('[data-catalogue] button[data-purpose=rent]').click();await count(26);assert.equal(await page.locator('[data-property-card]:not([hidden])[data-development=true]').count(),0);
 await page.locator('[data-catalogue] button[data-purpose=developments]').click();await count(9);assert.equal(await page.locator('[data-property-card]:not([hidden])[data-development=true]').count(),9);
 await page.locator('[data-catalogue] button[data-purpose=all]').click();await count(84);
 for(const [status,expected] of [['archived',26],['sold',17],['rented',9],['all',110]]){
  await openFilters();await openFeatureOptions();await page.locator('[data-filters] [name=status]').selectOption(status);await applyFilters();await count(expected);
  if(status==='archived')await ids(old.slice(0,24).map(p=>p.id));
 }
 await openFilters();await openFeatureOptions();await page.locator('[data-filters] [name=status]').selectOption('current');await applyFilters();await page.locator('[data-catalogue] button[data-purpose=buy]').click();await count(49);await overflow();
 await screenshot('catalogue-'+width);
 await page.evaluate(()=>sessionStorage.removeItem('luxury-realty:catalogue'));
 const archivedFixture=old[0];await visit('/properties/'+archivedFixture.id+'/');
 const archiveBack=new URL(await page.locator('[data-property-return]').evaluate(node=>node.href));assert.equal(archiveBack.searchParams.get('status'),'archived','Direct archived links return to the archive');assert.equal(archiveBack.searchParams.get('purpose'),archivedFixture.purpose==='unknown'?'all':archivedFixture.purpose);assert.equal(await page.locator('.property-archive-notice').count(),1);
}
async function combinedFilters(width){
 await visit('/properties/');await openFilters();
 const form=page.locator('[data-filters]'),fixture=filterFixture,chosenFeatures=fixture.features.slice(0,2);
 await form.locator('[name=location]').selectOption(fixture.location);
 await checkValue('type',fixture.type);await checkValue('bedrooms',String(fixture.bedrooms));
 await form.locator('[name=minPrice]').fill(String(fixture.price));await form.locator('[name=maxPrice]').fill(String(fixture.price));
 await openFeatureOptions();for(const feature of chosenFeatures)await checkValue('features',feature);
 await applyFilters();
 const expected=buy.filter(p=>p.location===fixture.location&&p.type===fixture.type&&p.bedrooms===fixture.bedrooms&&p.price===fixture.price&&chosenFeatures.every(feature=>p.features.includes(feature))).map(p=>p.id);
 assert.ok(expected.includes(fixture.id));await count(expected.length);await ids(expected.slice(0,24));
 const url=page.url();await page.reload({waitUntil:'domcontentloaded'});await count(expected.length);await ids(expected.slice(0,24));assert.equal(comparableURL(page.url()),comparableURL(url));
 await openFilters();for(const feature of chosenFeatures){const inputs=form.locator('[name=features]');const values=await inputs.evaluateAll(nodes=>nodes.map(node=>node.value));assert.equal(await inputs.nth(values.indexOf(feature)).isChecked(),true);}
 // Invalid drafts cannot alter the applied result set or leak into history.
 await form.locator('[name=minPrice]').fill('9000000');await form.locator('[name=maxPrice]').fill('8000000');
 await page.waitForFunction(()=>/maximum price/i.test(document.querySelector('[data-filters] [data-price-error]')?.textContent||''));
 assert.equal(await form.locator('[data-filter-apply]').isDisabled(),true,'Invalid draft cannot be applied');
 assert.equal(await form.locator('[name=minPrice]').getAttribute('aria-invalid'),'true');
 assert.equal(comparableURL(page.url()),comparableURL(url));await count(expected.length);await ids(expected.slice(0,24));
 await page.keyboard.press('Escape');await dialog('catalogue-filter-dialog',false);
 await openFilters();assert.equal(Number((await form.locator('[name=minPrice]').inputValue()).replace(/[,\s]/g,'')),fixture.price,'Cancelled invalid draft is discarded');
 await page.keyboard.press('Escape');await dialog('catalogue-filter-dialog',false);
 // A directly linked invalid range still fails closed and survives reload.
 await visit('/properties/?minPrice=9000000&maxPrice=8000000');assert.equal(await page.locator('[data-result-count]').innerText(),'Check your price range');assert.deepEqual(await visibleIds(),[],'An invalid URL range cannot broaden results');
 assert.match(await page.locator('[data-empty-title]').innerText(),/price range/i);
 const invalidURL=comparableURL(page.url());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-result-count]')?.textContent==='Check your price range');assert.deepEqual(await visibleIds(),[]);assert.equal(comparableURL(page.url()),invalidURL);
 await page.locator('[data-empty-reset]').click();await count(49);
 await page.locator('[data-catalogue] button[data-purpose=rent]').click();await openFilters();await form.locator('[name=q]').fill('NoMatchingResidenceXYZ');await applyFilters();await count(0);await page.locator('[data-empty-reset]').click();await count(26);assert.equal(await page.locator('[data-catalogue] button[data-purpose=rent]').getAttribute('aria-pressed'),'true','Clear applied filters preserves rent');
 await page.locator('[data-catalogue] button[data-purpose=developments]').click();await openFilters();await form.locator('[name=q]').fill('NoMatchingResidenceXYZ');await applyFilters();await count(0);
 const emptyURL=comparableURL(page.url());await openFilters();await form.locator('[data-filter-reset]').click();await count(0);assert.equal(comparableURL(page.url()),emptyURL,'Reset only changes the draft');
 assert.equal(await form.evaluate(node=>new FormData(node).get('purpose')),'developments','Reset draft preserves the transaction');await applyFilters();await count(9);assert.equal(await page.locator('[data-catalogue] button[data-purpose=developments]').getAttribute('aria-pressed'),'true','Applied reset preserves developments');
 await visit('/properties/?bedrooms=2');const exactBeds=buy.filter(p=>p.bedrooms===2);await count(exactBeds.length);assert.ok(buy.some(p=>p.bedrooms>2),'The fixture distinguishes exact from minimum bedrooms');assert.equal(await page.locator('[data-property-card]:not([hidden])').evaluateAll(nodes=>nodes.every(node=>node.dataset.bedrooms==='2')),true);
 await overflow();
}
async function historyAndReturn(width){
 const sorted=[...buy].sort((a,b)=>a.price-b.price);
 await visit('/properties/?sort=price-asc&page=2');await count(49);await ids(sorted.slice(24,48).map(p=>p.id));
 const canonical=page.url();await page.reload({waitUntil:'domcontentloaded'});await ids(sorted.slice(24,48).map(p=>p.id));assert.equal(await page.locator('[data-sort]').inputValue(),'price-asc');
 await page.locator('[data-sort]').selectOption('price-desc');await page.waitForURL(url=>url.searchParams.get('sort')==='price-desc'&&!url.searchParams.has('page'));
 const descending=[...buy].sort((a,b)=>b.price-a.price);await ids(descending.slice(0,24).map(p=>p.id));
 await page.goBack();await page.waitForURL(url=>comparableURL(url)===comparableURL(canonical));await ids(sorted.slice(24,48).map(p=>p.id));
 const visible=page.locator('[data-property-card]:not([hidden])'),chosen=await visible.first().getAttribute('data-id'),link=visible.first().locator('a');
 await page.evaluate(chosen=>window.addEventListener('click',event=>{
  if(event.target instanceof Element&&event.target.closest('[data-property-card]')?.getAttribute('data-id')===chosen){
   sessionStorage.setItem('luxury-realty:qa-card-departure',JSON.stringify({url:location.pathname+location.search,saved:JSON.parse(sessionStorage.getItem('luxury-realty:catalogue')||'null')}));
  }
 },{once:true}),chosen);
 await link.click();await page.waitForURL(base+'/properties/'+chosen+'/');
 const departure=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('luxury-realty:qa-card-departure')||'null'));
 assert.ok(departure,'The real card click was observed after bubbling');
 assert.equal(comparableURL(departure.url),comparableURL(canonical),'Opening a card does not mutate catalogue URL or page');
 assert.equal(departure.saved?.propertyId,chosen,'The clicked property remains the saved return anchor');
 assert.equal(comparableURL(departure.saved?.url),comparableURL(canonical),'The stored catalogue retains its filters and page');
 const back=page.locator('[data-property-return]');assert.equal(comparableURL(await back.evaluate(node=>node.href)),comparableURL(canonical));
 const related=page.locator('.related-properties [data-property-card]').first(),relatedId=await related.getAttribute('data-id');assert.ok(relatedId&&relatedId!==chosen);
 await related.locator('a.property-card-link').click();await page.waitForURL(base+'/properties/'+relatedId+'/');
 const chain=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('luxury-realty:catalogue')||'null'));
 assert.equal(chain?.propertyId,chosen,'A related home retains the original return focus anchor');assert.equal(chain?.viewingId,relatedId,'Related navigation records the currently viewed home');assert.equal(chain?.scrollY,departure.saved.scrollY,'Related navigation retains the catalogue scroll position');assert.equal(comparableURL(chain?.url),comparableURL(canonical));
 assert.equal(comparableURL(await back.evaluate(node=>node.href)),comparableURL(canonical),'Related detail returns to the original filtered page');
 await back.click();await page.waitForURL(url=>comparableURL(url)===comparableURL(canonical));await ids(sorted.slice(24,48).map(p=>p.id));
 await page.waitForFunction(chosen=>document.activeElement?.closest('[data-property-card]')?.getAttribute('data-id')===chosen,chosen);
 assert.equal(await page.locator('[data-sort]').inputValue(),'price-asc');await overflow();
}
async function projectResidences(width){
 const matches=current.filter(property=>property.projectId==='atlantis'&&!property.isDevelopment);
 assert.equal(matches.length,26,'The source Atlantis collection has 26 current individual homes');
 assert.equal(matches.filter(property=>property.purpose==='buy').length,15,'Atlantis has 15 sale listings');
 assert.equal(matches.filter(property=>property.purpose==='rent').length,11,'Atlantis has 11 rental listings');
 await visit('/developments/atlantis/');
 const explore=page.getByRole('link',{name:'Explore matching properties',exact:true});
 const target=new URL(await explore.evaluate(link=>link.href));
 assert.equal(target.pathname,'/properties/');assert.equal(target.searchParams.get('purpose'),'all','The mixed project collection must preserve sale and rental offers');
 assert.ok(target.searchParams.get('q'),'The link retains the project query');
 await explore.click();await page.waitForURL(url=>comparableURL(url)===comparableURL(target));await count(26);
 assert.equal(await page.locator('[data-catalogue] button[data-purpose=all]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[name=status]').inputValue(),'current');
 await ids(matches.slice(0,24).map(property=>property.id));await screenshot('atlantis-matching-'+width);
 await page.getByRole('button',{name:'Page 2',exact:true}).click();await ids(matches.slice(24).map(property=>property.id));await count(26);
 assert.equal(await page.locator('[data-property-card]:not([hidden])[data-development=true]').count(),0,'Project enquiry records cannot replace individual homes');
 await overflow();
}
async function galleryAndFilm(width){
 await visit('/properties/'+detailFixture.id+'/');
 const titleParts=(approvedCaseTitles.get(detailFixture.title)||detailFixture.title).split('|').map(part=>part.replace(/\s+/g,' ').trim()).filter(Boolean);
 assert.equal(await page.locator('.property-heading h1').innerText(),titleParts[0],'Primary source title is visible');
 const subtitle=page.locator('.property-title-detail');
 assert.equal(await subtitle.count(),titleParts.length>1?1:0,'A subtitle exists only when the source has supporting phrases');
 if(titleParts.length>1)assert.equal(await subtitle.innerText(),titleParts.slice(1).join(' · '),'Every supporting phrase remains visible');
 assert.ok((await page.title()).startsWith(detailFixture.title+' | '),'The complete original SEO title remains unchanged');
 assert.ok((await page.locator('.property-richtext').innerText()).length>100,'The original property description is rendered');
 const trigger=page.locator('.property-hero [data-gallery]'),photos=JSON.parse(await trigger.getAttribute('data-gallery'));
 assert.equal(photos.length,detailFixture.photos.length);assert.ok(photos.length>=5);
 const failedUrl=new URL(photos.at(-1).src,base).href;
 let fail=true;
 await page.route(failedUrl,route=>fail?route.abort('failed'):route.continue());
 await trigger.click();await dialog('gallery-dialog');await galleryPhoto(1,photos.length);
 await page.keyboard.press('ArrowRight');await galleryPhoto(2,photos.length);
 const previous=await page.locator('[data-gallery-image]').getAttribute('src');
 expectedGalleryFailure=true;await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('[data-gallery-caption]')?.textContent.includes('could not be loaded'));
 assert.equal(await page.locator('[data-gallery-image]').getAttribute('src'),previous,'A failed photo does not blank the previous image');
 assert.equal(await page.locator('[data-gallery-counter]').innerText(),'2 / '+photos.length);
 if(width===390)await screenshot('gallery-error-'+width);
 fail=false;await page.keyboard.press('Home');await galleryPhoto(1,photos.length);await page.keyboard.press('End');await galleryPhoto(photos.length,photos.length);expectedGalleryFailure=false;
 assert.equal(new URL(await page.locator('[data-gallery-image]').getAttribute('src'),base).href,failedUrl);
 await page.keyboard.press('Escape');await dialog('gallery-dialog',false);await focus(trigger);await page.unroute(failedUrl);
 await page.evaluate(()=>scrollTo(0,0));await screenshot('property-'+width);
 if(detailFixture.id!==filmFixture.id)await visit('/properties/'+filmFixture.id+'/');
 const before=report.mockedFilms.length;assert.equal(await page.locator('#film-dialog iframe,#film-dialog video').count(),0,'No provider iframe before explicit play');
 const film=page.locator('[data-film-url]');const urls=await film.evaluateAll(nodes=>nodes.map(node=>node.dataset.filmUrl));const index=urls.findIndex(url=>/vimeo\.com/.test(url));assert.ok(index>=0);const chosenFilm=film.nth(index);
 await chosenFilm.click();await dialog('film-dialog');await page.locator('#film-dialog iframe').waitFor({state:'visible'});
 await page.frameLocator('#film-dialog iframe').locator('body').getByText('Synthetic film provider').waitFor();assert.equal(report.mockedFilms.length,before+1);
 const embedded=new URL(await page.locator('#film-dialog iframe').getAttribute('src'));assert.equal(embedded.hostname,'player.vimeo.com');assert.equal(embedded.searchParams.get('dnt'),'1');
 if(width===1440)await screenshot('film-dialog-'+width);
 await page.keyboard.press('Escape');await dialog('film-dialog',false);assert.equal(await page.locator('#film-dialog iframe,#film-dialog video').count(),0);await focus(chosenFilm);
}
async function enquiry(width){
 const trigger=page.locator('.property-advisor [data-enquiry]');await trigger.click();await dialog('enquiry-dialog');
 const sourceContext=await trigger.getAttribute('data-enquiry'),displayLabel=await trigger.getAttribute('data-enquiry-label');
 assert.ok(displayLabel&&!displayLabel.includes((await page.url()).split('/').filter(Boolean).at(-1)),'The visible enquiry label does not expose the property slug');
 const contextLabel=page.locator('[data-enquiry-context]');
 assert.equal(await contextLabel.textContent(),displayLabel,'The form retains the exact readable property label');
 assert.equal(await contextLabel.evaluate(node=>getComputedStyle(node).textTransform),'uppercase','The enquiry eyebrow uses the intended uppercase presentation');
 assert.equal(await contextLabel.innerText(),displayLabel.toUpperCase(),'The rendered enquiry eyebrow shows every label character in the intended case');
 assert.equal(await page.locator('#enquiry-dialog [data-enquiry-form]').getAttribute('data-context'),sourceContext,'The stable submission context remains unchanged');
 const form=page.locator('#enquiry-dialog [data-enquiry-form]'),submit=form.locator('[type=submit]');
 const initialCount=report.mockedEnquiries.length;
 await submit.click();assert.equal(report.mockedEnquiries.length,initialCount);assert.equal(await form.locator('[aria-invalid=true]').count(),3);
 await form.locator('[name=name]').fill('Content QA');await form.locator('[name=email]').fill('content-qa@example.invalid');await form.locator('[name=phone]').fill('+10000000000');await form.locator('[name=message]').fill('Synthetic migration verification. No real enquiry.');await form.locator('[name=consent]').check();
 apiMode='unavailable';await submit.click();await idleForm();assert.equal(report.mockedEnquiries.length,initialCount+1);assert.match(await form.locator('.form-status').innerText(),/Synthetic storage unavailable/);assert.equal(await form.locator('[name=email]').inputValue(),'content-qa@example.invalid');
 await page.keyboard.press('Escape');await dialog('enquiry-dialog',false);await trigger.click();await dialog('enquiry-dialog');apiMode='wrong-receipt';await submit.click();await idleForm();assert.notEqual(await form.getAttribute('data-complete'),'true');assert.match(await form.locator('.form-status').innerText(),/could not be confirmed/);
 const first=report.mockedEnquiries[initialCount],second=report.mockedEnquiries[initialCount+1];assert.equal(second.submissionId,first.submissionId,'Unchanged retry keeps UUID');assert.equal(second.startedAt,first.startedAt);
 await form.locator('[name=message]').fill('Changed synthetic migration verification. No real enquiry.');apiMode='field-error';await submit.click();await idleForm();const third=report.mockedEnquiries[initialCount+2];assert.notEqual(third.submissionId,first.submissionId,'Edited payload gets a new UUID');assert.equal(await form.locator('[name=email]').getAttribute('aria-invalid'),'true');
 heldResponse=new Promise(resolve=>releasePending=resolve);apiMode='held-success';await submit.click();await page.waitForFunction(()=>document.querySelector('#enquiry-dialog form')?.dataset.sending==='true');
 assert.equal(await form.locator('[name=email]').isDisabled(),true);assert.equal(await form.locator('textarea').isDisabled(),true);await form.evaluate(node=>node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await delay(80);assert.equal(report.mockedEnquiries.length,initialCount+4,'Pending duplicate does not POST');
 releasePending();await idleForm();assert.equal(await form.getAttribute('data-complete'),'true');assert.equal(report.mockedEnquiries[initialCount+3].submissionId,third.submissionId);assert.match(await form.locator('.form-status').innerText(),/has been saved/);assert.equal(await submit.isDisabled(),true);
 if(width===390)await screenshot('enquiry-confirmed-'+width);
 await page.keyboard.press('Escape');await dialog('enquiry-dialog',false);await focus(trigger);await trigger.click();await dialog('enquiry-dialog');assert.equal(await form.locator('[name=name]').inputValue(),'');assert.equal(await submit.isEnabled(),true);assert.notEqual(await form.getAttribute('data-submission-id'),third.submissionId);await page.keyboard.press('Escape');
}

try {
 assert.deepEqual(report.sourceCounts,{total:110,current:84,buy:49,rent:26,developments:9,archived:26});
 if(!process.env.BASE_URL){server=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(port),'--ignore-lock'],{cwd:process.cwd(),env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',chunk=>serverOutput=(serverOutput+chunk.toString()).slice(-120000));server.stderr.on('data',chunk=>serverOutput=(serverOutput+chunk.toString()).slice(-120000));}
 await ready();browser=await playwright[engine].launch({headless:true,handleSIGINT:false,handleSIGTERM:false});
 context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===new URL(base).origin&&url.pathname==='/api/enquiry'&&request.method()==='POST'){
   const payload=request.postDataJSON();report.mockedEnquiries.push({context:payload.context,submissionId:payload.submissionId,startedAt:payload.startedAt,message:payload.message});
   if(apiMode==='held-success')await heldResponse;
   const mode=apiMode;let status=201,body={ok:true,id:payload.submissionId};
   if(mode==='unavailable'){status=503;body={error:'Synthetic storage unavailable. Please retry.'};}
   if(mode==='wrong-receipt'){status=200;body={ok:true,id:'00000000-0000-4000-8000-000000000000'};}
   if(mode==='field-error'){status=422;body={error:'Please check the highlighted fields.',fields:{email:'Synthetic email confirmation required.'}};}
   if(status>=400)mockedApiFailures.add(request.url());
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  }
  if(['player.vimeo.com','www.youtube-nocookie.com','www.youtube.com','vimeo.com'].includes(url.hostname)){
   report.mockedFilms.push({url:request.url(),resourceType:request.resourceType()});
   return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><title>Mock film</title></head><body style="background:#111;color:white">Synthetic film provider</body></html>'});
  }
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){report.blockedWrites.push({url:request.url(),method:request.method()});return route.abort('blockedbyclient');}
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(20000);
 page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.on('console',message=>{
  if(message.type()!=='error')return;
  const location=message.location(),text=message.text();const expected=mockedApiFailures.has(location.url)||(expectedGalleryFailure&&/Failed to load resource|Load failed|NetworkError|NS_ERROR/i.test(text));
  report.consoleErrors.push({url:location.url,text,expected});
 });
 page.on('response',response=>{if(response.status()>=400&&/\/(assets|media|fonts)\//.test(new URL(response.url()).pathname))report.assetFailures.push({url:response.url(),status:response.status()});});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({reducedMotion:'reduce'});
  await step(width+' hero film, reduced motion, menu/dialog keyboard focus',()=>mediaAndMenu(width));
  await step(width+' catalogue counts, all four purposes and complete archives',()=>catalogueCounts(width));
  await step(width+' combined visible filters, exact bedrooms, invalid bounds and reset',()=>combinedFilters(width));
  await step(width+' sorting, pagination, reload, Back and property return focus',()=>historyAndReturn(width));
  await step(width+' Atlantis project link retains all 15 sale and 11 rental homes',()=>projectResidences(width));
  await step(width+' source detail, gallery failure/retry, keyboard and mocked film',()=>galleryAndFilm(width));
  await step(width+' mocked enquiry failure, retry, UUID and pending request protection',()=>enquiry(width));
  await step(width+' company, services, selling, contact, developments and insights routes',async()=>{
   for(const route of ['/about/','/services/','/sell/','/contacts/','/developments/','/insights/']){
    await visit(route);
    if(route==='/developments/')assert.equal(await page.locator('a.project-card').count(),7,'Seven sourced developments');
    if(route==='/contacts/')assert.match(await page.locator('.contact-details').innerText(),/Magnum Opus Tower/);
   }
   await screenshot('insights-'+width);
  });
 }
 assert.deepEqual(report.pageErrors,[],'No unhandled page errors');assert.deepEqual(report.assetFailures,[],'No missing local media/fonts');assert.deepEqual(report.blockedWrites,[],'No unexpected write requests');assert.deepEqual(report.consoleErrors.filter(error=>!error.expected),[],'No unexpected console errors');
 assert.equal(report.mockedEnquiries.length,8,'All eight synthetic POSTs were intercepted');assert.equal(report.mockedFilms.length,2,'Only two clicked source films loaded a mock provider');report.ok=true;
} catch(error){
 report.error=timeout?'The 285 second suite deadline elapsed. '+errorText(error):errorText(error);process.exitCode=1;
 if(page&&!page.isClosed()){
  try{report.failureState=await page.evaluate(()=>({url:location.href,result:document.querySelector('[data-result-count]')?.textContent,form:document.querySelector('[data-filters]')?Array.from(new FormData(document.querySelector('[data-filters]')).entries()):null,tabs:Array.from(document.querySelectorAll('[data-catalogue] button[data-purpose]')).map(button=>({purpose:button.dataset.purpose,pressed:button.getAttribute('aria-pressed')})),visibleCards:document.querySelectorAll('[data-property-grid] [data-property-card]:not([hidden])').length,focus:document.activeElement?.outerHTML.slice(0,500)}));await screenshot('failure');}catch{}
 }
}
finally {
 clearTimeout(deadline);await stopOwnedProcesses();
 const finalHashes=await sourceSnapshot();report.changedSources=[...new Set([...Object.keys(sourceHashes),...Object.keys(finalHashes)])].filter(file=>sourceHashes[file]!==finalHashes[file]);
 if(report.changedSources.length){report.ok=false;process.exitCode=1;report.error=(report.error?report.error+'\n':'')+'Source files changed during this run; the browser evidence is invalid: '+report.changedSources.join(', ');}
 await persist();console.log(JSON.stringify({ok:report.ok,engine,checks:report.checks.length,error:report.error,report:path.join(output,engine+'-report.json')},null,2));
}
