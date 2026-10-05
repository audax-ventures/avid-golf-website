(() => {
  const output = document.getElementById('season-from');
  if (!output) return;
  document.querySelectorAll('[data-season]').forEach(button => button.addEventListener('click', () => {
    output.textContent = button.dataset.season === 'winter' ? '$38' : '$30';
  }));
})();
