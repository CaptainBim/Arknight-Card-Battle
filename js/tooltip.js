/* =========================================================================
   Arknight Card Battle — Hover tooltip
   Any element carrying a data-tip attribute shows a short explanation
   near the cursor. Used by both the menu and the in-game board/hand.
   ========================================================================= */
(function (global) {
  'use strict';

  let tip = null;
  let current = null;

  function ensure() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'tooltip';
    tip.className = 'tooltip';
    document.body.appendChild(tip);
    return tip;
  }

  function place(x, y) {
    const t = ensure();
    const pad = 14;
    const w = t.offsetWidth, h = t.offsetHeight;
    let nx = x + pad, ny = y + pad;
    if (nx + w > window.innerWidth - 8) nx = x - w - pad;
    if (ny + h > window.innerHeight - 8) ny = y - h - pad;
    if (nx < 8) nx = 8;
    if (ny < 8) ny = 8;
    t.style.left = nx + 'px';
    t.style.top = ny + 'px';
  }

  function show(el, x, y) {
    const t = ensure();
    t.innerHTML = el.getAttribute('data-tip');
    t.classList.add('show');
    place(x, y);
  }
  function hide() { if (tip) tip.classList.remove('show'); current = null; }

  function init() {
    document.addEventListener('mousemove', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el !== current) {
        current = el;
        if (el) show(el, e.clientX, e.clientY); else hide();
      } else if (el) {
        place(e.clientX, e.clientY);
      }
    }, true);
    document.addEventListener('mouseleave', hide, true);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('scroll', hide, true);
  }

  global.Tooltip = { init, show, hide };
})(window);
