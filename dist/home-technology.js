(() => {
 const root=document.getElementById('avid-tech');if(!root)return;
 const button=root.querySelector('.at-cta'),more=root.querySelector('.at-more');
 button.addEventListener('click',()=>{more.hidden=!more.hidden;button.setAttribute('aria-expanded',String(!more.hidden))});
 const video=root.querySelector('video');if(!video)return;
 // Playback is visitor-controlled; no automatic motion or sound.
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const syncMotion=()=>{if(reduce.matches||document.body.classList.contains('motion-paused'))video.pause()};
 reduce.addEventListener('change',syncMotion);
 new MutationObserver(syncMotion).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause()});
})();
