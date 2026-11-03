import {gsap} from 'gsap';
import {setupCatalogue} from './catalogue';
import {setupHeroFilters} from './hero-filters';
import {setupDialogs,openDialog,closeDialog} from './dialogs';
import {setupMotion} from './motion';
import './hero-film';
import {setupFilms} from './films';
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
setupDialogs();
setupCatalogue(openDialog,closeDialog);
setupHeroFilters(openDialog,closeDialog);
setupFilms(openDialog);
const menu=$<HTMLDialogElement>('#site-menu');
$('.menu-toggle')?.addEventListener('click',event=>{
 if(menu)openDialog(menu,event.currentTarget as HTMLElement);
});
$$<HTMLAnchorElement>('#site-menu nav a').forEach(link=>link.addEventListener('click',event=>{
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 if(menu)closeDialog(menu,{immediate:true,restoreFocus:false});
}));
function syncCurrentNavigation(){
 const currentPurpose=new URLSearchParams(location.search).get('purpose')||'buy';
 $$<HTMLAnchorElement>('#site-menu nav a').forEach(link=>{
  const target=new URL(link.href);
  const active=target.pathname===location.pathname&&!target.hash&&(target.pathname!=='/properties/'||(target.searchParams.get('purpose')||'buy')===currentPurpose);
  if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
}
syncCurrentNavigation();
const enquiry=$<HTMLDialogElement>('#enquiry-dialog');
$$<HTMLButtonElement>('[data-enquiry]').forEach(button=>button.addEventListener('click',()=>{
 if(!enquiry)return;
 const context=button.dataset.enquiry||'Private consultation';
 const form=$<HTMLFormElement>('[data-enquiry-form]',enquiry);
 if(form?.dataset.sending==='true'){openDialog(enquiry,button);return;}
 const label=$('[data-enquiry-context]',enquiry);if(label)label.textContent=button.dataset.enquiryLabel||context;
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
  // The inline contact form can start another enquiry without a page reload.
  // A new reference is created only after a completed form is edited.
  if(form.dataset.complete==='true'){
   form.dataset.complete='false';form.dataset.submissionId=crypto.randomUUID();form.dataset.startedAt=String(Date.now());
   delete form.dataset.attemptedFingerprint;delete form.dataset.referenceNeedsReset;
   if(submit)submit.disabled=false;if(submitLabel)submitLabel.textContent='Send enquiry';
   if(status){status.textContent='';status.classList.remove('is-error');}
  }
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
// Removing the last ScrollTrigger can clear its remembered scroll in WebKit.
// One preference change can dispatch more than one matchMedia transaction;
// preserve the reading section around every cleanup/refresh transaction.
const motionLifecycle=gsap as typeof gsap & {
 addEventListener(type:'matchMediaInit'|'matchMedia',listener:()=>void):void;
};
type ReadingPosition={anchor:HTMLElement|null;top:number;x:number;y:number;width:number;height:number};
function readReadingPosition():ReadingPosition{
 const line=Math.min(innerHeight*.35,240);
 const anchor=$$<HTMLElement>('main>section,main>article,main>.property-content,.site-footer').find(element=>{
  const rect=element.getBoundingClientRect();return rect.top<=line&&rect.bottom>line;
 })||null;
 return {anchor,top:anchor?.getBoundingClientRect().top||0,x:scrollX,y:scrollY,width:innerWidth,height:innerHeight};
}
let stableReadingPosition=readReadingPosition();
let mediaPosition:ReadingPosition|null=null;
let readingFrame=0;
window.addEventListener('scroll',()=>{
 if(readingFrame||mediaPosition)return;
 readingFrame=requestAnimationFrame(()=>{
  readingFrame=0;
  // A responsive reflow can clamp scroll before its media-query event.
  if(!mediaPosition&&stableReadingPosition.width===innerWidth&&stableReadingPosition.height===innerHeight)stableReadingPosition=readReadingPosition();
 });
},{passive:true});
window.addEventListener('resize',()=>{
 cancelAnimationFrame(readingFrame);
 readingFrame=requestAnimationFrame(()=>{readingFrame=0;if(!mediaPosition)stableReadingPosition=readReadingPosition();});
},{passive:true});
motionLifecycle.addEventListener('matchMediaInit',()=>{
 cancelAnimationFrame(readingFrame);readingFrame=0;
 mediaPosition=stableReadingPosition.width!==innerWidth||stableReadingPosition.height!==innerHeight?stableReadingPosition:readReadingPosition();
});
gsap.registerPlugin(ScrollTrigger);
motionLifecycle.addEventListener('matchMedia',()=>{
 const saved=mediaPosition;if(!saved)return;
 const resized=saved.width!==innerWidth||saved.height!==innerHeight;
 let top=saved.y;
 if(saved.y<1)top=0;
 else if(saved.anchor?.isConnected){
  const rect=saved.anchor.getBoundingClientRect();
  const readingTop=resized?Math.max(saved.top,Math.min(0,Math.min(innerHeight*.35,240)-rect.height)):saved.top;
  top=scrollY+rect.top-readingTop;
 }
 window.scrollTo({left:saved.x,top:Math.max(0,top),behavior:'instant'});
 ScrollTrigger.update();
 mediaPosition=null;stableReadingPosition=readReadingPosition();
});
const motion=gsap.matchMedia();
motion.add('(prefers-reduced-motion: no-preference)',()=>{
 const title=$('[data-hero-title]');
 // History restoration should not replay the opening scene below the fold.
 if(title&&scrollY<100){
  const intro=gsap.timeline({defaults:{duration:.65,ease:'power3.out',clearProps:'transform,opacity'}});
  intro.from(title.children,{y:20,opacity:0,stagger:.08},0);
  intro.from('.hero-lettering',{y:16,opacity:0},.15);
  intro.from('.hero-intro',{y:18,opacity:0},.25);
 }
});
motion.add('(min-width:1000px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion: no-preference)',()=>{
 const hero=$('[data-hero-parallax]');
 if(hero)gsap.to(hero,{y:48,ease:'none',scrollTrigger:{trigger:'.home-hero',start:'top top',end:'bottom top',scrub:.45}});
});

// Native details remain usable without JS; enhancement supports rapid reversal and reduced motion.
const disclosures=$$<HTMLDetailsElement>('.service,.team-bio,[data-motion-disclosure]').filter(item=>item.matches('.service')||!item.hasAttribute('name'));
const disclosureStates=new Map<HTMLDetailsElement,{open:boolean;animation:Animation|null;generation:number}>();
let refreshFrame=0;
function refreshMotion(){if(!refreshFrame)refreshFrame=requestAnimationFrame(()=>{
 refreshFrame=0;
 // An empty refresh can clear WebKit scroll and has no layout to update.
 if(ScrollTrigger.getAll().length)ScrollTrigger.refresh();
});}
function setDisclosure(disclosure:HTMLDetailsElement,open:boolean){
 const state=disclosureStates.get(disclosure)!;
 const currentHeight=disclosure.getBoundingClientRect().height;
 const generation=++state.generation;
 state.animation?.cancel();state.animation=null;state.open=open;disclosure.dataset.motionOpen=String(open);
 if(open)disclosure.open=true;
 disclosure.style.height='';
 // Measure the native collapsed box as well: team/feature disclosures may include padding.
 let endHeight=disclosure.getBoundingClientRect().height;
 if(!open){disclosure.open=false;endHeight=disclosure.getBoundingClientRect().height;disclosure.open=true;}
 const finish=()=>{if(state.generation!==generation)return;disclosure.open=state.open;disclosure.style.height='';disclosure.style.overflow='';state.animation=null;refreshMotion();};
 if(reduceMotion.matches||typeof disclosure.animate!=='function'||Math.abs(endHeight-currentHeight)<1){finish();return;}
 disclosure.style.overflow='hidden';
 state.animation=disclosure.animate([{height:currentHeight+'px'},{height:endHeight+'px'}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});
 state.animation.onfinish=finish;
}
disclosures.forEach(disclosure=>{
 if(disclosure.matches('.service'))disclosure.removeAttribute('name');
 disclosureStates.set(disclosure,{open:disclosure.open,animation:null,generation:0});
 disclosure.addEventListener('toggle',()=>{const state=disclosureStates.get(disclosure)!;if(!state.animation){state.open=disclosure.open;disclosure.dataset.motionOpen=String(disclosure.open);}});
 $<HTMLElement>('summary',disclosure)?.addEventListener('click',event=>{
  event.preventDefault();const open=!disclosureStates.get(disclosure)!.open;
  if(open&&disclosure.matches('.service'))disclosures.forEach(other=>{if(other!==disclosure&&other.matches('.service')&&disclosureStates.get(other)!.open)setDisclosure(other,false);});
  setDisclosure(disclosure,open);
 });
});
function settleDisclosures(){
 disclosures.forEach(disclosure=>{const state=disclosureStates.get(disclosure)!;state.generation++;state.animation?.cancel();state.animation=null;disclosure.open=state.open;disclosure.style.height='';disclosure.style.overflow='';});
}
window.addEventListener('pagehide',settleDisclosures);
reduceMotion.addEventListener('change',()=>{
 if(!reduceMotion.matches)return;
 settleDisclosures();
 if(galleryImage){gsap.killTweensOf(galleryImage);gsap.set(galleryImage,{clearProps:'opacity,transform'});}
 refreshMotion();
});
document.fonts.ready.then(refreshMotion);
window.addEventListener('load',refreshMotion,{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)refreshMotion();});

setupMotion();
