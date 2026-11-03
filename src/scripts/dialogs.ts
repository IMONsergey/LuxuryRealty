type CloseOptions = {immediate?:boolean;restoreFocus?:boolean};
type DialogState = {
 trigger:HTMLElement|null;
 animation:Animation|null;
 generation:number;
 closing:boolean;
 restoreFocus:boolean;
 fallback:ReturnType<typeof setTimeout>|null;
};

const states=new WeakMap<HTMLDialogElement,DialogState>();
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let ready=false;
let scrollLocked=false;

function getState(dialog:HTMLDialogElement):DialogState {
 let state=states.get(dialog);
 if(!state){
  state={trigger:null,animation:null,generation:0,closing:false,restoreFocus:true,fallback:null};
  states.set(dialog,state);
 }
 return state;
}

function duration(name:string,fallback:number){
 const raw=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
 const value=Number.parseFloat(raw);
 return Number.isFinite(value)?Math.max(0,raw.endsWith('ms')?value:value*1000):fallback;
}

function stopAnimation(state:DialogState){
 state.generation++;
 if(state.fallback!==null)clearTimeout(state.fallback);
 state.fallback=null;
 state.animation?.cancel();
 state.animation=null;
}

function syncScrollLock(){
 const root=document.documentElement;
 // The native close event may be frozen in bfcache; expose the actual state now.
 const menu=document.querySelector<HTMLDialogElement>('#site-menu');
 document.querySelector('.menu-toggle')?.setAttribute('aria-expanded',String(Boolean(menu?.open)));
 const active=!!document.querySelector('dialog[open]');
 if(active&&!scrollLocked){
  const width=root.clientWidth;
  root.classList.add('dialog-open');
  document.body.classList.add('dialog-open');
  // Stable gutters need no compensation; older engines reserve only the lost width.
  root.style.setProperty('--dialog-scrollbar-compensation',Math.max(0,root.clientWidth-width)+'px');
  scrollLocked=true;
 }else if(!active&&scrollLocked){
  root.classList.remove('dialog-open');
  document.body.classList.remove('dialog-open');
  root.style.removeProperty('--dialog-scrollbar-compensation');
  scrollLocked=false;
 }
}

function finishClose(dialog:HTMLDialogElement,state:DialogState){
 stopAnimation(state);
 state.closing=false;
 delete dialog.dataset.dialogState;
 if(dialog.open)dialog.close();
 syncScrollLock();
}

function animatePanel(
 dialog:HTMLDialogElement,
 state:DialogState,
 frames:Keyframe[],
 ms:number,
 finish:()=>void
){
 const generation=state.generation;
 if(reduced.matches||ms===0||typeof dialog.animate!=='function'){finish();return;}
 state.animation=dialog.animate(frames,{
  duration:ms,
  easing:'cubic-bezier(.22,1,.36,1)',
  fill:'both',
 });
 const complete=()=>{
  if(state.generation!==generation)return;
  finish();
 };
 state.animation.onfinish=complete;
 // Closing must never strand the page inert if an animation is interrupted by the engine.
 state.fallback=setTimeout(complete,ms+100);
}

