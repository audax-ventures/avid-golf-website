(() => {
  const gallery = document.querySelector('.gallery-carousel');
  if (!gallery) return;
  const slides = [...gallery.querySelectorAll('.gallery-slide')];
  const thumbs = [...gallery.querySelectorAll('.gallery-thumb')];
  const stage = gallery.querySelector('.gallery-stage');
  const strip = gallery.querySelector('.gallery-thumbnails');
  let current = 0;
  const show = index => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    thumbs.forEach((thumb, i) => thumb.setAttribute('aria-current', String(i === current)));
    gallery.querySelector('[data-gallery-count]').textContent = `${current + 1} / ${slides.length}`;
    [current, (current + 1) % slides.length].forEach(i => { slides[i].querySelector('img').loading = 'eager'; });
    const thumb = thumbs[current];
    const left = strip.scrollLeft + thumb.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - thumb.clientWidth) / 2;
    strip.scrollTo({ left, behavior: 'auto' });
  };
  gallery.querySelector('[data-gallery-prev]').addEventListener('click', () => show(current - 1));
  gallery.querySelector('[data-gallery-next]').addEventListener('click', () => show(current + 1));
  thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => show(i)));
  gallery.addEventListener('keydown', event => {
    const positions = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1 };
    if (event.key in positions) { event.preventDefault(); show(positions[event.key]); }
  });
  let start = null;
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
    start = null;
  });
  stage.addEventListener('pointercancel', () => { start = null; });
  stage.addEventListener('dragstart', event => event.preventDefault());
})();
