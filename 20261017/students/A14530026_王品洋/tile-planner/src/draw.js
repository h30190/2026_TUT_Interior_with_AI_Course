/* 畫圖模組：平面圖、立面圖、斷面圖、縮圖（SVG 字串）＋ 3D 檢視器（canvas）。
   只負責把 engine 算好的結果畫出來，不做任何算量。 */
'use strict';
(function (root) {
var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.TileEngine;
var C = { full: '#efe9dd', cut: '#f2c58a', hole: '#e9a3a3', line: '#8f8a7c', wall: '#3a3a3a', net: '#fbf9f4',
          win: '#bfe3f5', door: '#ffffff', start: '#d62828', drain: '#1d6fa5', trim: '#2f9e6b', dim: '#555', sup: '#1d6fa5', dra: '#6b6b6b' };
var FONT = 'font-family="Microsoft JhengHei, Noto Sans TC, PingFang TC, sans-serif"';

function f1(x) { return (Math.round(x * 10) / 10).toString(); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function pts(poly, X, Y) { return poly.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' '); }
function text(x, y, s, o) {
  o = o || {};
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.size || 12) + '" fill="' + (o.fill || '#222') + '" ' +
    'text-anchor="' + (o.anchor || 'start') + '"' + (o.bold ? ' font-weight="bold"' : '') + (o.rot ? ' transform="rotate(' + o.rot + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : '') + ' ' + FONT + '>' + esc(s) + '</text>';
}
function arrowDefs() {
  return '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#1d6fa5"/></marker>' +
         '<marker id="dh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>';
}
function dimLine(x1, y1, x2, y2, label, off, vertical) {
  var s = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#555" stroke-width="0.8" marker-start="url(#dh)" marker-end="url(#dh)"/>';
  var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  s += vertical ? text(mx + off, my, label, { size: 11, fill: '#444', anchor: 'middle', rot: -90 }) : text(mx, my + off, label, { size: 11, fill: '#444', anchor: 'middle' });
  return s;
}

/* ---------------------------------------------------------------- 起始點標記 */
function startMark(X, Y, ox, oy, box, label, vert) {
  var s = '', sx = X(ox), sy = Y(oy), yTop = Math.min(Y(box[1]), Y(box[3])), yBot = Math.max(Y(box[1]), Y(box[3]));
  s += '<line x1="' + X(box[0]) + '" y1="' + sy + '" x2="' + X(box[2]) + '" y2="' + sy + '" stroke="' + C.start + '" stroke-width="0.8" stroke-dasharray="6 4"/>';
  s += '<line x1="' + sx + '" y1="' + yTop + '" x2="' + sx + '" y2="' + yBot + '" stroke="' + C.start + '" stroke-width="0.8" stroke-dasharray="6 4"/>';
  s += '<circle cx="' + sx + '" cy="' + sy + '" r="6" fill="#fff" stroke="' + C.start + '" stroke-width="2"/>';
  s += '<line x1="' + (sx - 9) + '" y1="' + sy + '" x2="' + (sx + 9) + '" y2="' + sy + '" stroke="' + C.start + '" stroke-width="2"/>';
  s += '<line x1="' + sx + '" y1="' + (sy - 9) + '" x2="' + sx + '" y2="' + (sy + 9) + '" stroke="' + C.start + '" stroke-width="2"/>';
  void vert;
  var xMin = Math.min(X(box[0]), X(box[2])), xMax = Math.max(X(box[0]), X(box[2]));
  var tx = Math.min(Math.max(sx + 10, xMin + 4), xMax - 170);
  var ty = Math.min(Math.max(sy - 10, yTop + 14), yBot - 6);
  s += '<rect x="' + (tx - 2) + '" y="' + (ty - 12) + '" width="' + Math.min(176, label.length * 12.5 + 8) + '" height="16" fill="#fff" fill-opacity="0.85"/>';
  s += text(tx, ty, label, { size: 11, fill: C.start, bold: true });
  return s;
}

/* ---------------------------------------------------------------- 平面圖 */
function planSVG(res, opts) {
  opts = opts || {};
  var pj = res.project, R = pj.room, fl = res.floor, sf = fl.surface, ev = fl.chosen.ev, W = opts.width || 680, pad = 58;
  var sc = (W - pad * 2) / R.L, H = R.D * sc + pad * 2 + 40;
  var X = function (x) { return pad + x * sc; }, Y = function (y) { return pad + y * sc; };
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H.toFixed(0) + '" class="fig" role="img" aria-label="平面磁磚計畫圖">' + arrowDefs();
  s += '<rect width="100%" height="100%" fill="#fff"/>';
  // 粗胚牆線與牆磚完成層
  s += '<rect x="' + X(0) + '" y="' + Y(0) + '" width="' + (R.L * sc) + '" height="' + (R.D * sc) + '" fill="' + C.net + '" stroke="' + C.wall + '" stroke-width="4"/>';
  // 磁磚
  ev.polys.forEach(function (p) {
    p.clipped.forEach(function (c) {
      s += '<polygon points="' + pts(c, X, Y) + '" fill="' + C[p.kind] + '" stroke="' + C.line + '" stroke-width="0.5"/>';
    });
  });
  // 牆磚完成層（淨區域外圈）
  var n = sf.net;
  s += '<rect x="' + X(n[0]) + '" y="' + Y(n[1]) + '" width="' + ((n[2] - n[0]) * sc) + '" height="' + ((n[3] - n[1]) * sc) + '" fill="none" stroke="#b08968" stroke-width="1" stroke-dasharray="4 3"/>';
  // 落水孔
  var d = pj.drain, ds = d.size * sc;
  (pj.floorHoles || []).forEach(function (h) {
    var hs = h.size * sc;
    s += '<rect x="' + (X(h.x) - hs / 2) + '" y="' + (Y(h.y) - hs / 2) + '" width="' + hs + '" height="' + hs + '" fill="#fff" stroke="' + C.dra + '" stroke-width="1.5" stroke-dasharray="4 2"/>';
    s += text(X(h.x) + hs / 2 + 4, Y(h.y) + 4, h.label + ' ' + h.size + 'cm', { size: 11, fill: C.dra, bold: true });
  });
  s += '<rect x="' + (X(d.x) - ds / 2) + '" y="' + (Y(d.y) - ds / 2) + '" width="' + ds + '" height="' + ds + '" fill="#fff" stroke="' + C.drain + '" stroke-width="1.5"/>';
  s += '<line x1="' + (X(d.x) - ds / 2) + '" y1="' + (Y(d.y) - ds / 2) + '" x2="' + (X(d.x) + ds / 2) + '" y2="' + (Y(d.y) + ds / 2) + '" stroke="' + C.drain + '"/>';
  s += '<line x1="' + (X(d.x) + ds / 2) + '" y1="' + (Y(d.y) - ds / 2) + '" x2="' + (X(d.x) - ds / 2) + '" y2="' + (Y(d.y) + ds / 2) + '" stroke="' + C.drain + '"/>';
  // 洩水方向箭頭
  if (d.slope > 0) {
    if (d.mode === 'point') {
      [[n[0] + 18, n[1] + 18], [n[2] - 18, n[1] + 18], [n[2] - 18, n[3] - 18], [n[0] + 18, n[3] - 18]].forEach(function (p) {
        var dx = d.x - p[0], dy = d.y - p[1], len = Math.hypot(dx, dy) || 1, t = Math.min(0.55, 60 / len);
        s += '<line x1="' + X(p[0]) + '" y1="' + Y(p[1]) + '" x2="' + X(p[0] + dx * t) + '" y2="' + Y(p[1] + dy * t) + '" stroke="' + C.drain + '" stroke-width="1.6" marker-end="url(#ah)"/>';
      });
    } else {
      var vx = { E: 1, W: -1, N: 0, S: 0 }[d.dir], vy = { N: -1, S: 1, E: 0, W: 0 }[d.dir];
      [0.25, 0.5, 0.75].forEach(function (k) {
        var px = n[0] + (n[2] - n[0]) * k, py = n[1] + (n[3] - n[1]) * k;
        s += '<line x1="' + X(px - vx * 25) + '" y1="' + Y(py - vy * 25) + '" x2="' + X(px + vx * 25) + '" y2="' + Y(py + vy * 25) + '" stroke="' + C.drain + '" stroke-width="1.6" marker-end="url(#ah)"/>';
      });
    }
    s += text(X(d.x) + ds / 2 + 6, Y(d.y) + ds / 2 + 14, '落水孔 ' + d.size + 'cm ｜ 洩水 ' + d.slope + '%', { size: 11, fill: C.drain, bold: true });
  }
  // 門窗
  pj.openings.forEach(function (o) {
    var w = o.wall, a = o.offset, b = o.offset + o.width, col = o.type === 'door' ? '#c0392b' : '#3a8fc7', lab = (o.type === 'door' ? '門 ' : '窗 ') + o.id;
    var x1, y1, x2, y2;
    if (w === 'N') { x1 = X(a); x2 = X(b); y1 = y2 = Y(0); }
    else if (w === 'S') { x1 = X(a); x2 = X(b); y1 = y2 = Y(R.D); }
    else if (w === 'W') { y1 = Y(a); y2 = Y(b); x1 = x2 = X(0); }
    else { y1 = Y(a); y2 = Y(b); x1 = x2 = X(R.L); }
    s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#fff" stroke-width="8"/>';
    s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + (o.type === 'door' ? 3 : 5) + '"/>';
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ox = w === 'W' ? 6 : (w === 'E' ? -6 : 0), oy = w === 'N' ? 16 : (w === 'S' ? -8 : 0);
    s += text(mx + ox, my + oy + (w === 'W' || w === 'E' ? 4 : 0), lab + '（' + o.width + 'cm）', { size: 10.5, fill: col, anchor: w === 'W' ? 'start' : (w === 'E' ? 'end' : 'middle'), bold: true });
    if (o.type === 'door') {   // 門檻
      var tw = Math.max(5, pj.threshold.width * sc);
      if (w === 'N' || w === 'S') { s += '<rect x="' + Math.min(x1, x2) + '" y="' + (w === 'N' ? Y(0) - 1 : Y(R.D) - tw + 1) + '" width="' + Math.abs(x2 - x1) + '" height="' + tw + '" fill="#a89f91" fill-opacity="0.9" stroke="#555" stroke-width="0.6"/>'; }
      else { s += '<rect x="' + (w === 'W' ? X(0) - 1 : X(R.L) - tw + 1) + '" y="' + Math.min(y1, y2) + '" width="' + tw + '" height="' + Math.abs(y2 - y1) + '" fill="#a89f91" fill-opacity="0.9" stroke="#555" stroke-width="0.6"/>'; }
    }
  });
  // 起始磚放樣點
  var o = fl.chosen.origin;
  if (o) {
    var box = E.bboxOf([sf.net]);
    var lab = '起始點 (' + f1(o[0]) + ', ' + f1(o[1]) + ')';
    s += startMark(X, Y, o[0], o[1], box, lab);
  }
  // 尺寸
  s += dimLine(X(0), Y(R.D) + 22, X(R.L), Y(R.D) + 22, '粗胚 ' + R.L + ' cm（東西）', -4);
  s += dimLine(X(0) - 24, Y(0), X(0) - 24, Y(R.D), '粗胚 ' + R.D + ' cm（南北）', -5, true);
  s += dimLine(X(n[0]), Y(R.D) + 40, X(n[2]), Y(R.D) + 40, '貼磚淨寬 ' + f1(n[2] - n[0]) + ' cm（已扣牆磚＋黏著劑 ' + f1(sf.ew) + ' cm／邊）', -4);
  s += text(X(0) + R.L * sc, Y(0) - 12, 'N ↑', { size: 12, anchor: 'end', bold: true });
  s += text(X(0), Y(0) - 12, (res.project.name || '') + '　平面磁磚計畫（' + E.METHOD_NAMES[fl.chosen.method] + '）', { size: 13, bold: true });
  s += '</svg>';
  return s;
}

/* ---------------------------------------------------------------- 立面圖（由室內看；南牆、西牆左右翻轉） */
function wallSVG(res, w, opts) {
  opts = opts || {};
  var pj = res.project, R = pj.room, wi = res.walls[w], sf = wi.surface, ev = wi.chosen.ev, W = opts.width || 680, pad = 56;
  var len = sf.len, H = R.H, flip = (w === 'S' || w === 'W');
  var sc = Math.min((W - pad * 2) / len, 440 / H);
  var hh = H * sc + pad * 2 + 30;
  var X = function (u) { return pad + (flip ? len - u : u) * sc; }, Y = function (z) { return pad + (H - z) * sc; };
  function polyPts(p) { return p.map(function (q) { return X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1); }).join(' '); }
  function rectEl(r, fill, stroke, sw, dash) {
    var x1 = Math.min(X(r[0]), X(r[2])), x2 = Math.max(X(r[0]), X(r[2])), y1 = Math.min(Y(r[1]), Y(r[3])), y2 = Math.max(Y(r[1]), Y(r[3]));
    return '<rect x="' + x1.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + (x2 - x1).toFixed(1) + '" height="' + (y2 - y1).toFixed(1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + hh.toFixed(0) + '" class="fig" role="img" aria-label="' + E.WALL_ZH[w] + '立面磁磚計畫圖">' + arrowDefs();
  s += '<rect width="100%" height="100%" fill="#fff"/>';
  s += rectEl([0, 0, len, H], C.net, C.wall, 3);
  ev.polys.forEach(function (p) {
    p.clipped.forEach(function (c) { s += '<polygon points="' + polyPts(c) + '" fill="' + C[p.kind] + '" stroke="' + C.line + '" stroke-width="0.5"/>'; });
  });
  // 貼磚淨範圍
  s += rectEl(sf.net, 'none', '#b08968', 1, '4 3');
  // 洞口（蓋在磚上）
  sf.openRects.forEach(function (q) {
    s += rectEl(q.r, q.o.type === 'door' ? C.door : C.win, q.o.type === 'door' ? '#c0392b' : '#3a8fc7', 2);
    var cx = (X(q.r[0]) + X(q.r[2])) / 2, cy = (Y(q.r[1]) + Y(q.r[3])) / 2;
    s += text(cx, cy, (q.o.type === 'door' ? '門 ' : '窗 ') + q.o.id, { size: 11, anchor: 'middle', bold: true, fill: '#333' });
    s += text(cx, cy + 14, q.o.width + '×' + q.o.height + (q.o.type === 'window' ? '（窗台 ' + q.o.sill + '）' : ''), { size: 10, anchor: 'middle', fill: '#555' });
    // 洞口收邊
    if ((q.o.type === 'door' && pj.trim.jambDoor) || (q.o.type === 'window' && pj.trim.jambWindow)) {
      var r = q.r, edges = q.o.type === 'door' ? [[r[0], r[1], r[0], r[3]], [r[2], r[1], r[2], r[3]], [r[0], r[3], r[2], r[3]]] :
        [[r[0], r[1], r[0], r[3]], [r[2], r[1], r[2], r[3]], [r[0], r[3], r[2], r[3]], [r[0], r[1], r[2], r[1]]];
      edges.forEach(function (e) { s += '<line x1="' + X(e[0]) + '" y1="' + Y(e[1]) + '" x2="' + X(e[2]) + '" y2="' + Y(e[3]) + '" stroke="' + C.trim + '" stroke-width="3"/>'; });
    }
  });
  // 給排水點
  sf.fixtureRects.forEach(function (q) {
    var f = q.f, cx = X(f.offset), cy = Y(f.height), r = Math.max(3, f.dia * sc / 2);
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (f.kind === 'supply' ? C.sup : C.dra) + '" stroke="#fff" stroke-width="1"/>';
    s += text(cx + r + 3, cy + 4, (f.kind === 'supply' ? '給水 ' : '排水 ') + f.id + ' h' + f.height, { size: 10, fill: f.kind === 'supply' ? C.sup : '#444' });
  });
  // 牆磚頂端收邊
  if (pj.trim.topEdge && pj.wallTop < H) {
    s += '<line x1="' + X(sf.net[0]) + '" y1="' + Y(pj.wallTop) + '" x2="' + X(sf.net[2]) + '" y2="' + Y(pj.wallTop) + '" stroke="' + C.trim + '" stroke-width="3"/>';
  }
  // 起始點
  var o = wi.chosen.origin;
  if (o) {
    var box = [sf.net[0], sf.net[1], sf.net[2], sf.net[3]];
    s += startMark(X, Y, o[0], o[1], box, '起始點 u=' + f1(o[0]) + ' z=' + f1(o[1]));
  }
  // 尺寸
  var ex = sf.deduct[0] + sf.deduct[1];
  s += dimLine(X(0), Y(0) + 20, X(len), Y(0) + 20, E.WALL_ZH[w] + ' 粗胚長 ' + len + ' cm', -4);
  s += dimLine(X(sf.net[0]), Y(0) + 38, X(sf.net[2]), Y(0) + 38, '貼磚淨長 ' + f1(sf.net[2] - sf.net[0]) + ' cm' + (ex > 0 ? '（兩端共扣 ' + f1(ex) + '）' : '（通到轉角）'), -4);
  var vx = (flip ? X(len) + 26 : X(0) - 26);
  s += dimLine(vx, Y(sf.net[1]), vx, Y(sf.net[3]), '貼磚淨高 ' + f1(sf.net[3] - sf.net[1]) + ' cm', flip ? 14 : -5, true);
  s += text(pad, 20, (pj.name || '') + '　' + E.WALL_ZH[w] + '立面（由室內看；' + (flip ? '左＝' + (w === 'S' ? '東' : '南') : '左＝' + (w === 'N' ? '西' : '北')) + '）　' + E.METHOD_NAMES[wi.chosen.method], { size: 13, bold: true });
  s += '</svg>';
  return s;
}

/* ---------------------------------------------------------------- 貼法縮圖 */
function thumbSVG(layout, surface, kind, size) {
  var box = E.bboxOf(surface.rects), w = box[2] - box[0], h = box[3] - box[1], sc = size / Math.max(w, h), sw = w * sc, shh = h * sc;
  var X = function (x) { return (x - box[0]) * sc; }, Y = function (y) { return kind === 'wall' ? (box[3] - y) * sc : (y - box[1]) * sc; };
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sw.toFixed(1) + ' ' + shh.toFixed(1) + '" width="' + sw.toFixed(0) + '" height="' + shh.toFixed(0) + '" class="thumb">';
  s += '<rect width="100%" height="100%" fill="#fff"/>';
  layout.ev.polys.forEach(function (p) {
    p.clipped.forEach(function (c) { s += '<polygon points="' + pts(c, X, Y) + '" fill="' + C[p.kind] + '" stroke="#999" stroke-width="0.3"/>'; });
  });
  (surface.holes || []).forEach(function (r) {
    if (kind === 'wall') { s += '<rect x="' + X(r[0]) + '" y="' + Y(r[3]) + '" width="' + ((r[2] - r[0]) * sc) + '" height="' + ((r[3] - r[1]) * sc) + '" fill="#fff" stroke="#999" stroke-width="0.5"/>'; }
  });
  s += '</svg>';
  return s;
}

/* ---------------------------------------------------------------- 門檻斷面（示意，依輸入尺寸等比） */
function thresholdSVG(res) {
  var pj = res.project, th = pj.threshold, ft = res.floorTile, wt = res.wallTile, W = 420, Hh = 250;
  var t = ft.t / 10, a = E.ADH, sc = 12, x0 = 40, ybase = 180;
  var mortarH = 1.5;                                  // 示意：砂漿墊層 1.5cm
  var slabTop = ybase;
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + Hh + '" class="fig secfig" role="img" aria-label="門檻斷面示意圖">';
  s += '<rect width="100%" height="100%" fill="#fff"/>';
  s += text(10, 18, '門檻斷面示意（' + (th.material || th.label) + '，寬 ' + th.width + '、厚 ' + th.thick + '、高出地磚 ' + th.riseAbove + ' cm）', { size: 12, bold: true });
  // 結構樓板
  s += '<rect x="10" y="' + slabTop + '" width="' + (W - 20) + '" height="40" fill="#cfcfcf" stroke="#777"/>' + text(16, slabTop + 24, '結構樓板', { size: 11 });
  // 室內側：砂漿＋黏著劑＋地磚
  var mx = x0, mw = 150, mY = slabTop - mortarH * sc, aY = mY - a * sc, tY = aY - t * sc;
  s += '<rect x="' + mx + '" y="' + mY + '" width="' + mw + '" height="' + (mortarH * sc) + '" fill="#d9d2c3" stroke="#888"/>' + text(mx + 4, mY + 12, '砂漿墊層', { size: 10 });
  s += '<rect x="' + mx + '" y="' + aY + '" width="' + mw + '" height="' + (a * sc) + '" fill="#f0e6a8" stroke="#888"/>';
  s += '<rect x="' + mx + '" y="' + tY + '" width="' + mw + '" height="' + (t * sc) + '" fill="' + C.full + '" stroke="#555"/>' + text(mx + 6, tY + (t * sc) / 2 + 4, '地磚 ' + ft.t + 'mm＋黏著劑 ' + a + 'cm', { size: 10.5 });
  // 門檻本體
  var tx = mx + mw, tw = Math.max(40, th.width * sc / 1.4), topY = tY - th.riseAbove * sc;
  var thH = slabTop - topY;
  s += '<rect x="' + tx + '" y="' + topY + '" width="' + tw + '" height="' + thH + '" fill="#bfb6a8" stroke="#444" stroke-width="1.5"/>';
  s += text(tx + tw / 2, topY + thH / 2, th.label, { size: 11, anchor: 'middle', bold: true });
  // 外側（門外）地面
  var ox = tx + tw;
  s += '<rect x="' + ox + '" y="' + (slabTop - 24) + '" width="' + (W - 10 - ox) + '" height="24" fill="#e8e8e8" stroke="#888"/>' + text(ox + 6, slabTop - 8, '門外地面', { size: 10.5 });
  // 標註
  s += dimLine(tx, topY - 14, tx + tw, topY - 14, '寬 ' + th.width + ' cm', -4);
  s += '<line x1="' + (mx - 6) + '" y1="' + tY + '" x2="' + (tx + 4) + '" y2="' + tY + '" stroke="#d62828" stroke-dasharray="3 3"/>' + text(mx, tY - 6, '地磚完成面', { size: 10, fill: '#d62828' });
  s += text(W - 12, topY - 20, '門檻頂面高出地磚 ' + th.riseAbove + ' cm', { size: 10, anchor: 'end' });
  s += text(10, Hh - 8, '示意圖：厚度依輸入等比例，砂漿層 1.5 cm 為假設值，實際以現場為準。', { size: 9.5, fill: '#777' });
  s += '</svg>';
  void wt;
  return s;
}

/* ---------------------------------------------------------------- 3D 檢視器（canvas，滑鼠旋轉、滾輪縮放） */
function Viewer3D(canvas) {
  this.cv = canvas; this.ctx = canvas.getContext('2d');
  this.yaw = -0.6; this.pitch = 0.62; this.zoom = 1; this.res = null; this.showWalls = { N: true, E: true, S: true, W: true };
  var me = this, drag = null;
  canvas.addEventListener('mousedown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: me.yaw, pitch: me.pitch }; });
  window.addEventListener('mouseup', function () { drag = null; });
  window.addEventListener('mousemove', function (e) {
    if (!drag) { return; }
    me.yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    me.pitch = Math.max(0.05, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * 0.006));
    me.draw();
  });
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); me.zoom = Math.max(0.4, Math.min(3, me.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); me.draw(); }, { passive: false });
}
Viewer3D.prototype.setResult = function (res) { this.res = res; this.draw(); };
Viewer3D.prototype.draw = function () {
  var res = this.res, ctx = this.ctx, cv = this.cv;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#f6f5f1'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!res || !res.ok) { return; }
  var pj = res.project, R = pj.room, ew = res.floor.surface.ew, cosA = Math.cos(this.yaw), sinA = Math.sin(this.yaw), cosB = Math.cos(this.pitch), sinB = Math.sin(this.pitch);
  var cx = R.L / 2, cy = R.D / 2, cz = R.H / 3;
  function T(p) {         // 世界座標 → [螢幕x, 螢幕y, 深度]
    var x = p[0] - cx, y = p[1] - cy, z = p[2] - cz, x1 = x * cosA - y * sinA, y1 = x * sinA + y * cosA;
    return [x1, -(-y1 * sinB + z * cosB), -y1 * cosB - z * sinB];
  }
  var scale = Math.min(cv.width / (Math.max(R.L, R.D) * 1.9), cv.height / (R.H * 2.2 + Math.max(R.L, R.D) * 0.6)) * this.zoom * 1.5;
  function P(p) { var t = T(p); return [cv.width / 2 + t[0] * scale, cv.height * 0.55 + t[1] * scale]; }
  function poly(pts3, fill, stroke, lw) {
    ctx.beginPath();
    pts3.forEach(function (p, i) { var q = P(p); if (i) { ctx.lineTo(q[0], q[1]); } else { ctx.moveTo(q[0], q[1]); } });
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.5; ctx.stroke(); }
  }
  // 地面
  var fev = res.floor.chosen.ev;
  poly([[0, 0, -0.5], [R.L, 0, -0.5], [R.L, R.D, -0.5], [0, R.D, -0.5]], '#d9d6cf', '#777', 1);
  fev.polys.forEach(function (p) {
    p.clipped.forEach(function (c) { poly(c.map(function (q) { return [q[0], q[1], 0]; }), C[p.kind], '#8f8a7c', 0.5); });
  });
  var d = pj.drain, h = d.size / 2;
  poly([[d.x - h, d.y - h, 0.1], [d.x + h, d.y - h, 0.1], [d.x + h, d.y + h, 0.1], [d.x - h, d.y + h, 0.1]], '#ffffff', '#1d6fa5', 1.5);
  // 牆（只畫面向鏡頭的內面，由遠到近）
  var me = this, defs = [
    { w: 'N', n: [0, 1, 0], map: function (u, z) { return [u, ew, z]; } },
    { w: 'S', n: [0, -1, 0], map: function (u, z) { return [u, R.D - ew, z]; } },
    { w: 'W', n: [1, 0, 0], map: function (u, z) { return [ew, u, z]; } },
    { w: 'E', n: [-1, 0, 0], map: function (u, z) { return [R.L - ew, u, z]; } }
  ];
  var vis = defs.filter(function (dw) {
    if (!res.walls[dw.w] || !me.showWalls[dw.w]) { return false; }
    var nx = dw.n[0] * cosA - dw.n[1] * sinA, ny = dw.n[0] * sinA + dw.n[1] * cosA;
    return ny * cosB > 0.02;
  });
  vis.forEach(function (dw) { var m = dw.map(res.walls[dw.w].surface.len / 2, R.H / 2); dw.depth = T(m)[2]; });
  vis.sort(function (a, b) { return b.depth - a.depth; });
  vis.forEach(function (dw) {
    var wi = res.walls[dw.w], sf = wi.surface, shade = dw.w === 'N' || dw.w === 'S' ? 1 : 0.93;
    poly([dw.map(0, 0), dw.map(sf.len, 0), dw.map(sf.len, R.H), dw.map(0, R.H)], '#e6e2d8', '#777', 1);
    wi.chosen.ev.polys.forEach(function (p) {
      p.clipped.forEach(function (c) {
        var col = p.kind === 'full' ? '#efe9dd' : (p.kind === 'cut' ? '#f2c58a' : '#e9a3a3');
        if (shade < 1) { col = shadeColor(col, shade); }
        poly(c.map(function (q) { return dw.map(q[0], q[1]); }), col, '#8f8a7c', 0.5);
      });
    });
    sf.openRects.forEach(function (q) {
      var r = q.r;
      poly([dw.map(r[0], r[1]), dw.map(r[2], r[1]), dw.map(r[2], r[3]), dw.map(r[0], r[3])], q.o.type === 'door' ? '#f4f4f4' : '#bfe3f5', q.o.type === 'door' ? '#c0392b' : '#3a8fc7', 2);
    });
    sf.fixtureRects.forEach(function (q) {
      var f = q.f, c = P(dw.map(f.offset, f.height));
      ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(2.5, f.dia * scale / 2), 0, 6.283);
      ctx.fillStyle = f.kind === 'supply' ? '#1d6fa5' : '#666'; ctx.fill();
    });
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif';
    var lp = P(dw.map(sf.len / 2, R.H + 2)); ctx.textAlign = 'center'; ctx.fillText(E.WALL_ZH[dw.w], lp[0], lp[1] - 4);
  });
  // 起始點
  var o = res.floor.chosen.origin;
  if (o) {
    var c = P([o[0], o[1], 0.3]);
    ctx.strokeStyle = '#d62828'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c[0], c[1], 6, 0, 6.283); ctx.moveTo(c[0] - 10, c[1]); ctx.lineTo(c[0] + 10, c[1]); ctx.moveTo(c[0], c[1] - 10); ctx.lineTo(c[0], c[1] + 10); ctx.stroke();
    ctx.fillStyle = '#d62828'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('起始磚', c[0] + 10, c[1] - 8);
  }
  ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('拖曳旋轉 ｜ 滾輪縮放 ｜ 淺色＝整磚、橘色＝切磚、紅色＝開孔磚', 10, cv.height - 10);
};
function shadeColor(hex, k) {
  var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')';
}

var api = { planSVG: planSVG, wallSVG: wallSVG, thumbSVG: thumbSVG, thresholdSVG: thresholdSVG, Viewer3D: Viewer3D, C: C, f1: f1, esc: esc };
if (typeof module !== 'undefined' && module.exports) { module.exports = api; } else { root.TileDraw = api; }
})(typeof window !== 'undefined' ? window : this);
