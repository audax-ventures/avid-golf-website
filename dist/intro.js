(()=>{
'use strict';
const key='avid-intro-seen-v1';
let seen=false;
try{seen=sessionStorage.getItem(key)==='yes'}catch{}
if(seen)return;
try{sessionStorage.setItem(key,'yes')}catch{}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const overlay=document.createElement('div');
overlay.className='avid-intro'+(reduced?' is-reduced':'');
overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Welcome to Avid Golf');
overlay.innerHTML='<button class="avid-intro__skip" type="button">Skip intro</button><div class="avid-intro__center"><div class="avid-intro__mark" aria-hidden="true"><img src="assets/logo.png" alt="" width="190" height="187"><img src="assets/logo.png" alt="" width="190" height="187"></div><p class="avid-intro__title">AVID GOLF</p><p class="avid-intro__tagline">Your game. All year.</p></div><span class="avid-intro__caption" aria-hidden="true">WINNIPEG · FOR THE LOVE OF THE GAME</span><div class="avid-intro__line" aria-hidden="true"></div>';
document.body.append(overlay);
let closing=false,finished=false;const hidden=[];let locked=false;
function release(){if(finished)return;finished=true;const focused=overlay.contains(document.activeElement);hidden.forEach(el=>el.inert=false);document.documentElement.classList.remove('intro-active');overlay.remove();if(focused){const main=document.querySelector('main');if(main){const previous=main.getAttribute('tabindex');main.setAttribute('tabindex','-1');main.focus({preventScroll:true});if(previous===null)main.removeAttribute('tabindex');else main.setAttribute('tabindex',previous)}}document.removeEventListener('keydown',onKey);setTimeout(()=>document.documentElement.classList.remove('intro-reveal'),1200)}
function close(){if(closing||finished)return;closing=true;overlay.classList.add('is-leaving');if(!reduced)document.documentElement.classList.add('intro-reveal');setTimeout(release,reduced?200:670)}
function onKey(e){if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'&&!closing){e.preventDefault();overlay.querySelector('button').focus()}}
function ready(){if(finished||closing)return;locked=true;document.documentElement.classList.add('intro-active');[...document.body.children].forEach(el=>{if(el!==overlay&&!el.inert&&!['SCRIPT','STYLE'].includes(el.tagName)){el.inert=true;hidden.push(el)}});overlay.querySelector('button').focus({preventScroll:true});document.addEventListener('keydown',onKey)}
overlay.querySelector('button').addEventListener('click',close);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
setTimeout(close,reduced?250:1700);
setTimeout(release,3300);
window.addEventListener('pagehide',release,{once:true});
})();
