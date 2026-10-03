/* 產生器與介面回歸測試。跑法：node scripts/產生器與介面.test.js

   把 2026-10-03 王品洋交叉稽核在產生器與頁面上的發現寫成「實際觸發」的測試：
     #2  欄位清空被當成 0         #7  換單位溢位、欄位被清空
     #9  step 帶引號注入程式碼    #10 設定檔型別錯就噴堆疊
     #11 驗算預期錯、預設值壞照樣產生    #12 說明是物件印出 [object Object]
   每一條都用他當時的輸入重打，並確認擋下的方式是「產生失敗：…」而不是堆疊。
   設定檔與產出一律寫在暫存資料夾，不碰正式檔案。 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');
var spawnSync = require('child_process').spawnSync;

var 這裡 = __dirname;
var 基礎 = JSON.parse(fs.readFileSync(path.join(這裡, '..', '設定', '油漆用量.json'), 'utf8'));
var 暫存 = fs.mkdtempSync(path.join(os.tmpdir(), 'calc-builder-regress-'));
var 序 = 0;

var 失敗 = 0;
function 驗(名稱, 條件, 說明) {
  if (!條件) { 失敗++; }
  console.log('  ' + (條件 ? '通過' : '失敗') + '｜' + 名稱 + (!條件 && 說明 ? '　' + 說明 : ''));
}

function 產生(改) {
  var c = JSON.parse(JSON.stringify(基礎));
  if (改) { 改(c); }
  var 夾 = path.join(暫存, String(++序));
  fs.mkdirSync(夾);
  var 檔 = path.join(夾, 'config.json');
  fs.writeFileSync(檔, typeof c === 'string' ? c : JSON.stringify(c));
  var r = spawnSync(process.execPath, [path.join(這裡, '建立計算機.js'), 檔, 夾], { encoding: 'utf8' });
  var 輸出 = (r.stdout || '') + (r.stderr || '');
  var html = null;
  try { html = fs.readFileSync(path.join(夾, (c && c.檔名) || '油漆用量計算機.html'), 'utf8'); } catch (e) { /* 沒產生 */ }
  return { 碼: r.status, 輸出: 輸出, html: html };
}
/* 被擋下的標準樣子：退出碼非 0、走自己的訊息、沒有堆疊 */
function 有說明地擋下(r) {
  return r.碼 !== 0 && r.輸出.indexOf('產生失敗：') !== -1 && !/\n\s+at\s/.test(r.輸出) && r.html === null;
}

console.log('── 產生器（#9～#12）──');
var r = 產生(function (c) { c.輸入[0].step = '0.5" autofocus onfocus="document.title=\'INJECTED\''; });
驗('#9 step 帶引號：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.輸入[0].step = '0.5'; });
驗('#9 step 是字串（連看起來像數字的也不收）', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.參數[0].min = '0" onclick="x'; });
驗('#9 min 帶引號：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.輸入[0].id = 'a" onmouseover="x'; });
驗('#9 欄位 id 帶引號：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.輸入[0].標籤 = '地坪 "引號" <b>粗</b> onclick=x'; });
驗('#9 對照組：標籤含引號與標籤字元照常產生且已逸出',
   r.碼 === 0 && r.html && r.html.indexOf('&quot;引號&quot; &lt;b&gt;') !== -1 && !/<b>粗/.test(r.html), r.輸出);

[
  ['可選單位是字串', function (c) { c.輸入[0].可選單位 = '坪'; }],
  ['輸入是物件不是陣列', function (c) { c.輸入 = {}; }],
  ['參數是字串', function (c) { c.參數 = 'rate'; }],
  ['驗算陣列裡有 null', function (c) { c.驗算.push(null); }],
  ['欄位物件是 null', function (c) { c.輸入[1] = null; }],
  ['驗算的輸入是 null', function (c) { c.驗算[0].輸入 = null; }],
  ['結果是字串', function (c) { c.結果 = '加侖數'; }],
  ['最外層是陣列', function (c) { return; }]
].forEach(function (t, n) {
  var rr = n === 7 ? (function () {
    var 夾 = path.join(暫存, 'arr'); fs.mkdirSync(夾, { recursive: true });
    var 檔 = path.join(夾, 'c.json'); fs.writeFileSync(檔, '[1,2]');
    var x = spawnSync(process.execPath, [path.join(這裡, '建立計算機.js'), 檔, 夾], { encoding: 'utf8' });
    return { 碼: x.status, 輸出: (x.stdout || '') + (x.stderr || ''), html: null };
  })() : 產生(t[1]);
  驗('#10 ' + t[0] + '：有說明地擋下，不噴堆疊', 有說明地擋下(rr), rr.輸出);
});

r = 產生(function (c) { c.驗算[1].預期.公升 = 0.5; });
驗('#11 驗算預期值錯（0.5，實際 12.22）：拒絕產生', 有說明地擋下(r) && r.輸出.indexOf('12.22') !== -1, r.輸出);
r = 產生(function (c) { c.參數[2].預設 = -1; });
驗('#11 損耗率預設 -1：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.輸入[0].預設 = 1e308; });
驗('#11 地坪預設 1e308：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.輸入[3].預設 = 500; });
驗('#11 預設開口面積大於牆面積：拒絕產生', 有說明地擋下(r), r.輸出);

r = 產生(function (c) { c.說明 = {}; });
驗('#12 說明是物件：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.輸入[0].說明 = ['a']; });
驗('#12 欄位說明是陣列：拒絕產生', 有說明地擋下(r), r.輸出);
r = 產生(function (c) { c.標題 = 123; });
驗('#12 標題是數字：拒絕產生', 有說明地擋下(r), r.輸出);

/* ── 介面：用會真的觸發事件的假 DOM 跑正式產出的頁面 ── */
function 開頁(html) {
  var 元素 = {};
  function 建(id) {
    var e = { id: id, value: '', className: '', _t: '—', _h: '', 事件: {} };
    e.addEventListener = function (type, fn) { e.事件[type] = fn; };
    Object.defineProperty(e, 'textContent', { get: function () { return e._t; }, set: function (v) { e._t = String(v); } });
    Object.defineProperty(e, 'innerHTML', { get: function () { return e._h; },
      set: function (v) { e._h = String(v); e._t = String(v).replace(/<[^>]*>/g, ''); } });
    return e;
  }
  var m, re = /id="([^"]+)"/g;
  while ((m = re.exec(html))) { if (!元素[m[1]]) { 元素[m[1]] = 建(m[1]); } }
  re = /<input id="([^"]+)"[^>]*\svalue="([^"]*)"/g;
  while ((m = re.exec(html))) { 元素[m[1]].value = m[2]; }
  re = /<select id="([^"]+)">([\s\S]*?)<\/select>/g;
  while ((m = re.exec(html))) {
    var 選 = /<option value="([^"]*)" selected>/.exec(m[2]);
    元素[m[1]].value = 選 ? 選[1] : '';
  }
  var ctx = { document: { getElementById: function (id) { return 元素[id] || null; } } };
  vm.createContext(ctx);
  var 碼 = [];
  re = /<script>([\s\S]*?)<\/script>/g;
  while ((m = re.exec(html))) { 碼.push(m[1]); }
  vm.runInContext(碼.join('\n'), ctx);
  return {
    元素: 元素,
    打: function (id, v) { 元素[id].value = String(v); 元素[id].事件.input(); },
    選: function (id, v) { 元素['u_' + id].value = v; 元素['u_' + id].事件.change(); }
  };
}

