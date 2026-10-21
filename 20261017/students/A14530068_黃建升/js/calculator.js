// 磁磚排磚放樣幾何核心、開口扣除與算料演算法
// 基礎工具函式（$、EPS、num、num0）已於 config.js 全域宣告提供

// 門窗開口：直接透過 openings 模組取得，支援任意多個門窗扣除
function openings(dims) {
  return typeof getOpeningsByFace === 'function' ? getOpeningsByFace(dims) : { A: [], B: [], C: [], D: [] };
}

// ── 地坪實際外框（L 形、斜牆）：每塊磚跟外框多邊形裁切，算露出的形狀與面積 ──

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

// 多邊形裁到矩形 [x0, y0, x1, y1] 內（Sutherland–Hodgman，四條邊各裁一次）
function clipPolygonRect(poly, x0, y0, x1, y1) {
  const edges = [
    [p => p[0] >= x0, (p, q) => [x0, p[1] + (q[1] - p[1]) * (x0 - p[0]) / (q[0] - p[0])]],
    [p => p[0] <= x1, (p, q) => [x1, p[1] + (q[1] - p[1]) * (x1 - p[0]) / (q[0] - p[0])]],
    [p => p[1] >= y0, (p, q) => [p[0] + (q[0] - p[0]) * (y0 - p[1]) / (q[1] - p[1]), y0]],
    [p => p[1] <= y1, (p, q) => [p[0] + (q[0] - p[0]) * (y1 - p[1]) / (q[1] - p[1]), y1]]
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i], q = src[(i + 1) % src.length];
      if (inside(q)) { if (!inside(p)) out.push(cross(p, q)); out.push(q); }
      else if (inside(p)) out.push(cross(p, q));
    }
    if (!out.length) break;
  }
  return out;
}

// 裁切後形狀的「最短邊」：外接框寬高與 2×面積÷最長邊取小（細長三角形也量得出窄的那一邊）
function polyMinDim(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let longest = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    longest = Math.max(longest, Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), longest ? 2 * polyArea(pts) / longest : 0);
}

function params() {
  return {
    L: num('L', 600),
    W: num('W', 400),
    H: num('H', 280),
    TL: num('TL', 120),
    TW: num('TW', 60),
    joint: num('joint', 2) / 10,
    price: num('price', 0),
    spare: num0('spare', 0),
    smallTh: num('smallTh', 5),
    avoidTh: num('avoidTh', 5),
    // 地磚＋黏著層至少墊高約 1cm，牆底這段被蓋住（0＝不考慮）
    floorCover: num0('floorCover', 1)
  };
}

function cfgOf(k) {
  return {
    dir: $(k + '_dir').value,
    mode: $(k + '_mode').value,
    xalign: $(k + '_xalign').value,
    yalign: $(k + '_yalign').value,
    xoff: num0(k + '_xoff', 0),
    yoff: num0(k + '_yoff', 0),
    marks: parseMarks($(k + '_marks') ? $(k + '_marks').value : ''),
    poly: k === 'floor' ? floorOutline : null,
    skip: $(k + '_skip') ? !!$(k + '_skip').checked : false,
    zones: parseZones($(k + '_zones') ? $(k + '_zones').value : '')
  };
}

// 紅線位置「59, 142」→ [59, 142]（只留正數）
function parseMarks(s) {
  return String(s || '').split(/[,，、\s]+/).map(parseFloat).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
}

// 「60×120」「60*120」「60x120」→ { TL: 60, TW: 120 }；空白或看不懂回 null
function parseTileSize(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[2]);
  return a > 0 && b > 0 ? { TL: a, TW: b } : null;
}

// 該面用的參數：有自己的磚尺寸就換掉共用磁磚（例如地坪 120×60、牆 120×120）
function paramsFor(p, k) {
  const t = parseTileSize($(k + '_tile') ? $(k + '_tile').value : '');
  return t ? Object.assign({}, p, t) : p;
}

// 第 r 列（沿面寬方向）的起點偏移量，依工法
function rowOffset(r, pitchL, mode) {
  if (mode === 'grid') return 0;
  if (mode === '55') return (r % 2) * 0.5 * pitchL;
  if (mode === '37') return (r * 0.3 * pitchL) % pitchL;
  if (mode === '28') return (r * 0.2 * pitchL) % pitchL;
  return 0;
}

// 磚被門窗遮住一部分時，回傳露出區塊的中心與短邊（讓「避免小料」圈在看得到的那一條）
function visiblePart(t, ops) {
  if (t.occ) ops = ops.concat(t.occ); // 被上層分區蓋住的部分也看不到
  const x0 = Math.max(t.x0, 0), x1 = x0 + t.wL;
  const y0 = Math.max(t.y0, 0), y1 = y0 + t.wW;
  for (const o of ops) {
    const ox1 = o.x + o.w, oy1 = o.y + o.h;
    if (ox1 <= x0 || o.x >= x1 || oy1 <= y0 || o.y >= y1) continue;
    const strips = [
      [x0, y0, Math.min(o.x, x1), y1], [Math.max(ox1, x0), y0, x1, y1],
      [x0, y0, x1, Math.min(o.y, y1)], [x0, Math.max(oy1, y0), x1, y1]
    ].filter(([a, b, c, d]) => c - a > EPS && d - b > EPS);
    if (strips.length) {
      const [a, b, c, d] = strips.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]))[0];
      return { cx: (a + c) / 2, cy: (b + d) / 2, minDim: Math.min(c - a, d - b) };
    }
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, minDim: Math.min(t.wL, t.wW) };
}

// 「避免小料」紅圈位置：同一橫排（扁的小料）或同一直排（窄的小料）只標一次，圈在那排中間那塊
function sliverMarks(tiles, ops) {
  const rows = {};
  for (const t of tiles) {
    if (!t.avoid) continue;
    const v = visiblePart(t, ops);
    const flat = t.wW <= t.wL; // 扁的 → 橫排；窄的 → 直排
    const key = flat ? 'r' + Math.round(v.cy * 10) : 'c' + Math.round(v.cx * 10);
    (rows[key] = rows[key] || []).push(Object.assign({ flat }, v));
  }
  return Object.values(rows).map(list => {
    list.sort((a, b) => a.flat ? a.cx - b.cx : a.cy - b.cy);
    return list[Math.floor(list.length / 2)];
  });
}

// 小料判定（依黃建升的現場經驗）：只看裁切後露出部分的最短邊
//   最短邊 < th.small（預設 5cm）＝小料，計入碎磚警示；再 < th.avoid（預設同為 5cm，可另調小）＝圖上紅圈「避免小料」
//   磁磚本身短邊 ≤ th.small（例如小馬賽克）不列入
function sliverOf(t, ops, th) {
  if (t.full || Math.min(t.tL, t.tW) <= th.small) return { danger: false, avoid: false, visMin: null };
  const visMin = t.poly ? Math.min(polyMinDim(t.poly), visiblePart(t, ops).minDim) : visiblePart(t, ops).minDim;
  return { danger: visMin < th.small, avoid: visMin < th.avoid, visMin };
}

