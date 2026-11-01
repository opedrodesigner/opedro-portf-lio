/* Dropdown do DS ZEOM: substitui a lista nativa do sistema por um menu próprio.
   Uso: <select class="sel"> comum. O <select> continua no DOM (escondido) como fonte
   da verdade: valor, eventos input/change e disabled seguem funcionando como antes.
   data-layout="days" mostra os dias numa grade de 7 colunas (como um calendário);
   uma opção com valor 0 (ex.: "Sem dia") aparece em cima da grade.
   Teclado: Enter/Espaço/↓ abre; setas navegam (na grade, ↑↓ pulam uma semana);
   Home/End; Enter escolhe; Esc fecha. */
(function () {
  'use strict';

  var VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  var CHEV = '<svg class="ti dd-chev" aria-hidden="true"><use href="#ti-chevron-down"/></svg>';
  var CHECK = '<svg class="ti dd-check" aria-hidden="true"><use href="#ti-check"/></svg>';
  var uid = 0, open = null;

  function labelFor(sel) {
    var l = sel.getAttribute('aria-label');
    if (l) return l;
    var lab = sel.closest('label');
    var t = lab && lab.querySelector('.lab');
    return t ? t.textContent.trim() : '';
  }
  function shortText(o, days) { return days ? o.text.replace(/^Dia\s+/, '') : o.text; }

  function enhance(sel) {
    if (sel.dataset.dd) return;
    sel.dataset.dd = '1';
    var id = 'dd' + (++uid), days = sel.dataset.layout === 'days';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn';
    btn.id = id;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="dd-val"></span>' + CHEV;
    sel.classList.add('dd-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);

    function update() {
      var o = sel.options[sel.selectedIndex];
      btn.querySelector('.dd-val').textContent = o ? o.text : '';
      btn.disabled = sel.disabled;
      var l = labelFor(sel);
      btn.setAttribute('aria-label', l ? l + ': ' + (o ? o.text : '') : (o ? o.text : ''));
    }
    // Valor trocado por código (sel.value = x) também atualiza o botão
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get: function () { return VALUE.get.call(this); },
      set: function (v) { VALUE.set.call(this, v); update(); }
    });
    new MutationObserver(update).observe(sel, { attributes: true, attributeFilter: ['disabled'], childList: true });
    update();

    // detail 0 = clique vindo do teclado (Enter/Espaço): aí o foco da opção aparece
    btn.addEventListener('click', function (e) { if (open && open.sel === sel) close(true); else show(sel, btn, days, e.detail === 0); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(sel, btn, days, true); }
    });
  }

  function show(sel, btn, days, kbd) {
    close(false);
    var host = btn.closest('dialog[open]') || document.body;
    var menu = document.createElement('div');
    menu.className = 'dd-menu' + (days ? ' days' : '') + (kbd ? ' kbd' : '');
    menu.setAttribute('role', 'listbox');
    menu.tabIndex = -1;
    menu.setAttribute('aria-label', labelFor(sel) || 'Opções');
    var opts = Array.prototype.slice.call(sel.options), head = '', grid = '', list = '';
    opts.forEach(function (o, i) {
      var on = o.selected, oid = btn.id + '-o' + i;
      var html = '<div role="option" id="' + oid + '" data-i="' + i + '" class="dd-opt' + (on ? ' on' : '') + '" aria-selected="' + on + '">';
      if (days && o.value !== '0') grid += html + shortText(o, true) + '</div>';
      else if (days) head += html + '<span>' + o.text + '</span>' + (on ? CHECK : '') + '</div>';
      else list += html + '<span>' + o.text + '</span>' + (on ? CHECK : '') + '</div>';
    });
    menu.innerHTML = days ? head + '<div class="dd-grid" role="presentation">' + grid + '</div>' : list;
    host.appendChild(menu);

    // Posição: embaixo do botão; se não couber, em cima
    var r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = days ? Math.min(300, vw - 16) : Math.max(r.width, 180);
    menu.style.width = w + 'px';
    menu.style.left = Math.max(8, Math.min(r.left + r.width - w, vw - w - 8, r.left)) + 'px';
    var below = vh - r.bottom - 12, above = r.top - 12, h = menu.scrollHeight;
    if (h > below && above > below) { menu.style.maxHeight = Math.min(h, above) + 'px'; menu.style.top = Math.max(8, r.top - 6 - Math.min(h, above)) + 'px'; }
    else { menu.style.maxHeight = Math.max(120, below) + 'px'; menu.style.top = (r.bottom + 6) + 'px'; }

    open = { sel: sel, btn: btn, menu: menu, days: days, i: Math.max(0, sel.selectedIndex) };
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', menu.id = btn.id + '-menu');
    setActive(open.i);
    menu.focus({ preventScroll: true });
    var cur = menu.querySelector('.dd-opt.on');
    if (cur) cur.scrollIntoView({ block: 'nearest' });

    menu.addEventListener('click', function (e) {
      var o = e.target.closest('.dd-opt');
      if (o) choose(+o.dataset.i);
    });
    menu.addEventListener('keydown', onKey);
  }

  function setActive(i) {
    var n = open.sel.options.length;
    open.i = Math.max(0, Math.min(n - 1, i));
    var el = open.menu.querySelector('[data-i="' + open.i + '"]');
    open.menu.querySelectorAll('.dd-opt.act').forEach(function (x) { x.classList.remove('act'); });
    if (el) { el.classList.add('act'); open.menu.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  }
  function onKey(e) {
    var k = e.key, i = open.i, hasHead = open.days && open.sel.options[0] && open.sel.options[0].value === '0';
    var step = open.days && !(hasHead && i === 0) ? 7 : 1;
    if (k === 'Escape' || k === 'Tab') { e.preventDefault(); close(true); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(i); return; }
    if (k === 'Home') i = 0;
    else if (k === 'End') i = open.sel.options.length - 1;
    else if (k === 'ArrowDown') i = hasHead && i === 0 ? 1 : i + step;
    else if (k === 'ArrowUp') i = hasHead && i - step < 1 && i > 0 ? 0 : i - step;
    else if (k === 'ArrowRight' && open.days) i += 1;
    else if (k === 'ArrowLeft' && open.days) i -= 1;
    else return;
    e.preventDefault();
    open.menu.classList.add('kbd');
    setActive(i);
  }
  function choose(i) {
    var sel = open.sel, changed = sel.selectedIndex !== i;
    VALUE.set.call(sel, sel.options[i].value);
    close(true);
    sel.value = sel.options[i].value; // atualiza o botão
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function close(refocus) {
    if (!open) return;
    var o = open;
    open = null;
    o.menu.remove();
    o.btn.setAttribute('aria-expanded', 'false');
    o.btn.removeAttribute('aria-controls');
    if (refocus && o.btn.isConnected) o.btn.focus({ preventScroll: true });
  }

  // Fecha ao tocar fora, ao rolar a página ou ao mudar o tamanho da tela
  document.addEventListener('pointerdown', function (e) {
    if (open && !open.menu.contains(e.target) && !open.btn.contains(e.target)) close(false);
  }, true);
  document.addEventListener('scroll', function (e) {
    if (open && !open.menu.contains(e.target)) close(false);
  }, true);
  // Só a largura conta: no celular a altura muda quando o teclado ou a barra do navegador aparecem
  var lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth !== lastW) { lastW = window.innerWidth; close(false); }
  });
  document.addEventListener('close', function () { close(false); }, true); // um <dialog> fechou

  function scan(root) { (root.querySelectorAll ? root : document).querySelectorAll('select.sel').forEach(enhance); }
  scan(document);
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('select.sel')) enhance(n); else scan(n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
