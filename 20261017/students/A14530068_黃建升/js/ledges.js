// 🧱 半高檯模組：靠牆砌的矮檯（管道間、隱藏水箱、置物檯），正面、側面都要貼磚
// 資料都用立面座標（跟畫面上、施工圖上看到的一樣）：
//   face 靠哪面牆、x 正面距左、w 正面長、h 高、d 深（凸出牆面多少）
//   side 側面攤進這面立面的位置：'R'＝正面右邊多一條 d 寬、'L'＝左邊、'LR'＝兩邊、''＝不攤
//   攤開的側面已經算在這面牆寬裡（例如 B 牆 193＋側面 6＝立面 199，照使用者的畫法）

let ledgeList = [];

// 站在房間裡看：每面牆的右端接下一面牆的左端（B 右接 C、C 右接 D、D 右接 A、A 右接 B）
const LEDGE_NEXT = { A: 'B', B: 'C', C: 'D', D: 'A' };
const LEDGE_PREV = { A: 'D', B: 'A', C: 'B', D: 'C' };

// 這面立面上攤開的側面：[{ a, b, h, l }]（a～b 是立面座標）
function ledgeReturns(faceKey) {
  const out = [];
  for (const l of ledgeList) {
    if (l.face !== faceKey) continue;
    const side = String(l.side || '');
    if (side.includes('L')) out.push({ a: l.x - l.d, b: l.x, h: l.h, l });
    if (side.includes('R')) out.push({ a: l.x + l.w, b: l.x + l.w + l.d, h: l.h, l });
  }
  return out;
}

function ledgeReturnTotal(faceKey) {
  return ledgeReturns(faceKey).reduce((a, r) => a + (r.b - r.a), 0);
}

// 立面座標 → 牆上實際位置（扣掉左邊攤開的側面），平面圖、地坪用
function ledgePlanX(faceKey, x) {
  let s = 0;
  for (const r of ledgeReturns(faceKey)) {
    if (r.b <= x + EPS) s += r.b - r.a;
    else if (r.a < x) s += x - r.a;
  }
  return x - s;
}

// 切磚線：檯的正面、攤開的側面各是一個平面，跨過去的磚要切開（格線照舊，像使用者的圖）
function ledgeSplitRects(faceKey) {
  const out = [];
  for (const l of ledgeList) if (l.face === faceKey) out.push({ x: l.x, y: 0, w: l.w, h: l.h });
  for (const r of ledgeReturns(faceKey)) out.push({ x: r.a, y: 0, w: r.b - r.a, h: r.h });
  return out;
}

// 不貼磚的範圍（當作沒有框的開口，算 L 型、小料、扣面積）：
//   攤開的側面上方（那裡其實沒有牆）、檯靠著的那面牆被檯擋住的一段、地坪被檯佔掉的範圍
function ledgeVoids(dims) {
  const out = { floor: [], A: [], B: [], C: [], D: [] };
  const add = (k, x, y, w, h, name, host) => {
    const d = dims[k];
    if (!d) return;
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(d.fw, x + w), y1 = Math.min(d.fh, y + h);
    if (x1 - x0 > EPS && y1 - y0 > EPS) out[k].push({ kind: 'void', void: true, name, face: k, host: host || k, x: x0, y: y0, w: x1 - x0, h: y1 - y0, area: (x1 - x0) * (y1 - y0) });
  };
  for (const l of ledgeList) {
    const k = l.face, d = dims[k];
    if (!d || !(l.w > 0 && l.d > 0 && l.h > 0)) continue;
    const side = String(l.side || '');
    for (const r of ledgeReturns(k).filter(q => q.l === l)) add(k, r.a, l.h, r.b - r.a, d.fh - l.h, '檯側面上方');
    if (l.x <= 0.5 && !side.includes('L')) { const p = LEDGE_PREV[k]; add(p, dims[p].fw - l.d, 0, l.d, l.h, '檯擋住'); }
    if (l.x + l.w >= d.fw - 0.5 && !side.includes('R')) add(LEDGE_NEXT[k], 0, 0, l.d, l.h, '檯擋住');
    // 地坪：x 由 A 牆量、y 由 B 牆往下量
    const s = planPos(k, l.x, l.w, dims), fl = dims.floor;
    if (k === 'B') add('floor', s, 0, l.w, l.d, '檯', k);
    else if (k === 'D') add('floor', s, fl.fh - l.d, l.w, l.d, '檯', k);
    else if (k === 'A') add('floor', 0, s, l.d, l.w, '檯', k);
    else add('floor', fl.fw - l.d, s, l.d, l.w, '檯', k);
  }
  return out;
}