// L 型切割（依黃建升的現場經驗）：磚包住門窗轉角，要切兩刀、內角易裂、難對位，再小都要避免
// 判斷：門窗跟這塊磚（面內露出範圍）重疊，但重疊部分寬、高都沒有佔滿整塊磚 → 有門窗轉角落在磚裡
// 回傳落在磚裡的那個門窗轉角（標記用），沒有就回 null
function lCutOf(vx0, vy0, vx1, vy1, ops) {
  for (const o of ops) {
    const ix0 = Math.max(vx0, o.x), ix1 = Math.min(vx1, o.x + o.w);
    const iy0 = Math.max(vy0, o.y), iy1 = Math.min(vy1, o.y + o.h);
    if (ix1 - ix0 <= EPS || iy1 - iy0 <= EPS) continue;
    const spanX = ix0 <= vx0 + EPS && ix1 >= vx1 - EPS;
    const spanY = iy0 <= vy0 + EPS && iy1 >= vy1 - EPS;
    if (spanX || spanY) continue;
    return [o.x > vx0 + EPS ? o.x : o.x + o.w, o.y > vy0 + EPS ? o.y : o.y + o.h];
  }
  return null;
}

// 輔助函式：計算指定區間 [xMin, xMax]（reg 有給時再限 [yMin, yMax]）內的磁磚陣列
// reg.occ：蓋在上面的分區（上下分段、腰帶…）——被蓋住的部分不鋪這種磚，沒有門窗框可以收邊
function generateZoneTiles(fw, fh, xMin, xMax, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops, th, reg) {
  th = th || { small: 5, avoid: 5 };
  const yMin = reg ? reg.yMin : 0, yMax = reg ? reg.yMax : fh;
  const occAll = (reg && reg.occ) || [];
  const tiles = [];
  const r0 = Math.floor((yMin - yBase + EPS) / pitchW);
  const r1 = Math.ceil((yMax - yBase - EPS) / pitchW);
  for (let r = r0; r <= r1; r++) {
    const off = rowOffset(r, pitchL, cfg.mode);
    const base = xBase + off;
    const c0 = Math.floor((xMin - base + EPS) / pitchL);
    const c1 = Math.ceil((xMax - base - EPS) / pitchL);
    for (let c = c0; c <= c1; c++) {
      const x0 = base + c * pitchL, x1 = x0 + tL;
      if (x1 <= xMin + EPS || x0 >= xMax - EPS) continue;
      const y0 = yBase + r * pitchW, y1 = y0 + tW;
      if (y1 <= yMin + EPS || y0 >= yMax - EPS) continue;
      // 牆底被地磚蓋住的切條：整條在蓋住範圍內就不用貼
      if (th.cover && y1 <= th.cover + EPS) continue;
      let cutL = (x0 < xMin - EPS || x1 > xMax + EPS);
      let cutW = (y0 < yMin - EPS || y1 > yMax + EPS);
      let vx0 = Math.max(x0, xMin), vy0 = Math.max(y0, yMin);
      let wL = Math.min(x1, xMax) - vx0;
      let wW = Math.min(y1, yMax) - vy0;
      // 上層分區蓋住的部分扣掉：整塊被蓋住就沒有這塊；剩下的範圍取外接框，蓋住轉角的另外記著（判斷 L 型、裁切）
      let occ = null;
      if (occAll.length) {
        const hit = occAll.filter(o => o.x < vx0 + wL - EPS && o.x + o.w > vx0 + EPS && o.y < vy0 + wW - EPS && o.y + o.h > vy0 + EPS);
        if (hit.length) {
          const parts = rectMinus([vx0, vy0, vx0 + wL, vy0 + wW], hit);
          if (!parts.length) continue;
          const bx0 = Math.min(...parts.map(q => q[0])), by0 = Math.min(...parts.map(q => q[1]));
          const bx1 = Math.max(...parts.map(q => q[2])), by1 = Math.max(...parts.map(q => q[3]));
          if (bx0 > vx0 + EPS || bx1 < vx0 + wL - EPS) cutL = true;
          if (by0 > vy0 + EPS || by1 < vy0 + wW - EPS) cutW = true;
          vx0 = bx0; vy0 = by0; wL = bx1 - bx0; wW = by1 - by0;
          const inside = hit.filter(o => o.x < bx1 - EPS && o.x + o.w > bx0 + EPS && o.y < by1 - EPS && o.y + o.h > by0 + EPS);
          if (inside.length) occ = inside;
        }
      }

      // 地坪外框（L 形、斜牆）：裁掉外框外的部分；整塊在外面的不計料
      let clip = null;
      if (cfg.poly) {
        const ax0 = vx0, ay0 = vy0;
        const shape = clipPolygonRect(cfg.poly, ax0, ay0, ax0 + wL, ay0 + wW);
        const A = shape.length >= 3 ? polyArea(shape) : 0;
        if (A <= 0.01) continue;
        if (A < wL * wW - 0.01) clip = shape;
      }

      // 開口遮蔽扣除：部分覆蓋者扣掉重疊面積，完全覆蓋者不計料
      let covered = false, cutOp = false;
      let wA = wL * wW;
      for (const o of ops) {
        const ix = Math.min(x1, o.x + o.w) - Math.max(x0, o.x);
        const iy = Math.min(y1, o.y + o.h) - Math.max(y0, o.y);
        if (ix > EPS && iy > EPS) {
          cutOp = true;
          wA -= ix * iy;
          if (wA <= EPS) { covered = true; break; }
        }
      }
      if (covered) continue;

      const full = !cutL && !cutW && !cutOp && !clip && !occ;
      const t = { x0: vx0, y0: vy0, wL, wW, full, tL, tW };
      if (occ) t.occ = occ;
      if (clip) {
        // 被斜牆／缺角切到：記下實際形狀，外接框當作這塊磚的範圍
        const xs = clip.map(p => p[0]), ys = clip.map(p => p[1]);
        Object.assign(t, { poly: clip, x0: Math.min(...xs), y0: Math.min(...ys), wL: Math.max(...xs) - Math.min(...xs), wW: Math.max(...ys) - Math.min(...ys) });
      }
      const lc = lCutOf(vx0, vy0, vx0 + wL, vy0 + wW, occ ? ops.concat(occ) : ops);
      if (lc) { t.lcut = true; t.lc = lc; }
      // 小料只看露出來的部分：牆底被地磚蓋住的那段當作遮住（整磚不受影響，仍算整磚）
      const hide = th.cover && vy0 < th.cover - EPS ? ops.concat([{ x: -1e6, y: -1e6, w: 2e6, h: 1e6 + th.cover }]) : ops;
      tiles.push(Object.assign(t, sliverOf(t, hide, th)));
    }
  }
  return tiles;
}

// 起磚基準：left/bottom＝0、right/top＝從另一端倒推、center＝置中、custom＝自訂距離
function startOf(len, pitch, t, align, off) {
  if (align === 'right' || align === 'top') return len - (Math.ceil((len - EPS) / pitch) - 1) * pitch - t;
  if (align === 'center') return (len - t) / 2;
  if (align === 'custom') return Math.max(0, Math.min(off, len));
  return 0;
}

