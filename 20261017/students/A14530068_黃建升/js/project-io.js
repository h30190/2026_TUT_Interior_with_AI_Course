// 💾 施工圖資料檔（JSON）匯出／匯入模組
// 所有匯入來源（之後的 DXF、圖片判讀）都先轉成這份格式，再交給程式計算與繪圖

const PROJECT_FORMAT = 'tile-setting-out';
const PROJECT_VERSION = 1;
const CFG_FIELDS = ['dir', 'mode', 'xalign', 'yalign', 'xoff', 'yoff'];
const CFG_CHOICES = {
  dir: ['H', 'V'],
  mode: ['grid', '55', '37', '28'],
  xalign: ['left', 'right', 'center', 'custom'],
  yalign: ['bottom', 'top', 'center', 'custom']
};

// 從目前畫面收集成資料檔物件
function collectProject() {
  const p = params();
  const dims = faceDims(p);
  const faces = {};
  for (const k of FACE_KEYS) {
    faces[k] = Object.assign({ fw: dims[k].fw, fh: dims[k].fh }, cfgOf(k));
    const t = parseTileSize($(k + '_tile') ? $(k + '_tile').value : '');
    if (t) Object.assign(faces[k], t);
  }
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    meta: projectMeta,
    materials: projectMaterials,
    room: { L: p.L, W: p.W, H: p.H },
    tile: { TL: p.TL, TW: p.TW, jointMM: Math.round(p.joint * 100) / 10, price: p.price },
    faces,
    openings: openingsList.map(o => ({ kind: o.kind, name: o.name, face: o.face, w: o.w, h: o.h, x: o.x, y: o.y })),
    column: columnParams()
  };
}

// 檢查資料檔並整理成可直接套用的內容；有問題的欄位略過並記在 warnings，格式錯誤則回 errors
function validateProject(obj) {
  const errors = [], warnings = [];
  if (!obj || typeof obj !== 'object') return { errors: ['不是有效的 JSON 物件'], warnings };
  if (obj.format !== PROJECT_FORMAT) errors.push(`format 應為 "${PROJECT_FORMAT}"`);
  if (obj.version !== PROJECT_VERSION) errors.push(`不支援的版本 ${obj.version}（目前支援 ${PROJECT_VERSION}）`);
  if (errors.length) return { errors, warnings };

  const pos = (v, label) => {
    if (Number.isFinite(v) && v > 0) return v;
    warnings.push(`${label} 不是正數，已略過`);
    return undefined;
  };
  const nonNeg = (v, label) => {
    if (Number.isFinite(v) && v >= 0) return v;
    warnings.push(`${label} 不是 0 以上的數字，已略過`);
    return undefined;
  };

  const out = { room: {}, tile: {}, faces: {}, openings: [], column: null };
  const room = obj.room || {};
  ['L', 'W', 'H'].forEach(k => { out.room[k] = pos(room[k], `room.${k}`); });
  // 磁磚欄位沒寫就沿用目前設定（例如 DXF 裡沒有磚縫寬）
  const tile = obj.tile || {};
  ['TL', 'TW', 'jointMM'].forEach(k => { if (tile[k] !== undefined) out.tile[k] = pos(tile[k], `tile.${k}`); });
  if (tile.price !== undefined) out.tile.price = nonNeg(tile.price, 'tile.price');

  for (const k of FACE_KEYS) {
    const f = (obj.faces || {})[k];
    if (!f) { warnings.push(`缺少 ${FACE_NAMES[k]}，沿用目前設定`); continue; }
    const face = { fw: pos(f.fw, `${k}.fw`), fh: pos(f.fh, `${k}.fh`) };
    for (const c of ['dir', 'mode', 'xalign', 'yalign']) {
      if (f[c] === undefined) continue;
      if (CFG_CHOICES[c].includes(f[c])) face[c] = f[c];
      else warnings.push(`${k}.${c} 的值「${f[c]}」無法辨識，已略過`);
    }
    if (f.xoff !== undefined) face.xoff = nonNeg(f.xoff, `${k}.xoff`);
    if (f.yoff !== undefined) face.yoff = nonNeg(f.yoff, `${k}.yoff`);
    if (f.TL !== undefined || f.TW !== undefined) {
      face.TL = pos(f.TL, `${k}.TL`); face.TW = pos(f.TW, `${k}.TW`);
      if (face.TL === undefined || face.TW === undefined) { delete face.TL; delete face.TW; }
    }
    if (f.marks !== undefined) {
      face.marks = Array.isArray(f.marks) ? f.marks.filter(v => Number.isFinite(v) && v > 0) : [];
      if (!Array.isArray(f.marks) || face.marks.length !== f.marks.length) warnings.push(`${k}.marks 有不是正數的值，已略過`);
    }
    out.faces[k] = face;
  }

  (obj.openings || []).forEach((o, i) => {
    if (!o || !['door', 'window'].includes(o.kind) || !['A', 'B', 'C', 'D'].includes(o.face)) {
      warnings.push(`第 ${i + 1} 個門窗的 kind／face 不正確，已略過`);
      return;
    }
    const w = pos(o.w, `門窗${i + 1}.w`), h = pos(o.h, `門窗${i + 1}.h`);
    if (w === undefined || h === undefined) return;
    out.openings.push({
      id: `imp_${i}_${o.kind}`,
      kind: o.kind,
      name: String(o.name || (o.kind === 'door' ? `門 ${i + 1}` : `窗 ${i + 1}`)),
      face: o.face, w, h,
      x: nonNeg(o.x, `門窗${i + 1}.x`) || 0,
      y: o.kind === 'door' ? 0 : (nonNeg(o.y, `門窗${i + 1}.y`) || 0)
    });
  });

  if (obj.column && typeof obj.column === 'object') out.column = obj.column;
  out.materials = (Array.isArray(obj.materials) ? obj.materials : []).filter(m => m && typeof m.role === 'string')
    .map(m => ({
      role: m.role, code: String(m.code || ''), spec: String(m.spec || ''), grout: String(m.grout || ''),
      size: Array.isArray(m.size) && m.size.length === 2 && m.size.every(v => Number.isFinite(v) && v > 0) ? m.size : null
    }));
  const meta = obj.meta && typeof obj.meta === 'object' ? obj.meta : {};
  out.meta = { project: String(meta.project || ''), drawingName: String(meta.drawingName || ''), number: String(meta.number || '') };
  return { errors, warnings, project: out };
}

