/* Tema escolhido em Ajustes (claro ou escuro). Roda no <head>, antes de pintar a tela,
   para o app não piscar no tema errado. Sem escolha salva, segue o tema do celular. */
(function () {
  var t = new URLSearchParams(location.search).get('theme');
  try { t = localStorage.getItem('cofrinho:theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') return;
  document.documentElement.setAttribute('data-theme', t);
  var c = t === 'dark' ? '#0B0B0B' : '#F7F7F4';
  document.querySelectorAll('meta[name=theme-color]').forEach(function (m) { m.setAttribute('content', c); });
})();
