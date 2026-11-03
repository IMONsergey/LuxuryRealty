import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,realpath,stat,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * A capture/geometry audit, not a machine declaration that the design is good.
 * Run through imon-job. It owns one Chromium, context, page and (only when
 * QA_STATIC_ROOT is explicit) a loopback static server. It never builds.
 *
 * BEFORE, immutable existing build:
 * QA_PHASE=before QA_STATIC_ROOT=/absolute/.vercel/output/static
 * QA_SOURCE_ROOT=/absolute/source-checkout QA_OUTPUT_DIR=/absolute/new-output
 * node scripts/global-visual-audit.mjs
 *
 * AFTER, verified immutable public preview:
 * QA_PHASE=after BASE_URL=https://luxury-realty-imon-<deployment>.vercel.app
 * QA_EXPECTED_HEAD=<commit> QA_OUTPUT_DIR=/absolute/new-output
 * node scripts/global-visual-audit.mjs
 *
 * Exit 0: capture complete, machine checks passed; visual review STILL pending.
 * Exit 1: capture complete with real geometry/network/content findings.
 * Exit 2: capture incomplete, source drift, setup error, or deadline.
 * Optional QA_CASES and QA_WIDTHS restrict explicitly; the report then says
 * fullMatrix:false. A restricted run is never represented as global coverage.
 */
