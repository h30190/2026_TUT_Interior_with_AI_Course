// 📐 DXF 匯入：讀 AutoCAD 另存的 DXF（2007 以後為 UTF-8），找出每張磁磚放樣施工圖，轉成施工圖資料檔
// 判讀規則（依黃建升的畫圖習慣）：
//   立面外框＝封閉矩形，正下方有 A/B/C/D 索引圖塊；地坪＝ABCD 視角圖塊所在的平面外框
//   門窗＝立面內的青色（色號 4）封閉矩形，貼地為門；紅線＝立面內紅色（色號 1）垂直線
//   放樣起點＝色號 62 的引線下端碰到立面頂邊（地坪：垂直線碰上緣、水平線碰左緣）
//   材料＝含「填縫劑」的多行文字：第一行用途（壁／地／主秀壁）、型號、尺寸名稱、填縫劑

const DXF_FACE_LETTERS = ['A', 'B', 'C', 'D'];
const DXF_RED = 1, DXF_CYAN = 4, DXF_MARK = 62;

// 讀出 [群組碼, 值] 序列，依 SECTION 分段
function parseDxf(text) {
  const lines = text.split(/\r?\n/);
  const layers = {}, blocks = {}, entities = [];
  let i = 0;
  const next = () => {
    if (i + 1 >= lines.length) return null;
    const pair = [parseInt(lines[i], 10), lines[i + 1].trim()];
    i += 2;
    return pair;
  };
  // 收集一筆圖元：從 0 碼開始到下一個 0 碼之前
  const readRecord = type => {
    const rec = [];
    while (i + 1 < lines.length && parseInt(lines[i], 10) !== 0) rec.push(next());
    return { type, rec };
  };

  let section = null, curBlock = null;
  while (i + 1 < lines.length) {
    const [code, val] = next();
    if (code !== 0) continue;
    if (val === 'SECTION') { section = next()[1]; continue; }
    if (val === 'ENDSEC') { section = null; continue; }
    if (val === 'EOF') break;
    const { rec } = readRecord(val);
    if (section === 'TABLES' && val === 'LAYER') {
      const name = getCode(rec, 2), color = parseInt(getCode(rec, 62), 10);
      if (name !== undefined) layers[name] = Math.abs(color) || 7;
    } else if (section === 'BLOCKS') {
      if (val === 'BLOCK') {
        curBlock = { name: getCode(rec, 2), base: [toNum(getCode(rec, 10)), toNum(getCode(rec, 20))], circle: null };
        blocks[curBlock.name] = curBlock;
      } else if (val === 'ENDBLK') {
        curBlock = null;
      } else if (curBlock && val === 'CIRCLE' && !curBlock.circle) {
        curBlock.circle = [toNum(getCode(rec, 10)), toNum(getCode(rec, 20))];
      }
    } else if (section === 'ENTITIES') {
      const e = toEntity(val, rec);
      if (e) entities.push(e);
    }
  }
  for (const e of entities) {
    e.color = (e.color === undefined || e.color === 256) ? (layers[e.layer] || 7) : e.color;
  }
  return { layers, blocks, entities };

  function toNum(v) { return v === undefined ? 0 : parseFloat(v); }
}

function getCode(rec, code) {
  for (const [c, v] of rec) if (c === code) return v;
  return undefined;
}

