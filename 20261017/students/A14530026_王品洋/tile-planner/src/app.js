/* 介面：表單 → 專案狀態 → 重新計算 → 顯示建議書／3D。計算都在 engine.js，這裡只做輸入輸出。 */
'use strict';
(function () {
var E = window.TileEngine, D = window.TileDraw, RP = window.TileReport;
var S = E.defaultProject();                 // 專案狀態（表單即時修改它）
var viewer = null, lastRes = null, timer = null;
var v3 = document.getElementById('v3box');     // 3D 區塊：重畫報告前要先搬出報告區，否則會被一起清掉

function $(id) { return document.getElementById(id); }
function esc(s) { return D.esc(s); }

/* ---------------------------------------------------------------- 路徑讀寫 */
function getPath(o, path) { var p = path.split('.'), i; for (i = 0; i < p.length; i++) { if (o == null) { return undefined; } o = o[p[i]]; } return o; }
function setPath(o, path, v) { var p = path.split('.'), i; for (i = 0; i < p.length - 1; i++) { o = o[p[i]]; } o[p[p.length - 1]] = v; }

function inp(label, path, o) {
  o = o || {};
  var v = getPath(S, path), type = o.type || 'num';
  if (type === 'select') {
    return '<label class="f"><span>' + label + '</span><select data-path="' + path + '" data-type="str">' +
      o.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(v) === String(op[0]) ? ' selected' : '') + '>' + esc(op[1]) + '</option>'; }).join('') + '</select></label>';
  }
  if (type === 'bool') { return '<label class="f chk"><input type="checkbox" data-path="' + path + '" data-type="bool"' + (v ? ' checked' : '') + '><span>' + label + '</span></label>'; }
  return '<label class="f"><span>' + label + '</span><input type="' + (type === 'num' ? 'number' : 'text') + '" step="' + (o.step || 'any') + '" data-path="' + path + '" data-type="' + (type === 'num' ? 'num' : 'str') + '" value="' + (v == null || (typeof v === 'number' && !isFinite(v)) ? '' : esc(v)) + '"' + (o.ro ? ' readonly' : '') + '></label>';
}

function cellInput(path, type, opts) {
  var v = getPath(S, path);
  if (type === 'select') {
    return '<select data-path="' + path + '" data-type="str">' + opts.map(function (op) { return '<option value="' + op[0] + '"' + (String(v) === String(op[0]) ? ' selected' : '') + '>' + op[1] + '</option>'; }).join('') + '</select>';
  }
  return '<input type="' + (type === 'num' ? 'number' : 'text') + '" step="any" data-path="' + path + '" data-type="' + (type === 'num' ? 'num' : 'str') + '" value="' + (v == null || (typeof v === 'number' && !isFinite(v)) ? '' : esc(v)) + '">';
}

var WALL_OPTS = [['N', '北'], ['E', '東'], ['S', '南'], ['W', '西']];

function listTable(key, cols, addLabel) {
  var rows = S[key] || [];
  var head = cols.map(function (c) { return '<th>' + c.h + '</th>'; }).join('') + '<th></th>';
  var body = rows.map(function (r, i) {
    return '<tr>' + cols.map(function (c) { return '<td>' + cellInput(key + '.' + i + '.' + c.k, c.t, c.o) + '</td>'; }).join('') +
      '<td><button class="x" data-del="' + key + '" data-i="' + i + '" title="刪除這列">✕</button></td></tr>';
  }).join('');
  return '<div class="tw"><table class="in"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
    '<button class="add" data-add="' + key + '">＋ ' + addLabel + '</button>';
}

/* ---------------------------------------------------------------- 表單 */
function tileOptions(use) {
  return S.tiles.filter(function (t) { return t.use === use || t.use === 'both'; }).map(function (t) { return [t.id, t.id + '　' + t.name]; });
}

function methodOptions(tileId) {
  var t = S.tiles.filter(function (x) { return x.id === tileId; })[0];
  var opts = [['auto', '自動（片數最省）']];
  if (t && t.w > 0 && t.h > 0) { E.methodsFor(t).forEach(function (m) { opts.push([m, E.METHOD_NAMES[m]]); }); }
  return opts;
}
function startOptions(map) {
  var opts = [['auto', '自動（切磚最好）']];
  Object.keys(map).forEach(function (k) { opts.push([k, map[k]]); });
  return opts;
}

