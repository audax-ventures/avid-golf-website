(() => {
  const root = document.getElementById('avid-more');
  if (!root) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
    root.dataset.motion = String(!reduced.matches && !document.body.classList.contains('motion-paused'));
  };
  syncMotion();
  new MutationObserver(syncMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', syncMotion);
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('am-reveal');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  root.querySelectorAll('.am-card').forEach(card => observer.observe(card));
})();
