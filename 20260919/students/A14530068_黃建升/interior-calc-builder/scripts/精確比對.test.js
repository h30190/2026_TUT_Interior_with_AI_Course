/* 精確比對測試。跑法：node scripts/精確比對.test.js [每個公式的案例數，預設 20000]

   2026-10-03 王品洋交叉稽核 #8／#13 照出來的缺口：
   我原本八套測試只驗「不是 NaN／Infinity／負數」，從來沒有跟「正確答案」比過。
   所以浮點進位讓 40 加侖變 41、窗簾多算 2 碼，全部測試照樣全綠。

   這支用另一套完全獨立的算法當標準答案：BigInt 分數，沒有任何浮點運算。
   輸入的小數位數固定（0.1、0.5、整數），所以每個輸入都能寫成精確分數，
   標準答案是數學上的真值，不是另一個可能跟引擎犯同樣錯的浮點程式。

   只比對「周長實測」的油漆：由坪數推估周長要開根號，結果是無理數，沒有精確分數可比。 */
'use strict';

var 引擎 = require('./公式.js');
var 計算 = 引擎.計算;

var N = parseInt(process.argv[2], 10) || 20000;

/* ── 最小的分數運算 ── */
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { var t = a % b; a = b; b = t; } return a; }
function Q(n, d) {
  d = d === undefined ? 1n : d;
  if (d < 0n) { n = -n; d = -d; }
  var g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
function 加(a, b) { return Q(a.n * b.d + b.n * a.d, a.d * b.d); }
function 減(a, b) { return Q(a.n * b.d - b.n * a.d, a.d * b.d); }
function 乘(a, b) { return Q(a.n * b.n, a.d * b.d); }
function 除(a, b) { return Q(a.n * b.d, a.d * b.n); }
function 進位Q(a) { return a.n >= 0n ? (a.n + a.d - 1n) / a.d : -((-a.n) / a.d); }
function 大於(a, b) { return a.n * b.d > b.n * a.d; }
function 轉數(a) { return Number(a.n) / Number(a.d); }

/* 「整數 k × 步長」產生一個精確分數，同時給出引擎要吃的浮點數。
   浮點數由十進位字串轉成，跟使用者在欄位打字的路徑一樣。 */
var 種子 = 20261003;
function 亂() { 種子 = (種子 * 1664525 + 1013904223) % 4294967296; return 種子 / 4294967296; }
function 取(lo, hi, 步分母) {
  var k = Math.floor(lo * 步分母) + Math.floor(亂() * ((hi - lo) * 步分母 + 1));
  var q = Q(BigInt(k), BigInt(步分母));
  /* 十進位字串：步長是 1、1/2、1/10，最多一位小數 */
  var 字 = (步分母 === 1) ? String(k) : (k / 步分母).toFixed(1);
  return { q: q, v: Number(字) };
}
function 選(陣列) { return 陣列[Math.floor(亂() * 陣列.length)]; }

var 加侖 = Q(3785n, 1000n);
var 碼 = Q(9144n, 100n);
var 百 = Q(100n);
var 一 = Q(1n);

var 失敗 = 0;
var 範例 = [];
function 記(公式, 輸入, 欄, 引擎值, 正解) {
  失敗++;
  if (範例.length < 8) {
    範例.push(公式 + '｜' + JSON.stringify(輸入) + '｜' + 欄 + ' 引擎 ' + 引擎值 + '，正解 ' + 正解);
  }
}

/* ── 油漆 ── */
function 驗油漆(x) {
  var i = {}; Object.keys(x).forEach(function (k) { i[k] = x[k].v; });
  var r = 計算('油漆', i);
  var 毛 = 乘(x.perim.q, x.wallH.q);
  if (大於(x.openArea.q, 毛)) {
    /* 開口大於牆面積：必須被擋（交叉稽核 #1），不可以算出 0 加侖 */
    if (!r.錯誤.some(function (e) { return e.等級 === '錯誤' && e.欄位 === 'openArea'; })) {
      記('油漆', i, '開口大於牆面積', JSON.stringify(r.值), '應擋下');
    }
    return;
  }
  var 牆 = 減(毛, x.openArea.q);
  var 公升 = 乘(除(乘(牆, x.coats.q), x.rate.q), 加(一, 除(x.loss.q, 百)));
  var 正解 = 進位Q(除(公升, 加侖));
  if (BigInt(r.值.加侖數) !== 正解) { 記('油漆', i, '加侖數', r.值.加侖數, 正解); }
  var 差 = Math.abs(r.值.公升 - 轉數(公升));
  if (差 > 1e-9 * Math.max(1, 轉數(公升))) { 記('油漆', i, '公升', r.值.公升, 轉數(公升)); }
}

/* ── 窗簾 ── */
function 驗窗簾(x) {
  var i = {}; Object.keys(x).forEach(function (k) { i[k] = x[k].v; });
  var r = 計算('窗簾', i);
  var 布寬 = 加(乘(x.窗寬.q, x.倍數.q), x.兩側收邊.q);
  var 幅 = 進位Q(除(布寬, x.幅寬.q));
  var 碼數 = 進位Q(除(乘(Q(幅), 加(x.窗高.q, x.上下摺邊.q)), 碼));
  if (BigInt(r.值.幅數) !== 幅) { 記('窗簾', i, '幅數', r.值.幅數, 幅); }
  if (BigInt(r.值.建議碼數) !== 碼數) { 記('窗簾', i, '建議碼數', r.值.建議碼數, 碼數); }
}

/* ── 磁磚 ── */
function 驗磁磚(x) {
  var i = {}; Object.keys(x).forEach(function (k) { i[k] = x[k].v; });
  var r = 計算('磁磚', i);
  var 總 = 乘(x.長.q, x.寬.q);
  if (大於(x.扣除.q, 總)) {
    if (!r.錯誤.some(function (e) { return e.等級 === '錯誤' && e.欄位 === '扣除'; })) {
      記('磁磚', i, '扣除大於總面積', JSON.stringify(r.值), '應擋下');
    }
    return;
  }
  var 面積 = 減(總, x.扣除.q);
  var 縫 = 除(x.填縫.q, Q(10n));
  var 單片 = 乘(除(加(x.磚長.q, 縫), 百), 除(加(x.磚寬.q, 縫), 百));
  var 片 = 進位Q(乘(除(面積, 單片), 加(一, 除(x.損耗.q, 百))));
  var 箱 = 進位Q(除(Q(片), x.每箱片數.q));
  if (BigInt(r.值.片數) !== 片) { 記('磁磚', i, '片數', r.值.片數, 片); }
  if (BigInt(r.值.箱數) !== 箱) { 記('磁磚', i, '箱數', r.值.箱數, 箱); }
}

/* ── A 交叉稽核報告裡的固定案例 ── */
function 固(o) { var x = {}; Object.keys(o).forEach(function (k) {
  var s = String(o[k]); var 位 = (s.split('.')[1] || '').length; var 分母 = Math.pow(10, 位);
  x[k] = { q: Q(BigInt(Math.round(o[k] * 分母)), BigInt(分母)), v: o[k] }; }); return x; }

console.log('── A 交叉稽核 #4／#8 的固定案例 ──');
var 前 = 失敗;
驗油漆(固({ ping: 10, perim: 17.6, wallH: 5.9, openArea: 13, rate: 3, coats: 4, loss: 25 }));
驗窗簾(固({ 窗寬: 400, 倍數: 1.1, 幅寬: 110, 窗高: 83, 兩側收邊: 0, 上下摺邊: 15 }));
驗窗簾(固({ 窗寬: 350, 倍數: 2.2, 幅寬: 110, 窗高: 177, 兩側收邊: 0, 上下摺邊: 3 }));
驗磁磚(固({ 長: 8.4, 寬: 8.4, 扣除: 3.6, 磚長: 120, 磚寬: 60, 填縫: 0, 損耗: 0, 每箱片數: 1 }));
驗磁磚(固({ 長: 10, 寬: 10, 扣除: 0, 磚長: 100, 磚寬: 100, 填縫: 0, 損耗: 10, 每箱片數: 10 }));
console.log('  ' + (失敗 === 前 ? '通過' : '失敗') + '｜5 組固定案例');

/* ── B 隨機案例 ── */
console.log('── B 隨機案例，每個公式 ' + N + ' 組，與 BigInt 分數算的正解逐組比對 ──');
前 = 失敗;
for (var n = 0; n < N; n++) {
  驗油漆({
    ping: 取(1, 60, 10), wallH: 取(2, 4.5, 10), perim: 取(4, 80, 10), openArea: 取(0, 20, 2),
    rate: 取(6, 14, 2), coats: 取(1, 4, 1), loss: 取(0, 30, 1)
  });
  驗窗簾({
    窗寬: 取(60, 600, 1), 窗高: 取(60, 300, 1), 倍數: 取(1, 3, 10),
    幅寬: (function () { var w = 選([110, 140, 150, 280, 300]); return { q: Q(BigInt(w)), v: w }; })(),
    兩側收邊: 取(0, 20, 1), 上下摺邊: 取(0, 40, 1)
  });
  驗磁磚({
    長: 取(1, 12, 10), 寬: 取(1, 12, 10), 扣除: 取(0, 5, 10),
    磚長: (function () { var w = 選([30, 45, 60, 80, 120]); return { q: Q(BigInt(w)), v: w }; })(),
    磚寬: (function () { var w = 選([30, 45, 60, 80, 120]); return { q: Q(BigInt(w)), v: w }; })(),
    填縫: (function () { var w = 選([0, 1, 2, 3, 5]); return { q: Q(BigInt(w)), v: w }; })(),
    損耗: 取(0, 20, 1), 每箱片數: 取(1, 12, 1)
  });
}
console.log('  ' + (失敗 === 前 ? '通過' : '失敗') + '｜' + (3 * N) + ' 組');

console.log('');
範例.forEach(function (s) { console.log('  ' + s); });
console.log(失敗 ? '共 ' + 失敗 + ' 處與精確答案不同' : '全部通過——' + (3 * N + 5) + ' 組與精確答案完全一致');
process.exit(失敗 ? 1 : 0);