function renderForm() {
  var h = '';
  h += '<details open><summary>① 專案與房間</summary><div class="grid2">' +
    inp('專案名稱', 'name', { type: 'text' }) +
    inp('房間寬（東西向）cm', 'room.L') + inp('房間深（南北向）cm', 'room.D') + inp('天花板高 cm', 'room.H') +
    inp('牆磚貼到高度 cm', 'wallTop') +
    inp('施工順序', 'sequence', { type: 'select', options: [['wallFirst', '先貼牆、後貼地'], ['floorFirst', '先貼地、後貼牆']] }) +
    inp('轉角收法', 'corner', { type: 'select', options: [['butt', '長牆通到底、短牆被夾住'], ['both', '每面牆兩端都扣（保守）']] }) +
    '</div><div class="row">貼牆磚的牆：' + ['N', 'E', 'S', 'W'].map(function (w) { return inp(E.WALL_ZH[w], 'wallTiled.' + w, { type: 'bool' }); }).join('') + '</div>' +
    '<p class="hint">尺寸皆為粗胚（未貼磚）尺寸。原點在房間西北角，x 往東、y 往南；牆上位置：北南牆自西端量起，東西牆自北端量起。</p></details>';

  h += '<details open><summary>② 落水孔與洩水坡度（地面）</summary><div class="grid2">' +
    inp('落水孔中心 x cm', 'drain.x') + inp('落水孔中心 y cm', 'drain.y') + inp('格柵邊長 cm', 'drain.size') + inp('洩水坡度 %', 'drain.slope', { step: '0.1' }) +
    inp('洩水方式', 'drain.mode', { type: 'select', options: [['point', '四周往落水孔（點收水）'], ['oneway', '單向洩水']] }) +
    inp('單向洩水：往哪面牆', 'drain.dir', { type: 'select', options: WALL_OPTS }) + '</div></details>';

  h += '<details open><summary>③ 門／窗（立面）</summary>' + listTable('openings', [
    { h: '編號', k: 'id', t: 'str' }, { h: '類型', k: 'type', t: 'select', o: [['door', '門'], ['window', '窗']] }, { h: '牆', k: 'wall', t: 'select', o: WALL_OPTS },
    { h: '位置 offset', k: 'offset', t: 'num' }, { h: '寬', k: 'width', t: 'num' }, { h: '高', k: 'height', t: 'num' }, { h: '窗台高', k: 'sill', t: 'num' }], '新增門／窗') + '</details>';

  h += '<details><summary>④ 給水／排水點（牆面）</summary>' + listTable('fixtures', [
    { h: '編號', k: 'id', t: 'str' }, { h: '類型', k: 'kind', t: 'select', o: [['supply', '給水'], ['drain', '排水']] }, { h: '牆', k: 'wall', t: 'select', o: WALL_OPTS },
    { h: '位置', k: 'offset', t: 'num' }, { h: '高度', k: 'height', t: 'num' }, { h: '孔徑', k: 'dia', t: 'num' }], '新增給排水點') + '</details>';

  h += '<details open><summary>⑤ 材質表：磁磚</summary>' + listTable('tiles', [
    { h: '編號', k: 'id', t: 'str' }, { h: '名稱', k: 'name', t: 'str' }, { h: '寬 cm', k: 'w', t: 'num' }, { h: '高 cm', k: 'h', t: 'num' },
    { h: '厚 mm', k: 't', t: 'num' }, { h: '每箱片', k: 'perBox', t: 'num' }, { h: '貼的位置', k: 'use', t: 'select', o: [['floor', '地'], ['wall', '牆'], ['both', '地＋牆']] }], '新增磁磚') +
    '<div class="grid2">' + inp('地面用磚', 'floorTileId', { type: 'select', options: tileOptions('floor') }) + inp('牆面用磚', 'wallTileId', { type: 'select', options: tileOptions('wall') }) + '</div></details>';

  h += '<details><summary>⑥ 收邊條與門檻</summary><div class="grid2">' +
    inp('收邊條名稱', 'trim.label', { type: 'text' }) + inp('收邊條單支長度 cm', 'trim.pieceLen') +
    '</div><div class="row">' + inp('門洞口收邊', 'trim.jambDoor', { type: 'bool' }) + inp('窗洞口收邊', 'trim.jambWindow', { type: 'bool' }) + inp('牆磚頂端收邊（未貼到天花板時）', 'trim.topEdge', { type: 'bool' }) + '</div>' +
    '<p class="hint">額外的陽角（轉角外凸）收邊：</p>' + listTable('trim.outerCorners', [{ h: '名稱', k: 'label', t: 'str' }, { h: '單處長度 cm', k: 'len', t: 'num' }, { h: '處數', k: 'n', t: 'num' }], '新增陽角') +
    '<div class="grid2">' + inp('門檻名稱', 'threshold.label', { type: 'text' }) + inp('門檻材質', 'threshold.material', { type: 'text' }) + inp('門檻寬（牆厚方向）cm', 'threshold.width') +
    inp('門檻厚 cm', 'threshold.thick') + inp('頂面高出地磚 cm', 'threshold.riseAbove', { step: '0.1' }) + '</div></details>';

  h += '<details open><summary>⑦ 施工選項（貼法與起始點）</summary><div class="grid2">' +
    inp('地面貼法', 'floorMethod', { type: 'select', options: methodOptions(S.floorTileId) }) + inp('地面起始點', 'floorStart', { type: 'select', options: startOptions(E.FLOOR_STARTS) }) +
    inp('牆面貼法', 'wallMethod', { type: 'select', options: methodOptions(S.wallTileId) }) + inp('牆面起始點', 'wallStart', { type: 'select', options: startOptions(E.WALL_STARTS) }) +
    inp('破損預留 %', 'breakagePct', { step: '0.5' }) + inp('黏著劑耗量 kg/m²/mm', 'adhesiveKgPerM2PerMm', { step: '0.1' }) +
    inp('黏著劑每包 kg', 'bagKg') + inp('收邊條損耗 %', 'trimLossPct', { step: '0.5' }) +
    '<label class="f"><span>磁磚縫（固定）</span><input value="0.2 cm" readonly></label><label class="f"><span>黏著劑厚（固定）</span><input value="0.5 cm" readonly></label></div></details>';
  $('form').innerHTML = h;
}

