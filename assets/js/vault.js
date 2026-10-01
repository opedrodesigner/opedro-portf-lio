/* opedro. — Portfolio 3.0 · case protegido por senha
   O conteúdo e as telas são cifrados (AES-GCM, chave PBKDF2 da senha) no build.
   Sem a senha certa, nada do case existe em texto claro no site. */
(function () {
  var data = window.__VAULT__;
  var form = document.getElementById('gate-form');
  if (!data || !form) return;

  var gate = document.getElementById('gate');
  var vault = document.getElementById('vault');
  var input = document.getElementById('gate-pass');
  var help = document.getElementById('gate-help');
  var submit = form.querySelector('button[type="submit"]');
  var HELP = help.innerHTML;
  var KEY_STORE = 'vault:' + location.pathname;
  var subtle = window.crypto && window.crypto.subtle;

  function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function toB64(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }

  function deriveKey(pass) {
    return subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: b64(data.salt), iterations: data.iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    });
  }
  /* blob = iv (12 bytes) + texto cifrado */
  function decrypt(key, bytes) {
    return subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  }

  function setError(msg) {
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    help.innerHTML = msg ? '<span class="icon" aria-hidden="true">error</span>' + msg : HELP;
  }

  function unlock(key, remember) {
    return decrypt(key, b64(data.ct)).then(function (plain) {
      var payload = JSON.parse(new TextDecoder().decode(plain));
      if (remember) {
        subtle.exportKey('raw', key).then(function (raw) { try { sessionStorage.setItem(KEY_STORE, toB64(raw)); } catch (e) {} });
      }
      vault.innerHTML = payload.html;
      gate.hidden = true;
      vault.hidden = false;
      document.title = payload.title || document.title;
      setup(key, payload.files);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pass = input.value;
    if (!pass) { setError('Digite a senha.'); input.focus(); return; }
    if (!subtle) { setError('Seu navegador não suporta a abertura deste case.'); return; }
    submit.disabled = true;
    deriveKey(pass)
      .then(function (key) { return unlock(key, true); })
      .then(function () { var h = vault.querySelector('h2, h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } })
      .catch(function () { setError('Senha incorreta. Confira e tente de novo.'); input.select(); })
      .then(function () { submit.disabled = false; });
  });
  input.addEventListener('input', function () { if (input.getAttribute('aria-invalid') === 'true') setError(''); });

  /* reabre sozinho na mesma aba */
  try {
    var saved = sessionStorage.getItem(KEY_STORE);
    if (saved && subtle) {
      subtle.importKey('raw', b64(saved), 'AES-GCM', false, ['decrypt'])
        .then(function (key) { return unlock(key, false); })
        .catch(function () { try { sessionStorage.removeItem(KEY_STORE); } catch (e) {} });
    }
  } catch (e) {}

  /* ---------- Depois de aberto: telas, rolagem e reveal */
  function setup(key, files) {
    var pending = {};
    window.__vaultImg = function (name, blob) { if (pending[name]) { pending[name](blob); delete pending[name]; } };

    function load(img) {
      var name = files[img.getAttribute('data-cb')];
      if (!name || img.dataset.state) return;
      img.dataset.state = 'loading';
      new Promise(function (res) {
        pending[name] = res;
        var s = document.createElement('script');
        s.src = 'assets/cb/' + name + '.js';
        s.onload = function () { s.remove(); };
        document.body.appendChild(s);
      }).then(function (blob) {
        return decrypt(key, b64(blob));
      }).then(function (bytes) {
        img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
        return img.decode ? img.decode().catch(function () {}) : null;
      }).then(function () {
        img.classList.add('is-loaded');
        var phone = img.closest('.phone');
        var ratio = img.naturalHeight / img.naturalWidth;
        if (phone && ratio > 2.05) {
          phone.classList.add('phone--scroll');
          phone.style.setProperty('--dur', Math.round(8 + (ratio / 1.977 - 1) * 8) + 's');
          watch.observe(phone);
        }
      });
    }

    var imgs = vault.querySelectorAll('img[data-cb]');
    var near = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { near.unobserve(en.target); load(en.target); } });
    }, { rootMargin: '800px 0px' }) : null;
    imgs.forEach(function (img) { near ? near.observe(img) : load(img); });

    /* só anima o celular que está na tela */
    var watch = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (en) { en.target.classList.toggle('is-playing', en.isIntersecting); });
    }, { threshold: 0.35 }) : { observe: function (el) { el.classList.add('is-playing'); } };

    /* setas do carrossel: só aparecem quando a fileira não cabe */
    vault.querySelectorAll('.phones').forEach(function (row) {
      var stage = row.closest('.stage');
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
        head.hidden = !over && !head.querySelector('.stage__title');
        prev.disabled = row.scrollLeft < 4;
        next.disabled = row.scrollLeft + row.clientWidth > row.scrollWidth - 4;
      }
      row.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
    });

    /* clicar no celular amplia a tela; tela longa rola dentro do dialog */
    if (typeof HTMLDialogElement === 'function') {
      var box = document.createElement('dialog');
      box.className = 'dialog screen-box';
      box.setAttribute('aria-label', 'Tela ampliada');
      box.innerHTML = '<button class="icon-btn icon-btn--inverse screen-box__close" type="button" aria-label="Fechar tela" autofocus><span class="icon" aria-hidden="true">close</span></button><div class="screen-box__frame"><img alt=""></div>';
      document.body.appendChild(box);
      var big = box.querySelector('img'), frame = box.querySelector('.screen-box__frame');
      vault.addEventListener('click', function (e) {
        var phone = e.target.closest('.phone');
        if (!phone) return;
        var img = phone.querySelector('img');
        if (!img.classList.contains('is-loaded')) return;
        big.src = img.src; big.alt = img.alt;
        frame.scrollTop = 0;
        box.showModal();
      });
      box.addEventListener('click', function (e) { if (!frame.contains(e.target)) box.close(); });
      box.querySelector('.screen-box__close').addEventListener('click', function () { box.close(); });
    }

    var rev = vault.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      rev.forEach(function (el) { io.observe(el); });
    } else rev.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();
