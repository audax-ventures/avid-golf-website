(() => {
 const root=document.getElementById('avid-tech');if(!root)return;
 const button=root.querySelector('.at-cta'),more=root.querySelector('.at-more');
 button.addEventListener('click',()=>{more.hidden=!more.hidden;button.setAttribute('aria-expanded',String(!more.hidden))});
 const video=root.querySelector('video');if(!video)return;
 // Muted autoplay and looping, with native controls and motion preferences respected.
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const allowed=()=>!reduce.matches&&!document.body.classList.contains('motion-paused');
 const play=()=>{if(allowed()&&!document.hidden)video.play().catch(()=>{});};
 const syncMotion=()=>{if(!allowed())video.pause();else play()};
 let resumeOnVisible=false;
 reduce.addEventListener('change',syncMotion);
 new MutationObserver(syncMotion).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){resumeOnVisible=!video.paused;video.pause()}
  else if(resumeOnVisible){resumeOnVisible=false;play()}
 });
 syncMotion();
})();
