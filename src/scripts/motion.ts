const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const running=new Set<Animation>();
let initialized=false;

function play(element:HTMLElement,keyframes:Keyframe[],options:KeyframeAnimationOptions){
 if(reduced.matches||typeof element.animate!=='function')return;
 const animation=element.animate(keyframes,options);
 running.add(animation);
 const clear=()=>{running.delete(animation);animation.cancel();};
 animation.onfinish=clear;
 animation.oncancel=()=>running.delete(animation);
}

export function setupMotion(){
 if(initialized)return;
 initialized=true;
 document.documentElement.classList.add('motion-ready');
 // Browsers without cross-document transitions still get a small, non-blocking entry.
 // Navigation itself remains entirely native: no click interception or replacement router.
 const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
 if(!('onpagereveal' in window)&&navigation?.type!=='back_forward'&&scrollY<80){
  const main=document.querySelector<HTMLElement>('main');
  if(main)play(main,[{opacity:.86},{opacity:1}],{duration:180,easing:'ease-out'});
 }

 const reveal=document.querySelectorAll<HTMLElement>(
  '[data-reveal],.property-card,.project-card,.insight-card,.team-card,.service-detail'
 );
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   let stagger=0;
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    const element=entry.target as HTMLElement;
    observer.unobserve(element);
    // Content has no hidden or translated base state, including when scripts fail.
    if(reduced.matches||element.closest('dialog')||element.getBoundingClientRect().bottom<0)continue;
    const top=element.getBoundingClientRect().top;
    if(navigation?.type==='back_forward'&&top<innerHeight)continue;
    play(element,[{opacity:.58,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{
     duration:420,
     delay:Math.min(stagger++,3)*28,
     easing:'cubic-bezier(.22,1,.36,1)',
    });
   }
  },{threshold:.06,rootMargin:'0px 0px -24px 0px'});
  reveal.forEach(element=>observer.observe(element));
 }
 const settle=()=>{for(const animation of running)animation.cancel();running.clear();};
 reduced.addEventListener('change',()=>{if(reduced.matches)settle();});
 window.addEventListener('pagehide',settle);
 window.addEventListener('pageshow',event=>{if(event.persisted)settle();});
}
