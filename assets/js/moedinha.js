/* opedro. — Portfolio 3.0 · case Moedinha
   A demonstração do app (cópia com dados de exemplo, sem PIN) roda dentro do celular.
   Ela só carrega quando a pessoa toca em "Abrir a demonstração" (não pesa a página nem prende a rolagem antes disso)
   e é desenhado em 393×852, escalado para caber no aparelho. */
(function () {
  Showcase.init(document.getElementById('main'));

  var screen = document.querySelector('.live__screen');
  if (!screen) return;
  var frame = screen.querySelector('iframe');
  var start = screen.querySelector('.live__start');

  function fit() { screen.style.setProperty('--s', screen.clientWidth / 393); }
  fit();
  window.addEventListener('resize', fit);

  start.addEventListener('click', function () {
    frame.src = frame.dataset.src;
    frame.addEventListener('load', function () { start.hidden = true; frame.focus(); }, { once: true });
    start.querySelector('b').textContent = 'Abrindo…';
  });
})();
