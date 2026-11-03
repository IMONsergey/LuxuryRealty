import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';

// Narrow verification for the reviewed homepage agency identity correction.
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const playwright=require('playwright'),engine=process.env.ENGINE||'chromium';
assert.ok(['chromium','webkit','firefox'].includes(engine),'Unsupported ENGINE');
const port=Number(process.env.QA_PORT||14330);
assert.ok(Number.isInteger(port)&&port>1024&&port<65536,'QA_PORT must be an unprivileged port');
const base='http://127.0.0.1:'+port;
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/content-migration');
await mkdir(output,{recursive:true});
const assets=JSON.parse(await readFile('src/data/assets.json','utf8'));
const expectedAssets=[{name:'imgGroup13',selector:'.story-brand-mark'},{name:'imgGroup48096582',selector:'.story-brand-word'}];
for(const asset of expectedAssets){
 assert.ok(assets[asset.name]?.src?.startsWith('/assets/'),'Expected local brand asset '+asset.name);
 asset.src=assets[asset.name].src;
 asset.file=path.join('public',asset.src.slice(1));
}
const hash=data=>createHash('sha256').update(data).digest('hex');
async function sourceFiles(directory){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())files.push(...await sourceFiles(file));else if(entry.isFile())files.push(file);
 }
 return files;
}
async function sourceSnapshot(){
 const hashes={};
 for(const file of [...await sourceFiles('src'),'scripts/content-brand-qa.mjs','package.json','astro.config.mjs',...expectedAssets.map(asset=>asset.file)].sort())hashes[file]=hash(await readFile(file));
 return hashes;
}
const sourceHashes=await sourceSnapshot();
const report={project:'luxury-realty',scope:'Homepage agency logo correction only',engine,base,sourceMode:'astro-dev-current-source',startedAt:new Date().toISOString(),sourceHashes,checks:[],screenshots:[],pageErrors:[],consoleErrors:[],assetFailures:[],blockedWrites:[],blockedExternalRequests:[],ok:false};
let server,browser,context,page,serverOutput='',cleanup,expired=false;
const errorText=error=>error?.stack||String(error);
async function stop(){
 return cleanup??=(async()=>{
  await Promise.race([browser?.close().catch(()=>{}),delay(4000)]);
  if(server&&server.exitCode===null){
   server.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(1000)]);
   if(server.exitCode===null)server.kill('SIGKILL');
  }
 })();
}
async function persist(){
 report.finishedAt=new Date().toISOString();report.elapsedMs=Date.parse(report.finishedAt)-Date.parse(report.startedAt);
 await writeFile(path.join(output,'brand-'+engine+'-report.json'),JSON.stringify(report,null,2)+'\n');
 await writeFile(path.join(output,'brand-'+engine+'-server.log'),serverOutput);
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{report.error='Interrupted by '+signal;void stop().then(persist).finally(()=>process.exit(code));});
const deadline=setTimeout(()=>{expired=true;void stop();},113000);
async function ready(){
 const until=Date.now()+25000;
 while(Date.now()<until&&!expired){
  if(server.exitCode!==null)throw new Error('Owned preview exited '+server.exitCode+': '+serverOutput.slice(-3000));
  try{if((await fetch(base,{signal:AbortSignal.timeout(1200)})).ok)return;}catch{}
  await delay(150);
 }
 throw new Error('Owned preview did not become ready');
}
async function noOverflow(){
 const state=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(state.document<=state.viewport+1&&state.body<=state.viewport+1,'Horizontal overflow on '+page.url()+': '+JSON.stringify(state));
 return state;
}
async function capture(locator,name,selector){
 const file='brand-'+engine+'-'+name+'.png';
 const bytes=await locator.screenshot({path:path.join(output,file),animations:'disabled',caret:'hide',timeout:10000});
 report.screenshots.push({file,selector,route:new URL(page.url()).pathname,viewport:page.viewportSize(),box:await locator.boundingBox(),bytes:bytes.length,sha256:hash(bytes)});
}
async function storyAtWidth(width){
 await page.setViewportSize({width,height:width===1440?900:844});
 const response=await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 assert.equal(response?.status(),200,'Homepage returns HTTP 200');
 await page.evaluate(()=>document.fonts.ready);
 const story=page.locator('.home-story'),lockup=story.locator('.story-brand-lockup'),collage=story.locator('a.story-collage');
 await story.waitFor({state:'visible'});
 const storyImages=story.locator('img');
 for(let index=0;index<await storyImages.count();index++){
  const image=storyImages.nth(index);await image.scrollIntoViewIfNeeded();
  await page.waitForFunction(image=>image.complete&&image.naturalWidth>0,await image.elementHandle());
  await image.evaluate(image=>image.decode());
 }
 await lockup.scrollIntoViewIfNeeded();await lockup.waitFor({state:'visible'});
 const loaded=[];
 for(const asset of expectedAssets){
  const image=lockup.locator('img'+asset.selector);
  assert.equal(await image.count(),1,'Exactly one '+asset.name+' in the agency identity');
  await image.waitFor({state:'visible'});
  const state=await image.evaluate(image=>({src:image.getAttribute('src'),currentSrc:image.currentSrc,loaded:image.complete&&image.naturalWidth>0,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,opacity:getComputedStyle(image).opacity,visibility:getComputedStyle(image).visibility}));
  assert.equal(state.src,asset.src);assert.equal(new URL(state.currentSrc).pathname,asset.src);
  assert.ok(state.loaded&&state.width>0&&state.height>0&&Number(state.opacity)>0&&state.visibility==='visible','The new identity is loaded and visible');
  loaded.push({name:asset.name,...state});
 }
 const oldReferences=await page.evaluate(()=>Array.from(document.querySelectorAll('[src],[srcset],[href],[xlink\\:href]')).flatMap(element=>['src','srcset','href','xlink:href'].filter(name=>(element.getAttribute(name)||'').includes('imgGroup24')).map(name=>({tag:element.tagName,attribute:name,value:element.getAttribute(name)}))));
 assert.deepEqual(oldReferences,[],'No old imgGroup24 render references remain on the homepage');
 assert.equal(await collage.getAttribute('href'),'/about/','The complete agency card links to About');
 assert.equal(await collage.getAttribute('aria-label'),'About Luxury Realty');
 const layout=await noOverflow();
 await capture(story,'story-'+width,'.home-story');
 await capture(lockup,'lockup-'+width,'.story-brand-lockup');
 const [aboutResponse]=await Promise.all([
  page.waitForResponse(response=>response.request().isNavigationRequest()&&response.url()===base+'/about/'),
  collage.click()
 ]);
 await page.waitForURL(base+'/about/');assert.equal(aboutResponse.status(),200,'The real About navigation returns HTTP 200');
 await page.locator('h1').waitFor({state:'visible'});assert.equal(await page.locator('h1').count(),1);
 const aboutLayout=await noOverflow();
 return {width,loaded,layout,aboutLayout,aboutUrl:page.url(),oldReferences};
}
try{
 assert.equal(sourceHashes['src/pages/index.astro'],'7188a9dfa877b166c57ea66a48e7d2368c9207c4337f5b27dfae92121ca67f20','Homepage matches the reviewed frozen correction');
 assert.equal(sourceHashes['src/styles/migration.css'],'a2182068016717828df32526022c3d1229c8e1a8fd486167db29fe0387e90d47','CSS matches the reviewed frozen correction');
 await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});
 server=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(port),'--ignore-lock'],{cwd:process.cwd(),env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',chunk=>serverOutput=(serverOutput+chunk.toString()).slice(-120000));
 server.stderr.on('data',chunk=>serverOutput=(serverOutput+chunk.toString()).slice(-120000));
 await ready();browser=await playwright[engine].launch({headless:true,handleSIGINT:false,handleSIGTERM:false});
 context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){report.blockedWrites.push({url:request.url(),method:request.method()});return route.abort('blockedbyclient');}
  if(url.origin!==base){report.blockedExternalRequests.push(request.url());return route.abort('blockedbyclient');}
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(20000);
 page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({text:message.text(),url:message.location().url});});
 page.on('response',response=>{if(response.status()>=400&&/\/(assets|media|fonts)\//.test(new URL(response.url()).pathname))report.assetFailures.push({url:response.url(),status:response.status()});});
 for(const width of [1440,390]){
  const started=Date.now();
  try{const result=await storyAtWidth(width);report.checks.push({name:width+' agency identity and real About navigation',ok:true,elapsedMs:Date.now()-started,...result});console.log('PASS '+width+' homepage agency identity and About link');}
  catch(error){report.checks.push({name:width+' agency identity and real About navigation',ok:false,elapsedMs:Date.now()-started,error:errorText(error)});throw error;}
 }
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.assetFailures,[]);assert.deepEqual(report.blockedWrites,[]);assert.deepEqual(report.blockedExternalRequests,[]);
 assert.equal(report.screenshots.length,4);report.ok=true;
}catch(error){report.error=(expired?'Deadline elapsed. ':'')+errorText(error);process.exitCode=1;}
finally{
 clearTimeout(deadline);await stop();
 const finalHashes=await sourceSnapshot();
 report.changedSources=[...new Set([...Object.keys(sourceHashes),...Object.keys(finalHashes)])].filter(file=>sourceHashes[file]!==finalHashes[file]);
 if(report.changedSources.length){report.ok=false;process.exitCode=1;report.error=(report.error?report.error+'\n':'')+'Sources changed during the run: '+report.changedSources.join(', ');}
 await persist();console.log(JSON.stringify({ok:report.ok,engine,checks:report.checks.length,screenshots:report.screenshots.length,error:report.error,report:path.join(output,'brand-'+engine+'-report.json')},null,2));
}