// 分區磚（同一面混 2～3 種磚），用分號隔開，寫在後面的蓋在前面的上面：
//   左右分區「117-207: 14.8×14.8 主秀壁」＝距左 117～207、整面高
//   上下分段／腰帶「高 0-120: 30×60 下段」「高 100-130: 15×30 腰帶」＝整面寬、離地 0～120
//   兩個都寫「117-207 高 0-120: …」＝只在那一塊
// → [{ x0?, x1?, y0?, y1?, TL, TW, name }]；沒寫的範圍＝整面；不在分區內的地方沿用此面的磚
function parseZones(s) {
  const out = [];
  const N = '(\\d+(?:\\.\\d+)?)', R = `${N}\\s*[-~～－]\\s*${N}`;
  const re = new RegExp(`^\\s*(?:${R})?\\s*(?:高\\s*${R})?\\s*[:：]?\\s*${N}\\s*[*xX×]\\s*${N}\\s*(.*)$`);
  for (const part of String(s || '').split(/[;；\n]/)) {
    const m = part.match(re);
    if (!m || (m[1] === undefined && m[3] === undefined)) continue;
    const z = { TL: parseFloat(m[5]), TW: parseFloat(m[6]), name: m[7].trim() };
    if (m[1] !== undefined) Object.assign(z, { x0: parseFloat(m[1]), x1: parseFloat(m[2]) });
    if (m[3] !== undefined) Object.assign(z, { y0: parseFloat(m[3]), y1: parseFloat(m[4]) });
    const okX = z.x0 === undefined || z.x1 > z.x0, okY = z.y0 === undefined || z.y1 > z.y0;
    if (okX && okY && z.TL > 0 && z.TW > 0) out.push(z);
  }
  return out;
}

function formatZones(zones) {
  return (zones || []).map(z => [z.x0 !== undefined ? `${z.x0}-${z.x1}` : '', z.y0 !== undefined ? `高 ${z.y0}-${z.y1}` : '']
    .filter(Boolean).join(' ') + `: ${z.TL}×${z.TW}${z.name ? ' ' + z.name : ''}`).join('; ');
}

// 分區在這一面的範圍（沒寫的方向＝整面）
function zoneRect(z, fw, fh) {
  return {
    x: Math.max(0, z.x0 !== undefined ? z.x0 : 0), y: Math.max(0, z.y0 !== undefined ? z.y0 : 0),
    w: Math.min(fw, z.x1 !== undefined ? z.x1 : fw) - Math.max(0, z.x0 !== undefined ? z.x0 : 0),
    h: Math.min(fh, z.y1 !== undefined ? z.y1 : fh) - Math.max(0, z.y0 !== undefined ? z.y0 : 0)
  };
}

// 長方形 [x0, y0, x1, y1] 扣掉幾個長方形洞（{x, y, w, h}）→ 切成幾個長方形
function rectMinus(r, holes) {
  const [x0, y0, x1, y1] = r;
  const xs = [x0, x1];
  for (const o of holes) for (const v of [o.x, o.x + o.w]) if (v > x0 + EPS && v < x1 - EPS) xs.push(v);
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a <= EPS) continue;
    const hs = holes.filter(o => o.x < b - EPS && o.x + o.w > a + EPS).map(o => [Math.max(y0, o.y), Math.min(y1, o.y + o.h)])
      .filter(h => h[1] > h[0]).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [h0, h1] of hs) { if (h0 - y > EPS) out.push([a, y, b, h0]); y = Math.max(y, h1); }
    if (y1 - y > EPS) out.push([a, y, b, y1]);
  }
  return out;
}

// 每一區（此面的磚＝最底層，分區依序往上蓋）實際範圍：自己的長方形扣掉蓋在上面的分區
// → [{ zone, rect: [x0, y0, x1, y1], occ: 蓋在上面的分區長方形 }]
function zoneLayers(fw, fh, zones) {
  const rects = zones.map(z => zoneRect(z, fw, fh)).map(r => r.w > EPS && r.h > EPS ? r : null);
  const layers = [{ zone: null, rect: [0, 0, fw, fh], occ: rects.filter(Boolean) }];
  zones.forEach((z, i) => {
    const r = rects[i];
    if (r) layers.push({ zone: z, rect: [r.x, r.y, r.x + r.w, r.y + r.h], occ: rects.slice(i + 1).filter(Boolean) });
  });
  return layers;
}

// 尺寸鏈要標的分界：紅線＋分區左右起迄（上下分段的高度另外由 zoneYMarks 標）
function chainMarks(cfg) {
  return (cfg.marks || []).concat(...(cfg.zones || []).filter(z => z.x0 !== undefined).map(z => [z.x0, z.x1]));
}

function zoneYMarks(cfg) {
  return [].concat(...(cfg.zones || []).filter(z => z.y0 !== undefined).map(z => [z.y0, z.y1]));
}

// 材料名稱：有匯入的材料就用「壁 120×120」，否則只寫尺寸
// 這個尺寸（分區名稱）對應到哪一筆材料；分區有名稱時先比名稱
function matOf(TL, TW, name) {
  const same = m => m.size && ((m.size[0] === TL && m.size[1] === TW) || (m.size[0] === TW && m.size[1] === TL));
  return (name && projectMaterials.find(m => m.role === name && same(m))) || projectMaterials.find(same) || null;
}

// ── ✂️ 裁切清單與剩料回收 ──

// 這塊裁切磚實際要切出多大（立面寬×高）：被門窗遮住的部分扣掉；地坪外框切到的取外接框
// trim：門窗旁剩不到這麼寬（預設 5cm）的一條會被門框／窗框收邊蓋住，不用切出來
function cutPieceSize(t, ops, trim) {
  trim = trim === undefined ? 5 : trim;
  let x0 = Math.max(t.x0, 0), x1 = x0 + t.wL, y0 = Math.max(t.y0, 0), y1 = y0 + t.wW;
  if (!t.poly) {
    // 門窗有框收邊，旁邊剩一點可以不切（trim）；上層分區沒有框，照實際切（0）
    const occluders = ops.map(o => [o, trim]).concat((t.occ || []).map(o => [o, 0]));
    for (const [o, tr] of occluders) {
      const ox1 = o.x + o.w, oy1 = o.y + o.h;
      if (ox1 <= x0 || o.x >= x1 || oy1 <= y0 || o.y >= y1) continue;
      if (o.y <= y0 + tr && oy1 >= y1 - tr) {        // 開口（幾乎）蓋住整個高度：左右擇一留下
        if (o.x <= x0 + tr) x0 = Math.min(x1, ox1); else if (ox1 >= x1 - tr) x1 = Math.max(x0, o.x);
      } else if (o.x <= x0 + tr && ox1 >= x1 - tr) { // 蓋住整個寬度：上下擇一留下
        if (o.y <= y0 + tr) y0 = Math.min(y1, oy1); else if (oy1 >= y1 - tr) y1 = Math.max(y0, o.y);
      }
    }
  }
  // 真的切到斜邊才算斜切（L 形缺角是直角切）
  const slanted = !!t.poly && t.poly.some((q, i) => {
    const r = t.poly[(i + 1) % t.poly.length];
    return Math.abs(q[0] - r[0]) > 0.05 && Math.abs(q[1] - r[1]) > 0.05;
  });
  return { w: x1 - x0, h: y1 - y0, slanted };
}

