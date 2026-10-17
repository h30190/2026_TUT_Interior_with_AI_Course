// 🏛️ 結構柱放樣與連動管理模組（獨立拆分，便於檢修維護）
// 支援：空間選用開關、相鄰立面（A面與B面角柱雙面連動呈現）、柱窗衝突碰撞檢測

let columnConfig = {
  on: false,          // 預設為關閉，由使用者依空間需求開啟
  face: 'B',          // 依附主面 (B, A, C, D)
  x: 120,             // 柱角距主面左端 (cm)
  w: 50,              // 柱寬 (cm)
  d: 50,              // 柱凸出深度 (cm)
  mode: 'linked',     // 'linked' (左右連動) 或 'independent' (左右獨立起磚)
  xoffRight: 0        // 獨立模式下柱右側起磚偏移量 (cm)
};

// 取得當前結構柱參數
function columnParams() {
  const on = $('col_on') ? $('col_on').checked : columnConfig.on;
  const face = $('col_face') ? $('col_face').value : columnConfig.face;
  const x = num0('col_x', columnConfig.x);
  const w = num('col_w', columnConfig.w);
  const d = num('col_d', columnConfig.d);
  const mode = $('col_mode') ? $('col_mode').value : columnConfig.mode;
  const xoffRight = num0('col_xoff_right', columnConfig.xoffRight);
  return { on, face, x, w, d, mode, xoffRight };
}

// 更新結構柱參數至 UI 與記憶體
function setColumnParams(cfg) {
  if (!cfg) return;
  Object.assign(columnConfig, cfg);
  if ($('col_on')) $('col_on').checked = !!columnConfig.on;
  if ($('col_face')) $('col_face').value = columnConfig.face || 'B';
  if ($('col_x')) $('col_x').value = (columnConfig.x !== undefined) ? columnConfig.x : 120;
  if ($('col_w')) $('col_w').value = columnConfig.w || 50;
  if ($('col_d')) $('col_d').value = columnConfig.d || 50;
  if ($('col_mode')) $('col_mode').value = columnConfig.mode || 'linked';
  if ($('col_xoff_right')) $('col_xoff_right').value = columnConfig.xoffRight || 0;
  syncColBlocks();
}

// 🏛️ 計算指定立面（A/B/C/D）是否包含柱體（支援角柱雙面連動呈現！）
// 真實建築中，角柱會同時出現在兩相鄰立面（例如 AB 角隅柱，同時出現在 B 面左側與 A 面右側）
function getFaceColumnInfo(faceKey, col, dims) {
  if (!col || !col.on || !dims || !dims[faceKey]) return null;

  const colW = col.w || 50;
  const colD = col.d || 50;
  const fw = dims[faceKey].fw;

  // 1. 本面柱體（柱子主要依附的面）
  if (col.face === faceKey) {
    const x0 = Math.max(0, col.x);
    const x1 = Math.min(fw, col.x + colW);
    const isCorner = (col.x <= 15) || (col.x + colW >= fw - 15);
    return {
      on: true,
      faceKey,
      isPrimary: true,
      isCorner,
      x0,
      x1,
      w: colW,
      colX: col.x,
      mode: col.mode,
      xoffRight: col.xoffRight,
      label: isCorner ? `🏛️ 結構角柱 X=${col.x}cm` : `🏛️ 結構柱 X=${col.x}cm`
    };
  }

  // 2. 相鄰立面角柱投影（當柱子靠在角隅時，相鄰面同時呈現！）
  // 情況 A：柱在 B 面，靠左隅（X <= 15cm，即 AB 角隅）-> A 立面右側同時呈現！
  if (col.face === 'B' && faceKey === 'A' && col.x <= 15) {
    const aFw = dims.A.fw;
    const x0 = Math.max(0, aFw - colD);
    const x1 = aFw;
    return {
      on: true,
      faceKey: 'A',
      isPrimary: false,
      isCorner: true,
      x0,
      x1,
      w: colD,
      colX: x0,
      mode: col.mode,
      xoffRight: 0,
      label: `🏛️ AB 角柱 (連動 A面)`
    };
  }

  // 情況 B：柱在 B 面，靠右隅（X + W >= B.fw - 15cm，即 BC 角隅）-> C 立面左側同時呈現！
  if (col.face === 'B' && faceKey === 'C' && (col.x + colW >= dims.B.fw - 15)) {
    return {
      on: true,
      faceKey: 'C',
      isPrimary: false,
      isCorner: true,
      x0: 0,
      x1: Math.min(dims.C.fw, colD),
      w: colD,
      colX: colD,
      mode: col.mode,
      xoffRight: 0,
      label: `🏛️ BC 角柱 (連動 C面)`
    };
  }

  // 情況 C：柱在 A 面，靠右隅（X + W >= A.fw - 15cm，即 AB 角隅）-> B 立面左側同時呈現！
  if (col.face === 'A' && faceKey === 'B' && (col.x + colW >= dims.A.fw - 15)) {
    return {
      on: true,
      faceKey: 'B',
      isPrimary: false,
      isCorner: true,
      x0: 0,
      x1: Math.min(dims.B.fw, colD),
      w: colD,
      colX: colD,
      mode: col.mode,
      xoffRight: 0,
      label: `🏛️ AB 角柱 (連動 B面)`
    };
  }

  // 情況 D：柱在 D 面，靠左隅（即 AD 角隅）-> A 立面左側同時呈現！
  if (col.face === 'D' && faceKey === 'A' && col.x <= 15) {
    return {
      on: true,
      faceKey: 'A',
      isPrimary: false,
      isCorner: true,
      x0: 0,
      x1: Math.min(dims.A.fw, colD),
      w: colD,
      colX: colD,
      mode: col.mode,
      xoffRight: 0,
      label: `🏛️ AD 角柱 (連動 A面)`
    };
  }

  return null;
}

