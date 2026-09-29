(()=>{
 const button=document.querySelector('#hero-motion'),globalButton=document.querySelector('#motion');
 if(!button||!globalButton)return;
 const sync=()=>{const paused=document.body.classList.contains('motion-paused');button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Play visual':'Pause visual'};
 button.addEventListener('click',()=>globalButton.click());
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 sync();
})();