/* ---------------------------------------------------------------- 事件 */
function onInput(e) {
  var t = e.target, path = t.getAttribute && t.getAttribute('data-path');
  if (!path) { return; }
  var type = t.getAttribute('data-type'), v;
  if (type === 'num') { v = t.value === '' ? NaN : parseFloat(t.value); }
  else if (type === 'bool') { v = t.checked; }
  else { v = t.value; }
  setPath(S, path, v);
  if (/^tiles\.|floorTileId|wallTileId/.test(path)) {
    if (e.type === 'change') { renderForm(); }
  }
  schedule();
}

document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('click', function (e) {
  var t = e.target;
  if (t.getAttribute && t.getAttribute('data-del')) {
    var key = t.getAttribute('data-del'), i = parseInt(t.getAttribute('data-i'), 10), arr = getPath(S, key);
    arr.splice(i, 1); renderForm(); schedule(); return;
  }
  if (t.getAttribute && t.getAttribute('data-add')) {
    var k = t.getAttribute('data-add'), a = getPath(S, k);
    var n = a.length + 1;
    if (k === 'openings') { a.push({ id: 'O' + n, type: 'window', wall: 'N', offset: 10, width: 50, height: 50, sill: 100 }); }
    else if (k === 'fixtures') { a.push({ id: 'X' + n, kind: 'supply', wall: 'W', offset: 50, height: 100, dia: 2.5 }); }
    else if (k === 'tiles') { a.push({ id: 'T' + n, name: '新磁磚', w: 30, h: 60, t: 9, perBox: 6, use: 'both' }); }
    else if (k === 'trim.outerCorners') { a.push({ label: '陽角 ' + n, len: 240, n: 1 }); }
    renderForm(); schedule(); return;
  }
});

function schedule() { clearTimeout(timer); timer = setTimeout(recalc, 220); }