export function openDialog(dialog:HTMLDialogElement,trigger?:HTMLElement){
 setupDialogs();
 const state=getState(dialog);
 const wasOpen=dialog.open;
 const interrupted=state.closing&&wasOpen;
 const current=interrupted?getComputedStyle(dialog):null;
 const from=interrupted?{opacity:current!.opacity,transform:current!.transform}:null;
 const parent=trigger?.closest<HTMLDialogElement>('dialog[open]');
 const returnTarget=parent&&parent!==dialog?getState(parent).trigger:trigger;
 stopAnimation(state);
 state.closing=false;
 state.restoreFocus=true;
 if(returnTarget)state.trigger=returnTarget;
 else if(!wasOpen&&document.activeElement instanceof HTMLElement)state.trigger=document.activeElement;

 document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(other=>{
  if(other!==dialog)closeDialog(other,{immediate:true,restoreFocus:false});
 });
 if(!dialog.open){
  dialog.showModal();
  dialog.scrollTo({top:0,left:0,behavior:'instant'});
 }
 syncScrollLock();
 if(dialog.id==='site-menu')document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','true');
 dialog.dispatchEvent(new CustomEvent('lr:dialog-open',{detail:{trigger:returnTarget||null}}));
 if(!dialog.open||state.closing)return;
 if(wasOpen&&!interrupted){dialog.dataset.dialogState='open';return;}

 dialog.dataset.dialogState='opening';
 const full=dialog.classList.contains('menu-dialog')||dialog.classList.contains('gallery-dialog');
 animatePanel(dialog,state,[
  from||{opacity:0,transform:full?'translateY(6px)':'translateY(14px) scale(.985)'},
  {opacity:1,transform:'none'},
 ],duration('--motion-base',240),()=>{
  stopAnimation(state);
  if(dialog.open)dialog.dataset.dialogState='open';
 });
}

export function closeDialog(dialog:HTMLDialogElement,options:CloseOptions={}){
 const state=getState(dialog);
 if(!dialog.open){stopAnimation(state);state.closing=false;delete dialog.dataset.dialogState;syncScrollLock();return;}
 if(state.closing&&!options.immediate)return;
 const current=getComputedStyle(dialog);
 const from={opacity:current.opacity,transform:current.transform};
 stopAnimation(state);
 state.restoreFocus=options.restoreFocus!==false;
 state.closing=true;
 dialog.dataset.dialogState='closing';
 dialog.dispatchEvent(new CustomEvent('lr:dialog-closing'));
 if(!dialog.open||!state.closing)return;
 if(options.immediate||reduced.matches){finishClose(dialog,state);return;}
 const full=dialog.classList.contains('menu-dialog')||dialog.classList.contains('gallery-dialog');
 animatePanel(dialog,state,[
  from,
  {opacity:0,transform:full?'translateY(4px)':'translateY(8px) scale(.99)'},
 ],duration('--motion-fast',160),()=>finishClose(dialog,state));
}

export function setupDialogs(){
 if(ready)return;
 ready=true;
 document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog=>{
  const state=getState(dialog);
  dialog.addEventListener('cancel',event=>{
   event.preventDefault();
   closeDialog(dialog);
  });
  dialog.addEventListener('close',event=>{
   // close is queued by the platform. A reopened dialog must not lose its new media/state.
   if(dialog.open){event.stopImmediatePropagation();return;}
   stopAnimation(state);
   state.closing=false;
   delete dialog.dataset.dialogState;
   syncScrollLock();
   if(dialog.id==='site-menu')document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false');
   const trigger=state.trigger;
   if(state.restoreFocus&&trigger?.isConnected&&trigger.getClientRects().length&&!document.querySelector('dialog[open]')){
    trigger.focus({preventScroll:true});
   }
   state.restoreFocus=true;
  });
  dialog.addEventListener('click',event=>{
   if(event.target!==dialog)return;
   const box=dialog.getBoundingClientRect();
   const pointer=event as MouseEvent;
   if(pointer.clientX<box.left||pointer.clientX>box.right||pointer.clientY<box.top||pointer.clientY>box.bottom)closeDialog(dialog);
  });
 });
 document.querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach(button=>{
  button.addEventListener('click',()=>{
   const dialog=button.closest('dialog');
   if(dialog)closeDialog(dialog);
  });
 });
 reduced.addEventListener('change',()=>{
  if(!reduced.matches)return;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>{
   const state=getState(dialog);
   if(state.closing)finishClose(dialog,state);
   else{stopAnimation(state);dialog.dataset.dialogState='open';}
  });
 });
 window.addEventListener('pagehide',()=>{
  // A cached document returns to its page, not to a stale modal or locked body.
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>closeDialog(dialog,{immediate:true,restoreFocus:false}));
 });
 window.addEventListener('pageshow',syncScrollLock);
}
