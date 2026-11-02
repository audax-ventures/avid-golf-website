(() => {
 const root=document.querySelector('#falcon-scroll'); if(!root)return;
 const toggle=document.querySelector('#falcon-toggle');
 const sticky=root.querySelector('.falcon-sticky');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let frame=0,manual=false,current=0,target=0,lastTime=0;
 const limited=()=>reduce.matches||document.body.classList.contains('motion-paused');
 function measure(){
  const staticView=limited();root.classList.toggle('is-static',staticView);
  const top=innerWidth<=760?88:110;
  const distance=Math.max(1,root.offsetHeight-sticky.offsetHeight);
  target=manual||staticView?1:Math.max(0,Math.min(1,(top-root.getBoundingClientRect().top)/distance));
  toggle.setAttribute('aria-pressed',String(manual||staticView));
  toggle.textContent=manual?'Return to scroll animation':'Show full view';
  toggle.hidden=staticView;
  if(staticView){current=1;root.style.setProperty('--falcon-progress','1');}
 }
 function tick(time){
  const dt=Math.min(64,lastTime?time-lastTime:16);lastTime=time;
  current+=(target-current)*(1-Math.exp(-dt/110));
  if(Math.abs(target-current)<.0005)current=target;
  root.style.setProperty('--falcon-progress',current.toFixed(4));
  if(current!==target&&!limited())frame=requestAnimationFrame(tick);
  else{frame=0;lastTime=0;}
 }
 function schedule(){measure();if(!frame)frame=requestAnimationFrame(tick)}
 toggle.addEventListener('click',()=>{manual=!manual;schedule()});
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
 reduce.addEventListener('change',schedule);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 measure();current=target;root.style.setProperty('--falcon-progress',current.toFixed(4));
})();
