/* Dia do salário: calcula as datas de pagamento do mês.
   Usado pelo app (index.html) e pelo service worker (sw.js).

   Regras aceitas (cfg.type):
     business      N-ésimo dia útil do mês (cfg.n, 1 a 10). O 5º dia útil é o prazo da CLT.
     fixed         Dia fixo (cfg.day, 1 a 31). Em meses mais curtos vira o último dia.
     lastBusiness  Último dia útil do mês.
     last          Último dia do mês.
   Opções:
     cfg.sat    sábado conta como dia útil (regra do Ministério do Trabalho para o 5º dia útil)
     cfg.early  dia fixo que cai em dia não útil é pago no dia útil anterior
     cfg.adv    também recebe adiantamento (vale) no dia cfg.advDay
   Dia útil = segunda a sexta (e sábado, se cfg.sat), fora dos feriados nacionais. */
(function (root) {
  'use strict';

  var FIXED = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
  var cache = {};

  function pad(n) { return String(n).padStart(2, '0'); }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Domingo de Páscoa (algoritmo de Meeus); Sexta-feira Santa = Páscoa − 2 dias
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  function holidays(y) {
    if (cache[y]) return cache[y];
    var set = {};
    FIXED.forEach(function (md) { set[y + '-' + md] = 1; });
    var e = easter(y);
    set[key(new Date(y, e.getMonth(), e.getDate() - 2))] = 1;
    return (cache[y] = set);
  }
  function isHoliday(d) { return !!holidays(d.getFullYear())[key(d)]; }
  function isBusiness(d, cfg) {
    var w = d.getDay();
    if (w === 0 || (w === 6 && !cfg.sat)) return false;
    return !isHoliday(d);
  }
  function lastDay(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function backToBusiness(d, cfg) {
    var x = new Date(d);
    for (var i = 0; i < 10 && !isBusiness(x, cfg); i++) x.setDate(x.getDate() - 1);
    return x;
  }
  function fixedDay(y, m, day, cfg) {
    var d = new Date(y, m, Math.min(day, lastDay(y, m)));
    return cfg.early ? backToBusiness(d, cfg) : d;
  }

  // Data principal do salário em um mês (m de 0 a 11)
  function main(cfg, y, m) {
    switch (cfg.type) {
      case 'business':
        var n = 0, last = lastDay(y, m);
        for (var day = 1; day <= last; day++) {
          var d = new Date(y, m, day);
          if (isBusiness(d, cfg) && ++n === cfg.n) return d;
        }
        return backToBusiness(new Date(y, m, last), cfg);
      case 'fixed': return fixedDay(y, m, cfg.day, cfg);
      case 'lastBusiness': return backToBusiness(new Date(y, m, lastDay(y, m)), cfg);
      case 'last': return new Date(y, m, lastDay(y, m));
    }
    return null;
  }

  // Todas as datas do mês: [{ date, kind: 'salario' | 'adiantamento' }], em ordem
  function month(cfg, y, m) {
    if (!cfg || !cfg.type) return [];
    var out = [], d = main(cfg, y, m);
    if (d) out.push({ date: d, kind: 'salario' });
    if (cfg.adv) {
      var a = fixedDay(y, m, cfg.advDay, cfg);
      if (!d || key(a) !== key(d)) out.push({ date: a, kind: 'adiantamento' });
    }
    return out.sort(function (p, q) { return p.date - q.date; });
  }

  // Próximas datas a partir de hoje (inclusive)
  function next(cfg, from, count) {
    var out = [], f = new Date(from); f.setHours(0, 0, 0, 0);
    for (var i = 0; i < 40 && out.length < count; i++) {
      month(cfg, f.getFullYear(), f.getMonth() + i).forEach(function (p) {
        if (p.date >= f && out.length < count) out.push(p);
      });
    }
    return out;
  }

  // Pagamento mais recente entre hoje e `days` dias atrás (para o aviso no app)
  function recent(cfg, today, days) {
    var t = new Date(today); t.setHours(0, 0, 0, 0);
    var min = new Date(t); min.setDate(min.getDate() - days);
    var list = month(cfg, t.getFullYear(), t.getMonth() - 1).concat(month(cfg, t.getFullYear(), t.getMonth()));
    var hit = null;
    list.forEach(function (p) { if (p.date <= t && p.date >= min) hit = p; });
    return hit;
  }

  function ord(n) { return n + 'º'; }
  function describe(cfg) {
    if (!cfg || !cfg.type) return '';
    var s = cfg.type === 'business' ? ord(cfg.n) + ' dia útil'
      : cfg.type === 'fixed' ? 'Todo dia ' + cfg.day
      : cfg.type === 'lastBusiness' ? 'Último dia útil' : 'Último dia do mês';
    return cfg.adv ? s + ' + vale no dia ' + cfg.advDay : s;
  }

  root.Payday = { key: key, month: month, next: next, recent: recent, describe: describe, isBusiness: isBusiness };
})(typeof self !== 'undefined' ? self : this);
