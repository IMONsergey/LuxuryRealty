import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const {chromium,webkit}=require('playwright');
const stage=process.env.AUDIT_STAGE||'after';
const baseline=stage.startsWith('before');
const engine=process.env.AUDIT_ENGINE||'chromium';
const root=path.resolve('.vercel/output/static');
const output=path.resolve('artifacts/pixel-audit-20261101-v2',stage,engine);
const port=Number(process.env.AUDIT_PORT||14312),base=`http://127.0.0.1:${port}`;
const report={stage,engine,processId:process.pid,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),indexHtmlSha256:createHash('sha256').update(await readFile(path.join(root,'index.html'))).digest('hex'),startedAt:new Date().toISOString(),productionOutput:true,routes:[],pages:[],states:[],readingPosition:[],pageErrors:[],assetErrors:[],mockedEnquiries:[],failures:[],passed:false};
report.nodeVersion=process.version;report.sourceHeadIsBase=true;
report.sourceFiles=[];
async function hashSource(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await hashSource(file);else report.sourceFiles.push({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}}
await hashSource('src');
for(const file of ['public/assets/hero-search.svg','public/assets/hero-chevron.svg','public/assets/hero-filter.svg'])report.sourceFiles.push({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
report.sourceFingerprint=createHash('sha256').update(JSON.stringify(report.sourceFiles)).digest('hex');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  let relative=decodeURIComponent(new URL(req.url,base).pathname),file=path.resolve(root,'.'+relative);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let status=200;
  try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');await stat(file);}catch{file=path.join(root,'404.html');status=404;}
  const data=await readFile(file);res.writeHead(status,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(500).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
async function discover(dir=''){
 for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
  const relative=path.join(dir,entry.name);
  if(entry.isDirectory())await discover(relative);
  else if(entry.name==='index.html')report.routes.push('/'+(dir?dir+'/':''));
 }
}
await discover();report.routes.sort();report.routes.push('/missing-page-for-visual-audit/');
const widths=process.env.AUDIT_WIDTHS?process.env.AUDIT_WIDTHS.split(',').map(Number):baseline?[1440,320]:[1440,390];
const selectedRoutes=process.env.AUDIT_ROUTES?process.env.AUDIT_ROUTES.split(','):report.routes;
report.coverage={widths,selectedRoutes,sections:process.env.AUDIT_SECTIONS!=='0',states:process.env.AUDIT_STATES!=='0',only:process.env.AUDIT_ONLY||null};
let priorEvidence=null;
if(process.env.AUDIT_REUSE_PASSED){
 const file=path.resolve(process.env.AUDIT_REUSE_PASSED),raw=await readFile(file);
 priorEvidence=JSON.parse(raw);
 assert.equal(priorEvidence.sourceFingerprint,report.sourceFingerprint,'Cannot reuse captures from different application source');
 assert.equal(priorEvidence.indexHtmlSha256,report.indexHtmlSha256,'Cannot reuse captures from a different production build');
 assert.equal(priorEvidence.engine,engine);assert.ok(priorEvidence.finishedAt,'Cannot reuse an unfinished run');
 assert.deepEqual(priorEvidence.pageErrors,[]);assert.deepEqual(priorEvidence.assetErrors,[]);
 report.reusedEvidence={file:path.relative(process.cwd(),file),sha256:createHash('sha256').update(raw).digest('hex'),finishedAt:priorEvidence.finishedAt};
}
const slug=route=>route==='/'?'home':route.replace(/^\/+|\/+$/g,'').replaceAll('/','-');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
async function context(width,reducedMotion='no-preference',heightOverride,options={}){
 const height=heightOverride||(width===1920?1080:width===768?1024:width===1024?768:width===320?740:width===390?844:900);
 const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<=1024,isMobile:width<768,deviceScaleFactor:1,reducedMotion,...options});
 if(process.env.AUDIT_TRACE_MEDIA==='1')await ctx.addInitScript(()=>{
  const nativeMatchMedia=window.matchMedia.bind(window);const trace=[];window.__auditMediaTrace=trace;
  const nativeScrollTo=window.scrollTo.bind(window);
  window.scrollTo=(...args)=>{const before=scrollY;nativeScrollTo(...args);trace.push({kind:'scrollTo',args,before,after:scrollY,height:document.documentElement.scrollHeight,time:performance.now(),stack:new Error().stack?.split('\n').slice(1,5)});};
  window.matchMedia=query=>{
   const media=nativeMatchMedia(query);
   return new Proxy(media,{get(target,key){
    const value=Reflect.get(target,key,target);
    if(key==='matches'&&query.includes('prefers-reduced-motion'))trace.push({query,value,fresh:nativeMatchMedia(query).matches,y:scrollY,time:performance.now()});
    return typeof value==='function'?value.bind(target):value;
   }});
  };
 });
 await ctx.route('**/api/enquiry',async route=>{
  const payload=route.request().postDataJSON();report.mockedEnquiries.push({context:payload.context,submissionId:payload.submissionId});
  await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,id:payload.submissionId})});
 });
 const page=await ctx.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.pageErrors.push({url:page.url(),error:e.message}));
 page.on('response',r=>{if(r.status()>=400&&/\/(assets|fonts|_astro)\//.test(r.url()))report.assetErrors.push({url:r.url(),status:r.status()});});
 return {ctx,page};
}
async function ready(page){await page.evaluate(()=>document.fonts.ready);await wait(1150);}
async function walk(page){
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 let bottom=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
 for(let y=0;y<=bottom;y+=650){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await wait(105);}
 await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await wait(1000);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await wait(250);
}
async function inspect(page){return await page.evaluate(()=>{
 const glyph=/[←-⇿↗↘↙↖›‹»«⌄⌃⌵⟶⟵➜➝➞➟➠➡➤×✕✖]/;
 const text=[],overflowText=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 for(let n=walker.nextNode();n;n=walker.nextNode()){
  const el=n.parentElement;if(!el||el.closest('script,style,svg'))continue;
  const value=n.textContent.trim();
  if(glyph.test(value)||(/^[+−-]$/.test(value)&&el.closest('button,summary')))text.push({tag:el.tagName,class:el.className,text:value});
  if(value&&!el.closest('[data-rail],dialog:not([open]),[hidden]')){
   const range=document.createRange();range.selectNodeContents(n);const rect=range.getBoundingClientRect();
   if(rect.width>0&&rect.height>0&&rect.right>document.documentElement.clientWidth+1)overflowText.push({tag:el.tagName,class:el.className,text:value.slice(0,100),rect:rect.toJSON(),parentWidth:el.clientWidth,scrollWidth:el.scrollWidth,fontSize:getComputedStyle(el).fontSize,whiteSpace:getComputedStyle(el).whiteSpace});
  }
 }
 const pseudo=[];
 for(const el of document.querySelectorAll('a,button,summary,span'))for(const position of ['::before','::after']){
  const content=getComputedStyle(el,position).content;
  if(glyph.test(content)||/^['\"][+−-]['\"]$/.test(content))pseudo.push({tag:el.tagName,class:el.className,position,content});
 }
 const broken=[...document.images].filter(img=>img.getAttribute('src')&&img.getBoundingClientRect().width>0&&img.getBoundingClientRect().height>0&&(!img.complete||!img.naturalWidth)).map(img=>({src:img.currentSrc||img.src,loading:img.loading}));
 const clippedText=[...document.querySelectorAll('h1,h2,h3,.button,.pill-button,.back-link,.text-link,.form-status')].filter(el=>{
  const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.closest('[data-rail],dialog:not([open]),[hidden]')&&(r.left< -1||r.right>innerWidth+1);
 }).map(el=>({tag:el.tagName,class:el.className,text:el.textContent.trim().slice(0,100),rect:el.getBoundingClientRect().toJSON()}));
 const overflowElements=[...document.body.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>document.documentElement.clientWidth+1&&!el.closest('[data-rail],dialog:not([open]),[hidden]');}).map(el=>({tag:el.tagName,class:el.getAttribute('class'),text:el.textContent.trim().slice(0,60),rect:el.getBoundingClientRect().toJSON()}));
 return {h1:document.querySelectorAll('h1').length,viewport:innerWidth,layoutViewport:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,textGlyphs:text,pseudoGlyphs:pseudo,broken,clippedText,overflowElements,overflowText,icons:[...document.querySelectorAll('svg.ui-icon')].map(el=>({viewBox:el.getAttribute('viewBox'),ariaHidden:el.getAttribute('aria-hidden'),focusable:el.getAttribute('focusable')}))};
});}
async function snap(page,name,fullPage=false){const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage,timeout:45000});return path.relative(process.cwd(),file);}
async function captureRoute(route,width){
 const {ctx,page}=await context(width);const item={route,width};
 try{
  item.status=(await page.goto(base+route,{waitUntil:'load'}))?.status();item.viewport=page.viewportSize();await ready(page);await walk(page);item.inspection=await inspect(page);
  item.screenshot=await snap(page,`${slug(route)}-${width}`,true);
  assert.equal(item.status,route.includes('missing-page')?404:200);assert.equal(item.inspection.h1,1);
  assert.ok(item.inspection.documentWidth<=width+1,`Document overflow ${item.inspection.documentWidth}`);
  assert.deepEqual(item.inspection.broken,[],'Unloaded or broken page images');
  if(!baseline){
   assert.deepEqual(item.inspection.textGlyphs,[],'Text arrows/close/plus icons remain');assert.deepEqual(item.inspection.pseudoGlyphs,[],'Generated text icons remain');
   assert.deepEqual(item.inspection.clippedText,[],'Text/control exceeds horizontal viewport');
   for(const icon of item.inspection.icons){assert.equal(icon.viewBox,'0 0 24 24');assert.equal(icon.ariaHidden,'true');assert.equal(icon.focusable,'false');}
   if(route==='/'&&width===1440){
    item.heroSearch=await page.locator('.hero-search').evaluate(form=>[...form.children].map(el=>({rect:el.getBoundingClientRect().toJSON(),background:getComputedStyle(el).backgroundColor,borderRadius:getComputedStyle(el).borderRadius})));
    const sourceOffset=await page.evaluate(()=>(document.body.getBoundingClientRect().width-1440)/2);
    item.heroSearchScrollbarOffset=sourceOffset;
    for(const [i,expected] of [[165,191],[368,622],[1002,70],[1084,191]].entries()){
     assert.ok(Math.abs(item.heroSearch[i].rect.x-expected[0]-sourceOffset)<=1,'Hero search control horizontal placement');
     assert.ok(Math.abs(item.heroSearch[i].rect.width-expected[1])<=1,'Hero search control width');
     assert.equal(item.heroSearch[i].rect.y,691);assert.equal(item.heroSearch[i].rect.height,70);assert.equal(item.heroSearch[i].borderRadius,'12px');
    }
    assert.equal(item.heroSearch[3].background,'rgb(255, 255, 255)');
   }
   if(route==='/contacts/'&&width===320){
    item.email=await page.locator('.contact-details .email-domain').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,lines:range.getClientRects().length,rect:el.getBoundingClientRect().toJSON()};});
    assert.equal(item.email.lines,1,'Contact email domain wraps onto an orphan line');assert.ok(item.email.rect.right<=320,'Contact email domain exceeds viewport');
    await page.locator('.contact-details').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));await wait(400);
    item.contactSection=await snap(page,'contacts-320-details');
   }
   if(route.startsWith('/properties/')&&route!=='/properties/'){
    item.advisorPrice=await page.locator('.advisor-price').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,textWidth:range.getBoundingClientRect().width,availableWidth:el.clientWidth,fontSize:getComputedStyle(el).fontSize};});
    assert.ok(item.advisorPrice.textWidth<=item.advisorPrice.availableWidth+1,'Advisor price exceeds its content column');
    if(width===320){await page.locator('.advisor-sticky').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));await wait(400);item.advisorSection=await snap(page,`${slug(route)}-320-advisor`);}
   }
  }
  if(route==='/'&&process.env.AUDIT_SECTIONS!=='0'){
   item.sections=[];item.sectionStates=[];
   for(const selector of ['.home-hero','.selections','.home-developments','.home-services','.home-story','.consultation','.home-insights','.site-footer']){
    const loc=page.locator(selector);await loc.evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));await wait(1050);
    item.sections.push(await snap(page,`home-${width}-${selector.slice(1)}`));
    item.sectionStates.push(await page.evaluate(selector=>({selector,scrollY,headerClass:document.querySelector('.site-header')?.className,headerBackground:getComputedStyle(document.querySelector('.site-header')).backgroundColor,headerBlur:getComputedStyle(document.querySelector('.site-header')).backdropFilter}),selector));
   }
  }
 }catch(error){item.error=error.stack;report.failures.push({route,width,error:error.message});}
 finally{report.pages.push(item);await ctx.close();}
}
async function stateCapture(width){
 const {ctx,page}=await context(width);const saved=[],focusTrace=[];
 const capture=async name=>{await wait(350);saved.push(await snap(page,`state-${width}-${name}`));};
 try{
  await page.goto(base,{waitUntil:'load'});await ready(page);
  await page.locator('.menu-toggle').focus();await page.keyboard.press('Enter');await page.locator('#site-menu[open]').waitFor();await wait(400);await capture('menu-keyboard');
  for(let i=0;i<22;i++){
   await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,className:document.activeElement?.className,href:document.activeElement?.getAttribute('href'),within:!!document.activeElement?.closest('#site-menu'),documentFocus:document.hasFocus(),menuOpen:document.querySelector('#site-menu')?.open}));
   // Native dialogs permit the browser chrome to receive focus at the boundary.
   // A focused document must keep keyboard focus inside the open modal.
   focusTrace.push(focus);assert.ok(focus.within||!focus.documentFocus,'Menu focus reached the background page: '+JSON.stringify(focus));
  }
  await page.keyboard.press('Escape');assert.ok(await page.locator('.menu-toggle').evaluate(el=>el===document.activeElement));
  await page.locator('.menu-toggle').click();await page.locator('#site-menu [data-enquiry]').click();await page.locator('#enquiry-dialog[open]').waitFor();await wait(400);await capture('enquiry');
  await page.locator('#enquiry-dialog [type=submit]').click();await capture('enquiry-validation');
  const form=page.locator('#enquiry-dialog form');await form.locator('[name=name]').fill('Visual QA');await form.locator('[name=email]').fill('qa@example.invalid');await form.locator('[name=phone]').fill('+10000000000');await form.locator('[name=message]').fill('Mock-only visual audit.');await form.locator('[name=consent]').check();await wait(900);await form.locator('[type=submit]').click();await form.locator('[data-submit-label]').filter({hasText:'Enquiry received'}).waitFor();await capture('enquiry-success-mocked');await page.keyboard.press('Escape');
  await page.goto(base+'/properties/',{waitUntil:'load'});await ready(page);
  if(width<=900)await page.locator('.filter-disclosure>summary').click();
  await page.locator('.catalogue').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));await capture('filters-open');
  const filters=page.locator('[data-filters]');await filters.locator('[name=q]').fill('NotARealListingXYZ');await filters.locator('[type=submit]').click();await page.locator('[data-no-results]').waitFor();await capture('filters-empty');
  if(width<=900)await page.locator('.filter-disclosure>summary').click();await filters.locator('[type=reset]').click();
  await page.goto(base+'/properties/?q=Dubai&beds=6&type=villa&features=pool&sort=price-high',{waitUntil:'load'});await ready(page);
  const card=page.locator('[data-property-card]:not([hidden]) a').first();await card.click();await page.waitForURL(/\/properties\/dubai-hills-/);await ready(page);await page.locator('.property-page .back-link').click();await page.waitForURL(/features=pool/);await page.waitForFunction(()=>document.activeElement?.matches('[data-property-card] a'));await capture('filters-return-focus');
  await page.locator('[data-property-card]:not([hidden]) a').first().click();await page.waitForURL(/\/properties\/dubai-hills-/);await ready(page);await page.locator('.property-hero [data-gallery]').click();await page.waitForFunction(()=>document.querySelector('[data-gallery-image]')?.naturalWidth>0);await wait(400);await capture('gallery');
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-gallery-counter]')?.textContent==='2 / 4');await capture('gallery-next');await page.keyboard.press('Escape');
  await page.goto(base+'/insights/',{waitUntil:'load'});await ready(page);await page.locator('[data-category=places]').click();await capture('insights-filter');
  await page.goto(base+'/contacts/',{waitUntil:'load'});await ready(page);await page.locator('.contact-form-panel [type=submit]').click();await capture('contact-validation');
  if(width===1440){
   await page.goto(base,{waitUntil:'load'});await ready(page);await page.locator('.service>summary').nth(1).click();await page.locator('.service>summary').nth(2).click();await wait(500);assert.equal(await page.locator('.service[open]').count(),1);await capture('services-interrupted');
   await page.setViewportSize({width:390,height:844});await wait(450);assert.equal(await page.locator('[data-hero-parallax]').evaluate(el=>getComputedStyle(el).transform),'none');
   await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await wait(1200);await capture('resize-desktop-return');
   await page.emulateMedia({reducedMotion:'reduce'});await wait(350);assert.equal(await page.locator('[data-hero-parallax]').evaluate(el=>getComputedStyle(el).transform),'none');await capture('reduced-motion-live');
   await page.emulateMedia({reducedMotion:'no-preference'});await wait(900);await capture('motion-restored');
  }
 }catch(error){report.failures.push({state:true,width,error:error.stack});}
 finally{report.states.push({width,screenshots:saved,focusTrace});await ctx.close();}
}
async function readingPosition(){
 const {ctx,page}=await context(1440);const checks=[];
 const sample=()=>page.evaluate(()=>({scrollY,anchorTop:document.querySelector('#services')?.getBoundingClientRect().top,documentHeight:document.documentElement.scrollHeight,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches}));
 try{
  await page.goto(base,{waitUntil:'load'});await ready(page);
  await page.locator('#services').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-160,behavior:'instant'}));await wait(1300);
  for(const preference of ['reduce','no-preference']){
   const before=await sample();await page.emulateMedia({reducedMotion:preference});await wait(200);const early=await sample();await wait(1200);const after=await sample();
   const entry={preference,before,early,after};checks.push(entry);entry.screenshot=await snap(page,`reading-${preference}`);
   assert.ok(before.scrollY>500,'Reading position was not below the hero');
   assert.ok(Math.abs(after.scrollY-before.scrollY)<=3,`Motion preference changed reading scroll ${before.scrollY} -> ${after.scrollY}`);
   assert.ok(Math.abs(after.anchorTop-before.anchorTop)<=3,`Motion preference moved reading anchor ${before.anchorTop} -> ${after.anchorTop}`);
  }
  if(process.env.AUDIT_RESIZE_READING==='1')for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
   const before=await sample();await page.setViewportSize(viewport);await wait(1400);const after=await sample();
   const entry={action:'reading-resize',viewport,before,after};checks.push(entry);entry.screenshot=await snap(page,`reading-resize-${viewport.width}`);
   assert.ok(Math.abs(after.anchorTop-before.anchorTop)<=3,`Resize moved reading section ${before.anchorTop} -> ${after.anchorTop}`);
  }
  const before=await sample();await page.locator('.menu-toggle').click();await page.locator('#site-menu[open]').waitFor();await page.keyboard.press('Escape');await wait(400);const after=await sample();checks.push({action:'menu-open-close',before,after});assert.ok(Math.abs(after.scrollY-before.scrollY)<=3,'Menu changed reading position');
 }catch(error){report.failures.push({readingPosition:true,error:error.stack});}
 finally{report.readingPosition.push(...checks);if(process.env.AUDIT_TRACE_MEDIA==='1')report.mediaTrace=await page.evaluate(()=>window.__auditMediaTrace);await ctx.close();}
}
async function boundaryChecks(){
 report.boundaryChecks=[];
 const prices=await context(320);
 try{
  await prices.page.goto(base+'/properties/dubai-hills-residence/',{waitUntil:'load'});await ready(prices.page);
  for(const width of [320,371,375,380,390,1440]){
   await prices.page.setViewportSize({width,height:width>700?900:844});await wait(250);
   const price=await prices.page.locator('.advisor-price').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,textWidth:range.getBoundingClientRect().width,availableWidth:el.clientWidth,fontSize:getComputedStyle(el).fontSize,documentWidth:document.documentElement.scrollWidth};});
   const passed=price.textWidth<=price.availableWidth+1&&price.documentWidth<=width+1;report.boundaryChecks.push({type:'price-width',width,...price,passed});
   if(!passed)report.failures.push({boundary:'price-width',width,...price});
  }
 }finally{await prices.ctx.close();}
 for(const viewport of [{width:320,height:740},{width:844,height:390}])for(const id of ['site-menu','enquiry-dialog']){
  // Playwright's mobile WebKit does not expose wheel input. Use the same compact
  // CSS viewport with desktop WebKit for this native-wheel check; mobile WebKit
  // states and Chromium native-touch gestures are separate reported coverage.
  const isMobile=engine!=='webkit'&&viewport.width<768;
  const {ctx,page}=await context(viewport.width,'no-preference',viewport.height,{isMobile});
  try{
   await page.goto(base,{waitUntil:'load'});await ready(page);
   if(id==='site-menu')await page.locator('.menu-toggle').click();else await page.locator('main [data-enquiry]').first().click();
   await page.locator(`#${id}[open]`).waitFor();await wait(400);
   const close=page.locator(`#${id} [data-close-dialog]`);
   const sample=()=>close.evaluate(el=>{const r=el.getBoundingClientRect(),dialog=el.closest('dialog'),d=dialog.getBoundingClientRect(),style=getComputedStyle(dialog),x=r.left+r.width/2,y=r.top+r.height/2;return {rect:r.toJSON(),expectedOpening:dialog.id==='enquiry-dialog'?{x:d.right-parseFloat(style.borderRightWidth)-18-r.width,y:d.top+parseFloat(style.borderTopWidth)+18}:null,scrollTop:dialog.scrollTop,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,inViewport:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,hit:!!document.elementFromPoint(x,y)?.closest('[data-close-dialog]'),position:getComputedStyle(el).position};});
   const before=await sample();
   if(before.expectedOpening&&(Math.abs(before.rect.x-before.expectedOpening.x)>1||Math.abs(before.rect.y-before.expectedOpening.y)>1))report.failures.push({boundary:'modal-opening-geometry',id,viewport,before});
   await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.wheel(0,4000);await wait(600);const after=await sample();
   const entry={type:'modal-scroll',id,viewport,isMobile,method:'native wheel',before,after,screenshot:await snap(page,`${id}-${viewport.width}x${viewport.height}-wheel-bottom`),passed:after.inViewport&&after.hit};report.boundaryChecks.push(entry);
   if(!entry.passed)report.failures.push({boundary:'modal-close',id,viewport,method:entry.method,after});
   if(engine==='chromium'){
    await page.mouse.wheel(0,-4000);await wait(400);const session=await ctx.newCDPSession(page);
    for(let swipe=0;swipe<4;swipe++){
     const x=viewport.width/2,startY=viewport.height*.78,endY=viewport.height*.25;
     await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:startY}]});
     for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:startY+(endY-startY)*i/8}]});await wait(25);}
     await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(220);
    }
    await wait(400);const touch=await sample();const touchEntry={type:'modal-scroll',id,viewport,method:'native Chromium touch',after:touch,screenshot:await snap(page,`${id}-${viewport.width}x${viewport.height}-touch-bottom`),passed:touch.inViewport&&touch.hit};report.boundaryChecks.push(touchEntry);
    if(!touchEntry.passed)report.failures.push({boundary:'modal-close',id,viewport,method:touchEntry.method,after:touch});
    await session.detach();
   }
   if(id==='site-menu'){
    const lower=page.locator('#site-menu [data-enquiry]');await lower.focus();const reachable=await lower.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});report.boundaryChecks.push({type:'menu-lower-control',viewport,reachable});assert.ok(reachable,'Lower menu enquiry control is unreachable');
   }
   const final=await sample();if(final.inViewport&&final.hit){await page.mouse.click(final.rect.x+final.rect.width/2,final.rect.y+final.rect.height/2);const closed=!(await page.locator(`#${id}`).evaluate(el=>el.open));report.boundaryChecks.push({type:'pointer-close',id,viewport,closed});assert.ok(closed,'Pointer close did not close the modal');}else await page.keyboard.press('Escape');
  }catch(error){report.failures.push({boundary:'modal-interaction',id,viewport,error:error.stack});}
  finally{await ctx.close();}
 }
}
async function heroMedia(){
 report.heroMedia=[];
 const {ctx,page}=await context(390);
 const sampleMedia=locator=>locator.evaluate(async el=>{
  const decoded=new Image();decoded.src=el.currentSrc;await decoded.decode();const r=el.getBoundingClientRect(),ratio=decoded.naturalWidth/decoded.naturalHeight;
  const requiredWidth=Math.max(r.width,r.height*ratio)*devicePixelRatio;
  const largestCandidate=Math.max(...el.srcset.split(',').map(candidate=>Number(candidate.trim().match(/ (\d+)w$/)?.[1]||0)));
  return {currentSrc:el.currentSrc,sizes:el.sizes,decodedWidth:decoded.naturalWidth,decodedHeight:decoded.naturalHeight,renderedBox:{width:r.width,height:r.height},deviceScaleFactor:devicePixelRatio,requiredWidth,largestCandidate,sourceLimited:requiredWidth>largestCandidate,effectiveDensity:decoded.naturalWidth/requiredWidth};
 });
 try{
  if(process.env.AUDIT_MEDIA_CARDS_ONLY!=='1')for(const route of ['/developments/ava-at-palm/','/developments/orla/','/developments/six-senses/','/developments/atlantis/','/properties/dubai-hills-residence/']){
   await page.goto(base+route,{waitUntil:'load'});await ready(page);
   const media=await sampleMedia(page.locator('.development-detail-hero>img,.property-hero>img'));
   const passed=media.decodedWidth>=Math.min(media.requiredWidth,media.largestCandidate)*.95;
   report.heroMedia.push({route,...media,passed,screenshot:await snap(page,`${slug(route)}-390-media`)});
   if(!passed)report.failures.push({heroMedia:route,...media});
  }
 }finally{await ctx.close();}
 // A fresh context avoids a previously loaded full-size hero masking bad card sizes.
 const cards=await context(390);
 try{
  await cards.page.goto(base+'/developments/',{waitUntil:'load'});await ready(cards.page);
  for(let index=0;index<4;index++){
   const image=cards.page.locator('.project-card>img').nth(index);await image.scrollIntoViewIfNeeded();await wait(1050);const media=await sampleMedia(image);
   const passed=media.decodedWidth>=Math.min(media.requiredWidth,media.largestCandidate)*.95;
   report.heroMedia.push({route:'/developments/',selector:'.project-card>img',index,...media,passed,screenshot:await snap(cards.page,`project-card-${index+1}-390-media`)});
   if(!passed)report.failures.push({projectCard:index,...media});
  }
 }finally{await cards.ctx.close();}
}
async function footerGeometry(){
 report.footerGeometry=[];
 const {ctx,page}=await context(1024);
 try{
  await page.goto(base,{waitUntil:'load'});await ready(page);
  for(const width of [320,390,768,1000,1001,1024,1100,1101,1200,1440,1920]){
   await page.setViewportSize({width,height:width<700?844:900});await wait(250);
   await page.locator('.site-footer').scrollIntoViewIfNeeded();await wait(250);
   const geometry=await page.locator('.footer-main').evaluate(el=>{
    const bounds=el.getBoundingClientRect();
    const items=[...el.querySelectorAll('.footer-nav a,.footer-nav button,.footer-contacts dd')].map(item=>{
     const range=document.createRange();range.selectNodeContents(item);const rect=range.getBoundingClientRect();
     return {text:item.textContent.trim(),rect:rect.toJSON(),inside:rect.left>=bounds.left-1&&rect.right<=bounds.right+1};
    });
    return {bounds:bounds.toJSON(),columns:getComputedStyle(el).gridTemplateColumns,items};
   });
   const passed=geometry.items.every(item=>item.inside);
   const entry={width,...geometry,passed};
   if([320,1024,1101,1440].includes(width))entry.screenshot=await snap(page,`footer-${width}`);
   report.footerGeometry.push(entry);if(!passed)report.failures.push({footer:width,items:geometry.items.filter(item=>!item.inside)});
  }
 }finally{await ctx.close();}
}
try{
 browser=await ({chromium,webkit}[engine]).launch({headless:true});report.browserVersion=browser.version();
 if(engine==='chromium'&&!['reading-position','states','boundaries','hero-media','footer'].includes(process.env.AUDIT_ONLY)){
  for(const width of widths)for(const route of selectedRoutes){
   const previous=priorEvidence?.pages.find(item=>item.route===route&&item.width===width&&!item.error&&item.inspection&&item.screenshot);
   if(previous)report.pages.push({...previous,reusedFrom:report.reusedEvidence.file});else await captureRoute(route,width);
   await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(`${stage}: ${route} @${width}${previous?' (reused passed evidence)':''}`);
  }
  if(baseline&&!process.env.AUDIT_WIDTHS&&!process.env.AUDIT_ROUTES)for(const width of [1920,390,768,1024])await captureRoute('/',width);
 }
 if(!['reading-position','boundaries','hero-media','footer'].includes(process.env.AUDIT_ONLY)&&process.env.AUDIT_STATES!=='0')for(const width of (process.env.AUDIT_STATE_WIDTHS||'1440,390').split(',').map(Number))await stateCapture(width);
 if(process.env.AUDIT_ONLY==='boundaries')await boundaryChecks();
 else if(process.env.AUDIT_ONLY==='hero-media')await heroMedia();
 else if(process.env.AUDIT_ONLY==='footer')await footerGeometry();
 else if(process.env.AUDIT_STATES!=='0'||process.env.AUDIT_ONLY==='reading-position')await readingPosition();
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.assetErrors,[]);assert.deepEqual(report.failures,[]);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({stage,engine,pages:report.pages.length,states:report.states.length,failures:report.failures,pageErrors:report.pageErrors,passed:report.passed,report:path.join(output,'report.json')},null,2));
}
