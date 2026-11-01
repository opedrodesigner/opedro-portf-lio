(function () {
  'use strict';

  var APP_VERSION = '2.9.3';

  var $ = function (id) { return document.getElementById(id); };
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var DATE = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  var TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  var MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  var TABS = ['resumo', 'gastos', 'dividas', 'cofrinho', 'compras'];
  var LS_KEY = 'cofrinho:v1';
  var LS_TAB = 'cofrinho:tab';
  var LS_THEME = 'cofrinho:theme';
  var DAY = 86400000;
  var PIN_LEN = 4;
  var AUTO_LOCK_MS = Infinity; /* demo do portfólio: nunca bloqueia */

  function money(n) { return BRL.format(isFinite(n) ? n : 0); }
  function fmt(n) { return n ? NUM.format(n) : ''; }
  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Nomes antigos (Material, também gravados no histórico) → Tabler outline
  var ICONS = { savings: 'pig-money', history: 'history', settings: 'settings', backspace: 'backspace', space_dashboard: 'layout-dashboard', receipt_long: 'receipt', credit_card: 'credit-card', shopping_cart: 'shopping-cart', add: 'plus', tune: 'adjustments-horizontal', expand_more: 'chevron-down', check: 'check', close: 'x', download: 'download', upload: 'upload', password: 'key', lock: 'lock', install_mobile: 'device-mobile-down', offline_pin: 'wifi-off', info: 'info-circle', delete_forever: 'trash-x', trending_down: 'trending-down', account_balance_wallet: 'wallet', arrow_forward: 'arrow-right', delete: 'trash', warning: 'alert-triangle', restart_alt: 'restore', lightbulb: 'bulb', backup: 'database-export', task_alt: 'circle-check', delete_sweep: 'trash', remove_done: 'square-off', sync: 'refresh', payments: 'cash', calendar_event: 'calendar-event', repeat: 'repeat', lock_reset: 'lock-open' };
  function icon(name, cls) { return '<svg class="ti' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#ti-' + (ICONS[name] || ICONS.history) + '"/></svg>'; }
  // Aceita "1.234,56", "1234,56", "1234.56" e "1.234".
  function parseBR(s) {
    s = String(s == null ? '' : s).replace(/[^\d.,]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  /* ---------- Banco de dados (IndexedDB, só neste aparelho) ----------
     kv:     'state' (dados atuais), 'pin' (hash do PIN), 'meta' (datas de backup)
     log:    uma linha por alteração feita no app
     months: resumo de cada mês, atualizado a cada salvamento */
  var DB = (function () {
    var NAME = 'meu-cofrinho', VER = 1, conn = null;
    function open() {
      if (conn) return conn;
      conn = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('no-idb')); return; }
        var r = indexedDB.open(NAME, VER);
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
          if (!d.objectStoreNames.contains('log')) d.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
          if (!d.objectStoreNames.contains('months')) d.createObjectStore('months', { keyPath: 'month' });
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { conn = null; rej(r.error); };
      });
      return conn;
    }
    function run(stores, mode, fn) {
      return open().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(stores, mode), out = fn(t);
          t.oncomplete = function () { res(out instanceof IDBRequest ? out.result : out); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      open: open,
      get: function (k) { return run(['kv'], 'readonly', function (t) { return t.objectStore('kv').get(k); }); },
      set: function (k, v) { return run(['kv'], 'readwrite', function (t) { t.objectStore('kv').put(v, k); }); },
      saveState: function (state, month) {
        return run(['kv', 'months'], 'readwrite', function (t) {
          t.objectStore('kv').put(state, 'state');
          t.objectStore('months').put(month);
        });
      },
      addLog: function (e) { return run(['log'], 'readwrite', function (t) { t.objectStore('log').add(e); }); },
      pageLog: function (limit, before) {
        return run(['log'], 'readonly', function (t) {
          var out = [], range = before ? IDBKeyRange.upperBound(before, true) : null;
          t.objectStore('log').openCursor(range, 'prev').onsuccess = function (e) {
            var c = e.target.result;
            if (c && out.length < limit) { out.push(c.value); c.continue(); }
          };
          return out;
        });
      },
      all: function (n) { return run([n], 'readonly', function (t) { return t.objectStore(n).getAll(); }); },
      replaceData: function (state, log, months) {
        return run(['kv', 'log', 'months'], 'readwrite', function (t) {
          t.objectStore('kv').put(state, 'state');
          var l = t.objectStore('log'), m = t.objectStore('months');
          l.clear(); m.clear();
          log.forEach(function (e) { l.add(e); });
          months.forEach(function (x) { m.put(x); });
        });
      },
      wipe: function () {
        return run(['kv', 'log', 'months'], 'readwrite', function (t) {
          ['kv', 'log', 'months'].forEach(function (n) { t.objectStore(n).clear(); });
        });
      }
    };
  })();

  /* ---------- Estado ---------- */
  function emptyState() {
    return { example: false, incomes: [], fixed: [], variable: [], debts: [], shopping: [],
      goal: { count: 200, mode: 'num', unit: 1, fixed: 10, marked: [] },
      payday: { type: null, n: 5, day: 30, adv: false, advDay: 20, sat: true, early: true, notify: false } };
  }
  function exampleState() {
    var s = emptyState();
    s.example = true;
    var cur = monthKey();
    s.incomes = [
      { id: uid(), name: 'Salário', amount: 3500, every: true, month: '' },
      { id: uid(), name: 'Freela de design', amount: 400, every: false, month: cur }
    ];
    s.fixed = [
      { id: uid(), name: 'Aluguel', amount: 900, due: 5, paid: cur },
      { id: uid(), name: 'Internet', amount: 100, due: 20, paid: '' },
      { id: uid(), name: 'Energia', amount: 120, due: 12, paid: cur },
      { id: uid(), name: 'Celular', amount: 60, due: 25, paid: '' }
    ];
    s.variable = [
      { id: uid(), name: 'Mercado', amount: 600 },
      { id: uid(), name: 'Transporte', amount: 250 },
      { id: uid(), name: 'Lazer', amount: 150 },
      { id: uid(), name: 'Delivery', amount: 120 }
    ];
    s.debts = [
      { id: uid(), name: 'Cartão de crédito', balance: 1800, payment: 300, paid: '', paidAmt: 0 },
      { id: uid(), name: 'Empréstimo', balance: 2400, payment: 200, paid: '', paidAmt: 0 }
    ];
    s.goal.marked = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    s.shopping = [
      { id: uid(), name: 'Arroz', done: true },
      { id: uid(), name: 'Feijão', done: true },
      { id: uid(), name: 'Leite', done: false },
      { id: uid(), name: 'Café', done: false },
      { id: uid(), name: 'Sabão em pó', done: false }
    ];
    return s;
  }
  function normList(a, keys) {
    if (!Array.isArray(a)) return [];
    return a.slice(0, 200).map(function (x) {
      x = x || {};
      var o = { id: String(x.id || uid()), name: String(x.name || '').slice(0, 80) };
      keys.forEach(function (k) { o[k] = num(x[k]); });
      return o;
    });
  }
  function normalize(r) {
    var e = emptyState();
    if (!r || typeof r !== 'object') return e;
    e.example = !!r.example;
    var ym = function (v) { return /^\d{4}-\d{2}$/.test(v) ? v : ''; };
    var src = function (k) { return Array.isArray(r[k]) ? r[k] : []; };
    // Entradas: versões antigas tinham um único "salary", que vira a primeira entrada
    if (Array.isArray(r.incomes)) {
      var oldest = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 13, 1));
      e.incomes = normList(r.incomes, ['amount']).map(function (x, i) {
        var o = r.incomes[i] || {};
        x.every = o.every !== false; x.month = x.every ? '' : ym(o.month) || monthKey();
        return x;
      }).filter(function (x) { return x.every || x.month >= oldest; });
    } else if (num(r.salary) > 0) {
      e.incomes = [{ id: uid(), name: 'Salário', amount: num(r.salary), every: true, month: '' }];
    }
    e.fixed = normList(r.fixed, ['amount']).map(function (x, i) {
      var o = src('fixed')[i] || {}, d = parseInt(o.due, 10);
      x.due = d >= 1 && d <= 31 ? d : 0; x.paid = ym(o.paid);
      return x;
    });
    e.variable = normList(r.variable, ['amount']);
    e.debts = normList(r.debts, ['balance', 'payment', 'paidAmt']).map(function (x, i) {
      x.paid = ym((src('debts')[i] || {}).paid);
      return x;
    });
    e.shopping = (Array.isArray(r.shopping) ? r.shopping : []).slice(0, 300).map(function (x) {
      x = x || {};
      return { id: String(x.id || uid()), name: String(x.name || '').slice(0, 80), done: !!x.done };
    });
    var g = r.goal || {};
    e.goal.count = Math.min(500, Math.max(1, parseInt(g.count, 10) || 200));
    e.goal.mode = g.mode === 'fixed' ? 'fixed' : 'num';
    e.goal.unit = num(g.unit) || 1;
    e.goal.fixed = num(g.fixed) || 10;
    e.goal.marked = (Array.isArray(g.marked) ? g.marked : [])
      .map(Number)
      .filter(function (n, i, a) { return n >= 1 && n <= 500 && n % 1 === 0 && a.indexOf(n) === i; });
    var p = r.payday || {}, d = e.payday;
    var int = function (v, lo, hi, def) { v = parseInt(v, 10); return v >= lo && v <= hi ? v : def; };
    d.type = ['business', 'fixed', 'lastBusiness', 'last'].indexOf(p.type) > -1 ? p.type : null;
    d.n = int(p.n, 1, 10, 5); d.day = int(p.day, 1, 31, 30); d.advDay = int(p.advDay, 1, 31, 20);
    d.adv = !!p.adv; d.sat = p.sat !== false; d.early = p.early !== false; d.notify = !!p.notify;
    return e;
  }

  var S = exampleState();
  var currentTab = 'resumo';
  var resetAsk = false;
  var booted = false;
  var meta = {};

  /* ---------- Salvamento ---------- */
  var timer = null;
  var saving = Promise.resolve();

  function lsGet() { try { var r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function setStatus(k) {
    var t = {
      saving: ['sync', 'Salvando…'],
      saved: ['task_alt', 'Salvo'],
      error: ['warning', 'Erro ao salvar']
    }[k];
    $('status').innerHTML = t ? icon(t[0]) + '<span>' + t[1] + '</span>' : '';
    $('status').title = t ? t[1] + ' neste aparelho' : '';
  }
  function monthKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthSnap() {
    var c = calc(), g = goalTotals();
    return { month: monthKey(), salary: c.inc, extras: c.extra, fixed: c.f, variable: c.v, debtPay: c.dp, debtBal: c.db,
      left: Math.round(c.left * 100) / 100, saved: g.saved, updatedAt: Date.now() };
  }
  function schedule() {
    if (!booted) return;
    setStatus('saving');
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  function flush() {
    if (timer === null) return saving;
    clearTimeout(timer);
    timer = null;
    saving = saving.then(function () { return DB.saveState(S, monthSnap()); })
      .then(function () { setStatus('saved'); }, function () { setStatus('error'); });
    return saving;
  }

  /* ---------- Histórico de alterações ---------- */
  var KL = {
    incomes: { n: 'Entrada', add: 'Nova entrada', del: 'Entrada removida', i: 'payments' },
    fixed: { n: 'Conta fixa', add: 'Nova conta fixa', del: 'Conta fixa removida', i: 'receipt_long' },
    variable: { n: 'Previsão', add: 'Nova previsão de gasto', del: 'Previsão removida', i: 'receipt_long' },
    debts: { n: 'Dívida', add: 'Nova dívida', del: 'Dívida removida', i: 'credit_card' },
    shopping: { n: 'Item', add: 'Novo item na lista', del: 'Item removido da lista', i: 'shopping_cart' }
  };
  var FIELD = { amount: 'valor', balance: 'saldo devedor', payment: 'parcela' };

  function addLog(i, t) {
    if (!booted) return;
    DB.addLog({ ts: Date.now(), i: i, t: t }).catch(function () {});
  }
  function logItem(kind, a, b) {
    var k = KL[kind], nm = b.name || a.name || 'sem nome';
    if (a.name !== b.name) {
      if (!a.name.trim()) addLog(k.i, k.add + ': ' + b.name);
      else addLog(k.i, k.n + ' · nome: ' + a.name + ' → ' + (b.name || 'sem nome'));
    }
    Object.keys(FIELD).forEach(function (f) {
      if (f in b && a[f] !== b[f]) addLog(k.i, k.n + ' · ' + nm + ' · ' + FIELD[f] + ': ' + money(a[f]) + ' → ' + money(b[f]));
    });
  }

  // Valor do campo no momento em que ganhou foco, para registrar "antes → depois".
  var snap = null;
  function takeSnap(t) {
    snap = null;
    if (!t || t.tagName !== 'INPUT') return;
    if (t.id === 'goalCount') snap = { v: S.goal.count };
    else if (t.id === 'goalBase') snap = { v: S.goal.mode === 'num' ? S.goal.unit : S.goal.fixed };
    else {
      var row = t.closest('.row, .bill, .shop');
      var it = row && find(S[row.dataset.kind] || [], row.dataset.id);
      if (it) snap = { item: Object.assign({}, it) };
    }
    if (snap) snap.el = t;
  }

  /* ---------- Cálculos ---------- */
  function sum(a, k) { return a.reduce(function (t, x) { return t + (x[k] || 0); }, 0); }
  // Entradas que valem neste mês: as de todo mês e os extras lançados neste mês
  function incomesNow() { var m = monthKey(); return S.incomes.filter(function (x) { return x.every || x.month === m; }); }
  // Parcela conta no mês enquanto há saldo, ou se já foi paga neste mês
  function debtsNow() { var m = monthKey(); return S.debts.filter(function (x) { return x.balance > 0 || x.paid === m; }); }
  function calc() {
    var now = incomesNow(), inc = sum(now, 'amount');
    var extra = sum(now.filter(function (x) { return !x.every; }), 'amount');
    var f = sum(S.fixed, 'amount'), v = sum(S.variable, 'amount');
    var dp = sum(debtsNow(), 'payment'), db = sum(S.debts, 'balance');
    var spent = f + v + dp;
    return { inc: inc, extra: extra, nExtra: now.length - now.filter(function (x) { return x.every; }).length,
      f: f, v: v, dp: dp, db: db, spent: spent, left: inc - spent };
  }
  function lastDayOf(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  // Situação de uma conta fixa neste mês
  function billInfo(x) {
    var t = new Date(), today = t.getDate();
    if (x.paid === monthKey()) return { k: 'ok', t: 'Paga este mês' };
    if (!x.due) return { k: '', t: '' };
    var d = Math.min(x.due, lastDayOf(t)), diff = d - today;
    if (diff < 0) return { k: 'late', t: 'Atrasada · venceu dia ' + d, d: d };
    return { k: diff <= 3 ? 'soon' : '', t: diff === 0 ? 'Vence hoje' : diff === 1 ? 'Vence amanhã' : 'Vence dia ' + d, d: d };
  }
  function billsTotals() {
    var m = monthKey(), paid = S.fixed.filter(function (x) { return x.paid === m; });
    var open = S.fixed.filter(function (x) { return x.paid !== m; });
    var late = open.filter(function (x) { return billInfo(x).k === 'late'; });
    var next = open.filter(function (x) { return x.due && billInfo(x).k !== 'late'; })
      .sort(function (a, b) { return billInfo(a).d - billInfo(b).d; })[0];
    return { n: S.fixed.length, paid: paid.length, open: sum(open, 'amount'), late: late, next: next };
  }
  function dueItems() {
    var m = monthKey(), out = [];
    S.fixed.forEach(function (x) {
      var st = billInfo(x);
      out.push({ kind: 'fixed', act: 'bill-paid', x: x, amount: x.amount, paid: x.paid === m,
        late: st.k === 'late', d: st.d || 99, t: x.paid === m ? 'Paga' : st.t || 'Conta fixa' });
    });
    S.debts.forEach(function (x) {
      if (!(x.payment > 0) || !(x.balance > 0 || x.paid === m)) return;
      var n = parcelsLeft(x);
      out.push({ kind: 'debts', act: 'debt-paid', x: x, amount: x.paid === m ? x.paidAmt : Math.min(x.payment, x.balance),
        paid: x.paid === m, late: false, d: 100, t: x.paid === m ? 'Parcela paga' : 'Parcela · ' + (n === 1 ? 'última' : 'faltam ' + n) });
    });
    return out.sort(function (a, b) { return (a.paid - b.paid) || (b.late - a.late) || (a.d - b.d); });
  }
  function dueHTML() {
    var list = dueItems(), paid = list.filter(function (i) { return i.paid; }), open = list.filter(function (i) { return !i.paid; });
    var late = open.filter(function (i) { return i.late; }), next = open.filter(function (i) { return !i.late && i.d < 99; })[0];
    var sub = !list.length ? 'Cadastre suas contas fixas na aba Mês para acompanhar o que já pagou.'
      : !open.length ? 'Tudo pago este mês.'
      : 'Faltam ' + money(sum(open, 'amount')) + (late.length ? ' · ' + (late.length === 1 ? '1 atrasada' : late.length + ' atrasadas')
        : next ? ' · próxima: ' + (next.x.name || 'sem nome') + ', dia ' + next.d : '');
    var rows = list.map(function (i) {
      var nm = i.x.name || 'sem nome';
      return '<li class="due-row' + (i.paid ? ' paid' : '') + (i.late ? ' late' : '') + '">' +
        '<button type="button" class="chk sl" role="checkbox" aria-checked="' + (i.paid ? 'true' : 'false') + '" data-action="' + i.act + '" data-id="' + i.x.id + '" aria-label="' + esc((i.kind === 'debts' ? 'Paguei a parcela de ' : 'Paguei ') + nm) + '"><span class="box">' + icon('check') + '</span></button>' +
        '<span class="due-t"><b>' + esc(nm) + '</b><small>' + i.t + '</small></span><span class="num due-v">' + money(i.amount) + '</span></li>';
    }).join('');
    return '<div class="panel due-card' + (late.length ? ' late' : '') + '">' +
      '<div class="sec-head"><div><p class="eyebrow">' + icon('receipt_long') + 'A pagar este mês</p>' +
      '<p class="mid">' + (list.length ? paid.length + ' de ' + list.length + (list.length === 1 ? ' pago' : ' pagos') : '—') + '</p></div></div>' +
      '<p class="small muted due-sub">' + sub + '</p>' + (rows ? '<ul class="due-list">' + rows + '</ul>' : '') + '</div>';
  }
  function parcelsLeft(x) { return x.payment > 0 && x.balance > 0 ? Math.ceil(x.balance / x.payment - 1e-9) : 0; }
  // Mês da última parcela: se a deste mês já foi paga, a próxima é no mês que vem
  function debtEnd(x) {
    var n = parcelsLeft(x);
    if (!n) return null;
    var t = new Date();
    return new Date(t.getFullYear(), t.getMonth() + n - (x.paid === monthKey() ? 0 : 1), 1);
  }
  function debtInfo(x) {
    if (x.balance <= 0 && (x.name || x.payment)) return { k: 'ok', t: 'Quitada!' };
    if (!x.payment) return { k: '', t: x.balance ? 'Informe a parcela para ver quando termina.' : '' };
    var n = parcelsLeft(x), end = debtEnd(x);
    return { k: x.paid === monthKey() ? 'ok' : '', t: (x.paid === monthKey() ? 'Parcela deste mês paga · ' : '') +
      (n === 1 ? 'falta 1 parcela' : 'faltam ' + n + ' parcelas') + (end ? ' · termina em ' + MONTH.format(end) : '') };
  }
  function sqVal(n) { return S.goal.mode === 'num' ? n * S.goal.unit : S.goal.fixed; }
  function goalTotals() {
    var c = S.goal.count, saved = 0, cnt = 0;
    S.goal.marked.forEach(function (n) { if (n <= c) { cnt++; saved += sqVal(n); } });
    var target = S.goal.mode === 'num' ? S.goal.unit * c * (c + 1) / 2 : S.goal.fixed * c;
    return { saved: saved, target: target, cnt: cnt, count: c };
  }
  function pct(x) { var inc = calc().inc; return inc > 0 ? Math.round(x / inc * 100) + '%' : '—'; }

  /* ---------- Renderização ---------- */
  function renderSummary() {
    var c = calc(), g = goalTotals(), sal = c.inc;
    var left = Math.round(c.left * 100) / 100, neg = left < 0;
    var denom = Math.max(sal, c.spent);
    var segs = [
      { l: 'Contas fixas', v: c.f, c: 'var(--cat-fixed)' },
      { l: 'Variáveis (previsão)', v: c.v, c: 'var(--cat-var)' },
      { l: 'Parcelas de dívidas', v: c.dp, c: 'var(--cat-debt)' },
      { l: 'Sobra', v: Math.max(left, 0), c: 'var(--cat-left)', k: 'left' }
    ];
    var bar = denom > 0 ? segs.filter(function (s) { return s.v > 0; }).map(function (s) {
      return '<i' + (s.k ? ' class="' + s.k + '"' : '') + ' style="width:' + (s.v / denom * 100).toFixed(2) + '%;background:' + s.c + '"></i>';
    }).join('') : '';
    var legend = segs.map(function (s) {
      return '<li><span class="dot' + (s.k ? ' ' + s.k : '') + '" style="background:' + s.c + '"></span><span>' + s.l + '</span>' +
        '<span class="num">' + money(s.v) + '</span><span class="num muted pc">' + pct(s.v) + '</span></li>';
    }).join('');
    var extras = c.nExtra ? ' (' + money(c.extra) + (c.nExtra === 1 ? ' de extra' : ' de extras') + ')' : '';
    var sub = sal <= 0 ? 'Informe suas entradas na aba Mês para ver quanto sobra.'
      : neg ? 'Os gastos passam das entradas de ' + money(sal) + extras + '.'
      : 'de ' + money(sal) + ' de entradas' + extras + ' · ' + Math.round(c.spent / sal * 100) + '% já tem destino';
    var ends = S.debts.map(debtEnd).filter(Boolean).sort(function (a, b) { return b - a; })[0];
    var gp = g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0;

    $('summary').innerHTML =
      '<div class="hero panel">' +
        '<div><p class="eyebrow">' + icon(neg ? 'trending_down' : 'account_balance_wallet') + (neg ? 'Vai faltar no mês' : 'Sobra prevista') + '</p>' +
        '<p class="big' + (neg ? ' neg' : '') + '">' + money(neg ? -left : left) + '</p>' +
        '<p class="muted small">' + sub + '</p></div>' +
        '<div class="bar" role="img" aria-label="Divisão das entradas entre contas fixas, variáveis, parcelas e sobra">' + bar + '</div>' +
        '<ul class="legend">' + legend + '</ul>' +
      '</div>' +
      dueHTML() +
      '<div class="duo">' +
        '<button type="button" class="stat stat-link sl" data-action="tab" data-tab="dividas">' +
          '<span class="go"><span class="eyebrow">' + icon('credit_card') + 'Dívidas</span>' + icon('arrow_forward') + '</span>' +
          '<p class="mid">' + money(c.db) + '</p>' +
          '<p class="small muted">' + (S.debts.length ? money(c.dp) + ' por mês' + (ends ? ' · a última termina em ' + MONTH.format(ends) : '') : 'Nenhuma dívida cadastrada') + '</p></button>' +
        '<button type="button" class="stat goal-card sl" data-action="tab" data-tab="cofrinho">' +
          '<span class="go"><span class="eyebrow">' + icon('savings') + 'Guardar</span>' + icon('arrow_forward') + '</span>' +
          '<p class="mid">' + money(g.saved) + '</p>' +
          '<p class="small muted">' + g.cnt + ' de ' + g.count + ' quadrados · meta ' + money(g.target) + '</p>' +
          '<span class="progress"><i style="width:' + gp.toFixed(1) + '%"></i></span></button>' +
      '</div>' +
      '<button type="button" class="btn text sl months-link" data-action="history">' + icon('history') + 'Meses anteriores</button>';
  }

  function renderGoalStats() {
    var g = goalTotals();
    var gp = g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0;
    $('goalStats').innerHTML =
      '<div><p class="eyebrow">Guardado até agora</p><p class="big pink">' + money(g.saved) + '</p>' +
      '<p class="muted small">de ' + money(g.target) + ' · ' + g.cnt + ' de ' + g.count + ' quadrados marcados</p></div>' +
      '<div class="progress lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(gp) + '"><i style="width:' + gp.toFixed(1) + '%"></i></div>';
    var hint;
    if (S.goal.mode === 'num') {
      var ex = Math.min(37, g.count);
      hint = 'Exemplo: o quadrado ' + ex + ' vale ' + money(ex * S.goal.unit) + ' (' + ex + ' × ' + money(S.goal.unit) + '). Marcando todos você junta ' + money(g.target) + '.';
    } else {
      hint = 'Cada quadrado vale ' + money(S.goal.fixed) + '. Marcando todos você junta ' + money(g.target) + '.';
    }
    $('goalHint').textContent = hint;
  }

  function renderTotals() {
    var c = calc();
    var bt = billsTotals(), m = monthKey();
    $('incTotal').textContent = money(c.inc);
    $('fixedTotal').textContent = money(c.f);
    $('fixedStatus').textContent = bt.n ? bt.paid + ' de ' + bt.n + (bt.n === 1 ? ' paga' : ' pagas') + ' este mês' + (bt.open ? ' · faltam ' + money(bt.open) : '') : '';
    var dn = S.debts.filter(function (x) { return x.payment > 0 && (x.balance > 0 || x.paid === m); });
    var dpd = dn.filter(function (x) { return x.paid === m; }).length;
    $('debtStatus').textContent = dn.length ? dpd + ' de ' + dn.length + (dn.length === 1 ? ' parcela paga' : ' parcelas pagas') + ' este mês' : '';
    $('varTotal').textContent = money(c.v);
    $('debtBal').textContent = money(c.db);
    $('debtPay').textContent = money(c.dp);
  }

  function delBtn(label) {
    return '<button type="button" class="del sl" data-action="del" aria-label="Remover ' + esc(label) + '">' + icon('delete') + '</button>';
  }
  var MONTH_ONLY = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
  function recLabel(x) { return x.every ? 'Todo mês' : 'Só em ' + MONTH_ONLY.format(new Date(+x.month.slice(0, 4), +x.month.slice(5, 7) - 1, 1)); }
  function incHTML(x) {
    return '<li class="row inc" data-kind="incomes" data-id="' + x.id + '">' +
      '<input class="name" id="incomes-' + x.id + '-n" type="text" maxlength="80" autocomplete="off" aria-label="Nome da entrada" placeholder="' + (x.every ? 'Ex.: Salário' : 'Ex.: Freela') + '" value="' + esc(x.name) + '">' +
      '<input class="amt" id="incomes-' + x.id + '-a" type="text" inputmode="decimal" autocomplete="off" aria-label="Valor em reais" placeholder="0,00" value="' + fmt(x.amount) + '">' +
      delBtn(x.name || 'entrada') +
      '<button type="button" class="rec-tag sl' + (x.every ? '' : ' once') + '" data-action="inc-rec" aria-label="' + recLabel(x) + '. Tocar para trocar">' +
        icon(x.every ? 'repeat' : 'calendar_event') + recLabel(x) + '</button></li>';
  }
  function chkBtn(action, on, label) {
    return '<button type="button" class="chk sl" role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '" data-action="' + action + '" aria-label="' + esc(label) + '"><span class="box">' + icon('check') + '</span></button>';
  }
  function billHTML(x) {
    var st = billInfo(x), opts = '<option value="0">Sem dia</option>';
    for (var d = 1; d <= 31; d++) opts += '<option value="' + d + '"' + (x.due === d ? ' selected' : '') + '>Dia ' + d + '</option>';
    return '<li class="bill" data-kind="fixed" data-id="' + x.id + '">' +
      '<div class="bill-top">' + chkBtn('bill-paid', st.k === 'ok', 'Paguei ' + (x.name || 'esta conta') + ' este mês') +
        '<input class="name" id="fixed-' + x.id + '-n" type="text" maxlength="80" autocomplete="off" aria-label="Nome da conta" placeholder="Ex.: Aluguel" value="' + esc(x.name) + '">' +
        delBtn(x.name || 'gasto') + '</div>' +
      '<div class="bill-nums">' +
        '<label><span class="lab">Valor</span><input class="amt" id="fixed-' + x.id + '-a" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + fmt(x.amount) + '"></label>' +
        '<label><span class="lab">Vence</span><select class="sel due" data-layout="days" id="fixed-' + x.id + '-d">' + opts + '</select></label>' +
      '</div>' +
      '<p class="bill-st ' + st.k + '">' + st.t + '</p></li>';
  }
  function rowHTML(kind, x) {
    var ph = kind === 'fixed' ? 'Ex.: Aluguel' : 'Ex.: Mercado';
    return '<li class="row" data-kind="' + kind + '" data-id="' + x.id + '">' +
      '<input class="name" id="' + kind + '-' + x.id + '-n" type="text" maxlength="80" autocomplete="off" aria-label="Nome do gasto" placeholder="' + ph + '" value="' + esc(x.name) + '">' +
      '<input class="amt" id="' + kind + '-' + x.id + '-a" type="text" inputmode="decimal" autocomplete="off" aria-label="Valor em reais" placeholder="0,00" value="' + fmt(x.amount) + '">' +
      delBtn(x.name || 'gasto') + '</li>';
  }
  function debtHTML(x) {
    var st = debtInfo(x), n = parcelsLeft(x);
    return '<li class="bill debt' + (x.balance <= 0 && (x.name || x.payment) ? ' done' : '') + '" data-kind="debts" data-id="' + x.id + '">' +
      '<div class="bill-top">' + chkBtn('debt-paid', x.paid === monthKey(), 'Paguei a parcela de ' + (x.name || 'esta dívida') + ' deste mês') +
        '<input class="name" id="debts-' + x.id + '-n" type="text" maxlength="80" autocomplete="off" aria-label="Nome da dívida" placeholder="Ex.: Cartão de crédito" value="' + esc(x.name) + '">' +
        delBtn(x.name || 'dívida') +
      '</div>' +
      '<div class="bill-nums three">' +
        '<label><span class="lab">Parcela</span><input class="pay" id="debts-' + x.id + '-p" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + fmt(x.payment) + '"></label>' +
        '<label><span class="lab">Faltam</span><input class="left" id="debts-' + x.id + '-l" type="text" inputmode="numeric" autocomplete="off" placeholder="—" value="' + (n || '') + '"' + (x.payment > 0 ? '' : ' disabled') + ' aria-label="Parcelas que faltam"></label>' +
        '<label><span class="lab">Saldo</span><input class="bal" id="debts-' + x.id + '-b" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + fmt(x.balance) + '" aria-label="Saldo devedor"></label>' +
      '</div>' +
      '<p class="bill-st ' + st.k + '">' + st.t + '</p></li>';
  }
  // Atualiza só os textos de situação, sem recriar os campos (não perde o foco)
  function renderStatus(li) {
    var it = li && find(S[li.dataset.kind] || [], li.dataset.id);
    if (!it) return;
    var st = li.dataset.kind === 'debts' ? debtInfo(it) : billInfo(it), p = li.querySelector('.bill-st');
    if (p) { p.className = 'bill-st ' + st.k; p.textContent = st.t; }
    if (li.dataset.kind === 'debts') {
      var l = li.querySelector('.left'), b = li.querySelector('.bal');
      l.disabled = !(it.payment > 0);
      if (document.activeElement !== l) l.value = parcelsLeft(it) || '';
      if (document.activeElement !== b) b.value = fmt(it.balance);
      li.classList.toggle('done', it.balance <= 0 && !!(it.name || it.payment));
    }
  }
  function renderLists() {
    var m = monthKey(), inc = S.incomes.filter(function (x) { return x.every || x.month === m; });
    $('incomesList').innerHTML = inc.length ? inc.map(incHTML).join('') : '<li class="empty">Nenhuma entrada ainda. Comece pelo seu salário.</li>';
    $('fixedList').innerHTML = S.fixed.length ? S.fixed.map(billHTML).join('') : '<li class="empty">Nenhuma conta fixa ainda.</li>';
    $('variableList').innerHTML = S.variable.length ? S.variable.map(function (x) { return rowHTML('variable', x); }).join('') : '<li class="empty">Nenhuma previsão ainda. Ex.: mercado, transporte, lazer.</li>';
    $('debtsList').innerHTML = S.debts.length ? S.debts.map(debtHTML).join('') : '<li class="empty">Nenhuma dívida cadastrada.</li>';
  }

  function buildGrid() {
    var set = {}, h = [], n;
    S.goal.marked.forEach(function (m) { set[m] = 1; });
    for (n = 1; n <= S.goal.count; n++) {
      h.push('<button type="button" class="sq sl" data-n="' + n + '" aria-pressed="' + (set[n] ? 'true' : 'false') + '" aria-label="Quadrado ' + n + '">' + n + '</button>');
    }
    $('grid').innerHTML = h.join('');
  }
  function renderGoalSettings() {
    $('goalCount').value = S.goal.count;
    document.querySelectorAll('[data-action=mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.mode === S.goal.mode ? 'true' : 'false');
    });
    $('baseLabel').textContent = S.goal.mode === 'num' ? 'Valor de cada unidade (R$)' : 'Valor de cada quadrado (R$)';
    $('goalBase').value = fmt(S.goal.mode === 'num' ? S.goal.unit : S.goal.fixed);
  }
  function renderReset() {
    $('resetBox').innerHTML = resetAsk
      ? '<div class="banner warn">' + icon('warning') + '<p>Desmarcar todos os quadrados? Os valores guardados voltam a zero.</p><div class="banner-actions"><button type="button" class="btn text sl" data-action="reset-no">Cancelar</button><button type="button" class="btn danger sl" data-action="reset-yes">Desmarcar tudo</button></div></div>'
      : '<button type="button" class="btn sl" data-action="reset-ask">' + icon('restart_alt') + 'Desmarcar todos os quadrados</button>';
  }
  function backupDue() {
    if (!booted || !meta.createdAt) return 0;
    var now = Date.now();
    if (meta.snoozeUntil && meta.snoozeUntil > now) return 0;
    var days = Math.floor((now - (meta.lastBackup || meta.createdAt)) / DAY);
    return days >= 14 ? days : 0;
  }
  function renderBanner() {
    var due = backupDue();
    var pb = S.example ? '' : payBanner();
    if (S.example) {
      $('banner').innerHTML = '<div class="banner">' + icon('lightbulb') + '<p>Estes valores são um exemplo para você ver como o app funciona.</p><div class="banner-actions"><button type="button" class="btn text sl" data-action="keep-example">Manter</button><button type="button" class="btn primary sl" data-action="clear-example">Começar do zero</button></div></div>';
    } else if (pb) {
      $('banner').innerHTML = pb;
    } else if (due) {
      var msg = (meta.lastBackup ? 'Faz ' + due + ' dias desde o seu último backup.' : 'Você ainda não fez nenhum backup.') +
        ' Seus dados ficam só neste celular, então vale guardar uma cópia.';
      $('banner').innerHTML = '<div class="banner">' + icon('backup') + '<p>' + msg + '</p><div class="banner-actions"><button type="button" class="btn text sl" data-action="backup-later">Depois</button><button type="button" class="btn primary sl" data-action="export">Fazer backup</button></div></div>';
    } else {
      $('banner').innerHTML = '';
    }
  }
  function shopHTML(x) {
    return '<li class="shop' + (x.done ? ' done' : '') + '" data-kind="shopping" data-id="' + x.id + '">' +
      '<button type="button" class="chk sl" role="checkbox" aria-checked="' + (x.done ? 'true' : 'false') + '" data-action="check" aria-label="Marcar como comprado"><span class="box">' + icon('check') + '</span></button>' +
      '<input class="name" id="shopping-' + x.id + '-n" type="text" maxlength="80" autocomplete="off" aria-label="Nome do item" value="' + esc(x.name) + '">' +
      delBtn(x.name || 'item') + '</li>';
  }
  function updateShopStats() {
    var total = S.shopping.length;
    var done = S.shopping.filter(function (x) { return x.done; }).length;
    var p = total ? done / total * 100 : 0;
    $('shopStats').innerHTML = total
      ? '<div class="stat"><p class="eyebrow">' + icon('task_alt') + 'Comprados</p><p class="mid">' + done + ' de ' + total + (total === 1 ? ' item' : ' itens') + '</p><span class="progress"><i style="width:' + p.toFixed(1) + '%"></i></span></div>'
      : '';
    $('shopActions').innerHTML = done
      ? '<button type="button" class="btn tonal sl" data-action="shop-clear">' + icon('delete_sweep') + 'Remover comprados</button><button type="button" class="btn sl" data-action="shop-uncheck">' + icon('remove_done') + 'Desmarcar tudo</button>'
      : '';
  }
  function renderShopping() {
    $('shopList').innerHTML = S.shopping.length
      ? S.shopping.map(shopHTML).join('')
      : '<li class="empty">Nada na lista ainda. Escreva um item acima e toque em Adicionar.</li>';
    updateShopStats();
  }
  function refresh() { renderSummary(); renderTotals(); renderGoalStats(); }
  function renderAll() {
    renderBanner(); renderPaySummary(); renderLists(); renderShopping(); renderGoalSettings(); buildGrid(); renderReset(); refresh();
    setTab(currentTab, true);
  }

  function setTab(t, quiet) {
    if (TABS.indexOf(t) < 0) t = 'resumo';
    currentTab = t;
    TABS.forEach(function (k) { $('tab-' + k).hidden = k !== t; });
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false');
    });
    try { localStorage.setItem(LS_TAB, t); } catch (e) {}
    if (!quiet) window.scrollTo(0, 0);
  }

  function changed() { refresh(); schedule(); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  /* ---------- Diálogos e snackbar ---------- */
  function confirmBox(o) {
    return new Promise(function (res) {
      var d = $('confirmDlg'), ok = $('cfOk');
      $('cfIcon').setAttribute('href', '#ti-' + (ICONS[o.icon] || ICONS.info));
      $('cfTitle').textContent = o.title;
      $('cfText').textContent = o.text || '';
      ok.textContent = o.ok || 'OK';
      ok.className = 'btn sl ' + (o.danger ? 'danger' : 'primary');
      $('cfNo').hidden = o.cancel === false;
      d.classList.toggle('warn', !!o.danger);
      d.returnValue = '';
      d.addEventListener('close', function () { res(d.returnValue === 'yes'); }, { once: true });
      d.showModal();
    });
  }
  function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); }); }

  var snackT = null;
  function snack(text, action, fn, ms) {
    var a = $('snackAct');
    $('snackText').textContent = text;
    a.hidden = !action;
    a.textContent = action || '';
    a.onclick = action ? function () { hideSnack(); fn(); } : null;
    $('snack').hidden = false;
    clearTimeout(snackT);
    if (ms !== 0) snackT = setTimeout(hideSnack, ms || 4000);
  }
  function hideSnack() { $('snack').hidden = true; }

  /* ---------- PIN ----------
     O PIN nunca é guardado: só um hash PBKDF2 com sal aleatório. */
  var L = { mode: 'loading', buf: '', first: '', tick: null };
  var pinRec = null;
  var LOCK_TEXT = {
    loading: ['Moedinha', 'Abrindo…'],
    error: ['Moedinha', ''],
    setup1: ['Crie seu PIN', 'É a primeira vez que você abre a Moedinha, então ainda não existe PIN. Escolha 4 números para proteger seus dados neste celular.'],
    setup2: ['Confirme seu PIN', 'Digite os mesmos 4 números de novo, só para ter certeza.'],
    unlock: ['Moedinha', 'Digite seu PIN para entrar.'],
    old: ['Trocar PIN', 'Digite o PIN atual.'],
    new1: ['Escolha o novo PIN', 'São 4 números. Eles vão substituir o PIN atual.'],
    new2: ['Confirme o novo PIN', 'Digite os mesmos 4 números de novo.']
  };

  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  async function derive(pin, salt, iter) {
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, key, 256));
  }
  async function savePin(pin) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iter = 150000;
    pinRec = { salt: b64(salt), hash: await derive(pin, salt, iter), iter: iter, len: PIN_LEN, fails: 0, until: 0 };
    await DB.set('pin', pinRec);
  }
  async function checkPin(pin) { return (await derive(pin, unb64(pinRec.salt), pinRec.iter)) === pinRec.hash; }
  function waitLeft() { return pinRec && pinRec.until ? Math.max(0, pinRec.until - Date.now()) : 0; }

  function renderDots() {
    var n = L.buf.length;
    $('pinDots').querySelectorAll('i').forEach(function (d, i) { d.classList.toggle('on', i < n); });
  }
  function lockRender(msg) {
    var t = LOCK_TEXT[L.mode], showPad = L.mode !== 'loading' && L.mode !== 'error', alt = $('lockAlt');
    $('lockTitle').textContent = t[0];
    $('lockSub').textContent = t[1];
    $('pinMsg').textContent = msg || '';
    $('keypad').hidden = !showPad;
    $('pinDots').hidden = !showPad;
    $('keypad').classList.toggle('off', waitLeft() > 0);
    renderDots();
    // Criar PIN tem cara de configuração (passo 1 e 2, lima), não de "digite sua senha"
    var setup = /^(setup|new)[12]$/.test(L.mode), two = /2$/.test(L.mode);
    $('lock').classList.toggle('setup', setup);
    $('lockStep').textContent = setup ? 'Passo ' + (two ? 2 : 1) + ' de 2' : '';
    $('lockSteps').querySelectorAll('i').forEach(function (b, i) { b.classList.toggle('on', i === 0 || two); });
    var hint = setup && !two ? 'Dica: evite sequências como 1234 ou 0000 e o ano em que você nasceu.' : '';
    $('lockHintT').textContent = hint;
    $('lockHint').classList.toggle('on', !!hint);
    if (L.mode === 'unlock') { alt.hidden = false; alt.textContent = 'Esqueci meu PIN'; alt.dataset.do = 'forgot'; }
    else if (two) { alt.hidden = false; alt.textContent = 'Escolher outro PIN'; alt.dataset.do = 'restart'; }
    else if (L.mode === 'old' || L.mode === 'new1') { alt.hidden = false; alt.textContent = 'Cancelar'; alt.dataset.do = 'cancel'; }
    else alt.hidden = true;
  }
  function startWaitTick() {
    clearInterval(L.tick);
    if (waitLeft() <= 0) return;
    var upd = function () {
      var s = Math.ceil(waitLeft() / 1000);
      if (s <= 0) { clearInterval(L.tick); lockRender(); return; }
      $('keypad').classList.add('off');
      $('pinMsg').textContent = 'Muitas tentativas erradas. Tente de novo em ' + (s > 60 ? Math.ceil(s / 60) + ' min' : s + 's') + '.';
    };
    upd();
    L.tick = setInterval(upd, 1000);
  }
  function showLock(mode, msg) {
    if (!/^setup/.test(mode)) return; /* demo do portfólio: sem PIN para entrar */
    closeDialogs();
    L.mode = mode; L.buf = ''; L.first = '';
    document.body.classList.add('locked');
    $('lock').hidden = false;
    lockRender(msg);
    startWaitTick();
  }
  function hideLock() {
    clearInterval(L.tick);
    L.buf = ''; L.first = '';
    $('lock').hidden = true;
    document.body.classList.remove('locked');
  }
  function shake(msg) {
    var d = $('pinDots');
    L.buf = '';
    lockRender(msg);
    d.classList.remove('shake');
    void d.offsetWidth;
    d.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(120);
  }
  function press(k) {
    if (waitLeft() > 0 || $('keypad').hidden) return;
    if (k === 'back') { if (L.buf.length < PIN_LEN) { L.buf = L.buf.slice(0, -1); renderDots(); } return; }
    if (L.buf.length >= PIN_LEN) return;
    L.buf += k;
    $('pinMsg').textContent = '';
    renderDots();
    if (L.buf.length === PIN_LEN) setTimeout(submitPin, 150);
  }
  async function submitPin() {
    var pin = L.buf;
    try {
      switch (L.mode) {
        case 'setup1':
        case 'new1':
          L.first = pin; L.buf = '';
          L.mode = L.mode === 'setup1' ? 'setup2' : 'new2';
          lockRender();
          break;
        case 'setup2':
        case 'new2':
          if (pin !== L.first) {
            L.mode = L.mode === 'setup2' ? 'setup1' : 'new1';
            L.first = '';
            shake('Os PINs não são iguais. Vamos de novo.');
            break;
          }
          await savePin(pin);
          if (L.mode === 'setup2') {
            meta = { createdAt: Date.now(), guideDone: false };
            await DB.set('meta', meta);
            await enterApp();
            addLog('lock', 'PIN criado');
            snack('Pronto! Seu PIN foi criado.');
          } else {
            hideLock();
            addLog('password', 'PIN alterado');
            snack('PIN alterado');
          }
          break;
        case 'unlock':
        case 'old':
          if (await checkPin(pin)) {
            pinRec.fails = 0; pinRec.until = 0;
            await DB.set('pin', pinRec);
            if (L.mode === 'old') { L.mode = 'new1'; L.buf = ''; lockRender(); }
            else await enterApp();
          } else {
            pinRec.fails = (pinRec.fails || 0) + 1;
            if (pinRec.fails % 5 === 0) pinRec.until = Date.now() + Math.min(15 * 60000, 30000 * Math.pow(2, pinRec.fails / 5 - 1));
            await DB.set('pin', pinRec);
            var left = 5 - pinRec.fails % 5;
            shake('PIN incorreto.' + (left <= 2 ? ' Mais ' + left + (left === 1 ? ' tentativa' : ' tentativas') + ' antes de uma pausa.' : ''));
            startWaitTick();
          }
          break;
      }
    } catch (e) {
      shake('Algo deu errado. Tente de novo.');
    }
  }

  /* ---------- Onboarding ----------
     Aparece na primeira abertura (ainda sem PIN) e termina na criação do PIN.
     Em Ajustes dá para rever; aí a última tela só volta para o app. */
  var INTRO_LAST = 3;
  var intro = { step: 0, replay: false };
  var INTRO_FINAL = {
    first: ['Falta só uma coisa: criar seu PIN.', 'São 4 números para proteger seus dados. Você vai usar esse PIN sempre que abrir o app.', 'Criar meu PIN'],
    replay: ['É isso. Bom proveito!', 'Seu PIN já está criado. Quando quiser rever esta apresentação, ela fica em Ajustes.', 'Voltar para o app']
  };

  function introRender(back) {
    var s = intro.step, box = $('intro'), fin = INTRO_FINAL[intro.replay ? 'replay' : 'first'];
    box.dataset.step = s;
    box.querySelectorAll('.intro-step').forEach(function (el) {
      var on = +el.dataset.i === s;
      el.hidden = !on;
      el.classList.toggle('back', on && !!back);
    });
    $('introSteps').querySelectorAll('i').forEach(function (d, i) { d.classList.toggle('on', i <= s); });
    $('introSteps').setAttribute('aria-label', 'Etapa ' + (s + 1) + ' de ' + (INTRO_LAST + 1));
    $('introT3').textContent = fin[0];
    $('introFinalText').textContent = fin[1];
    $('introNext').textContent = s === 0 ? 'Começar' : s < INTRO_LAST ? 'Continuar' : fin[2];
    var h = $('introT' + s);
    if (h) h.focus({ preventScroll: true });
  }
  function showIntro(replay) {
    closeDialogs();
    intro = { step: 0, replay: !!replay };
    $('intro').hidden = false;
    introRender();
  }
  function introGo(s) {
    s = Math.max(0, Math.min(INTRO_LAST, s));
    if (s === intro.step) return;
    var back = s < intro.step;
    intro.step = s;
    introRender(back);
  }
  function introNext() {
    if (intro.step < INTRO_LAST) { introGo(intro.step + 1); return; }
    $('intro').hidden = true;
    if (!intro.replay) lockRender();
  }
  function introOpen() { return !$('intro').hidden; }

  // Deslizar para os lados também troca de tela
  (function () {
    var x0 = null, y0 = 0;
    $('intro').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('intro').addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && intro.step < INTRO_LAST) introGo(intro.step + 1);
      else if (dx > 0) introGo(intro.step - 1);
    });
  })();

  /* ---------- Dia do salário e lembrete de guardar ----------
     As datas vêm de payday.js. O aviso aparece de três formas, todas sem servidor:
     banner no app, notificação do sistema (Periodic Background Sync, só Android/Chrome
     com o app instalado) e um arquivo de calendário com os próximos pagamentos. */
  var PAY_DAYS_AFTER = 3;
  var SHORT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  var DAYMONTH = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long' });
  var payOpen = '';

  function payKey(p) { return Payday.key(p.date) + ':' + p.kind; }
  function paySummary() {
    var c = S.payday;
    if (!c.type) return '';
    var nx = Payday.next(c, new Date(), 1)[0];
    return Payday.describe(c) + (nx ? ' · próximo: ' + SHORT.format(nx.date) : '');
  }
  function renderPaySummary() {
    var t = paySummary();
    document.querySelectorAll('.pay-sum').forEach(function (el) {
      el.textContent = t || 'Escolha o dia e receba um lembrete para guardar';
    });
    document.querySelectorAll('.pay-row').forEach(function (el) { el.classList.toggle('set', !!t); });
  }
  function canPeriodic() {
    return 'serviceWorker' in navigator && 'Notification' in window &&
      !!window.ServiceWorkerRegistration && 'periodicSync' in ServiceWorkerRegistration.prototype;
  }
  function notifyHint() {
    if (!canPeriodic()) return 'Este celular não deixa o app avisar sozinho quando está fechado. Use o calendário abaixo. O aviso também aparece aqui quando você abrir o app.';
    if (Notification.permission === 'denied') return 'As notificações estão bloqueadas para este app. Libere nas configurações do navegador.';
    if (!isStandalone()) return 'Instale o app na tela inicial para receber o aviso com ele fechado. O horário pode variar um pouco.';
    return 'No dia do pagamento chega uma notificação, mesmo com o app fechado. O horário pode variar um pouco.';
  }
  function dayOptions(sel) {
    if (sel.options.length) return;
    var h = '';
    for (var d = 1; d <= 31; d++) h += '<option value="' + d + '">Dia ' + d + '</option>';
    sel.innerHTML = h;
  }
  function renderPayDlg() {
    var c = S.payday;
    document.querySelectorAll('input[name=payType]').forEach(function (r) { r.checked = r.value === c.type; });
    $('payN').value = c.n; $('payDay').value = c.day; $('payAdvDay').value = c.advDay;
    $('payN').disabled = c.type !== 'business';
    $('payDay').disabled = c.type !== 'fixed';
    $('payAdv').checked = c.adv;
    $('payAdvDay').disabled = !c.adv;
    $('paySat').setAttribute('aria-checked', c.sat ? 'true' : 'false');
    $('payEarly').setAttribute('aria-checked', c.early ? 'true' : 'false');
    var can = canPeriodic(), on = can && c.notify && Notification.permission === 'granted';
    $('payNotify').setAttribute('aria-checked', on ? 'true' : 'false');
    $('payNotify').disabled = !can || Notification.permission === 'denied';
    $('payNotifyHint').textContent = notifyHint();
    $('payNextBox').hidden = $('payRemind').hidden = $('payClear').hidden = !c.type;
    $('payNext').innerHTML = c.type ? Payday.next(c, new Date(), 5).map(function (p) {
      var vale = p.kind === 'adiantamento';
      return '<li><span>' + cap(DAYMONTH.format(p.date)) + '</span>' +
        '<span class="tag' + (vale ? ' adv' : '') + '">' + (vale ? 'Vale' : 'Salário') + '</span></li>';
    }).join('') : '';
  }
  function openPayday() {
    dayOptions($('payDay')); dayOptions($('payAdvDay'));
    closeDialogs();
    payOpen = JSON.stringify(S.payday);
    renderPayDlg();
    $('paydayDlg').showModal();
  }
  function payChanged() {
    renderPayDlg();
    renderPaySummary();
    renderBanner();
    schedule();
    syncPeriodic();
  }
  function syncPeriodic() {
    if (!canPeriodic()) return;
    var want = !!(S.payday.type && S.payday.notify && Notification.permission === 'granted');
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg || !reg.periodicSync) return;
      return want ? reg.periodicSync.register('payday', { minInterval: 6 * 3600000 }) : reg.periodicSync.unregister('payday');
    }).catch(function () {});
  }
  async function toggleNotify() {
    if (!canPeriodic()) return;
    if (S.payday.notify && Notification.permission === 'granted') { S.payday.notify = false; payChanged(); return; }
    var p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    S.payday.notify = p === 'granted';
    if (p !== 'granted') snack('Sem permissão, o aviso aparece só dentro do app');
    payChanged();
  }
  function payBanner() {
    if (!S.payday.type) return '';
    var today = new Date(), p = Payday.recent(S.payday, today, PAY_DAYS_AFTER);
    if (!p || meta.paySeen === payKey(p)) return '';
    var t0 = new Date(today); t0.setHours(0, 0, 0, 0);
    var ago = Math.round((t0 - p.date) / DAY), vale = p.kind === 'adiantamento';
    var msg = ago === 0
      ? '<b>Hoje cai o seu ' + (vale ? 'vale' : 'salário') + '.</b> É dia de guardar: separe uma parte antes de começar a gastar.'
      : '<b>Seu ' + (vale ? 'vale' : 'salário') + ' caiu ' + (ago === 1 ? 'ontem' : 'há ' + ago + ' dias') + '.</b> Ainda dá tempo de guardar uma parte.';
    return '<div class="banner">' + icon('savings') + '<p>' + msg + '</p><div class="banner-actions">' +
      '<button type="button" class="btn text sl" data-action="pay-seen" data-key="' + payKey(p) + '">Já guardei</button>' +
      '<button type="button" class="btn primary sl" data-action="pay-go" data-key="' + payKey(p) + '">Ir para Guardar</button></div></div>';
  }
  function paySeen(k) {
    meta.paySeen = k;
    DB.set('meta', meta).catch(function () {});
    DB.set('payNote', k).catch(function () {});
    renderBanner();
  }

  // Calendário (.ics): um evento de dia inteiro por pagamento, com alarme às 9h
  function icsDate(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function exportIcs() {
    var now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var ev = Payday.next(S.payday, new Date(), 24).map(function (p) {
      var end = new Date(p.date); end.setDate(end.getDate() + 1);
      var vale = p.kind === 'adiantamento';
      var body = (vale ? 'Hoje cai o seu vale.' : 'Hoje cai o seu salário.') + ' Separe uma parte para guardar antes de começar a gastar.';
      return ['BEGIN:VEVENT', 'UID:cofrinho-' + icsDate(p.date) + '-' + p.kind + '@cofrinho.app', 'DTSTAMP:' + now,
        'DTSTART;VALUE=DATE:' + icsDate(p.date), 'DTEND;VALUE=DATE:' + icsDate(end),
        'SUMMARY:Dia de guardar dinheiro' + (vale ? ' (vale)' : ''), 'DESCRIPTION:' + body, 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Dia de guardar dinheiro', 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT'].join('\r\n');
    });
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moedinha//Dia do salario//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Moedinha'].concat(ev, ['END:VCALENDAR']).join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), a = document.createElement('a');
    a.href = url; a.download = 'moedinha-lembrete-salario.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    addLog('calendar_event', 'Lembretes do salário enviados para o calendário');
    snack('Abra o arquivo para adicionar ao calendário');
  }

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!booted || !t || !t.closest || !t.closest('#paydayDlg')) return;
    var c = S.payday;
    if (t.name === 'payType') c.type = t.value;
    else if (t.id === 'payN') { c.n = +t.value; c.type = 'business'; }
    else if (t.id === 'payDay') { c.day = +t.value; c.type = 'fixed'; }
    else if (t.id === 'payAdv') c.adv = t.checked;
    else if (t.id === 'payAdvDay') c.advDay = +t.value;
    else return;
    payChanged();
  });
  $('paydayDlg').addEventListener('click', function (e) {
    var sw = e.target.closest('.switch');
    if (!sw || !booted) return;
    if (sw.id === 'paySat') S.payday.sat = !S.payday.sat;
    else if (sw.id === 'payEarly') S.payday.early = !S.payday.early;
    else if (sw.id === 'payNotify') { toggleNotify(); return; }
    else return;
    payChanged();
  });
  $('paydayDlg').addEventListener('close', function () {
    if (payOpen && JSON.stringify(S.payday) !== payOpen) addLog('payments', S.payday.type ? 'Dia do salário: ' + Payday.describe(S.payday) : 'Dia do salário removido');
    payOpen = '';
  });

  /* ---------- Montagem guiada (logo depois de criar o PIN) ----------
     Renda → contas fixas → dívidas → resumo. Cada "Continuar" já grava no app,
     então se a pessoa fechar no meio, ao voltar a montagem continua de onde parou. */
  var GUIDE_LAST = 3;
  var BILL_IDEAS = ['Aluguel', 'Condomínio', 'Luz', 'Água', 'Internet', 'Celular', 'Plano de saúde', 'Academia', 'Streaming', 'Faculdade'];
  var G = { step: 0, d: null };

  function guideDraft() {
    var inc = S.incomes.filter(function (x) { return x.every; }), main = inc[0], p = S.payday;
    return {
      mainId: main ? main.id : uid(), mainName: main ? main.name || 'Salário' : 'Salário', salary: main ? main.amount : 0,
      payType: p.type === 'business' || p.type === 'fixed' || p.type === 'lastBusiness' ? p.type : '', payDay: p.day || 30,
      extras: inc.slice(1).map(function (x) { return { id: x.id, name: x.name, amount: x.amount }; }),
      bills: S.fixed.map(function (x) { return { id: x.id, name: x.name, amount: x.amount }; }),
      hasDebt: S.debts.length ? true : null,
      debts: S.debts.map(function (x) { return { id: x.id, name: x.name, payment: x.payment, left: parcelsLeft(x) }; })
    };
  }
  function guideCommit() {
    var d = G.d, once = S.incomes.filter(function (x) { return !x.every; }), used = function (x) { return x.name.trim() || x.amount || x.payment; };
    S.example = false;
    S.incomes = (d.salary > 0 ? [{ id: d.mainId, name: d.mainName, amount: d.salary, every: true, month: '' }] : [])
      .concat(d.extras.filter(used).map(function (x) { return { id: x.id, name: x.name, amount: x.amount, every: true, month: '' }; }))
      .concat(once);
    S.fixed = d.bills.filter(used).map(function (x) {
      var old = find(S.fixed, x.id) || {};
      return { id: x.id, name: x.name, amount: x.amount, due: old.due || 0, paid: old.paid || '' };
    });
    S.debts = d.hasDebt ? d.debts.filter(used).map(function (x) {
      var old = find(S.debts, x.id) || {};
      return { id: x.id, name: x.name, payment: x.payment, paid: old.paid || '', paidAmt: old.paidAmt || 0,
        balance: x.left > 0 && x.payment > 0 ? Math.round(x.left * x.payment * 100) / 100 : old.balance || 0 };
    }) : [];
    if (d.payType === 'business') { S.payday.type = 'business'; S.payday.n = 5; }
    else if (d.payType === 'fixed') { S.payday.type = 'fixed'; S.payday.day = d.payDay; }
    else if (d.payType === 'lastBusiness') S.payday.type = 'lastBusiness';
    else if (d.payType === 'none') S.payday.type = null;
    renderAll();
    schedule();
  }

  function gRow(list, x) {
    var del = '<button type="button" class="del sl" data-action="g-del" aria-label="Remover ' + esc(x.name || 'linha') + '">' + icon('delete') + '</button>';
    var nm = function (ph, lab) { return '<input class="g-name" type="text" maxlength="80" autocomplete="off" aria-label="' + lab + '" placeholder="' + ph + '" value="' + esc(x.name) + '">'; };
    var amt = function (cls, v, lab) { return '<input class="' + cls + '" type="text" inputmode="decimal" autocomplete="off" aria-label="' + lab + '" placeholder="0,00" value="' + fmt(v) + '">'; };
    if (list === 'debts') {
      return '<div class="g-row debt" data-list="debts" data-id="' + x.id + '">' + nm('Ex.: Cartão parcelado', 'Nome da dívida') + del +
        '<div class="g-nums"><label><span class="lab">Parcela por mês</span>' + amt('g-pay', x.payment, 'Parcela por mês') + '</label>' +
        '<label><span class="lab">Faltam (parcelas)</span><input class="g-left" type="text" inputmode="numeric" autocomplete="off" placeholder="Ex.: 6" value="' + (x.left || '') + '"></label></div></div>';
    }
    return '<div class="g-row" data-list="' + list + '" data-id="' + x.id + '">' +
      nm(list === 'bills' ? 'Nome da conta' : 'Ex.: Pensão', list === 'bills' ? 'Nome da conta' : 'Nome da renda') +
      amt('g-amt', x.amount, 'Valor por mês') + del + '</div>';
  }
  function gChip(action, v, label, on) {
    return '<button type="button" class="chip" data-action="' + action + '" data-v="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + icon('check') + esc(label) + '</button>';
  }
  function guideRows() {
    var d = G.d;
    $('gExtras').innerHTML = d.extras.map(function (x) { return gRow('extras', x); }).join('');
    $('gBillChips').innerHTML = BILL_IDEAS.map(function (n) {
      return gChip('g-bill', n, n, d.bills.some(function (b) { return b.name === n; }));
    }).join('') + '<button type="button" class="chip" data-action="g-bill-other">' + icon('add') + 'Outra conta</button>';
    $('gBills').innerHTML = d.bills.map(function (x) { return gRow('bills', x); }).join('');
    document.querySelectorAll('[data-action=g-debt]').forEach(function (b) {
      b.setAttribute('aria-pressed', d.hasDebt === (b.dataset.v === '1') ? 'true' : 'false');
    });
    $('gDebts').innerHTML = d.hasDebt ? d.debts.map(function (x) { return gRow('debts', x); }).join('') : '';
    $('gAddDebt').hidden = !d.hasDebt;
    document.querySelectorAll('[data-action=g-pay]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === d.payType ? 'true' : 'false'); });
    $('gPayFixed').hidden = d.payType !== 'fixed';
  }
  function guideResult() {
    var d = G.d, used = function (x) { return x.name.trim() || x.amount || x.payment; };
    var inc = d.salary + sum(d.extras, 'amount'), fx = sum(d.bills.filter(used), 'amount');
    var dp = d.hasDebt ? sum(d.debts.filter(function (x) { return x.payment > 0; }), 'payment') : 0, left = inc - fx - dp;
    var line = function (l, v, cls) { return '<div class="g-line' + (cls ? ' ' + cls : '') + '"><span>' + l + '</span><span class="num">' + v + '</span></div>'; };
    $('gResult').innerHTML = '<div class="g-sum">' +
      line('Entradas', money(inc)) + line('Contas fixas', (fx ? '− ' : '') + money(fx)) + line('Parcelas de dívidas', (dp ? '− ' : '') + money(dp)) +
      '<div class="g-total"><p class="eyebrow">' + (left < 0 ? 'Vai faltar no mês' : 'Sobra prevista') + '</p>' +
      '<p class="big' + (left < 0 ? ' neg' : '') + '">' + money(Math.abs(left)) + '</p></div></div>' +
      '<p class="hint g-note">' + (inc <= 0
        ? 'Sem a renda, o app não consegue calcular quanto sobra. Você pode preencher depois na aba Mês.'
        : 'Ainda falta a previsão do que varia, como mercado e transporte. Dá para colocar na aba Mês quando quiser.') + '</p>';
  }
  function guideRender(back) {
    var s = G.step, box = $('guide');
    box.dataset.g = s;
    box.querySelectorAll('.g-step').forEach(function (el) {
      var on = +el.dataset.i === s;
      el.hidden = !on;
      el.classList.toggle('back', on && !!back);
    });
    $('gSteps').querySelectorAll('i').forEach(function (b, i) { b.classList.toggle('on', i <= s); });
    $('gSteps').setAttribute('aria-label', 'Etapa ' + (s + 1) + ' de ' + (GUIDE_LAST + 1));
    $('gNext').textContent = s === 2 ? 'Ver meu mês' : s === GUIDE_LAST ? 'Fazer um tour pelo app' : 'Continuar';
    $('gDone').hidden = s !== GUIDE_LAST;
    $('gSkip').hidden = s === GUIDE_LAST;
    if (document.activeElement !== $('gSalary')) $('gSalary').value = fmt(G.d.salary);
    $('gPayDay').value = String(G.d.payDay);
    guideRows();
    if (s === GUIDE_LAST) guideResult();
    var h = $('gT' + s);
    if (h) h.focus({ preventScroll: true });
  }
  function showGuide() {
    var sel = $('gPayDay');
    if (!sel.options.length) { var o = ''; for (var i = 1; i <= 31; i++) o += '<option value="' + i + '">Dia ' + i + '</option>'; sel.innerHTML = o; }
    G = { step: 0, d: guideDraft() };
    $('guide').hidden = false;
    guideRender();
  }
  function guideGo(s) {
    s = Math.max(0, Math.min(GUIDE_LAST, s));
    if (s === G.step) return;
    var back = s < G.step;
    if (!back) guideCommit();
    G.step = s;
    guideRender(back);
  }
  function guideFinish(tour) {
    guideCommit();
    meta.guideDone = true;
    DB.set('meta', meta).catch(function () {});
    addLog('task_alt', 'Mês montado: ' + money(calc().inc) + ' de entradas, ' + S.fixed.length + ' contas, ' + S.debts.length + ' dívidas');
    $('guide').hidden = true;
    setTab('resumo');
    if (tour) startTour(); else snack('Tudo pronto. Bom uso da Moedinha!');
  }
  function guideFocusNew(list, id, cls) {
    var el = document.querySelector('#guide [data-list="' + list + '"][data-id="' + id + '"] .' + cls);
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  }
  function guideAction(a, b) {
    var d = G.d, id;
    switch (a) {
      case 'g-next': if (G.step < GUIDE_LAST) guideGo(G.step + 1); else guideFinish(true); break;
      case 'g-back': guideGo(G.step - 1); break;
      case 'g-skip': guideGo(G.step + 1); break;
      case 'g-done': guideFinish(false); break;
      case 'g-pay':
        d.payType = d.payType === b.dataset.v ? '' : b.dataset.v;
        guideRows();
        break;
      case 'g-add-extra':
        id = uid(); d.extras.push({ id: id, name: '', amount: 0 }); guideRows(); guideFocusNew('extras', id, 'g-name');
        break;
      case 'g-bill':
        var has = d.bills.filter(function (x) { return x.name === b.dataset.v; })[0];
        if (has) d.bills = d.bills.filter(function (x) { return x !== has; });
        else { id = uid(); d.bills.push({ id: id, name: b.dataset.v, amount: 0 }); }
        guideRows();
        if (!has) guideFocusNew('bills', id, 'g-amt');
        else { var nb = document.querySelector('#gBillChips [data-v="' + b.dataset.v + '"]'); if (nb) nb.focus(); }
        break;
      case 'g-bill-other':
        id = uid(); d.bills.push({ id: id, name: '', amount: 0 }); guideRows(); guideFocusNew('bills', id, 'g-name');
        break;
      case 'g-debt':
        d.hasDebt = b.dataset.v === '1';
        if (d.hasDebt && !d.debts.length) d.debts.push({ id: (id = uid()), name: '', payment: 0, left: 0 });
        guideRows();
        if (id) guideFocusNew('debts', id, 'g-name');
        break;
      case 'g-add-debt':
        id = uid(); d.debts.push({ id: id, name: '', payment: 0, left: 0 }); guideRows(); guideFocusNew('debts', id, 'g-name');
        break;
      case 'g-del':
        var row = b.closest('.g-row'), list = row.dataset.list;
        d[list] = d[list].filter(function (x) { return x.id !== row.dataset.id; });
        if (list === 'debts' && !d.debts.length) d.hasDebt = null;
        guideRows();
        break;
      default: return false;
    }
    return true;
  }
  $('guide').addEventListener('input', function (e) {
    var t = e.target, d = G.d;
    if (!d) return;
    if (t.id === 'gSalary') { d.salary = parseBR(t.value); return; }
    if (t.id === 'gPayDay') { d.payDay = +t.value || 30; return; }
    var row = t.closest('.g-row'), x = row && d[row.dataset.list].filter(function (i) { return i.id === row.dataset.id; })[0];
    if (!x) return;
    if (t.classList.contains('g-name')) {
      x.name = t.value;
      if (row.dataset.list === 'bills') $('gBillChips').querySelectorAll('[data-action=g-bill]').forEach(function (c) {
        c.setAttribute('aria-pressed', d.bills.some(function (bb) { return bb.name === c.dataset.v; }) ? 'true' : 'false');
      });
    }
    else if (t.classList.contains('g-amt')) x.amount = parseBR(t.value);
    else if (t.classList.contains('g-pay')) x.payment = parseBR(t.value);
    else if (t.classList.contains('g-left')) x.left = Math.max(0, parseInt(t.value, 10) || 0);
  });
  $('guide').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'gSalary' || t.classList.contains('g-amt') || t.classList.contains('g-pay')) t.value = fmt(parseBR(t.value));
  });

  /* ---------- Tour pelo app (destaque + balão no estilo do Tooltip do DS) ---------- */
  // Cada parada abre a aba da área e destaca o que importa ali
  function tourPanel(id) { var el = $(id); return el && el.closest('.panel'); }
  var TOUR = [
    { a: 'Resumo', tab: 'resumo', el: function () { return document.querySelector('#summary .hero'); },
      t: 'Sobra prevista', d: 'Quanto deve sobrar das suas entradas depois das contas, das parcelas e da previsão do que varia.' },
    { a: 'Resumo', tab: 'resumo', el: function () { return document.querySelector('#summary .due-card'); },
      t: 'A pagar este mês', d: 'Marque aqui cada conta e parcela que pagar. No mês seguinte a lista recomeça sozinha.' },
    { a: 'Mês', tab: 'gastos', el: function () { return document.querySelector('#tab-gastos .add-duo'); },
      t: 'Entradas', d: 'Seu salário e outras rendas ficam aqui. Recebeu um freela? Toque em “Extra do mês”: ele conta só no mês em que entrou.' },
    { a: 'Mês', tab: 'gastos', el: function () { return document.querySelector('#tab-gastos .pay-row'); },
      t: 'Dia do salário', d: 'Escolha quando o salário cai. No dia, a Moedinha lembra você de guardar uma parte antes de começar a gastar.' },
    { a: 'Mês', tab: 'gastos', el: function () { return document.querySelector('#fixedList .bill') || tourPanel('fixedList'); },
      t: 'Contas fixas', d: 'Escolha o dia do vencimento e marque a caixinha quando pagar. O Resumo avisa o que estiver atrasado.' },
    { a: 'Mês', tab: 'gastos', el: function () { return tourPanel('variableList'); },
      t: 'Previsão de gastos variáveis', d: 'Quanto você espera gastar com mercado, transporte, lazer… Esse valor entra no cálculo da sobra prevista.' },
    { a: 'Dívidas', tab: 'dividas', el: function () { return document.querySelector('#debtsList .bill') || tourPanel('debtsList'); },
      t: 'Suas dívidas', d: 'Parcela, quantas faltam e o saldo. Ao marcar a parcela do mês, o saldo diminui sozinho e você vê quando a dívida termina.' },
    { a: 'Guardar', tab: 'cofrinho', el: function () { return document.querySelector('#grid .sq'); },
      t: 'Desafio dos quadrados', d: 'Guardou o valor de um quadrado? Toque nele e ele vira uma moeda. Em “Ajustar o desafio” você muda a quantidade e o valor.' },
    { a: 'Compras', tab: 'compras', el: function () { return $('shopForm'); },
      t: 'Lista de compras', d: 'Escreva o item e toque em Adicionar. No mercado, marque o que já pegou.' },
    { a: 'Ajustes', tab: 'resumo', el: function () { return document.querySelector('.top [data-action="settings"]'); },
      t: 'Ajustes', d: 'Backup dos seus dados, troca do PIN, lembrete no dia do salário e tema claro ou escuro.' }
  ];
  var T = null;
  function tourEl(cls) { var e = document.createElement('div'); e.className = cls; document.body.appendChild(e); return e; }
  function startTour() {
    closeDialogs();
    if (T) tourEnd(false);
    setTab('resumo', true);
    T = { i: 0, block: tourEl('tour-block'), spot: tourEl('tour-spot'), tip: tourEl('tour-tip') };
    T.tip.setAttribute('role', 'dialog');
    T.tip.setAttribute('aria-modal', 'true');
    T.tip.setAttribute('aria-labelledby', 'tourT');
    T.tip.setAttribute('aria-describedby', 'tourD');
    window.addEventListener('resize', tourPlace);
    window.addEventListener('scroll', tourPlace, true);
    tourShow();
  }
  function tourShow() {
    var s = TOUR[T.i], last = T.i === TOUR.length - 1;
    setTab(s.tab, true);
    var el = s.el();
    if (!el) { tourNext(); return; }
    T.el = el;
    if (el.closest('.top')) window.scrollTo(0, 0);
    else if (!el.closest('.tabs')) el.scrollIntoView({ block: 'center' });
    T.tip.innerHTML = '<p class="tour-n">' + s.a + ' · ' + (T.i + 1) + ' de ' + TOUR.length + '</p><h3 id="tourT">' + s.t + '</h3><p id="tourD">' + s.d + '</p>' +
      '<div class="tour-act"><button type="button" class="tour-skip" data-action="tour-end">Pular tour</button>' +
      '<button type="button" class="tour-next" data-action="tour-next">' + (last ? 'Concluir' : 'Próximo') + '</button></div>';
    tourPlace();
    T.tip.querySelector('.tour-next').focus({ preventScroll: true });
  }
  function tourPlace() {
    if (!T || !T.el) return;
    var r = T.el.getBoundingClientRect(), p = 6, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var rad = parseFloat(getComputedStyle(T.el).borderTopLeftRadius) || 12;
    var sp = T.spot.style;
    sp.left = (r.left - p) + 'px'; sp.top = (r.top - p) + 'px'; sp.width = (r.width + p * 2) + 'px'; sp.height = (r.height + p * 2) + 'px';
    sp.borderRadius = (rad + p) + 'px';
    var w = Math.min(340, vw - 32), tip = T.tip;
    tip.style.width = w + 'px';
    var th = tip.offsetHeight, gap = 14, below = vh - r.bottom - p, above = r.top - p;
    var up = !(below >= th + gap + 8) && above > below;
    var top = up ? r.top - p - gap - th : r.bottom + p + gap;
    top = Math.max(12, Math.min(vh - th - 12, top));
    var left = Math.max(16, Math.min(vw - w - 16, r.left + r.width / 2 - w / 2));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
    tip.classList.toggle('up', up);
    tip.style.setProperty('--ax', Math.max(18, Math.min(w - 18, r.left + r.width / 2 - left)) + 'px');
  }
  function tourNext() {
    if (!T) return;
    T.i++;
    if (T.i >= TOUR.length) tourEnd(true); else tourShow();
  }
  function tourEnd(done) {
    if (!T) return;
    [T.block, T.spot, T.tip].forEach(function (e) { e.remove(); });
    T = null;
    window.removeEventListener('resize', tourPlace);
    window.removeEventListener('scroll', tourPlace, true);
    setTab('resumo');
    if (done) snack('Tudo pronto. Bom uso da Moedinha!');
  }
  document.addEventListener('keydown', function (e) {
    if (T && e.key === 'Escape') { e.preventDefault(); tourEnd(false); }
  });

  async function enterApp() {
    if (!booted) {
      var st = await DB.get('state'), local = null;
      if (st) S = normalize(st);
      else if ((local = lsGet())) S = normalize(local);
      else S = emptyState();
      meta = (await DB.get('meta')) || { createdAt: Date.now() };
      if (!meta.createdAt) meta.createdAt = Date.now();
      booted = true;
      renderAll();
      if (st) setStatus('saved');
      else if (local) schedule();
      syncPeriodic();
      // Montagem guiada ainda não terminada (primeira vez, ou fechou o app no meio)
      if (meta.guideDone === false) showGuide();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }
    hideLock();
  }

  async function forgotPin() {
    var ok = await confirmBox({ icon: 'lock_reset', title: 'Esqueceu o PIN?',
      text: 'Por segurança, o PIN não pode ser recuperado. A única saída é apagar os dados deste aparelho e começar de novo.\n\nSe você tiver um arquivo de backup, dá para importar depois em Ajustes.',
      ok: 'Continuar', danger: true });
    if (!ok) return;
    ok = await confirmBox({ icon: 'delete_forever', title: 'Apagar tudo?',
      text: 'Gastos, dívidas, cofrinho, lista de compras e histórico deste aparelho serão apagados. Isso não pode ser desfeito.',
      ok: 'Apagar tudo', danger: true });
    if (ok) wipeAll();
  }
  async function wipeAll() {
    await DB.wipe();
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_TAB); } catch (e) {}
    location.reload();
  }

  /* ---------- Histórico (tela) ---------- */
  var hist = { last: null, day: '' };
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dayLabel(d) {
    var a = new Date(); a.setHours(0, 0, 0, 0);
    var b = new Date(d); b.setHours(0, 0, 0, 0);
    var diff = Math.round((a - b) / DAY);
    return diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : DATE.format(d);
  }
  function cell(l, v, c) { return '<div><dt>' + l + '</dt><dd class="num' + (c ? ' ' + c : '') + '">' + v + '</dd></div>'; }
  function monthHTML(m) {
    var label = cap(MONTH.format(new Date(+m.month.slice(0, 4), +m.month.slice(5, 7) - 1, 1)));
    var left = Number(m.left) || 0;
    return '<div class="month"><p class="month-t">' + label + '</p><dl class="month-g">' +
      cell('Entradas', money(m.salary)) +
      cell('Gastos e parcelas', money((Number(m.fixed) || 0) + (Number(m.variable) || 0) + (Number(m.debtPay) || 0))) +
      cell(left < 0 ? 'Faltou' : 'Sobrou', money(Math.abs(left)), left < 0 ? 'neg' : '') +
      cell('No cofrinho', money(m.saved), 'pink') +
      '</dl></div>';
  }
  async function moreHistory() {
    var page = await DB.pageLog(60, hist.last), h = '';
    page.forEach(function (e) {
      var d = new Date(e.ts), day = dayLabel(d);
      if (day !== hist.day) { hist.day = day; h += '<li class="log-day">' + day + '</li>'; }
      h += '<li class="log-it"><span class="log-ic">' + icon(esc(e.i || 'history')) + '</span>' +
        '<span class="log-tx"><span>' + esc(e.t) + '</span><span class="log-tm">' + TIME.format(d) + '</span></span></li>';
    });
    if (!hist.last && !page.length) h = '<li class="empty">Nenhuma atividade registrada ainda. Tudo o que você mudar no app aparece aqui.</li>';
    if (page.length) hist.last = page[page.length - 1].id;
    $('logList').insertAdjacentHTML('beforeend', h);
    $('logMore').hidden = page.length < 60;
  }
  async function openHistory() {
    await flush();
    var months = (await DB.all('months')).sort(function (a, b) { return a.month < b.month ? 1 : -1; });
    $('monthsList').innerHTML = months.length ? months.map(monthHTML).join('')
      : '<p class="empty">O resumo de cada mês aparece aqui conforme você usa o app.</p>';
    $('logList').innerHTML = '';
    hist = { last: null, day: '' };
    await moreHistory();
    $('historyDlg').showModal();
  }

  /* ---------- Tema (Ajustes → Aparência) ----------
     Sem escolha salva, segue o celular. A escolha fica só neste aparelho (localStorage)
     e é aplicada cedo por theme.js; aqui só trocamos e lembramos. */
  var SYS_DARK = matchMedia('(prefers-color-scheme: dark)');
  var THEME_BAR = { light: '#F7F7F4', dark: '#0B0B0B' };
  function savedTheme() { var t = document.documentElement.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : null; }
  function isDark() { var t = savedTheme(); return t ? t === 'dark' : SYS_DARK.matches; }
  function setTheme(t) {
    var root = document.documentElement;
    if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    try { if (t) localStorage.setItem(LS_THEME, t); else localStorage.removeItem(LS_THEME); } catch (e) {}
    document.querySelectorAll('meta[name=theme-color]').forEach(function (m) {
      m.setAttribute('content', t ? THEME_BAR[t] : /dark/.test(m.getAttribute('media')) ? THEME_BAR.dark : THEME_BAR.light);
    });
    renderTheme();
  }
  function renderTheme() {
    var sw = $('themeSw'), t = savedTheme();
    sw.setAttribute('aria-checked', isDark() ? 'true' : 'false');
    $('themeS').textContent = t ? (t === 'dark' ? 'Escuro neste aparelho' : 'Claro neste aparelho') : 'Seguindo o tema do celular';
    $('themeAuto').hidden = !t;
  }
  SYS_DARK.addEventListener('change', renderTheme);

  /* ---------- Ajustes, backup e instalação ---------- */
  function renderBackupInfo() {
    $('backupInfo').textContent = (meta.lastBackup ? 'Último backup: ' + DATE.format(new Date(meta.lastBackup)) + '.' : 'Você ainda não fez nenhum backup.') +
      ' Se o celular for perdido ou formatado, só o arquivo de backup guarda seus dados.';
  }
  function openSettings() {
    renderBackupInfo();
    renderTheme();
    renderInstall();
    $('appVersion').textContent = APP_VERSION;
    $('settingsDlg').showModal();
  }
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  async function exportBackup() {
    await flush();
    var data = { app: 'meu-cofrinho', version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
      state: S, log: await DB.all('log'), months: await DB.all('months') };
    var name = 'moedinha-backup-' + ymd() + '.json';
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var shared = false;
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare) {
      try {
        var file = new File([blob], name, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Backup da Moedinha' }); shared = true; }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (!shared) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }
    meta.lastBackup = Date.now();
    meta.snoozeUntil = 0;
    await DB.set('meta', meta);
    addLog('backup', 'Backup exportado');
    renderBanner();
    renderBackupInfo();
    snack('Backup salvo');
  }
  async function importBackup(f) {
    var data = null;
    try { data = JSON.parse(await f.text()); } catch (e) {}
    if (!data || data.app !== 'meu-cofrinho' || !data.state || typeof data.state !== 'object') {
      confirmBox({ icon: 'warning', title: 'Arquivo inválido', text: 'Esse arquivo não é um backup da Moedinha.', ok: 'Entendi', cancel: false, danger: true });
      return;
    }
    var when = data.exportedAt && !isNaN(new Date(data.exportedAt)) ? DATE.format(new Date(data.exportedAt)) : 'data desconhecida';
    var ok = await confirmBox({ icon: 'upload', title: 'Importar backup?',
      text: 'Os dados atuais deste aparelho serão trocados pelos do backup de ' + when + '.', ok: 'Importar' });
    if (!ok) return;
    var log = (Array.isArray(data.log) ? data.log : [])
      .filter(function (e) { return e && typeof e.t === 'string' && isFinite(e.ts); })
      .sort(function (a, b) { return a.ts - b.ts; })
      .map(function (e) { return { ts: +e.ts, i: String(e.i || 'history').slice(0, 40), t: e.t.slice(0, 300) }; });
    var months = (Array.isArray(data.months) ? data.months : [])
      .filter(function (m) { return m && /^\d{4}-\d{2}$/.test(m.month); })
      .map(function (m) {
        return { month: m.month, salary: num(m.salary), fixed: num(m.fixed), variable: num(m.variable), debtPay: num(m.debtPay),
          debtBal: num(m.debtBal), left: Number(m.left) || 0, saved: num(m.saved), updatedAt: Number(m.updatedAt) || 0 };
      });
    S = normalize(data.state);
    clearTimeout(timer); timer = null;
    await DB.replaceData(S, log, months);
    closeDialogs();
    renderAll();
    setStatus('saved');
    addLog('upload', 'Backup importado (' + when + ')');
    snack('Backup importado');
  }

  var deferredInstall = null;
  function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function renderInstall() { $('installItem').hidden = isStandalone(); }
  async function install() {
    if (deferredInstall) {
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      renderInstall();
      return;
    }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    confirmBox({ icon: 'install_mobile', title: 'Instalar no celular', ok: 'Entendi', cancel: false,
      text: ios
        ? '1. Abra este site no Safari.\n2. Toque no botão Compartilhar (o quadrado com a seta para cima).\n3. Escolha "Adicionar à Tela de Início".\n4. Toque em Adicionar.'
        : '1. Abra este site no Chrome.\n2. Toque no menu (⋮) no canto de cima.\n3. Escolha "Instalar app" ou "Adicionar à tela inicial".\n4. Confirme.' });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; });
  window.addEventListener('appinstalled', function () { deferredInstall = null; renderInstall(); });

  /* ---------- Máscara dos campos de valor ----------
     Todo campo com inputmode="decimal" é dinheiro. Os números entram pela direita, como
     num caixa: 3 → 0,03 · 32 → 0,32 · 3200 → 32,00 · 320000 → 3.200,00. Assim sempre fica
     claro o que é real e o que é centavo, e a pessoa não precisa digitar vírgula nem ponto.
     Valor colado (ex.: "1.500" ou "1500,5") é lido como está. Roda antes dos outros
     listeners de input (fase de captura), então eles já recebem o valor formatado. */
  var MAX_CENTS_DIGITS = 11;
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.getAttribute('inputmode') !== 'decimal') return;
    var v;
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertReplacementText') v = parseBR(t.value);
    else {
      var digits = t.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_CENTS_DIGITS);
      v = digits ? parseInt(digits, 10) / 100 : 0;
    }
    t.value = v ? NUM.format(v) : '';
    try { t.setSelectionRange(t.value.length, t.value.length); } catch (err) {}
  }, true);
  // O cursor fica sempre no fim: é ali que os números entram
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && t.getAttribute('inputmode') === 'decimal') {
      setTimeout(function () { try { t.setSelectionRange(t.value.length, t.value.length); } catch (err) {} }, 0);
    }
  });

  /* ---------- Eventos ---------- */
  document.addEventListener('focusin', function (e) { takeSnap(e.target); });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.classList || !booted) return;
    if (t.id === 'goalCount') {
      var n = parseInt(t.value, 10);
      if (n >= 1) { S.goal.count = Math.min(500, n); buildGrid(); changed(); }
      return;
    }
    if (t.id === 'goalBase') {
      var v = parseBR(t.value);
      if (S.goal.mode === 'num') S.goal.unit = v; else S.goal.fixed = v;
      changed();
      return;
    }
    var row = t.closest('.row, .bill, .shop');
    if (!row) return;
    var it = find(S[row.dataset.kind] || [], row.dataset.id);
    if (!it) return;
    if (t.classList.contains('name')) it.name = t.value;
    else if (t.classList.contains('amt')) it.amount = parseBR(t.value);
    else if (t.classList.contains('bal')) it.balance = parseBR(t.value);
    else if (t.classList.contains('pay')) it.payment = parseBR(t.value);
    else if (t.classList.contains('left')) {
      var nl = parseInt(t.value, 10);
      if (nl >= 0 && it.payment > 0) it.balance = Math.round(nl * it.payment * 100) / 100;
    }
    else if (t.classList.contains('due')) it.due = +t.value || 0;
    if (row.classList.contains('bill')) renderStatus(row);
    changed();
  });

  document.addEventListener('change', function (e) {
    var t = e.target, s = snap && snap.el === t ? snap : null;
    if (!t || !t.classList || !booted) return;
    if (t.id === 'importFile') {
      var f = t.files && t.files[0];
      t.value = '';
      if (f) importBackup(f);
      return;
    }
    if (t.id === 'goalCount') {
      if (s && s.v !== S.goal.count) addLog('savings', 'Desafio: ' + s.v + ' → ' + S.goal.count + ' quadrados');
      t.value = S.goal.count;
    } else if (t.id === 'goalBase') {
      var gv = S.goal.mode === 'num' ? S.goal.unit : S.goal.fixed;
      if (s && s.v !== gv) addLog('savings', (S.goal.mode === 'num' ? 'Valor de cada unidade: ' : 'Valor de cada quadrado: ') + money(s.v) + ' → ' + money(gv));
      t.value = fmt(gv);
    } else {
      if (t.classList.contains('amt') || t.classList.contains('bal') || t.classList.contains('pay')) t.value = fmt(parseBR(t.value));
      var row = t.closest('.row, .bill, .shop');
      var it = row && find(S[row.dataset.kind] || [], row.dataset.id);
      if (it && s && s.item) logItem(row.dataset.kind, s.item, it);
      if (it && t.classList.contains('due')) addLog('calendar_event', 'Vencimento · ' + (it.name || 'sem nome') + ': ' + (it.due ? 'dia ' + it.due : 'sem dia'));
      if (row && row.classList.contains('bill')) renderStatus(row);
    }
    takeSnap(t);
  });

  function toggleSq(b) {
    var n = +b.dataset.n, i = S.goal.marked.indexOf(n);
    if (i > -1) S.goal.marked.splice(i, 1); else S.goal.marked.push(n);
    b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
    addLog('savings', 'Quadrado ' + n + (i === -1 ? ' marcado · +' : ' desmarcado · −') + money(sqVal(n)));
    changed();
  }
  function addItem(kind, every) {
    var id = uid();
    S[kind].push(kind === 'debts' ? { id: id, name: '', balance: 0, payment: 0, paid: '', paidAmt: 0 }
      : kind === 'fixed' ? { id: id, name: '', amount: 0, due: 0, paid: '' }
      : kind === 'incomes' ? { id: id, name: '', amount: 0, every: !!every, month: every ? '' : monthKey() }
      : { id: id, name: '', amount: 0 });
    renderLists();
    changed();
    var el = $(kind + '-' + id + '-n');
    if (el) el.focus();
  }
  var DEL_MSG = { incomes: 'Entrada removida', fixed: 'Conta fixa removida', variable: 'Previsão removida', debts: 'Dívida removida', shopping: 'Item removido' };
  function delItem(btn) {
    var row = btn.closest('.row, .bill, .shop');
    if (!row) return;
    var kind = row.dataset.kind, id = row.dataset.id, it = find(S[kind], id), at = S[kind].indexOf(it);
    if (it) snack(DEL_MSG[kind], 'Desfazer', function () {
      S[kind].splice(Math.min(at, S[kind].length), 0, it);
      if (it.name || it.amount || it.balance || it.payment) addLog(KL[kind].i, 'Desfeito: ' + KL[kind].del.toLowerCase() + ' (' + (it.name || 'sem nome') + ')');
      renderLists(); renderShopping(); changed();
    }, 6000);
    if (it && (it.name || it.amount || it.balance || it.payment)) {
      addLog(KL[kind].i, KL[kind].del + ': ' + (it.name || 'sem nome') + (it.amount ? ' (' + money(it.amount) + ')' : it.balance ? ' (' + money(it.balance) + ')' : ''));
    }
    S[kind] = S[kind].filter(function (x) { return x.id !== id; });
    renderLists();
    renderShopping();
    changed();
    var add = kind === 'shopping' ? $('shopNew') : document.querySelector('[data-action=add][data-kind=' + kind + ']');
    if (add) add.focus();
  }

  function afterSummaryToggle(b) {
    var sel = '#summary [data-action="' + b.dataset.action + '"][data-id="' + b.dataset.id + '"]';
    renderLists();
    changed();
    var nb = document.querySelector(sel);
    if (nb) nb.focus();
  }
  function toggleBill(b) {
    var li = b.closest('.bill'), it = find(S.fixed, li ? li.dataset.id : b.dataset.id), m = monthKey();
    if (!it) return;
    it.paid = it.paid === m ? '' : m;
    b.setAttribute('aria-checked', it.paid === m ? 'true' : 'false');
    addLog(it.paid ? 'task_alt' : 'receipt_long', (it.paid ? 'Conta paga: ' : 'Conta desmarcada: ') + (it.name || 'sem nome') + (it.amount ? ' (' + money(it.amount) + ')' : ''));
    if (!li) { afterSummaryToggle(b); return; }
    renderStatus(li);
    changed();
  }
  function toggleDebt(b) {
    var li = b.closest('.bill'), it = find(S.debts, li ? li.dataset.id : b.dataset.id), m = monthKey();
    if (!it) return;
    if (it.paid === m) {
      it.balance = Math.round((it.balance + it.paidAmt) * 100) / 100;
      it.paid = ''; it.paidAmt = 0;
      addLog('credit_card', 'Parcela desmarcada: ' + (it.name || 'sem nome'));
    } else {
      if (!(it.payment > 0) || !(it.balance > 0)) { snack(it.payment > 0 ? 'Essa dívida já está quitada' : 'Informe o valor da parcela primeiro'); return; }
      it.paidAmt = Math.min(it.payment, it.balance);
      it.balance = Math.round((it.balance - it.paidAmt) * 100) / 100;
      it.paid = m;
      addLog('task_alt', 'Parcela paga: ' + (it.name || 'sem nome') + ' (' + money(it.paidAmt) + ')' + (it.balance > 0 ? ' · saldo ' + money(it.balance) : ' · quitada'));
      if (it.balance <= 0) snack('Dívida quitada! Parabéns');
    }
    b.setAttribute('aria-checked', it.paid === m ? 'true' : 'false');
    if (!li) { afterSummaryToggle(b); return; }
    renderStatus(li);
    changed();
  }
  function toggleRec(b) {
    var li = b.closest('.row'), it = li && find(S.incomes, li.dataset.id);
    if (!it) return;
    it.every = !it.every;
    it.month = it.every ? '' : monthKey();
    addLog('payments', 'Entrada · ' + (it.name || 'sem nome') + ': ' + (it.every ? 'todo mês' : 'só este mês'));
    var id = it.id;
    renderLists(); changed();
    var nb = document.querySelector('.row[data-id="' + id + '"] .rec-tag');
    if (nb) nb.focus();
  }

  function toggleShop(b) {
    var row = b.closest('.shop');
    var it = row ? find(S.shopping, row.dataset.id) : null;
    if (!it) return;
    it.done = !it.done;
    row.classList.toggle('done', it.done);
    b.setAttribute('aria-checked', it.done ? 'true' : 'false');
    addLog(it.done ? 'task_alt' : 'shopping_cart', (it.done ? 'Comprado: ' : 'Desmarcado: ') + (it.name || 'sem nome'));
    updateShopStats();
    changed();
  }

  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'shopForm') return;
    e.preventDefault();
    var inp = $('shopNew'), name = inp.value.trim();
    if (!name) return;
    S.shopping.push({ id: uid(), name: name.slice(0, 80), done: false });
    addLog('shopping_cart', KL.shopping.add + ': ' + name.slice(0, 80));
    inp.value = '';
    renderShopping();
    changed();
    inp.focus();
  });

  document.addEventListener('click', function (e) {
    var sq = e.target.closest('.sq');
    if (sq) { toggleSq(sq); return; }
    var b = e.target.closest('[data-action]');
    if (!b) return;
    if (/^g-/.test(b.dataset.action)) { if (G.d) guideAction(b.dataset.action, b); return; }
    switch (b.dataset.action) {
      case 'tab': setTab(b.dataset.tab); break;
      case 'add': addItem(b.dataset.kind, b.dataset.every === '1'); break;
      case 'del': delItem(b); break;
      case 'check': toggleShop(b); break;
      case 'bill-paid': toggleBill(b); break;
      case 'debt-paid': toggleDebt(b); break;
      case 'inc-rec': toggleRec(b); break;
      case 'shop-clear':
        var nDone = S.shopping.filter(function (x) { return x.done; }).length, before = S.shopping.slice();
        S.shopping = S.shopping.filter(function (x) { return !x.done; });
        snack(nDone === 1 ? 'Item comprado removido' : nDone + ' itens comprados removidos', 'Desfazer', function () {
          S.shopping = before; renderShopping(); changed();
        }, 6000);
        addLog('delete_sweep', nDone + (nDone === 1 ? ' item comprado removido' : ' itens comprados removidos') + ' da lista');
        renderShopping(); changed();
        break;
      case 'shop-uncheck':
        S.shopping.forEach(function (x) { x.done = false; });
        addLog('remove_done', 'Lista de compras desmarcada');
        renderShopping(); changed();
        break;
      case 'mode':
        if (S.goal.mode !== b.dataset.mode) addLog('tune', 'Modo do desafio: ' + (b.dataset.mode === 'num' ? 'valor = número' : 'valor fixo'));
        S.goal.mode = b.dataset.mode; renderGoalSettings(); changed();
        break;
      case 'reset-ask': resetAsk = true; renderReset(); break;
      case 'reset-no': resetAsk = false; renderReset(); break;
      case 'reset-yes':
        addLog('restart_alt', 'Todos os quadrados desmarcados · −' + money(goalTotals().saved));
        S.goal.marked = []; resetAsk = false;
        buildGrid(); renderReset(); changed();
        break;
      case 'clear-example':
        S = emptyState();
        addLog('restart_alt', 'Começou do zero');
        renderAll(); schedule();
        break;
      case 'keep-example':
        S.example = false;
        renderBanner(); schedule();
        break;
      case 'history': openHistory(); break;
      case 'log-more': moreHistory(); break;
      case 'settings': openSettings(); break;
      case 'close-dlg': b.closest('dialog').close(); break;
      case 'export': exportBackup(); break;
      case 'import': $('importFile').click(); break;
      case 'backup-later':
        meta.snoozeUntil = Date.now() + 7 * DAY;
        DB.set('meta', meta).catch(function () {});
        renderBanner();
        break;
      case 'install': install(); break;
      case 'theme-toggle': setTheme(isDark() ? 'light' : 'dark'); break;
      case 'theme-auto': setTheme(null); $('themeSw').focus(); break;
      case 'payday': openPayday(); break;
      case 'pay-ics': exportIcs(); break;
      case 'pay-clear': S.payday.type = null; S.payday.notify = false; payChanged(); break;
      case 'pay-seen': paySeen(b.dataset.key); snack('Boa! Cada real guardado conta'); break;
      case 'pay-go': paySeen(b.dataset.key); setTab('cofrinho'); break;
      case 'intro-next': introNext(); break;
      case 'intro-back': introGo(intro.step - 1); break;
      case 'intro-skip': introGo(INTRO_LAST); break;
      case 'intro-replay': showIntro(true); break;
      case 'tour-replay': startTour(); break;
      case 'tour-next': tourNext(); break;
      case 'tour-end': tourEnd(false); break;
      case 'change-pin': showLock('old'); break;
      case 'lock-now': flush(); showLock('unlock'); break;
      case 'wipe':
        confirmBox({ icon: 'delete_forever', title: 'Apagar todos os dados?',
          text: 'Gastos, dívidas, cofrinho, lista de compras, histórico e o PIN deste aparelho serão apagados. Se quiser guardar uma cópia, exporte um backup antes.',
          ok: 'Apagar tudo', danger: true }).then(function (ok) { if (ok) wipeAll(); });
        break;
    }
  });

  /* Teclado do PIN (toque e teclado físico) */
  $('keypad').addEventListener('click', function (e) {
    var k = e.target.closest('[data-key]');
    if (k) press(k.dataset.key);
  });
  $('lockAlt').addEventListener('click', function () {
    if (this.dataset.do === 'cancel') hideLock();
    else if (this.dataset.do === 'restart') {
      L.mode = L.mode === 'setup2' ? 'setup1' : 'new1'; L.buf = ''; L.first = '';
      lockRender();
    }
    else forgotPin();
  });
  document.addEventListener('keydown', function (e) {
    if (introOpen()) {
      if (e.key === 'ArrowRight') introGo(intro.step + 1);
      else if (e.key === 'ArrowLeft') introGo(intro.step - 1);
      return;
    }
    if ($('lock').hidden || document.querySelector('dialog[open]')) return;
    if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { press('back'); e.preventDefault(); }
  });

  /* Bloqueio automático: cobre a tela ao sair e pede o PIN se ficou fora mais de 1 minuto */
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hiddenAt = Date.now();
      flush();
      if (booted && $('lock').hidden) $('cover').hidden = false;
    } else {
      $('cover').hidden = true;
      if (booted) { renderBanner(); renderPaySummary(); renderLists(); refresh(); }
      if (booted && Date.now() - hiddenAt > AUTO_LOCK_MS && !(L.mode === 'unlock' && !$('lock').hidden)) showLock('unlock');
    }
  });
  window.addEventListener('pagehide', function () { flush(); });

  /* ---------- Service worker (offline + atualizações) ---------- */
  /* service worker disabled in the isolated portfolio capture copy */

  /* ---------- Início ---------- */
  async function start() {
    currentTab = 'resumo';
    S = exampleState();
    meta = { createdAt: Date.now(), guideDone: true };
    booted = true;
    renderAll();
    hideLock();
  }
  start();
})();
