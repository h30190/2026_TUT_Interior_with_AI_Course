// 磁磚排磚放樣幾何核心、開口扣除與算料演算法
const $ = id => document.getElementById(id);
const EPS = 1e-6;

function num(id, dft) {
  const v = parseFloat($(id).value);
  return (Number.isFinite(v) && v > 0) ? v : dft;
}

function num0(id, dft) {
  const v = parseFloat($(id).value);
  return (Number.isFinite(v) && v >= 0) ? v : dft;
}

// 門窗開口：直接透過 openings 模組取得，支援任意多個門窗扣除
function openings(dims) {
  if (typeof getOpeningsByFace === 'function') {
    return getOpeningsByFace(dims);
  }
  return { A: [], B: [], C: [], D: [] };
}

function params() {
  return {
    L: num('L', 600),
    W: num('W', 400),
    H: num('H', 280),
    TL: num('TL', 120),
    TW: num('TW', 60),
    joint: num('joint', 2) / 10,
    price: num('price', 0)
  };
}

function cfgOf(k) {
  return {
    dir: $(k + '_dir').value,
    mode: $(k + '_mode').value,
    xalign: $(k + '_xalign').value,
    yalign: $(k + '_yalign').value,
    xoff: num0(k + '_xoff', 0),
    yoff: num0(k + '_yoff', 0)
  };
}

// 第 r 列（沿面寬方向）的起點偏移量，依工法
function rowOffset(r, pitchL, mode) {
  if (mode === 'grid') return 0;
  if (mode === '55') return (r % 2) * 0.5 * pitchL;
  if (mode === '37') return (r * 0.3 * pitchL) % pitchL;
  if (mode === '28') return (r * 0.2 * pitchL) % pitchL;
  return 0;
}

// 輔助函式：計算指定區間 [xMin, xMax] 內的磁磚陣列
function generateZoneTiles(fw, fh, xMin, xMax, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops) {
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

      // 開口遮蔽扣除
      let covered = false;
      for (const o of ops) {
        if (x0 >= o.x - EPS && x1 <= o.x + o.w + EPS &&
            y0 >= o.y - EPS && y1 <= o.y + o.h + EPS) {
          covered = true;
          break;
        }
      }
      if (covered) continue;

      const full = !cutL && !cutW;
      const minDim = Math.min(wL, wW);
      const danger = !full && (minDim < 5);
      tiles.push({ x0: Math.max(x0, xMin), y0, wL, wW, full, danger, tL, tW });
    }
  }
  return tiles;
}