// 去掉 MTEXT 格式碼：\P 換行、{\f字型;…}、\H 字高、\~ 空白等
function cleanMText(s) {
  return s
    .replace(/\\P|\^J/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\[ACcFfHhQTWp][^;]*;/g, '')
    .replace(/\\[LlOoKkNn]/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

function toEntity(type, rec) {
  const base = { type, layer: getCode(rec, 8) || '0' };
  const c62 = getCode(rec, 62);
  if (c62 !== undefined) base.color = Math.abs(parseInt(c62, 10));
  const f = code => parseFloat(getCode(rec, code));
  if (type === 'LINE') {
    return Object.assign(base, { x1: f(10), y1: f(20), x2: f(11), y2: f(21) });
  }
  if (type === 'LWPOLYLINE') {
    const pts = [];
    let x = null;
    for (const [c, v] of rec) {
      if (c === 10) x = parseFloat(v);
      else if (c === 20 && x !== null) { pts.push([x, parseFloat(v)]); x = null; }
    }
    return Object.assign(base, { pts, closed: (parseInt(getCode(rec, 70) || '0', 10) & 1) === 1 });
  }
  if (type === 'TEXT' || type === 'MTEXT') {
    let txt = '';
    if (type === 'MTEXT') {
      for (const [c, v] of rec) if (c === 3) txt += v;
      txt = cleanMText(txt + (getCode(rec, 1) || ''));
    } else {
      txt = (getCode(rec, 1) || '').replace(/\^J/g, '\n').trim();
    }
    // MTEXT 靠右／置中對齊時插入點在文字右端或中間，換算回左端，判斷落在哪張圖才準
    let x = f(10);
    if (type === 'MTEXT') {
      const attach = parseInt(getCode(rec, 71) || '1', 10);
      const w = parseFloat(getCode(rec, 41) || '0') || 0;
      if ([3, 6, 9].includes(attach)) x -= w;
      else if ([2, 5, 8].includes(attach)) x -= w / 2;
    }
    return Object.assign(base, { x, y: f(20), text: txt });
  }
  if (type === 'INSERT') {
    const sx = getCode(rec, 41), sy = getCode(rec, 42);
    return Object.assign(base, {
      name: getCode(rec, 2), x: f(10), y: f(20),
      sx: sx === undefined ? 1 : parseFloat(sx), sy: sy === undefined ? 1 : parseFloat(sy),
      rot: parseFloat(getCode(rec, 50) || '0')
    });
  }
  return null;
}

function bboxOf(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// 封閉、四個角、水平垂直的矩形
function asRect(e) {
  if (e.type !== 'LWPOLYLINE') return null;
  let pts = e.pts;
  if (pts.length === 5 && Math.hypot(pts[0][0] - pts[4][0], pts[0][1] - pts[4][1]) < 0.01) pts = pts.slice(0, 4);
  else if (!e.closed || pts.length !== 4) return null;
  for (let k = 0; k < 4; k++) {
    const a = pts[k], b = pts[(k + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 0.05 && Math.abs(a[1] - b[1]) > 0.05) return null;
  }
  const r = bboxOf(pts);
  r.w = r.x1 - r.x0; r.h = r.y1 - r.y0; r.color = e.color; r.layer = e.layer;
  return r;
}

// 圖塊圓心換算成世界座標（索引圖塊的基準點常設在遠處，不能直接用插入點）
function symbolCenter(ins, blocks) {
  const b = blocks[ins.name];
  const local = b && b.circle ? [b.circle[0] - b.base[0], b.circle[1] - b.base[1]] : [0, 0];
  const a = ins.rot * Math.PI / 180;
  const lx = local[0] * ins.sx, ly = local[1] * ins.sy;
  return [ins.x + lx * Math.cos(a) - ly * Math.sin(a), ins.y + lx * Math.sin(a) + ly * Math.cos(a)];
}

const r1 = v => Math.round(v * 10) / 10;

// 解析材料文字：「壁 / CC-REX-… / 120*120 白玉(亮) / 填縫劑：牙白」
function parseMaterial(text) {
  const ls = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (ls.length < 2) return null;
  const groutLine = ls.find(s => s.startsWith('填縫劑')) || '';
  const rest = ls.slice(1).filter(s => s !== groutLine);
  const spec = rest.find(s => /\d+(\.\d+)?\s*[*xX×]\s*\d/.test(s)) || '';
  const m = spec.match(/(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)/);
  return {
    role: ls[0].replace(/\s+/g, ' '),
    code: rest.find(s => s !== spec) || '',
    spec,
    size: m ? [parseFloat(m[1]), parseFloat(m[2])] : null,
    grout: groutLine.replace(/^填縫劑\s*[:：]?\s*/, '')
  };
}

// 找出檔案裡每一張放樣施工圖
function findDxfSheets(dxf) {
  const ents = dxf.entities;
  const rects = ents.map(asRect).filter(Boolean);
  const symbols = ents.filter(e => e.type === 'INSERT' && (DXF_FACE_LETTERS.includes(e.name) || e.name === 'ABCD'))
    .map(e => { const [x, y] = symbolCenter(e, dxf.blocks); return { name: e.name, x, y }; });

  // 1. 每個 A/B/C/D 索引找正上方的立面外框（同距離取面積最大，避開貼地的門框）
  const elevs = [];
  for (const s of symbols.filter(s => s.name !== 'ABCD')) {
    const cand = rects.filter(r => r.h >= 80 && r.w >= 30 && r.x0 <= s.x && s.x <= r.x1 && r.y0 > s.y && r.y0 - s.y <= 200);
    if (!cand.length) continue;
    const dMin = Math.min(...cand.map(r => r.y0 - s.y));
    const best = cand.filter(r => r.y0 - s.y - dMin < 1).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    elevs.push({ key: s.name, rect: best, sym: s });
  }

  // 2. 底邊同高、左右相鄰的立面歸成一張圖
  elevs.sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
  const groups = [];
  for (const e of elevs) {
    const g = groups.find(g => Math.abs(g.y0 - e.rect.y0) < 2 && !g.faces[e.key]
      && e.rect.x0 - g.x1 < 600 && g.x0 - e.rect.x1 < 600);
    if (g) {
      g.faces[e.key] = e.rect; g.x0 = Math.min(g.x0, e.rect.x0); g.x1 = Math.max(g.x1, e.rect.x1);
      g.y1 = Math.max(g.y1, e.rect.y1);
    } else {
      groups.push({ y0: e.rect.y0, x0: e.rect.x0, x1: e.rect.x1, y1: e.rect.y1, faces: { [e.key]: e.rect } });
    }
  }

  return groups.filter(g => Object.keys(g.faces).length >= 2).map(g => buildSheet(g, dxf, rects, symbols))
    .sort((a, b) => (b.box.y1 - a.box.y1) || (a.box.x0 - b.box.x0));
}

function buildSheet(g, dxf, rects, symbols) {
  const ents = dxf.entities;
  const warnings = [];

  // 3. 地坪：立面下方的 ABCD 視角符號，取包住它的最小平面外框
  let plan = null;
  const abcd = symbols.filter(s => s.name === 'ABCD' && s.x > g.x0 - 300 && s.x < g.x1 + 300 && s.y < g.y0 && g.y0 - s.y < 900)
    .sort((a, b) => (g.y0 - a.y) - (g.y0 - b.y))[0];
  if (abcd) {
    const polys = ents.filter(e => e.type === 'LWPOLYLINE' && e.pts.length >= 4).map(e => Object.assign(bboxOf(e.pts), { e }))
      .filter(b => b.x0 < abcd.x && abcd.x < b.x1 && b.y0 < abcd.y && abcd.y < b.y1 && b.x1 - b.x0 >= 50 && b.y1 - b.y0 >= 50
        && b.x1 - b.x0 < 3000 && b.y1 - b.y0 < 3000)
      .sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0));
    // 合理性：地坪外框要跟 B 面寬、A 面寬差不多，不然多半抓到整區平面或圖框
    const bw = (g.faces.B || g.faces.D || {}).w, aw = (g.faces.A || g.faces.C || {}).w;
    const fits = b => (!bw || ((b.x1 - b.x0) > bw * 0.6 && (b.x1 - b.x0) < bw * 1.6))
      && (!aw || ((b.y1 - b.y0) > aw * 0.6 && (b.y1 - b.y0) < aw * 1.6));
    plan = polys.find(fits) || null;
  }
  if (!plan) warnings.push('找不到地坪平面（ABCD 視角符號＋外框），地坪沿用 B 面寬度');

  // 4. 圖框：包住所有立面的最小封閉矩形（標題欄與材料文字都在裡面）
  const box = { x0: g.x0, y0: Math.min(g.y0, plan ? plan.y0 : g.y0), x1: g.x1, y1: g.y1 };
  const frame = rects.filter(r => r.x0 <= box.x0 && r.x1 >= box.x1 && r.y0 <= box.y0 && r.y1 >= box.y1 && r.w < 6000)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const area = frame || { x0: box.x0 - 250, y0: box.y0 - 300, x1: box.x1 + 250, y1: box.y1 + 150 };
  const inArea = (x, y) => x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
  const texts = ents.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && inArea(e.x, e.y));

  // 標題欄：取標籤正下方最近的一筆文字
  const fieldBelow = label => {
    const l = texts.find(t => t.text === label);
    if (!l) return '';
    const v = texts.filter(t => t !== l && Math.abs(t.x - l.x) < 40 && l.y - t.y > 8 && l.y - t.y < 80)
      .sort((a, b) => (l.y - a.y) - (l.y - b.y))[0];
    return v ? v.text : '';
  };
  const meta = { project: fieldBelow('工程名稱'), drawingName: fieldBelow('圖名'), number: fieldBelow('圖號') };
  const materials = texts.filter(t => t.text.includes('填縫')).map(t => parseMaterial(t.text)).filter(Boolean);

  const lines = ents.filter(e => e.type === 'LINE');
  const isV = l => Math.abs(l.x1 - l.x2) < 0.05, isH = l => Math.abs(l.y1 - l.y2) < 0.05;

  // 5. 各立面：尺寸、放樣起點、紅線、門窗
  const faces = {}, openings = [];
  for (const k of DXF_FACE_LETTERS) {
    const R = g.faces[k];
    if (!R) { warnings.push(`沒有找到 ${k} 立面`); continue; }
    const face = { fw: r1(R.w), fh: r1(R.h), dir: 'H', mode: 'grid', yalign: 'bottom', yoff: 0 };
    const start = lines.find(l => l.color === DXF_MARK && isV(l) && l.x1 >= R.x0 - 0.5 && l.x1 <= R.x1 + 0.5
      && Math.abs(Math.min(l.y1, l.y2) - R.y1) < 1.5);
    if (start) Object.assign(face, { xalign: 'custom', xoff: r1(Math.max(0, start.x1 - R.x0)) });
    else { Object.assign(face, { xalign: 'left', xoff: 0 }); warnings.push(`${k} 立面找不到「由此線開始放樣」引線，預設靠左`); }
    face.marks = lines.filter(l => l.color === DXF_RED && isV(l) && l.x1 > R.x0 + 0.5 && l.x1 < R.x1 - 0.5
      && Math.min(l.y1, l.y2) < R.y1 && Math.max(l.y1, l.y2) > R.y0 && Math.abs(l.y1 - l.y2) >= R.h * 0.5)
      .map(l => r1(l.x1 - R.x0)).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.4);
    faces[k] = face;

    for (const o of rects) {
      if (o === R || o.color !== DXF_CYAN) continue;
      if (o.x0 < R.x0 - 0.5 || o.x1 > R.x1 + 0.5 || o.y0 < R.y0 - 0.5 || o.y1 > R.y1 + 0.5) continue;
      if (o.w < 20 || o.h < 20 || (Math.abs(o.w - R.w) < 0.5 && Math.abs(o.h - R.h) < 0.5)) continue;
      const isDoor = Math.abs(o.y0 - R.y0) < 1;
      const n = openings.filter(p => p.kind === (isDoor ? 'door' : 'window')).length + 1;
      openings.push({
        kind: isDoor ? 'door' : 'window', name: `${isDoor ? '門' : '窗'} ${n}（${k} 面）`, face: k,
        w: r1(o.w), h: r1(o.h), x: r1(o.x0 - R.x0), y: isDoor ? 0 : r1(o.y0 - R.y0)
      });
    }
  }

  // 6. 地坪尺寸與放樣起點（Y 由 B 牆往下量）
  const ref = g.faces.B || Object.values(g.faces)[0];
  const P = plan ? { x0: plan.x0, y0: plan.y0, x1: plan.x1, y1: plan.y1 } : null;
  const floor = P
    ? { fw: r1(P.x1 - P.x0), fh: r1(P.y1 - P.y0), dir: 'H', mode: 'grid' }
    : { fw: r1(ref.w), fh: r1(g.faces.A ? g.faces.A.w : ref.w), dir: 'H', mode: 'grid' };
  if (P) {
    const sx = lines.find(l => l.color === DXF_MARK && isV(l) && l.x1 > P.x0 - 0.5 && l.x1 < P.x1 + 0.5
      && Math.min(l.y1, l.y2) >= P.y1 - 1 && Math.min(l.y1, l.y2) <= P.y1 + 30);
    const sy = lines.find(l => l.color === DXF_MARK && isH(l) && l.y1 > P.y0 - 0.5 && l.y1 < P.y1 + 0.5
      && Math.max(l.x1, l.x2) >= P.x0 - 1 && Math.max(l.x1, l.x2) <= P.x0 + 30 && Math.min(l.x1, l.x2) < P.x0);
    Object.assign(floor, sx ? { xalign: 'custom', xoff: r1(sx.x1 - P.x0) } : { xalign: 'left', xoff: 0 });
    Object.assign(floor, sy ? { yalign: 'custom', yoff: r1(P.y1 - sy.y1) } : { yalign: 'bottom', yoff: 0 });
    if (Math.abs((P.x1 - P.x0) - ref.w) > 1) warnings.push(`地坪寬 ${r1(P.x1 - P.x0)} 與 B 面寬 ${r1(ref.w)} 不同（可能是 L 形或含門口凹入），已用地坪外框`);
  } else {
    Object.assign(floor, { xalign: 'left', xoff: 0, yalign: 'bottom', yoff: 0 });
  }
  faces.floor = floor;

  // 7. 磚尺寸：牆用「壁」、地坪用「地」
  // 先找剛好叫「壁」的，再找含「壁」但不是主秀壁的（其他壁、壁 + 地），最後才用主秀壁
  const pick = tests => { for (const t of tests) { const m = materials.find(m => m.size && t(m.role)); if (m) return m; } return null; };
  const wall = pick([r => r === '壁', r => r.includes('壁') && !r.includes('主秀'), r => r.includes('壁')]);
  const flm = pick([r => r === '地', r => r.includes('地')]);
  if (!wall) warnings.push('找不到「壁」材料尺寸，沿用目前磁磚尺寸');
  if (flm && wall && (flm.size[0] !== wall.size[0] || flm.size[1] !== wall.size[1])) {
    faces.floor.TL = flm.size[1] >= flm.size[0] ? flm.size[1] : flm.size[0];
    faces.floor.TW = flm.size[1] >= flm.size[0] ? flm.size[0] : flm.size[1];
  }
  if (materials.some(m => m.role.includes('主秀'))) warnings.push('有「主秀壁」材料：同一面多種磚的分區計算尚未支援，暫以「壁」磚計算');

  const H = Math.max(...Object.values(g.faces).map(r => r.h));
  const project = {
    format: PROJECT_FORMAT, version: PROJECT_VERSION,
    meta,
    room: { L: faces.A ? faces.A.fw : floor.fh, W: faces.B ? faces.B.fw : floor.fw, H: r1(H) },
    tile: wall ? { TL: Math.max(...wall.size), TW: Math.min(...wall.size) } : {},
    faces, openings, materials,
    column: { on: false }
  };
  return { box: area, meta, materials, warnings, project, faceKeys: Object.keys(g.faces).sort() };
}

