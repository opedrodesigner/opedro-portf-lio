/* opedro. — Portfolio 3.0 · componentes vivos do case Design System */
(function () {

  /* ---------- Segmented button: radiogroup com setas (roving tabindex) */
  function segmented(group, onChange) {
    var opts = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
    function select(btn, focus) {
      opts.forEach(function (o) {
        var on = o === btn;
        o.setAttribute('aria-checked', String(on));
        o.tabIndex = on ? 0 : -1;
      });
      if (focus) btn.focus();
      onChange(btn.dataset.value);
    }
    opts.forEach(function (o, i) {
      o.addEventListener('click', function () { select(o); });
      o.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        select(opts[(i + d + opts.length) % opts.length], true);
      });
    });
  }

  /* ---------- Switch */
  document.querySelectorAll('.switch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      var on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      sw.dispatchEvent(new CustomEvent('switch', { detail: on }));
    });
  });

  /* ---------- Demo 1: o mesmo componente, três temas */
  var stage = document.getElementById('theme-stage');
  if (stage) {
    var toks = document.querySelectorAll('[data-token]');
    var paint = function () {
      var cs = getComputedStyle(stage);
      toks.forEach(function (li) {
        var v = cs.getPropertyValue(li.dataset.token).trim().toUpperCase();
        li.querySelector('.tok__sw').style.background = v;
        li.querySelector('.tok__val').textContent = v;
      });
    };
    segmented(document.getElementById('theme-seg'), function (theme) {
      stage.setAttribute('data-theme', theme);
      paint();
    });
    paint();

    /* snackbar com ação: nunca some em menos de 8 s */
    var snack = stage.querySelector('.snackbar');
    var timer;
    var hide = function () { snack.hidden = true; };
    stage.querySelector('[data-publish]').addEventListener('click', function () {
      snack.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(hide, 8000);
    });
    snack.querySelector('button').addEventListener('click', function () { clearTimeout(timer); hide(); });
  }

  /* ---------- Demo 2: hierarquia e estados do botão */
  var ranks = document.getElementById('btn-stage');
  if (ranks) {
    var FOCUS = 'anel 2px --primary · offset 2';
    var TOKENS = {
      filled:   { enabled: 'fundo --primary', hover: 'fundo --primary-hover', pressed: 'fundo --primary-press', focus: FOCUS },
      tonal:    { enabled: 'fundo --primary-container', hover: '+ state layer --hover · 6%', pressed: '+ state layer --press · 12%', focus: FOCUS },
      outlined: { enabled: 'borda --outline · rótulo --primary-text', hover: 'fundo --hover · 6%', pressed: 'fundo --press · 12%', focus: FOCUS },
      text:     { enabled: 'sem fundo · rótulo --primary-text', hover: 'fundo --hover · 6%', pressed: 'fundo --press · 12%', focus: FOCUS }
    };
    var out = {
      name: document.getElementById('state-name'),
      variant: document.getElementById('state-variant'),
      token: document.getElementById('state-token')
    };
    var show = function (btn, state) {
      out.name.textContent = state;
      out.variant.textContent = btn.dataset.label;
      out.token.textContent = TOKENS[btn.dataset.variant][state];
    };
    ranks.querySelectorAll('.btn').forEach(function (btn) {
      var focused = false;
      btn.addEventListener('pointerenter', function () { show(btn, 'hover'); });
      btn.addEventListener('pointerleave', function () { show(btn, focused ? 'focus' : 'enabled'); });
      btn.addEventListener('pointerdown', function () { show(btn, 'pressed'); });
      btn.addEventListener('pointerup', function () { show(btn, 'hover'); });
      btn.addEventListener('focus', function () { focused = btn.matches(':focus-visible'); if (focused) show(btn, 'focus'); });
      btn.addEventListener('blur', function () { focused = false; show(btn, 'enabled'); });
      btn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') show(btn, 'pressed'); });
      btn.addEventListener('keyup', function () { if (focused) show(btn, 'focus'); });
    });
    var targets = document.getElementById('targets-switch');
    targets.addEventListener('switch', function (e) { ranks.classList.toggle('show-targets', e.detail); });
  }

  /* ---------- Demo 3: validação no blur ou no envio, nunca a cada tecla */
  var form = document.getElementById('email-form');
  if (form) {
    var input = form.querySelector('input');
    var help = document.getElementById('email-help');
    var status = form.querySelector('.field__status');
    var sigs = document.querySelectorAll('.sig');
    var DEFAULT = help.innerHTML;

    var check = function (v) {
      v = v.trim();
      if (!v) return 'Informe um e-mail.';
      if (v.indexOf('@') < 0) return 'Falta o @.';
      var parts = v.split('@');
      if (parts.length > 2) return 'Use só um @.';
      if (!parts[0]) return 'Falta o nome antes do @.';
      if (!/^[^\s@]+\.[^\s@.]{2,}$/.test(parts[1])) return 'Falta o domínio depois do @.';
      if (/\s/.test(v)) return 'Tire os espaços.';
      return '';
    };
    var render = function (msg) {
      var bad = !!msg;
      input.setAttribute('aria-invalid', String(bad));
      status.hidden = bad;
      help.innerHTML = bad
        ? '<span class="icon" aria-hidden="true">error</span>' + msg
        : 'E-mail válido.';
      sigs.forEach(function (s) { s.classList.toggle('is-on', bad); });
      return !bad;
    };

    input.addEventListener('blur', function () { if (input.value.trim()) render(check(input.value)); });
    /* depois do erro, o campo reavalia ao digitar para tirar o erro assim que corrigido */
    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') render(check(input.value));
      else if (!status.hidden) { status.hidden = true; help.innerHTML = DEFAULT; }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!render(check(input.value))) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }
})();