// 全室每塊裁切磚：面別、材料、要切的大小（不鋪磚的面不列）
function cutPieces(rows, trim) {
  const out = [];
  for (const s of rows) {
    if (s.cfg.skip) continue;
    const groups = {};
    s.r.groups.forEach(g => { groups[g.key] = g; });
    for (const t of s.r.tiles) {
      if (t.full) continue;
      const g = groups[t.gkey] || s.r.groups[0];
      const sz = cutPieceSize(t, s.ops, trim);
      if (sz.w <= EPS || sz.h <= EPS) continue;
      out.push({ face: s.key, faceName: s.name, label: g.label, TL: g.TL, TW: g.TW, dir: s.cfg.dir, w: sz.w, h: sz.h, slanted: sz.slanted });
    }
  }
  return out;
}

// 裁切清單：每面相同尺寸（取到 0.5cm）合併計數
function cutListByFace(pieces) {
  const r05 = v => Math.round(v * 2) / 2;
  const faces = {};
  for (const pc of pieces) {
    const f = faces[pc.face] || (faces[pc.face] = { face: pc.face, faceName: pc.faceName, items: {} });
    const key = `${pc.label}|${r05(pc.w)}|${r05(pc.h)}|${pc.slanted}`;
    const it = f.items[key] || (f.items[key] = { label: pc.label, w: r05(pc.w), h: r05(pc.h), slanted: pc.slanted, count: 0 });
    it.count++;
  }
  return Object.values(faces).map(f => Object.assign(f, {
    items: Object.values(f.items).sort((a, b) => a.label.localeCompare(b.label) || b.w * b.h - a.w * a.h)
  }));
}

// 剩料回收（貪婪法）：大塊先切；能從之前的剩料切出來就不開新磚。
// 尺寸換成磚本身的方向（a 沿磚長 TL、b 沿磚寬 TW）；長方形磚不旋轉（紋路方向），正方形可轉。
// 每刀扣鋸路，剩料只留比較大的那塊，最短邊 < minKeep 的剩料丟掉。
function planReuse(pieces, TL, TW, kerf, minKeep) {
  const square = Math.abs(TL - TW) < EPS;
  const need = pieces.map(p => ({ a: Math.min(p.a, TL), b: Math.min(p.b, TW) })).sort((p, q) => q.a * q.b - p.a * p.b);
  const fits = (l, p) => (l.a >= p.a - EPS && l.b >= p.b - EPS) || (square && l.a >= p.b - EPS && l.b >= p.a - EPS);
  const leftovers = [];
  let newTiles = 0;
  for (const p of need) {
    let best = -1;
    leftovers.forEach((l, i) => { if (fits(l, p) && (best < 0 || l.a * l.b < leftovers[best].a * leftovers[best].b)) best = i; });
    let src;
    if (best >= 0) src = leftovers.splice(best, 1)[0];
    else { newTiles++; src = { a: TL, b: TW }; }
    const rot = !(src.a >= p.a - EPS && src.b >= p.b - EPS); // 正方形磚轉 90° 才放得下
    const pa = rot ? p.b : p.a, pb = rot ? p.a : p.b;
    const rest = [{ a: src.a - pa - kerf, b: src.b }, { a: src.a, b: src.b - pb - kerf }]
      .filter(r => Math.min(r.a, r.b) >= minKeep).sort((x, y) => y.a * y.b - x.a * x.b)[0];
    if (rest) leftovers.push(rest);
  }
  return { cut: need.length, newTiles, saved: need.length - newTiles };
}

// 依材料算剩料回收能省幾片
function reuseByMaterial(rows, p) {
  const byMat = {};
  for (const pc of cutPieces(rows, p.smallTh || 5)) {
    const m = byMat[pc.label] || (byMat[pc.label] = { label: pc.label, TL: pc.TL, TW: pc.TW, pieces: [] });
    const along = pc.dir === 'H'; // 橫貼：立面寬沿磚長
    m.pieces.push({ a: along ? pc.w : pc.h, b: along ? pc.h : pc.w });
  }
  const out = {};
  for (const m of Object.values(byMat)) {
    out[m.label] = Object.assign({ label: m.label }, planReuse(m.pieces, m.TL, m.TW, SAW_KERF, p.smallTh || 5));
  }
  return out;
}

// ── 報價 ──
// 價格表用型號當鍵（沒有型號用「用途 尺寸名稱」）
function matKey(m) {
  return m ? String(m.code || `${m.role} ${m.spec}`).trim() : '';
}

// 下單片數＝叫料 ×（1＋備品%），無條件進位
function orderQty(total, sparePct) {
  return Math.ceil(total * (1 + (sparePct || 0) / 100) - 1e-9);
}

// 每種材料一行：叫料、下單、單價、金額；沒有材料資料（例如內建案例）時用共用單價
function quoteLines(mats, book, sparePct, fallbackPrice) {
  const lines = mats.map(t => {
    const mat = matOf(t.TL, t.TW, t.name);
    const price = mat ? (book[matKey(mat)] || 0) : (fallbackPrice || 0);
    const order = orderQty(t.total, sparePct);
    return { label: t.label, mat, total: t.total, order, price, amount: price > 0 ? order * price : null };
  });
  const priced = lines.filter(l => l.amount !== null);
  return { lines, sum: priced.reduce((a, l) => a + l.amount, 0), missing: lines.length - priced.length };
}

function matLabel(TL, TW, name) {
  const fmt = v => String(Math.round(v * 10) / 10);
  const m = matOf(TL, TW, name);
  const role = name || (m ? m.role : '');
  return `${role ? role + ' ' : ''}${fmt(Math.min(TL, TW))}×${fmt(Math.max(TL, TW))}`;
}