// 單面排磚：面寬 fw × 面高 fh；dir 'H' 磚長邊沿面寬、'V' 磚長邊沿面高；ops＝該面門窗開口
// 雙向起磚：xalign left/right/center/custom(xoff)、yalign bottom/top/center/custom(yoff)
// col：若該面有啟用柱子分界紅線，支援連動鋪貼或左右獨立起磚
function layout(p, fw, fh, cfg, ops, isElevation, col) {
  ops = ops || [];
  const tL = cfg.dir === 'H' ? p.TL : p.TW;
  const tW = cfg.dir === 'H' ? p.TW : p.TL;
  const pitchL = tL + p.joint, pitchW = tW + p.joint;
  let xBase = 0;
  if (cfg.xalign === 'center') xBase = (fw - tL) / 2;
  else if (cfg.xalign === 'right') xBase = fw - (Math.ceil((fw - EPS) / pitchL) - 1) * pitchL - tL;
  else if (cfg.xalign === 'custom') xBase = Math.max(0, Math.min(cfg.xoff, fw));

  // 立面與地坪垂直起磚基準：預設由地面（Y=0）起磚向上排
  let yBase = 0;
  if (cfg.yalign === 'bottom') {
    yBase = 0;
  } else if (cfg.yalign === 'top') {
    yBase = fh - (Math.ceil((fh - EPS) / pitchW) - 1) * pitchW - tW;
  } else if (cfg.yalign === 'center') {
    yBase = (fh - tW) / 2;
  } else if (cfg.yalign === 'custom') {
    yBase = Math.max(0, Math.min(cfg.yoff, fh));
  }

  let tiles = [];
  let xBase2 = 0;

  // 判斷是否啟用柱子獨立起磚模式
  if (col && col.on && col.mode === 'independent' && col.x > 5 && col.x < fw - 5) {
    // 柱左側區間 [0, col.x]
    const tilesLeft = generateZoneTiles(fw, fh, 0, col.x, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops);
    // 柱右側區間 [col.x, fw]，自柱邊起磚加上 xoffRight
    xBase2 = col.x + (col.xoffRight || 0);
    const tilesRight = generateZoneTiles(fw, fh, col.x, fw, xBase2, yBase, pitchL, pitchW, tL, tW, cfg, ops);
    tiles = tilesLeft.concat(tilesRight);
  } else {
    // 全牆連續鋪貼（若有柱線則為連動模式）
    tiles = generateZoneTiles(fw, fh, 0, fw, xBase, yBase, pitchL, pitchW, tL, tW, cfg, ops);
  }

  const opArea = ops.reduce((a, o) => a + o.area, 0);
  const net = Math.ceil(Math.max(0, fw * fh - opArea) / (p.TL * p.TW));
  const full = tiles.filter(t => t.full).length;
  const cut = tiles.filter(t => !t.full).length;
  const danger = tiles.filter(t => t.danger).length;
  return {
    tiles, net, full, cut, total: full + cut, danger, opArea,
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
    const flR = layout(p, dims.floor.fw, dims.floor.fh, flCfg, []);
    // 依據相鄰關係決定對縫軸向
    if (faceKey === 'B' || faceKey === 'D') {
      // B面與D面寬度對齊地坪水平 X 方向
      const joints = getTileJoints(flR.xBase, flR.pitchL, dims.floor.fw);
      joints.forEach(jx => {
        snaps.push({ type: 'joint', axis: 'X', val: jx, label: '地壁對縫線 🔗' });
      });
    } else if (faceKey === 'A' || faceKey === 'C') {
      // A面與C面寬度對齊地坪垂直 Y 方向（深度）
      const joints = getTileJoints(flR.yBase, flR.pitchW, dims.floor.fh);
      joints.forEach(jy => {
        snaps.push({ type: 'joint', axis: 'X', val: jy, label: '地壁對縫線 🔗' });
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
  const flR = layout(p, dims.floor.fw, dims.floor.fh, flCfg, []);
  const wallCfg = cfgOf(faceKey);
  const tL = wallCfg.dir === 'H' ? p.TL : p.TW;
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

  // 調整 wall xBase 使其磚縫對齊 targetJoint
  let bestX = targetJoint % pitchL;
  if (bestX < 0) bestX += pitchL;
  return Math.round(bestX * 10) / 10;
}

// 取得結構柱設定參數
function columnParams() {
  const on = $('col_on') ? $('col_on').checked : false;
  const face = $('col_face') ? $('col_face').value : 'B';
  const x = num0('col_x', 120);
  const w = num('col_w', 50);
  const d = num('col_d', 50);
  const mode = $('col_mode') ? $('col_mode').value : 'linked';
  const xoffRight = num0('col_xoff_right', 0);
  return { on, face, x, w, d, mode, xoffRight };
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
    const r = layout(p, f.fw, f.fh, cfg, ops[f.key] || [], f.key !== 'floor', colInfo);
    return { key: f.key, name: f.name, fw: f.fw, fh: f.fh, cfg, r, ops: ops[f.key] || [], col: colInfo };
  });
}

// ✨ 智慧消除小料演算法（尋找消除危險碎磚的最優位移偏移量）
function autoFixSlivers(faceKey) {
  const p = params();
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