// 畫檯的外框（紅線，同使用者施工圖）：回傳要畫的線段 [[x0, y0], [x1, y1]]（此面座標）
// 立面：檯正面頂緣、兩側；攤開的側面；靠著的另一面牆上被擋住那段的外框
// 地坪：檯佔掉的範圍（靠牆那一邊不畫）
function ledgeOutlineSegs(faceKey, dims) {
  const segs = [];
  const box = (x, y, w, h, skipEdge) => {
    const e = { b: [[x, y], [x + w, y]], r: [[x + w, y], [x + w, y + h]], t: [[x + w, y + h], [x, y + h]], l: [[x, y + h], [x, y]] };
    for (const k in e) if (!(skipEdge || '').includes(k)) segs.push(e[k]);
  };
  if (faceKey === 'floor') {
    const wallEdge = { B: 'b', D: 't', A: 'l', C: 'r' }; // 地坪 y 由 B 牆往下：B 牆那邊是 y＝0（'b' 那條）
    for (const v of ledgeVoids(dims).floor) box(v.x, v.y, v.w, v.h, wallEdge[v.host]);
    return segs;
  }
  for (const l of ledgeList.filter(q => q.face === faceKey)) box(l.x, 0, l.w, l.h, 'b');
  for (const r of ledgeReturns(faceKey)) box(r.a, 0, r.b - r.a, r.h, 'b');
  for (const v of ledgeVoids(dims)[faceKey].filter(q => q.name === '檯擋住')) box(v.x, 0, v.w, v.h, 'b');
  return segs.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > EPS);
}

// 攤開側面改了（新增、刪除、改面別、改深度或位置）：牆寬跟著加減，畫面上的立面寬才對得上
function adjustFaceWidthsFor(change) {
  const before = {};
  for (const k of ['A', 'B', 'C', 'D']) before[k] = ledgeReturnTotal(k);
  change();
  for (const k of ['A', 'B', 'C', 'D']) {
    const delta = ledgeReturnTotal(k) - before[k];
    const inp = $(k + '_fw');
    if (inp && Math.abs(delta) > EPS) inp.value = Math.round((parseFloat(inp.value || 0) + delta) * 10) / 10;
  }
}

function addLedge() {
  adjustFaceWidthsFor(() => {
    ledgeList.push({ id: 'lg_' + Date.now() + '_' + Math.floor(Math.random() * 1000), face: 'B', x: 0, w: 100, h: 110, d: 10, side: '' });
  });
  renderLedgesUI();
  if (typeof refresh === 'function') refresh();
}

function removeLedge(id) {
  adjustFaceWidthsFor(() => { ledgeList = ledgeList.filter(l => l.id !== id); });
  renderLedgesUI();
  if (typeof refresh === 'function') refresh();
}

function renderLedgesUI() {
  const box = $('ledgesContainer');
  if (!box) return;
  box.innerHTML = '';
  if (!ledgeList.length) {
    box.innerHTML = '<div class="ledge-empty">沒有半高檯（管道間、隱藏水箱、置物檯）</div>';
    return;
  }
  ledgeList.forEach((l, i) => {
    const card = document.createElement('div');
    card.className = 'opblk';
    const opt = (v, t, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${t}</option>`;
    card.innerHTML = `
      <div class="ledge-head"><span class="fname">🧱 半高檯 ${i + 1}</span>
        <button type="button" class="btn-del-op" data-id="${l.id}">🗑️ 刪除</button></div>
      <div class="row3">
        <div><label>靠哪面牆</label><select data-id="${l.id}" data-field="face">${['A', 'B', 'C', 'D'].map(k => opt(k, k + '立面', l.face)).join('')}</select></div>
        <div><label>正面距左 (cm)</label><input type="number" data-id="${l.id}" data-field="x" value="${l.x}"></div>
        <div><label>正面長 (cm)</label><input type="number" data-id="${l.id}" data-field="w" value="${l.w}"></div>
      </div>
      <div class="row3" style="margin-top:4px">
        <div><label>高 (cm)</label><input type="number" data-id="${l.id}" data-field="h" value="${l.h}"></div>
        <div><label>深 (cm)</label><input type="number" data-id="${l.id}" data-field="d" value="${l.d}"></div>
        <div><label title="側面攤進這面立面：牆寬會自動加上檯深">側面攤開</label><select data-id="${l.id}" data-field="side">
          ${opt('', '不攤', l.side || '')}${opt('R', '正面右邊', l.side || '')}${opt('L', '正面左邊', l.side || '')}${opt('LR', '兩邊', l.side || '')}</select></div>
      </div>`;
    box.appendChild(card);
  });
  box.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', e => {
      const item = ledgeList.find(l => l.id === e.target.dataset.id);
      if (!item) return;
      const f = e.target.dataset.field;
      adjustFaceWidthsFor(() => { item[f] = (f === 'face' || f === 'side') ? e.target.value : (parseFloat(e.target.value) || 0); });
      if (typeof refresh === 'function') refresh();
    });
  });
  box.querySelectorAll('.btn-del-op').forEach(b => b.addEventListener('click', e => removeLedge(e.currentTarget.dataset.id)));
}

function initLedgesModule() {
  if ($('btnAddLedge')) $('btnAddLedge').addEventListener('click', addLedge);
  renderLedgesUI();
}
