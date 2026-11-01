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
      }).then(function () { Showcase.ready(img); });
    }

    var imgs = vault.querySelectorAll('img[data-cb]');
    var near = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { near.unobserve(en.target); load(en.target); } });
    }, { rootMargin: '800px 0px' }) : null;
    imgs.forEach(function (img) { near ? near.observe(img) : load(img); });

    /* carrossel, rolagem das telas longas e tela ampliada */
    Showcase.init(vault);

    var rev = vault.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      rev.forEach(function (el) { io.observe(el); });
    } else rev.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();