function sheetLabel(s, i) {
  const dims = s.faceKeys.map(k => `${k}=${s.project.faces[k].fw}`).join('／');
  const name = [s.meta.project, s.meta.drawingName].filter(Boolean).join('｜') || '（無圖名）';
  return `#${i + 1}　${name}${s.meta.number ? '　圖號 ' + s.meta.number : ''}　${dims}　H${s.project.room.H}`;
}

// 多張圖時讓使用者挑一張
function chooseDxfSheet(sheets) {
  const box = $('dxfSheetPicker');
  const list = $('dxfSheetList');
  list.innerHTML = '';
  sheets.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sheetLabel(s, i);
    b.addEventListener('click', () => { box.style.display = 'none'; applyDxfSheet(s); });
    list.appendChild(b);
  });
  box.style.display = 'flex';
}

function applyDxfSheet(s) {
  const res = validateProject(JSON.parse(JSON.stringify(s.project)));
  if (res.errors.length) { alert('這張圖無法匯入：\n' + res.errors.join('\n')); return; }
  applyProject(res.project);
  const notes = s.warnings.concat(res.warnings);
  alert(`已匯入：${sheetLabel(s, 0).replace(/^#1\s*/, '')}\n`
    + `材料：${s.materials.map(m => `${m.role} ${m.spec}`).join('、') || '無'}`
    + (notes.length ? '\n\n請確認：\n・' + notes.join('\n・') : ''));
}

function importDxfText(text) {
  const t0 = Date.now();
  const sheets = findDxfSheets(parseDxf(text));
  if (!sheets.length) {
    alert('沒有找到放樣施工圖：需要立面外框下方有 A/B/C/D 索引圖塊。');
    return;
  }
  console.log(`DXF 解析 ${Date.now() - t0}ms，找到 ${sheets.length} 張`);
  if (sheets.length === 1) applyDxfSheet(sheets[0]);
  else chooseDxfSheet(sheets);
}

function initDxfImport() {
  const inp = $('dxfFile');
  if (!inp || !$('btnImportDxf')) return;
  $('btnImportDxf').addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    if (!f) return;
    $('btnImportDxf').textContent = '⏳ 解析中…';
    f.text().then(t => {
      $('btnImportDxf').textContent = '📐 匯入 DXF';
      importDxfText(t);
    });
    inp.value = '';
  });
  if ($('dxfSheetCancel')) $('dxfSheetCancel').addEventListener('click', () => { $('dxfSheetPicker').style.display = 'none'; });
}
