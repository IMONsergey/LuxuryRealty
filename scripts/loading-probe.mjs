#!/usr/bin/env node
/**
 * Usage: node /tmp/realestate-loading-probe.mjs --label baseline --output-dir /tmp/loading-probe
 * Read-only production observation: no scrolling, form interaction, forced image
 * loading, animation overrides, screenshots, or device-independent pass gates.
 */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';

const args=process.argv.slice(2);
if(args.includes('--help')||args.includes('-h')){
  console.log('Usage: node realestate-loading-probe.mjs --label baseline|after --output-dir /tmp/loading-probe\nOptional environment: PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright/package.json');
  process.exit(0);
}
let label='sample',outputDir='/tmp/realestate-loading-probe';
for(let i=0;i<args.length;i++){
  const flag=args[i],value=args[++i];
  if(!value||value.startsWith('--'))throw new Error(`Missing value for ${flag}`);
  if(flag==='--label')label=value;
  else if(flag==='--output-dir'||flag==='--out')outputDir=value;
  else throw new Error(`Unknown argument: ${flag}`);
}
const stem=label.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,80);
if(!stem||/^\.+$/.test(stem))throw new Error('Use a label containing letters or numbers.');
outputDir=path.resolve(outputDir);
await mkdir(outputDir,{recursive:true});
const output=path.join(outputDir,`${stem}.json`);
const urls=[
  'https://luxury-realty-imon.vercel.app/',
  'https://atlantis-imon.vercel.app/',
  'https://orla-imon.vercel.app/',
  'https://six-senses-imon.vercel.app/',
  'https://ava-at-palm-imon.vercel.app/'
];
const profiles=[
  {name:'desktop',viewport:{width:1440,height:900},deviceScaleFactor:1,isMobile:false,hasTouch:false},
  {name:'touch',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}
];
const started=Date.now(),runtimeBudgetMs=55000;
const report={label,startedAt:new Date(started).toISOString(),complete:false,timedOut:false,engine:'chromium',samples:[],
  method:{wait:'window load, then 2000ms of passive observation',contexts:'Fresh context per URL and profile; sequential; no throttling',
    limitations:[
      'Headless measurements from this machine are diagnostics, not field performance scores or a universal FPS gate.',
      'LCP is the latest observed candidate and CLS is the maximum session window during this short observation, not a full page-lifetime measurement.',
      'Resource Timing includes completed top-level-document requests and navigation. In-flight requests and child-frame resources are not byte totals.',
      'Zero resource sizes can mean cache, an empty response, failure, or cross-origin timing restrictions. Unavailable bytes are not estimated from Content-Length.',
      'Initially visible images intersect the viewport after CSS clipping at window load. Occlusion by other elements is not measured. naturalWidth/Height are browser-reported density-corrected dimensions.',
      'Original animations, lazy loading and motion preferences remain active; no page is scrolled or otherwise interacted with.'
    ]}};
let browser,closing;
async function close(){
  if(!closing)closing=browser?browser.close().catch(()=>{}):Promise.resolve();
  await closing;
}
const deadline=setTimeout(()=>{report.timedOut=true;void close();},runtimeBudgetMs);
deadline.unref();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
  report.error=`Interrupted by ${signal}`;report.elapsedMs=Date.now()-started;
  await Promise.race([close(),delay(1500)]);
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  process.exit(signal==='SIGINT'?130:143);
});

