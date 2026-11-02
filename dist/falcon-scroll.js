(() => {
 const root=document.querySelector('#falcon-scroll'); if(!root)return;
 const toggle=document.querySelector('#falcon-toggle');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let frame=0,manual=false;
 const limited=()=>reduce.matches||document.body.classList.contains('motion-paused');
 function render(){
  frame=0;const staticView=limited();root.classList.toggle('is-static',staticView);
  const box=root.getBoundingClientRect();const top=innerWidth<=760?88:110;
  const distance=Math.max(1,root.offsetHeight-root.querySelector('.falcon-sticky').offsetHeight);
  const progress=manual||staticView?1:Math.max(0,Math.min(1,(top-box.top)/distance));
  root.style.setProperty('--falcon-progress',progress.toFixed(3));
  toggle.setAttribute('aria-pressed',String(manual||staticView));
  toggle.textContent=manual?'Return to scroll animation':'Show expanded view';
  toggle.hidden=staticView;
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(render)}
 toggle.addEventListener('click',()=>{manual=!manual;render()});
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
 reduce.addEventListener('change',schedule);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 render();
})();
