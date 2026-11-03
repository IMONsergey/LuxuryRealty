import {
 copyFilters,defaultFilters,filterChips,filterOptions,matchingProperties,normalizeSearch,numberFrom,
 parseFilterParams,priceError,serializeFilters,validPurpose,validSort,type Filters,type FilterProperty,
} from '../data/property-filters';
import {setupDraftForm,updateFilterPreview,writeFilterForm,type OpenDialog,type CloseDialog} from './filter-dialog';
const $=<T extends Element=HTMLElement>(selector:string,root:ParentNode=document)=>root.querySelector<T>(selector);
const $$=<T extends Element=HTMLElement>(selector:string,root:ParentNode=document)=>Array.from(root.querySelectorAll<T>(selector));
const catalogueStateKey='luxury-realty:catalogue';
type SavedCatalogue={url:string;scrollY:number;propertyId?:string;viewingId?:string};
type Card=FilterProperty&{element:HTMLElement};
function savedCatalogue():SavedCatalogue|null {
 try{
  const saved=JSON.parse(sessionStorage.getItem(catalogueStateKey)||'null') as SavedCatalogue|null;
  return saved&&typeof saved.url==='string'&&/^\/properties\/(?:\?[^#]*)?$/.test(saved.url)&&typeof saved.scrollY==='number'&&Number.isFinite(saved.scrollY)&&saved.scrollY>=0?saved:null;
 }catch{return null;}
}
function setupReturnLink():void {
 const back=$<HTMLAnchorElement>('[data-property-return]');
 if(!back||back.dataset.returnInitialized)return;
 back.dataset.returnInitialized='true';
 const saved=savedCatalogue(),currentDetail=back.dataset.propertyReturn;
 if(!saved||(saved.viewingId||saved.propertyId)!==currentDetail)return;
 back.href=saved.url;
 back.addEventListener('click',()=>{try{sessionStorage.setItem(catalogueStateKey+':return','1');}catch{/* The link remains usable without storage. */}});
 $$<HTMLAnchorElement>('.related-properties [data-property-card] .property-card-link').forEach(link=>link.addEventListener('click',()=>{
  const latest=savedCatalogue(),viewingId=link.closest<HTMLElement>('[data-property-card]')?.dataset.id;
  if(!latest||!viewingId||(latest.viewingId||latest.propertyId)!==currentDetail)return;
  try{sessionStorage.setItem(catalogueStateKey,JSON.stringify({...latest,viewingId}));}catch{/* Keep native navigation. */}
 }));
}
export function setupCatalogue(openDialog:OpenDialog,closeDialog:CloseDialog):void {
 setupReturnLink();
 const root=$<HTMLElement>('[data-catalogue]');
 const dialogNode=$<HTMLDialogElement>('#catalogue-filter-dialog');
 const formNode=dialogNode?.querySelector<HTMLFormElement>('[data-filters]');
 if(!root||!dialogNode||!formNode||root.dataset.initialized)return;
 const catalogue=root,dialog=dialogNode,form=formNode;
 catalogue.dataset.initialized='true';
 const grid=$<HTMLElement>('[data-property-grid]',catalogue)!;
 const quickForm=$<HTMLFormElement>('[data-quick-filters]',catalogue)!;
 const filterTrigger=$<HTMLButtonElement>('[data-filter-open]',catalogue)!;
 const filterBadge=$<HTMLElement>('[data-filter-badge]',filterTrigger)!;
 const clearButton=$<HTMLButtonElement>('[data-clear-filters]',catalogue)!;
 const sort=$<HTMLSelectElement>('[data-sort]',catalogue)!;
 const summary=$<HTMLElement>('[data-page-summary]',catalogue)!;
 const pagination=$<HTMLElement>('[data-pagination]',catalogue)!;
 const resultCount=$<HTMLElement>('[data-result-count]',catalogue)!;
 const empty=$<HTMLElement>('[data-no-results]',catalogue)!;
 const activeFilters=$<HTMLElement>('[data-active-filters]',catalogue)!;
 const queryNotice=$<HTMLElement>('[data-query-notice]',catalogue)!;
 const pageSize=Math.max(1,Math.min(48,Number(catalogue.dataset.pageSize)||24));
 const cards:Card[]=$$<HTMLElement>('[data-property-card]',grid).map((element,index)=>{
  let features:string[]=[];
  try{const parsed:unknown=JSON.parse(element.dataset.features||'[]');if(Array.isArray(parsed))features=parsed.filter((item):item is string=>typeof item==='string');}catch{/* Invalid feature data cannot create a match. */}
  return {element,index,id:element.dataset.id||'',purpose:element.dataset.purpose||'unknown',development:element.dataset.development==='true',
   location:element.dataset.location||'',type:element.dataset.type||'',bedrooms:numberFrom(element.dataset.bedrooms),
   price:numberFrom(element.dataset.price),features,status:element.dataset.status||'current',search:normalizeSearch(element.dataset.search||''),title:element.dataset.title||''};
 });
 const options=filterOptions(cards);
 let applied=defaultFilters();
 let rendered=false,focusAfterClose=false;
 let resultAnimation:Animation|undefined;
 const save=(propertyId?:string)=>{
  try{sessionStorage.setItem(catalogueStateKey,JSON.stringify({url:location.pathname+location.search,scrollY:Math.max(0,window.scrollY),propertyId,viewingId:propertyId}));}catch{/* URL state is sufficient when storage is unavailable. */}
 };
 cards.forEach(card=>$<HTMLAnchorElement>('.property-card-link',card.element)?.addEventListener('click',()=>save(card.id)));
 const quickInput=(name:string)=>$<HTMLInputElement|HTMLSelectElement>('[name="'+name+'"]',quickForm)!;
 function withQuickValues(filters:Filters):Filters {
  const next=copyFilters(filters);
  next.q=quickInput('q').value.trim().slice(0,100);next.location=quickInput('location').value;next.page=1;
  return next;
 }
 function commitQuickValues(changes:Partial<Pick<Filters,'purpose'|'sort'>>={}):void {
  const next={...withQuickValues(applied),...changes};
  // Restoring a native select during popstate can emit a delayed change on blur.
  // An unchanged toolbar must preserve the current page and browser history.
  if(next.q===applied.q&&next.location===applied.location&&next.purpose===applied.purpose&&next.sort===applied.sort)return;
  commit(next);
 }
 function syncNavigation():void {
  $$<HTMLAnchorElement>('#site-menu nav a').forEach(link=>{
   const target=new URL(link.href);
   if(target.pathname!=='/properties/'||target.hash)return;
   if((applied.purpose==='buy'||applied.purpose==='rent')&&(target.searchParams.get('purpose')==='rent'?'rent':'buy')===applied.purpose)link.setAttribute('aria-current','page');
   else link.removeAttribute('aria-current');
  });
 }
 function focusResults():void {
  const start=$<HTMLElement>('[data-results-start]',catalogue);
  start?.focus({preventScroll:true});
  start?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function commit(filters:Filters,historyMode:'push'|'replace'|'none'='push'):void {
  applied=copyFilters(filters);queryNotice.hidden=true;render(historyMode);
 }
 function renderPages(totalPages:number):void {
  pagination.replaceChildren();pagination.hidden=totalPages<=1;
  if(totalPages<=1)return;
  const makeButton=(label:string,target:number,disabled=false,current=false)=>{
   const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;
   button.setAttribute('aria-label',label==='Previous'?'Previous page':label==='Next'?'Next page':'Page '+target);
   if(current)button.setAttribute('aria-current','page');
   button.addEventListener('click',()=>{commit({...applied,page:target});focusResults();});pagination.append(button);
  };
  makeButton('Previous',Math.max(1,applied.page-1),applied.page===1);
  const pages=[...new Set([1,totalPages,applied.page-1,applied.page,applied.page+1].filter(value=>value>=1&&value<=totalPages))].sort((a,b)=>a-b);
  pages.forEach((value,index)=>{
   if(index&&value-pages[index-1]>1){const gap=document.createElement('span');gap.textContent='…';gap.setAttribute('aria-hidden','true');pagination.append(gap);}
   makeButton(String(value),value,false,value===applied.page);
  });
  makeButton('Next',Math.min(totalPages,applied.page+1),applied.page===totalPages);
 }
 function removeFilter(name:keyof Filters,value:string):void {
  const next=copyFilters(applied);
  if(name==='type'||name==='bedrooms'||name==='features')next[name]=next[name].filter(item=>item!==value);
  else if(name==='status')next.status='current';
  else if(name==='q'||name==='location'||name==='minPrice'||name==='maxPrice')next[name]='';
  next.page=1;commit(next);
 }
 function renderChips():void {
  const chips=filterChips(applied);activeFilters.replaceChildren();activeFilters.hidden=!chips.length;
  clearButton.hidden=!chips.length;filterBadge.hidden=!chips.length;filterBadge.textContent=String(chips.length);
  filterTrigger.setAttribute('aria-label',chips.length?'Refine property search, '+chips.length+' active filters':'Refine property search');
  for(const [name,value,label] of chips){
   const button=document.createElement('button');button.type='button';button.className='filter-chip';button.setAttribute('aria-label','Remove filter: '+label);
   const text=document.createElement('span');text.textContent=label;button.append(text);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','15');svg.setAttribute('height','15');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','m6 6 12 12M18 6 6 18');svg.append(path);button.append(svg);
   button.addEventListener('click',()=>{
    const index=Array.from(activeFilters.children).indexOf(button);removeFilter(name,value);
    if(!activeFilters.hidden){const remaining=$$<HTMLButtonElement>('button',activeFilters);remaining[Math.min(index,remaining.length-1)]?.focus({preventScroll:true});}
    else $<HTMLElement>('[data-results-start]',catalogue)?.focus({preventScroll:true});
   });
   activeFilters.append(button);
  }
 }
 function render(historyMode:'push'|'replace'|'none'='push'):void {
  const error=priceError(applied),matches=matchingProperties(cards,applied),total=matches.length;
  const totalPages=Math.max(1,Math.ceil(total/pageSize));applied.page=Math.min(Math.max(1,applied.page),totalPages);
  cards.forEach(card=>card.element.hidden=true);
  matches.slice((applied.page-1)*pageSize,applied.page*pageSize).forEach(card=>{card.element.hidden=false;grid.append(card.element);});
  grid.append(empty);empty.hidden=total>0;
  const emptyTitle=$<HTMLElement>('[data-empty-title]',empty),emptyCopy=$<HTMLElement>('[data-empty-copy]',empty);
  if(emptyTitle)emptyTitle.textContent=error?'Check your price range':'No matching properties';
  if(emptyCopy)emptyCopy.textContent=error||'Try a different location or a wider price range. Our team can also help you find a home that meets your requirements.';
  resultCount.textContent=error?'Check your price range':total+' '+(total===1?'property':'properties');
  summary.textContent=total?'Showing '+((applied.page-1)*pageSize+1)+'-'+Math.min(applied.page*pageSize,total)+' of '+total+' '+(total===1?'property':'properties'):'';
  $$<HTMLButtonElement>('[data-purpose]',catalogue).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.purpose===applied.purpose)));
  quickInput('purpose').value=applied.purpose;quickInput('q').value=applied.q;quickInput('location').value=applied.location;sort.value=applied.sort;
  renderPages(totalPages);renderChips();syncNavigation();
  if(!dialog.open){writeFilterForm(form,applied);updateFilterPreview(form,cards,applied);}
  if(historyMode!=='none'){
   const url=serializeFilters(applied);
   if(url!==location.pathname+location.search){
    if(historyMode==='replace')history.replaceState(history.state,'',url+location.hash);
    else history.pushState({},'',url+location.hash);
   }
   save();
  }
  if(rendered&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&typeof grid.animate==='function'){
   resultAnimation?.cancel();
   resultAnimation=grid.animate([{opacity:.58},{opacity:1}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  rendered=true;
 }
 function openFilters(trigger:HTMLElement=filterTrigger):void {
  writeFilterForm(form,withQuickValues(applied));updateFilterPreview(form,cards,applied);openDialog(dialog,trigger);
 }
 function resetApplied():void {commit(defaultFilters(applied.purpose));}
 function loadUrl():void {
  const loaded=parseFilterParams(new URLSearchParams(location.search),options);applied=loaded.filters;
  queryNotice.hidden=!loaded.removed;queryNotice.textContent=loaded.removed?'Some filters in this link are no longer part of the collection and have been removed.':'';
  render('replace');
 }
 filterTrigger.addEventListener('click',()=>openFilters());
 quickForm.addEventListener('submit',event=>{event.preventDefault();commitQuickValues();focusResults();});
 quickInput('location').addEventListener('change',()=>commitQuickValues());
 sort.addEventListener('change',()=>commitQuickValues({sort:validSort(sort.value)}));
 $$<HTMLButtonElement>('[data-purpose]',catalogue).forEach(button=>button.addEventListener('click',()=>commitQuickValues({purpose:validPurpose(button.dataset.purpose||'buy')})));
 clearButton.addEventListener('click',()=>{resetApplied();filterTrigger.focus({preventScroll:true});});
 $<HTMLButtonElement>('[data-empty-reset]',catalogue)?.addEventListener('click',()=>{resetApplied();focusResults();});
 setupDraftForm(form,cards,()=>applied);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const draft=updateFilterPreview(form,cards,applied);
  if(priceError(draft)){form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}
  focusAfterClose=true;commit(draft);closeDialog(dialog);
 });
 dialog.addEventListener('close',()=>{
  writeFilterForm(form,applied);updateFilterPreview(form,cards,applied);
  if(location.hash==='#filters')history.replaceState(history.state,'',location.pathname+location.search);
  if(focusAfterClose){focusAfterClose=false;focusResults();}
 });
 window.addEventListener('popstate',()=>{
  focusAfterClose=false;if(dialog.open)closeDialog(dialog,{immediate:true,restoreFocus:false});
  loadUrl();if(location.hash==='#filters')requestAnimationFrame(()=>openFilters());
 });
 const previous=savedCatalogue();loadUrl();queueMicrotask(syncNavigation);
 try{
  const returning=sessionStorage.getItem(catalogueStateKey+':return')==='1';sessionStorage.removeItem(catalogueStateKey+':return');
  if(returning&&previous&&previous.url===location.pathname+location.search){
   const restore=()=>requestAnimationFrame(()=>{
    window.scrollTo({top:previous.scrollY,behavior:'instant'});
    const card=cards.find(item=>item.id===previous.propertyId&&!item.element.hidden);
    if(card)$<HTMLAnchorElement>('.property-card-link',card.element)?.focus({preventScroll:true});
   });
   if(document.readyState==='complete')void document.fonts.ready.then(restore);
   else window.addEventListener('load',()=>void document.fonts.ready.then(restore),{once:true});
  }else if(location.hash==='#filters')requestAnimationFrame(()=>openFilters());
 }catch{if(location.hash==='#filters')requestAnimationFrame(()=>openFilters());}
}