// 單面排磚：面寬 fw × 面高 fh；dir 'H' 磚長邊沿面寬、'V' 磚長邊沿面高；ops＝該面門窗開口
// 雙向起磚：xalign left/right/center/custom(xoff)、yalign bottom/top/center/custom(yoff)
// col：若該面有啟用柱子分界紅線，支援連動鋪貼或左右獨立起磚
// cfg.zones：同一面多種磚（例如 B 面右側主秀壁馬賽克），每區用自己的磚尺寸與起磚線各自算料
function layout(p, fw, fh, cfg, ops, isElevation, col) {
  ops = ops || [];
  const tL = cfg.dir === 'H' ? p.TL : p.TW;
  const tW = cfg.dir === 'H' ? p.TW : p.TL;
  const pitchL = tL + p.joint, pitchW = tW + p.joint;
  // 立面與地坪垂直起磚基準：預設由地面（Y=0）起磚向上排
  const th = { small: p.smallTh || 5, avoid: p.avoidTh || 5, cover: isElevation ? (p.floorCover || 0) : 0 };
  const xBase = startOf(fw, pitchL, tL, cfg.xalign, cfg.xoff);
  const yBase = startOf(fh, pitchW, tW, cfg.yalign, cfg.yoff);

  let tiles = [];
  let xBase2 = 0;
  const zones = cfg.zones || [];
  const groupMap = {};
  const addGroup = (key, label, TL, TW, segTiles, segArea, segOps, name) => {
    const g = groupMap[key] || (groupMap[key] = { key, label, name: name || '', TL, TW, full: 0, cut: 0, danger: 0, avoid: 0, lcut: 0, area: 0, opArea: 0 });
    g.full += segTiles.filter(t => t.full).length;
    g.cut += segTiles.filter(t => !t.full).length;
    g.danger += segTiles.filter(t => t.danger).length;
    g.avoid += segTiles.filter(t => t.avoid).length;
    g.lcut += segTiles.filter(t => t.lcut).length;
    g.area += segArea; g.opArea += segOps;
  };
  // 開口落在 [x0, x1] 這一段的面積；可鋪面積（有地坪外框時只算外框內）
  const areaIn = (x0, x1) => cfg.poly ? polyArea(clipPolygonRect(cfg.poly, x0, 0, x1, fh)) : (x1 - x0) * fh;
  // 一區實際範圍（切成長方形）的面積與其中門窗面積
  const piecesArea = pcs => pcs.reduce((a, q) => a + (cfg.poly ? polyArea(clipPolygonRect(cfg.poly, q[0], q[1], q[2], q[3])) : (q[2] - q[0]) * (q[3] - q[1])), 0);
  const piecesOps = pcs => pcs.reduce((a, q) => a + ops.reduce((b, o) =>
    b + Math.max(0, Math.min(q[2], o.x + o.w) - Math.max(q[0], o.x)) * Math.max(0, Math.min(q[3], o.y + o.h) - Math.max(q[1], o.y)), 0), 0);

  if (zones.length) {
    // 此面的磚在最底層，分區依序往上蓋（寫在後面的蓋在前面上面）
    for (const L of zoneLayers(fw, fh, zones)) {
      const z = L.zone;
      const [rx0, ry0, rx1, ry1] = L.rect;
      const pcs = rectMinus(L.rect, L.occ);
      if (!pcs.length) continue; // 整區都被上層蓋住
      let segTiles = [], TL = p.TL, TW = p.TW;
      // 橫跨整段寬度的上層（腰帶、上下分段）把這一層切成上下幾段：
      // 最下面那段照原本的垂直起磚，腰帶上方那段從腰帶上緣重新起磚（使用者的做法）
      const bands = L.occ.filter(o => o.x <= rx0 + EPS && o.x + o.w >= rx1 - EPS && o.y < ry1 - EPS && o.y + o.h > ry0 + EPS)
        .sort((a, b) => a.y - b.y);
      const parts = [];
      let cur = ry0, restart = null;
      for (const b of bands) {
        if (b.y > cur + EPS) parts.push({ y0: cur, y1: b.y, base: restart });
        if (b.y + b.h > cur) { cur = b.y + b.h; restart = cur; }
      }
      if (ry1 > cur + EPS) parts.push({ y0: cur, y1: ry1, base: restart });
      for (const part of parts) {
        const reg = { yMin: part.y0, yMax: part.y1, occ: L.occ };
        if (z) {
          TL = z.TL; TW = z.TW;
          const zL = cfg.dir === 'H' ? TL : TW, zW = cfg.dir === 'H' ? TW : TL;
          const zx = z.xoff !== undefined ? z.xoff : rx0; // 分區預設從分界線起磚
          // 上下分段、腰帶從該段底邊起磚；整面高的分區跟著此面的垂直起磚
          const zy = part.base !== null ? part.base
            : z.yoff !== undefined ? z.yoff : (z.y0 !== undefined && ry0 > EPS ? ry0 : startOf(fh, zW + p.joint, zW, cfg.yalign, cfg.yoff));
          const ts = generateZoneTiles(fw, fh, rx0, rx1, zx, zy, zL + p.joint, zW + p.joint, zL, zW, cfg, ops, th, reg);
          ts.forEach(t => { t.zone = 1; });
          segTiles = segTiles.concat(ts);
        } else {
          segTiles = segTiles.concat(generateZoneTiles(fw, fh, rx0, rx1, xBase, part.base !== null ? part.base : yBase, pitchL, pitchW, tL, tW, cfg, ops, th, reg));
        }
      }
      const key = z ? `z${TL}x${TW}${z.name}` : 'main';
      segTiles.forEach(t => { t.gkey = key; t.glabel = matLabel(TL, TW, z ? z.name : ''); });
      tiles = tiles.concat(segTiles);
      addGroup(key, matLabel(TL, TW, z ? z.name : ''), TL, TW, segTiles, piecesArea(pcs), piecesOps(pcs), z ? z.name : '');
    }
  } else if (col && col.on && col.mode === 'independent' && col.x > 5 && col.x < fw - 5) {
    // 判斷是否啟用柱子獨立起磚模式：柱左側區間 [0, col.x]
    const tilesLeft = generateZoneTiles(fw, fh, 0, col.x, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops, th);
    // 柱右側區間 [col.x, fw]，自柱邊起磚加上 xoffRight
    xBase2 = col.x + (col.xoffRight || 0);
    const tilesRight = generateZoneTiles(fw, fh, col.x, fw, xBase2, yBase, pitchL, pitchW, tL, tW, cfg, ops, th);
    tiles = tilesLeft.concat(tilesRight);
  } else {
    // 全牆連續鋪貼（若有柱線則為連動模式）
    tiles = generateZoneTiles(fw, fh, 0, fw, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops, th);
  }
  if (!zones.length) tiles.forEach(t => { t.gkey = 'main'; t.glabel = matLabel(p.TL, p.TW); });
  if (!zones.length) addGroup('main', matLabel(p.TL, p.TW), p.TL, p.TW, tiles, areaIn(0, fw), ops.reduce((a, o) => a + o.area, 0));

  // 每種材料各自算理論片數與損耗（不同尺寸的磚不能混在一起加）
  const groups = Object.values(groupMap).map(g => {
    const net = Math.ceil(Math.max(0, g.area - g.opArea) / (g.TL * g.TW));
    return Object.assign(g, { net, total: g.full + g.cut });
  });
  // 門窗扣除只算門窗；地坪外框外（缺角、斜牆外）另計，兩者都不鋪磚
  const opArea = ops.reduce((a, o) => a + o.area, 0);
  const voidArea = cfg.poly ? fw * fh - areaIn(0, fw) : 0;
  const sum = k => groups.reduce((a, g) => a + g[k], 0);
  return {
    tiles, groups, net: sum('net'), full: sum('full'), cut: sum('cut'), total: sum('total'), danger: sum('danger'), avoid: sum('avoid'), lcut: sum('lcut'), opArea, voidArea,
    xBase, yBase, tL, tW, pitchL, pitchW, col, xBase2
  };
}

