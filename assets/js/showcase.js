/* opedro. — Portfolio 3.0 · telas de produto em mockup de celular
   Showcase.init(raiz): carrossel das fileiras, rolagem automática das telas longas
   e tela ampliada num celular grande (setas trocam de tela, Esc fecha).
   Showcase.ready(img): avisa que uma imagem carregou (usado pelo case protegido,
   que decifra as telas antes de exibir). */
window.Showcase = (function () {
  var IO = 'IntersectionObserver' in window;
  var playing = IO ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { en.target.classList.toggle('is-playing', en.isIntersecting); });
  }, { threshold: 0.35 }) : null;

  /* tela mais alta que o celular: rola sozinha, devagar */
  function ready(img) {
    img.classList.add('is-loaded');
    var phone = img.closest('.phone');
    if (!phone) return;
    var frame = phone.querySelector('.phone__screen');
    var base = frame.clientHeight / frame.clientWidth || 1.977;
    var ratio = img.naturalHeight / img.naturalWidth;
    if (ratio <= base * 1.04) return;
    phone.classList.add('phone--scroll');
    phone.style.setProperty('--dur', Math.round(8 + (ratio / base - 1) * 8) + 's');
    if (playing) playing.observe(phone); else phone.classList.add('is-playing');
  }

  /* setas do carrossel: só aparecem quando a fileira não cabe */
  function carousels(root) {
    root.querySelectorAll('.phones').forEach(function (row) {
      var stage = row.closest('.stage');
      if (!stage || row.dataset.carousel) return;
      row.dataset.carousel = '1';
      var head = stage.querySelector('.stage__head');
      if (!head) { head = document.createElement('div'); head.className = 'stage__head'; stage.insertBefore(head, row); }
      var nav = document.createElement('div');
      nav.className = 'carousel-nav';
      nav.innerHTML = '<button class="icon-btn icon-btn--outlined" type="button" aria-label="Telas anteriores"><span class="icon" aria-hidden="true">chevron_left</span></button>' +
        '<button class="icon-btn icon-btn--outlined" type="button" aria-label="Próximas telas"><span class="icon" aria-hidden="true">chevron_right</span></button>';
      head.appendChild(nav);
      var prev = nav.children[0], next = nav.children[1];
      function step() { return Math.max(row.clientWidth * 0.8, 260); }
      prev.addEventListener('click', function () { row.scrollBy({ left: -step() }); });
      next.addEventListener('click', function () { row.scrollBy({ left: step() }); });
      function sync() {
        var over = row.scrollWidth > row.clientWidth + 4;
        nav.hidden = !over;
        head.hidden = !over && !head.querySelector('.stage__title, .stage__note');
        prev.disabled = row.scrollLeft < 4;
        next.disabled = row.scrollLeft + row.clientWidth > row.scrollWidth - 4;
      }
      row.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
    });
  }

  /* ---------- Tela ampliada: um celular grande, sem barra de rolagem à vista */
  var box, screen, img, bar, thumb, title, count, hint, prevBtn, nextBtn, list = [], at = 0;

  function buildBox() {
    box = document.createElement('dialog');
    box.className = 'screen-box';
    box.setAttribute('aria-label', 'Tela ampliada');
    box.innerHTML =
      '<button class="icon-btn icon-btn--inverse screen-box__close" type="button" aria-label="Fechar" autofocus><span class="icon" aria-hidden="true">close</span></button>' +
      '<button class="icon-btn screen-box__nav screen-box__nav--prev" type="button" aria-label="Tela anterior"><span class="icon" aria-hidden="true">arrow_back</span></button>' +
      '<div class="screen-box__stage">' +
        '<div class="screen-box__phone"><div class="screen-box__screen" tabindex="0"><img alt=""></div>' +
          '<div class="screen-box__bar" aria-hidden="true"><span></span></div></div>' +
        '<div class="screen-box__info"><span class="screen-box__count"></span><span class="screen-box__title"></span>' +
          '<span class="screen-box__hint"><span class="icon" aria-hidden="true">swipe_vertical</span>Role para ver a tela inteira</span></div>' +
      '</div>' +
      '<button class="icon-btn screen-box__nav screen-box__nav--next" type="button" aria-label="Próxima tela"><span class="icon" aria-hidden="true">arrow_forward</span></button>';
    document.body.appendChild(box);
    screen = box.querySelector('.screen-box__screen');
    img = screen.querySelector('img');
    bar = box.querySelector('.screen-box__bar');
    thumb = bar.querySelector('span');
    title = box.querySelector('.screen-box__title');
    count = box.querySelector('.screen-box__count');
    hint = box.querySelector('.screen-box__hint');
    prevBtn = box.querySelector('.screen-box__nav--prev');
    nextBtn = box.querySelector('.screen-box__nav--next');

    box.querySelector('.screen-box__close').addEventListener('click', function () { box.close(); });
    prevBtn.addEventListener('click', function () { show(at - 1); });
    nextBtn.addEventListener('click', function () { show(at + 1); });
    box.addEventListener('click', function (e) { if (e.target === box || e.target.classList.contains('screen-box__stage')) box.close(); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
    });
    screen.addEventListener('scroll', syncBar, { passive: true });
    window.addEventListener('resize', syncBar);
  }

  function syncBar() {
    var max = screen.scrollHeight - screen.clientHeight;
    var long = max > 4;
    bar.hidden = !long;
    hint.hidden = !long || screen.scrollTop > 24;
    if (!long) return;
    var h = Math.max(screen.clientHeight / screen.scrollHeight, 0.08);
    thumb.style.height = (h * 100) + '%';
    thumb.style.top = ((screen.scrollTop / max) * (1 - h) * 100) + '%';
  }

  function show(i) {
    if (i < 0 || i >= list.length) return;
    at = i;
    var src = list[i].querySelector('img');
    var cap = list[i].closest('.phone-item').querySelector('figcaption');
    img.src = src.src; img.alt = src.alt;
    title.textContent = cap ? cap.textContent.replace(/^\d+/, '').trim() : '';
    count.textContent = list.length > 1 ? String(i + 1).padStart(2, '0') + ' / ' + String(list.length).padStart(2, '0') : '';
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === list.length - 1;
    screen.scrollTop = 0;
    if (img.complete) requestAnimationFrame(syncBar); else img.onload = syncBar;
  }

  function lightbox(root) {
    if (typeof HTMLDialogElement !== 'function') return;
    root.addEventListener('click', function (e) {
      var phone = e.target.closest('.phone');
      if (!phone || !root.contains(phone)) return;
      var im = phone.querySelector('img');
      if (!im || !im.classList.contains('is-loaded')) return;
      if (!box) buildBox();
      var row = phone.closest('.phones') || phone.parentNode;
      list = Array.prototype.filter.call(row.querySelectorAll('.phone'), function (p) {
        var x = p.querySelector('img'); return x && x.classList.contains('is-loaded');
      });
      show(Math.max(0, list.indexOf(phone)));
      box.showModal();
      screen.focus({ preventScroll: true });
      requestAnimationFrame(syncBar);
    });
  }

  function init(root) {
    root = root || document;
    carousels(root);
    lightbox(root);
    /* imagens comuns (não cifradas): marcar quando carregarem */
    root.querySelectorAll('.phone img:not([data-cb])').forEach(function (im) {
      if (im.complete && im.naturalWidth) ready(im);
      else im.addEventListener('load', function () { ready(im); }, { once: true });
    });
  }

  return { init: init, ready: ready };
})();
