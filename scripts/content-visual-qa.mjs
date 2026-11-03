import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';

// Run separately from the functional suite: one owned preview, browser, context and page.
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const port=Number(process.env.QA_PORT||14329);
assert.ok(Number.isInteger(port)&&port>1024&&port<65536,'QA_PORT must be a valid unprivileged port');
const base=`http://127.0.0.1:${port}`;
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/content-migration');
await mkdir(output,{recursive:true});
const projects=JSON.parse(await readFile('src/data/source/projects.json','utf8'));
const ava=projects.find(project=>project.slug==='ava'&&project.publicationEligible);
const expectedFilm=ava?.sections.flatMap(section=>section.videos).find(video=>/^https:\/\/dl\.dropboxusercontent\.com\/.+\.mp4(?:\?|$)/i.test(video.url))?.url;
assert.ok(expectedFilm,'The AVA source must contain its original Dropbox MP4');
const filmHost=new URL(expectedFilm).hostname;
const report={project:'luxury-realty',engine:'chromium',base,startedAt:new Date().toISOString(),sourceHashes:{},editorialFilmEvidence:'docs/content-migration/video-visual-review.json',checks:[],screenshots:[],nativeFilms:[],pageErrors:[],consoleErrors:[],assetFailures:[],blockedWrites:[],visualOk:false,filmWiringOk:false,playbackVerified:false,ok:false};
for(const file of ['src/pages/index.astro','src/pages/about.astro','src/pages/services.astro','src/pages/sell.astro','src/pages/contacts.astro','src/pages/developments/index.astro','src/pages/developments/[slug].astro','src/styles/content.css','src/styles/migration.css','src/data/content.ts','src/data/source/projects.json','src/scripts/films.ts','scripts/content-visual-qa.mjs'])report.sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
let server,browser,context,page,cdp,serverOutput='',cleanup,expired=false,activeProbe=null;
const mediaRequests=new Map();
const errorText=error=>error?.stack||String(error);
async function stop(){
 return cleanup??=(async()=>{
  await Promise.race([browser?.close().catch(()=>{}),delay(4000)]);
  if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(1000)]);if(server.exitCode===null)server.kill('SIGKILL');}
 })();
}
async function persist(){report.finishedAt=new Date().toISOString();report.elapsedMs=Date.parse(report.finishedAt)-Date.parse(report.startedAt);await writeFile(path.join(output,'visual-report.json'),JSON.stringify(report,null,2));await writeFile(path.join(output,'visual-server.log'),serverOutput);}
// Leave up to seven seconds for cleanup/reporting within a 120-second run.
const deadline=setTimeout(()=>{expired=true;report.error='The visual QA deadline elapsed';void stop();},113000);
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{report.error='Interrupted by '+signal;void stop().then(persist).finally(()=>process.exit(code));});
async function ready(){
 const until=Date.now()+25000;
 while(Date.now()<until&&!expired){
  if(server.exitCode!==null)throw new Error('Astro exited '+server.exitCode+': '+serverOutput.slice(-3000));
  try{if((await fetch(base,{signal:AbortSignal.timeout(1200)})).ok)return;}catch{}
  await delay(150);
 }
 throw new Error('Preview startup timed out: '+serverOutput.slice(-3000));
}
async function screenshot(name,selector){
 const file='visual-'+name+'.png';
 await page.screenshot({path:path.join(output,file),fullPage:false,animations:'disabled',caret:'hide',timeout:6000});
 report.screenshots.push({file,route:new URL(page.url()).pathname,selector,viewport:page.viewportSize(),scrollY:await page.evaluate(()=>Math.round(scrollY))});
}
async function structure(){
 const state=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,h1:document.querySelectorAll('h1').length,title:document.querySelector('h1')?.textContent?.trim()}));
 assert.equal(state.h1,1,'Exactly one H1 on '+page.url());assert.ok(state.title,'A nonempty H1 on '+page.url());
 assert.ok(state.document<=state.viewport+1&&state.body<=state.viewport+1,'Horizontal overflow: '+JSON.stringify(state));
 return state;
}
async function visibleImages(){
 await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:5000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 try{
  await page.waitForFunction(()=>Array.from(document.images).filter(image=>{const r=image.getBoundingClientRect();return (image.getAttribute('src')||image.getAttribute('srcset'))&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});}).every(image=>image.complete&&image.naturalWidth>0),null,{timeout:6000});
 }catch(error){
  const failed=await page.evaluate(()=>Array.from(document.images).filter(image=>{const r=image.getBoundingClientRect();return (image.getAttribute('src')||image.getAttribute('srcset'))&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&(!image.complete||!image.naturalWidth);}).map(image=>({src:image.currentSrc||image.getAttribute('src'),alt:image.alt,complete:image.complete})));
  throw new Error('Visible photographs did not load: '+JSON.stringify(failed),{cause:error});
 }
 return page.evaluate(async()=>{
  const images=Array.from(document.images).filter(image=>{const r=image.getBoundingClientRect();return (image.getAttribute('src')||image.getAttribute('srcset'))&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});});
  await Promise.all(images.map(image=>image.decode()));
  return images.map(image=>({src:image.currentSrc,alt:image.alt,width:image.naturalWidth,height:image.naturalHeight}));
 });
}
async function frame(selector,name){
 const target=page.locator(selector).first();await target.waitFor({state:'visible'});
 await target.evaluate(element=>window.scrollTo({top:Math.max(0,scrollY+element.getBoundingClientRect().top-90),behavior:'instant'}));
 const images=await visibleImages(),layout=await structure();await screenshot(name,selector);
 return {selector,layout,visibleImages:images};
}
async function step(name,action){
 if(expired)throw new Error(report.error);
 const start=Date.now();
 try{const details=await action();report.checks.push({name,ok:true,elapsedMs:Date.now()-start,...details});console.log('PASS '+name);}
 catch(error){report.checks.push({name,ok:false,elapsedMs:Date.now()-start,error:errorText(error)});console.error('FAIL '+name+': '+error.message);try{await screenshot(name+'-failure','failure state');}catch{}if(expired)throw error;}
}
async function nativeFilm(width){
 const result={width,expectedSource:expectedFilm,wiringOk:false,playbackVerified:false,metadataStatus:'not-run',probeLimitMs:4500,downloadLimitBytesPerSecond:256*1024,receivedBytes:0,responses:[],networkErrors:[]};
 report.nativeFilms.push(result);activeProbe=result;
 // Genuine provider responses, deliberately limited to a metadata-only, low-bandwidth probe.
 // Pausing in the bubbling click event runs immediately after the site's native play() call.
 await page.evaluate(()=>document.addEventListener('click',function pauseForMetadata(event){if(!(event.target instanceof Element)||!event.target.closest('[data-film-url]'))return;const video=document.querySelector('#film-dialog video');if(video){video.pause();video.preload='metadata';}document.removeEventListener('click',pauseForMetadata);}));
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:result.downloadLimitBytesPerSecond,uploadThroughput:-1});
 try{
  const button=page.locator('.development-film [data-film-url]');assert.equal(await button.count(),1);
  assert.equal(new URL(await button.getAttribute('data-film-url')).href,new URL(expectedFilm).href,'AVA uses the exact source movie');
  await button.click();await page.waitForFunction(()=>document.querySelector('#film-dialog')?.open===true);
  const video=page.locator('#film-dialog video');assert.equal(await video.count(),1,'Source MP4 uses native video');assert.equal(await page.locator('#film-dialog iframe').count(),0);
  assert.equal(await video.evaluate(node=>node.src),new URL(expectedFilm).href);assert.equal(await video.evaluate(node=>node.paused),true,'The real movie stays paused during metadata inspection');result.wiringOk=true;
  try{await page.waitForFunction(()=>{const video=document.querySelector('#film-dialog video');return video&&(video.readyState>=1||video.error);},null,{timeout:result.probeLimitMs});}
  catch(error){if(error.name!=='TimeoutError')throw error;result.metadataStatus='provider-timeout';}
  result.state=await video.evaluate(node=>({src:node.src,readyState:node.readyState,networkState:node.networkState,paused:node.paused,duration:Number.isFinite(node.duration)?node.duration:null,width:node.videoWidth,height:node.videoHeight,error:node.error?{code:node.error.code,message:node.error.message}:null}));
  if(result.state.error)result.metadataStatus='provider-error';
  else if(result.state.readyState>=1&&result.state.width>0&&result.state.height>0)result.metadataStatus='metadata-ready';
  else if(result.metadataStatus==='not-run')result.metadataStatus='metadata-unconfirmed';
  await structure();await screenshot(width+'-ava-native-film','Real paused native player; metadata status: '+result.metadataStatus);
  console.log('MEDIA '+width+' AVA '+result.metadataStatus+' (playback not tested)');
 }finally{
  // End every outstanding movie fetch before removing the bandwidth limit.
  await page.evaluate(()=>{const video=document.querySelector('#film-dialog video');if(video){video.pause();video.removeAttribute('src');video.load();}}).catch(()=>{});
  if(!page.isClosed()){await page.keyboard.press('Escape').catch(()=>{});await page.waitForFunction(()=>!document.querySelector('#film-dialog')?.open,null,{timeout:2000}).catch(()=>{});}
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
  activeProbe=null;
 }
 return {nativeFilm:result};
}

