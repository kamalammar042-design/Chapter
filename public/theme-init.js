(function () {
  try {
    var t = localStorage.getItem('chapter.theme') || 'dark';
    if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable: keep the default */ }
})();
