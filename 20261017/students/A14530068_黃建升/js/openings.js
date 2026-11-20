// 🚪🪟 門窗開口管理模組（獨立拆分，便於檢修維護）
// 支援一個空間內有多個門、多個窗，可隨意新增、刪除、修改與拖曳

let openingsList = [
  { id: 'op_d1', kind: 'door',   name: '門 1 (房門)', face: 'D', w: 80, h: 200, x: 20, y: 0 },
  { id: 'op_w1', kind: 'window', name: '窗 1 (採光窗)', face: 'B', w: 60, h: 60,  x: 40, y: 140 }
];

// 預設情境配置（空間預設開口與柱子）
const OPENING_PRESETS = {
  bathop: {
    name: '浴室情境（1門1高窗，無柱）',
    items: [
      { id: 'bath_d1', kind: 'door',   name: '浴室門 D1', face: 'D', w: 80, h: 200, x: 20, y: 0 },
      { id: 'bath_w1', kind: 'window', name: '通風高窗 W1', face: 'B', w: 60, h: 60,  x: 40, y: 140 }
    ],
    column: { on: false } // 浴室無結構柱
  },
  livingop: {
    name: '客廳情境（1玄關門＋1大落地窗＋1側窗，含柱）',
    items: [
      { id: 'liv_d1', kind: 'door',   name: '玄關門 D1',   face: 'A', w: 100, h: 220, x: 20,  y: 0 },
      { id: 'liv_w1', kind: 'window', name: '景觀落地窗 W1', face: 'C', w: 240, h: 220, x: 40,  y: 0 },
      { id: 'liv_w2', kind: 'window', name: '側邊採光窗 W2', face: 'B', w: 100, h: 120, x: 160, y: 90 }
    ],
    column: { on: true, face: 'B', x: 80, w: 50, d: 50, mode: 'linked' } // 客廳有結構柱
  },
  bedroomop: {
    name: '臥室情境（1進門＋1衛浴門＋雙推窗）',
    items: [
      { id: 'bed_d1', kind: 'door',   name: '臥室進門 D1', face: 'D', w: 90, h: 210, x: 30, y: 0 },
      { id: 'bed_d2', kind: 'door',   name: '套房衛浴門 D2', face: 'A', w: 75, h: 200, x: 40, y: 0 },
      { id: 'bed_w1', kind: 'window', name: '雙推景觀窗 W1', face: 'B', w: 140, h: 140, x: 100, y: 80 }
    ],
    column: { on: false }
  },
  caseop: {
    name: '施工圖案例（D 面 1 門 86×239，門框左緣距左 104）',
    items: [
      { id: 'case_d1', kind: 'door', name: '浴室門', face: 'D', w: 86, h: 239, x: 104, y: 0 }
    ],
    column: { on: false }
  }
};

// 新增開門或開窗
function addOpening(kind) {
  const isDoor = kind === 'door';
  const count = openingsList.filter(o => o.kind === kind).length + 1;
  const newOp = {
    id: 'op_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    kind: kind,
    name: isDoor ? `門 ${count}` : `窗 ${count}`,
    face: isDoor ? 'D' : 'B',
    w: isDoor ? 90 : 80,
    h: isDoor ? 210 : 120,
    x: 40,
    y: isDoor ? 0 : 90
  };
  openingsList.push(newOp);
  renderOpeningsUI();
  if (typeof refresh === 'function') refresh();
}

// 刪除開口
function removeOpening(id) {
  openingsList = openingsList.filter(o => o.id !== id);
  renderOpeningsUI();
  if (typeof refresh === 'function') refresh();
}

// 取得依各立面分類並扣除/裁剪至面寬範圍內的開口清單
function getOpeningsByFace(dims) {
  const byFace = { A: [], B: [], C: [], D: [] };
  for (const o of openingsList) {
    if (!o.face || !dims[o.face]) continue;
    const fw = dims[o.face].fw, fh = dims[o.face].fh;
    const clx = Math.max(0, Math.min(o.x, fw));
    const cly = Math.max(0, Math.min(o.y, fh));
    const clw = Math.max(0, Math.min(o.w, fw - clx));
    const clh = Math.max(0, Math.min(o.h, fh - cly));
    if (clw > 1e-6 && clh > 1e-6) {
      byFace[o.face].push({
        id: o.id,
        kind: o.kind,
        name: o.name || (o.kind === 'door' ? '門' : '窗'),
        face: o.face,
        x: clx,
        y: cly,
        w: clw,
        h: clh,
        area: clw * clh
      });
    }
  }
  return byFace;
}

