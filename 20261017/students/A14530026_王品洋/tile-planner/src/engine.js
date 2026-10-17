/* 磁磚計畫計算核心：純函式，不碰 DOM，Node 與瀏覽器都能跑。
   單位一律 cm（面積輸出 m²）。座標：房間西北角（粗胚面）為原點，x 往東、y 往南；
   牆面座標 u 沿牆（北南牆從西端、東西牆從北端量起）、z 從結構樓板往上。
   固定規則（業主指定）：磁磚縫 0.2cm、黏著劑厚 0.5cm。 */
'use strict';
(function (root) {

var JOINT = 0.2;        // cm，磁磚縫（固定）
var ADH = 0.5;          // cm，黏著劑厚度（固定）
var EPS = 1e-6;
var WALLS = ['N', 'E', 'S', 'W'];
var WALL_ZH = { N: '北牆', E: '東牆', S: '南牆', W: '西牆' };

/* ---------------------------------------------------------------- 幾何 */
function polyArea(p) {
  var s = 0, i, a, b;
  for (i = 0; i < p.length; i++) { a = p[i]; b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}

function clipHalf(poly, axis, val, keepGE) {
  var out = [], n = poly.length, i, a, b, ain, bin, t;
  for (i = 0; i < n; i++) {
    a = poly[i]; b = poly[(i + 1) % n];
    ain = keepGE ? a[axis] >= val - 1e-12 : a[axis] <= val + 1e-12;
    bin = keepGE ? b[axis] >= val - 1e-12 : b[axis] <= val + 1e-12;
    if (ain) { out.push(a); }
    if (ain !== bin) {
      t = (val - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/* 凸多邊形 ∩ 軸向矩形 r=[x0,y0,x1,y1] */
function clipRect(poly, r) {
  var p = clipHalf(poly, 0, r[0], true);
  if (p.length) { p = clipHalf(p, 0, r[2], false); }
  if (p.length) { p = clipHalf(p, 1, r[1], true); }
  if (p.length) { p = clipHalf(p, 1, r[3], false); }
  return p;
}

function bboxOf(rects) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  rects.forEach(function (r) {
    b[0] = Math.min(b[0], r[0]); b[1] = Math.min(b[1], r[1]);
    b[2] = Math.max(b[2], r[2]); b[3] = Math.max(b[3], r[3]);
  });
  return b;
}

function rectArea(r) { return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]); }
function interRect(a, b) {
  var r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return (r[2] > r[0] && r[3] > r[1]) ? r : null;
}

/* ---------------------------------------------------------------- 排磚圖樣產生 */
/* 水平座標系：磚寬 tw 沿 x。pattern: stack／run2／run3 */
function genAxis(box, tw, th, pattern, ox, oy, j) {
  var px = tw + j, py = th + j, out = [], k, r, c, off, rmin, rmax, cmin, cmax, x, y;
  k = pattern === 'run2' ? 2 : (pattern === 'run3' ? 3 : 1);
  rmin = Math.floor((box[1] - oy) / py) - 1; rmax = Math.ceil((box[3] - oy) / py) + 1;
  for (r = rmin; r <= rmax; r++) {
    off = k > 1 ? (((r % k) + k) % k) * px / k : 0;
    cmin = Math.floor((box[0] - ox - off) / px) - 1; cmax = Math.ceil((box[2] - ox - off) / px) + 1;
    for (c = cmin; c <= cmax; c++) {
      x = ox + off + c * px; y = oy + r * py;
      if (x > box[2] || x + tw < box[0] || y > box[3] || y + th < box[1]) { continue; }
      out.push([[x, y], [x + tw, y], [x + tw, y + th], [x, y + th]]);
    }
  }
  return out;
}

function swapPoly(p) { return p.map(function (q) { return [q[1], q[0]]; }); }

/* 人字拼（90°）：磚長 ≈ m 倍磚寬（m≥2）。H 磚放在 (i-j) mod 2m == 0，V 磚放在 (i-j) mod 2m == 2m-1 */
function genHerring(box, L, S, ox, oy, j) {
  var s = S + j, m = Math.max(2, Math.round((L + j) / s)), len = m * s - j, out = [], i, k, imin, imax, jmin, jmax, d, x, y;
  imin = Math.floor((box[0] - ox) / s) - m - 1; imax = Math.ceil((box[2] - ox) / s) + 1;
  jmin = Math.floor((box[1] - oy) / s) - m - 1; jmax = Math.ceil((box[3] - oy) / s) + 1;
  for (i = imin; i <= imax; i++) {
    for (k = jmin; k <= jmax; k++) {
      d = (((i - k) % (2 * m)) + 2 * m) % (2 * m);
      x = ox + i * s; y = oy + k * s;
      if (d === 0) {
        if (x > box[2] || x + len < box[0] || y > box[3] || y + S < box[1]) { continue; }
        out.push([[x, y], [x + len, y], [x + len, y + S], [x, y + S]]);
      } else if (d === 2 * m - 1) {
        if (x > box[2] || x + S < box[0] || y > box[3] || y + len < box[1]) { continue; }
        out.push([[x, y], [x + S, y], [x + S, y + len], [x, y + len]]);
      }
    }
  }
  return out;
}

function genDiag(box, tw, th, ox, oy, j) {
  var ca = Math.SQRT1_2, sa = Math.SQRT1_2, px = tw + j, py = th + j, us = [], vs = [], out = [];
  var corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
  corners.forEach(function (p) {
    var dx = p[0] - ox, dy = p[1] - oy;
    us.push(dx * ca + dy * sa); vs.push(-dx * sa + dy * ca);
  });
  var cmin = Math.floor(Math.min.apply(null, us) / px) - 1, cmax = Math.ceil(Math.max.apply(null, us) / px) + 1;
  var rmin = Math.floor(Math.min.apply(null, vs) / py) - 1, rmax = Math.ceil(Math.max.apply(null, vs) / py) + 1;
  var c, r, loc, u0, v0;
  function w(u, v) { return [ox + u * ca - v * sa, oy + u * sa + v * ca]; }
  for (c = cmin; c <= cmax; c++) {
    for (r = rmin; r <= rmax; r++) {
      u0 = c * px; v0 = r * py;
      loc = [w(u0, v0), w(u0 + tw, v0), w(u0 + tw, v0 + th), w(u0, v0 + th)];
      var xs = loc.map(function (q) { return q[0]; }), ys = loc.map(function (q) { return q[1]; });
      if (Math.min.apply(null, xs) > box[2] || Math.max.apply(null, xs) < box[0] ||
          Math.min.apply(null, ys) > box[3] || Math.max.apply(null, ys) < box[1]) { continue; }
      out.push(loc);
    }
  }
  return out;
}

/* method：'stack-h'｜'stack-v'｜'run2-h'｜'run2-v'｜'run3-h'｜'run3-v'｜'diag'｜'herring-h'｜'herring-v'
   h＝磚長邊沿水平（x）方向，v＝長邊沿垂直（y）方向 */
function genTiles(box, tile, method, origin, j) {
  var parts = method.split('-'), pattern = parts[0], orient = parts[1] || 'h';
  var L = Math.max(tile.w, tile.h), S = Math.min(tile.w, tile.h), polys;
  if (pattern === 'diag') { return genDiag(box, tile.w, tile.h, origin[0], origin[1], j); }
  if (pattern === 'herring') {
    if (orient === 'v') {
      return genHerring([box[1], box[0], box[3], box[2]], L, S, origin[1], origin[0], j).map(swapPoly);
    }
    return genHerring(box, L, S, origin[0], origin[1], j);
  }
  if (orient === 'v') {
    polys = genAxis([box[1], box[0], box[3], box[2]], L, S, pattern, origin[1], origin[0], j);
    return polys.map(swapPoly);
  }
  return genAxis(box, L, S, pattern, origin[0], origin[1], j);
}

/* 這個貼法下，磚的「寬（x）× 高（y）」尺寸（供計算起始點位移） */
function tileDims(tile, method) {
  var parts = method.split('-'), pattern = parts[0], orient = parts[1] || 'h';
  var L = Math.max(tile.w, tile.h), S = Math.min(tile.w, tile.h);
  if (pattern === 'diag') { return [tile.w, tile.h]; }
  if (pattern === 'herring') {
    var m = Math.max(2, Math.round((L + JOINT) / (S + JOINT))), len = m * (S + JOINT) - JOINT;
    return orient === 'v' ? [S, len] : [len, S];
  }
  return orient === 'v' ? [S, L] : [L, S];
}

/* ---------------------------------------------------------------- 排磚評估 */
/* regionRects：貼磚區（彼此不重疊的矩形）；holes：開孔矩形（落水孔、門窗、給水孔）
   回傳片數、整磚、切磚、開孔磚、最小切邊、細條切磚數、損耗，keepPolys 時附上畫圖用多邊形 */
function evalTiles(tiles, regionRects, holes, tile, keepPolys) {
  var tileArea = tile.w * tile.h, S = Math.min(tile.w, tile.h);
  var sliverMin = Math.max(4, 0.2 * S);
  var res = { pieces: 0, full: 0, cut: 0, holeCut: 0, slivers: 0, minCut: Infinity, used: 0, polys: [] };
  tiles.forEach(function (t) {
    var inRegion = 0, clippedAll = [], i, c, holeA = 0, a;
    regionRects.forEach(function (r) {
      c = clipRect(t, r);
      if (c.length >= 3) { a = polyArea(c); if (a > 1e-4) { inRegion += a; clippedAll.push(c); } }
    });
    if (inRegion < 0.05) { return; }
    holes.forEach(function (h) {
      var hc = clipRect(t, h);
      if (hc.length >= 3) { holeA += polyArea(hc); }
    });
    var usable = inRegion - holeA;
    if (usable < 0.05) { return; }           // 整片落在開孔內，不需要這片磚
    var isFull = (tileArea - usable) < 1e-6 * tileArea && holeA < 1e-9;
    var kind = isFull ? 'full' : (holeA > 1e-9 ? 'hole' : 'cut');
    res.pieces++; res.used += usable;
    if (kind === 'full') { res.full++; }
    else if (kind === 'hole') { res.holeCut++; }
    else {
      res.cut++;
      // 最小切邊：取貼磚區內那一塊的外框短邊
      var xs = [], ys = [];
      clippedAll.forEach(function (p) { p.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
      var wd = Math.max.apply(null, xs) - Math.min.apply(null, xs), ht = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      var md = Math.min(wd, ht);
      if (md < res.minCut) { res.minCut = md; }
      if (md < sliverMin - 1e-9) { res.slivers++; }
    }
    if (keepPolys) { res.polys.push({ pts: t, clipped: clippedAll, kind: kind }); }
  });
  if (res.minCut === Infinity) { res.minCut = null; }
  res.tileArea = tileArea;
  res.sliverMin = sliverMin;
  return res;
}

/* ---------------------------------------------------------------- 專案正規化／驗證 */
/* 沒給（undefined／null）才用預設值；給了但不是數字（例如表單空白）→ NaN，交給 validate 報錯，不可默默換成預設值 */
function num(v, d) { if (v === undefined || v === null) { return d; } var x = parseFloat(v); return isFinite(x) ? x : NaN; }
function fin(v) { return typeof v === 'number' && isFinite(v); }
function sv(v) { return fin(v) ? v : '未填'; }     // 訊息用：空白欄位顯示「未填」而不是 NaN
/* 深層複製，保留 NaN（JSON 複製會把 NaN 變成 null，空白欄位就會被預設值吃掉） */
function clone(o) {
  if (Array.isArray(o)) { return o.map(clone); }
  if (o && typeof o === 'object') { var c = {}; Object.keys(o).forEach(function (k) { c[k] = clone(o[k]); }); return c; }
  return o;
}

function defaultProject() {
  return {
    name: '範例浴室',
    room: { L: 180, D: 240, H: 270, wallT: { N: 15, E: 15, S: 15, W: 15 } },
    wallTop: 240,
    sequence: 'wallFirst',      // wallFirst＝先貼牆後貼地；floorFirst＝先貼地後貼牆
    corner: 'butt',             // butt＝長牆通到底、短牆被夾住；both＝每面牆兩端都扣
    wallTiled: { N: true, E: true, S: true, W: true },
    tiles: [
      { id: 'F1', name: '地磚 30×30 止滑', w: 30, h: 30, t: 9, perBox: 11, use: 'floor' },
      { id: 'F2', name: '地磚 30×60', w: 30, h: 60, t: 9, perBox: 6, use: 'floor' },
      { id: 'W1', name: '壁磚 30×60', w: 30, h: 60, t: 8.5, perBox: 6, use: 'wall' },
      { id: 'W2', name: '壁磚 25×40', w: 25, h: 40, t: 8, perBox: 12, use: 'wall' }
    ],
    floorTileId: 'F1', wallTileId: 'W1',
    floorMethod: 'auto', floorStart: 'auto', wallMethod: 'auto', wallStart: 'auto',
    breakagePct: 3, adhesiveKgPerM2PerMm: 1.6, bagKg: 20, trimLossPct: 5,
    drain: { x: 60, y: 130, size: 10, slope: 1, mode: 'point', dir: 'N' },
    floorHeightLimit: 0,
    floorHoles: [],
    openings: [
      { id: 'D1', type: 'door', wall: 'S', offset: 50, width: 80, height: 200, sill: 0 },
      { id: 'WN1', type: 'window', wall: 'N', offset: 60, width: 60, height: 60, sill: 150 }
    ],
    fixtures: [
      { id: 'P1', kind: 'supply', wall: 'W', offset: 120, height: 100, dia: 2.5 },
      { id: 'P2', kind: 'supply', wall: 'W', offset: 140, height: 100, dia: 2.5 },
      { id: 'P3', kind: 'drain', wall: 'E', offset: 60, height: 30, dia: 5 }
    ],
    trim: { pieceLen: 250, outerCorners: [], jambDoor: true, jambWindow: true, topEdge: true, label: '陽角收邊條（PVC L 型）' },
    threshold: { label: '人造石門檻', width: 15, thick: 2, riseAbove: 1, material: '人造石' }
  };
}

function validate(pj) {
  var errs = [], warns = [], R = pj.room, i;
  if (!(R.L >= 50 && R.L <= 3000)) { errs.push('房間寬（東西向）須在 50～3000 cm，目前 ' + sv(R.L)); }
  if (!(R.D >= 50 && R.D <= 3000)) { errs.push('房間深（南北向）須在 50～3000 cm，目前 ' + sv(R.D)); }
  if (!(R.H >= 100 && R.H <= 600)) { errs.push('天花板高須在 100～600 cm，目前 ' + sv(R.H)); }
  if (!(pj.wallTop > 0 && pj.wallTop <= R.H)) { errs.push('牆磚貼到高度須大於 0 且不超過天花板高 ' + R.H + '，目前 ' + sv(pj.wallTop)); }
  [['牆磚貼到高度', pj.wallTop], ['破損預留', pj.breakagePct], ['黏著劑耗量', pj.adhesiveKgPerM2PerMm], ['收邊條損耗', pj.trimLossPct]].forEach(function (q) {
    if (!fin(q[1])) { errs.push(q[0] + '未填或不是數字'); }
  });
  if (!pj.tiles.length) { errs.push('磁磚表是空的，至少要有一種磁磚'); }
  var ids = {};
  pj.tiles.forEach(function (t) {
    if (!t.id) { errs.push('磁磚表有一列沒有編號'); }
    if (ids[t.id]) { errs.push('磁磚編號重複：' + t.id); }
    ids[t.id] = 1;
    if (!(t.w >= 2 && t.w <= 300) || !(t.h >= 2 && t.h <= 300)) { errs.push('磁磚 ' + t.id + ' 尺寸須在 2～300 cm（目前 ' + sv(t.w) + '×' + sv(t.h) + '）'); }
    if (!(t.t >= 3 && t.t <= 30)) { errs.push('磁磚 ' + t.id + ' 厚度須在 3～30 mm（目前 ' + sv(t.t) + '）'); }
    if (!(t.perBox >= 1 && Math.floor(t.perBox) === t.perBox)) { errs.push('磁磚 ' + t.id + ' 每箱片數須為正整數'); }
  });
  if (!pj.tiles.some(function (t) { return t.id === pj.floorTileId; })) { errs.push('找不到地磚編號 ' + pj.floorTileId); }
  if (!pj.tiles.some(function (t) { return t.id === pj.wallTileId; })) { errs.push('找不到壁磚編號 ' + pj.wallTileId); }
  var d = pj.drain;
  if (d) {
    if (!fin(d.x) || !fin(d.y)) { errs.push('落水孔位置未填或不是數字'); }
    else if (fin(R.L) && fin(R.D) && !(d.x > 0 && d.x < R.L && d.y > 0 && d.y < R.D)) { errs.push('落水孔位置 (' + d.x + ',' + d.y + ') 必須在房間 ' + R.L + '×' + R.D + ' 之內'); }
    if (!(d.size >= 3 && d.size <= 40)) { errs.push('落水孔尺寸須在 3～40 cm（目前 ' + sv(d.size) + '）'); }
    if (!(d.slope >= 0 && d.slope <= 5)) { errs.push('洩水坡度須在 0～5 %（目前 ' + sv(d.slope) + '）'); }
  }
  if (!fin(pj.floorHeightLimit) || pj.floorHeightLimit < 0 || pj.floorHeightLimit > 100) { errs.push('完成面高度限制須在 0～100 cm（0＝不限），目前 ' + sv(pj.floorHeightLimit)); }
  ['N', 'E', 'S', 'W'].forEach(function (w) {
    var t = R.wallT && R.wallT[w];
    if (!fin(t) || t < 0 || t > 100) { errs.push(WALL_ZH[w] + '牆厚度須在 0～100 cm（目前 ' + sv(t) + '）'); }
  });
  pj.floorHoles.forEach(function (h) {
    var lab = '地面開孔 ' + h.id;
    if (!fin(h.x) || !fin(h.y) || !fin(h.size)) { errs.push(lab + '：位置或尺寸未填或不是數字'); }
    else if (!(h.size >= 2 && h.size <= 40)) { errs.push(lab + '：尺寸須在 2～40 cm（目前 ' + h.size + '）'); }
    else if (fin(R.L) && fin(R.D) && !(h.x > 0 && h.x < R.L && h.y > 0 && h.y < R.D)) { errs.push(lab + '：位置 (' + h.x + ',' + h.y + ') 必須在房間之內'); }
  });
  pj.openings.forEach(function (o) {
    var len = (o.wall === 'N' || o.wall === 'S') ? R.L : R.D;
    var lab = WALL_ZH[o.wall] + (o.type === 'door' ? '門 ' : '窗 ') + o.id;
    if (WALLS.indexOf(o.wall) < 0) { errs.push(lab + '：牆別必須是 N／E／S／W'); return; }
    if (!fin(o.offset) || !fin(o.width) || !fin(o.height) || !fin(o.sill)) { errs.push(lab + '：位置、寬、高、窗台高有欄位未填或不是數字'); return; }
    if (!(o.width > 0) || !(o.height > 0)) { errs.push(lab + '：寬與高必須大於 0'); }
    if (o.offset < 0 || o.offset + o.width > len + 1e-9) { errs.push(lab + '：offset＋寬（' + (o.offset + o.width) + '）超出牆長 ' + len); }
    if (o.type === 'door' && o.sill !== 0) { warns.push(lab + '：門的窗台高視為 0'); }
    if (o.sill < 0 || o.sill + o.height > R.H + 1e-9) { errs.push(lab + '：高度範圍（' + o.sill + '～' + (o.sill + o.height) + '）超出天花板高 ' + R.H); }
  });
  pj.fixtures.forEach(function (f) {
    var len = (f.wall === 'N' || f.wall === 'S') ? R.L : R.D;
    var lab = '給排水點 ' + f.id + '（' + WALL_ZH[f.wall] + '）';
    if (WALLS.indexOf(f.wall) < 0) { errs.push(lab + '：牆別必須是 N／E／S／W'); return; }
    if (!fin(f.offset) || !fin(f.height) || !fin(f.dia) || !(f.dia > 0)) { errs.push(lab + '：位置、高度、孔徑有欄位未填、不是數字或不大於 0'); return; }
    if (f.offset - f.dia / 2 < 0 || f.offset + f.dia / 2 > len) { errs.push(lab + '：位置超出牆長 ' + len); }
    if (f.height - f.dia / 2 < 0 || f.height + f.dia / 2 > R.H) { errs.push(lab + '：高度超出 0～' + R.H); }
  });
  // 洞口彼此不得重疊（同一面牆）
  var byWall = {};
  pj.openings.forEach(function (o) { if (fin(o.offset) && fin(o.width) && fin(o.height) && fin(o.sill)) { (byWall[o.wall] = byWall[o.wall] || []).push(o); } });
  Object.keys(byWall).forEach(function (w) {
    var a = byWall[w], x, y;
    for (x = 0; x < a.length; x++) {
      for (y = x + 1; y < a.length; y++) {
        var ra = [a[x].offset, a[x].sill, a[x].offset + a[x].width, a[x].sill + a[x].height];
        var rb = [a[y].offset, a[y].sill, a[y].offset + a[y].width, a[y].sill + a[y].height];
        if (interRect(ra, rb)) { errs.push(WALL_ZH[w] + '：' + a[x].id + ' 與 ' + a[y].id + ' 重疊'); }
      }
    }
  });
  if (!(pj.trim.pieceLen > 0)) { errs.push('收邊條單支長度必須大於 0'); }
  if (!(pj.bagKg > 0)) { errs.push('黏著劑每包重量必須大於 0'); }
  if (pj.breakagePct < 0 || pj.breakagePct > 30) { errs.push('破損預留須在 0～30 %'); }
  void i;
  return { errors: errs, warnings: warns };
}

function normalize(raw) {
  var base = defaultProject(), pj = clone(raw || base);
  var wt0 = (pj.room && pj.room.wallT) || base.room.wallT;
  pj.room = { L: num(pj.room && pj.room.L, base.room.L), D: num(pj.room && pj.room.D, base.room.D), H: num(pj.room && pj.room.H, base.room.H) };
  pj.room.wallT = { N: num(wt0.N, 0), E: num(wt0.E, 0), S: num(wt0.S, 0), W: num(wt0.W, 0) };
  pj.wallTop = num(pj.wallTop, pj.room.H);
  pj.sequence = pj.sequence === 'floorFirst' ? 'floorFirst' : 'wallFirst';
  pj.corner = pj.corner === 'both' ? 'both' : 'butt';
  pj.wallTiled = pj.wallTiled || base.wallTiled;
  WALLS.forEach(function (w) { pj.wallTiled[w] = pj.wallTiled[w] !== false; });
  pj.tiles = (pj.tiles || base.tiles).map(function (t) {
    return { id: String(t.id || ''), name: String(t.name || t.id || ''), w: num(t.w, NaN), h: num(t.h, NaN), t: num(t.t, NaN),
             perBox: num(t.perBox, 1), use: t.use || 'both' };
  });
  pj.floorTileId = pj.floorTileId || (pj.tiles[0] && pj.tiles[0].id) || ''; pj.wallTileId = pj.wallTileId || (pj.tiles[0] && pj.tiles[0].id) || '';
  pj.floorMethod = pj.floorMethod || 'auto'; pj.floorStart = pj.floorStart || 'auto';
  pj.wallMethod = pj.wallMethod || 'auto'; pj.wallStart = pj.wallStart || 'auto';
  pj.breakagePct = num(pj.breakagePct, 3); pj.adhesiveKgPerM2PerMm = num(pj.adhesiveKgPerM2PerMm, 1.6);
  pj.bagKg = num(pj.bagKg, 20); pj.trimLossPct = num(pj.trimLossPct, 5);
  var d = pj.drain || base.drain;
  pj.drain = { x: num(d.x, NaN), y: num(d.y, NaN), size: num(d.size, 10), slope: num(d.slope, 1), mode: d.mode === 'oneway' ? 'oneway' : 'point', dir: d.dir || 'N' };
  pj.floorHeightLimit = num(pj.floorHeightLimit, 0);
  pj.floorHoles = (pj.floorHoles || []).map(function (h) {
    return { id: String(h.id || ''), label: String(h.label || '地面開孔'), x: num(h.x, NaN), y: num(h.y, NaN), size: num(h.size, 10) };
  });
  pj.openings = (pj.openings || []).map(function (o) {
    return { id: String(o.id || ''), type: o.type === 'window' ? 'window' : 'door', wall: o.wall, offset: num(o.offset, NaN),
             width: num(o.width, NaN), height: num(o.height, NaN), sill: o.type === 'window' ? num(o.sill, 0) : 0 };
  });
  pj.fixtures = (pj.fixtures || []).map(function (f) {
    return { id: String(f.id || ''), kind: f.kind === 'drain' ? 'drain' : 'supply', wall: f.wall, offset: num(f.offset, NaN), height: num(f.height, NaN), dia: num(f.dia, 2.5) };
  });
  var tr = pj.trim || base.trim;
  pj.trim = { pieceLen: num(tr.pieceLen, 250), outerCorners: (tr.outerCorners || []).map(function (c) { return { label: String(c.label || '陽角'), len: num(c.len, 0), n: num(c.n, 1) }; }),
              jambDoor: tr.jambDoor !== false, jambWindow: tr.jambWindow !== false, topEdge: tr.topEdge !== false, label: String(tr.label || '收邊條') };
  var th = pj.threshold || base.threshold;
  pj.threshold = { label: String(th.label || '門檻'), width: num(th.width, 15), thick: num(th.thick, 2), riseAbove: num(th.riseAbove, 1), material: String(th.material || '') };
  return pj;
}

/* ---------------------------------------------------------------- 貼磚區（地面／各牆） */
function tileById(pj, id) {
  for (var i = 0; i < pj.tiles.length; i++) { if (pj.tiles[i].id === id) { return pj.tiles[i]; } }
  return null;
}

function floorSurface(pj) {
  var R = pj.room, ft = tileById(pj, pj.floorTileId), wt = tileById(pj, pj.wallTileId);
  var ew = wt.t / 10 + ADH;        // 牆磚完成厚（磚＋黏著劑）
  var rect, strips = [], hole, i;
  var ins = { N: 0, S: 0, W: 0, E: 0 };
  if (pj.sequence === 'wallFirst') { WALLS.forEach(function (w) { ins[w] = pj.wallTiled[w] ? ew : 0; }); }
  rect = [ins.W, ins.N, R.L - ins.E, R.D - ins.S];
  pj.openings.forEach(function (o) {
    if (o.type !== 'door') { return; }
    if (o.wall === 'N' && ins.N > 0) { strips.push([o.offset, 0, o.offset + o.width, ins.N]); }
    if (o.wall === 'S' && ins.S > 0) { strips.push([o.offset, R.D - ins.S, o.offset + o.width, R.D]); }
    if (o.wall === 'W' && ins.W > 0) { strips.push([0, o.offset, ins.W, o.offset + o.width]); }
    if (o.wall === 'E' && ins.E > 0) { strips.push([R.L - ins.E, o.offset, R.L, o.offset + o.width]); }
  });
  var d = pj.drain;
  hole = [d.x - d.size / 2, d.y - d.size / 2, d.x + d.size / 2, d.y + d.size / 2];
  void ft; void i;
  var holes = [hole];
  pj.floorHoles.forEach(function (h) { holes.push([h.x - h.size / 2, h.y - h.size / 2, h.x + h.size / 2, h.y + h.size / 2]); });
  return { rects: [rect].concat(strips), holes: holes, net: rect, ins: ins, ew: ew, ef: ft.t / 10 + ADH };
}

function wallSurface(pj, w) {
  var R = pj.room, ft = tileById(pj, pj.floorTileId), wt = tileById(pj, pj.wallTileId);
  var len = (w === 'N' || w === 'S') ? R.L : R.D;
  var e = wt.t / 10 + ADH, ef = ft.t / 10 + ADH;
  var adj = (w === 'N' || w === 'S') ? ['W', 'E'] : ['N', 'S'];     // 兩端相鄰的牆
  var longPair = R.L >= R.D ? ['N', 'S'] : ['E', 'W'];
  var through = longPair.indexOf(w) >= 0;
  var u0 = 0, u1 = len, deduct = [0, 0];
  if (pj.corner === 'both' || !through) {
    if (pj.wallTiled[adj[0]]) { u0 = e; deduct[0] = e; }
    if (pj.wallTiled[adj[1]]) { u1 = len - e; deduct[1] = e; }
  }
  var z0 = pj.sequence === 'floorFirst' ? ef : 0, z1 = pj.wallTop;
  var rect = [u0, z0, u1, z1];
  var holes = [], openRects = [];
  pj.openings.forEach(function (o) {
    if (o.wall !== w) { return; }
    var r = interRect([o.offset, o.sill, o.offset + o.width, o.sill + o.height], rect);
    openRects.push({ o: o, r: [o.offset, o.sill, o.offset + o.width, o.sill + o.height] });
    if (r) { holes.push(r); }
  });
  var fx = [];
  pj.fixtures.forEach(function (f) {
    if (f.wall !== w) { return; }
    var r = [f.offset - f.dia / 2, f.height - f.dia / 2, f.offset + f.dia / 2, f.height + f.dia / 2];
    var rr = interRect(r, rect);
    fx.push({ f: f, r: r });
    if (rr) { holes.push(rr); }
  });
  return { wall: w, len: len, rects: [rect], holes: holes, net: rect, deduct: deduct, through: through,
           openRects: openRects, fixtureRects: fx, e: e, ef: ef, z0: z0, z1: z1 };
}

/* ---------------------------------------------------------------- 起始磚（放樣）候選 */
var FLOOR_STARTS = {
  cornerNW: '西北角起貼', cornerNE: '東北角起貼', cornerSW: '西南角起貼', cornerSE: '東南角起貼',
  center: '房間中心（磚中心對正）', centerJoint: '房間中心（十字縫對正）',
  door: '門口對齊（門中線＋門檻線）', drain: '落水孔中心（磚中心對正）', drainJoint: '落水孔中心（十字縫對正）'
};
var WALL_STARTS = {
  'L-B': '左下角起貼', 'R-B': '右下角起貼', 'C-B': '牆中心磚置中＋由下往上', 'CJ-B': '牆中心十字縫＋由下往上',
  'L-T': '左上角起貼（由上往下）', 'R-T': '右上角起貼（由上往下）', 'C-T': '牆中心磚置中＋由上往下', 'CJ-T': '牆中心十字縫＋由上往下',
  'win': '窗中心對正＋由下往上'
};

function floorOrigin(pj, sf, key, dims, method) {
  var net = sf.net, tw = dims[0], th = dims[1], j = JOINT, R = pj.room, d = pj.drain;
  var cx = (net[0] + net[2]) / 2, cy = (net[1] + net[3]) / 2, isDiag = method.indexOf('diag') === 0;
  var door = null;
  pj.openings.forEach(function (o) { if (!door && o.type === 'door') { door = o; } });
  switch (key) {
    case 'cornerNW': return [net[0], net[1]];
    case 'cornerNE': return [isDiag ? net[2] : net[2] - tw, net[1]];
    case 'cornerSW': return [net[0], isDiag ? net[3] : net[3] - th];
    case 'cornerSE': return [isDiag ? net[2] : net[2] - tw, isDiag ? net[3] : net[3] - th];
    case 'center': return isDiag ? [cx, cy] : [cx - tw / 2, cy - th / 2];
    case 'centerJoint': return [cx + j / 2, cy + j / 2];
    case 'drain': return isDiag ? [d.x, d.y] : [d.x - tw / 2, d.y - th / 2];
    case 'drainJoint': return [d.x + j / 2, d.y + j / 2];
    case 'door':
      if (!door) { return null; }
      if (door.wall === 'N') { return isDiag ? [door.offset + door.width / 2, 0] : [door.offset + door.width / 2 - tw / 2, 0]; }
      if (door.wall === 'S') { return isDiag ? [door.offset + door.width / 2, R.D] : [door.offset + door.width / 2 - tw / 2, R.D - th]; }
      if (door.wall === 'W') { return isDiag ? [0, door.offset + door.width / 2] : [0, door.offset + door.width / 2 - th / 2]; }
      return isDiag ? [R.L, door.offset + door.width / 2] : [R.L - tw, door.offset + door.width / 2 - th / 2];
  }
  return null;
}

function wallOrigin(sf, key, dims, method) {
  var n = sf.net, tw = dims[0], th = dims[1], j = JOINT, isDiag = method.indexOf('diag') === 0;
  var cx = (n[0] + n[2]) / 2, parts = key.split('-'), h = parts[0], v = parts[1], ox, oy, win = null;
  sf.openRects.forEach(function (q) { if (!win && q.o.type === 'window') { win = q.o; } });
  if (key === 'win') {
    if (!win) { return null; }
    ox = isDiag ? win.offset + win.width / 2 : win.offset + win.width / 2 - tw / 2; oy = isDiag ? n[1] : n[1];
    return [ox, oy];
  }
  if (h === 'L') { ox = n[0]; } else if (h === 'R') { ox = isDiag ? n[2] : n[2] - tw; }
  else if (h === 'C') { ox = isDiag ? cx : cx - tw / 2; } else { ox = cx + j / 2; }
  if (v === 'B') { oy = n[1]; } else { oy = isDiag ? n[3] : n[3] - th; }
  return [ox, oy];
}

/* ---------------------------------------------------------------- 貼法清單與評分 */
var METHOD_NAMES = {
  'stack-h': '對縫正貼（橫貼）', 'stack-v': '對縫正貼（直貼）',
  'run2-h': '1/2 交丁（橫貼）', 'run2-v': '1/2 交丁（直貼）',
  'run3-h': '1/3 交丁（橫貼）', 'run3-v': '1/3 交丁（直貼）',
  'diag': '45° 斜貼', 'herring-h': '人字拼（橫）', 'herring-v': '人字拼（直）'
};

function methodsFor(tile, kind) {
  var L = Math.max(tile.w, tile.h), S = Math.min(tile.w, tile.h), square = Math.abs(L - S) < 1e-9, out = [];
  out.push('stack-h'); if (!square) { out.push('stack-v'); }
  out.push('run2-h'); out.push('run2-v');
  if (!square) { out.push('run3-h'); out.push('run3-v'); }
  if (square) { out.push('diag'); }
  var ratio = (L + JOINT) / (S + JOINT);
  if (!square && ratio >= 1.9 && Math.abs(ratio - Math.round(ratio)) / ratio < 0.03) { out.push('herring-h'); out.push('herring-v'); }
  void kind;
  return out;
}

function score(ev) { return ev.pieces + 3 * ev.slivers + 0.3 * ev.cut; }

/* 在 candidates（起點鍵）× methods 中找最佳，回傳每個貼法的最佳起點與整體最佳 */
function searchLayouts(sf, tile, methods, candKeys, originFn, bias) {
  var box = bboxOf(sf.rects), table = [];
  methods.forEach(function (m) {
    var dims = tileDims(tile, m), best = null;
    candKeys.forEach(function (key) {
      var o = originFn(key, dims, m);
      if (!o) { return; }
      var tiles = genTiles(box, tile, m, o, JOINT);
      var ev = evalTiles(tiles, sf.rects, sf.holes, tile, false);
      var sc = score(ev) + ((bias && bias[key]) || 0);
      if (!best || sc < best.score - 1e-9) { best = { method: m, start: key, origin: o, ev: ev, score: sc }; }
    });
    if (best) { table.push(best); }
  });
  table.sort(function (a, b) { return a.score - b.score; });
  return table;
}

function buildChosen(sf, tile, method, startKey, originFn) {
  var box = bboxOf(sf.rects), dims = tileDims(tile, method), o = originFn(startKey, dims, method);
  if (!o) { return { method: method, start: startKey, origin: null, ev: null }; }
  var tiles = genTiles(box, tile, method, o, JOINT);
  var ev = evalTiles(tiles, sf.rects, sf.holes, tile, true);
  return { method: method, start: startKey, origin: o, ev: ev };
}

/* ---------------------------------------------------------------- 洩水坡度 */
/* 地面某點相對落水孔的高差（cm，落水孔處 = 0，越遠越高）。點收水為圓錐、單向洩水為斜面。 */
function fallAt(pj, x, y) {
  var d = pj.drain, s = d.slope / 100;
  if (d.mode === 'oneway') {
    if (d.dir === 'N') { return s * Math.max(0, y - d.y); }
    if (d.dir === 'S') { return s * Math.max(0, d.y - y); }
    if (d.dir === 'W') { return s * Math.max(0, x - d.x); }
    return s * Math.max(0, d.x - x);
  }
  return s * Math.hypot(x - d.x, y - d.y);
}
/* 地磚完成面離結構樓板的高度（落水孔處 = 磚厚＋黏著劑，越遠越高） */
function floorLevel(pj, x, y) { return tileById(pj, pj.floorTileId).t / 10 + ADH + fallAt(pj, x, y); }
/* 牆腳（地面與牆交線）上每點的落差：洩水讓貼地的那一排壁磚下緣隨之傾斜 */
function wallBasePoint(pj, w, u) {
  var R = pj.room;
  return w === 'N' ? [u, 0] : w === 'S' ? [u, R.D] : w === 'W' ? [0, u] : [R.L, u];
}
function wallBaseSlope(pj, w) {
  var R = pj.room, len = (w === 'N' || w === 'S') ? R.L : R.D, n = 24, i, samples = [], mn = Infinity, mx = -Infinity, mnAt = 0, mxAt = 0;
  for (i = 0; i <= n; i++) {
    var u = len * i / n, p = wallBasePoint(pj, w, u), f = fallAt(pj, p[0], p[1]);
    samples.push([u, f]);
    if (f < mn) { mn = f; mnAt = u; } if (f > mx) { mx = f; mxAt = u; }
  }
  var pa = wallBasePoint(pj, w, 0), pm = wallBasePoint(pj, w, len / 2), pb = wallBasePoint(pj, w, len);
  return { wall: w, len: len, samples: samples, atStart: fallAt(pj, pa[0], pa[1]), atMid: fallAt(pj, pm[0], pm[1]), atEnd: fallAt(pj, pb[0], pb[1]),
           min: mn, minAt: mnAt, max: mx, maxAt: mxAt };
}
function slopeInfo(pj, sf, tile) {
  var d = pj.drain, s = d.slope / 100, net = sf.net, pts = [[net[0], net[1]], [net[2], net[1]], [net[2], net[3]], [net[0], net[3]]];
  function height(x, y) { return fallAt(pj, x, y); }
  var maxFall = 0, i, j, N = 24, sum = 0, cnt = 0, hx, hy;
  pts.forEach(function (p) { maxFall = Math.max(maxFall, height(p[0], p[1])); });
  for (i = 0; i < N; i++) {
    for (j = 0; j < N; j++) {
      hx = net[0] + (i + 0.5) * (net[2] - net[0]) / N; hy = net[1] + (j + 0.5) * (net[3] - net[1]) / N;
      sum += height(hx, hy); cnt++;
    }
  }
  var avg = sum / cnt, area = rectArea(net);
  var L = Math.max(tile.w, tile.h);
  var diagLen = Math.hypot(tile.w, tile.h);
  var lip = s * (d.mode === 'point' ? diagLen : L);       // 單片磚面內的高低差（cm）
  var maxDiag = s > 0 ? 0.3 / s : Infinity;               // 單片磚高低差 ≤ 3mm 時，磚面最長距離（cm）
  var maxSize = d.mode === 'point' ? Math.floor(maxDiag / Math.SQRT2) : Math.floor(maxDiag);  // 正方形磚邊長上限
  var near = Math.round(Math.pow(Math.ceil(2 * L / Math.min(tile.w, tile.h)) + 1, 2));
  return { slopePct: d.slope, mode: d.mode, maxFall: maxFall, avgFall: avg, bedVolumeM3: avg * area / 1e6, area: area,
           lip: lip, lipOk: lip <= 0.3 + 1e-9, maxDiag: maxDiag, maxTileSide: maxSize, nearDrainTiles: near,
           ef: tile.t / 10 + ADH, maxLevel: tile.t / 10 + ADH + maxFall, limit: pj.floorHeightLimit,
           limitOk: !(pj.floorHeightLimit > 0) || tile.t / 10 + ADH + maxFall <= pj.floorHeightLimit + 1e-9,
           headroom: pj.floorHeightLimit > 0 ? pj.floorHeightLimit - (tile.t / 10 + ADH + maxFall) : null,
           maxSlopeForLimit: (pj.floorHeightLimit > 0 && maxFall > 0 && s > 0) ? (pj.floorHeightLimit - (tile.t / 10 + ADH)) / (maxFall / s) * 100 : null };
}

/* ---------------------------------------------------------------- 總計算 */
function ceilDiv(a, b) { return Math.ceil(a / b - 1e-9); }

function pickOrOverride(pj, tile, sf, kind) {
  var isFloor = kind === 'floor';
  var methods = methodsFor(tile, kind);
  var origFn, candKeys, bias = {};
  if (isFloor) {
    origFn = function (key, dims, m) { return floorOrigin(pj, sf, key, dims, m); };
    candKeys = Object.keys(FLOOR_STARTS);
    // 有洩水坡度的點收水：落水孔十字縫對正才能把四個斜面對稱切割，寧可多用幾片也優先採用
    if (pj.drain.slope > 0 && pj.drain.mode === 'point') { bias.drainJoint = -12; bias.drain = -6; }
    else { bias.drainJoint = -1; bias.drain = -0.5; }
  } else {
    origFn = function (key, dims, m) { return wallOrigin(sf, key, dims, m); };
    candKeys = Object.keys(WALL_STARTS);
  }
  var table = searchLayouts(sf, tile, methods, candKeys, origFn, bias);
  var methodSel = isFloor ? pj.floorMethod : pj.wallMethod, startSel = isFloor ? pj.floorStart : pj.wallStart;
  var chosenMethod = methodSel === 'auto' || methods.indexOf(methodSel) < 0 ? table[0].method : methodSel;
  var row = table.filter(function (r) { return r.method === chosenMethod; })[0];
  var startKey = (startSel === 'auto' || candKeys.indexOf(startSel) < 0) ? row.start : startSel;
  var chosen = buildChosen(sf, tile, chosenMethod, startKey, origFn);
  if (!chosen.origin) { chosen = buildChosen(sf, tile, chosenMethod, row.start, origFn); }
  return { table: table, chosen: chosen, methods: methods };
}

function computeAll(raw) {
  try { return computeAllInner(raw); }
  catch (err) { return { ok: false, errors: ['計算發生例外：' + err.message + '（請檢查輸入）'], warnings: [], project: null }; }
}

function computeAllInner(raw) {
  var pj = normalize(raw), v = validate(pj);
  if (v.errors.length) { return { ok: false, errors: v.errors, warnings: v.warnings, project: pj }; }
  var ft = tileById(pj, pj.floorTileId), wt = tileById(pj, pj.wallTileId);
  var out = { ok: true, errors: [], warnings: v.warnings.slice(), project: pj, floorTile: ft, wallTile: wt, joint: JOINT, adhesiveT: ADH };

  /* 地面 */
  var fs = floorSurface(pj), fp = pickOrOverride(pj, ft, fs, 'floor');
  var fArea = (rectArea(fs.rects[0]) + fs.rects.slice(1).reduce(function (s, r) { return s + rectArea(r); }, 0)) - pj.drain.size * pj.drain.size - pj.floorHoles.reduce(function (s, h) { return s + h.size * h.size; }, 0);
  var floor = { surface: fs, tile: ft, netArea: fArea / 1e4, chosen: fp.chosen, compare: fp.table, methods: fp.methods };
  floor.slope = slopeInfo(pj, fs, ft);
  out.floor = floor;
  out.wallBase = {};
  WALLS.forEach(function (w) { out.wallBase[w] = wallBaseSlope(pj, w); });

  /* 各牆 */
  out.walls = {};
  var wallPieces = 0, wallArea = 0;
  WALLS.forEach(function (w) {
    if (!pj.wallTiled[w]) { return; }
    var sf = wallSurface(pj, w), wp = pickOrOverride(pj, wt, sf, 'wall');
    var gross = rectArea(sf.net), holeA = sf.holes.reduce(function (s, r) { return s + rectArea(r); }, 0);
    var info = { surface: sf, netArea: (gross - holeA) / 1e4, chosen: wp.chosen, compare: wp.table, methods: wp.methods };
    // 開孔磚片（給排水孔）
    info.fixtureTiles = 0;
    sf.fixtureRects.forEach(function (q) {
      var cnt = 0;
      wp.chosen.ev.polys.forEach(function (p) {
        var hit = false;
        p.pts && (hit = clipRect(p.pts, q.r).length >= 3 && polyArea(clipRect(p.pts, q.r)) > 1e-6);
        if (hit) { cnt++; }
      });
      info.fixtureTiles += cnt;
    });
    out.walls[w] = info;
    wallPieces += wp.chosen.ev.pieces; wallArea += info.netArea;
  });

  /* 各貼法整體比較（地、牆各自最佳起點） */
  function pur(pieces) { return Math.ceil(pieces * (1 + pj.breakagePct / 100) - 1e-9); }
  var fv = floor.chosen.ev;
  floor.pieces = fv.pieces; floor.purchase = pur(fv.pieces); floor.boxes = ceilDiv(floor.purchase, ft.perBox);
  floor.usedArea = fv.used / 1e4;        // 實際被磚蓋住的面積（不含磚縫）
  floor.waste = Math.max(0, (fv.pieces * ft.w * ft.h - fv.used) / fv.used);
  floor.theory = Math.ceil(fv.used / (ft.w * ft.h) - 1e-9);
  Object.keys(out.walls).forEach(function (w) {
    var wi = out.walls[w], ev = wi.chosen.ev;
    wi.pieces = ev.pieces; wi.usedArea = ev.used / 1e4; wi.waste = Math.max(0, (ev.pieces * wt.w * wt.h - ev.used) / ev.used);
  });
  var wPieces = wallPieces, wPurchase = pur(wPieces), wUsed = 0;
  Object.keys(out.walls).forEach(function (k) { wUsed += out.walls[k].chosen.ev.used; });
  var wallTotal = { netArea: wallArea, usedArea: wUsed / 1e4, pieces: wPieces, purchase: wPurchase, boxes: ceilDiv(wPurchase, wt.perBox),
                    waste: wUsed > 0 ? Math.max(0, (wPieces * wt.w * wt.h - wUsed) / wUsed) : 0,
                    theory: Math.ceil(wUsed / (wt.w * wt.h) - 1e-9) };
  out.wallTotal = wallTotal;

  /* 黏著劑（牆、地都用 0.5cm 厚） */
  var kgPerM2 = ADH * 10 * pj.adhesiveKgPerM2PerMm;
  var adhFloorKg = floor.netArea * kgPerM2, adhWallKg = wallArea * kgPerM2;
  out.adhesive = { thickCm: ADH, kgPerM2: kgPerM2, floorKg: adhFloorKg, wallKg: adhWallKg, totalKg: adhFloorKg + adhWallKg,
                   bags: Math.ceil((adhFloorKg + adhWallKg) / pj.bagKg - 1e-9), bagKg: pj.bagKg };

  /* 收邊條 */
  var items = [], total = 0;
  pj.trim.outerCorners.forEach(function (c) { if (c.len * c.n > 0) { items.push({ label: c.label, len: c.len * c.n }); } });
  pj.openings.forEach(function (o) {
    if (!pj.wallTiled[o.wall]) { return; }
    if (o.type === 'door' && pj.trim.jambDoor) { items.push({ label: WALL_ZH[o.wall] + '門 ' + o.id + ' 洞口（兩側＋頂）', len: 2 * Math.min(o.height, pj.wallTop) + o.width }); }
    if (o.type === 'window' && pj.trim.jambWindow) { items.push({ label: WALL_ZH[o.wall] + '窗 ' + o.id + ' 洞口（四邊）', len: 2 * o.height + 2 * o.width }); }
  });
  if (pj.trim.topEdge && pj.wallTop < pj.room.H) {
    Object.keys(out.walls).forEach(function (w) {
      var n = out.walls[w].surface.net; items.push({ label: WALL_ZH[w] + '牆磚頂端收邊', len: n[2] - n[0] });
    });
  }
  items.forEach(function (i) { total += i.len; });
  var withLoss = total * (1 + pj.trimLossPct / 100);
  out.trim = { items: items, totalCm: total, withLossCm: withLoss, pieceLen: pj.trim.pieceLen, pieces: Math.ceil(withLoss / pj.trim.pieceLen - 1e-9), label: pj.trim.label };

  /* 門檻 */
  var doors = pj.openings.filter(function (o) { return o.type === 'door'; });
  out.threshold = { items: doors.map(function (o) { return { id: o.id, wall: o.wall, len: o.width }; }), spec: pj.threshold,
                    count: doors.length, maxFloorRise: floor.slope.maxFall };

  /* 警告 */
  addWarnings(pj, out);
  return out;
}

function addWarnings(pj, out) {
  var w = out.warnings, f = out.floor, sl = f.slope;
  if (pj.drain.slope > 0 && !sl.lipOk) {
    w.push('洩水坡度 ' + pj.drain.slope + '% 下，地磚 ' + out.floorTile.w + '×' + out.floorTile.h + ' 單片面內高低差約 ' + (sl.lip * 10).toFixed(1) +
           ' mm（建議 ≤ 3 mm）。磚太大貼不平順：建議單片對角線 ≤ ' + Math.floor(sl.maxDiag) + ' cm（正方形磚邊長 ≤ ' + sl.maxTileSide +
           ' cm），或落水孔周圍改「對角切割四向收水」。');
  }
  if (pj.drain.slope === 0) { w.push('洩水坡度為 0：地面不會往落水孔排水，請確認。'); }
  if (!sl.limitOk) {
    w.push('⚠ 超過完成面高度限制：最高點離結構樓板 ' + sl.maxLevel.toFixed(2) + ' cm（磚＋黏著劑 ' + sl.ef.toFixed(1) + ' ＋ 洩水高差 ' + sl.maxFall.toFixed(2) + '），限制 ' + sl.limit +
           ' cm，超出 ' + (-sl.headroom).toFixed(2) + ' cm。' + (sl.maxSlopeForLimit != null && sl.maxSlopeForLimit > 0 ? '在此限制下坡度最多約 ' + sl.maxSlopeForLimit.toFixed(2) + '%。' : '磚加黏著劑本身已超過限制，請改薄磚或提高限制。'));
  }
  var fev = f.chosen.ev;
  if (fev.slivers > 0) { w.push('地面有 ' + fev.slivers + ' 片「細條切磚」（切邊 < ' + fev.sliverMin.toFixed(1) + ' cm），容易斷裂、也不好看，建議換起始點或貼法。'); }
  Object.keys(out.walls).forEach(function (k) {
    var e = out.walls[k].chosen.ev;
    if (e.slivers > 0) { w.push(WALL_ZH[k] + '有 ' + e.slivers + ' 片細條切磚（切邊 < ' + e.sliverMin.toFixed(1) + ' cm）。'); }
  });
  var d = pj.drain, net = f.surface.net;
  if (d.x - d.size / 2 < net[0] || d.x + d.size / 2 > net[2] || d.y - d.size / 2 < net[1] || d.y + d.size / 2 > net[3]) {
    w.push('落水孔有一部分落在貼磚淨區域之外（牆磚厚度已扣除），請確認位置。');
  }
  var thr = pj.threshold;
  if (out.threshold.count > 0 && thr.riseAbove < 1) { w.push('門檻高出地磚面僅 ' + thr.riseAbove + ' cm，阻水效果有限（建議 ≥ 1 cm）。'); }
  void pj;
}

/* 依指定貼法與起點重建排磚多邊形（比較表縮圖用） */
function layoutFor(raw, kind, wallKey, method, startKey) {
  var pj = normalize(raw), tile, sf, fn;
  if (kind === 'floor') {
    tile = tileById(pj, pj.floorTileId); sf = floorSurface(pj);
    fn = function (key, dims, m) { return floorOrigin(pj, sf, key, dims, m); };
  } else {
    tile = tileById(pj, pj.wallTileId); sf = wallSurface(pj, wallKey);
    fn = function (key, dims, m) { return wallOrigin(sf, key, dims, m); };
  }
  return buildChosen(sf, tile, method, startKey, fn);
}

var api = {
  JOINT: JOINT, ADH: ADH, WALLS: WALLS, WALL_ZH: WALL_ZH, FLOOR_STARTS: FLOOR_STARTS, WALL_STARTS: WALL_STARTS, METHOD_NAMES: METHOD_NAMES,
  polyArea: polyArea, clipRect: clipRect, genTiles: genTiles, tileDims: tileDims, evalTiles: evalTiles, methodsFor: methodsFor,
  defaultProject: defaultProject, normalize: normalize, validate: validate, floorSurface: floorSurface, wallSurface: wallSurface,
  slopeInfo: slopeInfo, fallAt: fallAt, floorLevel: floorLevel, wallBaseSlope: wallBaseSlope, computeAll: computeAll, layoutFor: layoutFor, bboxOf: bboxOf, rectArea: rectArea, interRect: interRect
};
if (typeof module !== 'undefined' && module.exports) { module.exports = api; } else { root.TileEngine = api; }
})(typeof window !== 'undefined' ? window : this);
