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
  // 洩水等高線與角隅高差
  var dr0 = pj.drain, n = sf.net;
  if (dr0.slope > 0) {
    var cs = [[n[0], n[1]], [n[2], n[1]], [n[2], n[3]], [n[0], n[3]]], fmax = 0, far = cs[0];
    cs.forEach(function (c) { var f = E.fallAt(pj, c[0], c[1]); if (f > fmax) { fmax = f; far = c; } });
    var step = fmax > 6 ? 1 : (fmax > 1.5 ? 0.5 : 0.25), sl0 = dr0.slope / 100, lv, lbl = '';
    s += '<clipPath id="cpNet"><rect x="' + X(n[0]) + '" y="' + Y(n[1]) + '" width="' + ((n[2] - n[0]) * sc) + '" height="' + ((n[3] - n[1]) * sc) + '"/></clipPath>';
    s += '<g clip-path="url(#cpNet)" fill="none" stroke="#0a8f7e" stroke-width="1.1" stroke-dasharray="5 3">';
    for (lv = step; lv < fmax - 1e-6; lv += step) {
      var rr = lv / sl0;
      if (dr0.mode === 'point') { s += '<circle cx="' + X(dr0.x) + '" cy="' + Y(dr0.y) + '" r="' + (rr * sc) + '"/>'; }
      else if (dr0.dir === 'N' || dr0.dir === 'S') { var yy = dr0.dir === 'N' ? dr0.y + rr : dr0.y - rr; s += '<line x1="' + X(n[0]) + '" y1="' + Y(yy) + '" x2="' + X(n[2]) + '" y2="' + Y(yy) + '"/>'; }
      else { var xx = dr0.dir === 'W' ? dr0.x + rr : dr0.x - rr; s += '<line x1="' + X(xx) + '" y1="' + Y(n[1]) + '" x2="' + X(xx) + '" y2="' + Y(n[3]) + '"/>'; }
      var lx, ly;
      if (dr0.mode === 'point') { var dd = Math.hypot(far[0] - dr0.x, far[1] - dr0.y) || 1; lx = dr0.x + (far[0] - dr0.x) / dd * rr; ly = dr0.y + (far[1] - dr0.y) / dd * rr; }
      else if (dr0.dir === 'N' || dr0.dir === 'S') { lx = (n[0] + n[2]) / 2; ly = dr0.dir === 'N' ? dr0.y + rr : dr0.y - rr; }
      else { ly = (n[1] + n[3]) / 2; lx = dr0.dir === 'W' ? dr0.x + rr : dr0.x - rr; }
      if (lx > n[0] && lx < n[2] && ly > n[1] && ly < n[3]) { lbl += text(X(lx) + 3, Y(ly) - 3, '+' + (Math.round(lv * 100) / 100) + ' cm', { size: 10.5, fill: '#0a8f7e', bold: true }); }
    }
    s += '</g>' + lbl;
    cs.forEach(function (c, i) {
      var f = E.fallAt(pj, c[0], c[1]), left = i === 0 || i === 3, top = i < 2;
      s += '<rect x="' + (X(c[0]) + (left ? 3 : -49)) + '" y="' + (Y(c[1]) + (top ? 3 : -17)) + '" width="46" height="14" rx="3" fill="#fff" fill-opacity="0.9" stroke="#0a8f7e" stroke-width="0.8"/>';
      s += text(X(c[0]) + (left ? 26 : -26), Y(c[1]) + (top ? 13.5 : -6.5), '+' + f.toFixed(2), { size: 10.5, fill: '#0a8f7e', bold: true, anchor: 'middle' });
    });
    s += text(X(0), Y(R.D) + 56, '青色虛線＝洩水等高線（每 ' + step + ' cm），數字＝比落水孔高出多少 cm；四角方框＝該角地面完成面高差', { size: 11, fill: '#0a8f7e' });
  }
  // 牆磚完成層（淨區域外圈）
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
  var hh = H * sc + pad * 2 + 30 + (res.wallBase && pj.drain.slope > 0 ? 150 : 0);
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
  // 洩水後的地面完成面（牆腳線）
  var wb = res.wallBase && res.wallBase[w];
  if (wb && pj.drain.slope > 0) {
    var efv = res.floorTile.t / 10 + E.ADH;
    s += '<polyline points="' + wb.samples.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(efv + p[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="#0a8f7e" stroke-width="2.6"/>';
    // 牆腳線放大圖（垂直放大，才看得出貼地第一排壁磚下緣的斜度）
    var top0 = Y(0) + 84, ih = 56, fm = Math.max(wb.max, 0.01), kz = (ih - 20) / fm;
    s += text(pad, top0 - 12, '牆腳地面線放大圖（垂直放大 ×' + Math.round(kz / sc) + '）：貼地第一排壁磚的下緣要沿此線切斜', { size: 11, fill: '#0a8f7e', bold: true });
    s += '<rect x="' + X(0 * 1) + '" y="' + top0 + '" width="0" height="0"/>';
    var xa = Math.min(X(0), X(len)), xb = Math.max(X(0), X(len));
    s += '<rect x="' + xa + '" y="' + top0 + '" width="' + (xb - xa) + '" height="' + (ih + 14) + '" fill="#f4faf9" stroke="#bcd9d4"/>';
    s += '<polygon points="' + wb.samples.map(function (p) { return X(p[0]).toFixed(1) + ',' + (top0 + ih - p[1] * kz).toFixed(1); }).join(' ') + ' ' + xb + ',' + (top0 + ih + 14) + ' ' + xa + ',' + (top0 + ih + 14) + '" fill="#efe9dd" stroke="none"/>';
    s += '<polyline points="' + wb.samples.map(function (p) { return X(p[0]).toFixed(1) + ',' + (top0 + ih - p[1] * kz).toFixed(1); }).join(' ') + '" fill="none" stroke="#0a8f7e" stroke-width="2.4"/>';
    [[0, wb.atStart], [wb.len / 2, wb.atMid], [wb.len, wb.atEnd]].forEach(function (q, i) {
      var yy = top0 + ih - q[1] * kz;
      s += '<circle cx="' + X(q[0]) + '" cy="' + yy + '" r="3.5" fill="#0a8f7e"/>';
      s += text(X(q[0]) + (i === 1 ? 0 : (((i === 0) !== flip) ? 7 : -7)), yy - 8, '+' + q[1].toFixed(2), { size: 11, fill: '#0a8f7e', bold: true, anchor: i === 1 ? 'middle' : (((i === 0) !== flip) ? 'start' : 'end') });
    });
    s += text(pad, top0 + ih + 30, '數字＝該處比落水孔處完成面高出多少 cm（真實值）；最低 +' + wb.min.toFixed(2) + '（距起點 ' + f1(wb.minAt) + ' cm）、最高 +' + wb.max.toFixed(2) + '（距起點 ' + f1(wb.maxAt) + ' cm）', { size: 11, fill: '#0a8f7e' });
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
  this.yaw = -0.6; this.pitch = 0.62; this.zoom = 1; this.res = null; this.showWalls = { N: true, E: true, S: true, W: true }; this.xray = true; this.k = 10; this.sec = { on: true, axis: 'x', pos: null }; this.onSec = null;
  var me = this, drag = null;
  canvas.addEventListener('mousedown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: me.yaw, pitch: me.pitch, shift: e.shiftKey, pos: me.secPos() }; });
  window.addEventListener('mouseup', function () { drag = null; });
  window.addEventListener('mousemove', function (e) {
    if (!drag) { return; }
    if (drag.shift && me.res && me.res.ok) {
      var R0 = me.res.project.room, L0 = me.sec.axis === 'x' ? R0.L : R0.D;
      me.sec.pos = Math.max(0, Math.min(L0, drag.pos + (e.clientX - drag.x) * L0 / 300));
      me.draw(); if (me.onSec) { me.onSec(); } return;
    }
    me.yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    me.pitch = Math.max(0.05, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * 0.006));
    me.draw();
  });
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); me.zoom = Math.max(0.4, Math.min(3, me.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); me.draw(); }, { passive: false });
}
Viewer3D.prototype.secPos = function () {
  var r = this.res; if (!r || !r.ok) { return 0; }
  var R = r.project.room, dr = r.project.drain, L = this.sec.axis === 'x' ? R.L : R.D;
  var p = this.sec.pos == null ? (this.sec.axis === 'x' ? dr.x : dr.y) : this.sec.pos;
  return Math.max(0, Math.min(L, p));
};
function clipHalf(poly, g) {
  var out = [], n = poly.length, j, cur, nxt, gc, gn, t;
  for (j = 0; j < n; j++) {
    cur = poly[j]; nxt = poly[(j + 1) % n]; gc = g(cur); gn = g(nxt);
    if (gc >= 0) { out.push(cur); }
    if ((gc >= 0) !== (gn >= 0)) { t = gc / (gc - gn); out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t]); }
  }
  return out;
}
function clipAbove(poly, base) {          // base：由左到右的凸折線 [[u,z]]；保留折線上方
  var out = poly, i;
  for (i = 0; i < base.length - 1 && out.length; i++) {
    var a = base[i], b = base[i + 1];
    if (b[0] - a[0] < 1e-9) { continue; }
    var m = (b[1] - a[1]) / (b[0] - a[0]);
    out = clipHalf(out, function (p) { return p[1] - (a[1] + m * (p[0] - a[0])); });
  }
  return out;
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
  var fev = res.floor.chosen.ev, kk = this.k || 1, ef = res.floorTile.t / 10 + E.ADH, fmaxAll = 0.0001;
  [[0, 0], [R.L, 0], [R.L, R.D], [0, R.D]].forEach(function (c) { fmaxAll = Math.max(fmaxAll, E.fallAt(pj, c[0], c[1])); });
  function zf(x, y) { return ef + kk * E.fallAt(pj, x, y); }
  poly([[0, 0, -0.5], [R.L, 0, -0.5], [R.L, R.D, -0.5], [0, R.D, -0.5]], '#d9d6cf', '#777', 1);
  fev.polys.forEach(function (p) {
    p.clipped.forEach(function (c) {
      var mx = 0, my = 0; c.forEach(function (q) { mx += q[0]; my += q[1]; }); mx /= c.length; my /= c.length;
      var tint = 1 - 0.2 * E.fallAt(pj, mx, my) / fmaxAll;
      poly(c.map(function (q) { return [q[0], q[1], zf(q[0], q[1])]; }), shadeColor(C[p.kind], tint), '#8f8a7c', 0.5);
    });
  });
  var d = pj.drain, h = d.size / 2;
  poly([[d.x - h, d.y - h], [d.x + h, d.y - h], [d.x + h, d.y + h], [d.x - h, d.y + h]].map(function (q) { return [q[0], q[1], zf(q[0], q[1]) + 0.1]; }), '#ffffff', '#1d6fa5', 1.5);
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
    var wbs = res.wallBase && res.wallBase[dw.w], baseLine = wbs ? wbs.samples.map(function (q) { return [q[0], ef + kk * q[1]]; }) : null;
    var bgPoly = [[0, 0], [sf.len, 0], [sf.len, R.H], [0, R.H]];
    if (baseLine && pj.drain.slope > 0) { bgPoly = clipAbove(bgPoly, baseLine); }
    poly(bgPoly.map(function (q) { return dw.map(q[0], q[1]); }), '#e6e2d8', '#777', 1);
    wi.chosen.ev.polys.forEach(function (p) {
      p.clipped.forEach(function (c0) {
        var c = (baseLine && pj.drain.slope > 0) ? clipAbove(c0, baseLine) : c0;
        if (c.length < 3) { return; }
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
    var tk = (R.wallT && R.wallT[dw.w]) || 0;
    if (tk > 0) {
      var bd = tk + ew;
      var back = function (u, z) { var p = dw.map(u, z); return [p[0] - dw.n[0] * bd, p[1] - dw.n[1] * bd, p[2]]; };
      // 洞口側壁（門窗框厚度）
      sf.openRects.forEach(function (q) {
        var r = q.r, A = [r[0], r[1]], B = [r[2], r[1]], Cc = [r[2], r[3]], D2 = [r[0], r[3]];
        [[A, B], [B, Cc], [Cc, D2], [D2, A]].forEach(function (s2) {
          poly([dw.map(s2[0][0], s2[0][1]), dw.map(s2[1][0], s2[1][1]), back(s2[1][0], s2[1][1]), back(s2[0][0], s2[0][1])], '#cfc9bc', '#8a8578', 1);
        });
      });
      if (me.xray) {
        poly([back(0, 0), back(sf.len, 0), back(sf.len, R.H), back(0, R.H)], 'rgba(110,110,110,0.10)', 'rgba(90,90,90,0.55)', 1);
        [[0, 0], [sf.len, 0], [sf.len, R.H], [0, R.H]].forEach(function (c4) {
          var p0 = P(dw.map(c4[0], c4[1])), p1 = P(back(c4[0], c4[1]));
          ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.strokeStyle = 'rgba(90,90,90,0.55)'; ctx.lineWidth = 1; ctx.stroke();
        });
        sf.fixtureRects.forEach(function (q) {
          var f = q.f, p0 = P(dw.map(f.offset, f.height)), p1 = P(back(f.offset, f.height));
          ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
          ctx.strokeStyle = f.kind === 'supply' ? '#1d6fa5' : '#444'; ctx.lineWidth = Math.max(3, f.dia * scale); ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.arc(p1[0], p1[1], Math.max(3, f.dia * scale / 2), 0, 6.283); ctx.fillStyle = f.kind === 'supply' ? '#1d6fa5' : '#444'; ctx.fill();
        });
      }
      // 牆頂斷面（天花板高處的牆厚）
      var pc = [back(0, R.H), back(sf.len, R.H), dw.map(sf.len, R.H), dw.map(0, R.H)];
      poly(pc, '#9a968c', '#555', 1);
      ctx.fillStyle = '#555'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      var mc = P(back(sf.len / 2, R.H)); ctx.fillText('牆厚 ' + tk + ' cm', mc[0], mc[1] - 3);
    }
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif';
    var lp = P(dw.map(sf.len / 2, R.H + 2)); ctx.textAlign = 'center'; ctx.fillText(E.WALL_ZH[dw.w], lp[0], lp[1] - (tk > 0 ? 30 : 4));
  });
  // 洩水剖面（可拖動）
  var sec = this.sec;
  if (sec && sec.on !== false) {
    var ax = sec.axis, pos = this.secPos(), len2 = ax === 'x' ? R.D : R.L, NN = 60, line = [], ii;
    for (ii = 0; ii <= NN; ii++) { var tt = len2 * ii / NN, xx = ax === 'x' ? pos : tt, yy = ax === 'x' ? tt : pos; line.push([xx, yy, zf(xx, yy)]); }
    var topz = Math.max(40, ef + kk * fmaxAll + 25);
    poly([[line[0][0], line[0][1], 0], [line[NN][0], line[NN][1], 0], [line[NN][0], line[NN][1], topz], [line[0][0], line[0][1], topz]], 'rgba(214,40,40,0.07)', 'rgba(214,40,40,0.65)', 1);
    poly(line.concat(line.slice().reverse().map(function (q) { return [q[0], q[1], 0]; })), 'rgba(232,160,48,0.6)', '#b8741a', 1);
    ctx.beginPath(); line.forEach(function (q, i2) { var pp = P(q); if (i2) { ctx.lineTo(pp[0], pp[1]); } else { ctx.moveTo(pp[0], pp[1]); } });
    ctx.strokeStyle = '#d62828'; ctx.lineWidth = 3; ctx.stroke();
    var lt = P([line[NN][0], line[NN][1], topz]);
    ctx.fillStyle = '#d62828'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('剖面 ' + ax + ' = ' + (Math.round(pos * 10) / 10) + ' cm（垂直放大 ×' + kk + '）', lt[0], lt[1] - 6);
  }
  // 起始點
  var o = res.floor.chosen.origin;
  if (o) {
    var c = P([o[0], o[1], zf(o[0], o[1]) + 0.3]);
    ctx.strokeStyle = '#d62828'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c[0], c[1], 6, 0, 6.283); ctx.moveTo(c[0] - 10, c[1]); ctx.lineTo(c[0] + 10, c[1]); ctx.moveTo(c[0], c[1] - 10); ctx.lineTo(c[0], c[1] + 10); ctx.stroke();
    ctx.fillStyle = '#d62828'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('起始磚', c[0] + 10, c[1] - 8);
  }
  ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('拖曳旋轉 ｜ 滾輪縮放 ｜ Shift＋左右拖曳＝移動剖面 ｜ 淺色＝整磚、橘色＝切磚、紅色＝開孔磚；地面高程已放大 ×' + kk, 10, cv.height - 10);
};
function shadeColor(hex, k) {
  var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')';
}

/* ---------------------------------------------------------------- 洩水剖面圖（沿某條線切地面） */
function lineIntervals(polys, axis, pos) {
  var out = [];
  polys.forEach(function (p) {
    p.clipped.forEach(function (c) {
      var ts = [], j;
      for (j = 0; j < c.length; j++) {
        var a = c[j], b = c[(j + 1) % c.length], av = axis === 'x' ? a[0] : a[1], bv = axis === 'x' ? b[0] : b[1], ao = axis === 'x' ? a[1] : a[0], bo = axis === 'x' ? b[1] : b[0];
        if (Math.abs(av - pos) < 1e-9 && Math.abs(bv - pos) < 1e-9) { ts.push(ao, bo); }
        else if ((av - pos) * (bv - pos) <= 0 && av !== bv) { ts.push(ao + (bo - ao) * (pos - av) / (bv - av)); }
      }
      if (ts.length >= 2) { var lo = Math.min.apply(null, ts), hi = Math.max.apply(null, ts); if (hi - lo > 1e-6) { out.push({ a: lo, b: hi, kind: p.kind }); } }
    });
  });
  return out;
}
function profileSVG(res, axis, pos) {
  var pj = res.project, R = pj.room, len = axis === 'x' ? R.D : R.L, W = 900, Hh = 330, pl = 64, pr = 36, pt = 52, pb = 74;
  var ef = res.floorTile.t / 10 + E.ADH, N = 160, i, f = [], fmin = Infinity, fmax = -Infinity, tmin = 0, tmax = 0;
  var at = function (t) { return axis === 'x' ? [pos, t] : [t, pos]; };
  for (i = 0; i <= N; i++) { var t = len * i / N, q = at(t), v = E.fallAt(pj, q[0], q[1]); f.push([t, v]); if (v < fmin) { fmin = v; tmin = t; } if (v > fmax) { fmax = v; tmax = t; } }
  var vmax = ef + fmax + 0.6, sx = (W - pl - pr) / len, sv = (Hh - pt - pb) / vmax, kEff = sv / sx;
  var X = function (t) { return pl + t * sx; }, Y = function (z) { return Hh - pb - z * sv; };
  function fv(t) { var q = at(t); return E.fallAt(pj, q[0], q[1]); }
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + Hh + '" class="fig" role="img" aria-label="洩水剖面圖">';
  s += '<rect width="100%" height="100%" fill="#fff"/>';
  var ttl = (axis === 'x' ? '縱剖面（由北往南）：x = ' : '橫剖面（由西往東）：y = ') + f1(pos) + ' cm';
  s += text(pl, 22, ttl + '　垂直放大 ×' + kEff.toFixed(0) + '（水平 1：垂直 ' + kEff.toFixed(0) + '，才看得出坡度）', { size: 13, bold: true });
  s += '<rect x="' + pl + '" y="' + Y(0) + '" width="' + (len * sx) + '" height="14" fill="#cfcac0" stroke="#777"/>' + text(pl + 6, Y(0) + 11, '結構樓板', { size: 10, fill: '#555' });
  s += '<polygon points="' + f.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + ' ' + X(len) + ',' + Y(0) + ' ' + X(0) + ',' + Y(0) + '" fill="#e6d6b8" stroke="#b8a27a" stroke-width="0.8"/>';
  lineIntervals(res.floor.chosen.ev.polys, axis, pos).forEach(function (iv) {
    var f0 = fv(iv.a), f1v = fv(iv.b);
    s += '<polygon points="' + X(iv.a) + ',' + Y(f0) + ' ' + X(iv.b) + ',' + Y(f1v) + ' ' + X(iv.b) + ',' + Y(f1v + ef) + ' ' + X(iv.a) + ',' + Y(f0 + ef) + '" fill="' + C[iv.kind] + '" stroke="#8f8a7c" stroke-width="0.6"/>';
  });
  s += '<polyline points="' + f.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1] + ef).toFixed(1); }).join(' ') + '" fill="none" stroke="#0a8f7e" stroke-width="2.2"/>';
  var dr = pj.drain, dc = axis === 'x' ? dr.x : dr.y, dt = axis === 'x' ? dr.y : dr.x;
  if (Math.abs(dc - pos) <= dr.size / 2) {
    s += '<rect x="' + X(dt - dr.size / 2) + '" y="' + (Y(ef) - 4) + '" width="' + (dr.size * sx) + '" height="' + (ef * sv + 8) + '" fill="#fff" stroke="#1d6fa5" stroke-width="1.4"/>';
    s += text(X(dt), Y(ef) - 10, '落水孔', { size: 11, fill: '#1d6fa5', anchor: 'middle', bold: true });
  }
  s += '<line x1="' + pl + '" y1="' + Y(ef) + '" x2="' + X(len) + '" y2="' + Y(ef) + '" stroke="#0a8f7e" stroke-width="0.8" stroke-dasharray="5 4"/>';
  s += text(X(len) - 2, Y(ef) + 14, '落水孔處完成面（磚＋黏著劑 ' + f1(ef) + ' cm）', { size: 10, fill: '#0a8f7e', anchor: 'end' });
  s += '<rect x="' + (pl - 12) + '" y="' + Y(vmax) + '" width="12" height="' + (Y(0) + 14 - Y(vmax)) + '" fill="#9a968c" stroke="#555"/>';
  s += '<rect x="' + X(len) + '" y="' + Y(vmax) + '" width="12" height="' + (Y(0) + 14 - Y(vmax)) + '" fill="#9a968c" stroke="#555"/>';
  function tag(t, label, color, up) {
    var yy = Y(fv(t) + ef);
    return '<circle cx="' + X(t) + '" cy="' + yy + '" r="3.5" fill="' + color + '"/>' + text(X(t), yy + (up ? -9 : 17), label, { size: 11, fill: color, anchor: t < len * 0.08 ? 'start' : (t > len * 0.92 ? 'end' : 'middle'), bold: true });
  }
  s += tag(0, '+' + fv(0).toFixed(2) + ' cm', '#0a8f7e', true);
  s += tag(len, '+' + fv(len).toFixed(2) + ' cm', '#0a8f7e', true);
  if (fmax > 0.05 && tmax > len * 0.1 && tmax < len * 0.9) { s += tag(tmax, '最高 +' + fmax.toFixed(2), '#c0392b', true); }
  if (fmin > 0.05 && tmin > len * 0.1 && tmin < len * 0.9) { s += tag(tmin, '最低 +' + fmin.toFixed(2), '#1d6fa5', false); }
  s += text(pl, Hh - 40, axis === 'x' ? '北' : '西', { size: 12, bold: true, anchor: 'middle' });
  s += text(X(len), Hh - 40, axis === 'x' ? '南' : '東', { size: 12, bold: true, anchor: 'middle' });
  var endSlope = (fv(len) - fv(0)) / len * 100, locMax = 0;
  for (i = 1; i <= N; i++) { locMax = Math.max(locMax, Math.abs(f[i][1] - f[i - 1][1]) / (f[i][0] - f[i - 1][0]) * 100); }
  s += text(pl, Hh - 22, '本剖面：兩端高差 ' + Math.abs(fv(len) - fv(0)).toFixed(2) + ' cm（端到端平均 ' + endSlope.toFixed(2) + '%）｜最大局部坡度 ' + locMax.toFixed(2) + '%｜最高點比最低點高 ' + (fmax - fmin).toFixed(2) + ' cm', { size: 11.5, fill: '#333' });
  s += text(pl, Hh - 6, '淺色＝整磚、橘色＝切磚、紅色＝開孔磚、米色＝找坡砂漿層、青線＝洩水後的地面完成面', { size: 10.5, fill: '#666' });
  s += '</svg>';
  return s;
}

var api = { profileSVG: profileSVG, planSVG: planSVG, wallSVG: wallSVG, thumbSVG: thumbSVG, thresholdSVG: thresholdSVG, Viewer3D: Viewer3D, C: C, f1: f1, esc: esc };
if (typeof module !== 'undefined' && module.exports) { module.exports = api; } else { root.TileDraw = api; }
})(typeof window !== 'undefined' ? window : this);
