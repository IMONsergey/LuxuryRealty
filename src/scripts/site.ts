import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
const $=<T extends Element=HTMLElement>(selector:string,root:ParentNode=document)=>root.querySelector<T>(selector);
const $$=<T extends Element=HTMLElement>(selector:string,root:ParentNode=document)=>Array.from(root.querySelectorAll<T>(selector));
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollBehavior=():ScrollBehavior=>reduceMotion.matches?'instant':'smooth';
let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string){
 const node=$('[data-toast]');if(!node)return;
 node.textContent=message;node.classList.add('is-visible');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('is-visible'),4200);
}
const dialogTriggers=new WeakMap<HTMLDialogElement,HTMLElement>();
function openDialog(dialog:HTMLDialogElement,trigger?:HTMLElement){
 const previous=trigger?.closest<HTMLDialogElement>('dialog[open]');
 const returnTarget=previous&&previous!==dialog?dialogTriggers.get(previous):trigger;
 $$<HTMLDialogElement>('dialog[open]').forEach(other=>{if(other!==dialog)other.close();});
 if(returnTarget)dialogTriggers.set(dialog,returnTarget);
 if(!dialog.open)dialog.showModal();
 document.body.classList.add('dialog-open');document.documentElement.classList.add('dialog-open');
}
$$<HTMLDialogElement>('dialog').forEach(dialog=>{
 dialog.addEventListener('close',()=>{
  const anyOpen=!!$('dialog[open]');document.body.classList.toggle('dialog-open',anyOpen);document.documentElement.classList.toggle('dialog-open',anyOpen);
  if(dialog.id==='site-menu')$('.menu-toggle')?.setAttribute('aria-expanded','false');
  const trigger=dialogTriggers.get(dialog);
  if(trigger?.isConnected&&!$('dialog[open]'))trigger.focus({preventScroll:true});
 });
 dialog.addEventListener('click',event=>{
  if(event.target===dialog){
   const r=dialog.getBoundingClientRect();const e=event as MouseEvent;
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();
  }
 });
});
$$<HTMLButtonElement>('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')?.close()));
const menu=$<HTMLDialogElement>('#site-menu');
$('.menu-toggle')?.addEventListener('click',event=>{
 if(menu){openDialog(menu,event.currentTarget as HTMLElement);$('.menu-toggle')?.setAttribute('aria-expanded','true');}
});
$$<HTMLAnchorElement>('#site-menu nav a').forEach(link=>link.addEventListener('click',()=>menu?.close()));
const enquiry=$<HTMLDialogElement>('#enquiry-dialog');
$$<HTMLButtonElement>('[data-enquiry]').forEach(button=>button.addEventListener('click',()=>{
 if(!enquiry)return;
 const context=button.dataset.enquiry||'Private consultation';
 const form=$<HTMLFormElement>('[data-enquiry-form]',enquiry);
 if(form?.dataset.sending==='true'){openDialog(enquiry,button);return;}
 const label=$('[data-enquiry-context]',enquiry);if(label)label.textContent=context;
 if(form){form.dataset.context=context;
  if(form.dataset.complete==='true'){
   form.reset();form.dataset.complete='false';form.dataset.submissionId=crypto.randomUUID();
   form.dataset.startedAt=String(Date.now());delete form.dataset.attemptedFingerprint;
   const submit=$<HTMLButtonElement>('[type=submit]',form);if(submit)submit.disabled=false;
   const status=$('.form-status',form);if(status)status.textContent='';
   const submitLabel=$('[data-submit-label]',form);if(submitLabel)submitLabel.textContent='Send enquiry';
  }
 }
 openDialog(enquiry,button);
}));
type GalleryPhoto={src:string;alt:string};
let photos:GalleryPhoto[]=[];let photoIndex=0;let galleryRequest=0;
const gallery=$<HTMLDialogElement>('#gallery-dialog');
const galleryImage=$<HTMLImageElement>('[data-gallery-image]',gallery||document);
const galleryCache=new Map<string,Promise<HTMLImageElement>>();
function loadPhoto(src:string){
 const cached=galleryCache.get(src);if(cached)return cached;
 const loading=new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>{void image.decode().then(()=>resolve(image),reject);};
  image.onerror=()=>reject(new Error('Photo could not be loaded.'));
  image.src=src;
 });
 galleryCache.set(src,loading);
 // Retain only the current image and its neighbours, rather than every full-size frame.
 while(galleryCache.size>3)galleryCache.delete(galleryCache.keys().next().value!);
 void loading.catch(()=>galleryCache.delete(src));
 return loading;
}
async function showPhoto(index:number){
 if(!gallery||!galleryImage||!photos.length)return;
 photoIndex=(index+photos.length)%photos.length;
 const requestedIndex=photoIndex;const request=++galleryRequest;const photo=photos[requestedIndex];
 const stage=$<HTMLElement>('.gallery-stage',gallery);stage?.setAttribute('aria-busy','true');
 gsap.killTweensOf(galleryImage);gsap.set(galleryImage,{clearProps:'opacity,transform'});
 try{
  const loaded=await loadPhoto(photo.src);
  if(request!==galleryRequest||!gallery.open)return;
  galleryImage.src=loaded.src;galleryImage.alt=photo.alt;
  const count=$('[data-gallery-counter]',gallery);if(count)count.textContent=String(requestedIndex+1)+' / '+photos.length;
  const caption=$('[data-gallery-caption]',gallery);if(caption)caption.textContent=photo.alt;
  if(!reduceMotion.matches)gsap.fromTo(galleryImage,{opacity:.45},{opacity:1,duration:.3,ease:'power1.out',clearProps:'opacity'});
  const next=photos[(requestedIndex+1)%photos.length];if(next&&next.src!==photo.src)void loadPhoto(next.src).catch(()=>{});
 }catch{
  if(request===galleryRequest){const caption=$('[data-gallery-caption]',gallery);if(caption)caption.textContent='This photo could not be loaded. Try another image or reopen the gallery.';}
 }finally{if(request===galleryRequest)stage?.removeAttribute('aria-busy');}
}
$$<HTMLButtonElement>('[data-gallery]').forEach(button=>button.addEventListener('click',()=>{
 try{
  const parsed:unknown=JSON.parse(button.dataset.gallery||'[]');if(!Array.isArray(parsed)||!parsed.length)return;
  const nextPhotos=parsed.filter((p):p is GalleryPhoto=>typeof p?.src==='string'&&typeof p?.alt==='string');
  if(!nextPhotos.length||!gallery||!galleryImage)return;
  photos=nextPhotos;
  const title=$('[data-gallery-title]',gallery);if(title)title.textContent=button.dataset.galleryTitle||'Gallery';
  const caption=$('[data-gallery-caption]',gallery);if(caption)caption.textContent='Loading photograph…';
  const count=$('[data-gallery-counter]',gallery);if(count)count.textContent='';
  galleryImage.removeAttribute('src');galleryImage.alt='';
  $$<HTMLButtonElement>('[data-gallery-prev],[data-gallery-next]',gallery).forEach(b=>b.hidden=photos.length<2);
  openDialog(gallery,button);void showPhoto(Number(button.dataset.galleryIndex)||0);
 }catch{toast('The gallery could not be opened. Please try again.');}
}));
$('[data-gallery-prev]')?.addEventListener('click',()=>void showPhoto(photoIndex-1));
$('[data-gallery-next]')?.addEventListener('click',()=>void showPhoto(photoIndex+1));
gallery?.addEventListener('keydown',event=>{
 if(event.key==='ArrowRight'){event.preventDefault();void showPhoto(photoIndex+1);}
 if(event.key==='ArrowLeft'){event.preventDefault();void showPhoto(photoIndex-1);}
 if(event.key==='Home'){event.preventDefault();void showPhoto(0);}
 if(event.key==='End'){event.preventDefault();void showPhoto(photos.length-1);}
});
gallery?.addEventListener('close',()=>{
 galleryRequest++;gallery?.querySelector<HTMLElement>('.gallery-stage')?.removeAttribute('aria-busy');
 if(galleryImage){gsap.killTweensOf(galleryImage);gsap.set(galleryImage,{clearProps:'opacity,transform'});}
});
let swipeStart:{x:number;y:number}|null=null;
galleryImage?.addEventListener('touchstart',event=>{
 if(event.touches.length!==1){swipeStart=null;return;}
 const touch=event.touches[0];swipeStart={x:touch.clientX,y:touch.clientY};
},{passive:true});
galleryImage?.addEventListener('touchend',event=>{
 if(!swipeStart||event.touches.length)return;
 const touch=event.changedTouches[0];const dx=touch.clientX-swipeStart.x;const dy=touch.clientY-swipeStart.y;swipeStart=null;
 if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.4)void showPhoto(photoIndex+(dx<0?1:-1));
},{passive:true});
galleryImage?.addEventListener('touchcancel',()=>{swipeStart=null;},{passive:true});

