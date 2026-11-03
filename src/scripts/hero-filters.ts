import {defaultFilters,serializeFilters,validPurpose,type FilterProperty} from '../data/property-filters';
import {setupDraftForm,updateFilterPreview,writeFilterForm,type OpenDialog,type CloseDialog} from './filter-dialog';
export function setupHeroFilters(openDialog:OpenDialog,closeDialog:CloseDialog):void {
 const hero=document.querySelector<HTMLFormElement>('.hero-search');
 const dialog=document.querySelector<HTMLDialogElement>('#hero-filter-dialog');
 const form=dialog?.querySelector<HTMLFormElement>('[data-hero-filters]');
 const source=dialog?.querySelector<HTMLScriptElement>('[data-filter-index="hero"]');
 if(!hero||!dialog||!form||!source||hero.dataset.filtersInitialized)return;
 let properties:FilterProperty[];
 try{const parsed:unknown=JSON.parse(source.textContent||'[]');if(!Array.isArray(parsed)||!parsed.length)return;properties=parsed as FilterProperty[];}catch{return;}
 hero.dataset.filtersInitialized='true';
 const triggers=Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-hero-filter-open]'));
 const base=()=>{
  const data=new FormData(hero),filters=defaultFilters(validPurpose(String(data.get('purpose')||'buy')));
  filters.q=String(data.get('q')||'').trim().slice(0,100);return filters;
 };
 const syncLinks=()=>{const url=serializeFilters(base());triggers.forEach(trigger=>trigger.href=url+'#filters');};
 setupDraftForm(form,properties,base);
 triggers.forEach(trigger=>trigger.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();writeFilterForm(form,base());updateFilterPreview(form,properties);
  openDialog(dialog,trigger);
 }));
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const filters=updateFilterPreview(form,properties);
  if(form.querySelector('[aria-invalid="true"]')){form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}
  closeDialog(dialog,{immediate:true,restoreFocus:false});
  location.assign(serializeFilters(filters));
 });
 dialog.addEventListener('close',()=>{writeFilterForm(form,base());updateFilterPreview(form,properties);});
 hero.addEventListener('input',syncLinks);hero.addEventListener('change',syncLinks);
 window.addEventListener('pageshow',syncLinks);syncLinks();
}
