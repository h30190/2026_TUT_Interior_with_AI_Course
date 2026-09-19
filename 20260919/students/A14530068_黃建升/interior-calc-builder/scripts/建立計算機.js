/* 計算機產生器。跑法：node scripts/建立計算機.js 設定/油漆用量.json [輸出資料夾]
   輸出單一 HTML 檔（公式引擎內嵌，無任何外部連線）。
   不要手改產出的 HTML——要改就改設定檔或 公式.js，然後重跑這支。 */
'use strict';

var fs = require('fs');
var path = require('path');
var 引擎 = require('./公式.js');

var 危險id = ['open', 'name', 'top', 'self', 'parent', 'status', 'length',
              'location', 'history', 'closed', 'frames', 'origin'];

function 爆掉(訊息) { console.error('產生失敗：' + 訊息); process.exit(1); }

var 設定路徑 = process.argv[2];
if (!設定路徑) { 爆掉('要給設定檔路徑，例：node scripts/建立計算機.js 設定/油漆用量.json'); }
var 設定 = JSON.parse(fs.readFileSync(設定路徑, 'utf8'));
var 輸出資料夾 = process.argv[3] || path.join(__dirname, '..', '..');

['檔名', '標題', '說明', '公式', '結果', '免責'].forEach(function (k) {
  if (!設定[k]) { 爆掉('設定檔缺少「' + k + '」'); }
});
if (!引擎.公式[設定.公式]) {
  爆掉('公式「' + 設定.公式 + '」不存在，目前有：' + Object.keys(引擎.公式).join('、'));
}
if (!Array.isArray(設定.驗算) || !設定.驗算.length) {
  爆掉('至少要有一組驗算案例，沒有驗算的計算機不准產生');
}

var 全部欄位 = (設定.輸入 || []).concat(設定.參數 || []);
if (!全部欄位.length) { 爆掉('沒有任何輸入欄位'); }

全部欄位.forEach(function (f) {
  if (!f.id || !f.標籤) { 爆掉('每個欄位都要有 id 與標籤'); }
  if (危險id.indexOf(f.id) !== -1) {
    爆掉('欄位 id「' + f.id + '」與瀏覽器內建物件同名，會讀不到值。換一個名字。');
  }
  if (typeof f.預設 !== 'number') { 爆掉('欄位「' + f.id + '」缺少數字型別的預設值'); }
});

var ids = 全部欄位.map(function (f) { return f.id; });
設定.驗算.forEach(function (c, n) {
  ids.forEach(function (id) {
    if (typeof c.輸入[id] !== 'number') {
      爆掉('第 ' + (n + 1) + ' 組驗算案例缺少欄位「' + id + '」');
    }
  });
  var 值 = 引擎.計算(設定.公式, c.輸入).值;
  Object.keys(c.預期).forEach(function (k) {
    if (typeof 值[k] === 'undefined') { 爆掉('驗算案例的預期欄位「' + k + '」不在公式輸出裡'); }
  });
});

var 樣本 = 引擎.計算(設定.公式, 設定.驗算[0].輸入).值;
if (typeof 樣本[設定.結果.欄位] === 'undefined') {
  爆掉('結果欄位「' + 設定.結果.欄位 + '」不在公式輸出裡，可用：' + Object.keys(樣本).join('、'));
}

function 欄(f) {
  return '    <label>' + f.標籤 +
         (f.說明 ? '<span>' + f.說明 + '</span>' : '') +
         '\n      <input id="' + f.id + '" type="number" value="' + f.預設 +
         '" step="' + (f.step || 1) + '" min="' + (typeof f.min === 'number' ? f.min : 0) + '"></label>\n';
}

var 驗算列 = 設定.驗算.map(function (c, n) {
  return '    <p class="test" id="t' + n + '">—</p>\n';
}).join('') + '    <p class="test" id="tRender">—</p>';

var 樣式 = [
  '  :root { --line:#ddd; --ink:#222; --sub:#666; --ok:#1a7f4b; --bad:#b3261e; --bg:#faf9f7; }',
  '  * { box-sizing:border-box; }',
  '  body { margin:0; padding:16px; background:var(--bg); color:var(--ink);',
  '         font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif; line-height:1.7; }',
  '  main { max-width:560px; margin:0 auto; }',
  '  h1 { font-size:20px; margin:0 0 4px; }',
  '  p.lead { margin:0 0 20px; color:var(--sub); font-size:14px; }',
  '  section { background:#fff; border:1px solid var(--line); border-radius:8px;',
  '            padding:14px 16px; margin-bottom:14px; }',
  '  h2 { font-size:15px; margin:0 0 10px; }',
  '  label { display:block; margin-bottom:10px; font-size:14px; }',
  '  label span { display:block; color:var(--sub); font-size:12px; }',
  '  input { width:100%; padding:10px; font-size:16px; border:1px solid var(--line);',
  '          border-radius:6px; margin-top:4px; }',
  '  table { width:100%; border-collapse:collapse; font-size:14px; }',
  '  td { padding:5px 0; border-bottom:1px solid var(--line); }',
  '  td:last-child { text-align:right; font-variant-numeric:tabular-nums; }',
  '  .result { font-size:28px; font-weight:500; margin:4px 0; }',
  '  .sub-result { font-size:14px; color:var(--sub); }',
  '  .note { font-size:12px; color:var(--sub); }',
  '  .test { font-size:13px; margin:4px 0; }',
  '  .pass { color:var(--ok); } .fail { color:var(--bad); font-weight:500; }'
].join('\n');