// 取得物件鎖點（OSNAP）與地壁對縫參考點列表
function getSnapPoints(p, dims, faceKey, ops) {
  const snaps = [];
  const fw = dims[faceKey].fw, fh = dims[faceKey].fh;

  // 1. 牆面中軸線
  snaps.push({ type: 'center', axis: 'X', val: fw / 2, label: '牆面水平中軸' });
  snaps.push({ type: 'center', axis: 'Y', val: fh / 2, label: '牆面垂直中軸' });

  // 2. 開口鎖點（門窗左右邊界、中軸、窗台高度、門頂高）
  for (const o of (ops[faceKey] || [])) {
    snaps.push({ type: 'opening', axis: 'X', val: o.x, label: `${o.kind === 'door' ? '門' : '窗'}左緣` });
    snaps.push({ type: 'opening', axis: 'X', val: o.x + o.w, label: `${o.kind === 'door' ? '門' : '窗'}右緣` });
    snaps.push({ type: 'opening', axis: 'X', val: o.x + o.w / 2, label: `${o.kind === 'door' ? '門' : '窗'}中軸` });
    if (o.kind === 'window') {
      snaps.push({ type: 'opening', axis: 'Y', val: o.y, label: '窗台高度 (Sill)' });
      snaps.push({ type: 'opening', axis: 'Y', val: o.y + o.h, label: '窗頂高度' });
    } else {
      snaps.push({ type: 'opening', axis: 'Y', val: o.h, label: '門頂高度 (Header)' });
    }
  }

  // 3. 地壁對縫鎖點：計算地坪在相鄰邊界的磁磚垂直縫
  if (faceKey !== 'floor') {
    const flCfg = cfgOf('floor');
    const flR = layout(paramsFor(p, 'floor'), dims.floor.fw, dims.floor.fh, flCfg, []);
    // 依據相鄰關係決定對縫軸向
    if (faceKey === 'B' || faceKey === 'D') {
      // B面與D面寬度對齊地坪水平 X 方向
      const joints = getTileJoints(flR.xBase, flR.pitchL, dims.floor.fw);
      joints.forEach(jx => {
        snaps.push({ type: 'joint', axis: 'X', val: faceKey === 'D' ? planPos('D', jx, 0, dims) : jx, label: '地壁對縫線 🔗' });
      });
    } else if (faceKey === 'A' || faceKey === 'C') {
      // A面與C面寬度對齊地坪垂直 Y 方向（深度）
      const joints = getTileJoints(flR.yBase, flR.pitchW, dims.floor.fh);
      joints.forEach(jy => {
        snaps.push({ type: 'joint', axis: 'X', val: faceKey === 'A' ? planPos('A', jy, 0, dims) : jy, label: '地壁對縫線 🔗' });
      });
    }
  }

  // 4. 結構柱鎖點（支援主面與相鄰角隅投影面）
  const col = columnParams();
  if (typeof getFaceColumnInfo === 'function') {
    const colInfo = getFaceColumnInfo(faceKey, col, dims);
    if (colInfo && colInfo.on) {
      snaps.push({ type: 'column', axis: 'X', val: colInfo.colX, label: colInfo.label || '🏛️ 結構柱線' });
    }
  } else if (col.on && col.face === faceKey) {
    snaps.push({ type: 'column', axis: 'X', val: col.x, label: '🏛️ 結構柱線' });
  }

  return snaps;
}

// 地坪外框文字「0,29 117,29 117,0 …」↔ [[0,29],[117,29],…]（少於 3 點＝沒有外框，整個矩形都鋪）
function parseOutline(s) {
  const pts = String(s || '').trim().split(/[\s;；]+/).filter(Boolean)
    .map(t => t.split(/[,，]/).map(parseFloat)).filter(p => p.length === 2 && p.every(Number.isFinite));
  return pts.length >= 3 ? pts : null;
}

function formatOutline(pts) {
  return (pts || []).map(p => `${p[0]},${p[1]}`).join(' ');
}

// 尺寸鏈分段點：兩端＋各標記點，排序去重（相距 < 0.5cm 視為同一點，避免擠在一起的小段）
function dimChainPoints(len, marks) {
  const pts = [0, len];
  for (const m of marks) {
    if (Number.isFinite(m) && m > 0.5 && m < len - 0.5) pts.push(Math.round(m * 10) / 10);
  }
  pts.sort((a, b) => a - b);
  return pts.filter((v, i) => i === 0 || v - pts[i - 1] >= 0.5);
}

// 立面尺寸鏈：水平＝起磚線＋紅線＋門窗左右緣＋柱線；垂直＝起磚高＋窗台／窗頂＋門高＋上下分段／腰帶高度（ymarks）
function elevationChains(fw, fh, r, ops, marks, ymarks) {
  const hx = [r.xBase].concat(marks || []), vy = [r.yBase].concat(ymarks || []);
  if (r.col && r.col.on) {
    const x0 = r.col.x0 !== undefined ? r.col.x0 : r.col.x;
    const x1 = r.col.x1 !== undefined ? r.col.x1 : r.col.x + (r.col.w || 0);
    hx.push(x0, x1);
    if (r.col.mode === 'independent') hx.push(r.xBase2);
  }
  for (const o of ops) {
    hx.push(o.x, o.x + o.w);
    if (o.kind === 'window') vy.push(o.y, o.y + o.h);
    else vy.push(o.h);
  }
  return { h: dimChainPoints(fw, hx), v: dimChainPoints(fh, vy) };
}

// 立面是站在房間裡面向該牆看：B、C 的左邊就是平面的左／上；A、D 左右相反，要用該面寬度鏡像
// 回傳立面 [x, x+w] 在平面邊上的起點（B/D 沿平面 X，A/C 沿平面 Y 由上量）
function planPos(faceKey, x, w, dims) {
  const fwFace = dims && dims[faceKey] ? dims[faceKey].fw : 0;
  return (faceKey === 'A' || faceKey === 'D') ? fwFace - x - w : x;
}

// 地坪尺寸鏈：水平＝起磚線＋B/D 牆門窗；垂直（由 B 牆往下量）＝起磚線＋A/C 牆門窗
function floorChains(fw, fh, r, allOps, marks, dims) {
  const hx = [r.xBase].concat(marks || []), vy = [r.yBase];
  for (const k of ['B', 'D']) for (const o of (allOps[k] || [])) { const s = planPos(k, o.x, o.w, dims); hx.push(s, s + o.w); }
  for (const k of ['A', 'C']) for (const o of (allOps[k] || [])) { const s = planPos(k, o.x, o.w, dims); vy.push(s, s + o.w); }
  return { h: dimChainPoints(fw, hx), v: dimChainPoints(fh, vy) };
}

// 計算磁磚縫隙座標列表
function getTileJoints(base, pitch, maxDim) {
  const list = [];
  const c0 = Math.floor((0 - base) / pitch) - 1;
  const c1 = Math.ceil((maxDim - base) / pitch) + 1;
  for (let c = c0; c <= c1; c++) {
    const j = base + c * pitch;
    if (j >= -EPS && j <= maxDim + EPS) {
      list.push(Math.round(j * 10) / 10);
    }
  }
  return list;
}