// Retries keep both the entered data and the idempotency key.
$$<HTMLFormElement>('[data-enquiry-form]').forEach(form=>{
 form.dataset.startedAt=String(Date.now());form.dataset.submissionId=crypto.randomUUID();
 const status=$<HTMLParagraphElement>('.form-status',form);
 const submit=$<HTMLButtonElement>('[type=submit]',form);const submitLabel=$('[data-submit-label]',form);
 $$<HTMLElement>('[data-error-for]',form).forEach(error=>{
  const name=error.dataset.errorFor||'';const input=$<HTMLInputElement>('[name="'+name+'"]',form);
  if(input){error.id=(input.id||(form.dataset.context||'enquiry').replace(/\W/g,'')+'-'+name)+'-error';input.setAttribute('aria-describedby',error.id);}
 });
 function clearErrors(){
  $$<HTMLElement>('[data-error-for]',form).forEach(error=>error.textContent='');
  $$('[aria-invalid]',form).forEach(input=>input.removeAttribute('aria-invalid'));status?.classList.remove('is-error');
 }
 function fieldErrors(errors:Record<string,string>){
  for(const [name,message] of Object.entries(errors)){
   const input=$<HTMLInputElement>('[name="'+name+'"]',form);input?.setAttribute('aria-invalid','true');
   const error=$('[data-error-for="'+name+'"]',form);if(error)error.textContent=message;
  }
  $<HTMLInputElement>('[aria-invalid=true]',form)?.focus();
 }
 form.addEventListener('input',event=>{
  const input=event.target as HTMLInputElement;if(!input.name)return;
  input.removeAttribute('aria-invalid');const error=$('[data-error-for="'+input.name+'"]',form);if(error)error.textContent='';
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(form.dataset.sending==='true'||form.dataset.complete==='true')return;
  if(form.dataset.referenceNeedsReset==='true'||Date.now()-Number(form.dataset.startedAt)>7*24*60*60*1000){
   form.dataset.submissionId=crypto.randomUUID();form.dataset.startedAt=String(Date.now()-800);delete form.dataset.attemptedFingerprint;delete form.dataset.referenceNeedsReset;
  }
  clearErrors();const fd=new FormData(form);
  const payload={
   project:'luxury-realty',context:form.dataset.context||'Website enquiry',
   name:String(fd.get('name')||'').trim(),email:String(fd.get('email')||'').trim(),
   phone:String(fd.get('phone')||'').trim(),message:String(fd.get('message')||'').trim(),
   consent:fd.get('consent')==='on',website:String(fd.get('website')||''),
   startedAt:Number(form.dataset.startedAt),submissionId:form.dataset.submissionId,
  };
  const errors:Record<string,string>={};
  if(payload.name.length<2)errors.name='Please enter your name.';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))errors.email='Please enter a valid email address.';
  if(payload.phone&&!/^[+\d()\s.-]{6,30}$/.test(payload.phone))errors.phone='Please include the country code and a valid phone number.';
  if(!payload.consent)errors.consent='Please confirm consent before sending your enquiry.';
  if(Object.keys(errors).length){fieldErrors(errors);if(status){status.textContent='Please check the highlighted fields.';status.classList.add('is-error');}return;}
  const fingerprint=JSON.stringify({project:payload.project,context:payload.context,name:payload.name,email:payload.email.toLowerCase(),phone:payload.phone,message:payload.message,consent:payload.consent});
  if(form.dataset.attemptedFingerprint&&form.dataset.attemptedFingerprint!==fingerprint)payload.submissionId=form.dataset.submissionId=crypto.randomUUID();
  form.dataset.attemptedFingerprint=fingerprint;
  const fields=$$<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select',form);
  const disabledBefore=fields.map(field=>field.disabled);fields.forEach(field=>field.disabled=true);
  form.setAttribute('aria-busy','true');
  form.dataset.sending='true';if(submit)submit.disabled=true;if(submitLabel)submitLabel.textContent='Sending…';
  if(status)status.textContent='Saving your enquiry securely…';
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   const data=await response.json().catch(()=>({error:'The service is temporarily unavailable. Please try again.'}));
   if(!response.ok||data.ok!==true||data.id!==payload.submissionId){
    if(response.status===409||/expired|reload the form/i.test(data.error||''))form.dataset.referenceNeedsReset='true';
    if(data.fields)fieldErrors(data.fields);throw new Error(data.error||'Your enquiry could not be confirmed. Please try again.');
   }
   form.dataset.complete='true';if(status)status.textContent='Your enquiry has been saved. Reference: '+String(data.id).slice(0,8)+'.';
   if(submitLabel)submitLabel.textContent='Enquiry received';form.reset();
  }catch(error){
   if(status){status.textContent=error instanceof Error&&error.name==='AbortError'?'The connection took too long. Please retry; your details are still here.':error instanceof Error?error.message:'Please try again. Your details are still here.';status.classList.add('is-error');}
   if(submitLabel)submitLabel.textContent='Try again';if(submit)submit.disabled=false;
  }finally{clearTimeout(timeout);form.dataset.sending='false';form.removeAttribute('aria-busy');fields.forEach((field,index)=>field.disabled=disabledBefore[index]);if(form.dataset.complete!=='true')$<HTMLInputElement>('[aria-invalid=true]',form)?.focus();}
 });
});
// Measure each rail's real snap positions. Card sizes and gaps change at breakpoints.
$$<HTMLElement>('[data-rail]').forEach(rail=>{
 const controls=$$<HTMLButtonElement>('[data-rail-prev],[data-rail-next]').filter(button=>{
  const selector=button.dataset.railPrev||button.dataset.railNext;return selector&&$(selector)===rail;
 });
 let positions:number[]=[];let intendedPosition:number|null=null;let frame=0;let settled:ReturnType<typeof setTimeout>;
 const maxScroll=()=>Math.max(0,rail.scrollWidth-rail.clientWidth);
 function updateControls(){
  const left=Math.max(0,Math.min(maxScroll(),rail.scrollLeft));
  controls.forEach(button=>button.disabled=button.dataset.railPrev!==undefined?left<=2:left>=maxScroll()-2);
  frame=0;
 }
 function measure(){
  intendedPosition=null;
  const railRect=rail.getBoundingClientRect();const padding=parseFloat(getComputedStyle(rail).paddingLeft)||0;const max=maxScroll();
  positions=Array.from(rail.children).map(item=>{
   const rect=item.getBoundingClientRect();const left=rect.left-railRect.left+rail.scrollLeft;
   const align=getComputedStyle(item).scrollSnapAlign;
   return Math.max(0,Math.min(max,align.includes('center')?left+(rect.width-rail.clientWidth)/2:left-padding));
  }).filter((value,index,array)=>index===0||Math.abs(value-array[index-1])>2);
  if(!positions.length||positions[positions.length-1]<max-2)positions.push(max);
  updateControls();
 }
 function move(direction:number){
  const origin=intendedPosition??rail.scrollLeft;
  intendedPosition=direction>0?positions.find(position=>position>origin+2)??maxScroll():[...positions].reverse().find(position=>position<origin-2)??0;
  rail.scrollTo({left:intendedPosition,behavior:scrollBehavior()});
 }
 controls.forEach(button=>button.addEventListener('click',()=>move(button.dataset.railPrev!==undefined?-1:1)));
 rail.addEventListener('keydown',event=>{
  if(event.target!==rail)return;
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
  if(event.key==='Home'||event.key==='End'){
   event.preventDefault();intendedPosition=event.key==='Home'?0:maxScroll();rail.scrollTo({left:intendedPosition,behavior:scrollBehavior()});
  }
 });
 rail.addEventListener('scroll',()=>{
  if(!frame)frame=requestAnimationFrame(updateControls);
  clearTimeout(settled);settled=setTimeout(()=>{intendedPosition=null;},140);
 },{passive:true});
 rail.addEventListener('pointerdown',()=>{intendedPosition=null;},{passive:true});
 rail.addEventListener('wheel',()=>{intendedPosition=null;},{passive:true});
 new ResizeObserver(measure).observe(rail);measure();
});
// Filters survive reloads, shared URLs and browser history.
const catalogueStateKey='luxury-realty:catalogue';
type CatalogueState={url:string;scrollY:number;propertyId?:string};
function readCatalogueState():CatalogueState|null{
 try{
  const state=JSON.parse(sessionStorage.getItem(catalogueStateKey)||'null') as CatalogueState|null;
  if(!state||typeof state.url!=='string'||!/^\/properties\/(?:\?[^#]*)?$/.test(state.url)||typeof state.scrollY!=='number'||!Number.isFinite(state.scrollY))return null;
  return state;
 }catch{return null;}
}
const returnLink=$<HTMLAnchorElement>('.property-page .back-link');
if(returnLink){const saved=readCatalogueState();if(saved){returnLink.href=saved.url;returnLink.addEventListener('click',()=>{try{sessionStorage.setItem(catalogueStateKey+':return','1');}catch{}});}}
const catalogue=$<HTMLElement>('[data-catalogue]');
if(catalogue){
 const form=$<HTMLFormElement>('[data-filters]',catalogue)!;
 const grid=$<HTMLElement>('[data-property-grid]',catalogue)!;
 const cards=$$<HTMLElement>('[data-property-card]',grid);const sort=$<HTMLSelectElement>('[data-sort]',catalogue)!;
 const paramsAllowed=['purpose','q','type','beds','min','max','features','sort'];
 function saveCatalogue(propertyId?:string){
  try{sessionStorage.setItem(catalogueStateKey,JSON.stringify({url:location.pathname+location.search,scrollY:Math.max(0,scrollY),propertyId}));}catch{/* Browsers may deny session storage; URL filters still work. */}
 }
 cards.forEach(card=>$<HTMLAnchorElement>('a',card)?.addEventListener('click',()=>saveCatalogue(card.dataset.id)));
 function loadQuery(){
  const params=new URLSearchParams(location.search);form.reset();
  $$<HTMLInputElement>('input[name]',form).forEach(input=>{
   const values=params.getAll(input.name).flatMap(value=>value.split(','));
   if(input.type==='checkbox')input.checked=values.includes(input.value);
   else if(input.type==='radio')input.checked=values.length?values.includes(input.value):input.value==='';
   else if(input.name==='purpose')input.value=params.get('purpose')==='rent'?'rent':'buy';
   else input.value=params.get(input.name)||'';
  });
  const requested=params.get('sort')||'featured';sort.value=['featured','price-low','price-high','name'].includes(requested)?requested:'featured';
  applyFilters(false);
 }
 function applyFilters(update=true){
  const fd=new FormData(form);const q=String(fd.get('q')||'').trim().toLowerCase();
  const purpose=String(fd.get('purpose')||'buy');const types=fd.getAll('type').map(String);
  const features=fd.getAll('features').map(String);const bedrooms=Number(fd.get('beds')||0);
  const min=Math.max(0,Number(fd.get('min')||0));const max=Number(fd.get('max')||0)||Infinity;
  const error=$('[data-filter-error]',form);if(error)error.textContent=min>max?'The maximum price must be higher than the minimum.':'';
  let count=0;
  const sorted=[...cards].sort((a,b)=>{
   if(sort.value==='price-low')return Number(a.dataset.price)-Number(b.dataset.price);
   if(sort.value==='price-high')return Number(b.dataset.price)-Number(a.dataset.price);
   if(sort.value==='name')return(a.dataset.search||'').localeCompare(b.dataset.search||'');
   return cards.indexOf(a)-cards.indexOf(b);
  });
  sorted.forEach(card=>{
   const d=card.dataset;const p=Number(d.price);
   const match=d.purpose===purpose&&(!q||(d.search||'').includes(q))&&(!types.length||types.includes(d.type||''))&&(!bedrooms||Number(d.bedrooms)>=bedrooms)&&p>=min&&p<=max&&features.every(feature=>(d.features||'').split(',').includes(feature));
   card.hidden=!match;if(match)count++;grid.append(card);
  });
  const empty=$<HTMLElement>('[data-no-results]',grid);if(empty){empty.hidden=count>0;grid.append(empty);}
  const countNode=$('[data-result-count]',catalogue!);if(countNode)countNode.textContent=count+' '+(count===1?'property':'properties');
  $$<HTMLButtonElement>('[data-purpose]',catalogue!).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.purpose===purpose)));
  if(update){
   const params=new URLSearchParams();
   for(const name of paramsAllowed){const values=name==='sort'?[sort.value]:fd.getAll(name).map(String);values.filter(v=>v&&!(name==='sort'&&v==='featured')&&!(name==='purpose'&&v==='buy')).forEach(value=>params.append(name,value));}
   const url=location.pathname+(params.size?'?'+params.toString():'');
   if(url!==location.pathname+location.search)history.pushState({},'',url);
   saveCatalogue();
  }
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();applyFilters();
  if(matchMedia('(max-width:900px)').matches){const disclosure=$<HTMLDetailsElement>('.filter-disclosure',catalogue!);if(disclosure)disclosure.open=false;grid.scrollIntoView({behavior:scrollBehavior(),block:'start'});}
 });
 let loadingQuery=false;
 form.addEventListener('reset',()=>{if(!loadingQuery)setTimeout(()=>{sort.value='featured';applyFilters();},0);});
 form.addEventListener('change',()=>applyFilters());
 let searchTimer:ReturnType<typeof setTimeout>;
 $<HTMLInputElement>('[name=q]',form)?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFilters(),350);});
 sort.addEventListener('change',()=>applyFilters());
 $$<HTMLButtonElement>('[data-purpose]',catalogue).forEach(button=>button.addEventListener('click',()=>{const input=$<HTMLInputElement>('[name=purpose]',form);if(input)input.value=button.dataset.purpose||'buy';applyFilters();}));
 function readLocation(){loadingQuery=true;loadQuery();loadingQuery=false;}
 window.addEventListener('popstate',readLocation);readLocation();
 try{
  const saved=readCatalogueState();const returning=sessionStorage.getItem(catalogueStateKey+':return')==='1';
  sessionStorage.removeItem(catalogueStateKey+':return');
  if(returning&&saved&&saved.url===location.pathname+location.search){
   const restore=()=>requestAnimationFrame(()=>{window.scrollTo({top:saved.scrollY,behavior:'instant'});const card=cards.find(item=>item.dataset.id===saved.propertyId);$<HTMLAnchorElement>('a',card||catalogue)?.focus({preventScroll:true});});
   if(document.readyState==='complete')void document.fonts.ready.then(restore);else window.addEventListener('load',()=>void document.fonts.ready.then(restore),{once:true});
  }
 }catch{/* Storage denial does not affect navigation. */}
 const mobileFilters=matchMedia('(max-width:900px)');
 const disclosure=$<HTMLDetailsElement>('.filter-disclosure',catalogue);
 function syncFilterDisclosure(){if(disclosure)disclosure.open=!mobileFilters.matches||location.hash==='#filters';}
 mobileFilters.addEventListener('change',syncFilterDisclosure);syncFilterDisclosure();
}
const insights=$('[data-insights]');
if(insights){
 $$<HTMLButtonElement>('[data-category]',insights).forEach(button=>button.addEventListener('click',()=>{
  const category=button.dataset.category;
  $$<HTMLButtonElement>('[data-category]',insights).forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  $$<HTMLElement>('[data-insight-category]',insights).forEach(card=>card.hidden=category!=='all'&&card.dataset.insightCategory!==category);
 }));
}
$$<HTMLButtonElement>('[data-share]').forEach(button=>button.addEventListener('click',async()=>{
 const data={title:document.title,url:location.href};
 try{if(navigator.share)await navigator.share(data);else if(navigator.clipboard){await navigator.clipboard.writeText(data.url);toast('Link copied.');}else toast('Copy the address from your browser to share this page.');}
 catch(error){if(!(error instanceof Error&&error.name==='AbortError'))toast('Copy the address from your browser to share this page.');}
}));
// Keep one positioning model for the header; no entrance animation is replayed at the threshold.
const header=$('.site-header');let headerPending=false;
function updateHeader(){header?.classList.toggle('is-scrolled',scrollY>80);headerPending=false;}
window.addEventListener('scroll',()=>{if(!headerPending){requestAnimationFrame(updateHeader);headerPending=true;}},{passive:true});updateHeader();
window.addEventListener('pageshow',updateHeader);
gsap.registerPlugin(ScrollTrigger);
const motion=gsap.matchMedia();
motion.add('(prefers-reduced-motion: no-preference)',()=>{
 const title=$('[data-hero-title]');
 // History restoration should not replay the opening scene below the fold.
 if(title&&scrollY<100){
  const intro=gsap.timeline({defaults:{duration:.9,ease:'power3.out',clearProps:'transform,opacity'}});
  intro.from(title.children,{y:26,opacity:0,stagger:.1},0);
  intro.from('.hero-lettering',{y:16,opacity:0},.15);
  intro.from('.hero-intro',{y:18,opacity:0},.25);
 }
 $$<HTMLElement>('[data-reveal]').forEach(element=>gsap.from(element,{y:28,opacity:.2,duration:.85,ease:'power2.out',clearProps:'transform,opacity',scrollTrigger:{trigger:element,start:'top 92%',once:true}}));
});
motion.add('(min-width:1000px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion: no-preference)',()=>{
 const hero=$('[data-hero-parallax]');
 if(hero)gsap.to(hero,{y:90,ease:'none',scrollTrigger:{trigger:'.home-hero',start:'top top',end:'bottom top',scrub:.45}});
});