// 動態渲染左側門窗列表 UI
function renderOpeningsUI() {
  const container = $('openingsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (openingsList.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#7a756c;font-size:12px;background:#fdfcf9;border-radius:6px;border:1px dashed #d8d3c8">目前無門窗開口，請點選上方按鈕新增</div>`;
    return;
  }

  openingsList.forEach((op, idx) => {
    const isDoor = op.kind === 'door';
    const card = document.createElement('div');
    card.className = 'opblk';
    card.style.position = 'relative';
    card.style.marginBottom = '10px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="fname" style="font-weight:bold">${isDoor ? '🚪' : '🪟'} ${op.name || (isDoor ? '門' : '窗')}</span>
        <button type="button" class="btn-del-op" data-id="${op.id}" style="padding:2px 8px;font-size:11px;background:#fee2e2;color:#dc2626;border:1px solid #f87171;border-radius:4px;cursor:pointer">🗑️ 刪除</button>
      </div>
      <div class="row3">
        <div>
          <label>所在面別</label>
          <select data-id="${op.id}" data-field="face">
            <option value="A"${op.face === 'A' ? ' selected' : ''}>A立面</option>
            <option value="B"${op.face === 'B' ? ' selected' : ''}>B立面</option>
            <option value="C"${op.face === 'C' ? ' selected' : ''}>C立面</option>
            <option value="D"${op.face === 'D' ? ' selected' : ''}>D立面</option>
          </select>
        </div>
        <div>
          <label>${isDoor ? '門寬' : '窗寬'} (cm)</label>
          <input type="number" data-id="${op.id}" data-field="w" value="${op.w}">
        </div>
        <div>
          <label>${isDoor ? '門高' : '窗高'} (cm)</label>
          <input type="number" data-id="${op.id}" data-field="h" value="${op.h}">
        </div>
      </div>
      <div class="row2" style="margin-top:4px">
        <div>
          <label>距左 X (cm)</label>
          <input type="number" data-id="${op.id}" data-field="x" value="${op.x}">
        </div>
        <div>
          <label>${isDoor ? '門檻高度 (cm)' : '窗台高 Y (cm)'}</label>
          <input type="number" data-id="${op.id}" data-field="y" value="${op.y}" ${isDoor ? 'disabled title="門檻固定離地 0cm"' : ''}>
        </div>
      </div>
      <div id="opwarn_${op.id}" class="opwarn" style="display:none"></div>
    `;
    container.appendChild(card);
  });

  // 綁定輸入與刪除事件
  container.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', e => {
      const id = e.target.dataset.id;
      const field = e.target.dataset.field;
      const item = openingsList.find(o => o.id === id);
      if (item) {
        if (field === 'face') item.face = e.target.value;
        else item[field] = parseFloat(e.target.value) || 0;
        if (typeof refresh === 'function') refresh();
      }
    });
  });

  container.querySelectorAll('.btn-del-op').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.currentTarget.dataset.id;
      removeOpening(id);
    });
  });
}

// 門窗超出牆面時，畫面與算料只取牆內那段——要明講，不然改了門寬卻沒變會以為壞掉
function openingWarning(o, dims) {
  const d = dims[o.face];
  if (!d) return '';
  const name = ` ${o.face} 牆`;
  if (o.x >= d.fw) return `⚠ 距左 ${o.x} 已經超過${name}寬 ${d.fw}，這樘不會畫出來`;
  const out = [];
  if (o.x + o.w > d.fw + 0.05) out.push(`超出${name}寬 ${d.fw}：寬只畫到 ${Math.round((d.fw - o.x) * 10) / 10}`);
  if (o.y + o.h > d.fh + 0.05) out.push(`超出牆高 ${d.fh}：高只畫到 ${Math.round((d.fh - o.y) * 10) / 10}`);
  return out.length ? '⚠ ' + out.join('；') + '（請改距左 X、寬度或確認牆寬）' : '';
}

function updateOpeningWarnings(dims) {
  for (const o of openingsList) {
    const el = $('opwarn_' + o.id);
    if (!el) continue;
    const txt = openingWarning(o, dims);
    el.textContent = txt;
    el.style.display = txt ? 'block' : 'none';
  }
}

// 載入指定情境的開口與柱子配置
function applyOpeningPreset(presetKey) {
  const p = OPENING_PRESETS[presetKey];
  if (!p) return;
  openingsList = JSON.parse(JSON.stringify(p.items));
  renderOpeningsUI();
  if (p.column && typeof setColumnParams === 'function') {
    setColumnParams(p.column);
  }
  if (typeof refresh === 'function') refresh();
}

// 初始化門窗模組
function initOpeningsModule() {
  const btnAddDoor = $('btnAddDoor');
  if (btnAddDoor) btnAddDoor.addEventListener('click', () => addOpening('door'));

  const btnAddWin = $('btnAddWin');
  if (btnAddWin) btnAddWin.addEventListener('click', () => addOpening('window'));

  document.querySelectorAll('.presets button[data-o]').forEach(b => {
    b.addEventListener('click', () => {
      applyOpeningPreset(b.dataset.o);
    });
  });

  renderOpeningsUI();
}
