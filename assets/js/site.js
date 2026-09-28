/* opedro. — Portfolio 3.0 · comportamento compartilhado */
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  /* App bar ganha borda ao rolar */
  var bar = document.querySelector('.appbar');
  function onScroll() { if (bar) bar.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Menu mobile */
  var menuBtn = document.querySelector('.appbar__menu');
  var menu = document.getElementById('mobile-menu');
  if (menuBtn && menu) {
    var icon = menuBtn.querySelector('.icon');
    function setMenu(open) {
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      if (icon) icon.textContent = open ? 'close' : 'menu';
    }
    menuBtn.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
  }

  /* Reveal ao entrar na viewport */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* Lightbox das telas — <dialog> nativo prende o foco e fecha com Esc */
  var shots = document.querySelectorAll('.shot__frame');
  if (shots.length && typeof HTMLDialogElement === 'function') {
    var dlg = document.createElement('dialog');
    dlg.className = 'dialog lightbox';
    dlg.setAttribute('aria-label', 'Imagem ampliada');
    dlg.innerHTML = '<button class="icon-btn icon-btn--inverse lightbox__close" aria-label="Fechar imagem" autofocus><span class="icon" aria-hidden="true">close</span></button><img alt="">';
    document.body.appendChild(dlg);
    var big = dlg.querySelector('img');
    shots.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var img = btn.querySelector('img');
        big.src = img.currentSrc || img.src; big.alt = img.alt;
        dlg.showModal();
      });
    });
    dlg.addEventListener('click', function (e) { if (e.target !== big) dlg.close(); });
  }
})();
