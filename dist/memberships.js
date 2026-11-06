(()=>{
 const choices=[...document.querySelectorAll('.plan-selector [data-plan]')];
 const mobile=matchMedia('(max-width:760px)');
 function choose(name){
  choices.forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.plan===name)));
  document.querySelectorAll('[data-plan-panel]').forEach(p=>p.hidden=p.dataset.planPanel!==name);
 }
 // On phones each plan opens right under its button; keep that button in view.
 function reveal(button){
  if(!mobile.matches)return;
  const top=button.getBoundingClientRect().top;
  if(top<80||top>innerHeight*.6)button.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 choices.forEach(b=>b.addEventListener('click',()=>{choose(b.dataset.plan);reveal(b)}));
 document.querySelectorAll('[data-select-plan]').forEach(b=>b.addEventListener('click',()=>{
  choose(b.dataset.selectPlan);
  const target=choices.find(c=>c.dataset.plan===b.dataset.selectPlan);
  target.focus({preventScroll:true});
  (mobile.matches?target:document.querySelector('#plans')).scrollIntoView({block:'start'});
 }));
})();
