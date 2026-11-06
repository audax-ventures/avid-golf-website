// Grouped navigation: keyboard native disclosures, one open group at a time.
const groups=[...document.querySelectorAll('.nav-group')];
groups.forEach(group=>group.addEventListener('toggle',()=>{if(group.open)groups.forEach(other=>{if(other!==group)other.open=false})}));
document.addEventListener('click',event=>groups.forEach(group=>{if(!group.contains(event.target))group.open=false}));
// Desktop with a mouse: open dropdowns on hover. Touch screens and the mobile menu keep tap to open.
const hoverNav=matchMedia('(hover:hover) and (pointer:fine) and (min-width:1051px)');
groups.forEach(group=>{let closeTimer;const summary=group.querySelector('summary');
group.addEventListener('mouseenter',()=>{if(!hoverNav.matches)return;clearTimeout(closeTimer);group.open=true});
group.addEventListener('mouseleave',()=>{if(!hoverNav.matches)return;closeTimer=setTimeout(()=>{group.open=false},180)});
summary.addEventListener('click',event=>{if(hoverNav.matches&&event.detail>0){event.preventDefault();group.open=true}})});
document.addEventListener('keydown',event=>{if(event.key==='Escape')groups.forEach(group=>{if(group.open){group.open=false;group.querySelector('summary').focus()}})});
const photos={play:['assets/photos/play.webp','Friends enjoying a round at AVID Golf'],practice:['assets/photos/practice.webp','Golfer practising a shot in an AVID simulator bay'],unwind:['assets/photos/social.webp','Friends catching up in the AVID lounge']};
const experienceImage=document.querySelector('#experience-image');
if(experienceImage){document.querySelectorAll('[data-tab]').forEach(tab=>{new Image().src=photos[tab.dataset.tab][0];const observer=new MutationObserver(()=>{if(tab.getAttribute('aria-selected')==='true'){const [src,alt]=photos[tab.dataset.tab];experienceImage.src=src;experienceImage.alt=alt;experienceImage.classList.remove('data-image')}});observer.observe(tab,{attributes:true,attributeFilter:['aria-selected']})})}
const photoDialog=document.querySelector('#photo-dialog');
if(photoDialog){document.querySelectorAll('.gallery-open').forEach(button=>button.addEventListener('click',()=>{const img=button.querySelector('img');photoDialog.querySelector('img').src=button.dataset.full;photoDialog.querySelector('img').alt=img.alt;photoDialog.querySelector('p').textContent=button.closest('figure').querySelector('figcaption').textContent;photoDialog.showModal()}));photoDialog.querySelector('.photo-close').addEventListener('click',()=>photoDialog.close());photoDialog.addEventListener('click',e=>{if(e.target===photoDialog){const r=photoDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)photoDialog.close()}})}
const contactForm=document.querySelector('#contact-form');
if(contactForm){
  // Sends through the Supabase "contact" function, which emails info@avidgolf.club via Resend.
  const sent=document.querySelector('#contact-sent');
  const status=document.querySelector('#contact-status');
  const button=contactForm.querySelector('button[type=submit]');
  const fallback='Sorry, your message didn’t send. Please try again, or email <a href="mailto:info@AVIDGOLF.club">info@AVIDGOLF.club</a> or call <a href="tel:+12045052843">204-505-2843</a>.';
  contactForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!contactForm.reportValidity())return;
    const config=window.AVID_CONTENT||{};
    const payload=Object.fromEntries(new FormData(contactForm));
    button.disabled=true;button.textContent='Sending…';status.textContent='';status.classList.remove('is-error');
    try{
      if(!config.supabaseUrl)throw new Error('Not configured');
      const res=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/contact',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseAnonKey||''},body:JSON.stringify(payload)});
      const result=await res.json().catch(()=>({}));
      if(!res.ok||!result.ok)throw new Error(result.error||'Send failed');
      contactForm.reset();contactForm.hidden=true;sent.hidden=false;sent.focus();
    }catch{
      status.innerHTML=fallback;status.classList.add('is-error');
    }finally{
      button.disabled=false;button.textContent='Send Message';
    }
  });
  document.querySelector('#contact-another').addEventListener('click',()=>{sent.hidden=true;contactForm.hidden=false;contactForm.elements.name.focus()});
}

// Collapse a dropdown after keyboard focus leaves its group.
groups.forEach(group=>group.addEventListener('focusout',()=>setTimeout(()=>{if(!group.contains(document.activeElement))group.open=false},0)));