// 一鍵計算地壁對縫的最佳起磚點 X 偏移量
function calcJointAlignment(p, dims, faceKey) {
  if (faceKey === 'floor') return 0;
  const flCfg = cfgOf('floor');
  const flR = layout(paramsFor(p, 'floor'), dims.floor.fw, dims.floor.fh, flCfg, []);
  return jointAlignedX(p, dims, faceKey, flR, cfgOf(faceKey));
}

// 給定地坪排磚結果 flR，這面牆起磚 X 要設多少，牆縫才會對齊地磚縫
function jointAlignedX(p, dims, faceKey, flR, wallCfg) {
  const wp = paramsFor(p, faceKey);
  const tL = wallCfg.dir === 'H' ? wp.TL : wp.TW;
  const pitchL = tL + p.joint;

  let targetJoint = 0;
  if (faceKey === 'B' || faceKey === 'D') {
    // 尋找地坪中最靠近牆起點的第一道完整垂直縫
    const joints = getTileJoints(flR.xBase, flR.pitchL, dims.floor.fw);
    if (joints.length > 0) targetJoint = joints[0];
  } else {
    const joints = getTileJoints(flR.yBase, flR.pitchW, dims.floor.fh);
    if (joints.length > 0) targetJoint = joints[0];
  }

  // A、D 面左右跟平面相反
  if (faceKey === 'A' || faceKey === 'D') targetJoint = planPos(faceKey, targetJoint, 0, dims);
  // 調整 wall xBase 使其磚縫對齊 targetJoint
  let bestX = targetJoint % pitchL;
  if (bestX < 0) bestX += pitchL;
  return Math.round(bestX * 10) / 10;
}

// 五面實測尺寸：各面獨立輸入（num 防呆回退到總體 L/W/H 推導值）
function faceDims(p) {
  return {
    floor: { fw: num('floor_fw', p.L), fh: num('floor_fh', p.W) },
    A:     { fw: num('A_fw', p.L),    fh: num('A_fh', p.H) },
    B:     { fw: num('B_fw', p.W),    fh: num('B_fh', p.H) },
    C:     { fw: num('C_fw', p.L),    fh: num('C_fh', p.H) },
    D:     { fw: num('D_fw', p.W),    fh: num('D_fh', p.H) }
  };
}

// 五面尺寸清單：以各面實測為準
function faces(p) {
  const d = faceDims(p);
  return [
    { key: 'floor', name: '地坪',  fw: d.floor.fw, fh: d.floor.fh },
    { key: 'A',     name: 'A立面', fw: d.A.fw,     fh: d.A.fh },
    { key: 'B',     name: 'B立面', fw: d.B.fw,     fh: d.B.fh },
    { key: 'C',     name: 'C立面', fw: d.C.fw,     fh: d.C.fh },
    { key: 'D',     name: 'D立面', fw: d.D.fw,     fh: d.D.fh }
  ];
}