var 執行期 = [
  'var 設定 = ' + JSON.stringify({
    公式: 設定.公式,
    欄位: ids,
    結果: 設定.結果,
    次要結果: 設定.次要結果 || null,
    驗算: 設定.驗算
  }) + ';',
  '',
  'function $(id) { return document.getElementById(id); }',
  'function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }',
  '',
  'function read() {',
  '  var o = {};',
  '  設定.欄位.forEach(function (k) { o[k] = +$(k).value; });',
  '  return o;',
  '}',
  '',
  'function render() {',
  '  var r = 計算(設定.公式, read());',
  '  if (r.錯誤 && r.錯誤.length) {',
  '    $("steps").innerHTML = "";',
  '    $("assume").textContent = "";',
  '    $("out").textContent = "輸入有誤";',
  '    $("out2").textContent = r.錯誤.join("；");',
  '    return;',
  '  }',
  '  var html = "";',
  '  r.過程.forEach(function (s) {',
  '    html += "<tr><td>" + s.標籤 + "</td><td>" + s.算式 + "</td></tr>";',
  '  });',
  '  $("steps").innerHTML = html;',
  '  $("assume").textContent = r.註記 || "";',
  '  $("out").textContent = r.值[設定.結果.欄位] + " " + 設定.結果.單位;',
  '  if (設定.次要結果) {',
  '    $("out2").textContent = 設定.次要結果.replace(/\{([^}]+)\}/g, function (_, k) {',
  '      return f2(r.值[k]);',
  '    });',
  '  }',
  '}',
  '',
  'function mark(el, 通過, 說明) {',
  '  el.className = "test " + (通過 ? "pass" : "fail");',
  '  el.textContent = (通過 ? "通過" : "失敗") + "｜" + 說明;',
  '}',
  '',
  'function 驗算() {',
  '  設定.驗算.forEach(function (c, n) {',
  '    var 值 = 計算(設定.公式, c.輸入).值;',
  '    var 壞掉 = [];',
  '    Object.keys(c.預期).forEach(function (k) {',
  '      var 實得 = Math.round(值[k] * 100) / 100;',
  '      if (實得 !== c.預期[k]) { 壞掉.push(k + " 預期 " + c.預期[k] + "，實得 " + 實得); }',
  '    });',
  '    mark($("t" + n), !壞掉.length, c.標題 + (壞掉.length ? "：" + 壞掉.join("；") : ""));',
  '  });',
  '  var 畫面 = $("steps").textContent + $("out").textContent + $("out2").textContent;',
  '  var 壞值 = ["NaN", "Infinity", "undefined", "輸入有誤"];',
  '  var 有壞值 = 壞值.some(function (k) { return 畫面.indexOf(k) !== -1; });',
  '  mark($("tRender"), !有壞值 && $("out").textContent !== "—",',
  '       "畫面渲染檢查：輸入欄有接到計算引擎，預設值算得出正常結果");',
  '}',
  '',
  'document.querySelectorAll("input").forEach(function (el) {',
  '  el.addEventListener("input", render);',
  '});',
  'render();',
  '驗算();'
].join('\n');

var html = [
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>' + 設定.標題 + '</title>',
  '<style>',
  樣式,
  '</style>',
  '</head>',
  '<body>',
  '<main>',
  '  <h1>' + 設定.標題 + '</h1>',
  '  <p class="lead">' + 設定.說明 + '</p>',
  '',
  '  <section>',
  '    <h2>現場量到的數字</h2>',
  (設定.輸入 || []).map(欄).join('').replace(/\n$/, ''),
  '  </section>',
  '',
  '  <section>',
  '    <h2>假設參數（可改）</h2>',
  (設定.參數 || []).map(欄).join('').replace(/\n$/, ''),
  '  </section>',
  '',
  '  <section>',
  '    <h2>計算過程</h2>',
  '    <table id="steps"></table>',
  '    <p class="note" id="assume"></p>',
  '  </section>',
  '',
  '  <section>',
  '    <h2>結果</h2>',
  '    <div class="result" id="out">—</div>',
  '    <div class="sub-result" id="out2">—</div>',
  '    <p class="note">' + 設定.免責 + '</p>',
  '  </section>',
  '',
  '  <section>',
  '    <h2>驗算</h2>',
  驗算列,
  '    <p class="note">固定檢查，開頁自動執行。顯示失敗代表公式或設定被改壞了，',
  '      先重新手算公式，不要直接改預期值。</p>',
  '  </section>',
  '</main>',
  '',
  '<script>',
  fs.readFileSync(path.join(__dirname, '公式.js'), 'utf8').trim(),
  '</script>',
  '<script>',
  執行期,
  '</script>',
  '</body>',
  '</html>',
  ''
].join('\n');

var 輸出路徑 = path.join(輸出資料夾, 設定.檔名);
fs.writeFileSync(輸出路徑, html, 'utf8');
console.log('已產生：' + 輸出路徑);
console.log('  ' + html.length + ' bytes，' + 設定.驗算.length + ' 組驗算，公式「' + 設定.公式 + '」');
