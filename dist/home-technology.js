(() => {
  const root = document.getElementById('avid-tech');
  if (!root) return;
  const visual = root.querySelector('.at-visual');
  const tabs = [...root.querySelectorAll('.at-tab')];
  const pause = root.querySelector('.at-pause');
  const replayButton = root.querySelector('.at-replay');
  const cta = root.querySelector('.at-cta');
  const more = root.querySelector('.at-more');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const samples = [
    [['269', 'yds', 'Carry distance'], ['156.0', 'mph', 'Ball speed']],
    [['108.9', 'mph', 'Clubhead speed'], ['1.6', '°', 'Club path · in to out']]
  ];
  let selected = 0, paused = false, visible = false, timer;
  const allowed = () => !paused && !reduced.matches && !document.body.classList.contains('motion-paused');
  function stop() {
    clearTimeout(timer);
    visual.classList.remove('at-playing');
  }
  function replay() {
    stop();
    if (!allowed() || !visible || document.hidden) return;
    // Restart the illustrative SVG sequence, never a measured shot.
    void visual.offsetWidth;
    visual.classList.add('at-playing');
    timer = setTimeout(replay, 6000);
  }
  function syncMotion() {
    const enabled = allowed();
    root.dataset.motion = String(enabled);
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    const blocked = reduced.matches || document.body.classList.contains('motion-paused');
    pause.disabled = blocked;
    pause.title = blocked ? 'Motion is disabled by your motion preference' : '';
    replayButton.disabled = !enabled;
    replay();
  }
  function setView(index) {
    selected = index;
    visual.dataset.view = String(index);
    tabs.forEach((tab, i) => tab.setAttribute('aria-pressed', String(i === index)));
    root.querySelector('.at-tabs').style.setProperty('--at-selected', index);
    samples[index].forEach((sample, i) => {
      root.querySelector(`[data-number="${i}"]`).textContent = sample[0];
      root.querySelector(`[data-unit="${i}"]`).textContent = sample[1];
      root.querySelector(`[data-label="${i}"]`).textContent = sample[2];
    });
    root.querySelector('.at-course').setAttribute('aria-label', index
      ? 'Illustrative club delivery moving through impact on an in-to-out path. Not measured data.'
      : 'Illustrative golf ball flight from tee to landing. Not measured trajectory data.');
    root.querySelector('.at-note').textContent = index
      ? 'Example data · Illustrative club delivery' : 'Example data · Illustrative flight path';
    replayButton.setAttribute('aria-label', index ? 'Replay club delivery animation' : 'Replay ball flight animation');
    replay();
  }
  tabs.forEach((tab, index) => tab.addEventListener('click', () => {
    if (selected !== index) setView(index);
  }));
  pause.addEventListener('click', () => { paused = !paused; syncMotion(); });
  replayButton.addEventListener('click', replay);
  cta.addEventListener('click', () => {
    more.hidden = !more.hidden;
    cta.setAttribute('aria-expanded', String(!more.hidden));
  });
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    replay();
  }, { threshold: 0.2 });
  observer.observe(visual);
  const motionObserver = new MutationObserver(syncMotion);
  motionObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reduced.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', replay);
  syncMotion();
})();
