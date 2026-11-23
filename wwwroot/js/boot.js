// Runs before first paint (tiny, render-blocking on purpose): marks JS as available, records whether
// the visitor allows motion, and restores "evening mode" so the page doesn't flash bright first.
(function () {
    var html = document.documentElement;
    html.classList.remove('no-js');
    html.classList.add('js');
    try {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) html.classList.add('motion-ok');
    } catch (e) { /* very old browser */ }
    try {
        if (localStorage.getItem('co.evening') === '1') html.setAttribute('data-evening', '');
    } catch (e) { /* storage blocked: ignore */ }
})();