/* ---------------------------------------------------------------- 計算與顯示 */
function recalc() {
  var t0 = performance.now(), res;
  try { res = E.computeAll(S); }
  catch (err) { res = { ok: false, errors: ['計算發生例外：' + err.message + '（請檢查輸入）'], warnings: [] }; }
  lastRes = res;
  var box = $('errors');
  if (!res.ok) {
    box.innerHTML = '<div class="errbox"><b>輸入有問題，先修正才能計算：</b><ul>' + res.errors.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>';
    document.body.appendChild(v3); v3.classList.add('hide');
    $('report').innerHTML = ''; $('status').textContent = '輸入有誤'; if (viewer) { viewer.setResult(res); }
    return;
  }
  box.innerHTML = '';
  var html = RP.reportHTML(res);
  document.body.appendChild(v3); v3.classList.add('hide');
  $('report').innerHTML = html;
  var slot = $('slot3d');
  if (slot) { slot.appendChild(v3); v3.classList.remove('hide'); }
  if (viewer) { viewer.setResult(res); }
  $('status').textContent = '已計算（' + Math.round(performance.now() - t0) + ' ms）｜地面 ' + res.floor.pieces + ' 片、牆面 ' + res.wallTotal.pieces + ' 片';
}

/* ---------------------------------------------------------------- 匯出入 */
function download(name, mime, data) {
  var a = document.createElement('a'), blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function standaloneCSS() { var st = document.getElementById('appstyle'); return st ? st.textContent : ''; }

$('btnSample').addEventListener('click', function () { S = E.defaultProject(); renderForm(); recalc(); });
$('btnSave').addEventListener('click', function () { download((S.name || '磁磚計畫') + '.json', 'application/json', JSON.stringify(S, null, 2)); });
$('fileLoad').addEventListener('change', function (e) {
  var f = e.target.files[0]; if (!f) { return; }
  var rd = new FileReader();
  rd.onload = function () {
    try { var o = JSON.parse(rd.result); S = JSON.parse(JSON.stringify(E.normalize(o))); renderForm(); recalc(); }
    catch (err) { alert('讀取失敗：不是正確的專案 JSON（' + err.message + '）'); }
  };
  rd.readAsText(f); e.target.value = '';
});
$('btnPrint').addEventListener('click', function () { window.print(); });
$('btnPng').addEventListener('click', function () { if (!lastRes || !lastRes.ok) { return; } download((S.name || '磁磚計畫') + '-3D.png', 'image/png', dataURLtoBlob($('cv3d').toDataURL('image/png'))); });
$('btnHtml').addEventListener('click', function () {
  if (!lastRes || !lastRes.ok) { alert('輸入有誤，無法輸出建議書'); return; }
  var img = '<section class="sec"><h2>3D 模擬圖</h2><img style="max-width:100%" src="' + $('cv3d').toDataURL('image/png') + '"></section>';
  var body = RP.reportHTML(lastRes).replace(/<div id="slot3d"><\/div>/, '').replace(/<section class="sec" id="sec3d">[\s\S]*?<\/section>/, img);
  var doc = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' + esc(S.name) + ' 磁磚計畫建議書</title><style>' + standaloneCSS() + '</style></head><body class="standalone"><main class="doc"><h1>' + esc(S.name) + '　磁磚計畫建議書</h1>' + body + '</main></body></html>';
  download((S.name || '磁磚計畫') + '-建議書.html', 'text/html', doc);
});
function dataURLtoBlob(u) {
  var p = u.split(','), mime = p[0].match(/:(.*?);/)[1], bin = atob(p[1]), n = bin.length, arr = new Uint8Array(n);
  while (n--) { arr[n] = bin.charCodeAt(n); }
  return new Blob([arr], { type: mime });
}
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.getAttribute && t.getAttribute('data-wall3d')) {
    viewer.showWalls[t.getAttribute('data-wall3d')] = t.checked; viewer.draw();
  }
});

/* ---------------------------------------------------------------- 啟動 */
renderForm();
viewer = new D.Viewer3D($('cv3d'));
recalc();
window.__tile = { get state() { return S; }, get result() { return lastRes; }, recalc: recalc, setState: function (o) { S = o; renderForm(); recalc(); } };
})();
