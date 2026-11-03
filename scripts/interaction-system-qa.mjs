import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {appendFile,mkdir,readFile,readdir,realpath,stat,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * Interaction QA and fresh visual evidence. Run only through imon-job.
 * ENGINE=chromium|webkit QA_STAGE=focused QA_STATIC_ROOT=... QA_OUTPUT_DIR=<new> node scripts/interaction-system-qa.mjs
 * QA_STAGE=all-pages: every canonical sitemap route at390/1440, normal motion.
 * Root must review focused screenshots before choosing all-pages. No implicit rerun.
 * QA_STAGE=public: home/catalogue at390/1440 on the caller-verified immutable preview.
 * QA_CASES/QA_WIDTHS/QA_MOTIONS explicitly restrict coverage and are reported.
 * QA_FAIL_FAST=1 stops focused after its first incomplete view; the entire planned matrix remains in the incomplete report.
 * Exit0 means machine checks passed; humanReview always remains pending.
 */
const root=process.cwd();
const sourceRoot=path.resolve(process.env.QA_SOURCE_ROOT||root);
const stage=process.env.QA_STAGE||'focused';
assert.ok(['focused','all-pages','public'].includes(stage),'QA_STAGE must be focused, all-pages or public');
const failFast=process.env.QA_FAIL_FAST==='1';
assert.ok(process.env.QA_FAIL_FAST===undefined||['0','1'].includes(process.env.QA_FAIL_FAST),'QA_FAIL_FAST must be 0 or 1');
assert.ok(!failFast||stage==='focused','QA_FAIL_FAST is supported only for the focused stage');
const phase='after',invocationPhase=stage;
const engine=process.env.ENGINE||'chromium';
assert.ok(['chromium','webkit','firefox'].includes(engine),'ENGINE must be chromium, webkit or firefox');
assert.ok(Boolean(process.env.BASE_URL)!==Boolean(process.env.QA_STATIC_ROOT),'Set exactly one of BASE_URL or QA_STATIC_ROOT');
const cgroup=await readFile('/proc/self/cgroup','utf8');
assert.match(cgroup,/\/imon-job@[^/]+\.service(?:\/|$)/m,'Use imon-job; this audit must not launch a browser outside the serialized job');
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/interaction-system-20261103/'+stage+'-'+engine);
await mkdir(output,{recursive:true});
assert.equal((await readdir(output)).length,0,'QA_OUTPUT_DIR must be new/empty; old evidence is never reused or overwritten');
const timeoutMs=Number(process.env.QA_TIMEOUT_MS||(stage==='all-pages'?1800000:900000));
assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>=60000&&timeoutMs<=3600000,'QA_TIMEOUT_MS must be 60000..3600000');
const sourceHead=execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.QA_EXPECTED_HEAD)assert.equal(sourceHead,process.env.QA_EXPECTED_HEAD,'Unexpected source checkout HEAD');
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const playwright=require('playwright');
const properties=JSON.parse(await readFile(path.join(sourceRoot,'src/data/properties.json'),'utf8'));
const projects=JSON.parse(await readFile(path.join(sourceRoot,'src/data/catalogue-projects.json'),'utf8'));
const articlesSource=await readFile(path.join(sourceRoot,'src/data/articles.ts'),'utf8');
const articleIds=[...articlesSource.matchAll(/\bid:'([^']+)'/g)].map(match=>match[1]);
const archived=p=>/sold|rented|archived|withdrawn/i.test(p.saleStatus||p.status||'');
const current=properties.filter(p=>!archived(p));
const property=current.find(p=>p.id==='palm-view-duplex-bespoke-garden-home')||current.find(p=>!p.isDevelopment&&p.photos?.length>=3);
const archive=properties.find(archived);
const longProperty=[...current].filter(p=>!p.isDevelopment).sort((a,b)=>(b.description||'').length-(a.description||'').length)[0];
assert.ok(property&&archive&&longProperty&&articleIds.length,'Real source fixtures are required');
assert.equal(projects.length,7,'This audit expects all seven existing development profiles');
const media=JSON.parse(await readFile(path.join(sourceRoot,'src/data/imported-media.json'),'utf8'));
const assetSources=new Map(Object.entries(media).map(([url,item])=>[item.src,url]));
const viewportHeights={320:844,390:844,768:1024,1024:900,1440:1000,1920:1080};
const canonicalFile=path.join(path.resolve(process.env.QA_STATIC_ROOT||path.join(sourceRoot,'.vercel/output/static')),'sitemap.xml');
const sitemapBytes=await readFile(canonicalFile);
const canonicalRoutes=[...sitemapBytes.toString().matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(match=>{
 const url=new URL(match[1].replace(/&amp;/g,'&'));
 assert.ok(!url.search&&!url.hash,'Canonical sitemap entries must not carry filter state');
 return url.pathname;
});
const expectedRoutes=['/','/properties/','/developments/','/about/','/services/','/sell/','/contacts/','/privacy/','/insights/',
 ...properties.map(p=>'/properties/'+p.id+'/'),...projects.map(p=>'/developments/'+p.id+'/'),...articleIds.map(id=>'/insights/'+id+'/')];
assert.equal(new Set(canonicalRoutes).size,canonicalRoutes.length,'Duplicate canonical route');
assert.deepEqual([...canonicalRoutes].sort(),[...new Set(expectedRoutes)].sort(),'Built sitemap must contain every current source route exactly once');
const longTitle=[...current].filter(p=>!p.isDevelopment&&p.photos?.length).sort((a,b)=>b.title.length-a.title.length)[0];
const propertyPath=p=>'/properties/'+p.id+'/';
const focusedDefinitions=[
 {id:'home',route:'/',widths:[320,390,768,1440],motions:['reduce','no-preference'],key:'.consultation'},
 {id:'catalogue',route:'/properties/',widths:[320,390,768,1440],motions:['reduce','no-preference'],key:'[data-property-grid]'},
 {id:'property',route:propertyPath(longTitle),widths:[320,390,1440],key:'.advisor-sticky',enquiry:true,gallery:true},
 {id:'about',route:'/about/',widths:[390,1440],key:'.team-grid',extra:'.team-card:last-child'},
 {id:'services',route:'/services/',widths:[390,1440],key:'.service-detail-list'},
 {id:'sell',route:'/sell/',widths:[390,768],key:'.valuation-section',blankForm:'.valuation-section form'},
 {id:'contacts',route:'/contacts/',widths:[320,390,1440],key:'.contact-grid',blankForm:'.contact-grid form'},
 {id:'developments',route:'/developments/',widths:[390,1440],key:'.developments-collection'},
 {id:'insights',route:'/insights/',widths:[390,1440],key:'.insights-grid'},
 {id:'article',route:'/insights/'+articleIds[0]+'/',widths:[390],key:'.article-body'},
 {id:'privacy',route:'/privacy/',widths:[390],motions:['reduce'],key:'.legal-page'},
 {id:'not-found',route:'/__interaction-qa-missing__/',widths:[390],motions:['reduce'],status:404,key:'.not-found'}
];
const definitions=stage==='all-pages'?canonicalRoutes.map(route=>({
 id:route==='/'?'home':route.replace(/^\/|\/$/g,'').replaceAll('/','-').slice(0,100),
 route,widths:[390,1440],motions:['no-preference']
})):stage==='public'?focusedDefinitions.filter(view=>['home','catalogue'].includes(view.id)).map(view=>({...view,widths:[390,1440],motions:['no-preference']})):focusedDefinitions;
const caseFilter=process.env.QA_CASES?new Set(process.env.QA_CASES.split(',').map(s=>s.trim()).filter(Boolean)):null;
const widthFilter=process.env.QA_WIDTHS?new Set(process.env.QA_WIDTHS.split(',').map(Number)):null;
const motionFilter=process.env.QA_MOTIONS?new Set(process.env.QA_MOTIONS.split(',').map(s=>s.trim())):null;
if(caseFilter)for(const id of caseFilter)assert.ok(definitions.some(item=>item.id===id),'Unknown QA_CASES entry: '+id);
if(widthFilter)for(const width of widthFilter)assert.ok(viewportHeights[width],'Unknown QA_WIDTHS entry: '+width);
if(motionFilter)for(const motion of motionFilter)assert.ok(['reduce','no-preference'].includes(motion),'Unknown QA_MOTIONS entry: '+motion);
const matrix=definitions.flatMap(definition=>definition.widths.flatMap(width=>(definition.motions||['no-preference']).map(motion=>({...definition,width,height:viewportHeights[width],motion}))))
 .filter(view=>(!caseFilter||caseFilter.has(view.id))&&(!widthFilter||widthFilter.has(view.width))&&(!motionFilter||motionFilter.has(view.motion)));
assert.ok(matrix.length,'Selected matrix is empty');
await writeFile(path.join(output,'canonical-routes.json'),JSON.stringify({sourceFile:canonicalFile,sha256:createHash('sha256').update(sitemapBytes).digest('hex'),count:canonicalRoutes.length,routes:canonicalRoutes},null,2)+'\n');
let browser,context,page,server,staticRoot,base,expired=false,closing,active=null;
const report={
 schemaVersion:1,project:'Luxury Realty',stage,phase,invocationPhase,engine,startedAt:new Date().toISOString(),
 sourceHead,sourceRoot,sourceMode:process.env.BASE_URL?'externally-deployed-preview':'explicit-existing-static-build',
 targetBinding:process.env.BASE_URL?'The caller must separately verify that this URL is the deployment for the recorded source commit.':'Static bundle bytes are fingerprinted before and after.',
 queueCgroup:cgroup.trim(),harnessSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
 fullMatrix:!caseFilter&&!widthFilter&&!motionFilter,allCanonicalPages:stage==='all-pages'&&!caseFilter&&!widthFilter&&!motionFilter,canonicalRouteCount:canonicalRoutes.length,plannedViews:matrix.map(({id,route,width,height,motion})=>({id,route,width,height,motion})),
 preferences:{reducedMotion:'per-view',deviceScaleFactor:1,serviceWorkers:'block'},
 sourceHashes:{},sourceDrift:[],views:[],checks:[],screenshots:[],findings:[],pageErrors:[],consoleErrors:[],assetFailures:[],
 blockedWrites:[],externalReads:[],failFast:{enabled:failFast,stopped:false},complete:false,machineChecksPassed:false,humanReview:'pending',
 limitations:[
  'Machine geometry and successful captures do not establish aesthetic acceptance. Actual screenshots require a separate reviewer receipt.',
  'All-pages enumerates the complete built sitemap; the exact route/width/motion matrix and any restrictions are recorded.',
  'Fresh full PNGs retain the original viewport width. A review-index thumbnail is not a pixel-level review of all text.',
  'Focused normal/reduced motion tests cover concrete controls, cancellation, focus, scrolling and history. Screenshots alone cannot prove animation quality.',
  'No real enquiry is sent. Empty-form validation is local; every non-GET/HEAD request is blocked.',
  'Only the named engine is implied. WebKit is not a claim of manual testing on every Safari/device version.',
  'Physical source-image resolution and all DPR variants are not re-certified by CSS naturalWidth. Original source-image limits remain.'
 ]
};
async function filesUnder(directory){
 const result=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory()){if(!['node_modules','.git','__pycache__','output'].includes(entry.name))result.push(...await filesUnder(file));}
  else if(entry.isFile())result.push(file);
 }
 return result;
}
async function sourceSnapshot(){
 const files=[...await filesUnder(path.join(sourceRoot,'src')),...await filesUnder(path.join(sourceRoot,'scripts')),...await filesUnder(path.join(sourceRoot,'tests'))];
 for(const name of ['package.json','package-lock.json','astro.config.mjs'])files.push(path.join(sourceRoot,name));
 const hashes={};
 for(const file of files.sort())hashes[path.relative(sourceRoot,file)]=createHash('sha256').update(await readFile(file)).digest('hex');
 return hashes;
}
async function bundleSnapshot(){
 if(!staticRoot)return null;
 const entries={};
 for(const file of (await filesUnder(staticRoot)).sort()){
  if(!/\.(?:html|css|js|mjs|json|woff2?)$/i.test(file))continue;
  const data=await readFile(file);
  entries[path.relative(staticRoot,file)]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
 }
 const serialized=JSON.stringify(entries);
 return {entries,count:Object.keys(entries).length,sha256:createHash('sha256').update(serialized).digest('hex')};
}
const errorText=error=>error?.stack||String(error);
function finding(code,message,details={},severity='error'){
 const item={view:active?.key||'run',code,severity,message,...details};
 report.findings.push(item);
 return item;
}
async function persist(){
 report.finishedAt=new Date().toISOString();
 report.elapsedMs=Date.parse(report.finishedAt)-Date.parse(report.startedAt);
 const temporary=path.join(output,'visual-audit-report.json');
 await writeFile(temporary,JSON.stringify(report,null,2)+'\n');
}
async function close(){
 return closing??=(async()=>{
  if(browser)await Promise.race([browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,4000))]);
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 })();
}
const deadline=setTimeout(()=>{expired=true;report.error='Audit deadline exceeded';void close();},timeoutMs);
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{
 report.error='Interrupted by '+signal;void close().then(persist).finally(()=>process.exit(code));
});
async function serveStatic(){
 staticRoot=await realpath(path.resolve(process.env.QA_STATIC_ROOT));
 assert.ok((await stat(path.join(staticRoot,'index.html'))).isFile(),'QA_STATIC_ROOT must contain a completed static index.html');
 const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm'};
 server=createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
   const requestPath=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   let file=path.resolve(staticRoot,'.'+requestPath),status=200;
   if(file!==staticRoot&&!file.startsWith(staticRoot+path.sep)){res.writeHead(403);res.end();return;}
   try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');await stat(file);}
   catch{file=path.join(staticRoot,'404.html');status=404;}
   const resolved=await realpath(file);
   if(!resolved.startsWith(staticRoot+path.sep)){res.writeHead(403);res.end();return;}
   const info=await stat(resolved);
   let start=0,end=info.size-1;
   const headers={'content-type':types[path.extname(resolved).toLowerCase()]||'application/octet-stream','content-length':info.size,'cache-control':'no-store'};
   if(req.headers.range&&status===200){
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!range||Number(range[1])>=info.size){res.writeHead(416,{'content-range':'bytes */'+info.size});res.end();return;}
    start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),info.size-1):end;
    if(end<start){res.writeHead(416);res.end();return;}
    status=206;headers['content-range']='bytes '+start+'-'+end+'/'+info.size;headers['accept-ranges']='bytes';headers['content-length']=end-start+1;
   }
   res.writeHead(status,headers);
   if(req.method==='HEAD'){res.end();return;}
   const stream=createReadStream(resolved,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 base='http://127.0.0.1:'+server.address().port;
}
async function settleUI(){
 if(await page.locator('.hero-search').count())await page.locator('.hero-search[data-filters-initialized=true]').waitFor({state:'attached',timeout:5000});
 await page.waitForFunction(()=>!document.querySelector('dialog[open][data-dialog-state="opening"]'),null,{timeout:4000});
 await page.waitForFunction(()=>!document.getAnimations().some(animation=>{
  if(animation.playState!=='running'||!Number.isFinite(animation.effect?.getComputedTiming().endTime))return false;
  const target=animation.effect?.target;if(!(target instanceof Element))return false;
  const r=target.getBoundingClientRect();
  return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&!target.closest('[hidden],dialog:not([open])');
 }),null,{timeout:5000});
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-hero-title] > *, .hero-lettering, .hero-intro')].every(element=>{
  const r=element.getBoundingClientRect();if(!r.width||!r.height||r.bottom<=0||r.top>=innerHeight)return true;
  return Number(getComputedStyle(element).opacity)>=.995;
 }),null,{timeout:5000});
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-reveal]')].every(element=>{
  const r=element.getBoundingClientRect();if(r.width===0||r.height===0||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)return true;
  if(element.closest('[hidden],dialog:not([open])'))return true;
  return Number(getComputedStyle(element).opacity)>=.98;
 }),null,{timeout:5000});
}
async function visibleImages(){
 await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:10000});
 // One browser-side predicate defines both the required loaded set and decode set.
 // Offscreen lazy images in a horizontal rail are not part of this viewport.
 const imagePhase=phase=>{
  const images=Array.from(document.images).filter(image=>{
   const r=image.getBoundingClientRect();
   return Boolean(image.getAttribute('src')||image.getAttribute('srcset'))&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&(typeof image.checkVisibility!=='function'||image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  });
  if(phase==='loaded')return images.every(image=>image.complete&&image.naturalWidth>0);
  if(phase==='decode')return Promise.all(images.map(image=>image.decode()));
  return {scrollY:Math.round(scrollY),viewport:{width:innerWidth,height:innerHeight},images:images.map(image=>{
   const r=image.getBoundingClientRect();
   return {src:image.currentSrc||image.getAttribute('src')||'',srcset:image.getAttribute('srcset')||'',alt:image.alt,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
  })};
 };
 await page.waitForFunction(imagePhase,'loaded',{timeout:15000});
 const trace={schemaVersion:1,view:active.key,sourceHead,engine,startedAt:new Date().toISOString(),...await page.evaluate(imagePhase,'snapshot'),steps:[]};
 active.imageWaitTraceFile='image-wait-traces.ndjson';active.imageWaitCount=(active.imageWaitCount||0)+1;
 const traceFile=path.join(output,active.imageWaitTraceFile);
 const progressFile=path.join(output,'image-wait-progress.json');
 const progress=()=>writeFile(progressFile,JSON.stringify(trace,null,2)+'\n');
 const bounded=async(name,timeout,operation)=>{
  const step={name,timeoutMs:timeout,startedAt:new Date().toISOString(),status:'pending'};
  trace.steps.push(step);trace.phase=name;trace.status='pending';
  await progress();
  let timer;
  try{
   await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(name+' exceeded '+timeout+'ms at scrollY='+trace.scrollY+' with '+trace.images.length+' selected images; see '+progressFile)),timeout);})]);
   step.status='complete';trace.status='complete';
  }catch(error){step.status='failed';trace.status='failed';step.error=errorText(error);throw error;}
  finally{clearTimeout(timer);step.elapsedMs=Date.now()-Date.parse(step.startedAt);await progress();await appendFile(traceFile,JSON.stringify(trace)+'\n');}
 };
 await bounded('image-decode',15000,()=>page.evaluate(imagePhase,'decode'));
 await bounded('two-paint-frames',3000,()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
}
async function capture(kind,options={}){
 await settleUI();await visibleImages();
 const filename=active.key+'-'+kind+'.png';
 const documentHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
 if(options.fullPage&&documentHeight>32000)throw new Error('Full-page capture exceeds the explicit 32000px limit: '+documentHeight);
 const bytes=await page.screenshot({path:path.join(output,filename),fullPage:Boolean(options.fullPage),timeout:20000});
 const meta={
  file:filename,view:active.key,route:active.route,url:page.url(),kind,
  viewport:page.viewportSize(),documentHeight,scrollY:await page.evaluate(()=>Math.round(scrollY)),
  bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),loaded:true,humanReview:'pending'
 };
 report.screenshots.push(meta);active.screenshots.push(filename);
 return meta;
}
async function scrollTo(top){
 await page.evaluate(value=>window.scrollTo({top:value,behavior:'instant'}),Math.max(0,top));
 await visibleImages();
}
async function walkPage(){
 let steps=0;
 await scrollTo(0);await settleUI();
 while(true){
  if(expired)throw new Error('Deadline exceeded during scroll-through');
  const position=await page.evaluate(()=>({y:scrollY,height:innerHeight,total:document.documentElement.scrollHeight}));
  if(position.y+position.height>=position.total-2)break;
  assert.ok(++steps<=160,'Scroll-through exceeded 160 steps; page may be growing indefinitely');
  await page.mouse.move(Math.max(20,active.width-28),Math.round(active.height*.55));
  await page.mouse.wheel(0,Math.round(active.height*.78));
  await page.waitForFunction(before=>scrollY>before+1||scrollY+innerHeight>=document.documentElement.scrollHeight-2,position.y,{timeout:4000});
  await visibleImages();await settleUI();
 }
 return {steps,documentHeight:await page.evaluate(()=>document.documentElement.scrollHeight)};
}
async function frame(selector,kind,{optional=false}={}){
 const selectors=Array.isArray(selector)?selector:[selector];
 let locator;
 for(const candidate of selectors){const match=page.locator(candidate).filter({visible:true}).first();if(await match.count()){locator=match;break;}}
 if(!locator){
  if(optional){active.skippedFrames.push({selector,reason:'Template does not expose this optional region'});return;}
  throw new Error('Expected content region missing: '+selectors.join(' or '));
 }
 if(await locator.evaluate(element=>Boolean(element.closest('dialog[open]')))){
  // Native validation has already focused/scrolled the first invalid field.
  // Keep that real modal state; scrolling window here would move its inert background.
  const before=await page.evaluate(()=>scrollY);
  await capture(kind);
  const after=await page.evaluate(()=>scrollY);
  (active.frameContexts??=[]).push({kind,selector,context:'native-modal-current-state',windowYBefore:before,windowYAfter:after});
  assert.equal(after,before,'Modal validation capture must preserve the background scroll position');
  return;
 }
 const top=await locator.evaluate(element=>scrollY+element.getBoundingClientRect().top);
 await scrollTo(top-104);
 await capture(kind);
}
async function inspectGeometry(label){
 const measurements=await page.evaluate(()=>{
  const visible=element=>{
   if(!(element instanceof Element)||element.closest('.sr-only,.honeypot,[hidden],dialog:not([open]),[inert]'))return false;
   const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&(typeof element.checkVisibility!=='function'||element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  };
  const rect=element=>{const r=element.getBoundingClientRect();return {x:+r.x.toFixed(2),y:+(r.y+scrollY).toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2),right:+r.right.toFixed(2),bottom:+(r.bottom+scrollY).toFixed(2)};};
  const summarize=element=>({tag:element.tagName.toLowerCase(),class:element.className?.baseVal??element.className,text:element.textContent?.trim().replace(/\s+/g,' ').slice(0,150),rect:rect(element)});
  const inHorizontalScroller=element=>{
   for(let parent=element.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    const style=getComputedStyle(parent);
    if(parent.scrollWidth>parent.clientWidth+1&&/auto|scroll/.test(style.overflowX))return true;
   }
   return false;
  };
  const overflow=[...document.querySelectorAll('h1,h2,h3,p,a,button,input,select,textarea,summary,dt,dd')]
   .filter(visible).filter(element=>!inHorizontalScroller(element))
   .filter(element=>{const r=element.getBoundingClientRect();return r.left<-1||r.right>innerWidth+1;})
   .map(summarize).slice(0,35);
  const controls=[...document.querySelectorAll('.advisor-sticky .button')].filter(visible);
  const advisorOverlaps=[];
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
   const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();
   const intersection={width:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),height:Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))};
   if(intersection.width>2&&intersection.height>2)advisorOverlaps.push({a:summarize(controls[i]),b:summarize(controls[j]),intersection});
  }
  const formOverflows=[];
  for(const form of [...document.querySelectorAll('form.enquiry-form')].filter(visible)){
   const bounds=form.getBoundingClientRect();
   for(const element of [...form.querySelectorAll('input,textarea,button,.form-status')].filter(visible)){
    const r=element.getBoundingClientRect();
    if(r.left<bounds.left-1||r.right>bounds.right+1)formOverflows.push({form:form.id||form.dataset.context,control:summarize(element),formRect:rect(form)});
   }
  }
  const grids=[...document.querySelectorAll('[data-property-grid],.related-grid,.development-opportunity-grid')];
  const cardRows=[];
  for(const grid of grids){
   const cards=[...grid.querySelectorAll('[data-property-card]')].filter(visible);
   const rows=[];
   for(const card of cards){
    const r=card.getBoundingClientRect();let row=rows.find(item=>Math.abs(item.top-r.top)<2);
    if(!row){row={top:r.top,cards:[]};rows.push(row);}
    const price=card.querySelector('.property-price'),heading=card.querySelector('h3');
    row.cards.push({id:card.getAttribute('data-id'),rect:rect(card),title:heading?.textContent?.trim(),heading:heading?rect(heading):null,price:price?rect(price):null});
   }
   for(const row of rows.filter(row=>row.cards.length>1)){
    const y=row.cards.map(card=>card.price?.y).filter(Number.isFinite);
    cardRows.push({grid:grid.className,top:+(row.top+scrollY).toFixed(2),priceSpread:y.length>1?+(Math.max(...y)-Math.min(...y)).toFixed(2):0,cards:row.cards});
   }
  }
  const containers=[...document.querySelectorAll('main .container')].filter(visible).map(summarize);
  const rails=[...document.querySelectorAll('.selection-rail,.insight-rail')].filter(visible).map(rail=>{
   const first=[...rail.children].find(visible);return {class:rail.className,scrollLeft:rail.scrollLeft,first:first?rect(first):null,rect:rect(rail)};
  });
  const activeDialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  const images=[...document.images].filter(visible).filter(image=>image.getAttribute('src')).filter(image=>{const r=image.getBoundingClientRect();return !inHorizontalScroller(image)||(r.right>0&&r.left<innerWidth);}).map(image=>{
   const style=getComputedStyle(image),bounds=image.getBoundingClientRect();return {src:new URL(image.currentSrc||image.src,location.href).pathname,alt:image.alt,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,objectFit:style.objectFit,rect:rect(image),inViewport:bounds.bottom>0&&bounds.top<innerHeight&&bounds.right>0&&bounds.left<innerWidth,insideActiveDialog:Boolean(activeDialog?.contains(image))};
  });
  const headings=[...document.querySelectorAll('main h1,main h2,main h3')].filter(visible).map(element=>{
   const style=getComputedStyle(element);return {...summarize(element),fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight};
  });
  const invisibleHeadings=[...document.querySelectorAll('main h1,main h2,main h3')].filter(element=>{
   if(element.closest('[hidden],.sr-only,dialog:not([open])'))return false;
   const disclosure=element.closest('details');if(disclosure&&!disclosure.open&&!element.closest('summary'))return false;
   const r=element.getBoundingClientRect();if(!r.width||!r.height)return false;
   for(let node=element;node&&node!==document.body;node=node.parentElement){
    const style=getComputedStyle(node);if(Number(style.opacity)<.98||style.visibility==='hidden')return true;
   }
   return false;
  }).map(summarize);
  const toolbar=[...document.querySelectorAll('[data-quick-filters] input:not([type=hidden]),[data-quick-filters] select,[data-quick-filters] button,[data-filter-open],[data-sort],[data-purpose]')].filter(visible);
  const toolbarOverlaps=[];
  for(let i=0;i<toolbar.length;i++)for(let j=i+1;j<toolbar.length;j++){
   if(toolbar[i].contains(toolbar[j])||toolbar[j].contains(toolbar[i]))continue;
   const a=toolbar[i].getBoundingClientRect(),b=toolbar[j].getBoundingClientRect();
   if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)toolbarOverlaps.push([summarize(toolbar[i]),summarize(toolbar[j])]);
  }
  const dialogs=[...document.querySelectorAll('dialog[open]')].map(dialog=>({id:dialog.id,rect:rect(dialog),scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight}));
  return {
   viewport:{width:innerWidth,height:innerHeight},scrollY:Math.round(scrollY),documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
   documentHeight:document.documentElement.scrollHeight,h1:[...document.querySelectorAll('main h1')].map(element=>element.textContent?.trim()),
   overflow,advisorOverlaps,formOverflows,cardRows,containers,rails,images,headings,dialogs,invisibleHeadings,toolbarOverlaps,activeDialogId:activeDialog?.id||null
  };
 });
 const requiredLoadingScope=label==='page-after-scroll'?'all-rendered-after-scroll':'viewport-current-surface';
 for(const image of measurements.images)image.requiredLoaded=requiredLoadingScope==='all-rendered-after-scroll'||(image.inViewport&&(!measurements.activeDialogId||image.insideActiveDialog));
 active.measurements.push({label,requiredLoadingScope,...measurements});
 if(measurements.h1.length!==1||!measurements.h1[0])finding('h1','Expected exactly one nonempty page H1',{label,count:measurements.h1.length});
 if(measurements.documentWidth>active.width+1||measurements.bodyWidth>active.width+1)finding('document-overflow','Document extends beyond the viewport',{label,documentWidth:measurements.documentWidth,bodyWidth:measurements.bodyWidth,viewport:active.width});
 if(measurements.overflow.length)finding('visible-horizontal-overflow','Meaningful content extends beyond the viewport outside an intentional horizontal scroller',{label,elements:measurements.overflow});
 if(measurements.invisibleHeadings.length)finding('invisible-expected-content','Expected rendered headings remain transparent or hidden',{label,elements:measurements.invisibleHeadings});
 if(measurements.toolbarOverlaps.length)finding('catalogue-controls-overlap','Distinct catalogue controls overlap',{label,pairs:measurements.toolbarOverlaps});
 if(measurements.advisorOverlaps.length)finding('advisor-controls-overlap','Advisor action controls overlap',{label,pairs:measurements.advisorOverlaps});
 if(measurements.formOverflows.length)finding('form-controls-overflow','A form control or validation message exceeds the form bounds',{label,controls:measurements.formOverflows});
 for(const row of measurements.cardRows)if(row.priceSpread>2)finding('card-price-alignment','Prices in the same catalogue grid row are not aligned',{label,row});
 const broken=measurements.images.filter(image=>image.requiredLoaded&&(!image.complete||!image.naturalWidth));
 if(broken.length)finding('unloaded-rendered-images','Images required for this captured state are not loaded',{label,requiredLoadingScope,images:broken});
 for(const rail of measurements.rails){
  if(!rail.first||rail.scrollLeft>1)continue;
  const container=measurements.containers.find(item=>Math.abs(item.rect.width-(active.width-rail.first.x*2))<30)||measurements.containers[0];
  if(container&&Math.abs(rail.first.x-container.rect.x)>2)finding('rail-container-alignment','The first rail card does not align with the page container',{label,rail:rail.class,railLeft:rail.first.x,containerLeft:container.rect.x},'warning');
 }
 const maps=measurements.images.filter(image=>{
  const source=assetSources.get(image.src)||image.src;let decoded=source;try{decoded=decodeURIComponent(source);}catch{}
  return /(?:^|[\s/_-])map(?:[\s._/-]|$)/i.test(decoded);
 }).map(image=>({...image,source:assetSources.get(image.src)||image.src}));
 if(maps.some(image=>image.objectFit==='cover'))finding('map-cover-crop','A source map is rendered with object-fit:cover',{label,images:maps.filter(image=>image.objectFit==='cover')});
 // Physical resolution is intentionally not inferred from density-corrected naturalWidth.
 return measurements;
}
async function emptyForm(selector,kind){
 const form=page.locator(selector).filter({visible:true}).first();
 assert.ok(await form.count(),'Expected visible enquiry form: '+selector);
 assert.equal(await form.locator('[name=name]').inputValue(),'','No data is entered or submitted by this audit');
 assert.equal(await form.locator('[name=email]').inputValue(),'','No data is entered or submitted by this audit');
 const writesBefore=report.blockedWrites.length;
 await form.locator('button[type=submit]').click();
 await form.locator('[name=name][aria-invalid=true]').waitFor({state:'visible',timeout:5000});
 assert.equal(report.blockedWrites.length,writesBefore,'Empty local validation unexpectedly attempted a network write');
 await frame(selector,kind);
 await inspectGeometry(kind);
 // Native scrolling reveals the lower action after errors expand the form.
 // No additional click, fill, CSS/DOM mutation, or network submission occurs.
 const submit=form.locator('button[type=submit]');
 await submit.scrollIntoViewIfNeeded();await visibleImages();
 const reachability=await submit.evaluate(button=>{
  const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  const hit=document.elementFromPoint(x,y);
  return {text:(button.textContent||'').trim(),rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},viewport:{width:innerWidth,height:innerHeight},fullyInViewport:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,centerReceivesPointer:Boolean(hit&&(hit===button||button.contains(hit))),enabled:!button.disabled,dialogScrollTop:button.closest('dialog')?.scrollTop??null};
 });
 (active.formReachability??=[]).push({kind,...reachability});
 await capture(kind+'-submit');
 if(!reachability.fullyInViewport||!reachability.centerReceivesPointer||!reachability.enabled)finding('validation-submit-unreachable','Validation submit action is not fully reachable after native scrolling',{kind,...reachability});
}
async function legacyInteractions(){
 if(active.id==='home'&&[320,768].includes(active.width)){
  await scrollTo(0);await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.locator('#site-menu[open]').waitFor({state:'visible'});
  await capture('menu');await inspectGeometry('menu');
  const menu=page.locator('#site-menu');
  const first=menu.locator('nav a').first(),last=menu.locator('nav a').last();
  assert.ok(await first.count()&&await last.count(),'Menu links missing');
  await last.scrollIntoViewIfNeeded();await visibleImages();
  if(active.width===390)await capture('menu-lower');
  await page.keyboard.press('Escape');await page.locator('#site-menu').waitFor({state:'hidden'});
 }
 if(active.enquiry&&[320,390,768,1440].includes(active.width)){
  const advisor=page.locator('.advisor-sticky');
  await advisor.locator('[data-enquiry]').first().click();
  await page.locator('#enquiry-dialog[open]').waitFor({state:'visible'});
  await capture('enquiry');
  const contextText=await page.locator('[data-enquiry-context]').innerText();
  active.enquiryLabel=contextText;
  if(contextText.includes(active.route.split('/').filter(Boolean).at(-1)))finding('technical-enquiry-label','Technical property slug is visible in the enquiry label',{text:contextText});
  await inspectGeometry('enquiry');
  await emptyForm('#enquiry-dialog form','enquiry-validation');
  const closeButton=page.locator('#enquiry-dialog [data-close-dialog]');
  const closeHit=await targetHit(closeButton);
  (active.formReachability??=[]).push({kind:'enquiry-close-after-validation',...closeHit});
  assert.ok(closeHit.inside&&closeHit.hit,'Enquiry close remains reachable after scrolling through validation errors');
  await focusContained(page.locator('#enquiry-dialog'));
  await closeButton.click();await nativeDialog('enquiry-dialog',false);
  await returnedFocus(advisor.locator('[data-enquiry]').first());await unlocked();
 }
 if(active.gallery&&[320,390,1440].includes(active.width)){
  await scrollTo(0);await page.locator('.property-hero [data-gallery]').first().click();
  await page.locator('#gallery-dialog[open]').waitFor({state:'visible'});
  await page.waitForFunction(()=>{const img=document.querySelector('[data-gallery-image]');return img?.complete&&img.naturalWidth>0;});
  await capture('gallery');await inspectGeometry('gallery');
  await check('gallery caption fits the viewport without vertical dialog overflow',async()=>{
   const layout=await page.locator('#gallery-dialog').evaluate(dialog=>{
    const caption=dialog.querySelector('[data-gallery-caption]'),r=caption.getBoundingClientRect();
    return {viewportHeight:innerHeight,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,caption:{text:caption.textContent.trim(),top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   });
   active.galleryLayout=layout;
   assert.ok(layout.caption.bottom<=layout.viewportHeight+1,'Gallery caption extends below the viewport: '+layout.caption.bottom+' > '+layout.viewportHeight);
   assert.ok(layout.scrollHeight<=layout.clientHeight+1,'Gallery requires vertical scrolling: '+layout.scrollHeight+' > '+layout.clientHeight);
  });
  const counter=await page.locator('#gallery-dialog [data-gallery-counter]').evaluate(element=>{
   const r=element.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);
   const lines=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0).map(rect=>Math.round(rect.top));
   const intersections=[...element.parentElement.querySelectorAll('[data-gallery-title],[data-close-dialog]')].map(other=>{const b=other.getBoundingClientRect();return {element:other.tagName, width:Math.max(0,Math.min(r.right,b.right)-Math.max(r.left,b.left)),height:Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top))};});
   return {text:(element.textContent||'').trim(),lineCount:new Set(lines).size,rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},withinViewport:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,intersections};
  });
  active.galleryCounter=counter;
  if(!/^\d+\s*\/\s*\d+$/.test(counter.text)||counter.lineCount!==1||!counter.withinViewport||counter.intersections.some(item=>item.width>1&&item.height>1))finding('gallery-counter-layout','Gallery counter must stay readable on one line without overlapping title or close',{counter});
  await page.keyboard.press('Escape');await page.locator('#gallery-dialog').waitFor({state:'hidden'});
 }
 if(active.blankForm&&[320,390,768,1440].includes(active.width))await emptyForm(active.blankForm,'form-validation');
 if(active.id==='about'&&[390,1440].includes(active.width)){
  const biography=page.locator('.team-bio').filter({visible:true}).last();
  if(await biography.count()){
   await biography.locator('summary').click();
   await frame('.team-card:last-child','team-biography');
   await inspectGeometry('team-biography');
  }
 }
}