console.log('── 頁面（#2、#7）──');
var 正式 = fs.readFileSync(path.join(這裡, '..', '..', '油漆用量計算機.html'), 'utf8');
var p = 開頁(正式);
驗('對照組：預設值算得出結果', /^\d+ 加侖$/.test(p.元素.out.textContent), p.元素.out.textContent);

p.打('ping', '');
驗('#2 清空地坪：不給結果', p.元素.out.textContent === '—', p.元素.out.textContent);
驗('#2 清空地坪：欄位旁寫「要填數字」', p.元素.err_ping.textContent.indexOf('要填數字') !== -1, p.元素.err_ping.textContent);
['openArea', 'loss', 'perim'].forEach(function (k) {
  var q = 開頁(正式); q.打(k, '');
  驗('#2 清空 ' + k + '：不給結果、不當 0', q.元素.out.textContent === '—' &&
     q.元素['err_' + k].textContent.indexOf('要填數字') !== -1, q.元素.out.textContent + '｜' + q.元素['err_' + k].textContent);
});
p = 開頁(正式); p.打('ping', '0');
驗('#2 對照組：真的填 0 仍可算（0 和沒填是兩件事）', p.元素.out.textContent !== '—' || p.元素.err_ping.textContent.indexOf('要填數字') === -1);

p = 開頁(正式);
p.打('ping', '1e307');
p.選('ping', '才');
驗('#7 1e307 坪切「才」：欄位保留原值', p.元素.ping.value === '1e307', p.元素.ping.value);
驗('#7 1e307 坪切「才」：單位退回「坪」', p.元素.u_ping.value === '坪', p.元素.u_ping.value);
驗('#7 1e307 坪切「才」：欄位旁說明換算失敗', p.元素.err_ping.textContent.indexOf('超出可計算範圍') !== -1, p.元素.err_ping.textContent);
驗('#7 1e307 坪切「才」：不給 0 加侖', p.元素.out.textContent === '—', p.元素.out.textContent);
p.打('ping', '10');
驗('#7 重新輸入後說明消失、照常計算', p.元素.err_ping.textContent.indexOf('超出') === -1 && /加侖$/.test(p.元素.out.textContent),
   p.元素.err_ping.textContent + '｜' + p.元素.out.textContent);
p.選('ping', '才');
驗('#7 對照組：正常值照常換單位（10 坪 = 360 才）', p.元素.ping.value === '360' || +p.元素.ping.value === 360, p.元素.ping.value);

p = 開頁(正式);
p.打('ping', '1e307');
var 全文 = p.元素.steps.textContent + p.元素.out.textContent + p.元素.out2.textContent;
驗('#6 頁面輸入 1e307：畫面沒有 Infinity', 全文.indexOf('Infinity') === -1 && p.元素.out.textContent === '—', 全文);

fs.rmSync(暫存, { recursive: true, force: true });
console.log('');
console.log(失敗 ? '共 ' + 失敗 + ' 項失敗' : '全部通過');
process.exit(失敗 ? 1 : 0);
