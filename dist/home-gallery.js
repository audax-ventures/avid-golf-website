(() => {
  const root = document.getElementById('avid-gallery');
  if (!root) return;
  const image = root.querySelector('.gg-main');
  const thumbs = [...root.querySelectorAll('.gg-thumb')];
  const figures = [...root.querySelectorAll('.gg-item')];
  const photos = figures.map(figure => ({ src: figure.querySelector('img').getAttribute('src'), alt: figure.querySelector('img').alt, caption: figure.querySelector('figcaption').textContent }));
  const gallery = root.querySelector('.gg-all');
  const button = root.querySelector('.gg-gallery');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 0;
  let animation;
  const allowed = () => !reduced.matches && !document.body.classList.contains('motion-paused');
  function syncMotion() {
    root.dataset.motion = String(allowed());
    if (!allowed()) {
      animation?.cancel();
      gallery.getAnimations({ subtree: true }).forEach(a => a.cancel());
    }
  }
  function select(index) {
    const previous = selected;
    selected = (index + photos.length) % photos.length;
    const photo = photos[selected];
    image.src = photo.src;
    image.alt = photo.alt;
    root.querySelector('.gg-count').textContent = `${String(selected + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
    root.querySelector('.gg-caption').textContent = photo.caption;
    thumbs.forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === selected)));
    animation?.cancel();
    if (allowed() && previous !== selected) {
      animation = image.animate([{ opacity: 0.25, transform: `translateX(${selected > previous ? 18 : -18}px) scale(1.035)` }, { opacity: 1, transform: 'translateX(0) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.2,.75,.2,1)' });
    }
  }
  root.querySelectorAll('[data-photo]').forEach(b => b.addEventListener('click', () => select(Number(b.dataset.photo))));
  root.querySelectorAll('[data-direction]').forEach(b => b.addEventListener('click', () => select(selected + Number(b.dataset.direction))));
  root.querySelector('.gg-thumbs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'Home' ? 0 : event.key === 'End' ? photos.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1));
    thumbs[selected].focus();
  });
  button.addEventListener('click', () => {
    gallery.hidden = !gallery.hidden;
    button.setAttribute('aria-expanded', String(!gallery.hidden));
    button.querySelector('span').textContent = gallery.hidden ? 'View the photo gallery' : 'Close the photo gallery';
    if (!gallery.hidden && allowed()) figures.forEach((f, i) => f.animate([{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, delay: i * 90, fill: 'backwards', easing: 'ease-out' }));
  });
  syncMotion();
  new MutationObserver(syncMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', syncMotion);
})();