async function check(name,action){
 const item={view:active.key,name,startedAt:new Date().toISOString(),ok:false};report.checks.push(item);
 try{await action();item.ok=true;}catch(error){item.error=errorText(error);throw error;}
 finally{item.elapsedMs=Date.now()-Date.parse(item.startedAt);}
}
async function nativeDialog(id,open=true){
 await page.waitForFunction(({id,open})=>document.getElementById(id)?.open===open,{id,open},{timeout:5000});
 if(open)await settleUI();
}
async function unlocked(){
 await page.waitForFunction(()=>!document.querySelector('dialog[open]')&&!document.documentElement.classList.contains('dialog-open')&&!document.body.classList.contains('dialog-open'),null,{timeout:5000});
 const actual=await page.evaluate(()=>({html:getComputedStyle(document.documentElement).overflowY,body:getComputedStyle(document.body).overflowY,expanded:document.querySelector('.menu-toggle')?.getAttribute('aria-expanded')}));
 assert.notEqual(actual.html,'hidden','Root scroll remains locked');assert.notEqual(actual.body,'hidden','Body scroll remains locked');
 assert.notEqual(actual.expanded,'true','Menu trigger remains expanded');
}
async function returnedFocus(trigger){
 await page.waitForFunction(element=>document.activeElement===element,await trigger.elementHandle(),{timeout:5000});
}
async function focusContained(dialog){
 const trace={dialog:await dialog.getAttribute('id'),steps:[]};
 (active.focusTraces??=[]).push(trace);
 const sample=async key=>{
  const state=await dialog.evaluate(element=>{
   const focused=document.activeElement;
   return {open:element.open,inside:element.contains(focused),documentHasFocus:document.hasFocus(),
    bodyFocused:focused===document.body,target:{tag:focused?.tagName||null,id:focused?.id||null,
     name:focused?.getAttribute('name')||null,type:focused?.getAttribute('type')||null}};
  });
  trace.steps.push({key,...state});return state;
 };
 await sample('before');
 for(let index=0;index<9;index++){
  const key=index===0?'Shift+Tab':'Tab';await page.keyboard.press(key);
  const state=await sample(key);
  assert.equal(state.open,true,'Keyboard traversal must not close the native modal');
  if(state.inside)continue;
  // Native dialog keyboard traversal permits browser chrome, never background page controls.
  // Confirmed by the immutable-preview diagnostic: BODY + hasFocus=false, then Tab returns Close.
  assert.ok(state.bodyFocused&&!state.documentHasFocus,'Focus escaped the modal into the background document: '+JSON.stringify(state));
  await page.keyboard.press('Tab');
  const resumed=await sample('Tab:return-from-browser-chrome');
  assert.ok(resumed.open&&resumed.inside&&resumed.documentHasFocus,'Tab from browser chrome must restore focus within the still-open modal');
 }
}
async function fieldValue(form,name){return form.evaluate((node,name)=>new FormData(node).get(name),name);}
async function choose(form,name,value){
 const inputs=form.locator('[name="'+name+'"]');
 const values=await inputs.evaluateAll(nodes=>nodes.map(node=>node.value)),index=values.indexOf(value);
 assert.ok(index>=0,'Missing choice '+name+'='+value);
 const input=inputs.nth(index);
 if(!await input.isChecked())await input.locator('..').click();
 assert.equal(await input.isChecked(),true,'Clicking the visible label selects '+name+'='+value);
}
async function draftCount(form,total){
 await page.waitForFunction(({selector,total})=>document.querySelector(selector+' [data-filter-count]')?.dataset.count===String(total),{selector:await form.getAttribute('data-hero-filters')!==null?'[data-hero-filters]':'[data-filters]',total},{timeout:5000});
 assert.match(await form.locator('[data-filter-count]').innerText(),new RegExp('^'+total+' propert'));
}
async function resultCount(total){
 await page.waitForFunction(total=>document.querySelector('[data-result-count]')?.textContent===total+' '+(total===1?'property':'properties'),total,{timeout:5000});
}
async function resultIds(expected){
 await page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('[data-property-grid] [data-property-card]:not([hidden])')].map(card=>card.dataset.id))===JSON.stringify(ids),expected,{timeout:5000});
}
async function visitFocused(route){
 const before=new URL(page.url()),target=new URL(route,base);
 const response=await page.goto(target.href,{waitUntil:'domcontentloaded'});
 if(response===null){
  assert.equal(before.origin,target.origin,'A response is required when origin changes');
  assert.equal(before.pathname,target.pathname,'A response is required when document path changes');
  assert.equal(before.search,target.search,'A response is required when the document query changes');
  assert.notEqual(before.hash,target.hash,'A null response is allowed only for an actual fragment change');
  assert.equal(page.url(),target.href,'Same-document navigation must reach the exact requested fragment');
 }else assert.equal(response?.status(),200,route);
 (active.navigationChecks??=[]).push({from:before.href,requested:target.href,actual:page.url(),mode:response===null?'same-document-fragment':'http-document',httpStatus:response?.status()??null});
 await page.locator('main h1').waitFor({state:'visible'});
 if(await page.locator('[data-catalogue]').count())await page.locator('[data-catalogue][data-initialized=true]').waitFor({state:'attached'});
 await settleUI();await visibleImages();
}
async function targetHit(locator){
 return locator.evaluate(element=>{
  const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},inside:r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:Boolean(hit&&(hit===element||element.contains(hit)))};
 });
}
async function panelGeometry(dialog,label){
 const data=await dialog.evaluate(element=>{
  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const body=element.querySelector('.filter-dialog-body');
  const controls=[...element.querySelectorAll('.filter-purpose-options label,.filter-choice-options label,.filter-bedroom-options label,.filter-feature-options label')];
  return {dialog:rect(element),body:rect(body),scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,labels:controls.map(node=>({text:node.textContent.trim(),...rect(node)}))};
 });
 const close=await targetHit(dialog.locator('[data-close-dialog]')),apply=await targetHit(dialog.locator('[data-filter-apply]'));
 (active.filterGeometry??=[]).push({label,...data,close,apply});
 assert.ok(data.dialog.x>=-1&&data.dialog.right<=active.width+1&&data.dialog.y>=-1&&data.dialog.bottom<=active.height+1,'Filter panel fits within viewport');
 assert.ok(data.scrollWidth<=data.clientWidth+1,'Filter panel has no horizontal overflow');
 assert.ok(data.body.height>=100,'Filter panel leaves room for its scrollable fields');
 for(const [name,control] of [['close',close],['apply',apply]]){
  assert.ok(control.inside&&control.hit,name+' stays visible and receives pointer input');
  assert.ok(control.rect.width>=43.5&&control.rect.height>=43.5,name+' has a usable minimum target');
 }
 for(const item of data.labels.filter(item=>item.width&&item.height))assert.ok(item.height>=43.5,'Visible filter choice target is too short: '+item.text);
}
async function observeToggle(dialog,opening,action,label){
 // Read actual rendered states during the action. No CSS/DOM timing overrides.
 const tracePromise=dialog.evaluate((element,opening)=>new Promise(resolve=>{
  const samples=[],start=performance.now();let seen=false,stable=0;
  const sample=()=>{
   const style=getComputedStyle(element),r=element.getBoundingClientRect();
   const running=element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime)).length;
   samples.push({ms:Math.round(performance.now()-start),open:element.open,opacity:Number(style.opacity),transform:style.transform,height:r.height,running,state:element.dataset.dialogState||null});
   seen||=opening?element.open:!element.open;
   const settled=opening?element.open&&Number(style.opacity)>=.995&&!running:!element.open;
   stable=seen&&settled?stable+1:0;
   if(stable>=3||performance.now()-start>3000)resolve(samples);else requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 }),opening);
 await action();
 const trace=await tracePromise;
 (active.motionTraces??=[]).push({label,motion:active.motion,opening,samples:trace});
 assert.equal(trace.at(-1)?.open,opening,'Dialog toggle completes');
 if(active.motion==='reduce')assert.ok(!trace.some(sample=>sample.open&&sample.running>0),'Reduced motion dialog has no ongoing finite animation');
 else assert.ok(trace.some(sample=>sample.open&&(sample.running>0||sample.opacity<.995)),'Normal motion produces a measurable transition');
}
async function backdropClose(dialog,trigger){
 const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>2,'Backdrop is reachable outside the panel');
 await page.mouse.click(Math.max(1,bounds.x/2),Math.min(active.height-2,Math.max(2,bounds.y+bounds.height/2)));
 await nativeDialog(await dialog.getAttribute('id'),false);await returnedFocus(trigger);await unlocked();
}
async function rapidToggle(dialog,trigger){
 // Repeated real Escape/trigger actions; reopening occurs after native close.
 for(let i=0;i<3;i++){
  await trigger.click();await page.keyboard.press('Escape');
  await nativeDialog(await dialog.getAttribute('id'),false);
 }
 await trigger.click();await nativeDialog(await dialog.getAttribute('id'));
 await page.keyboard.press('Escape');await nativeDialog(await dialog.getAttribute('id'),false);await returnedFocus(trigger);await unlocked();
}
async function filterFooterScroll(form,dialog,label){
 const details=form.locator('details').first();
 if(!await details.evaluate(node=>node.open))await details.locator('summary').click();
 await settleUI();
 const status=form.locator('[name=status]');await status.scrollIntoViewIfNeeded();
 const hit=await targetHit(status);assert.ok(hit.inside&&hit.hit,'The last filter can be reached without a footer covering it');
 await panelGeometry(dialog,label);await capture(label);
}
async function heroJourney(){
 const hero=page.locator('.hero-search'),trigger=page.locator('[data-hero-filter-open]').filter({visible:true}).first();
 const dialog=page.locator('#hero-filter-dialog'),form=dialog.locator('[data-hero-filters]');
 await scrollTo(0);
 const initialQuery=active.width>700?'Palm Jumeirah':'',initialPurpose=active.width>700?'rent':'buy';
 if(active.width>700){await hero.locator('[name=purpose]').selectOption(initialPurpose);await hero.locator('[name=q]').fill(initialQuery);}
 const homeURL=page.url();
 await check('hero preserves query/purpose; keyboard modal and rendered entrance',async()=>{
  await observeToggle(dialog,true,()=>trigger.click(),'hero-open');await nativeDialog('hero-filter-dialog');
  assert.equal(await fieldValue(form,'purpose'),initialPurpose);assert.equal(await form.locator('[name=q]').inputValue(),initialQuery);
  await panelGeometry(dialog,'hero-top');await capture('hero-filters');await focusContained(dialog);
 });
 await check('hero invalid draft is blocked and Escape discards it',async()=>{
  await form.locator('[name=minPrice]').fill('9000000');await form.locator('[name=maxPrice]').fill('8000000');
  assert.equal(await form.locator('[data-filter-apply]').isDisabled(),true);
  for(const name of ['minPrice','maxPrice'])assert.equal(await form.locator('[name='+name+']').getAttribute('aria-invalid'),'true');
  assert.match(await form.locator('[data-price-error]').innerText(),/maximum price.*minimum price/i);
  assert.equal(page.url(),homeURL);
  await form.locator('[data-price-error]').scrollIntoViewIfNeeded();await panelGeometry(dialog,'hero-invalid');await capture('hero-filters-error');
  await observeToggle(dialog,false,()=>page.keyboard.press('Escape'),'hero-close');await returnedFocus(trigger);await unlocked();
  await trigger.click();await nativeDialog('hero-filter-dialog');
  assert.equal(await form.locator('[name=q]').inputValue(),initialQuery);assert.equal(await form.locator('[name=minPrice]').inputValue(),'');
 });
 await check('hero reset affects draft; all filter sections and fixed actions are reachable',async()=>{
  await choose(form,'purpose','rent');await form.locator('[name=q]').fill('NoMatchingResidenceXYZ');await draftCount(form,0);
  await form.locator('[data-filter-reset]').click();assert.equal(await fieldValue(form,'purpose'),'rent');
  assert.equal(await form.locator('[name=q]').inputValue(),'');await draftCount(form,current.filter(p=>!p.isDevelopment&&p.purpose==='rent').length);
  assert.equal(page.url(),homeURL);
  await filterFooterScroll(form,dialog,'hero-filters-lower');
  await dialog.locator('[data-close-dialog]').click();await nativeDialog('hero-filter-dialog',false);await returnedFocus(trigger);await unlocked();
  await trigger.click();await nativeDialog('hero-filter-dialog');await backdropClose(dialog,trigger);
 });
 await check('hero Apply navigates with exact filter state; Back restores an unlocked page',async()=>{
  await trigger.click();await nativeDialog('hero-filter-dialog');
  await form.locator('[data-filter-reset]').click();await choose(form,'purpose','buy');
  const fixture=current.find(p=>!p.isDevelopment&&p.purpose==='buy'&&p.location);
  const expected=current.filter(p=>!p.isDevelopment&&p.purpose==='buy'&&p.location===fixture.location);
  await form.locator('[name=location]').selectOption(fixture.location);await draftCount(form,expected.length);
  await form.locator('[data-filter-apply]').click();await page.waitForURL(url=>url.pathname==='/properties/'&&url.searchParams.get('location')===fixture.location);
  await resultCount(expected.length);await resultIds(expected.slice(0,24).map(p=>p.id));await unlocked();
  await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL(url=>url.pathname==='/');
  await unlocked();await settleUI();
 });
 if(active.width===390||active.width===1440)await check('hero rapid toggles preserve the latest native dialog state and scroll unlock',()=>rapidToggle(dialog,trigger));
}
async function catalogueJourney(){
 const trigger=page.locator('[data-filter-open]'),dialog=page.locator('#catalogue-filter-dialog'),form=dialog.locator('[data-filters]');
 const buy=current.filter(p=>!p.isDevelopment&&p.purpose==='buy');
 await scrollTo(0);await resultCount(buy.length);const originalURL=page.url();
 await check('catalogue draft count is live while URL and applied results remain stable',async()=>{
  await trigger.click();await nativeDialog('catalogue-filter-dialog');await panelGeometry(dialog,'catalogue-top');await capture('catalogue-filters');
  await focusContained(dialog);
  await form.locator('[name=q]').fill('NoMatchingResidenceXYZ');await draftCount(form,0);
  await resultCount(buy.length);await resultIds(buy.slice(0,24).map(p=>p.id));assert.equal(page.url(),originalURL);
  await page.keyboard.press('Escape');await nativeDialog('catalogue-filter-dialog',false);await returnedFocus(trigger);await unlocked();
  await trigger.click();await nativeDialog('catalogue-filter-dialog');assert.equal(await form.locator('[name=q]').inputValue(),'');
 });
 const fixture=buy.find(p=>p.location&&p.type),expected=buy.filter(p=>p.location===fixture.location&&p.type===fixture.type);
 await check('catalogue Apply, chip removal, URL reload and reset retain exact source matches',async()=>{
  await form.locator('[name=location]').selectOption(fixture.location);await choose(form,'type',fixture.type);await draftCount(form,expected.length);
  await form.locator('[data-filter-apply]').click();await nativeDialog('catalogue-filter-dialog',false);
  await resultCount(expected.length);await resultIds(expected.slice(0,24).map(p=>p.id));await unlocked();
  assert.equal(new URL(page.url()).searchParams.get('location'),fixture.location);assert.deepEqual(new URL(page.url()).searchParams.getAll('type'),[fixture.type]);
  assert.equal(await page.locator('[data-active-filters] button').count(),2);assert.equal(await page.locator('[data-filter-badge]').innerText(),'2');
  await frame('[data-catalogue] .collection-controls','catalogue-applied-controls');await inspectGeometry('catalogue-applied-controls');
  await frame('[data-results-start]','catalogue-applied');await inspectGeometry('catalogue-applied');
  const appliedURL=page.url();await page.reload({waitUntil:'domcontentloaded'});await resultCount(expected.length);await resultIds(expected.slice(0,24).map(p=>p.id));assert.equal(page.url(),appliedURL);
  await page.getByRole('button',{name:'Remove filter: '+fixture.type,exact:true}).click();
  const locationMatches=buy.filter(p=>p.location===fixture.location);await resultCount(locationMatches.length);await resultIds(locationMatches.slice(0,24).map(p=>p.id));
  assert.equal(new URL(page.url()).searchParams.has('type'),false);assert.equal(await page.locator('[data-active-filters] button').count(),1);
  await trigger.click();await nativeDialog('catalogue-filter-dialog');await form.locator('[data-filter-reset]').click();await draftCount(form,buy.length);
  await resultCount(locationMatches.length);assert.equal(new URL(page.url()).searchParams.get('location'),fixture.location);
  await form.locator('[data-filter-apply]').click();await nativeDialog('catalogue-filter-dialog',false);await resultCount(buy.length);assert.equal(new URL(page.url()).search,'');
 });
 await check('catalogue zero matches and invalid price states remain readable and recoverable',async()=>{
  await trigger.click();await nativeDialog('catalogue-filter-dialog');await form.locator('[name=q]').fill('NoMatchingResidenceXYZ');
  await form.locator('[data-filter-apply]').click();await nativeDialog('catalogue-filter-dialog',false);await resultCount(0);await resultIds([]);
  await frame('[data-no-results]','catalogue-empty');await inspectGeometry('catalogue-empty');
  await trigger.click();await nativeDialog('catalogue-filter-dialog');await form.locator('[data-filter-reset]').click();
  await form.locator('[name=minPrice]').fill('9000000');await form.locator('[name=maxPrice]').fill('8000000');
  assert.equal(await form.locator('[data-filter-apply]').isDisabled(),true);await resultCount(0);
  await form.locator('[data-price-error]').scrollIntoViewIfNeeded();await capture('catalogue-filters-error');await panelGeometry(dialog,'catalogue-invalid');
  await dialog.locator('[data-close-dialog]').click();await nativeDialog('catalogue-filter-dialog',false);await returnedFocus(trigger);await unlocked();
  await visitFocused('/properties/?minPrice=9000000&maxPrice=8000000');
  assert.equal(await page.locator('[data-result-count]').innerText(),'Check your price range');await resultIds([]);
  await frame('[data-no-results]','catalogue-invalid-url');await inspectGeometry('catalogue-invalid-url');
  await page.locator('[data-empty-reset]').click();await resultCount(buy.length);
 });
 await check('catalogue deep-linked filter modal, backdrop close and bottom controls work',async()=>{
  await visitFocused('/properties/#filters');await nativeDialog('catalogue-filter-dialog');
  await filterFooterScroll(form,dialog,'catalogue-filters-lower');await backdropClose(dialog,trigger);
  assert.equal(new URL(page.url()).hash,'','Closing the deep-linked panel removes only its modal fragment');
 });
 if(active.width===390||active.width===1440)await check('catalogue rapid toggles leave no lock or stale dialog',()=>rapidToggle(dialog,trigger));
}
async function menuHistoryJourney(){
 await scrollTo(0);const trigger=page.locator('.menu-toggle'),menu=page.locator('#site-menu');
 await check('menu focus, real navigation, Back and native page scroll recover cleanly',async()=>{
  await trigger.click();await nativeDialog('site-menu');await focusContained(menu);await capture('menu');await inspectGeometry('menu');
  const links=menu.locator('nav a'),paths=await links.evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname)),index=paths.indexOf('/properties/');
  assert.ok(index>=0,'Menu contains the property catalogue');
  await links.nth(index).click();await page.waitForURL(url=>url.pathname==='/properties/');await unlocked();
  await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL(url=>url.pathname==='/');await unlocked();await settleUI();
  await scrollTo(0);await page.mouse.move(active.width-24,active.height*.7);await page.mouse.wheel(0,260);
  await page.waitForFunction(()=>scrollY>20,null,{timeout:5000});await scrollTo(0);
  await trigger.click();await nativeDialog('site-menu');await page.keyboard.press('Escape');await nativeDialog('site-menu',false);await returnedFocus(trigger);await unlocked();
 });
}
async function accordionJourney(){
 const details=page.locator('details.service');
 if(await details.count()<2)return;
 await check('service accordion preserves one open section and survives rapid reversal',async()=>{
  for(const index of [0,1]){
   const item=details.nth(index);if(!await item.evaluate(node=>node.open))await item.locator('summary').click();
   await page.waitForFunction(index=>[...document.querySelectorAll('details.service')].every((node,i)=>node.open===(i===index)),index,{timeout:5000});await settleUI();
  }
  const item=details.nth(1),summary=item.locator('summary');
  await summary.click();await summary.click();
  await page.waitForFunction(()=>document.querySelectorAll('details.service')[1]?.open===true,null,{timeout:5000});await settleUI();
  const state=await item.evaluate(node=>({height:node.getBoundingClientRect().height,summary:node.querySelector('summary').getBoundingClientRect().height,overflow:node.style.overflow,heightStyle:node.style.height}));
  assert.ok(state.height>state.summary+10,'Expanded accordion has visible body');assert.equal(state.overflow,'');assert.equal(state.heightStyle,'');
  await frame('details.service[open]','service-expanded');await inspectGeometry('service-expanded');
 });
}
async function focusedInteractions(){
 if(active.id==='home'){await heroJourney();if(active.width===390||active.width===1440)await menuHistoryJourney();await accordionJourney();}
 if(active.id==='catalogue')await catalogueJourney();
}
async function writeReviewIndex(){
 const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
 const receipts=report.views.map(view=>({
  key:view.key,route:view.route,width:view.width,height:view.height,motion:view.motion,httpStatus:view.httpStatus,complete:view.complete,
  elapsedMs:view.elapsedMs,scrollThrough:view.scrollThrough,error:view.error||null,humanReview:'pending',
  checks:report.checks.filter(check=>check.view===view.key),
  findings:report.findings.filter(finding=>finding.view===view.key),
  pageErrors:report.pageErrors.filter(error=>error.view===view.key),assetFailures:report.assetFailures.filter(error=>error.view===view.key),
  screenshots:report.screenshots.filter(screenshot=>screenshot.view===view.key),
  measurements:view.measurements,filterGeometry:view.filterGeometry,formReachability:view.formReachability,motionTraces:view.motionTraces,focusTraces:view.focusTraces,frameContexts:view.frameContexts,navigationChecks:view.navigationChecks,imageWaitTraceFile:view.imageWaitTraceFile,imageWaitCount:view.imageWaitCount,galleryLayout:view.galleryLayout
 }));
 await writeFile(path.join(output,'route-receipts.json'),JSON.stringify({schemaVersion:1,stage,engine,sourceHead,humanReview:'pending',plannedViews:matrix.length,actualViews:receipts.length,receipts},null,2)+'\n');
 const sections=receipts.map(view=>'<section><h2>'+escape(view.route)+' · '+view.width+'px · '+escape(view.motion)+'</h2><p>'+escape(view.key)+' — '+(view.complete?'Captured':'INCOMPLETE')+' · '+view.findings.length+' findings · '+view.checks.length+' interaction checks</p>'+(view.error?'<pre>'+escape(view.error)+'</pre>':'')+'<div class="frames">'+view.screenshots.map(shot=>'<figure><a href="'+escape(shot.file)+'"><img loading="lazy" src="'+escape(shot.file)+'" alt="'+escape(view.route+' '+shot.kind)+'"></a><figcaption><a href="'+escape(shot.file)+'">'+escape(shot.kind)+'</a> · '+shot.bytes+' bytes<br><code>'+escape(shot.sha256)+'</code></figcaption></figure>').join('')+'</div></section>').join('\n');
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Luxury Realty interaction QA review</title><style>body{font:15px/1.5 system-ui;background:#151519;color:#eee;margin:24px auto;max-width:1500px;padding:0 24px}h1{font-weight:500}section{border-top:1px solid #444;padding:24px 0}.frames{display:flex;gap:18px;overflow-x:auto;align-items:flex-start}figure{margin:0;flex:0 0 300px}img{display:block;max-width:300px;max-height:800px;object-fit:contain;object-position:top;border:1px solid #555}a{color:#e2bf95}code{font-size:10px;overflow-wrap:anywhere}pre{white-space:pre-wrap;color:#ffbdac}.notice{background:#29242a;padding:16px;border:1px solid #66515b}</style><h1>Luxury Realty · '+escape(stage)+' · '+escape(engine)+'</h1><p class="notice">Human review is pending. Open each original PNG to inspect actual text, cropping, spacing and animation-state appearance. Thumbnails and machine checks do not prove visual acceptance.</p><p>Source '+escape(sourceHead)+' · '+receipts.length+'/'+matrix.length+' views · '+new Set(receipts.map(view=>view.route)).size+' routes captured. <a href="route-receipts.json">Per-state receipts</a> · <a href="visual-audit-report.json">Complete report</a> · <a href="canonical-routes.json">Canonical sitemap enumeration</a></p>'+sections+'</html>';
 await writeFile(path.join(output,'review-index.html'),html);
}

try{
 report.sourceHashes=await sourceSnapshot();
 if(process.env.QA_STATIC_ROOT)await serveStatic();
 else{
  const target=new URL(process.env.BASE_URL);
  assert.ok(!target.username&&!target.password&&!target.search&&!target.hash&&target.pathname==='/','BASE_URL must be an origin, with no credentials/query/hash');
  assert.ok((target.protocol==='https:'&&/^luxury-realty-imon-[a-z0-9-]+\.vercel\.app$/.test(target.hostname))||(['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&target.protocol==='http:'),'Only the named project preview or loopback test origin is allowed');
  base=target.origin;
 }
 report.base=base;
 const beforeBundle=await bundleSnapshot();
 if(beforeBundle){await writeFile(path.join(output,'static-bundle-before.json'),JSON.stringify(beforeBundle.entries,null,2)+'\n');report.staticBundle={root:staticRoot,count:beforeBundle.count,sha256:beforeBundle.sha256,manifest:'static-bundle-before.json'};}
 browser=await playwright[engine].launch({headless:true,handleSIGINT:false,handleSIGTERM:false});
 context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const request=route.request(),url=request.url();
  if(!['GET','HEAD'].includes(request.method())){
   report.blockedWrites.push({view:active?.key,method:request.method(),url});
   return route.abort('blockedbyclient');
  }
  if(new URL(url).origin!==base&&!report.externalReads.some(item=>item.url===url))report.externalReads.push({url,type:request.resourceType()});
  return route.continue();
 });
 page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(20000);
 page.on('pageerror',error=>report.pageErrors.push({view:active?.key,url:page.url(),message:error.message}));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({view:active?.key,url:message.location().url,text:message.text()});});
 page.on('response',response=>{
  if(response.status()>=400&&['image','font','stylesheet','script'].includes(response.request().resourceType()))report.assetFailures.push({view:active?.key,url:response.url(),status:response.status(),resourceType:response.request().resourceType()});
 });
 for(const [index,view] of matrix.entries()){
  if(expired)throw new Error('Audit deadline exceeded');
  active={...view,key:String(index+1).padStart(3,'0')+'-'+view.id+'-'+view.width+'-'+view.motion,startedAt:new Date().toISOString(),screenshots:[],measurements:[],skippedFrames:[],complete:false};
  report.views.push(active);
  console.log('CAPTURE '+active.key+' '+active.route);
  try{
   await page.setViewportSize({width:active.width,height:active.height});
   await page.emulateMedia({reducedMotion:active.motion});
   const response=await page.goto(base+active.route,{waitUntil:'domcontentloaded'});
   active.httpStatus=response?.status();
   assert.equal(active.httpStatus,active.status||200,'Unexpected document status');
   await page.locator('main h1').waitFor({state:'visible'});
   if(await page.locator('[data-catalogue]').count())await page.locator('[data-catalogue][data-initialized=true]').waitFor({state:'attached'});
   await visibleImages();await settleUI();
   await capture('top');
   active.scrollThrough=await walkPage();
   await inspectGeometry('page-after-scroll');
   await scrollTo(0);
   if([390,1440].includes(active.width))await capture('full',{fullPage:true});
   if(view.key&&[320,390,768,1440].includes(active.width))await frame(view.key,'content',{optional:false});
   if(active.extra&&[390,1440].includes(active.width))await frame(active.extra,'detail',{optional:false});
   if(stage!=='all-pages'){await focusedInteractions();await legacyInteractions();}
   active.complete=true;
  }catch(error){
   active.error=errorText(error);
   finding('capture-incomplete',error.message,{route:active.route});
   console.error('INCOMPLETE '+active.key+' '+error.message);
   if(!page.isClosed()){
    try{
     const filename=active.key+'-incomplete-state.png';
     const bytes=await page.screenshot({path:path.join(output,filename),timeout:5000});
     report.screenshots.push({file:filename,view:active.key,route:active.route,kind:'incomplete-state',loaded:false,acceptedForInspection:false,humanReview:'pending',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }catch{}
    if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape').catch(()=>{});
   }
  }
  active.finishedAt=new Date().toISOString();
  active.elapsedMs=Date.parse(active.finishedAt)-Date.parse(active.startedAt);
  if(failFast&&!active.complete)report.failFast={enabled:true,stopped:true,view:active.key,reason:active.error||'Incomplete view'};
  await persist();
  if(report.failFast.stopped)break;
 }
 const afterHashes=await sourceSnapshot();report.sourceHashesAfter=afterHashes;
 report.sourceDrift=[...new Set([...Object.keys(report.sourceHashes),...Object.keys(afterHashes)])].filter(file=>report.sourceHashes[file]!==afterHashes[file]);
 if(report.sourceDrift.length)finding('source-drift','Source files changed during capture',{files:report.sourceDrift});
 const afterHead=execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 report.sourceHeadAfter=afterHead;
 if(afterHead!==sourceHead)finding('head-drift','Source checkout HEAD changed during capture',{before:sourceHead,after:afterHead});
 const afterBundle=await bundleSnapshot();
 if(afterBundle){await writeFile(path.join(output,'static-bundle-after.json'),JSON.stringify(afterBundle.entries,null,2)+'\n');report.staticBundleAfter={count:afterBundle.count,sha256:afterBundle.sha256,manifest:'static-bundle-after.json'};}
 if(beforeBundle&&beforeBundle.sha256!==afterBundle.sha256)finding('static-bundle-drift','The supposedly immutable static build changed during capture',{before:beforeBundle.sha256,after:afterBundle.sha256});
 report.complete=report.views.length===matrix.length&&report.views.every(view=>view.complete)&&!expired&&report.sourceDrift.length===0&&afterHead===sourceHead&&(!beforeBundle||beforeBundle.sha256===afterBundle.sha256);
 report.machineChecksPassed=report.complete&&report.findings.every(item=>item.severity!=='error')&&report.pageErrors.length===0&&report.assetFailures.length===0&&report.blockedWrites.length===0&&report.consoleErrors.filter(item=>!item.text.includes('404 (Not Found)')||item.view?.includes('not-found')!==true).length===0;
 report.summary={stage,engine,plannedViews:matrix.length,unvisitedViews:matrix.length-report.views.length,failFast:report.failFast,canonicalRoutes:canonicalRoutes.length,uniqueRoutes:new Set(report.views.filter(view=>view.complete).map(view=>view.route)).size,checks:report.checks.length,views:report.views.length,completeViews:report.views.filter(view=>view.complete).length,screenshots:report.screenshots.length,errors:report.findings.filter(item=>item.severity==='error').length,warnings:report.findings.filter(item=>item.severity==='warning').length,pageErrors:report.pageErrors.length,consoleErrors:report.consoleErrors.length,assetFailures:report.assetFailures.length,blockedWrites:report.blockedWrites.length,humanReview:'pending'};
 process.exitCode=!report.complete?2:report.machineChecksPassed?0:1;
}catch(error){report.error=errorText(error);process.exitCode=2;}
finally{
 clearTimeout(deadline);await close();await writeReviewIndex();await persist();
 console.log(JSON.stringify({complete:report.complete,machineChecksPassed:report.machineChecksPassed,humanReview:report.humanReview,fullMatrix:report.fullMatrix,summary:report.summary,error:report.error,report:path.join(output,'visual-audit-report.json')},null,2));
}
