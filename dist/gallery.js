(()=>{
const tiles=[...document.querySelectorAll('.gallery-tile')];
const viewer=document.getElementById('gallery-viewer');
if(!tiles.length||!viewer||typeof viewer.showModal!=='function')return;
const img=viewer.querySelector('.viewer-stage img');
const caption=viewer.querySelector('figcaption');
const count=viewer.querySelector('.viewer-count');
let index=0,opener=null;
function show(i){
  index=(i+tiles.length)%tiles.length;
  const t=tiles[index];
  img.src=t.dataset.full;img.alt=t.querySelector('img').alt;
  caption.textContent=t.dataset.caption||'';
  count.textContent=(index+1)+' / '+tiles.length;
  [index+1,index-1].forEach(n=>{const p=tiles[(n+tiles.length)%tiles.length];if(p){const pre=new Image();pre.src=p.dataset.full}});
}
tiles.forEach((t,i)=>t.addEventListener('click',()=>{opener=t;show(i);viewer.showModal();document.documentElement.style.overflow='hidden'}));
viewer.addEventListener('close',()=>{document.documentElement.style.overflow='';if(opener)opener.focus()});
viewer.querySelector('.viewer-close').addEventListener('click',()=>viewer.close());
viewer.querySelector('.viewer-prev').addEventListener('click',()=>show(index-1));
viewer.querySelector('.viewer-next').addEventListener('click',()=>show(index+1));
viewer.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();show(index+1)}else if(e.key==='ArrowLeft'){e.preventDefault();show(index-1)}});
// Swipe left/right on touch screens.
let startX=null,startY=0;
const stage=viewer.querySelector('.viewer-stage');
stage.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY},{passive:true});
stage.addEventListener('touchend',e=>{if(startX===null)return;const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;startX=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))show(index+(dx<0?1:-1))});
// Click on the dark area around the photo closes the viewer.
stage.addEventListener('click',e=>{if(e.target===stage)viewer.close()});
})();
