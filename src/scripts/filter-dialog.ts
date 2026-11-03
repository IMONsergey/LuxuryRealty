import {defaultFilters,matchingProperties,priceError,validPurpose,type Filters,type FilterProperty} from '../data/property-filters';
export type OpenDialog=(dialog:HTMLDialogElement,trigger?:HTMLElement)=>void;
export type CloseDialog=(dialog:HTMLDialogElement,options?:{immediate?:boolean;restoreFocus?:boolean})=>void;
export function readFilterForm(form:HTMLFormElement,previous:Filters=defaultFilters()):Filters {
 const data=new FormData(form);
 return {...previous,purpose:validPurpose(String(data.get('purpose')||'buy')),q:String(data.get('q')||'').trim().slice(0,100),
  location:String(data.get('location')||''),type:data.getAll('type').map(String),bedrooms:data.getAll('bedrooms').map(String),
  features:data.getAll('features').map(String),minPrice:String(data.get('minPrice')||'').trim(),maxPrice:String(data.get('maxPrice')||'').trim(),
  status:String(data.get('status')||'current'),page:1};
}
export function writeFilterForm(form:HTMLFormElement,filters:Filters):void {
 form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[name],select[name]').forEach(input=>{
  const name=input.name as keyof Filters;
  const value=filters[name];if(value===undefined)return;
  if(input instanceof HTMLInputElement&&(input.type==='checkbox'||input.type==='radio')){
   input.checked=Array.isArray(value)?value.includes(input.value):String(value)===input.value;
  }else input.value=String(value);
 });
}
export function updateFilterPreview(form:HTMLFormElement,properties:FilterProperty[],previous?:Filters):Filters {
 const draft=readFilterForm(form,previous),error=priceError(draft);
 const errorNode=form.querySelector<HTMLElement>('[data-price-error]');
 if(errorNode)errorNode.textContent=error;
 for(const name of ['minPrice','maxPrice']){
  const input=form.querySelector<HTMLInputElement>('[name="'+name+'"]');
  if(error)input?.setAttribute('aria-invalid','true');else input?.removeAttribute('aria-invalid');
 }
 const count=form.querySelector<HTMLElement>('[data-filter-count]');
 if(count){
  const total=matchingProperties(properties,draft).length;
  const text=error?'Review your price range':total+' '+(total===1?'property matches':'properties match');
  if(count.textContent!==text)count.textContent=text;
  count.dataset.count=String(total);
 }
 const apply=form.querySelector<HTMLButtonElement>('[data-filter-apply]');if(apply)apply.disabled=Boolean(error);
 const rental=form.querySelector<HTMLElement>('[data-rental-price-note]');if(rental)rental.hidden=draft.purpose!=='rent'&&draft.purpose!=='all';
 return draft;
}
export function setupDraftForm(form:HTMLFormElement,properties:FilterProperty[],previous:()=>Filters):void {
 form.closest<HTMLDialogElement>('dialog')?.addEventListener('lr:dialog-open',()=>{
  form.querySelector<HTMLElement>('.filter-dialog-body')?.scrollTo({top:0,behavior:'instant'});
 });
 const refresh=()=>updateFilterPreview(form,properties,previous());
 form.addEventListener('input',refresh);form.addEventListener('change',refresh);
 form.addEventListener('reset',event=>{
  event.preventDefault();
  const purpose=readFilterForm(form,previous()).purpose;
  writeFilterForm(form,defaultFilters(purpose));refresh();
 });
}