function kind(url,type='',mime=''){
  if(type==='document')return 'document';
  if(type==='image'||type==='img'||mime.startsWith('image/')||/\.(?:avif|webp|png|jpe?g|gif|svg|ico)(?:[?#]|$)/i.test(url))return 'image';
  if(type==='font'||/font|woff/.test(mime)||/\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i.test(url))return 'font';
  if(type==='stylesheet'||mime.includes('text/css')||/\.css(?:[?#]|$)/i.test(url))return 'style';
  if(type==='script'||/javascript|ecmascript/.test(mime)||/\.(?:m?js)(?:[?#]|$)/i.test(url))return 'script';
  if(type==='media'||mime.startsWith('video/')||mime.startsWith('audio/'))return 'media';
  if(type==='fetch'||type==='xmlhttprequest'||type==='xhr')return 'fetch';
  return 'other';
}

// Installed before the site's scripts. Observers do not alter source selection
// or wait for late assets; the load listener records actual initial image nodes.
function installProbe(){
  if(window!==window.top)return;
  performance.setResourceTimingBufferSize(1000);
  const probe={supported:{},lcp:null,shifts:[],longTasks:[],initialImages:[],loadAt:null,bufferFull:false,observers:[]};
  const describe=element=>element?`${element.tagName?.toLowerCase()||element.nodeName||'node'}${element.id?'#'+element.id:''}${typeof element.className==='string'&&element.className?'.'+element.className.trim().split(/\s+/).join('.'):''}`:null;
  const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  function visible(element){
    const r=element.getBoundingClientRect();
    let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),opacity=1;
    if(getComputedStyle(element).visibility!=='visible')return false;
    for(let node=element;node;node=node.parentElement){
      const css=getComputedStyle(node);opacity*=Number(css.opacity);
      if(css.display==='none')return false;
      if(node!==element){
        const clip=node.getBoundingClientRect();
        if(/hidden|clip|auto|scroll/.test(css.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
        if(/hidden|clip|auto|scroll/.test(css.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
      }
    }
    return opacity>.01&&right-left>1&&bottom-top>1;
  }
  function imageData(image){
    const css=getComputedStyle(image);
    return {element:describe(image),alt:image.alt,src:image.src,currentSrc:image.currentSrc,srcset:image.srcset,sizes:image.sizes,
      naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,rendered:rect(image),layoutWidth:image.clientWidth,layoutHeight:image.clientHeight,
      loading:image.loading,decoding:image.decoding,fetchPriority:image.fetchPriority,complete:image.complete,connected:image.isConnected,
      visible:visible(image),objectFit:css.objectFit,objectPosition:css.objectPosition};
  }
  function observe(type,receive){
    probe.supported[type]=typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes(type);
    if(!probe.supported[type])return;
    try{
      const observer=new PerformanceObserver(list=>receive(list.getEntries()));
      observer.observe({type,buffered:true});probe.observers.push({observer,receive});
    }catch(error){probe.supported[type]=false;probe[`${type}ObserverError`]=String(error);}
  }
  observe('largest-contentful-paint',entries=>{for(const entry of entries)probe.lcp={startTime:entry.startTime,renderTime:entry.renderTime,loadTime:entry.loadTime,size:entry.size,url:entry.url||null,element:describe(entry.element)};});
  observe('layout-shift',entries=>{for(const entry of entries)probe.shifts.push({startTime:entry.startTime,value:entry.value,hadRecentInput:entry.hadRecentInput,sources:(entry.sources||[]).map(source=>({element:describe(source.node),previousRect:source.previousRect?.toJSON?.()||source.previousRect,currentRect:source.currentRect?.toJSON?.()||source.currentRect}))});});
  observe('longtask',entries=>{for(const entry of entries)probe.longTasks.push({startTime:entry.startTime,duration:entry.duration,name:entry.name});});
  performance.addEventListener('resourcetimingbufferfull',()=>{probe.bufferFull=true;});
  window.addEventListener('load',()=>{
    probe.loadAt=performance.now();
    probe.initialImages=[...document.images].filter(visible).map(element=>({element,initial:imageData(element)}));
  },{once:true});
  probe.snapshot=()=>{
    probe.observers.forEach(({observer,receive})=>{receive(observer.takeRecords());observer.disconnect();});
    let cls=0,sessionValue=0,sessionStart=0,lastShift=0;
    for(const shift of probe.shifts.filter(shift=>!shift.hadRecentInput).sort((a,b)=>a.startTime-b.startTime)){
      if(shift.startTime-lastShift<1000&&shift.startTime-sessionStart<5000)sessionValue+=shift.value;
      else{sessionValue=shift.value;sessionStart=shift.startTime;}
      lastShift=shift.startTime;cls=Math.max(cls,sessionValue);
    }
    const navigation=performance.getEntriesByType('navigation')[0],now=performance.now();
    const resource=entry=>({url:entry.name,initiatorType:entry.initiatorType,startTime:entry.startTime,responseEnd:entry.responseEnd,duration:entry.duration,
      transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize,nextHopProtocol:entry.nextHopProtocol,deliveryType:entry.deliveryType||null});
    return {url:location.href,observedAtMs:now,loadAtMs:probe.loadAt,observedMsAfterLoad:navigation?.loadEventEnd?now-navigation.loadEventEnd:null,
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,pointerCoarse:matchMedia('(pointer:coarse)').matches,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches},
      navigation:navigation?{...resource(navigation),type:navigation.type,domContentLoadedMs:navigation.domContentLoadedEventEnd,loadEventEndMs:navigation.loadEventEnd,responseStartMs:navigation.responseStart}:null,
      resources:performance.getEntriesByType('resource').map(resource),resourceTimingBufferFull:probe.bufferFull,
      paints:performance.getEntriesByType('paint').map(entry=>({name:entry.name,startTime:entry.startTime})),
      lcp:{supported:probe.supported['largest-contentful-paint'],candidate:probe.lcp},
      cls:{supported:probe.supported['layout-shift'],maxSessionValue:probe.supported['layout-shift']?cls:null,shifts:probe.shifts},
      longTasks:{supported:probe.supported.longtask,count:probe.supported.longtask?probe.longTasks.length:null,totalDurationMs:probe.supported.longtask?probe.longTasks.reduce((sum,entry)=>sum+entry.duration,0):null,entries:probe.longTasks},
      initialVisibleImages:probe.initialImages.map(({element,initial})=>({initial,final:element.isConnected?imageData(element):null})),
      visibleImagesAtObservationEnd:[...document.images].filter(visible).map(imageData),
      fontStatus:document.fonts.status,fonts:[...document.fonts].map(font=>({family:font.family,style:font.style,weight:font.weight,status:font.status}))};
  };
  window.__realEstateLoadingProbe=probe;
}

async function sample(url,profile){
  const result={url,profile:profile.name,requestedViewport:profile.viewport,requestedDpr:profile.deviceScaleFactor,complete:false,pageErrors:[],imageFontHttpErrors:[],requestFailures:[]};
  report.samples.push(result);
  const sampleStart=Date.now();
  let context,observing=true;
  const metadata=new Map(),requests=new Map();
  try{
    const {name,...options}=profile;
    context=await browser.newContext({...options,reducedMotion:'no-preference'});
    await context.addInitScript(installProbe);
    const page=await context.newPage();
    page.on('pageerror',error=>{if(observing)result.pageErrors.push(error.message);});
    page.on('request',request=>{if(observing)requests.set(request,{url:request.url(),kind:kind(request.url(),request.resourceType()),finished:false});});
    page.on('requestfinished',request=>{if(observing&&requests.has(request))requests.get(request).finished=true;});
    page.on('requestfailed',request=>{
      if(!observing)return;
      if(requests.has(request))requests.get(request).finished=true;
      result.requestFailures.push({url:request.url(),kind:kind(request.url(),request.resourceType()),error:request.failure()?.errorText});
    });
    page.on('response',response=>{
      if(!observing)return;
      const mime=response.headers()['content-type']||'',resourceKind=kind(response.url(),response.request().resourceType(),mime);
      metadata.set(response.url(),{kind:resourceKind,status:response.status(),mime});
      if(response.status()>=400&&['image','font'].includes(resourceKind))result.imageFontHttpErrors.push({url:response.url(),kind:resourceKind,status:response.status(),mime});
    });
    let loaded=false;
    try{
      const response=await page.goto(url,{waitUntil:'load',timeout:Math.max(500,Math.min(7500,runtimeBudgetMs-(Date.now()-started)-2200))});
      result.httpStatus=response?.status()??null;loaded=true;
      await page.evaluate(()=>new Promise(resolve=>{
        function wait(){
          const loadEnd=performance.getEntriesByType('navigation')[0]?.loadEventEnd;
          if(!loadEnd){setTimeout(wait,10);return;}
          const remaining=loadEnd+2000-performance.now();
          if(remaining<=0)resolve();else setTimeout(wait,remaining+1);
        }
        wait();
      }));
    }catch(error){result.navigationError=error.message;}
    if(report.timedOut)throw new Error('The 55s total runtime budget expired.');
    const snapshot=await page.evaluate(()=>window.__realEstateLoadingProbe?.snapshot());
    if(!snapshot)throw new Error('The production document did not expose the installed observation probe.');
    Object.assign(result,snapshot);
    observing=false;
    result.pendingRequests=[...requests.values()].filter(request=>!request.finished);
    const entries=[...(snapshot.navigation?[{...snapshot.navigation,initiatorType:'document'}]:[]),...snapshot.resources];
    const byKind={};
    result.resources=entries.map(entry=>{
      const response=metadata.get(entry.url),resourceKind=response?.kind||kind(entry.url,entry.initiatorType);
      const anySize=entry.transferSize>0||entry.encodedBodySize>0||entry.decodedBodySize>0;
      const sizeStatus=anySize?'reported':new URL(entry.url).origin===new URL(snapshot.url).origin?'zero-reported':'zero-or-cross-origin-restricted';
      const aggregate=byKind[resourceKind]??={count:0,transferBytes:0,encodedBodyBytes:0,decodedBodyBytes:0,zeroSizeEntries:0};
      aggregate.count++;aggregate.transferBytes+=entry.transferSize;aggregate.encodedBodyBytes+=entry.encodedBodySize;aggregate.decodedBodyBytes+=entry.decodedBodySize;
      if(!anySize)aggregate.zeroSizeEntries++;
      return {...entry,kind:resourceKind,httpStatus:response?.status??null,mime:response?.mime??null,sizeStatus};
    });
    result.resourceBytesByKind=byKind;
    result.resourceTotals=Object.values(byKind).reduce((total,group)=>{
      for(const key of Object.keys(total))total[key]+=group[key];return total;
    },{count:0,transferBytes:0,encodedBodyBytes:0,decodedBodyBytes:0,zeroSizeEntries:0});
    result.complete=loaded&&snapshot.loadAtMs!==null&&snapshot.observedMsAfterLoad>=2000;
    const lcp=snapshot.lcp.candidate?.startTime;
    console.log(`${new URL(url).hostname} ${profile.name}: ${result.complete?'observed':'incomplete'}; reported transfer ${(result.resourceTotals.transferBytes/1024).toFixed(1)} KiB; ${result.initialVisibleImages.length} initial images; observed LCP ${lcp===undefined?'n/a':Math.round(lcp)+'ms'}; CLS ${snapshot.cls.maxSessionValue??'n/a'}`);
  }catch(error){result.error=error.stack||String(error);}
  finally{
    observing=false;
    if(context)await Promise.race([context.close().catch(()=>{}),delay(1000)]);
    result.elapsedMs=Date.now()-sampleStart;
  }
}

try{
  const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||'/home/sergey/.local/share/imon-toolkit/node/node_modules/playwright/package.json');
  const {chromium}=require('playwright');
  browser=await chromium.launch({headless:true,timeout:10000});
  report.browserVersion=browser.version();
  for(const url of urls){
    for(const profile of profiles){
      if(report.timedOut)break;
      await sample(url,profile);
      await writeFile(output,JSON.stringify(report,null,2)+'\n');
    }
    if(report.timedOut)break;
  }
  report.complete=!report.timedOut&&report.samples.length===10&&report.samples.every(sample=>sample.complete);
}catch(error){report.error=error.stack||String(error);}
finally{
  clearTimeout(deadline);
  await Promise.race([close(),delay(1500)]);
  report.elapsedMs=Date.now()-started;
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Saved ${report.samples.length}/10 observations in ${(report.elapsedMs/1000).toFixed(1)}s: ${output}. Collection ${report.complete?'complete':'incomplete'}; no performance verdict.`);
  process.exitCode=report.complete?0:1;
}