function fmt(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

// over：暫時換掉某些面的設定（方案比較用），例如 { B: { xalign: 'custom', xoff: 30 } }
function computeAll(p, over) {
  const dims = faceDims(p);
  const ops = openings(dims);
  const col = columnParams();
  return faces(p).map(f => {
    const cfg = Object.assign(cfgOf(f.key), (over && over[f.key]) || {});
    const colInfo = (typeof getFaceColumnInfo === 'function')
      ? getFaceColumnInfo(f.key, col, dims)
      : (col.on && col.face === f.key ? col : null);
    // 此面不鋪磚（例如圖上沒有這一面、或是油漆牆）：不排磚、不計料
    const r = cfg.skip
      ? { tiles: [], groups: [], net: 0, full: 0, cut: 0, total: 0, danger: 0, avoid: 0, lcut: 0, opArea: 0, voidArea: 0, xBase: 0, yBase: 0 }
      : layout(paramsFor(p, f.key), f.fw, f.fh, cfg, ops[f.key] || [], f.key !== 'floor', colInfo);
    return { key: f.key, name: f.name, fw: f.fw, fh: f.fh, cfg, r, ops: ops[f.key] || [], col: colInfo };
  });
}

// ── 🧠 自動找最佳起磚點：排出幾個方案比較 ──

// 方案好壞：先比 L 型切割片數，再比小料片數，最後比浪費面積（叫料磚的面積 − 實際要鋪的面積，不同尺寸的磚也能一起比）
// L 型優先：使用者確認牆底一點點小料會被地磚蓋住，包住門窗轉角的 L 型才是現場真正的麻煩
function planScore(rows) {
  let danger = 0, lcut = 0, waste = 0;
  const byLabel = {};
  for (const s of rows) {
    danger += s.r.danger;
    lcut += s.r.lcut || 0;
    for (const g of s.r.groups) {
      waste += g.total * g.TL * g.TW - Math.max(0, g.area - g.opArea);
      byLabel[g.label] = (byLabel[g.label] || 0) + g.total;
    }
  }
  return { danger, lcut, waste, byLabel };
}

function betterScore(a, b) {
  if (a.lcut !== b.lcut) return a.lcut < b.lcut;
  if (a.danger !== b.danger) return a.danger < b.danger;
  return a.waste < b.waste - 1e-6;
}

// 每種磁磚用哪一組 Hatch（HATCH_STYLES 的序號）：依 A、B、C、D、地坪出現順序，同一種磚每一面都一樣
function hatchIndexMap(rows) {
  const map = {};
  const order = ['A', 'B', 'C', 'D', 'floor'];
  for (const k of order) {
    const s = rows.find(r => r.key === k);
    if (!s || s.cfg.skip) continue;
    for (const g of s.r.groups) if (!(g.label in map)) map[g.label] = Object.keys(map).length % HATCH_STYLES.length;
  }
  return map;
}

function scoreOf(r) {
  return planScore([{ r }]);
}

// 讓磚縫剛好落在某些位置（門頂、窗台、門邊…）的起磚值：磚的下緣或上緣貼齊 v
function alignCands(pitch, joint, vals) {
  const out = [];
  for (const v of vals) for (const c of [v, v + joint]) {
    const m = Math.round((((c % pitch) + pitch) % pitch) * 10) / 10;
    if (m < pitch - 0.05 && !out.includes(m)) out.push(m);
  }
  return out;
}

// 牆面垂直起磚的候選：先試由地面起（0），再試磚縫對齊門頂／窗台／窗頂，最後每 10cm 粗掃（避開頂端小料）
function wallYCands(fh, pitchW, joint, ops) {
  const vals = [];
  for (const o of ops) { if (o.y > EPS) vals.push(o.y); if (o.y + o.h < fh - EPS) vals.push(o.y + o.h); }
  const out = [0];
  for (const v of alignCands(pitchW, joint, vals).concat(Array.from({ length: Math.ceil(pitchW / 10) }, (_, i) => i * 10))) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function yOver(y) {
  return y === 0 ? { yalign: 'bottom', yoff: 0 } : { yalign: 'custom', yoff: y };
}

// 一面在一個磚距內逐步試起磚點，回傳最好的設定
// 地坪：X、Y 都逐公分試；牆面：X 逐公分（加上對齊門窗邊），Y 試 wallYCands（L 型切割常要靠上下移動才避得開）
function bestFaceOffsets(p, fw, fh, cfg, ops, col, isFloor) {
  const tL = cfg.dir === 'H' ? p.TL : p.TW, tW = cfg.dir === 'H' ? p.TW : p.TL;
  const pitchL = tL + p.joint, pitchW = tW + p.joint;
  let xs, ys;
  if (isFloor) {
    const step = pitchL * pitchW > 6000 ? 2 : 1;
    xs = Array.from({ length: Math.ceil(pitchL / step) }, (_, i) => i * step);
    ys = Array.from({ length: Math.ceil(pitchW / step) }, (_, i) => i * step);
  } else {
    xs = Array.from({ length: Math.ceil(pitchL) }, (_, i) => i);
    for (const v of alignCands(pitchL, p.joint, ops.flatMap(o => [o.x, o.x + o.w]))) if (!xs.includes(v)) xs.push(v);
    ys = wallYCands(fh, pitchW, p.joint, ops);
  }
  let best = null;
  for (const x of xs) {
    for (const y of ys) {
      const over = Object.assign({ xalign: 'custom', xoff: x }, isFloor ? { yalign: 'custom', yoff: y } : yOver(y));
      const sc = scoreOf(layout(p, fw, fh, Object.assign({}, cfg, over), ops, !isFloor, col));
      if (!best || betterScore(sc, best.sc)) best = { sc, over };
    }
  }
  return best.over;
}

function searchPlans(p) {
  const dims = faceDims(p);
  const ops = openings(dims);
  const col = columnParams();
  const rows0 = computeAll(p);
  const plans = [];
  const add = (id, name, desc, over) => plans.push({ id, name, desc, over, score: planScore(computeAll(p, over)) });

  add('current', '目前設定', '現在畫面上的起磚點（DXF 畫的或手動調的）', {});

  // 各面最省：每面自己找
  const perFace = {};
  for (const s of rows0) {
    if (s.cfg.skip) continue;
    perFace[s.key] = bestFaceOffsets(paramsFor(p, s.key), s.fw, s.fh, s.cfg, s.ops, s.col, s.key === 'floor');
  }
  add('perFace', '各面最省', '每面各自在一個磚距內逐公分試（牆面也試上下對齊門頂、窗台），L 型、小料最少、浪費最少', perFace);

  // 四面對縫：試地坪起點，牆縫跟著地磚縫對齊，看全室合計
  const fl = rows0.find(s => s.key === 'floor');
  if (fl && !fl.cfg.skip) {
    const fp = paramsFor(p, 'floor');
    const tL = fl.cfg.dir === 'H' ? fp.TL : fp.TW, tW = fl.cfg.dir === 'H' ? fp.TW : fp.TL;
    const pitchL = tL + p.joint, pitchW = tW + p.joint;
    const step = pitchL * pitchW > 1500 ? Math.ceil(Math.sqrt(pitchL * pitchW / 1500)) : 1;
    const wallCache = {};
    let best = null;
    for (let x = 0; x < pitchL; x += step) {
      for (let y = 0; y < pitchW; y += step) {
        const fc = Object.assign({}, fl.cfg, { xalign: 'custom', xoff: x, yalign: 'custom', yoff: y });
        const flR = layout(fp, fl.fw, fl.fh, fc, fl.ops, false, fl.col);
        let sc = scoreOf(flR);
        const over = { floor: { xalign: 'custom', xoff: x, yalign: 'custom', yoff: y } };
        for (const s of rows0) {
          if (s.key === 'floor' || s.cfg.skip) continue;
          const wx = jointAlignedX(p, dims, s.key, flR, s.cfg);
          const key = s.key + ':' + wx;
          // 牆的直縫跟著地磚；上下位置另外找（避開 L 型與頂端小料）
          let ws = wallCache[key];
          if (!ws) {
            const wp = paramsFor(p, s.key);
            const pitchW = (s.cfg.dir === 'H' ? wp.TW : wp.TL) + p.joint;
            for (const y of wallYCands(s.fh, pitchW, p.joint, s.ops)) {
              const sc2 = scoreOf(layout(wp, s.fw, s.fh, Object.assign({}, s.cfg, { xalign: 'custom', xoff: wx }, yOver(y)), s.ops, true, s.col));
              if (!ws || betterScore(sc2, ws.sc)) ws = { sc: sc2, y };
            }
            wallCache[key] = ws;
          }
          sc = { danger: sc.danger + ws.sc.danger, lcut: sc.lcut + ws.sc.lcut, waste: sc.waste + ws.sc.waste };
          over[s.key] = Object.assign({ xalign: 'custom', xoff: wx }, yOver(ws.y));
        }
        if (!best || betterScore(sc, best.sc)) best = { sc, over };
      }
    }
    add('joint', '四面對縫', '地磚縫往上連到牆磚縫（牆面上下另外找），再找全室最好的地坪起點', best.over);
  }

  // 置中對稱
  const center = {};
  for (const s of rows0) if (!s.cfg.skip) center[s.key] = s.key === 'floor' ? { xalign: 'center', yalign: 'center' } : { xalign: 'center' };
  add('center', '置中對稱', '每面從中軸起磚，兩邊裁切一樣寬', center);

  let bestIdx = 0;
  plans.forEach((pl, i) => { if (betterScore(pl.score, plans[bestIdx].score)) bestIdx = i; });
  plans[bestIdx].best = true;
  return plans;
}

// ✨ 智慧消除小料演算法（尋找消除危險碎磚的最優位移偏移量）
function autoFixSlivers(faceKey) {
  const p = paramsFor(params(), faceKey);
  const d = faceDims(p)[faceKey];
  const cfg = cfgOf(faceKey);
  const ops = openings(faceDims(p))[faceKey] || [];
  const tL = cfg.dir === 'H' ? p.TL : p.TW;
  const pitchL = tL + p.joint;

  let bestX = cfg.xoff || 0;
  let minDanger = 9999;
  let maxMinDim = -1;

  // 在一個磁磚模矩步距內以 1cm 為步進全域掃描
  for (let shift = 0; shift <= pitchL; shift += 1) {
    const testCfg = Object.assign({}, cfg, { xalign: 'custom', xoff: shift });
    const res = layout(p, d.fw, d.fh, testCfg, ops);
    const cuts = res.tiles.filter(t => !t.full);
    const localMinDim = cuts.length ? Math.min(...cuts.map(t => Math.min(t.wL, t.wW))) : 999;

    if (res.danger < minDanger) {
      minDanger = res.danger;
      maxMinDim = localMinDim;
      bestX = shift;
    } else if (res.danger === minDanger && localMinDim > maxMinDim) {
      maxMinDim = localMinDim;
      bestX = shift;
    }
  }

  return { success: true, bestX: Math.round(bestX), minDanger, maxMinDim };
}