try{
 await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
 server=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(port),'--ignore-lock'],{cwd:process.cwd(),env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',data=>{serverOutput+=data;});server.stderr.on('data',data=>{serverOutput+=data;});server.on('error',error=>{serverOutput+=errorText(error);});
 await ready();browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{const request=route.request();if(!['GET','HEAD','OPTIONS'].includes(request.method())){report.blockedWrites.push({method:request.method(),url:request.url()});return route.abort('blockedbyclient');}return route.continue();});
 page=await context.newPage();page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(12000);
 page.on('pageerror',error=>report.pageErrors.push({route:page.url(),message:error.message}));
 page.on('console',message=>{if(message.type()==='error'){const location=message.location();report.consoleErrors.push({route:page.url(),url:location.url,text:message.text(),externalFilm:location.url?new URL(location.url,base).hostname===filmHost:false});}});
 page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===base&&['image','font','stylesheet','script'].includes(response.request().resourceType()))report.assetFailures.push({url:response.url(),status:response.status()});});
 cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 cdp.on('Network.requestWillBeSent',event=>{if(activeProbe&&event.type==='Media')mediaRequests.set(event.requestId,activeProbe);});
 cdp.on('Network.dataReceived',event=>{const probe=mediaRequests.get(event.requestId);if(probe)probe.receivedBytes+=event.encodedDataLength||event.dataLength||0;});
 cdp.on('Network.responseReceived',event=>{const probe=mediaRequests.get(event.requestId);if(probe)probe.responses.push({url:event.response.url,status:event.response.status,mimeType:event.response.mimeType});});
 cdp.on('Network.loadingFailed',event=>{const probe=mediaRequests.get(event.requestId);if(probe)probe.networkErrors.push({error:event.errorText,cancelled:Boolean(event.canceled)});});
 const views=[
  {route:'/',name:'home',frames:[['.selection-heading','selection'],['.story-heading','story']]},
  {route:'/about/',name:'about',frames:[['.team-section .section-heading','team']]},
  {route:'/services/',name:'services',frames:[['.service-detail:first-child','content']]},
  {route:'/sell/',name:'sell',frames:[['.selling-process .section-heading','process']]},
  {route:'/contacts/',name:'contacts',frames:[['.contact-grid','content']]},
  {route:'/developments/',name:'developments',frames:[['.developments-collection .project-card:first-child','collection']]},
  {route:'/developments/ava-at-palm/',name:'ava',frames:[['.development-story:first-child','design']]},
  {route:'/developments/six-senses/',name:'six-senses',frames:[['.development-story:first-child','design']]},
 ];
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?900:844});
  for(const view of views){
   await step(width+'-'+view.name,async()=>{
    const response=await page.goto(base+view.route,{waitUntil:'domcontentloaded'});assert.equal(response?.status(),200,view.route);
    const heroImages=await visibleImages(),layout=await structure(),frames=[];
    if(view.name==='developments')assert.equal(await page.locator('a.project-card').count(),7,'All seven sourced projects are listed');
    for(const [selector,name] of view.frames)frames.push(await frame(selector,width+'-'+view.name+'-'+name));
    return {route:view.route,layout,heroImages,frames};
   });
   if(view.name==='ava'&&new URL(page.url()).pathname===view.route)await step(width+'-ava-film',()=>nativeFilm(width));
  }
 }
 report.visualOk=report.checks.filter(check=>!check.name.endsWith('-ava-film')).every(check=>check.ok)&&report.checks.filter(check=>!check.name.endsWith('-ava-film')).length===16&&report.pageErrors.length===0&&report.assetFailures.length===0&&report.blockedWrites.length===0&&report.consoleErrors.filter(error=>!error.externalFilm).length===0;
 report.filmWiringOk=report.nativeFilms.length===2&&report.nativeFilms.every(film=>film.wiringOk)&&report.checks.filter(check=>check.name.endsWith('-ava-film')).every(check=>check.ok);
 report.ok=report.visualOk&&report.filmWiringOk&&report.nativeFilms.every(film=>film.metadataStatus==='metadata-ready');
 if(!report.visualOk||!report.filmWiringOk)process.exitCode=1;else if(!report.ok)process.exitCode=2;
}catch(error){report.error=(expired?'Deadline elapsed. ':'')+errorText(error);process.exitCode=1;}
finally{clearTimeout(deadline);await stop();await persist();console.log(JSON.stringify({ok:report.ok,visualOk:report.visualOk,filmWiringOk:report.filmWiringOk,externalMetadata:report.nativeFilms.map(({width,metadataStatus,receivedBytes})=>({width,metadataStatus,receivedBytes})),playbackVerified:false,screenshots:report.screenshots.length,error:report.error,report:path.join(output,'visual-report.json')},null,2));}