const root=process.cwd();
const sourceRoot=path.resolve(process.env.QA_SOURCE_ROOT||root);
const invocationPhase=process.env.QA_PHASE;
// Explicit orchestration labels retain the same after-check semantics.
const phase=['final-corrections','public-preview'].includes(invocationPhase)?'after':invocationPhase;
assert.ok(['before','after'].includes(phase),'Set QA_PHASE=before, after, final-corrections or public-preview');
assert.ok(Boolean(process.env.BASE_URL)!==Boolean(process.env.QA_STATIC_ROOT),'Set exactly one of BASE_URL or QA_STATIC_ROOT');
const cgroup=await readFile('/proc/self/cgroup','utf8');
assert.match(cgroup,/\/imon-job@[^/]+\.service(?:\/|$)/m,'Use imon-job; this audit must not launch a browser outside the serialized job');
const output=path.resolve(process.env.QA_OUTPUT_DIR||'artifacts/global-visual-audit-'+phase);
await mkdir(output,{recursive:true});
assert.equal((await readdir(output)).length,0,'QA_OUTPUT_DIR must be new/empty; old evidence is never reused or overwritten');
const timeoutMs=Number(process.env.QA_TIMEOUT_MS||780000);
assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>=60000&&timeoutMs<=1200000,'QA_TIMEOUT_MS must be 60000..1200000');
const sourceHead=execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.QA_EXPECTED_HEAD)assert.equal(sourceHead,process.env.QA_EXPECTED_HEAD,'Unexpected source checkout HEAD');
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
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
const viewportHeights={320:844,390:844,720:1000,768:1024,1024:900,1440:1000,1920:1080};
const coreWidths=[390,768,1024,1440];
const propertyPath=p=>'/properties/'+p.id+'/';
const definitions=[
 {id:'home',route:'/',widths:[320,...coreWidths,1920],key:'.consultation',extra:'.story-layout'},
 {id:'catalogue',route:'/properties/',widths:[320,...coreWidths,1920],key:'[data-property-grid]'},
 {id:'rent',route:'/properties/?purpose=rent',widths:[390,1024],key:'[data-property-grid]'},
 {id:'archive',route:'/properties/?status=archived&purpose=all',widths:[390,1024],key:'[data-property-grid]'},
 {id:'project-enquiries',route:'/properties/?purpose=developments',widths:[390,1024],key:'[data-property-grid]'},
 {id:'property',route:propertyPath(property),widths:[320,...coreWidths,1920],key:'.advisor-sticky',extra:'.property-features',enquiry:true,gallery:true},
 {id:'property-archived',route:propertyPath(archive),widths:[390,1440],key:'.property-archive-notice'},
 {id:'property-long',route:propertyPath(longProperty),widths:[390,1440],key:'.property-richtext'},
 {id:'developments',route:'/developments/',widths:coreWidths,key:'.developments-collection'},
 ...projects.map(project=>({
  id:'project-'+project.id,route:'/developments/'+project.id+'/',
  widths:project.id==='atlantis'?coreWidths:project.id.includes('serenity')?[390,768,1440]:[390,1440],
  key:'.development-story-list',
  extra:project.id.includes('serenity')?['.development-location','.development-story:last-child']:'.project-enquiry'
 })),
 {id:'about',route:'/about/',widths:coreWidths,key:'.team-grid',extra:'.team-card:last-child'},
 {id:'services',route:'/services/',widths:coreWidths,key:'.service-detail-list'},
 {id:'sell',route:'/sell/',widths:[390,720,768,1024,1440],key:'.valuation-section',blankForm:'.valuation-section form'},
 {id:'contacts',route:'/contacts/',widths:[320,...coreWidths,1920],key:'.contact-grid',blankForm:'.contact-grid form'},
 {id:'insights',route:'/insights/',widths:coreWidths,key:'.insights-grid'},
 {id:'article',route:'/insights/'+(articleIds.includes('a-home-by-the-water')?'a-home-by-the-water':articleIds[0])+'/',widths:coreWidths,key:'.article-body'},
 {id:'privacy',route:'/privacy/',widths:coreWidths,key:'.legal-page'},
 {id:'not-found',route:'/__visual-audit-missing__/',widths:coreWidths,status:404,key:'.not-found'}
];
const caseFilter=process.env.QA_CASES?new Set(process.env.QA_CASES.split(',').map(s=>s.trim()).filter(Boolean)):null;
const widthFilter=process.env.QA_WIDTHS?new Set(process.env.QA_WIDTHS.split(',').map(Number)):null;
if(caseFilter)for(const id of caseFilter)assert.ok(definitions.some(definition=>definition.id===id),'Unknown QA_CASES entry: '+id);
if(widthFilter)for(const width of widthFilter)assert.ok(viewportHeights[width],'Unknown QA_WIDTHS entry: '+width);
const matrix=definitions.flatMap(definition=>definition.widths.map(width=>({...definition,width,height:viewportHeights[width]}))).filter(view=>(!caseFilter||caseFilter.has(view.id))&&(!widthFilter||widthFilter.has(view.width)));
assert.ok(matrix.length,'Selected matrix is empty');
let browser,context,page,server,staticRoot,base,expired=false,closing,active=null;
const report={
 project:'Luxury Realty',phase,invocationPhase,engine:'chromium',startedAt:new Date().toISOString(),
 sourceHead,sourceRoot,sourceMode:process.env.BASE_URL?'externally-deployed-preview':'explicit-existing-static-build',
 targetBinding:process.env.BASE_URL?'The caller must separately verify that this URL is the deployment for the recorded source commit.':'Static bundle bytes are fingerprinted before and after.',
 queueCgroup:cgroup.trim(),harnessSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
 fullMatrix:!caseFilter&&!widthFilter,plannedViews:matrix.map(({id,route,width,height})=>({id,route,width,height})),
 preferences:{reducedMotion:'reduce',deviceScaleFactor:1,serviceWorkers:'block'},
 sourceHashes:{},sourceDrift:[],views:[],screenshots:[],findings:[],pageErrors:[],consoleErrors:[],assetFailures:[],
 blockedWrites:[],externalReads:[],complete:false,machineChecksPassed:false,humanReview:'pending',
 limitations:[
  'Screenshots and geometry are evidence for human review, not an aesthetic pass.',
  'Reduced-motion layout is inspected; animation choreography and background-film playback are not tested here.',
  'One Chromium engine is used sequentially. Firefox/WebKit are not implied.',
  'No real enquiry is sent. Empty-form validation is local, and every non-GET/HEAD request is blocked.',
  'All seven project profiles are visited. Property page variants use documented real fixtures; not every listing is manually inspected.',
  'Screenshots cannot establish full WCAG compliance, real Safari/device rendering, or external film playback.'
 ]
};
async function filesUnder(directory){
 const result=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory()){if(!['node_modules','.git','__pycache__'].includes(entry.name))result.push(...await filesUnder(file));}
  else if(entry.isFile())result.push(file);
 }
 return result;
}
async function sourceSnapshot(){
 const files=await filesUnder(path.join(sourceRoot,'src'));
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
async function visibleImages(){
 await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:10000});
 await page.waitForFunction(()=>Array.from(document.images).filter(image=>{
  const r=image.getBoundingClientRect();
  return Boolean(image.getAttribute('src')||image.getAttribute('srcset'))&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 }).every(image=>image.complete&&image.naturalWidth>0),null,{timeout:15000});
 await page.evaluate(async()=>{
  await Promise.all(Array.from(document.images).filter(image=>{
   const r=image.getBoundingClientRect();return Boolean(image.getAttribute('src'))&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
  }).map(image=>image.decode()));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
}
async function capture(kind,options={}){
 await visibleImages();
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
 await scrollTo(0);
 while(true){
  if(expired)throw new Error('Deadline exceeded during scroll-through');
  const position=await page.evaluate(()=>({y:scrollY,height:innerHeight,total:document.documentElement.scrollHeight}));
  if(position.y+position.height>=position.total-2)break;
  assert.ok(++steps<=160,'Scroll-through exceeded 160 steps; page may be growing indefinitely');
  await page.mouse.move(Math.max(20,active.width-28),Math.round(active.height*.55));
  await page.mouse.wheel(0,Math.round(active.height*.78));
  await page.waitForFunction(before=>scrollY>before+1||scrollY+innerHeight>=document.documentElement.scrollHeight-2,position.y,{timeout:4000});
  await visibleImages();
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
 const top=await locator.evaluate(element=>scrollY+element.getBoundingClientRect().top);
 await scrollTo(top-104);
 await capture(kind);
}
async function inspectGeometry(label){
 const measurements=await page.evaluate(()=>{
  const visible=element=>{
   if(!(element instanceof Element)||element.closest('.sr-only,.honeypot,[hidden],dialog:not([open]),[inert]'))return false;
   const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
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
  const images=[...document.images].filter(visible).filter(image=>image.getAttribute('src')).filter(image=>{const r=image.getBoundingClientRect();return !inHorizontalScroller(image)||(r.right>0&&r.left<innerWidth);}).map(image=>{
   const style=getComputedStyle(image);return {src:new URL(image.currentSrc||image.src,location.href).pathname,alt:image.alt,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,objectFit:style.objectFit,rect:rect(image)};
  });
  const headings=[...document.querySelectorAll('main h1,main h2,main h3')].filter(visible).map(element=>{
   const style=getComputedStyle(element);return {...summarize(element),fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight};
  });
  const dialogs=[...document.querySelectorAll('dialog[open]')].map(dialog=>({id:dialog.id,rect:rect(dialog),scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight}));
  return {
   viewport:{width:innerWidth,height:innerHeight},scrollY:Math.round(scrollY),documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
   documentHeight:document.documentElement.scrollHeight,h1:[...document.querySelectorAll('main h1')].map(element=>element.textContent?.trim()),
   overflow,advisorOverlaps,formOverflows,cardRows,containers,rails,images,headings,dialogs
  };
 });
 active.measurements.push({label,...measurements});
 if(measurements.h1.length!==1||!measurements.h1[0])finding('h1','Expected exactly one nonempty page H1',{label,count:measurements.h1.length});
 if(measurements.documentWidth>active.width+1||measurements.bodyWidth>active.width+1)finding('document-overflow','Document extends beyond the viewport',{label,documentWidth:measurements.documentWidth,bodyWidth:measurements.bodyWidth,viewport:active.width});
 if(measurements.overflow.length)finding('visible-horizontal-overflow','Meaningful content extends beyond the viewport outside an intentional horizontal scroller',{label,elements:measurements.overflow});
 if(measurements.advisorOverlaps.length)finding('advisor-controls-overlap','Advisor action controls overlap',{label,pairs:measurements.advisorOverlaps});
 if(measurements.formOverflows.length)finding('form-controls-overflow','A form control or validation message exceeds the form bounds',{label,controls:measurements.formOverflows});
 for(const row of measurements.cardRows)if(row.priceSpread>2)finding('card-price-alignment','Prices in the same catalogue grid row are not aligned',{label,row});
 const broken=measurements.images.filter(image=>!image.complete||!image.naturalWidth);
 if(broken.length)finding('unloaded-rendered-images','Rendered images are missing after complete scroll-through',{label,images:broken});
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
 const upscaled=measurements.images.filter(image=>image.naturalWidth>0&&image.rect.width>image.naturalWidth*1.4&&!/\.svg(?:$|\?)/.test(image.src)).slice(0,12);
 if(upscaled.length)finding('image-upscaling','Source pixels are stretched beyond 1.4x their natural width',{label,images:upscaled},'warning');
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
async function interactions(){
 if(active.id==='home'&&[390,768,1440].includes(active.width)){
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
  if(contextText.includes(property.id))finding('technical-enquiry-label','Technical property slug is visible in the enquiry label',{text:contextText});
  await inspectGeometry('enquiry');
  await emptyForm('#enquiry-dialog form','enquiry-validation');
  await page.keyboard.press('Escape');await page.locator('#enquiry-dialog').waitFor({state:'hidden'});
 }
 if(active.gallery&&[320,390,1440].includes(active.width)){
  await scrollTo(0);await page.locator('.property-hero [data-gallery]').first().click();
  await page.locator('#gallery-dialog[open]').waitFor({state:'visible'});
  await page.waitForFunction(()=>{const img=document.querySelector('[data-gallery-image]');return img?.complete&&img.naturalWidth>0;});
  await capture('gallery');await inspectGeometry('gallery');
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
 if(active.blankForm&&[390,720,768,1440].includes(active.width))await emptyForm(active.blankForm,'form-validation');
 if(active.id==='about'&&[390,1440].includes(active.width)){
  const biography=page.locator('.team-bio').filter({visible:true}).last();
  if(await biography.count()){
   await biography.locator('summary').click();
   await frame('.team-card:last-child','team-biography');
   await inspectGeometry('team-biography');
  }
 }
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
 browser=await chromium.launch({headless:true});
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
  active={...view,key:String(index+1).padStart(3,'0')+'-'+view.id+'-'+view.width,startedAt:new Date().toISOString(),screenshots:[],measurements:[],skippedFrames:[],complete:false};
  report.views.push(active);
  console.log('CAPTURE '+active.key+' '+active.route);
  try{
   await page.setViewportSize({width:active.width,height:active.height});
   const response=await page.goto(base+active.route,{waitUntil:'domcontentloaded'});
   active.httpStatus=response?.status();
   assert.equal(active.httpStatus,active.status||200,'Unexpected document status');
   await page.locator('main h1').waitFor({state:'visible'});
   if(await page.locator('[data-catalogue]').count())await page.locator('[data-catalogue][data-initialized=true]').waitFor({state:'attached'});
   await visibleImages();
   await capture('top');
   active.scrollThrough=await walkPage();
   await inspectGeometry('page-after-scroll');
   await scrollTo(0);
   if([390,1440].includes(active.width))await capture('full',{fullPage:true});
   if(active.key&&[390,720,768,1440].includes(active.width))await frame(view.key,'content',{optional:false});
   if(active.extra&&[390,1440].includes(active.width))await frame(active.extra,'detail',{optional:false});
   await interactions();
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
  await persist();
 }
 const afterHashes=await sourceSnapshot();
 report.sourceDrift=[...new Set([...Object.keys(report.sourceHashes),...Object.keys(afterHashes)])].filter(file=>report.sourceHashes[file]!==afterHashes[file]);
 if(report.sourceDrift.length)finding('source-drift','Source files changed during capture',{files:report.sourceDrift});
 const afterHead=execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 report.sourceHeadAfter=afterHead;
 if(afterHead!==sourceHead)finding('head-drift','Source checkout HEAD changed during capture',{before:sourceHead,after:afterHead});
 const afterBundle=await bundleSnapshot();
 if(beforeBundle&&beforeBundle.sha256!==afterBundle.sha256)finding('static-bundle-drift','The supposedly immutable static build changed during capture',{before:beforeBundle.sha256,after:afterBundle.sha256});
 report.complete=report.views.length===matrix.length&&report.views.every(view=>view.complete)&&!expired&&report.sourceDrift.length===0&&afterHead===sourceHead&&(!beforeBundle||beforeBundle.sha256===afterBundle.sha256);
 report.machineChecksPassed=report.complete&&report.findings.every(item=>item.severity!=='error')&&report.pageErrors.length===0&&report.assetFailures.length===0&&report.blockedWrites.length===0&&report.consoleErrors.filter(item=>!item.text.includes('404 (Not Found)')||item.view?.includes('not-found')!==true).length===0;
 report.summary={views:report.views.length,completeViews:report.views.filter(view=>view.complete).length,screenshots:report.screenshots.length,errors:report.findings.filter(item=>item.severity==='error').length,warnings:report.findings.filter(item=>item.severity==='warning').length,pageErrors:report.pageErrors.length,consoleErrors:report.consoleErrors.length,assetFailures:report.assetFailures.length,blockedWrites:report.blockedWrites.length,humanReview:'pending'};
 process.exitCode=!report.complete?2:report.machineChecksPassed?0:1;
}catch(error){report.error=errorText(error);process.exitCode=2;}
finally{
 clearTimeout(deadline);await close();await persist();
 console.log(JSON.stringify({complete:report.complete,machineChecksPassed:report.machineChecksPassed,humanReview:report.humanReview,fullMatrix:report.fullMatrix,summary:report.summary,error:report.error,report:path.join(output,'visual-audit-report.json')},null,2));
}
