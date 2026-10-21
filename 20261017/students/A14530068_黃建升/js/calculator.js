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
    smallTh: num('smallTh', 5),
    avoidTh: num('avoidTh', 5)
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

// 小料判定（依黃建升的現場經驗）：只看裁切後露出部分的最短邊
//   最短邊 < th.small（預設 5cm）＝小料，計入碎磚警示；再 < th.avoid（預設同為 5cm，可另調小）＝圖上紅圈「避免小料」
//   磁磚本身短邊 ≤ th.small（例如小馬賽克）不列入
function sliverOf(t, ops, th) {
  if (t.full || Math.min(t.tL, t.tW) <= th.small) return { danger: false, avoid: false, visMin: null };
  const visMin = t.poly ? Math.min(polyMinDim(t.poly), visiblePart(t, ops).minDim) : visiblePart(t, ops).minDim;
  return { danger: visMin < th.small, avoid: visMin < th.avoid, visMin };
}

// 輔助函式：計算指定區間 [xMin, xMax] 內的磁磚陣列
function generateZoneTiles(fw, fh, xMin, xMax, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops, th) {
  th = th || { small: 5, avoid: 5 };
  const tiles = [];
  const r0 = Math.floor((0 - yBase + EPS) / pitchW);
  const r1 = Math.ceil((fh - yBase - EPS) / pitchW);
  for (let r = r0; r <= r1; r++) {
    const off = rowOffset(r, pitchL, cfg.mode);
    const base = xBase + off;
    const c0 = Math.floor((xMin - base + EPS) / pitchL);
    const c1 = Math.ceil((xMax - base - EPS) / pitchL);
    for (let c = c0; c <= c1; c++) {
      const x0 = base + c * pitchL, x1 = x0 + tL;
      if (x1 <= xMin + EPS || x0 >= xMax - EPS) continue;
      const y0 = yBase + r * pitchW, y1 = y0 + tW;
      if (y1 <= EPS || y0 >= fh - EPS) continue;
      const cutL = (x0 < xMin - EPS || x1 > xMax + EPS);
      const cutW = (y0 < -EPS || y1 > fh + EPS);
      let wL = Math.min(x1, xMax) - Math.max(x0, xMin);
      let wW = Math.min(y1, fh) - Math.max(y0, 0);

      // 地坪外框（L 形、斜牆）：裁掉外框外的部分；整塊在外面的不計料
      let clip = null;
      if (cfg.poly) {
        const ax0 = Math.max(x0, xMin), ay0 = Math.max(y0, 0);
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

      const full = !cutL && !cutW && !cutOp && !clip;
      const t = { x0: Math.max(x0, xMin), y0, wL, wW, full, tL, tW };
      if (clip) {
        // 被斜牆／缺角切到：記下實際形狀，外接框當作這塊磚的範圍
        const xs = clip.map(p => p[0]), ys = clip.map(p => p[1]);
        Object.assign(t, { poly: clip, x0: Math.min(...xs), y0: Math.min(...ys), wL: Math.max(...xs) - Math.min(...xs), wW: Math.max(...ys) - Math.min(...ys) });
      }
      tiles.push(Object.assign(t, sliverOf(t, ops, th)));
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

// 分區磚「117-207: 14.8×14.8 主秀壁；…」→ [{ x0, x1, TL, TW, name }]（不在分區內的範圍沿用此面的磚）
function parseZones(s) {
  const out = [];
  for (const part of String(s || '').split(/[;；\n]/)) {
    const m = part.match(/(\d+(?:\.\d+)?)\s*[-~～－]\s*(\d+(?:\.\d+)?)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!m) continue;
    const z = { x0: parseFloat(m[1]), x1: parseFloat(m[2]), TL: parseFloat(m[3]), TW: parseFloat(m[4]), name: m[5].trim() };
    if (z.x1 > z.x0 && z.TL > 0 && z.TW > 0) out.push(z);
  }
  return out;
}

function formatZones(zones) {
  return (zones || []).map(z => `${z.x0}-${z.x1}: ${z.TL}×${z.TW}${z.name ? ' ' + z.name : ''}`).join('; ');
}

// 依分區把面寬切段：分區之外的段落用此面的磚（zone = null）
function splitByZones(fw, zones) {
  const zs = zones.map(z => Object.assign({}, z, { x0: Math.max(0, z.x0), x1: Math.min(fw, z.x1) }))
    .filter(z => z.x1 - z.x0 > EPS).sort((a, b) => a.x0 - b.x0);
  const segs = [];
  let cur = 0;
  for (const z of zs) {
    const x0 = Math.max(z.x0, cur);
    if (z.x1 - x0 <= EPS) continue; // 跟前一區重疊的部分略過
    if (x0 - cur > EPS) segs.push({ x0: cur, x1: x0, zone: null });
    segs.push({ x0, x1: z.x1, zone: z });
    cur = z.x1;
  }
  if (fw - cur > EPS) segs.push({ x0: cur, x1: fw, zone: null });
  return segs;
}

// 尺寸鏈要標的分界：紅線＋分區起迄
function chainMarks(cfg) {
  return (cfg.marks || []).concat(...(cfg.zones || []).map(z => [z.x0, z.x1]));
}

// 材料名稱：有匯入的材料就用「壁 120×120」，否則只寫尺寸
// 這個尺寸（分區名稱）對應到哪一筆材料；分區有名稱時先比名稱
function matOf(TL, TW, name) {
  const same = m => m.size && ((m.size[0] === TL && m.size[1] === TW) || (m.size[0] === TW && m.size[1] === TL));
  return (name && projectMaterials.find(m => m.role === name && same(m))) || projectMaterials.find(same) || null;
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
  const th = { small: p.smallTh || 5, avoid: p.avoidTh || 5 };
  const xBase = startOf(fw, pitchL, tL, cfg.xalign, cfg.xoff);
  const yBase = startOf(fh, pitchW, tW, cfg.yalign, cfg.yoff);

  let tiles = [];
  let xBase2 = 0;
  const zones = cfg.zones || [];
  const groupMap = {};
  const addGroup = (key, label, TL, TW, segTiles, segArea, segOps) => {
    const g = groupMap[key] || (groupMap[key] = { key, label, TL, TW, full: 0, cut: 0, danger: 0, avoid: 0, area: 0, opArea: 0 });
    g.full += segTiles.filter(t => t.full).length;
    g.cut += segTiles.filter(t => !t.full).length;
    g.danger += segTiles.filter(t => t.danger).length;
    g.avoid += segTiles.filter(t => t.avoid).length;
    g.area += segArea; g.opArea += segOps;
  };
  // 開口落在 [x0, x1] 這一段的面積；可鋪面積（有地坪外框時只算外框內）
  const opsAreaIn = (x0, x1) => ops.reduce((a, o) => a + Math.max(0, Math.min(x1, o.x + o.w) - Math.max(x0, o.x)) * o.h, 0);
  const areaIn = (x0, x1) => cfg.poly ? polyArea(clipPolygonRect(cfg.poly, x0, 0, x1, fh)) : (x1 - x0) * fh;

  if (zones.length) {
    for (const seg of splitByZones(fw, zones)) {
      let segTiles, TL = p.TL, TW = p.TW;
      if (seg.zone) {
        TL = seg.zone.TL; TW = seg.zone.TW;
        const zL = cfg.dir === 'H' ? TL : TW, zW = cfg.dir === 'H' ? TW : TL;
        const zx = seg.zone.xoff !== undefined ? seg.zone.xoff : seg.x0; // 分區預設從分界線起磚
        const zy = startOf(fh, zW + p.joint, zW, cfg.yalign, cfg.yoff);
        segTiles = generateZoneTiles(fw, fh, seg.x0, seg.x1, zx, zy, zL + p.joint, zW + p.joint, zL, zW, cfg, ops, th);
        segTiles.forEach(t => { t.zone = 1; });
      } else {
        segTiles = generateZoneTiles(fw, fh, seg.x0, seg.x1, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops, th);
      }
      tiles = tiles.concat(segTiles);
      const key = seg.zone ? `z${TL}x${TW}${seg.zone.name}` : 'main';
      addGroup(key, matLabel(TL, TW, seg.zone ? seg.zone.name : ''), TL, TW, segTiles, areaIn(seg.x0, seg.x1), opsAreaIn(seg.x0, seg.x1));
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
    tiles, groups, net: sum('net'), full: sum('full'), cut: sum('cut'), total: sum('total'), danger: sum('danger'), avoid: sum('avoid'), opArea, voidArea,
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

// 立面尺寸鏈：水平＝起磚線＋紅線＋門窗左右緣＋柱線；垂直＝起磚高＋窗台／窗頂＋門高
function elevationChains(fw, fh, r, ops, marks) {
  const hx = [r.xBase].concat(marks || []), vy = [r.yBase];
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
  const wallCfg = cfgOf(faceKey);
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

function computeAll(p) {
  const dims = faceDims(p);
  const ops = openings(dims);
  const col = columnParams();
  return faces(p).map(f => {
    const cfg = cfgOf(f.key);
    const colInfo = (typeof getFaceColumnInfo === 'function')
      ? getFaceColumnInfo(f.key, col, dims)
      : (col.on && col.face === f.key ? col : null);
    // 此面不鋪磚（例如圖上沒有這一面、或是油漆牆）：不排磚、不計料
    const r = cfg.skip
      ? { tiles: [], groups: [], net: 0, full: 0, cut: 0, total: 0, danger: 0, avoid: 0, opArea: 0, voidArea: 0, xBase: 0, yBase: 0 }
      : layout(paramsFor(p, f.key), f.fw, f.fh, cfg, ops[f.key] || [], f.key !== 'floor', colInfo);
    return { key: f.key, name: f.name, fw: f.fw, fh: f.fh, cfg, r, ops: ops[f.key] || [], col: colInfo };
  });
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