// 套用整理好的資料檔到畫面
function applyProject(pj) {
  lockAllJoints = false;
  const setIf = (id, v) => { if (v !== undefined && $(id)) $(id).value = v; };
  setIf('L', pj.room.L); setIf('W', pj.room.W); setIf('H', pj.room.H);
  setIf('TL', pj.tile.TL); setIf('TW', pj.tile.TW); setIf('joint', pj.tile.jointMM); setIf('price', pj.tile.price);
  for (const k in pj.faces) {
    const f = pj.faces[k];
    setIf(k + '_fw', f.fw); setIf(k + '_fh', f.fh);
    CFG_FIELDS.forEach(c => setIf(k + '_' + c, f[c]));
    // 匯入的資料檔描述整張圖：沒寫磚尺寸／紅線就清空，不沿用上一張圖
    setIf(k + '_tile', f.TL ? `${f.TL}×${f.TW}` : '');
    setIf(k + '_marks', (f.marks || []).join(', '));
  }
  projectMaterials = pj.materials || [];
  projectMeta = pj.meta || {};
  renderProjectMeta();
  openingsList = pj.openings;
  renderOpeningsUI();
  if (pj.column) setColumnParams(pj.column);
  refresh();
}

// 資料檔卡片上顯示目前圖面名稱
function renderProjectMeta() {
  const el = $('projectMetaLine');
  if (!el) return;
  const name = [projectMeta.project, projectMeta.drawingName].filter(Boolean).join('｜');
  el.textContent = name ? `目前圖面：${name}${projectMeta.number ? '（圖號 ' + projectMeta.number + '）' : ''}` : '';
}

function exportProject() {
  const blob = new Blob([JSON.stringify(collectProject(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tile-setting-out.json'; // 中文檔名部分瀏覽器會變成 download
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); // 太早釋放會讓瀏覽器拿不到檔名
}

function importProjectText(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) {
    alert('檔案不是有效的 JSON：' + e.message);
    return;
  }
  const res = validateProject(obj);
  if (res.errors.length) {
    alert('無法匯入：\n' + res.errors.join('\n'));
    return;
  }
  applyProject(res.project);
  if (res.warnings.length) alert('已匯入，但有以下欄位略過：\n' + res.warnings.join('\n'));
}

function initProjectIO() {
  const fileInp = $('projectFile');
  if ($('btnExportProject')) $('btnExportProject').addEventListener('click', exportProject);
  if ($('btnImportProject') && fileInp) {
    $('btnImportProject').addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', () => {
      const f = fileInp.files[0];
      if (!f) return;
      f.text().then(importProjectText);
      fileInp.value = ''; // 同一個檔案可以再匯入一次
    });
  }
}
