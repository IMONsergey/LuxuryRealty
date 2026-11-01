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
 document.body.classList.add('dialog-open');
}
$$<HTMLDialogElement>('dialog').forEach(dialog=>{
 dialog.addEventListener('close',()=>{
  document.body.classList.toggle('dialog-open',!!$('dialog[open]'));
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
let photos:GalleryPhoto[]=[];let photoIndex=0;
const gallery=$<HTMLDialogElement>('#gallery-dialog');
function showPhoto(index:number){
 if(!gallery||!photos.length)return;
 photoIndex=(index+photos.length)%photos.length;
 const photo=photos[photoIndex];const img=$<HTMLImageElement>('[data-gallery-image]',gallery);
 if(img){img.src=photo.src;img.alt=photo.alt;}
 const count=$('[data-gallery-counter]',gallery);if(count)count.textContent=String(photoIndex+1)+' / '+photos.length;
 const caption=$('[data-gallery-caption]',gallery);if(caption)caption.textContent=photo.alt;
 $$<HTMLButtonElement>('[data-gallery-prev],[data-gallery-next]',gallery).forEach(b=>b.hidden=photos.length<2);
 const next=photos[(photoIndex+1)%photos.length];if(next&&next.src!==photo.src){const preload=new Image();preload.src=next.src;}
}
$$<HTMLButtonElement>('[data-gallery]').forEach(button=>button.addEventListener('click',()=>{
 try{
  const parsed:unknown=JSON.parse(button.dataset.gallery||'[]');if(!Array.isArray(parsed)||!parsed.length)return;
  photos=parsed.filter((p):p is GalleryPhoto=>typeof p?.src==='string'&&typeof p?.alt==='string');
  if(!photos.length||!gallery)return;
  const title=$('[data-gallery-title]',gallery);if(title)title.textContent=button.dataset.galleryTitle||'Gallery';
  showPhoto(Number(button.dataset.galleryIndex)||0);openDialog(gallery,button);
 }catch{toast('The gallery could not be opened. Please try again.');}
}));
$('[data-gallery-prev]')?.addEventListener('click',()=>showPhoto(photoIndex-1));
$('[data-gallery-next]')?.addEventListener('click',()=>showPhoto(photoIndex+1));
gallery?.addEventListener('keydown',event=>{
 if(event.key==='ArrowRight'){event.preventDefault();showPhoto(photoIndex+1);}
 if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(photoIndex-1);}
 if(event.key==='Home'){event.preventDefault();showPhoto(0);}
 if(event.key==='End'){event.preventDefault();showPhoto(photos.length-1);}
});
let swipeStart=0;
$('[data-gallery-image]')?.addEventListener('touchstart',event=>{swipeStart=(event as TouchEvent).changedTouches[0].clientX;},{passive:true});
$('[data-gallery-image]')?.addEventListener('touchend',event=>{const delta=(event as TouchEvent).changedTouches[0].clientX-swipeStart;if(Math.abs(delta)>60)showPhoto(photoIndex+(delta<0?1:-1));},{passive:true});

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
$$<HTMLElement>('[data-rail-prev],[data-rail-next]').forEach(button=>button.addEventListener('click',()=>{
 const selector=button.dataset.railPrev||button.dataset.railNext;if(!selector)return;
 const rail=$(selector);if(!rail)return;const item=rail.firstElementChild as HTMLElement|null;
 rail.scrollBy({left:((item?.offsetWidth||320)+30)*(button.dataset.railPrev?-1:1),behavior:scrollBehavior()});
}));
$$<HTMLElement>('[data-rail]').forEach(rail=>rail.addEventListener('keydown',event=>{
 if(event.target!==rail)return;
 if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();rail.scrollBy({left:rail.clientWidth*.75*(event.key==='ArrowRight'?1:-1),behavior:scrollBehavior()});}
}));
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
 if(matchMedia('(max-width:900px)').matches&&location.hash!=='#filters'){const d=$<HTMLDetailsElement>('.filter-disclosure',catalogue);if(d)d.open=false;}
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
const header=$('.site-header');let headerPending=false;
function updateHeader(){header?.classList.toggle('is-scrolled',scrollY>80);headerPending=false;}
window.addEventListener('scroll',()=>{if(!headerPending){requestAnimationFrame(updateHeader);headerPending=true;}},{passive:true});updateHeader();
gsap.registerPlugin(ScrollTrigger);
const motion=gsap.matchMedia();
motion.add('(prefers-reduced-motion: no-preference)',()=>{
 const title=$('[data-hero-title]');if(title)gsap.from(title.children,{y:30,opacity:.25,stagger:.12,duration:1.2,ease:'power3.out',clearProps:'all'});
 $$<HTMLElement>('[data-reveal]').forEach(element=>gsap.from(element,{y:34,opacity:.3,duration:1,ease:'power2.out',clearProps:'all',scrollTrigger:{trigger:element,start:'top 92%',once:true}}));
 if(matchMedia('(min-width:1000px)').matches){const hero=$('[data-hero-parallax]');if(hero)gsap.to(hero,{y:100,ease:'none',scrollTrigger:{trigger:'.home-hero',start:'top top',end:'bottom top',scrub:.6}});}
});
document.fonts.ready.then(()=>ScrollTrigger.refresh());
window.addEventListener('load',()=>ScrollTrigger.refresh(),{once:true});