// Native details stay usable without JS; enhancement preserves rapid reversals and reduced motion.
const services=$$<HTMLDetailsElement>('.service');
const serviceStates=new Map<HTMLDetailsElement,{open:boolean;animation:Animation|null}>();
let refreshFrame=0;
function refreshMotion(){if(!refreshFrame)refreshFrame=requestAnimationFrame(()=>{refreshFrame=0;ScrollTrigger.refresh();});}
function setService(service:HTMLDetailsElement,open:boolean){
 const state=serviceStates.get(service)!;const summary=$<HTMLElement>('summary',service)!;
 const currentHeight=service.getBoundingClientRect().height;
 state.animation?.cancel();state.animation=null;state.open=open;service.dataset.motionOpen=String(open);
 if(open)service.open=true;
 service.style.height='';
 const endHeight=open?service.getBoundingClientRect().height:summary.getBoundingClientRect().height+parseFloat(getComputedStyle(service).borderTopWidth)+parseFloat(getComputedStyle(service).borderBottomWidth);
 const finish=()=>{service.open=state.open;service.style.height='';service.style.overflow='';state.animation=null;refreshMotion();};
 if(reduceMotion.matches||Math.abs(endHeight-currentHeight)<1){finish();return;}
 service.style.overflow='hidden';
 state.animation=service.animate([{height:currentHeight+'px'},{height:endHeight+'px'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
 state.animation.onfinish=finish;
}
services.forEach(service=>{
 service.removeAttribute('name');serviceStates.set(service,{open:service.open,animation:null});
 $<HTMLElement>('summary',service)?.addEventListener('click',event=>{
  event.preventDefault();const open=!serviceStates.get(service)!.open;
  if(open)services.forEach(other=>{if(other!==service&&serviceStates.get(other)!.open)setService(other,false);});
  setService(service,open);
 });
});
reduceMotion.addEventListener('change',()=>{
 if(!reduceMotion.matches)return;
 services.forEach(service=>{const state=serviceStates.get(service)!;state.animation?.cancel();state.animation=null;service.open=state.open;service.style.height='';service.style.overflow='';});
 if(galleryImage){gsap.killTweensOf(galleryImage);gsap.set(galleryImage,{clearProps:'opacity,transform'});}
 refreshMotion();
});
document.fonts.ready.then(refreshMotion);
window.addEventListener('load',refreshMotion,{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)refreshMotion();});
