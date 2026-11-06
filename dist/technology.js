(()=>{
const metrics={path:['CLUB DELIVERY','The direction through impact.','Club path describes the direction the clubhead travels at impact relative to the target line.','Compare your path from swing to swing. Review it alongside face angle to build a clearer picture of your shot pattern.'],face:['CLUB DELIVERY','Where the face is pointing.','Face angle describes the orientation of the clubface at impact relative to the target line.','Look at face angle together with club path. A coach can help explain how that relationship affects the shots you see.'],strike:['CONTACT','Where ball meets club.','Impact location shows where contact occurs on the clubface.','Look for a repeatable strike pattern across several swings, and discuss changes with your coach or fitter.'],launch:['BALL FLIGHT','How the ball takes flight.','Launch angle and spin describe how the ball leaves the club and rotates after impact.','Compare these measurements when practising or testing equipment, rather than judging a change from a single shot.']};
const tabs=[...document.querySelectorAll('.metric-tabs [role=tab]')];
const panel=document.getElementById('metric-explanation');
const content=panel&&panel.querySelector('.metric-content');
if(!tabs.length||!panel||!content)return;
const ids=['metric-label','metric-title','metric-copy','metric-use'];
const fill=key=>ids.forEach((id,i)=>{document.getElementById(id).textContent=metrics[key][i]});
const name=t=>t.querySelector('.metric-name').textContent;
let current=0;
function select(i,focus){
  current=(i+tabs.length)%tabs.length;
  tabs.forEach((t,j)=>{const on=j===current;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1});
  const tab=tabs[current];
  panel.setAttribute('aria-labelledby',tab.id);
  fill(tab.dataset.metric);
  document.getElementById('metric-count').textContent=(current+1)+' of '+tabs.length;
  document.getElementById('metric-next-label').textContent=current===tabs.length-1?name(tabs[0]):name(tabs[(current+1)%tabs.length]);
  document.getElementById('metric-next').firstChild.textContent=current===tabs.length-1?'Back to: ':'Next: ';
  if(focus)tab.focus();
}
// Keep the panel the same height for every tab so the page doesn't jump.
function sizePanel(){
  content.style.minHeight='';let max=0;
  tabs.forEach(t=>{fill(t.dataset.metric);max=Math.max(max,content.offsetHeight)});
  content.style.minHeight=max+'px';fill(tabs[current].dataset.metric);
}
tabs.forEach((t,i)=>{
  t.addEventListener('click',()=>select(i));
  t.addEventListener('keydown',e=>{
    const k={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];
    if(k){e.preventDefault();select(current+k,true)}
    else if(e.key==='Home'){e.preventDefault();select(0,true)}
    else if(e.key==='End'){e.preventDefault();select(tabs.length-1,true)}
  });
});
document.getElementById('metric-next').addEventListener('click',()=>select(current+1));
sizePanel();
let rt;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(sizePanel,150)});
})();
