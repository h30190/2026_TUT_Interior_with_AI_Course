/* 建議書產生：把 engine 的結果整理成 HTML（表格＋圖）。不做算量，只排版與說明文字。 */
'use strict';
(function (root) {
var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.TileEngine;
var D = (typeof module !== 'undefined' && module.exports) ? require('./draw.js') : root.TileDraw;
var f1 = D.f1, esc = D.esc;

function pct(x) { return (x * 100).toFixed(1) + '%'; }
function m2(x) { return x.toFixed(2) + ' m²'; }
function tag(t, cls) { return '<span class="tag ' + (cls || '') + '">' + t + '</span>'; }
function table(head, rows, cls) {
  return '<table class="' + (cls || '') + '"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
}

var METHOD_NOTE = {
  'stack-h': '最簡單、施工快、對線容易；磚縫成十字，視覺整齊。',
  'stack-v': '同對縫，磚長邊直立，視覺拉高、牆面顯得較高。',
  'run2-h': '磚縫錯開 1/2，視覺較活潑，能遮部分地面不平；切磚略多。',
  'run2-v': '直貼交丁，常用於牆面拉高感；切磚略多。',
  'run3-h': '錯縫 1/3（長磚常用，避免 1/2 時的磚面翹邊對齊）；切磚較多。',
  'run3-v': '直貼 1/3 交丁；切磚較多。',
  'diag': '45° 斜貼：視覺放大空間，但切磚最多、損耗最大、工資較高。',
  'herring-h': '人字拼：質感高，但切磚與損耗多、工資高，需熟練師傅。',
  'herring-v': '人字拼（直）：同上。'
};

function startText(res, kind, w) {
  var pj = res.project;
  if (kind === 'floor') {
    var fl = res.floor, o = fl.chosen.origin, n = fl.surface.net;
    if (!o) { return '（無）'; }
    var why = fl.chosen.start.indexOf('drain') === 0 && pj.drain.mode === 'point' && pj.drain.slope > 0 ?
      '（因為有洩水坡度，系統優先讓落水孔對正磚縫，四個斜面可對稱切割）' : '';
    return '「' + E.FLOOR_STARTS[fl.chosen.start] + '」' + why + '。起始磚角點座標 (x, y) = (' + f1(o[0]) + ', ' + f1(o[1]) + ') cm（以房間西北角粗胚面為原點，x 往東、y 往南）；' +
      '換算：距西側貼磚淨邊 ' + f1(o[0] - n[0]) + ' cm、距北側貼磚淨邊 ' + f1(o[1] - n[1]) + ' cm。先在地面彈出 x = ' + f1(o[0]) + ' 與 y = ' + f1(o[1]) + ' 兩條放樣線，從交點開始排第一片磚。';
  }
  var wi = res.walls[w], oo = wi.chosen.origin;
  if (!oo) { return '（無）'; }
  return '「' + E.WALL_STARTS[wi.chosen.start] + '」。起始磚角點 u = ' + f1(oo[0]) + ' cm（自' + ((w === 'N' || w === 'S') ? '西' : '北') + '端量起）、z = ' + f1(oo[1]) +
    ' cm（自結構樓板量起）。先彈出垂直線 u = ' + f1(oo[0]) + ' 與水平線 z = ' + f1(oo[1]) + '，由交點起貼。';
  void pj;
}

function cornerText(res, w) {
  var sf = res.walls[w].surface, e = sf.e;
  var ex = sf.deduct[0] + sf.deduct[1];
  if (ex <= 0) { return E.WALL_ZH[w] + '：長度 ' + sf.len + ' cm，牆磚通到轉角，不扣除。'; }
  return E.WALL_ZH[w] + '：長度 ' + sf.len + ' cm − 兩端相鄰牆磚完成厚（磚 ' + res.wallTile.t + ' mm ＋ 黏著劑 ' + f1(E.ADH * 10) + ' mm ＝ ' + f1(e) + ' cm）× 2 ＝ 淨長 ' + f1(sf.net[2] - sf.net[0]) + ' cm。';
}

function wallCompareRows(res) {
  var wt = res.wallTile, agg = {}, order = [];
  Object.keys(res.walls).forEach(function (w) {
    res.walls[w].compare.forEach(function (r) {
      if (!agg[r.method]) { agg[r.method] = { method: r.method, pieces: 0, cut: 0, slivers: 0, area: 0, starts: [] }; order.push(r.method); }
      var a = agg[r.method]; a.pieces += r.ev.pieces; a.cut += r.ev.cut; a.slivers += r.ev.slivers; a.starts.push(w + ':' + r.start);
    });
  });
  var area = res.wallTotal.netArea;
  return order.map(function (m) {
    var a = agg[m]; a.waste = Math.max(0, (a.pieces * wt.w * wt.h / 1e4 - res.wallTotal.usedArea) / res.wallTotal.usedArea); a.score = a.pieces + 3 * a.slivers + 0.3 * a.cut; return a;
  }).sort(function (x, y) { return x.score - y.score; });
}

function compareTable(res, kind) {
  var pj = res.project, tile = kind === 'floor' ? res.floorTile : res.wallTile, rows, area, bestMethod;
  var selected = kind === 'floor' ? res.floor.chosen.method : null;
  if (kind === 'floor') {
    area = res.floor.netArea;
    rows = res.floor.compare.map(function (r) {
      return { method: r.method, pieces: r.ev.pieces, cut: r.ev.cut, slivers: r.ev.slivers, minCut: r.ev.minCut, start: r.start, score: r.score,
               waste: Math.max(0, (r.ev.pieces * tile.w * tile.h - r.ev.used) / r.ev.used) };
    });
  } else {
    area = res.wallTotal.netArea;
    rows = wallCompareRows(res).map(function (a) { return { method: a.method, pieces: a.pieces, cut: a.cut, slivers: a.slivers, minCut: null, start: null, score: a.score, waste: a.waste }; });
  }
  bestMethod = rows[0].method;
  var minPieces = Math.min.apply(null, rows.map(function (r) { return r.pieces; }));
  // 縮圖
  var thumbWall = null, maxA = -1;
  if (kind === 'wall') { Object.keys(res.walls).forEach(function (w) { if (res.walls[w].netArea > maxA) { maxA = res.walls[w].netArea; thumbWall = w; } }); }
  var html = table(['縮圖', '貼法', '片數', '切磚', '細條切磚', '損耗率', '採購（含破損 ' + pj.breakagePct + '%）', '箱數', kind === 'floor' ? '最佳起點' : '', '評語'].filter(function (h, i) { return !(kind === 'wall' && i === 8); }),
    rows.map(function (r) {
      var th = '';
      try {
        if (kind === 'floor') { th = D.thumbSVG(E.layoutFor(pj, 'floor', null, r.method, r.start), res.floor.surface, 'floor', 110); }
        else {
          var wr = res.walls[thumbWall].compare.filter(function (x) { return x.method === r.method; })[0];
          th = D.thumbSVG(E.layoutFor(pj, 'wall', thumbWall, r.method, wr.start), res.walls[thumbWall].surface, 'wall', 110);
        }
      } catch (e) { th = ''; }
      var purchase = Math.ceil(r.pieces * (1 + pj.breakagePct / 100) - 1e-9);
      var note = METHOD_NOTE[r.method] || '';
      if (r.slivers > 0) { note += ' ⚠ 有 ' + r.slivers + ' 片細條切磚。'; }
      var tags = (r.method === bestMethod ? tag('系統推薦', 'good') + ' ' : '') + (r.pieces === minPieces ? tag('片數最省', 'good') + ' ' : '') + (r.method === selected ? tag('目前採用', 'sel') + ' ' : '');
      var cells = [th, '<b>' + E.METHOD_NAMES[r.method] + '</b><br>' + tags, r.pieces, r.cut, r.slivers, pct(r.waste), purchase, Math.ceil(purchase / tile.perBox - 1e-9)];
      if (kind === 'floor') { cells.push(E.FLOOR_STARTS[r.start]); }
      cells.push(note);
      return cells;
    }), 'cmp');
  if (kind === 'floor' && pj.drain.mode === 'point' && pj.drain.slope > 0) { html += '<p class="note">「系統推薦」已加入洩水考量：點收水的地面優先讓落水孔對正磚縫（便於四向對稱切割），所以可能不是片數最省的那一種。</p>'; }
  if (kind === 'wall') { html += '<p class="note">縮圖為面積最大的' + E.WALL_ZH[thumbWall] + '；片數為各牆分別以自己最佳起點排磚後的加總，不同牆之間不互相利用餘料。</p>'; }
  return html;
}

function floorSection(res) {
  var pj = res.project, fl = res.floor, ft = res.floorTile, ev = fl.chosen.ev, sl = fl.slope, sf = fl.surface;
  var h = '<section class="sec"><h2>一、平面磁磚計畫建議書</h2>';
  h += '<div class="figbox">' + D.planSVG(res) + '</div>';
  h += '<h3>1. 採用條件</h3>' + table(['項目', '內容'], [
    ['地磚', esc(ft.name) + '（' + ft.w + '×' + ft.h + ' cm、厚 ' + ft.t + ' mm、每箱 ' + ft.perBox + ' 片）'],
    ['磁磚縫／黏著劑厚', '0.2 cm（固定）／0.5 cm（固定）'],
    ['施工順序', pj.sequence === 'wallFirst' ? '先貼牆、後貼地：地磚淨區域已扣除四周牆磚完成厚' : '先貼地、後貼牆：地磚鋪到粗胚牆面，牆磚由地磚面起貼'],
    ['貼磚淨區域', f1(sf.net[2] - sf.net[0]) + ' × ' + f1(sf.net[3] - sf.net[1]) + ' cm（粗胚 ' + pj.room.L + ' × ' + pj.room.D + ' cm，每邊扣牆磚完成厚 ' + f1(sf.ins.W) + ' cm）'],
    ['淨貼磚面積', m2(fl.netArea) + '（已扣落水孔 ' + pj.drain.size + '×' + pj.drain.size + ' cm）'],
    ['貼法', E.METHOD_NAMES[fl.chosen.method] + (pj.floorMethod === 'auto' ? '（系統依片數最省自動選用）' : '（使用者指定）')]
  ]);
  h += '<h3>2. 起始磚放樣點</h3><p class="start">' + startText(res, 'floor') + '</p>';
  h += '<h3>3. 數量</h3>' + table(['項目', '數量', '說明'], [
    ['淨貼磚面積', m2(fl.netArea), ''],
    ['理論最少片數', fl.theory + ' 片', '實際貼磚面積 ÷ 單片面積（不含切割損失）'],
    ['實際需要片數', fl.pieces + ' 片', '整磚 ' + ev.full + '、切磚 ' + ev.cut + '、落水孔開孔磚 ' + ev.holeCut + '（每片切磚都算一整片，不計餘料再利用）'],
    ['損耗率', pct(fl.waste), '被切掉的邊料占比：（實際片數 × 單片面積 − 實際貼磚面積）÷ 實際貼磚面積（磚縫面積不算）'],
    ['採購片數', fl.purchase + ' 片', '實際片數 + 破損預留 ' + pj.breakagePct + '%'],
    ['箱數', fl.boxes + ' 箱', '每箱 ' + ft.perBox + ' 片，無條件進位'],
    ['最小切邊', ev.minCut == null ? '—' : f1(ev.minCut) + ' cm', ev.slivers > 0 ? '⚠ 有 ' + ev.slivers + ' 片細條切磚' : '無細條切磚（門檻：< ' + f1(ev.sliverMin) + ' cm 算細條）'],
    ['地面黏著劑', res.adhesive.floorKg.toFixed(1) + ' kg', m2(fl.netArea) + ' × ' + res.adhesive.kgPerM2.toFixed(1) + ' kg/m²（0.5 cm 厚）']
  ]);
  h += '<h3>4. 落水孔與洩水坡度</h3>' + table(['項目', '內容'], [
    ['落水孔位置', '(' + pj.drain.x + ', ' + pj.drain.y + ') cm，格柵 ' + pj.drain.size + ' × ' + pj.drain.size + ' cm；與落水孔重疊的磚 ' + ev.holeCut + ' 片需開孔／對角切割'],
    ['洩水方式', pj.drain.mode === 'point' ? '四周往落水孔（點收水）' : '單向往' + E.WALL_ZH[pj.drain.dir] + '方向'],
    ['洩水坡度', pj.drain.slope + '%（每 100 cm 下降 ' + pj.drain.slope + ' cm）'],
    ['最大落差', f1(sl.maxFall) + ' cm（最遠角到落水孔）；平均 ' + f1(sl.avgFall) + ' cm'],
    ['完成面最高點離樓板', sl.maxLevel.toFixed(2) + ' cm（磚＋黏著劑 ' + sl.ef.toFixed(1) + ' ＋ 洩水高差 ' + sl.maxFall.toFixed(2) + '）'],
    ['完成面高度限制', sl.limit > 0 ? sl.limit + ' cm　' + (sl.limitOk ? '✔ 符合，餘裕 ' + sl.headroom.toFixed(2) + ' cm' : '⚠ 超出 ' + (-sl.headroom).toFixed(2) + ' cm；' + (sl.maxSlopeForLimit > 0 ? '此限制下坡度最多約 ' + sl.maxSlopeForLimit.toFixed(2) + '%' : '磚＋黏著劑已超過限制')) : '未設定（0＝不限）'],
    ['找坡砂漿量（估）', sl.bedVolumeM3.toFixed(3) + ' m³', ],
    ['單片磚面內高低差', (sl.lip * 10).toFixed(1) + ' mm' + (sl.lipOk ? '（≤ 3 mm，磚面可貼平）' : '（> 3 mm，建議對角線 ≤ ' + Math.floor(sl.maxDiag) + ' cm、正方形磚邊長 ≤ ' + sl.maxTileSide + ' cm，或落水孔周圍對角切割）')],
    ['落水孔周圍', '約 ' + sl.nearDrainTiles + ' 片磚受洩水面影響，建議此範圍先放樣再貼，磚縫對準洩水方向']
  ]);
  if (pj.drain.mode === 'point') { h += '<p class="note">點收水時，磚面必須做成「圍著落水孔向下傾斜」的錐形面；大磚是平面，無法服貼，因此落水孔四周的磚要沿對角線切成 4 個斜面（四向收水），或改用小磚。</p>'; }
  if (pj.drain.slope > 0 && res.wallBase) {
    var efr = ft.t / 10 + E.ADH;
    h += '<h4>牆腳地面高差（洩水造成：貼地第一排壁磚的下緣要沿此線切斜）</h4>' + table(['牆', '長度', '起點', '中點', '終點', '最低', '最高', '下緣離結構樓板'],
      E.WALLS.map(function (w) {
        var b = res.wallBase[w], p = function (v) { return '+' + v.toFixed(2) + ' cm'; };
        return [E.WALL_ZH[w], f1(b.len) + ' cm', p(b.atStart), p(b.atMid), p(b.atEnd), p(b.min) + '（距起點 ' + f1(b.minAt) + '）', p(b.max) + '（距起點 ' + f1(b.maxAt) + '）', f1(efr + b.min) + '～' + f1(efr + b.max) + ' cm'];
      })) +
      '<p class="note">高差＝比落水孔處的完成面高出多少。起點：北牆、南牆自西端；東牆、西牆自北端。下緣離結構樓板＝磚厚＋黏著劑 ' + f1(efr) + ' cm＋該處高差。3D 模擬圖下方的「洩水剖面線」可以拉動，直接看任一位置的坡度。</p>';
  }
  h += '<h3>5. 門檻</h3>' + (res.threshold.count ? table(['門', '位置', '長度', '規格'],
    res.threshold.items.map(function (i) { return [i.id, E.WALL_ZH[i.wall], i.len + ' cm', esc(pj.threshold.label) + '（寬 ' + pj.threshold.width + '、厚 ' + pj.threshold.thick + ' cm，高出地磚 ' + pj.threshold.riseAbove + ' cm）']; }))
    + '<div class="figbox small">' + D.thresholdSVG(res) + '</div>' : '<p>本案沒有門。</p>');
  h += '<h3>6. 貼法比較（地面）</h3>' + compareTable(res, 'floor');
  return h + '</section>';
}

function wallSection(res) {
  var pj = res.project, wt = res.wallTile, wtot = res.wallTotal;
  var h = '<section class="sec"><h2>二、立面磁磚計畫建議書</h2>';
  h += '<h3>1. 採用條件與尺寸扣除</h3>' + table(['項目', '內容'], [
    ['壁磚', esc(wt.name) + '（' + wt.w + '×' + wt.h + ' cm、厚 ' + wt.t + ' mm、每箱 ' + wt.perBox + ' 片）'],
    ['磁磚縫／黏著劑厚', '0.2 cm（固定）／0.5 cm（固定）'],
    ['磚＋黏著劑完成厚', f1(wt.t / 10) + ' + ' + f1(E.ADH) + ' = ' + f1(wt.t / 10 + E.ADH) + ' cm'],
    ['貼到高度', pj.wallTop + ' cm（天花板 ' + pj.room.H + ' cm）' + (pj.wallTop < pj.room.H ? '，頂端加收邊條' : '')],
    ['貼磚起算高度', pj.sequence === 'wallFirst' ? '從結構樓板起（先貼牆）' : '從地磚完成面起（先貼地，扣除地磚厚＋黏著劑 ' + f1(res.floor.surface.ef) + ' cm）'],
    ['轉角收法', pj.corner === 'butt' ? '長牆通到轉角、短牆被夾住（短牆兩端扣牆磚完成厚）' : '每面牆兩端都扣牆磚完成厚（保守）']
  ]);
  h += '<ul class="deduct">' + Object.keys(res.walls).map(function (w) { return '<li>' + esc(cornerText(res, w)) + '</li>'; }).join('') + '</ul>';
  Object.keys(res.walls).forEach(function (w, idx) {
    var wi = res.walls[w], ev = wi.chosen.ev;
    h += '<div class="wallblock"><h3>' + (idx + 2) + '. ' + E.WALL_ZH[w] + '立面</h3><div class="figbox">' + D.wallSVG(res, w) + '</div>';
    h += table(['項目', '數量', '說明'], [
      ['淨貼磚面積', m2(wi.netArea), '已扣門窗與開孔'],
      ['貼法', E.METHOD_NAMES[wi.chosen.method], ''],
      ['起始磚放樣點', '', startText(res, 'wall', w)],
      ['實際需要片數', wi.pieces + ' 片', '整磚 ' + ev.full + '、切磚 ' + ev.cut + '、洞口／開孔磚 ' + ev.holeCut + (wi.fixtureTiles ? '（其中給排水孔相關 ' + wi.fixtureTiles + ' 片）' : '')],
      ['損耗率', pct(wi.waste), ''],
      ['最小切邊', ev.minCut == null ? '—' : f1(ev.minCut) + ' cm', ev.slivers > 0 ? '⚠ 有 ' + ev.slivers + ' 片細條切磚' : '']
    ]) + '</div>';
  });
  h += '<h3>牆面合計</h3>' + table(['項目', '數量', '說明'], [
    ['淨貼磚面積', m2(wtot.netArea), ''],
    ['理論最少片數', wtot.theory + ' 片', ''],
    ['實際需要片數', wtot.pieces + ' 片', '各牆分別計算後加總'],
    ['損耗率', pct(wtot.waste), ''],
    ['採購片數', wtot.purchase + ' 片', '含破損預留 ' + pj.breakagePct + '%'],
    ['箱數', wtot.boxes + ' 箱', '每箱 ' + wt.perBox + ' 片'],
    ['牆面黏著劑', res.adhesive.wallKg.toFixed(1) + ' kg', m2(wtot.netArea) + ' × ' + res.adhesive.kgPerM2.toFixed(1) + ' kg/m²（0.5 cm 厚）']
  ]);
  h += '<h3>貼法比較（牆面）</h3>' + compareTable(res, 'wall');
  return h + '</section>';
}

function summarySection(res) {
  var pj = res.project, tr = res.trim, ad = res.adhesive, fl = res.floor, wt = res.wallTotal;
  var h = '<section class="sec"><h2>五、材料總表</h2>';
  h += table(['材料', '規格', '淨量', '實際片數／用量', '損耗', '採購', '包裝'], [
    ['地磚', esc(res.floorTile.name), m2(fl.netArea), fl.pieces + ' 片', pct(fl.waste), fl.purchase + ' 片', fl.boxes + ' 箱'],
    ['壁磚', esc(res.wallTile.name), m2(wt.netArea), wt.pieces + ' 片', pct(wt.waste), wt.purchase + ' 片', wt.boxes + ' 箱'],
    ['黏著劑（0.5 cm）', res.adhesive.kgPerM2.toFixed(1) + ' kg/m²', m2(fl.netArea + wt.netArea), ad.totalKg.toFixed(1) + ' kg', '—', ad.totalKg.toFixed(1) + ' kg', ad.bags + ' 包（' + ad.bagKg + ' kg／包）'],
    [esc(tr.label), '單支 ' + tr.pieceLen + ' cm', (tr.totalCm / 100).toFixed(2) + ' m', (tr.totalCm / 100).toFixed(2) + ' m', pj.trimLossPct + '%', (tr.withLossCm / 100).toFixed(2) + ' m', tr.pieces + ' 支'],
    ['門檻', esc(pj.threshold.label), '—', res.threshold.count + ' 支', '—', res.threshold.count + ' 支', '長度＝門寬']
  ].concat((res.zones || []).map(function (zi) {
    var t = zi.tile, lab = '區域 ' + esc(zi.zone.id + ' ' + zi.zone.label);
    return zi.areaOnly ? [lab, esc(t.name) + '（厚 ' + t.t + ' mm）', m2(zi.area), zi.kg.toFixed(1) + ' kg', '—', zi.kg.toFixed(1) + ' kg', zi.bags + ' 袋（' + t.perBox + ' kg／袋）']
      : [lab, esc(t.name), m2(zi.area), zi.pieces + ' 片', pct(zi.waste), zi.purchase + ' 片', zi.boxes + ' 箱'];
  })));
  if (tr.items.length) { h += '<h3>收邊條明細</h3>' + table(['位置', '長度'], tr.items.map(function (i) { return [esc(i.label), (i.len / 100).toFixed(2) + ' m']; })); }
  return h + '</section>';
}

function zoneSection(res) {
  var pj = res.project, zs = res.zones || [];
  var h = '<section class="sec"><h2>三、特殊區域（材質變換、降板、分界收邊）</h2>';
  if (!zs.length) { return h + '<p>本案沒有設定特殊區域。需要時在表單⑧新增：例如牆面局部換成大理石、抿石子、馬賽克，或地面某區要降板 1 cm、加收邊條。</p></section>'; }
  var rows = zs.map(function (zi) {
    var z = zi.zone, t = zi.tile, r = zi.rect, ev = zi.chosen && zi.chosen.ev;
    var pos = zi.kind === 'floor' ? '地面 x ' + f1(r[0]) + '～' + f1(r[2]) + '、y ' + f1(r[1]) + '～' + f1(r[3]) : E.WALL_ZH[zi.surface] + ' 沿牆 ' + f1(r[0]) + '～' + f1(r[2]) + '、高 ' + f1(r[1]) + '～' + f1(r[3]);
    var how = zi.areaOnly ? '整面施作（不排磚），厚 ' + t.t + ' mm' : E.METHOD_NAMES[zi.chosen.method] + '，起始 ' + (E.FLOOR_STARTS[zi.chosen.start] || E.WALL_STARTS[zi.chosen.start] || zi.chosen.start);
    var qty = zi.areaOnly ? zi.kg.toFixed(1) + ' kg（' + m2(zi.area) + ' × ' + t.t + ' mm × ' + t.cover + '）' : zi.pieces + ' 片（整磚 ' + ev.full + '、切磚 ' + ev.cut + '、開孔 ' + ev.holeCut + '）';
    var buy = zi.areaOnly ? zi.bags + ' 袋（' + t.perBox + ' kg／袋）' : zi.purchase + ' 片（' + zi.boxes + ' 箱）';
    var lv = zi.kind === 'floor' ? (zi.drop > 0 ? '比主地面低 ' + zi.drop + ' cm' : '與主地面齊平') : (Math.abs(zi.step) < 0.05 ? '與主牆磚齊平' : (zi.step > 0 ? '凸出主牆磚面 ' : '凹入主牆磚面 ') + Math.abs(zi.step).toFixed(2) + ' cm');
    var trim = zi.trimLen > 0 ? (zi.trimLen / 100).toFixed(2) + ' m（' + esc(pj.trim.label) + '）' : '無（與主鋪面交界長 ' + (zi.boundaryLen / 100).toFixed(2) + ' m）';
    return [esc(z.id + ' ' + z.label), pos, esc(t.name) + (zi.areaOnly ? '' : '（' + t.w + '×' + t.h + '、厚 ' + t.t + ' mm）'), m2(zi.area), how, qty, zi.areaOnly ? '—' : pct(zi.waste), buy, zi.areaOnly ? '—' : zi.adhesiveKg.toFixed(1) + ' kg', trim, lv];
  });
  h += table(['區域', '位置（cm）', '材料', '淨面積', '排法', '實際用量', '損耗', '採購', '黏著劑', '分界收邊', '高低差'], rows);
  h += '<p class="note">區域從主鋪面「扣掉」後各自排磚，所以主地面／主牆面的片數已經不含區域。降板＝該區完成面比同位置的主地面低；分界收邊＝與主鋪面交界的邊加收邊條（貼在牆邊或洞口邊的邊不算）。材料厚度與主牆磚不同時，交界會有高低差，請依高低差決定收邊條型式。</p>';
  return h + '</section>';
}

function warningsSection(res) {
  if (!res.warnings.length) { return '<section class="sec"><h2>六、注意事項</h2><p>檢查沒有發現需要特別注意的項目。</p></section>'; }
  return '<section class="sec"><h2>六、注意事項</h2><ul class="warn">' + res.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></section>';
}

function assumptionsSection() {
  return '<section class="sec small"><h2>七、計算假設與限制</h2><ul>' +
    '<li>單位 cm；磁磚縫 0.2 cm、黏著劑 0.5 cm 為固定值。磁磚尺寸以標稱計，磚距＝磚寬＋0.2 cm。</li>' +
    '<li>片數：每一片被切到的磚都算一整片（不計餘料再利用），所以是保守估計；實際可再利用餘料，用量會略少。</li>' +
    '<li>黏著劑用量＝淨貼磚面積 × 0.5 cm × 耗量係數（預設 1.6 kg/m²/mm，可在「施工選項」調整），以廠牌規格為準。</li>' +
    '<li>細條切磚：切邊 < max(4 cm，磚短邊 20%) 視為細條；單片磚面高低差建議 ≤ 3 mm，皆為建議值，非法規。</li>' +
    '<li>人字拼假設磚長約為磚寬的整數倍；非整數倍時以最接近的整數倍近似。</li>' +
    '<li>矩形房間、牆面為矩形；柱、凸牆、斜牆與管道間不在計算範圍。給水點開孔以正方形外框近似。</li>' +
    '<li>本建議書為估算與放樣參考，不是施工圖；下單與施工前請以現場複丈與廠商規格確認。</li></ul></section>';
}

function reportHTML(res) {
  if (!res.ok) { return ''; }
  return floorSection(res) + wallSection(res) + zoneSection(res) + '<section class="sec" id="sec3d"><h2>四、3D 模擬圖</h2><div id="slot3d"></div></section>' + summarySection(res) + warningsSection(res) + assumptionsSection();
}

var api = { reportHTML: reportHTML, compareTable: compareTable };
if (typeof module !== 'undefined' && module.exports) { module.exports = api; } else { root.TileReport = api; }
})(typeof window !== 'undefined' ? window : this);
