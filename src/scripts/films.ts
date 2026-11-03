type OpenDialog=(dialog:HTMLDialogElement,trigger?:HTMLElement)=>void;
export function filmSource(raw:string):{url:string;kind:'iframe'|'video'}|null{
 try{
  const url=new URL(raw);if(url.protocol!=='https:')return null;
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(url.hostname)){
   const id=url.pathname.match(/(?:\/video)?\/(\d+)/)?.[1];if(!id)return null;
   const target=new URL('https://player.vimeo.com/video/'+id);
   target.searchParams.set('autoplay','1');target.searchParams.set('dnt','1');
   const hash=url.searchParams.get('h')||(['vimeo.com','www.vimeo.com'].includes(url.hostname)?url.pathname.match(/^\/(\d+)\/([a-z0-9]+)\/?$/i)?.[2]:null);
   if(hash&&/^[a-z0-9]+$/i.test(hash))target.searchParams.set('h',hash);
   return{url:target.href,kind:'iframe'};
  }
  if(['youtube.com','www.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname)){
   const id=url.hostname==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1];
   if(!id||!/^[a-zA-Z0-9_-]{11}$/.test(id))return null;
   return{url:'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0',kind:'iframe'};
  }
  if(['dl.dropboxusercontent.com','cdn.prod.website-files.com'].includes(url.hostname)&&/\.mp4$/i.test(url.pathname))return{url:url.href,kind:'video'};
 }catch{/* A malformed source remains unavailable; no arbitrary embed is inserted. */}
 return null;
}
export function setupFilms(open:OpenDialog){
 const dialog=document.querySelector<HTMLDialogElement>('#film-dialog');
 const stage=dialog?.querySelector<HTMLElement>('[data-film-stage]');
 const status=dialog?.querySelector<HTMLElement>('[data-film-status]');
 const title=dialog?.querySelector<HTMLElement>('[data-film-heading]');
 const external=dialog?.querySelector<HTMLAnchorElement>('[data-film-external]');
 if(!dialog||!stage||!status||!title||!external)return;
 function cleanup(){stage!.querySelector('video')?.pause();stage!.replaceChildren();}
 document.querySelectorAll<HTMLButtonElement>('[data-film-url]').forEach(button=>button.addEventListener('click',()=>{
  const raw=button.dataset.filmUrl||'',source=filmSource(raw);cleanup();
  title.textContent=button.dataset.filmTitle||'Property film';
  status.textContent=source?'Loading film…':'This film is currently unavailable. Please ask your advisor for the latest version.';
  external.hidden=!source;if(source)external.href=raw;
  open(dialog,button);
  if(!source)return;
  if(source.kind==='iframe'){
   const frame=document.createElement('iframe');frame.title=title.textContent||'Property film';frame.src=source.url;
   frame.allow='autoplay; fullscreen; picture-in-picture';frame.allowFullscreen=true;
   frame.referrerPolicy='strict-origin-when-cross-origin';
   frame.addEventListener('load',()=>{status.textContent='If playback is unavailable, open the original film below.';});
   frame.addEventListener('error',()=>{status.textContent='The film could not load. Please open the original film or try again.';});
   stage.append(frame);
  }else{
   const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=source.url;
   video.addEventListener('loadeddata',()=>{status.textContent='';});
   video.addEventListener('error',()=>{status.textContent='The film could not load. Please open the original film or try again.';});
   stage.append(video);void video.play().catch(()=>{status.textContent='Press play to watch the film.';});
  }
 }));
 dialog.addEventListener('lr:dialog-closing',cleanup);
 dialog.addEventListener('close',cleanup);
}
