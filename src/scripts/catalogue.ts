const $=<T extends Element=HTMLElement>(selector:string,root:ParentNode=document)=>root.querySelector<T>(selector);
const $$=<T extends Element=HTMLElement>(selector:string,root:ParentNode=document)=>Array.from(root.querySelectorAll<T>(selector));
const catalogueStateKey='luxury-realty:catalogue';
type SavedCatalogue={url:string;scrollY:number;propertyId?:string;viewingId?:string};
type Purpose='buy'|'rent'|'developments'|'all';
type Sort='featured'|'price-asc'|'price-desc'|'name';
type Filters={purpose:Purpose;q:string;location:string;type:string[];bedrooms:string[];features:string[];minPrice:string;maxPrice:string;status:string;sort:Sort;page:number};
const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const numberFrom=(value:string|undefined)=>value?.trim()&&Number.isFinite(Number(value))?Number(value):null;
function savedCatalogue():SavedCatalogue|null {
 try {
  const saved=JSON.parse(sessionStorage.getItem(catalogueStateKey)||'null') as SavedCatalogue|null;
  return saved&&typeof saved.url==='string'&&/^\/properties\/(?:\?[^#]*)?$/.test(saved.url)&&typeof saved.scrollY==='number'&&Number.isFinite(saved.scrollY)&&saved.scrollY>=0?saved:null;
 } catch {return null;}
}
const back=$<HTMLAnchorElement>('[data-property-return]');
if(back){
 const saved=savedCatalogue();
 const currentDetail=back.dataset.propertyReturn;
 if(saved&&(saved.viewingId||saved.propertyId)===currentDetail){
  back.href=saved.url;
  back.addEventListener('click',()=>{try{sessionStorage.setItem(catalogueStateKey+':return','1');}catch{/* The link still works when storage is unavailable. */}});
  // Follow related homes while retaining the original catalogue card as the
  // return focus/scroll anchor. An unrelated detail visit cannot inherit it.
  $$<HTMLAnchorElement>('.related-properties [data-property-card] .property-card-link').forEach(link=>link.addEventListener('click',()=>{
   const latest=savedCatalogue(),viewingId=link.closest<HTMLElement>('[data-property-card]')?.dataset.id;
   if(!latest||!viewingId||(latest.viewingId||latest.propertyId)!==currentDetail)return;
   try{sessionStorage.setItem(catalogueStateKey,JSON.stringify({...latest,viewingId}));}catch{/* Navigation still works without storage. */}
  }));
 }
}
const catalogue=$<HTMLElement>('[data-catalogue]');
if(catalogue&&!catalogue.dataset.initialized){
 catalogue.dataset.initialized='true';
 const form=$<HTMLFormElement>('[data-filters]',catalogue)!;
 const grid=$<HTMLElement>('[data-property-grid]',catalogue)!;
 const sort=$<HTMLSelectElement>('[data-sort]',catalogue)!;
 const summary=$<HTMLElement>('[data-page-summary]',catalogue)!;
 const pagination=$<HTMLElement>('[data-pagination]',catalogue)!;
 const resultCount=$<HTMLElement>('[data-result-count]',catalogue)!;
 const empty=$<HTMLElement>('[data-no-results]',catalogue)!;
 const activeFilters=$<HTMLElement>('[data-active-filters]',catalogue)!;
 const queryNotice=$<HTMLElement>('[data-query-notice]',catalogue)!;
 const pageSize=Math.max(1,Math.min(48,Number(catalogue.dataset.pageSize)||24));
 const inputs=(name:string)=>$$<HTMLInputElement|HTMLSelectElement>('[name="'+name+'"]',form);
 const input=(name:string)=>inputs(name)[0];
 const cards=$$<HTMLElement>('[data-property-card]',grid).map((element,index)=>{
  let features:string[]=[];
  try {const value:unknown=JSON.parse(element.dataset.features||'[]');if(Array.isArray(value))features=value.filter((item):item is string=>typeof item==='string').map(normalize);}catch{/* A malformed feature value cannot create a positive match. */}
  return {element,index,id:element.dataset.id||'',purpose:element.dataset.purpose||'unknown',development:element.dataset.development==='true',location:element.dataset.location||'',type:element.dataset.type||'',bedrooms:numberFrom(element.dataset.bedrooms),price:numberFrom(element.dataset.price),features,status:element.dataset.status||'current',search:normalize(element.dataset.search||''),title:element.dataset.title||''};
 });
 let page=1;
 let readingUrl=false;
 let searchTimer:ReturnType<typeof setTimeout>|undefined;
 const save=(propertyId?:string)=>{
  try{sessionStorage.setItem(catalogueStateKey,JSON.stringify({url:location.pathname+location.search,scrollY:Math.max(0,window.scrollY),propertyId,viewingId:propertyId}));}catch{/* URL filters remain usable if storage is denied. */}
 };
 cards.forEach(card=>$<HTMLAnchorElement>('.property-card-link',card.element)?.addEventListener('click',()=>save(card.id)));
 const allowed=(name:string)=>new Set(inputs(name).flatMap(element=>element instanceof HTMLSelectElement?Array.from(element.options).map(option=>option.value):[element.value]));
 const validSort=(value:string):Sort=>['price-asc','price-desc','name'].includes(value)?value as Sort:'featured';
 function readForm():Filters {
  const fd=new FormData(form),purpose=String(fd.get('purpose')||'buy');
  return {purpose:purpose==='rent'||purpose==='developments'||purpose==='all'?purpose:'buy',q:String(fd.get('q')||'').trim().slice(0,100),location:String(fd.get('location')||''),type:fd.getAll('type').map(String),bedrooms:fd.getAll('bedrooms').map(String),features:fd.getAll('features').map(String),minPrice:String(fd.get('minPrice')||'').trim(),maxPrice:String(fd.get('maxPrice')||'').trim(),status:String(fd.get('status')||'current'),sort:validSort(sort.value),page};
 }
 function money(value:string):{value:number|null;valid:boolean} {
  if(!value)return {value:null,valid:true};
  const cleaned=value.replace(/[,\s]/g,'');
  const parsed=Number(cleaned);
  return {value:parsed,valid:/^\d+$/.test(cleaned)&&Number.isSafeInteger(parsed)&&parsed>=0};
 }
 function serialize(filters:Filters):string {
  const params=new URLSearchParams();
  if(filters.purpose!=='buy')params.set('purpose',filters.purpose);
  if(filters.q)params.set('q',filters.q);
  if(filters.location)params.set('location',filters.location);
  for(const name of ['type','bedrooms','features'] as const)for(const value of filters[name])params.append(name,value);
  for(const name of ['minPrice','maxPrice'] as const){const raw=filters[name];if(raw){const parsed=money(raw);params.set(name,parsed.valid?String(parsed.value):raw);}}
  if(filters.status!=='current')params.set('status',filters.status);
  if(filters.sort!=='featured')params.set('sort',filters.sort);
  if(filters.page>1)params.set('page',String(filters.page));
  return location.pathname+(params.size?'?'+params.toString():'');
 }
 function syncNavigation(){
  const purpose=readForm().purpose;
  $$<HTMLAnchorElement>('#site-menu nav a').forEach(link=>{
   const target=new URL(link.href);
   if(target.pathname!=='/properties/'||target.hash)return;
   if(purpose!=='all'&&purpose!=='developments'&&(target.searchParams.get('purpose')==='rent'?'rent':'buy')===purpose)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
 }
 function focusResults(){
  const start=$<HTMLElement>('[data-results-start]',catalogue!);
  start?.focus({preventScroll:true});
  start?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function renderPages(totalPages:number){
  pagination.replaceChildren();pagination.hidden=totalPages<=1;
  if(totalPages<=1)return;
  const makeButton=(label:string,target:number,disabled=false,current=false)=>{
   const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;
   button.setAttribute('aria-label',label==='Previous'?'Previous page':label==='Next'?'Next page':'Page '+target);
   if(current)button.setAttribute('aria-current','page');
   button.addEventListener('click',()=>{clearTimeout(searchTimer);page=target;render('push');focusResults();});pagination.append(button);
  };
  makeButton('Previous',Math.max(1,page-1),page===1);
  const pages=[...new Set([1,totalPages,page-1,page,page+1].filter(value=>value>=1&&value<=totalPages))].sort((a,b)=>a-b);
  pages.forEach((value,index)=>{
   if(index&&value-pages[index-1]>1){const gap=document.createElement('span');gap.textContent='…';gap.setAttribute('aria-hidden','true');pagination.append(gap);}
   makeButton(String(value),value,false,value===page);
  });
  makeButton('Next',Math.min(totalPages,page+1),page===totalPages);
 }
 function removeFilter(name:string,value:string){
  clearTimeout(searchTimer);
  for(const element of inputs(name)){
   if(element instanceof HTMLInputElement&&element.type==='checkbox'){if(element.value===value)element.checked=false;}
   else element.value=name==='status'?'current':'';
  }
  page=1;render('push');
 }
 function chips(filters:Filters){
  activeFilters.replaceChildren();
  const rows:[string,string,string][]=[];
  if(filters.q)rows.push(['q',filters.q,'Search: '+filters.q]);
  if(filters.location)rows.push(['location',filters.location,filters.location]);
  filters.type.forEach(value=>rows.push(['type',value,value]));
  filters.bedrooms.forEach(value=>rows.push(['bedrooms',value,value==='0'?'Studio':value+' bedrooms']));
  filters.features.forEach(value=>rows.push(['features',value,value]));
  if(filters.minPrice)rows.push(['minPrice',filters.minPrice,'From AED '+filters.minPrice]);
  if(filters.maxPrice)rows.push(['maxPrice',filters.maxPrice,'Up to AED '+filters.maxPrice]);
  if(filters.status!=='current')rows.push(['status',filters.status,filters.status==='all'?'All records':filters.status==='archived'?'Sold & rented':filters.status.charAt(0).toUpperCase()+filters.status.slice(1)]);
  activeFilters.hidden=rows.length===0;
  rows.forEach(([name,value,label])=>{
   const button=document.createElement('button');button.type='button';button.className='filter-chip';button.setAttribute('aria-label','Remove filter: '+label);
   const text=document.createElement('span');text.textContent=label;button.append(text);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','m6 6 12 12M18 6 6 18');svg.append(path);button.append(svg);
   button.addEventListener('click',()=>{removeFilter(name,value);if(!activeFilters.hidden)$<HTMLButtonElement>('button',activeFilters)?.focus({preventScroll:true});else $<HTMLElement>('[data-results-start]',catalogue!)?.focus({preventScroll:true});});activeFilters.append(button);
  });
 }
 function render(historyMode:'push'|'replace'|'none'='push'){
  const filters=readForm();sort.value=filters.sort;
  const minimum=money(filters.minPrice),maximum=money(filters.maxPrice);
  let error='';
  if(!minimum.valid||!maximum.valid)error='Enter whole, non-negative amounts in AED.';
  else if(minimum.value!==null&&maximum.value!==null&&minimum.value>maximum.value)error='The maximum price must be at least the minimum price.';
  const errorElement=$<HTMLElement>('[data-price-error]',form);if(errorElement)errorElement.textContent=error;
  for(const name of ['minPrice','maxPrice']){if(error)input(name)?.setAttribute('aria-invalid','true');else input(name)?.removeAttribute('aria-invalid');}
  const terms=normalize(filters.q).split(' ').filter(Boolean);
  const matches=error?[]:cards.filter(card=>{
   if(filters.purpose==='developments'&&!card.development)return false;
   if((filters.purpose==='buy'||filters.purpose==='rent')&&(card.development||card.purpose!==filters.purpose))return false;
   if(filters.status==='archived'&&card.status==='current')return false;
   if(filters.status!=='all'&&filters.status!=='archived'&&card.status!==filters.status)return false;
   if(terms.some(term=>!card.search.includes(term)))return false;
   if(filters.location&&card.location!==filters.location)return false;
   if(filters.type.length&&!filters.type.includes(card.type))return false;
   if(filters.bedrooms.length&&(card.bedrooms===null||!filters.bedrooms.some(value=>value==='8+'?card.bedrooms!>=8:card.bedrooms===Number(value))))return false;
   if(filters.features.some(feature=>!card.features.includes(normalize(feature))))return false;
   if(minimum.value!==null&&(card.price===null||card.price<=0||card.price<minimum.value))return false;
   if(maximum.value!==null&&(card.price===null||card.price<=0||card.price>maximum.value))return false;
   return true;
  });
  matches.sort((a,b)=>{
   if(filters.sort==='name')return a.title.localeCompare(b.title)||a.index-b.index;
   if(filters.sort==='price-asc'||filters.sort==='price-desc'){
    const aKnown=a.price!==null&&a.price>0,bKnown=b.price!==null&&b.price>0;
    if(aKnown!==bKnown)return aKnown?-1:1;
    if(aKnown&&bKnown)return (filters.sort==='price-asc'?a.price!-b.price!:b.price!-a.price!)||a.index-b.index;
   }
   return a.index-b.index;
  });
  const total=matches.length,totalPages=Math.max(1,Math.ceil(total/pageSize));
  page=Math.min(Math.max(1,page),totalPages);filters.page=page;
  cards.forEach(card=>card.element.hidden=true);
  matches.slice((page-1)*pageSize,page*pageSize).forEach(card=>{card.element.hidden=false;grid.append(card.element);});
  grid.append(empty);empty.hidden=total>0;
  const emptyTitle=$<HTMLElement>('[data-empty-title]',empty),emptyCopy=$<HTMLElement>('[data-empty-copy]',empty);
  if(emptyTitle)emptyTitle.textContent=error?'Check your price range':'No matching properties';
  if(emptyCopy)emptyCopy.textContent=error||'Try a different location or a wider price range. Our team can also help you find a home that meets your requirements.';
  resultCount.textContent=error?'Check your price range':total+' '+(total===1?'property':'properties');
  summary.textContent=total?'Showing '+((page-1)*pageSize+1)+'-'+Math.min(page*pageSize,total)+' of '+total+' '+(total===1?'property':'properties'):'';
  $$<HTMLButtonElement>('.purpose-tabs button[data-purpose]',catalogue!).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.purpose===filters.purpose)));
  const rentalNote=$<HTMLElement>('[data-rental-price-note]',form);if(rentalNote)rentalNote.hidden=filters.purpose!=='rent'&&filters.purpose!=='all';
  renderPages(totalPages);chips(filters);syncNavigation();
  if(historyMode!=='none'){
   const url=serialize(filters);
   if(url!==location.pathname+location.search){if(historyMode==='replace')history.replaceState(history.state,'',url+location.hash);else history.pushState({},'',url+location.hash);}
   save();
  }
  return !error;
 }
 function loadUrl(){
  readingUrl=true;form.reset();sort.value='featured';page=1;
  const params=new URLSearchParams(location.search);
  let removed=false;
  const purpose=params.get('purpose')||'buy';input('purpose').value=purpose==='rent'||purpose==='developments'||purpose==='all'?purpose:'buy';
  if(!['buy','rent','developments','all'].includes(purpose))removed=true;
  input('q').value=(params.get('q')||'').trim().slice(0,100);
  for(const name of ['location','status']){
   const value=params.get(name);if(value!==null){if(allowed(name).has(value))input(name).value=value;else removed=true;}
  }
  for(const name of ['type','bedrooms','features']){
   const values=params.getAll(name),accepted=allowed(name);
   if(values.some(value=>!accepted.has(value)))removed=true;
   for(const element of inputs(name))if(element instanceof HTMLInputElement)element.checked=values.includes(element.value);
  }
  for(const name of ['minPrice','maxPrice'])input(name).value=(params.get(name)||'').slice(0,30);
  const sortFromUrl=params.get('sort')||'featured';sort.value=validSort(sortFromUrl);if(!['featured','price-asc','price-desc','name'].includes(sortFromUrl))removed=true;
  const requestedPage=Number(params.get('page'));page=Number.isSafeInteger(requestedPage)&&requestedPage>0?requestedPage:1;
  const recognized=new Set(['purpose','q','location','type','bedrooms','features','minPrice','maxPrice','status','sort','page']);
  if([...params.keys()].some(name=>!recognized.has(name)))removed=true;
  queryNotice.hidden=!removed;queryNotice.textContent=removed?'Some filters in this link are no longer part of the collection and have been removed.':'';
  readingUrl=false;render('replace');
 }
 function resetFilters(){
  clearTimeout(searchTimer);const selectedPurpose=input('purpose').value;readingUrl=true;form.reset();readingUrl=false;input('purpose').value=selectedPurpose;
  sort.value='featured';page=1;queryNotice.hidden=true;render('push');
 }
 function applyFromInput(mode:'push'|'replace'){
  clearTimeout(searchTimer);page=1;queryNotice.hidden=true;render(mode);
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();clearTimeout(searchTimer);page=1;
  if(render('push')){
   if(matchMedia('(max-width:900px)').matches){const disclosure=$<HTMLDetailsElement>('.filter-disclosure',catalogue!);if(disclosure)disclosure.open=false;}
   focusResults();
  }else input('minPrice')?.focus();
 });
 form.addEventListener('reset',()=>{if(!readingUrl){clearTimeout(searchTimer);const selectedPurpose=input('purpose').value;setTimeout(()=>{input('purpose').value=selectedPurpose;sort.value='featured';page=1;queryNotice.hidden=true;render('push');},0);}});
 form.addEventListener('change',()=>applyFromInput('push'));
 for(const name of ['q','minPrice','maxPrice'])input(name)?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFromInput('replace'),280);});
 sort.addEventListener('change',()=>applyFromInput('push'));
 $$<HTMLButtonElement>('.purpose-tabs button[data-purpose]',catalogue).forEach(button=>button.addEventListener('click',()=>{input('purpose').value=button.dataset.purpose||'buy';applyFromInput('push');}));
 $<HTMLButtonElement>('[data-empty-reset]',catalogue)?.addEventListener('click',resetFilters);
 window.addEventListener('popstate',()=>{clearTimeout(searchTimer);loadUrl();});
 const previous=savedCatalogue();
 loadUrl();queueMicrotask(syncNavigation);
 try {
  const returning=sessionStorage.getItem(catalogueStateKey+':return')==='1';sessionStorage.removeItem(catalogueStateKey+':return');
  if(returning&&previous&&previous.url===location.pathname+location.search){
   const restore=()=>requestAnimationFrame(()=>{
    window.scrollTo({top:previous.scrollY,behavior:'instant'});
    const card=cards.find(item=>item.id===previous.propertyId&&!item.element.hidden);if(card)$<HTMLAnchorElement>('.property-card-link',card.element)?.focus({preventScroll:true});
   });
   if(document.readyState==='complete')void document.fonts.ready.then(restore);else window.addEventListener('load',()=>void document.fonts.ready.then(restore),{once:true});
  }
 }catch{/* The catalogue and return links do not depend on session storage. */}
 const disclosure=$<HTMLDetailsElement>('.filter-disclosure',catalogue);
 const mobile=matchMedia('(max-width:900px)');
 if(disclosure&&mobile.matches)disclosure.open=location.hash==='#filters';
 mobile.addEventListener('change',()=>{if(disclosure&&!mobile.matches)disclosure.open=true;});
}
export {};
