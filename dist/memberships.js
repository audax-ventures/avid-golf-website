(()=>{
 const choices=[...document.querySelectorAll('[data-plan]')];
 function choose(name){choices.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.plan===name)));document.querySelectorAll('[data-plan-panel]').forEach(p=>p.hidden=p.dataset.planPanel!==name)}
 choices.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.plan)));
 document.querySelectorAll('[data-select-plan]').forEach(b=>b.addEventListener('click',()=>{choose(b.dataset.selectPlan);const target=choices.find(c=>c.dataset.plan===b.dataset.selectPlan);target.focus({preventScroll:true});document.querySelector('#plans').scrollIntoView({block:'start'})}));
})();