// ⚠️ 柱子與開口（門/窗）碰撞衝突檢測（Clash Detection）
function detectColumnClashes(dims) {
  const col = columnParams();
  if (!col || !col.on || !dims) return [];

  const allOps = (typeof openings === 'function') ? openings(dims) : {};
  const clashes = [];

  ['A', 'B', 'C', 'D'].forEach(faceKey => {
    const colInfo = getFaceColumnInfo(faceKey, col, dims);
    if (!colInfo) return;

    const faceOps = allOps[faceKey] || [];
    for (const o of faceOps) {
      // 開口水平區間 [o.x, o.x + o.w]
      const opX0 = o.x;
      const opX1 = o.x + o.w;

      // 柱體水平區間 [colInfo.x0, colInfo.x1]
      const colX0 = colInfo.x0;
      const colX1 = colInfo.x1;

      // 計算水平交集重疊範圍
      const overlapMin = Math.max(opX0, colX0);
      const overlapMax = Math.min(opX1, colX1);

      if (overlapMin < overlapMax - 0.1) {
        const overlapW = Math.round((overlapMax - overlapMin) * 10) / 10;
        clashes.push({
          faceKey,
          faceName: FACE_NAMES[faceKey] || (faceKey + '立面'),
          kind: o.kind,
          opName: o.name || (o.kind === 'door' ? '門' : '窗'),
          op: o,
          colInfo,
          overlapW,
          x0: overlapMin,
          x1: overlapMax
        });
      }
    }
  });

  return clashes;
}

// 呈現衝突警示橫幅至畫面頂部
function renderClashBanner(clashes) {
  const container = $('clashAlertContainer');
  if (!container) return;

  if (!clashes || clashes.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  const itemsHtml = clashes.map(c => 
    `<div>⚠️ <strong>【${c.faceName}】結構柱與「${c.opName}」位置重疊衝突！</strong>（重疊區間 X: ${c.x0.toFixed(1)} ~ ${c.x1.toFixed(1)} cm，共重疊 <strong>${c.overlapW} cm</strong>）。結構柱體無法打除或開窗，請調整柱位或開口位置！</div>`
  ).join('');

  container.innerHTML = `<div class="clash-alert">${itemsHtml}</div>`;
}

// 同步結構柱介面外觀狀態
function syncColBlocks() {
  const on = $('col_on') && $('col_on').checked;
  if ($('colBlk')) $('colBlk').classList.toggle('disabled', !on);
  const mode = $('col_mode') ? $('col_mode').value : 'linked';
  if ($('colXoffRightBlk')) $('colXoffRightBlk').style.display = (mode === 'independent' && on) ? 'block' : 'none';
  if ($('cadToggleColBtn')) $('cadToggleColBtn').classList.toggle('active', on);
}

// 初始化結構柱事件監聽
function initColumnModule() {
  ['col_on', 'col_mode'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => {
      syncColBlocks();
      if (typeof refresh === 'function') refresh();
    });
  });

  ['col_face', 'col_x', 'col_w', 'col_d', 'col_xoff_right'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => {
      if (typeof refresh === 'function') refresh();
    });
  });

  if ($('cadToggleColBtn')) {
    $('cadToggleColBtn').addEventListener('click', () => {
      if ($('col_on')) $('col_on').checked = !$('col_on').checked;
      syncColBlocks();
      if (typeof refresh === 'function') refresh();
    });
  }

  syncColBlocks();
}
