const video=document.querySelector<HTMLVideoElement>('[data-hero-film]');
const control=document.querySelector<HTMLButtonElement>('[data-hero-film-control]');
if(video&&control){
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection;
 let requested=!motion.matches&&!connection?.saveData;
 let inView=true,failed=false;
 const label=control.querySelector('[data-hero-film-label]');
 const sync=()=>{
  const playing=!video.paused&&!video.ended;
  control.setAttribute('aria-pressed',String(playing));
  control.setAttribute('aria-label',playing?'Pause background film':failed?'Retry background film':'Play background film');
  if(label)label.textContent=playing?'Pause film':failed?'Retry film':'Play film';
 };
 const play=async()=>{
  if(!requested||!inView||document.hidden)return;
  if(!video.src){video.src=video.dataset.src||'';video.load();}
  try{await video.play();failed=false;}catch{requested=false;}
  sync();
 };
 video.muted=true;
 video.addEventListener('playing',()=>{video.classList.add('is-playing');sync();});
 video.addEventListener('pause',sync);
 video.addEventListener('error',()=>{failed=true;requested=false;video.classList.remove('is-playing');sync();});
 control.addEventListener('click',()=>{
  if(!video.paused){requested=false;video.pause();}
  else{requested=true;if(failed){video.removeAttribute('src');video.load();failed=false;}void play();}
  sync();
 });
 motion.addEventListener('change',()=>{if(motion.matches){requested=false;video.pause();}sync();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else void play();});
 new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??false;if(inView)void play();else video.pause();},{threshold:.05}).observe(video);
 sync();void play();
}
