// 📐 DXF 匯入：讀 AutoCAD 另存的 DXF（2007 以後為 UTF-8），找出每張磁磚放樣施工圖，轉成施工圖資料檔
// 判讀規則（依黃建升的畫圖習慣）：
//   立面外框＝封閉矩形，正下方有 A/B/C/D 索引圖塊；地坪＝ABCD 視角圖塊所在的平面外框
//   門窗＝立面內的青色（色號 4）封閉矩形，貼地為門；紅線＝立面內紅色（色號 1）垂直線
//   放樣起點＝色號 62 的引線下端碰到立面頂邊（地坪：垂直線碰上緣、水平線碰左緣）
//   材料＝含「填縫劑」的多行文字：第一行用途（壁／地／主秀壁）、型號、尺寸名稱、填縫劑
//   設備與備註＝立面／平面範圍內其餘的線稿（含圖塊）、文字、多重引線，照原座標與顏色搬過來畫

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
        curBlock = { name: getCode(rec, 2), base: [toNum(getCode(rec, 10)), toNum(getCode(rec, 20))], circle: null, ents: [] };
        blocks[curBlock.name] = curBlock;
      } else if (val === 'ENDBLK') {
        curBlock = null;
      } else if (curBlock) {
        if (val === 'CIRCLE' && !curBlock.circle) curBlock.circle = [toNum(getCode(rec, 10)), toNum(getCode(rec, 20))];
        const e = toEntity(val, rec);
        if (e) curBlock.ents.push(e); // 圖塊內的顏色先不解析（ByBlock／圖層 0 要跟著插入的圖塊）
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
    const pts = [], bulges = [];
    let x = null;
    for (const [c, v] of rec) {
      if (c === 10) x = parseFloat(v);
      else if (c === 20 && x !== null) { pts.push([x, parseFloat(v)]); bulges.push(0); x = null; }
      else if (c === 42 && bulges.length) bulges[bulges.length - 1] = parseFloat(v);
    }
    return Object.assign(base, { pts, bulges, closed: (parseInt(getCode(rec, 70) || '0', 10) & 1) === 1 });
  }
  if (type === 'ARC' || type === 'CIRCLE') {
    return Object.assign(base, {
      cx: f(10), cy: f(20), r: f(40),
      a0: type === 'ARC' ? f(50) : 0, a1: type === 'ARC' ? f(51) : 360
    });
  }
  if (type === 'ELLIPSE') {
    return Object.assign(base, { cx: f(10), cy: f(20), mx: f(11), my: f(21), ratio: f(40), t0: f(41), t1: f(42) });
  }
  if (type === 'SPLINE') {
    // 有擬合點用擬合點，否則用控制點連成折線（施工圖示意夠用）
    const fit = [], ctl = [];
    let x = null, xf = null;
    for (const [c, v] of rec) {
      if (c === 10) x = parseFloat(v);
      else if (c === 20 && x !== null) { ctl.push([x, parseFloat(v)]); x = null; }
      else if (c === 11) xf = parseFloat(v);
      else if (c === 21 && xf !== null) { fit.push([xf, parseFloat(v)]); xf = null; }
    }
    return Object.assign(base, { pts: fit.length >= 2 ? fit : ctl });
  }
  if (type === 'MULTILEADER') return Object.assign(base, parseMLeader(rec));
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
    return Object.assign(base, { x, y: f(20), text: txt, h: f(40) || 2.5, top: type === 'MTEXT' });
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

// 多重引線：文字（第一個 304）、文字位置 12/22、字高 41；每條引線＝落點（LEADER{ 的 10/20）＋頂點（LEADER_LINE{ 的 10/20，第一點是箭頭）
function parseMLeader(rec) {
  let inCtx = false, inLeader = false, inLine = false, x = null;
  let text = null, tx, ty, th, landing = null, dog = [1, 0], dogLen = 0, verts = [];
  const leaders = [];
  for (const [c, v] of rec) {
    if (c === 300 && v.startsWith('CONTEXT_DATA')) { inCtx = true; continue; }
    if (!inCtx) continue;
    if (c === 301) break;
    if (c === 302 && v.startsWith('LEADER')) { inLeader = true; landing = null; x = null; continue; }
    if (c === 303) { inLeader = false; continue; }
    if (c === 304 && v === 'LEADER_LINE{') { inLine = true; verts = []; x = null; continue; }
    if (c === 305) { inLine = false; leaders.push({ landing, dog, dogLen, verts }); continue; }
    if (!inLeader) {
      if (c === 304 && text === null) text = cleanMText(v);
      else if (c === 12 && tx === undefined) tx = parseFloat(v);
      else if (c === 22 && ty === undefined) ty = parseFloat(v);
      else if (c === 41 && th === undefined) th = parseFloat(v);
    } else if (inLine) {
      if (c === 10) x = parseFloat(v);
      else if (c === 20 && x !== null) { verts.push([x, parseFloat(v)]); x = null; }
    } else {
      if (c === 10 && !landing) x = parseFloat(v);
      else if (c === 20 && x !== null && !landing) { landing = [x, parseFloat(v)]; x = null; }
      else if (c === 11) dog = [parseFloat(v), dog[1]];
      else if (c === 21) dog = [dog[0], parseFloat(v)];
      else if (c === 40) dogLen = parseFloat(v);
    }
  }
  return { text: text || '', x: tx, y: ty, h: th || 2.5, leaders };
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

// 先找剛好叫「壁」的，再找含「壁」但不是主秀壁的（其他壁、壁 + 地），最後才用主秀壁
function pickMaterial(materials, kind) {
  const tests = kind === 'wall'
    ? [r => r === '壁', r => r.includes('壁') && !r.includes('主秀'), r => r.includes('壁')]
    : [r => r === '地', r => r.includes('地')];
  for (const t of tests) { const m = materials.find(m => m.size && t(m.role)); if (m) return m; }
  return null;
}

// 紅線切段後看每段的垂直磚縫間距，對到「不是牆磚」的材料尺寸就成為分區
function detectZones(R, marks, jointLines, materials, wallMat) {
  const cuts = [0].concat(marks, [R.w]);
  const zones = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const x0 = cuts[i], x1 = cuts[i + 1];
    const xs = jointLines.filter(l => l.x1 > R.x0 + x0 + 0.3 && l.x1 < R.x0 + x1 - 0.3
      && Math.min(l.y1, l.y2) < R.y1 && Math.max(l.y1, l.y2) > R.y0 && Math.abs(l.y1 - l.y2) >= R.h * 0.3)
      .map(l => l.x1 - R.x0).sort((a, b) => a - b).filter((v, j, a) => j === 0 || v - a[j - 1] > 0.3);
    if (xs.length < 3) continue;
    const gaps = xs.slice(1).map((v, j) => v - xs[j]).sort((a, b) => a - b);
    const d = gaps[Math.floor(gaps.length / 2)];
    const m = materials.find(m => m.size && m !== wallMat && m.size.some(v => Math.abs(v - d) < 0.6 || Math.abs(v + 0.2 - d) < 0.6));
    if (!m) continue;
    if (wallMat && wallMat.size.some(v => Math.abs(v - d) < 0.6)) continue; // 間距跟牆磚一樣，不算分區
    const prev = zones[zones.length - 1];
    if (prev && prev.name === m.role && Math.abs(prev.x1 - x0) < 0.01) prev.x1 = r1(x1);
    else zones.push({ x0: r1(x0), x1: r1(x1), TL: m.size[0], TW: m.size[1], name: m.role });
  }
  return zones;
}

// ── 設備與備註：把圖元（含圖塊）攤平成折線與文字 ──

// ByBlock（0）跟插入的圖塊；ByLayer 在圖層 0 上也跟插入的圖塊，其餘看圖層顏色
function resolveColor(e, layers, inherit) {
  const c = e.color;
  if (c === 0) return inherit || 7;
  if (c === undefined || c === 256) return (e.layer === '0' && inherit) ? inherit : (layers[e.layer] || 7);
  return c;
}

function arcPts(cx, cy, r, a0, a1) {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 360;
  const n = Math.max(6, Math.ceil(sweep / 10));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + sweep * k / n) * Math.PI / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// 聚合線的弧段（bulge）：正值＝逆時針
function bulgePts(p, q, b) {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (!b || d < 1e-9) return [q];
  const ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d;
  const s = b * d / 2, r = (d * d / 4 + s * s) / (2 * s);
  const cx = (p[0] + q[0]) / 2 - uy * (r - s), cy = (p[1] + q[1]) / 2 + ux * (r - s);
  const a0 = Math.atan2(p[1] - cy, p[0] - cx), sweep = 4 * Math.atan(b);
  const n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
  const out = [];
  for (let k = 1; k <= n; k++) {
    const a = a0 + sweep * k / n;
    out.push([cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a)]);
  }
  return out;
}

// tf＝座標轉換（巢狀圖塊一層層組合）；結果放進 out.polys／out.texts／out.notes（世界座標）
function flattenEntity(e, dxf, tf, inherit, depth, out) {
  const c = resolveColor(e, dxf.layers, inherit);
  const poly = pts => { if (pts.length >= 2) out.polys.push({ c, pts: pts.map(tf) }); };
  if (e.type === 'LINE') poly([[e.x1, e.y1], [e.x2, e.y2]]);
  else if (e.type === 'LWPOLYLINE') {
    const pts = [e.pts[0]];
    const n = e.pts.length, segs = e.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) pts.push(...bulgePts(e.pts[k], e.pts[(k + 1) % n], e.bulges[k]));
    poly(pts);
  } else if (e.type === 'ARC' || e.type === 'CIRCLE') {
    poly(arcPts(e.cx, e.cy, e.r, e.a0, e.a1));
    // 平面找門用：開門弧線的圓心（門軸）、半徑（門寬）、兩端點
    if (e.type === 'ARC' && out.arcs) {
      const at = a => tf([e.cx + e.r * Math.cos(a * Math.PI / 180), e.cy + e.r * Math.sin(a * Math.PI / 180)]);
      const c = tf([e.cx, e.cy]), p0 = at(e.a0), p1 = at(e.a1);
      out.arcs.push({ c, r: Math.hypot(p0[0] - c[0], p0[1] - c[1]), p0, p1, sweep: ((e.a1 - e.a0) % 360 + 360) % 360 });
    }
  }
  else if (e.type === 'ELLIPSE') {
    let t1 = e.t1; while (t1 <= e.t0) t1 += 2 * Math.PI;
    const n = Math.max(8, Math.ceil((t1 - e.t0) / (Math.PI / 18))), pts = [];
    for (let k = 0; k <= n; k++) {
      const t = e.t0 + (t1 - e.t0) * k / n;
      pts.push([e.cx + e.mx * Math.cos(t) - e.ratio * e.my * Math.sin(t), e.cy + e.my * Math.cos(t) + e.ratio * e.mx * Math.sin(t)]);
    }
    poly(pts);
  } else if (e.type === 'SPLINE') poly(e.pts);
  else if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.text) {
    const [x, y] = tf([e.x, e.y]), [hx, hy] = tf([e.x, e.y + e.h]);
    out.texts.push({ x, y, h: Math.hypot(hx - x, hy - y), text: e.text, c, top: e.top });
  } else if (e.type === 'MULTILEADER' && e.text && e.x !== undefined) {
    const lines = e.leaders.filter(l => l.verts.length && l.landing).map(l => {
      const pts = l.verts.concat([l.landing]);
      if (l.dogLen) pts.push([l.landing[0] + l.dog[0] * l.dogLen, l.landing[1] + l.dog[1] * l.dogLen]);
      return pts.map(tf);
    });
    const [x, y] = tf([e.x, e.y]);
    out.notes.push({ x, y, h: e.h, text: e.text, c, leaders: lines });
  } else if (e.type === 'INSERT' && depth < 5) {
    const b = dxf.blocks[e.name];
    if (!b) return;
    const a = e.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const local = p => {
      const lx = (p[0] - b.base[0]) * e.sx, ly = (p[1] - b.base[1]) * e.sy;
      return [e.x + lx * ca - ly * sa, e.y + lx * sa + ly * ca];
    };
    for (const be of b.ents) flattenEntity(be, dxf, p => tf(local(p)), c, depth + 1, out);
  }
}

const OVERLAY_SKIP_TEXT = /由此線開始放樣|由此開始放樣|填縫/;
const SIZE_CALLOUT = /\d\s*[*xX×]\s*\d/;

// 收集範圍 box 內的設備線稿、文字、備註；toLocal 轉成該面座標；skip(e) 排除程式自己會畫的東西
function collectOverlay(dxf, cache, box, toLocal, skip) {
  const ov = { polys: [], texts: [], notes: [] };
  const inBox = (p, tol) => p[0] >= box.x0 - tol && p[0] <= box.x1 + tol && p[1] >= box.y0 - tol && p[1] <= box.y1 + tol;
  const loc = p => toLocal(p).map(v => Math.round(v * 10) / 10);
  for (const e of dxf.entities) {
    if (!['LINE', 'LWPOLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE', 'TEXT', 'MTEXT', 'MULTILEADER', 'INSERT'].includes(e.type)) continue;
    if (skip(e)) continue;
    const pre = cache.get(e);
    if (pre && (!pre.bb || pre.bb.x1 < box.x0 - 1 || pre.bb.x0 > box.x1 + 1 || pre.bb.y1 < box.y0 - 1 || pre.bb.y0 > box.y1 + 1)
      && !pre.notes.length) continue;
    let fl = pre;
    if (!fl) {
      fl = { polys: [], texts: [], notes: [] };
      flattenEntity(e, dxf, p => p, undefined, 0, fl);
      // 範圍只算一次，之後每一面先比範圍
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of fl.polys.flatMap(p => p.pts).concat(fl.texts.map(t => [t.x, t.y]))) {
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      }
      fl.bb = x0 <= x1 ? { x0, y0, x1, y1 } : null;
      cache.set(e, fl);
    }
    if (fl.bb && inBox([fl.bb.x0, fl.bb.y0], 0.6) && inBox([fl.bb.x1, fl.bb.y1], 0.6)) {
      fl.polys.forEach(p => ov.polys.push({ c: p.c, pts: p.pts.map(loc) }));
      fl.texts.filter(t => !OVERLAY_SKIP_TEXT.test(t.text)).forEach(t => {
        const [x, y] = loc([t.x, t.y]);
        ov.texts.push({ x, y, h: Math.round(t.h * 10) / 10, text: t.text, c: t.c, top: !!t.top });
      });
    }
    // 備註看箭頭指到哪一面（文字可能寫在面外）
    for (const n of fl.notes) {
      if (!n.leaders.length || !inBox(n.leaders[0][0], 0.6)) continue;
      if (n.text.includes('避免小料') || SIZE_CALLOUT.test(n.text)) continue; // 程式自己會標小料；材料標籤已列在材料表
      const [x, y] = loc([n.x, n.y]);
      ov.notes.push({ x, y, h: n.h, text: n.text, c: n.c, leaders: n.leaders.map(l => l.map(loc)) });
    }
  }
  return ov;
}

// 平面外框轉成地坪座標（x 由左、y 由上量）；外框就是整個矩形時回 null
function planOutline(pts, closed, P) {
  let poly = pts.map(p => [r1(p[0] - P.x0), r1(P.y1 - p[1])]);
  const a = poly[0], b = poly[poly.length - 1];
  if (!closed && Math.abs(a[0] - b[0]) > 0.05 && Math.abs(a[1] - b[1]) > 0.05) {
    const c1 = poly.concat([[a[0], b[1]]]), c2 = poly.concat([[b[0], a[1]]]);
    poly = polyArea(c1) <= polyArea(c2) ? c1 : c2;
  }
  const W = P.x1 - P.x0, H = P.y1 - P.y0;
  if (polyArea(poly) > W * H - 1) return null;
  // 補起來的形狀太怪（面積不到外框一半）多半是抓錯線，交給使用者確認
  return polyArea(poly) >= W * H * 0.5 ? poly : 'odd';
}

// 從 (cx, cy) 往四個方向找最近的牆線（黑／白線、直線或聚合線的水平垂直段，排除磚縫與標示）
// relaxed：整張平面圖的牆不一定是黑白線，改成排除設備、標註、文字類圖層
const PLAN_SKIP_LAYER = /磚|DIM|標註|TEXT|HATCH|TOILET|FUR|設備|傢俱|家具|衛浴|檯面|DOOR|門|WINDOW|窗|AXIS|軸/i;
function rayCastRoom(cx, cy, ents, relaxed) {
  const segs = [];
  for (const e of ents) {
    if (relaxed ? PLAN_SKIP_LAYER.test(e.layer) : (e.layer.includes('磚') || (e.color !== 0 && e.color !== 7))) continue;
    if (e.type === 'LINE') segs.push([e.x1, e.y1, e.x2, e.y2]);
    else if (e.type === 'LWPOLYLINE') {
      const n = e.pts.length, m = e.closed ? n : n - 1;
      for (let k = 0; k < m; k++) { const a = e.pts[k], b = e.pts[(k + 1) % n]; segs.push([a[0], a[1], b[0], b[1]]); }
    }
  }
  // 牆可能是斜的：水平射線 y=cy、垂直射線 x=cx 跟每條牆線求交點，取最近的
  let left = -Infinity, right = Infinity, bottom = -Infinity, top = Infinity, slanted = false;
  const hit = {};
  for (const sg of segs) {
    const [x1, y1, x2, y2] = sg;
    if (Math.hypot(x2 - x1, y2 - y1) < 30) continue;
    if (Math.min(y1, y2) <= cy && cy <= Math.max(y1, y2) && Math.abs(y2 - y1) > 0.05) {
      const x = x1 + (cy - y1) * (x2 - x1) / (y2 - y1);
      if (x < cx && x > left) { left = x; hit.left = sg; }
      if (x > cx && x < right) { right = x; hit.right = sg; }
    }
    if (Math.min(x1, x2) <= cx && cx <= Math.max(x1, x2) && Math.abs(x2 - x1) > 0.05) {
      const y = y1 + (cx - x1) * (y2 - y1) / (x2 - x1);
      if (y < cy && y > bottom) { bottom = y; hit.bottom = sg; }
      if (y > cy && y < top) { top = y; hit.top = sg; }
    }
  }
  if (![left, right, bottom, top].every(Number.isFinite)) return null;
  slanted = ['left', 'right'].some(k => Math.abs(hit[k][0] - hit[k][2]) > 0.5) || ['top', 'bottom'].some(k => Math.abs(hit[k][1] - hit[k][3]) > 0.5);
  // 四面牆延長線兩兩相交＝房間四個角（斜牆的梯形房間也圍得出來）
  const cross = (a, b) => {
    const [x1, y1, x2, y2] = a, [x3, y3, x4, y4] = b;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  const quad = [cross(hit.left, hit.top), cross(hit.top, hit.right), cross(hit.right, hit.bottom), cross(hit.bottom, hit.left)];
  if (quad.every(Boolean)) {
    const b = bboxOf(quad);
    // 角落離射線點太遠（例如牆線很短、延長線幾乎平行）就不用四邊形
    if (b.x1 - b.x0 < (right - left) * 1.5 && b.y1 - b.y0 < (top - bottom) * 1.5) {
      return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, slanted, quad: slanted ? quad : null };
    }
  }
  return { x0: left, x1: right, y0: bottom, y1: top, slanted, quad: null };
}

// 只有地坪時找房間：每個方向射多條平行射線（門洞、窗洞不會讓它穿出去），只看點附近 15m 內的線
const raySegCache = new WeakMap();
function rayCastRoomMulti(cx, cy, ents, relaxed) {
  let cache = raySegCache.get(ents);
  if (!cache) raySegCache.set(ents, cache = {});
  const key = relaxed ? 'r' : 's';
  if (!cache[key]) cache[key] = planWallSegs(ents, relaxed);
  const R = 1500;
  const longSegs = cache[key].filter(([x1, y1, x2, y2]) => Math.max(x1, x2) > cx - R && Math.min(x1, x2) < cx + R && Math.max(y1, y2) > cy - R && Math.min(y1, y2) < cy + R);
  return rayCastFrom(cx, cy, longSegs);
}

// 牆線候選：嚴格＝只認黑／白線；放寬＝非設備圖層都算，但青色（門窗）一律不是牆
// 窗洞、門洞旁的牆可能只剩一小段（例如 12cm），太短的（< 8cm，多半是收頭或標示）才不算
function planWallSegs(ents, relaxed) {
  const segs = [];
  for (const e of ents) {
    if (relaxed ? (PLAN_SKIP_LAYER.test(e.layer) || e.color === DXF_CYAN) : (e.layer.includes('磚') || (e.color !== 0 && e.color !== 7))) continue;
    if (e.type === 'LINE') segs.push([e.x1, e.y1, e.x2, e.y2]);
    else if (e.type === 'LWPOLYLINE') {
      const n = e.pts.length, m = e.closed ? n : n - 1;
      for (let k = 0; k < m; k++) { const a = e.pts[k], b = e.pts[(k + 1) % n]; segs.push([a[0], a[1], b[0], b[1]]); }
    }
  }
  return segs.filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) >= 8);
}

function rayCastFrom(cx, cy, longSegs) {
  // 一條射線：水平射線 y=py 找左右、垂直射線 x=px 找上下，取最近的牆線（牆可能是斜的）
  const cast = (px, py, dir) => {
    let best = null;
    for (const sg of longSegs) {
      const [x1, y1, x2, y2] = sg;
      if (dir === 'left' || dir === 'right') {
        if (!(Math.min(y1, y2) <= py && py <= Math.max(y1, y2) && Math.abs(y2 - y1) > 0.05)) continue;
        const x = x1 + (py - y1) * (x2 - x1) / (y2 - y1), d = dir === 'left' ? px - x : x - px;
        if (d > 0 && (!best || d < best.d)) best = { d, v: x, sg };
      } else {
        if (!(Math.min(x1, x2) <= px && px <= Math.max(x1, x2) && Math.abs(x2 - x1) > 0.05)) continue;
        const y = y1 + (px - x1) * (y2 - y1) / (x2 - x1), d = dir === 'bottom' ? py - y : y - py;
        if (d > 0 && (!best || d < best.d)) best = { d, v: y, sg };
      }
    }
    return best;
  };
  // 每個方向射 17 條平行線：門洞、窗洞讓一部分射線穿出去打到外牆或隔壁，
  // 取「至少 3 條打到同一個位置」裡最近的那個＝內牆面（窗兩頭的收頭短線最多擋到 2 條）
  const OFFS = Array.from({ length: 17 }, (_, i) => (i - 8) * 10);
  const hit = {}, pos = {};
  // 射線只從房間裡面發射：上下方向限在左右牆之間、左右方向限在上下牆之間（第一輪還不知道，先全用，第二輪再收窄）
  const inside = (dir, o) => dir === 'left' || dir === 'right'
    ? pos.bottom === undefined || (cy + o > pos.bottom + 1 && cy + o < pos.top - 1)
    : pos.left === undefined || (cx + o > pos.left + 1 && cx + o < pos.right - 1);
  for (const dir of ['left', 'right', 'bottom', 'top', 'left', 'right']) {
    const hits = OFFS.filter(o => o === 0 || inside(dir, o))
      .map(o => dir === 'left' || dir === 'right' ? cast(cx, cy + o, dir) : cast(cx + o, cy, dir)).filter(Boolean);
    if (!hits.length) return null;
    const groups = {};
    for (const h of hits) (groups[Math.round(h.v * 2) / 2] = groups[Math.round(h.v * 2) / 2] || []).push(h);
    const near = Object.values(groups).filter(g => g.length >= 3).sort((p, q) => p[0].d - q[0].d)[0];
    // 斜牆每條射線的位置都不同（沒有一組 3 條以上）：用中心那條
    const pick = near ? near[0] : (cast(cx, cy, dir) || hits.sort((p, q) => p.d - q.d)[0]);
    hit[dir] = pick.sg; pos[dir] = pick.v;
  }
  const { left, right, bottom, top } = pos;
  const slanted = ['left', 'right'].some(k => Math.abs(hit[k][0] - hit[k][2]) > 0.5) || ['top', 'bottom'].some(k => Math.abs(hit[k][1] - hit[k][3]) > 0.5);
  // 四面牆延長線兩兩相交＝房間四個角（斜牆的梯形房間也圍得出來）
  const cross = (a, b) => {
    const [x1, y1, x2, y2] = a, [x3, y3, x4, y4] = b;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  const quad = [cross(hit.left, hit.top), cross(hit.top, hit.right), cross(hit.right, hit.bottom), cross(hit.bottom, hit.left)];
  if (slanted && quad.every(Boolean)) {
    const b = bboxOf(quad);
    // 角落離射線點太遠（例如牆線很短、延長線幾乎平行）就不用四邊形
    if (b.x1 - b.x0 < (right - left) * 1.5 && b.y1 - b.y0 < (top - bottom) * 1.5) {
      return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, slanted, quad };
    }
  }
  return { x0: left, x1: right, y0: bottom, y1: top, slanted, quad: null };
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
    // 牆用一條條直線畫的平面：從 ABCD 往上下左右找最近的牆線，圍出房間範圍（當成矩形）
    if (!plan) {
      const room = rayCastRoom(abcd.x, abcd.y, ents);
      if (room && fits(room) && room.x1 - room.x0 >= 50 && room.y1 - room.y0 >= 50) {
        plan = Object.assign(room, { e: null });
        warnings.push(`地坪外框是用直線畫的，已從視角符號往四周找牆線圍出 ${r1(room.x1 - room.x0)}×${r1(room.y1 - room.y0)}`
          + (room.quad ? '；房間有斜牆，已用四面牆圍成的四邊形裁切計算地磚' : room.slanted ? '；房間有斜牆，地坪以矩形近似計算，請確認' : '（若是 L 形請手動確認）'));
      }
    }
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
  const flatCache = dxf.flatCache || (dxf.flatCache = new Map());
  // 各面共用的排除：磚縫線與磚面圖、放樣標示、索引符號、放樣文字
  const skipCommon = e => (e.layer.includes('磚') && ['LINE', 'LWPOLYLINE', 'INSERT'].includes(e.type))
    || e.layer === '標註' || e.color === DXF_MARK
    || (e.type === 'INSERT' && (DXF_FACE_LETTERS.includes(e.name) || e.name === 'ABCD'))
    || ((e.type === 'TEXT' || e.type === 'MTEXT') && OVERLAY_SKIP_TEXT.test(e.text));
  const isV = l => Math.abs(l.x1 - l.x2) < 0.05, isH = l => Math.abs(l.y1 - l.y2) < 0.05;
  const jointLines = lines.filter(l => l.layer.includes('磚') && isV(l));
  const wallMat = pickMaterial(materials, 'wall');

  // 5. 各立面：尺寸、放樣起點、紅線、門窗
  const faces = {}, openings = [], missing = [];
  for (const k of DXF_FACE_LETTERS) {
    const R = g.faces[k];
    if (!R) { warnings.push(`圖上沒有 ${k} 立面，已設為「此面不鋪磚」`); missing.push(k); continue; }
    const face = { fw: r1(R.w), fh: r1(R.h), dir: 'H', mode: 'grid', yalign: 'bottom', yoff: 0 };
    const start = lines.find(l => l.color === DXF_MARK && isV(l) && l.x1 >= R.x0 - 0.5 && l.x1 <= R.x1 + 0.5
      && Math.abs(Math.min(l.y1, l.y2) - R.y1) < 1.5);
    if (start) Object.assign(face, { xalign: 'custom', xoff: r1(Math.max(0, start.x1 - R.x0)) });
    else { Object.assign(face, { xalign: 'left', xoff: 0 }); warnings.push(`${k} 立面找不到「由此線開始放樣」引線，預設靠左`); }
    face.marks = lines.filter(l => l.color === DXF_RED && isV(l) && l.x1 > R.x0 + 0.5 && l.x1 < R.x1 - 0.5
      && Math.min(l.y1, l.y2) < R.y1 && Math.max(l.y1, l.y2) > R.y0 && Math.abs(l.y1 - l.y2) >= R.h * 0.5)
      .map(l => r1(l.x1 - R.x0)).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.4);
    // 分區：紅線切出的每一段，若磚縫間距符合另一種材料（例如主秀壁 14.8），就設成分區
    face.zones = detectZones(R, face.marks, jointLines, materials, wallMat);
    // 設備（馬桶等）與備註：排除外框、磚縫、紅線、門窗框、放樣標示（程式自己會畫）
    face.overlay = collectOverlay(dxf, flatCache, R, p => [p[0] - R.x0, p[1] - R.y0], e =>
      (e.type === 'LWPOLYLINE' && (() => { const r = asRect(e); return r && (r === R || (Math.abs(r.x0 - R.x0) < 0.05 && Math.abs(r.x1 - R.x1) < 0.05 && Math.abs(r.y0 - R.y0) < 0.05 && Math.abs(r.y1 - R.y1) < 0.05) || r.color === DXF_CYAN); })())
      || skipCommon(e) || (e.type === 'LINE' && e.color === DXF_RED && isV(e) && Math.abs(e.y1 - e.y2) >= R.h * 0.5));
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
  if (P) {
    // 實際外框（L 形）：沒封閉的聚合線用直角補起來，兩種補法取面積小的（門口門檻不算地坪）
    const outline = plan.e ? planOutline(plan.e.pts, plan.e.closed, P) : null;
    if (outline === 'odd') warnings.push('地坪外框形狀不完整（面積不到外框一半），暫以矩形計算地磚，請確認');
    else if (outline) {
      floor.outline = outline;
      const slanted = outline.some((p, i) => { const q = outline[(i + 1) % outline.length]; return Math.abs(p[0] - q[0]) > 0.1 && Math.abs(p[1] - q[1]) > 0.1; });
      if (slanted) warnings.push('地坪外框有斜邊，已照實際形狀裁切計算地磚');
    } else if (plan.quad) {
      floor.outline = plan.quad.map(p => [r1(p[0] - P.x0), r1(P.y1 - p[1])]);
    }
    // 平面設備（馬桶、臉盆、門、檯面）與牆線：範圍放寬到牆厚
    const PB = { x0: P.x0 - 30, y0: P.y0 - 30, x1: P.x1 + 30, y1: P.y1 + 30 };
    floor.overlay = collectOverlay(dxf, flatCache, PB, p => [p[0] - P.x0, P.y1 - p[1]], skipCommon);
  }
  faces.floor = floor;
  // 圖上沒有的立面：尺寸用地坪推（A/C＝地坪深、B/D＝地坪寬），標成不鋪磚，不沿用上一張圖
  const Hmax = Math.max(...Object.values(g.faces).map(r => r.h));
  for (const k of missing) {
    faces[k] = { fw: (k === 'A' || k === 'C') ? floor.fh : floor.fw, fh: r1(Hmax), dir: 'H', mode: 'grid',
      xalign: 'left', xoff: 0, yalign: 'bottom', yoff: 0, marks: [], zones: [], skip: true };
  }

  // 7. 磚尺寸：牆用「壁」、地坪用「地」
  const wall = wallMat;
  const flm = pickMaterial(materials, 'floor');
  if (!wall) warnings.push('找不到「壁」材料尺寸，沿用目前磁磚尺寸');
  if (flm && wall && (flm.size[0] !== wall.size[0] || flm.size[1] !== wall.size[1])) {
    faces.floor.TL = flm.size[1] >= flm.size[0] ? flm.size[1] : flm.size[0];
    faces.floor.TW = flm.size[1] >= flm.size[0] ? flm.size[0] : flm.size[1];
  }
  for (const m of materials.filter(m => m.role.includes('主秀') && m.size)) {
    const used = DXF_FACE_LETTERS.some(k => faces[k] && faces[k].zones.some(z => z.name === m.role));
    if (!used) warnings.push(`有「${m.role}」材料，但沒在立面找到對應的磚縫分區，請在該面「分區磚」手動設定`);
  }

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

// ── 只有地坪平面：自動生成四面牆 ──
// 天花／門高寫在圖上就用圖上的，例如「天花 FL+289」「CH=280」「門高 239」「DH 210」
const PLAN_TEXT_CEIL = /(?:天花板?高?|C\.?H\.?|FL\s*\+)\s*[:：=]?\s*(?:FL\s*\+\s*)?(\d{3}(?:\.\d+)?)/i;
const PLAN_TEXT_DOOR = /(?:門高|D\.?H\.?)\s*[:：=]?\s*(\d{3}(?:\.\d+)?)/i;
const PLAN_TEXT_LEDGE = /(?:檯高|台高|檯面高|墩高)\s*[:：=]?\s*(\d{2,3}(?:\.\d+)?)/;
const ROOM_MIN = 60, ROOM_MAX = 1000;

function closedPts(e) {
  if (e.type !== 'LWPOLYLINE' || e.pts.length < 3) return null;
  const a = e.pts[0], b = e.pts[e.pts.length - 1];
  if (!e.closed && Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) return null;
  return e.pts;
}

function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const roomSized = b => b.x1 - b.x0 >= ROOM_MIN && b.y1 - b.y0 >= ROOM_MIN && b.x1 - b.x0 <= ROOM_MAX && b.y1 - b.y0 <= ROOM_MAX;

// (x, y) 所在的房間：圍住它的最小聚合線（沒封閉的當作補起來，L 形內牆常這樣畫），跟往四周找牆線圍出來的比：
// 聚合線沒有比牆線圍的大太多就用聚合線（射線可能被 L 形內凹、檯面擋住而偏小）；
// 大很多多半是外面的圖框或平面區塊框（牆用直線畫時圍住中心的只有這種框）
function roomAt(dxf, x, y) {
  const area = r => (r.x1 - r.x0) * (r.y1 - r.y0);
  const polys = dxf.entities.filter(e => e.type === 'LWPOLYLINE' && e.pts.length >= 4 && !PLAN_SKIP_LAYER.test(e.layer) && pointInPoly([x, y], e.pts))
    .map(e => Object.assign(bboxOf(e.pts), { e })).filter(roomSized).sort((a, b) => area(a) - area(b));
  // 點的附近多試幾個點，取最多個點圍出同一個範圍的那個（同票數取小的）；黑白牆線找不到再放寬
  const offs = [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30], [30, -30], [-30, 30]];
  let ray = null;
  for (const relaxed of [false, true]) {
    const found = offs.map(([dx, dy]) => rayCastRoomMulti(x + dx, y + dy, dxf.entities, relaxed))
      .filter(r => r && roomSized(r) && r.x0 < x && x < r.x1 && r.y0 < y && y < r.y1);
    const key = r => [r.x0, r.y0, r.x1, r.y1].map(v => Math.round(v)).join(',');
    const votes = {};
    for (const r of found) (votes[key(r)] = votes[key(r)] || []).push(r);
    ray = Object.values(votes).sort((p, q) => q.length - p.length || area(p[0]) - area(q[0])).map(v => v[0])[0] || null;
    if (ray) break;
  }
  const poly = polys.find(q => !ray || area(q) <= area(ray) * 2.2);
  if (poly) return poly;
  return ray ? Object.assign(ray, { e: null }) : null;
}

// 檔案裡的每一間：有 ABCD 視角符號就一個符號一間；沒有就找像房間的封閉外框
// （牆畫成雙線時外圈只比內圈大一點 → 取內圈；房間裡的浴缸、檯面外框 → 不算一間）
function findPlanRooms(dxf) {
  const rooms = [];
  const same = (a, b) => Math.abs(a.x0 - b.x0) < 1 && Math.abs(a.y0 - b.y0) < 1 && Math.abs(a.x1 - b.x1) < 1 && Math.abs(a.y1 - b.y1) < 1;
  const symbols = dxf.entities.filter(e => e.type === 'INSERT' && e.name === 'ABCD').map(e => symbolCenter(e, dxf.blocks));
  for (const [x, y] of symbols) {
    const r = roomAt(dxf, x, y);
    if (r && !rooms.some(q => same(q, r))) rooms.push(Object.assign(r, { seed: [x, y] }));
  }
  if (rooms.length) return rooms;
  const cand = dxf.entities.map(e => ({ e, pts: closedPts(e) })).filter(q => q.pts && !PLAN_SKIP_LAYER.test(q.e.layer))
    .map(q => Object.assign(bboxOf(q.pts), { e: q.e, pts: q.pts })).filter(b => roomSized(b) && b.x1 - b.x0 >= 80 && b.y1 - b.y0 >= 80);
  const w = b => b.x1 - b.x0, h = b => b.y1 - b.y0;
  const inside = (big, small) => big !== small && small.x0 >= big.x0 - 0.5 && small.x1 <= big.x1 + 0.5 && small.y0 >= big.y0 - 0.5 && small.y1 <= big.y1 + 0.5;
  const keep = cand.filter(c => {
    // 房間裡比自己小很多的東西（浴缸…）：自己是房間，那個不是
    if (cand.some(big => inside(big, c) && (w(big) - w(c) > 80 || h(big) - h(c) > 80))) return false;
    // 裡面有只小一圈的外框：自己是牆的外線
    if (cand.some(small => inside(c, small) && w(c) - w(small) <= 80 && h(c) - h(small) <= 80 && (w(c) - w(small) > 1 || h(c) - h(small) > 1))) return false;
    return true;
  });
  for (const c of keep) if (!rooms.some(q => same(q, c))) rooms.push(Object.assign(c, { seed: [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2] }));
  return rooms.sort((a, b) => (b.y1 - a.y1) || (a.x0 - b.x0));
}

// 整份檔案的弧線（含圖塊裡的門）展開一次存起來；圖塊基準點常在遠處，不能用插入點篩選
function allArcs(dxf) {
  if (dxf.arcs) return dxf.arcs;
  const fl = { polys: [], texts: [], notes: [], arcs: [] };
  for (const e of dxf.entities) if (e.type === 'ARC' || e.type === 'INSERT') flattenEntity(e, dxf, q => q, undefined, 0, fl);
  return (dxf.arcs = fl.arcs);
}

// 牆線（水平、垂直段）只整理一次：量門洞開口用
function axisSegs(dxf) {
  if (dxf.axisSegs) return dxf.axisSegs;
  const out = [];
  let cyan = false; // 青色（色號 4）＝門窗框、窗線（使用者的畫法），不是牆
  const add = (x1, y1, x2, y2) => {
    if (Math.abs(y1 - y2) < 0.05) out.push({ h: true, c: y1, a: Math.min(x1, x2), b: Math.max(x1, x2), cyan });
    else if (Math.abs(x1 - x2) < 0.05) out.push({ h: false, c: x1, a: Math.min(y1, y2), b: Math.max(y1, y2), cyan });
  };
  for (const e of dxf.entities) {
    cyan = e.color === DXF_CYAN || /WINDOW|窗/i.test(e.layer);
    if (PLAN_SKIP_LAYER.test(e.layer) && !cyan) continue;
    if (e.type === 'LINE') add(e.x1, e.y1, e.x2, e.y2);
    else if (e.type === 'LWPOLYLINE') {
      const n = e.pts.length, m = e.closed ? n : n - 1;
      for (let k = 0; k < m; k++) { const a = e.pts[k], b = e.pts[(k + 1) % n]; add(a[0], a[1], b[0], b[1]); }
    }
  }
  return (dxf.axisSegs = out);
}

// 門洞實際開口（牆到牆，跟立面上畫的門框外寬一樣）：沿牆線（c）找 [s0, s1] 附近沒有牆線的那段；青色門框不算牆
function wallGap(dxf, horiz, c, s0, s1, lo, hi) {
  const segs = axisSegs(dxf).filter(q => !q.cyan && q.h === horiz && Math.abs(q.c - c) < 3 && q.b > lo - 1 && q.a < hi + 1);
  const left = Math.max(lo, ...segs.filter(q => q.b <= s0 + 3).map(q => q.b));
  const right = Math.min(hi, ...segs.filter(q => q.a >= s1 - 3).map(q => q.a));
  if (segs.some(q => q.a < right - 1 && q.b > left + 1)) return null; // 中間還有牆線，不是門洞
  const w = right - left;
  return w >= (s1 - s0) - 2 && w <= (s1 - s0) + 25 ? [left, right] : null;
}

// 平面上的門：約 90° 的開門弧線，圓心（門軸）貼著某面牆，弧的另一端在牆上＝門寬
function planDoors(dxf, arcs, P, dims, doorH) {
  const doors = [];
  const fw = { A: dims.A, B: dims.B, C: dims.C, D: dims.D };
  for (const a of arcs) {
    if (a.sweep < 70 || a.sweep > 110 || a.r < 50 || a.r > 150) continue;
    const [cx, cy] = a.c;
    // 開門弧線要在這間房裡（門向內開）；隔壁房間的門弧線在牆另一邊，不算
    const mx = (a.p0[0] + a.p1[0]) / 2 - cx, my = (a.p0[1] + a.p1[1]) / 2 - cy, ml = Math.hypot(mx, my) || 1;
    const mid = [cx + mx / ml * a.r * 0.7, cy + my / ml * a.r * 0.7];
    if (!(mid[0] > P.x0 && mid[0] < P.x1 && mid[1] > P.y0 && mid[1] < P.y1)) continue;
    const near = [
      ['B', Math.abs(cy - P.y1), cx > P.x0 - 5 && cx < P.x1 + 5],
      ['D', Math.abs(cy - P.y0), cx > P.x0 - 5 && cx < P.x1 + 5],
      ['A', Math.abs(cx - P.x0), cy > P.y0 - 5 && cy < P.y1 + 5],
      ['C', Math.abs(cx - P.x1), cy > P.y0 - 5 && cy < P.y1 + 5]
    ].filter(n => n[1] <= 35 && n[2]).sort((p, q) => p[1] - q[1])[0];
    if (!near) continue;
    const k = near[0], horiz = k === 'B' || k === 'D';
    // 弧上比較貼牆的那一端是另一邊門框
    const along = q => horiz ? Math.abs(q[1] - cy) : Math.abs(q[0] - cx);
    const jamb = along(a.p0) < along(a.p1) ? a.p0 : a.p1;
    let s0 = horiz ? Math.min(cx, jamb[0]) - P.x0 : P.y1 - Math.max(cy, jamb[1]);
    let w = r1(Math.abs(horiz ? jamb[0] - cx : jamb[1] - cy));
    // 弧線半徑是門片寬；牆線有缺口就用缺口（門框開口），比較接近立面上畫的門
    const line = { B: P.y1, D: P.y0, A: P.x0, C: P.x1 }[k];
    const gap = horiz
      ? wallGap(dxf, true, line, Math.min(cx, jamb[0]), Math.max(cx, jamb[0]), P.x0, P.x1)
      : wallGap(dxf, false, line, Math.min(cy, jamb[1]), Math.max(cy, jamb[1]), P.y0, P.y1);
    if (gap) { w = r1(gap[1] - gap[0]); s0 = horiz ? gap[0] - P.x0 : P.y1 - gap[1]; }
    if (w < 50) continue;
    // 平面位置換成立面距左（A、D 左右相反）
    const x = r1((k === 'A' || k === 'D') ? fw[k] - s0 - w : s0);
    if (doors.some(d => d.face === k && Math.abs(d.x - x) < 10)) continue;
    // span：門在牆線上的實際範圍（圖面座標，掃房間形狀時當開口跳過）
    const span = horiz ? { side: k, a: P.x0 + s0, b: P.x0 + s0 + w } : { side: k, a: P.y1 - s0 - w, b: P.y1 - s0 };
    doors.push({ kind: 'door', face: k, w, h: doorH, x: Math.max(0, x), y: 0, span });
  }
  return doors.map((d, i) => Object.assign({ name: `門 ${i + 1}（${d.face} 面）` }, d));
}

// 平面上的窗：牆線在某段斷開，斷開的地方牆厚範圍內有青色（或窗圖層）的平行線
// 左右位置、寬度量得出來；窗台與窗高平面看不出來，用預設值
function planWindows(dxf, P, dims, doors, sill, winH) {
  const out = [];
  const sides = [['B', true, P.y1, 1], ['D', true, P.y0, -1], ['A', false, P.x0, -1], ['C', false, P.x1, 1]];
  const all = axisSegs(dxf);
  for (const [k, horiz, line, outward] of sides) {
    const lo = horiz ? P.x0 : P.y0, hi = horiz ? P.x1 : P.y1;
    const wall = all.filter(q => !q.cyan && q.h === horiz && Math.abs(q.c - line) < 3 && q.b > lo - 1 && q.a < hi + 1)
      .map(q => [Math.max(lo, q.a), Math.min(hi, q.b)]).sort((a, b) => a[0] - b[0]);
    // 牆線沒蓋到的段落＝開口
    const gaps = [];
    let cur = lo;
    for (const [a, b] of wall) { if (a - cur >= 30) gaps.push([cur, a]); cur = Math.max(cur, b); }
    if (hi - cur >= 30) gaps.push([cur, hi]);
    for (const [g0, g1] of gaps) {
      // 開口外側牆厚範圍（40 內）要有平行的窗線，蓋過開口八成以上
      const marks = all.filter(q => q.cyan && q.h === horiz && (q.c - line) * outward >= -1 && (q.c - line) * outward <= 40
        && Math.min(q.b, g1) - Math.max(q.a, g0) >= (g1 - g0) * 0.8);
      if (!marks.length) continue;
      const w = r1(g1 - g0);
      // 平面座標換成立面距左：B 由左、C 由上（B 那頭）、A 與 D 左右相反
      const s0 = horiz ? g0 - P.x0 : P.y1 - g1;
      const x = r1((k === 'A' || k === 'D') ? dims[k] - s0 - w : s0);
      if (doors.some(d => d.face === k && x < d.x + d.w - 1 && x + w > d.x + 1)) continue; // 是門洞
      out.push({ kind: 'window', face: k, w, h: winH, x: Math.max(0, x), y: sill, span: { side: k, a: g0, b: g1 } });
    }
  }
  return out.map((o, i) => Object.assign({ name: `窗 ${i + 1}（${o.face} 面）` }, o));
}

// 房間實際形狀（牆用一段段直線畫、沒有封閉外框時）：沿四面牆每 2cm 掃一條射線量牆在哪，
// 門窗開口（spans）與穿出去的射線當開口跳過、用旁邊的牆補；再把「左右牆之間、上下牆之間」的範圍圍成多邊形
// 回傳圖面座標的多邊形；就是矩形或量不出來回 null
function traceRoomOutline(dxf, P, spans) {
  const W = P.x1 - P.x0, Hh = P.y1 - P.y0;
  const segs = planWallSegs(dxf.entities, false).filter(([x1, y1, x2, y2]) =>
    Math.max(x1, x2) > P.x0 - W && Math.min(x1, x2) < P.x1 + W && Math.max(y1, y2) > P.y0 - Hh && Math.min(y1, y2) < P.y1 + Hh);
  const cx = (P.x0 + P.x1) / 2, cy = (P.y0 + P.y1) / 2, STEP = 2, FAR = 150;
  const cast = (o, dir) => {
    let best = null;
    for (const [x1, y1, x2, y2] of segs) {
      if (dir === 'L' || dir === 'R') {
        if (!(Math.min(y1, y2) <= o && o <= Math.max(y1, y2) && Math.abs(y2 - y1) > 0.05)) continue;
        const x = x1 + (o - y1) * (x2 - x1) / (y2 - y1), d = dir === 'L' ? cx - x : x - cx;
        if (d > 0 && (best === null || d < best.d)) best = { d, v: x };
      } else {
        if (!(Math.min(x1, x2) <= o && o <= Math.max(x1, x2) && Math.abs(x2 - x1) > 0.05)) continue;
        const y = y1 + (o - x1) * (y2 - y1) / (x2 - x1), d = dir === 'B' ? cy - y : y - cy;
        if (d > 0 && (best === null || d < best.d)) best = { d, v: y };
      }
    }
    return best ? best.v : null;
  };
  const side = { L: 'A', R: 'C', B: 'D', T: 'B' };
  const edge = { L: P.x0, R: P.x1, B: P.y0, T: P.y1 };
  const out = { L: -1, R: 1, B: -1, T: 1 };
  // 一個方向的牆位置：開口、穿出去太遠、沒打到的取樣先空著，再用最近的有效取樣補
  const profile = (dir, lo, hi) => {
    const pts = [];
    for (let o = lo + 1; o < hi; o += STEP) {
      let v = cast(o, dir);
      if (v !== null) {
        const beyond = (v - edge[dir]) * out[dir];
        const inOpening = spans.some(sp => sp.side === side[dir] && o > sp.a - 1 && o < sp.b + 1);
        if (beyond > FAR || (inOpening && beyond > 1)) v = null;
      }
      pts.push([o, v]);
    }
    const ok = pts.filter(q => q[1] !== null);
    if (!ok.length) return null;
    return pts.map(([o, v]) => [o, v !== null ? v : ok.reduce((b, q) => Math.abs(q[0] - o) < Math.abs(b[0] - o) ? q : b)[1]]);
  };
  const Bp = profile('B', P.x0, P.x1), Tp = profile('T', P.x0, P.x1);
  if (!Bp || !Tp) return null;
  const yLo = Math.min(...Bp.map(q => q[1])), yHi = Math.max(...Tp.map(q => q[1]));
  const Lp = profile('L', yLo, yHi), Rp = profile('R', yLo, yHi);
  if (!Lp || !Rp) return null;
  const at = (prof, o) => prof.reduce((b, q) => Math.abs(q[0] - o) < Math.abs(b[0] - o) ? q : b)[1];
  // 格線＝各段牆的實際位置（不是 2cm 取樣點），每一格看中心點在不在房間裡
  const uniq = vals => [...new Set(vals.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  const xs = uniq([P.x0, P.x1].concat(Lp.map(q => q[1]), Rp.map(q => q[1])));
  const ys = uniq([P.y0, P.y1].concat(Bp.map(q => q[1]), Tp.map(q => q[1])));
  const nx = xs.length - 1, ny = ys.length - 1;
  const inside = [];
  for (let i = 0; i < nx; i++) {
    inside.push([]);
    for (let j = 0; j < ny; j++) {
      const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
      inside[i].push(at(Lp, my) <= mx && mx <= at(Rp, my) && at(Bp, mx) <= my && my <= at(Tp, mx));
    }
  }
  const isIn = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && inside[i][j];
  // 外框：每一格露在外面的邊（逆時針方向），接成一圈，再把同一直線上的點去掉
  const next = new Map();
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (!inside[i][j]) continue;
    if (!isIn(i, j - 1)) next.set(`${i},${j}`, [i + 1, j]);
    if (!isIn(i + 1, j)) next.set(`${i + 1},${j}`, [i + 1, j + 1]);
    if (!isIn(i, j + 1)) next.set(`${i + 1},${j + 1}`, [i, j + 1]);
    if (!isIn(i - 1, j)) next.set(`${i},${j + 1}`, [i, j]);
  }
  if (!next.size) return null;
  const start = [...next.keys()][0];
  const loop = [];
  let k = start;
  for (let guard = 0; guard <= next.size; guard++) {
    const [i, j] = k.split(',').map(Number);
    loop.push([xs[i], ys[j]]);
    const nx2 = next.get(k);
    if (!nx2) return null;
    k = `${nx2[0]},${nx2[1]}`;
    if (k === start) break;
  }
  const poly = loop.filter((q, idx) => {
    const a = loop[(idx - 1 + loop.length) % loop.length], b = loop[(idx + 1) % loop.length];
    return !((Math.abs(a[0] - q[0]) < 1e-6 && Math.abs(b[0] - q[0]) < 1e-6) || (Math.abs(a[1] - q[1]) < 1e-6 && Math.abs(b[1] - q[1]) < 1e-6));
  });
  if (poly.length <= 4 || next.size !== loop.length) return null; // 就是矩形，或圍出不只一塊
  const A = polyArea(poly);
  return A > W * Hh * 0.5 && A < W * Hh * 2 ? poly : null;
}

// 平面上的半高檯（管道間、隱藏水箱）：房間裡靠牆、跟牆平行的紅線（色號 1，使用者的畫法），
// 離牆 1.5～40；兩端各自要嘛碰到轉角的牆、要嘛有一段紅線接回牆（檯的側面）
// 回傳 [{ face, x, w, d }]，x 是立面距左（還沒攤開側面）
function planLedges(dxf, P, dims) {
  const red = [];
  const add = (x1, y1, x2, y2) => {
    if (Math.abs(y1 - y2) < 0.05) red.push({ h: true, c: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
    else if (Math.abs(x1 - x2) < 0.05) red.push({ h: false, c: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
  };
  for (const e of dxf.entities) {
    if (e.color !== DXF_RED || e.layer.includes('磚')) continue;
    if (e.type === 'LINE') add(e.x1, e.y1, e.x2, e.y2);
    else if (e.type === 'LWPOLYLINE') {
      const n = e.pts.length, m = e.closed ? n : n - 1;
      for (let k = 0; k < m; k++) { const a = e.pts[k], b = e.pts[(k + 1) % n]; add(a[0], a[1], b[0], b[1]); }
    }
  }
  const out = [];
  // [面, 水平牆?, 牆線位置, 往房內的方向]
  const sides = [['B', true, P.y1, -1], ['D', true, P.y0, 1], ['A', false, P.x0, 1], ['C', false, P.x1, -1]];
  for (const [k, horiz, line, inward] of sides) {
    const lo = horiz ? P.x0 : P.y0, hi = horiz ? P.x1 : P.y1;
    for (const q of red) {
      const d = (q.c - line) * inward;
      if (q.h !== horiz || d < 1.5 || d > 40 || q.b - q.a < 20 || q.a < lo - 2 || q.b > hi + 2) continue;
      const ok = v => Math.abs(v - lo) <= 2 || Math.abs(v - hi) <= 2
        || red.some(r => r.h !== horiz && Math.abs(r.c - v) <= 1 && Math.min(r.b, Math.max(line, q.c)) - Math.max(r.a, Math.min(line, q.c)) >= d * 0.7);
      if (!ok(q.a) || !ok(q.b)) continue;
      const a = Math.abs(q.a - lo) <= 2 ? lo : q.a, b = Math.abs(q.b - hi) <= 2 ? hi : q.b;
      const w = r1(b - a), s0 = horiz ? a - P.x0 : P.y1 - b;
      const x = r1((k === 'A' || k === 'D') ? dims[k] - s0 - w : s0);
      if (!out.some(l => l.face === k && Math.abs(l.x - x) < 1 && Math.abs(l.w - w) < 1)) out.push({ face: k, x: Math.max(0, x), w, d: r1(d) });
    }
  }
  return out;
}

// 地坪不是矩形時，每面立面上「牆面轉折」的位置（照使用者畫法標紅線）：
// 立面是站在房間裡往那面看，看得到的牆面（凹進去那段、凸出來的側面）都畫在同一張立面上
// 例：底牆往內一階 9cm → C 立面 147 處一條紅線（147～156 是那一階的側面），D 立面在轉折處一條
function outlineJogMarks(outline, fw, fh) {
  const marks = { A: [], B: [], C: [], D: [] };
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const p = outline[i], q = outline[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (Math.abs(p[0] - q[0]) < 0.05) {
      // 直的一段：房間在它右邊（x 大）＝面向 A 那邊看得到；在左邊＝C
      const k = pointInPoly([mx + 0.5, my], outline) ? 'A' : 'C';
      for (const y of [p[1], q[1]]) marks[k].push(k === 'A' ? fh - y : y);
    } else if (Math.abs(p[1] - q[1]) < 0.05) {
      // 橫的一段（y 由 B 牆往下量）：房間在它下面＝B 牆那種朝向；在上面＝D
      const k = pointInPoly([mx, my + 0.5], outline) ? 'B' : 'D';
      for (const x of [p[0], q[0]]) marks[k].push(k === 'D' ? fw - x : x);
    }
  }
  for (const k in marks) {
    const len = k === 'A' || k === 'C' ? fh : fw;
    marks[k] = [...new Set(marks[k].map(v => r1(v)))].filter(v => v > 0.5 && v < len - 0.5).sort((a, b) => a - b);
  }
  return marks;
}

// 一間房間 → 施工圖資料（四面牆由地坪四邊產生）
// 高度（牆高、門高、窗台、窗高、檯高）平面看不出來：先用圖上文字或網頁預設，匯入前跳確認視窗讓使用者填（finalizePlanSheet）
function buildPlanSheet(dxf, room, opts) {
  opts = opts || {};
  const warnings = [];
  let P = { x0: room.x0, y0: room.y0, x1: room.x1, y1: room.y1 };
  // 牆用直線畫的房間：先用矩形找門窗，再沿牆掃出實際形狀（底牆有一階、內凹…），用新範圍重新對門窗
  let traced = null;
  if (!room.e && !room.quad) {
    const arcs0 = allArcs(dxf).filter(a => a.c[0] > P.x0 - 40 && a.c[0] < P.x1 + 40 && a.c[1] > P.y0 - 40 && a.c[1] < P.y1 + 40);
    const dims0 = { A: P.y1 - P.y0, B: P.x1 - P.x0, C: P.y1 - P.y0, D: P.x1 - P.x0 };
    const d0 = planDoors(dxf, arcs0, P, dims0, 210);
    const spans = d0.concat(planWindows(dxf, P, dims0, d0, 90, 120)).map(o => o.span);
    traced = traceRoomOutline(dxf, P, spans);
    if (traced) P = bboxOf(traced);
  }
  const fwF = r1(P.x1 - P.x0), fhF = r1(P.y1 - P.y0);
  const near = 250;
  const texts = dxf.entities.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && e.text
    && e.x > P.x0 - near && e.x < P.x1 + near && e.y > P.y0 - near && e.y < P.y1 + near);
  const pick = re => { for (const t of texts) { const m = t.text.match(re); if (m) return parseFloat(m[1]); } return null; };
  const ceilTxt = pick(PLAN_TEXT_CEIL), doorTxt = pick(PLAN_TEXT_DOOR), ledgeTxt = pick(PLAN_TEXT_LEDGE);
  const H = r1(ceilTxt || opts.H || 280), doorH = r1(Math.min(H, doorTxt || opts.doorH || 210));
  const ledgeH = r1(Math.min(H, ledgeTxt || opts.ledgeH || 110));
  warnings.push(`只有地坪平面：四面牆由地坪四邊產生（B、D 寬 ${fwF}，A、C 寬 ${fhF}）`);
  const heightNotes = [`牆高 ${H}${ceilTxt ? '（圖上文字）' : '（網頁「空間高度 H」）'}、門高 ${doorH}${doorTxt ? '（圖上文字）' : '（網頁「門高預設」）'}，請確認`];

  const floor = { fw: fwF, fh: fhF, dir: 'H', mode: 'grid', xalign: 'left', xoff: 0, yalign: 'bottom', yoff: 0 };
  const outline = room.e ? planOutline(room.e.pts, true, P) : null;
  if (traced) {
    floor.outline = traced.map(q => [r1(q[0] - P.x0), r1(P.y1 - q[1])]);
    warnings.push(`地坪不是矩形：照牆線圍出 ${traced.length} 個角的實際形狀算地磚；立面寬照外框，凹進去那段的側面畫在看得到的那面立面上（紅線分界），門口凹進去的門檻不算`);
  } else if (outline && outline !== 'odd') {
    floor.outline = outline;
    warnings.push('地坪不是矩形：四面牆寬以外框四邊近似（L 形的內凹牆面請另外確認）');
  } else if (room.quad) floor.outline = room.quad.map(q => [r1(q[0] - P.x0), r1(P.y1 - q[1])]);

  // 設備線稿與門：房間範圍放寬到牆厚
  const PB = { x0: P.x0 - 40, y0: P.y0 - 40, x1: P.x1 + 40, y1: P.y1 + 40 };
  const flatCache = dxf.flatCache || (dxf.flatCache = new Map());
  const skip = e => (e.layer.includes('磚') && ['LINE', 'LWPOLYLINE', 'INSERT'].includes(e.type)) || (e.type === 'INSERT' && e.name === 'ABCD')
    || ((e.type === 'TEXT' || e.type === 'MTEXT') && (OVERLAY_SKIP_TEXT.test(e.text) || PLAN_TEXT_CEIL.test(e.text) || PLAN_TEXT_DOOR.test(e.text)));
  floor.overlay = collectOverlay(dxf, flatCache, PB, q => [q[0] - P.x0, P.y1 - q[1]], skip);
  const arcs = allArcs(dxf).filter(a => a.c[0] > PB.x0 && a.c[0] < PB.x1 && a.c[1] > PB.y0 && a.c[1] < PB.y1);
  const dims = { A: fhF, B: fwF, C: fhF, D: fwF };
  const doors = planDoors(dxf, arcs, P, dims, doorH);
  if (!doors.length) warnings.push('平面上沒找到開門弧線，請在「門窗」清單加入門');
  const sill = opts.sill || 90, winH = opts.winH || 120;
  const windows = planWindows(dxf, P, dims, doors, sill, Math.min(winH, H - sill));
  if (windows.length) {
    warnings.push(`找到 ${windows.length} 扇窗（左右位置、寬度照平面）`);
    heightNotes.push(`窗台 ${sill}、窗高 ${Math.min(winH, H - sill)} 是預設值，請照實際改`);
  } else warnings.push('平面上沒找到窗；有窗請在「門窗」清單補上');
  const ledges = planLedges(dxf, P, dims).map(l => Object.assign(l, { h: ledgeH, side: '' }));
  if (ledges.length) {
    warnings.push(`找到 ${ledges.length} 個半高檯（靠牆的紅線）：${ledges.map(l => `${l.face} 牆長 ${l.w}、深 ${l.d}`).join('；')}`);
    heightNotes.push(`檯高 ${ledgeH}${ledgeTxt ? '（圖上文字）' : '（預設）'}，請確認`);
  }
  const openings = doors.concat(windows).map(o => { const c = Object.assign({}, o); delete c.span; return c; });

  const faces = { floor };
  const jogs = floor.outline ? outlineJogMarks(floor.outline, fwF, fhF) : { A: [], B: [], C: [], D: [] };
  for (const k of DXF_FACE_LETTERS) {
    faces[k] = { fw: dims[k], fh: H, dir: 'H', mode: 'grid', xalign: 'left', xoff: 0, yalign: 'bottom', yoff: 0, marks: jogs[k], zones: [] };
  }
  // 材料（有寫「填縫劑」的材料文字就用）
  const materials = texts.filter(t => t.text.includes('填縫')).map(t => parseMaterial(t.text)).filter(Boolean);
  const wall = pickMaterial(materials, 'wall'), flm = pickMaterial(materials, 'floor');
  if (flm && (!wall || flm.size[0] !== wall.size[0] || flm.size[1] !== wall.size[1])) {
    faces.floor.TL = Math.max(...flm.size); faces.floor.TW = Math.min(...flm.size);
  }
  // 圖名：房間裡寫的空間名稱（例如「浴室」「主臥衛浴」）
  const nameTxt = texts.find(t => /浴|廁|衛|WC|BATH/i.test(t.text) && t.x > P.x0 && t.x < P.x1 && t.y > P.y0 && t.y < P.y1);
  const meta = { project: '', drawingName: nameTxt ? nameTxt.text.split('\n')[0].trim() : '', number: '' };
  const project = {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, meta,
    room: { L: fhF, W: fwF, H },
    tile: wall ? { TL: Math.max(...wall.size), TW: Math.min(...wall.size) } : {},
    faces, openings, ledges, materials, column: { on: false }
  };
  const heights = { H, Hsrc: ceilTxt ? '圖上文字' : '網頁預設', doorSrc: doorTxt ? '圖上文字' : '網頁預設', ledgeSrc: ledgeTxt ? '圖上文字' : '預設' };
  return { box: PB, meta, materials, warnings, heightNotes, heights, project, faceKeys: DXF_FACE_LETTERS.slice(), planOnly: true };
}

// 匯入前確認的結果套進去（ans 沒給的欄位維持原值）：
//   ans = { H, doors: [{ h }], windows: [{ y, h }], ledges: [{ use, h, unfold }], faces: { A: true, … } }
// 半高檯側面攤開（預設）：檯的端點沒碰到牆角那一側，側面（寬＝檯深）攤進這面立面，牆寬加檯深、右邊的門窗跟著往右移
function finalizePlanSheet(sheet, ans) {
  const s = Object.assign({}, sheet, { project: JSON.parse(JSON.stringify(sheet.project)) });
  const pj = s.project;
  ans = ans || {};
  const H = ans.H > 0 ? r1(ans.H) : pj.room.H;
  pj.room.H = H;
  for (const k of DXF_FACE_LETTERS) pj.faces[k].fh = H;
  let di = 0, wi = 0;
  for (const o of pj.openings) {
    const a = (o.kind === 'door' ? ans.doors || [] : ans.windows || [])[o.kind === 'door' ? di++ : wi++] || {};
    if (o.kind === 'window' && a.y >= 0) o.y = r1(a.y);
    if (a.h > 0) o.h = r1(a.h);
    o.y = Math.min(o.y, H - 1);
    o.h = r1(Math.min(o.h, H - o.y));
  }
  const keep = [];
  (pj.ledges || []).forEach((l, i) => {
    const a = (ans.ledges || [])[i] || {};
    if (a.use === false) return;
    if (a.h > 0) l.h = r1(a.h);
    l.h = Math.min(l.h, H);
    const fw = pj.faces[l.face].fw;
    l.side = a.unfold === false ? '' : (l.x > 0.5 ? 'L' : '') + (l.x + l.w < fw - 0.5 ? 'R' : '');
    keep.push(l);
  });
  // 由右往左插入攤開的側面，左邊的位置才不會被影響
  const events = [];
  for (const l of keep) {
    if (l.side.includes('L')) events.push({ face: l.face, pos: l.x, d: l.d });
    if (l.side.includes('R')) events.push({ face: l.face, pos: l.x + l.w, d: l.d });
  }
  events.sort((a, b) => b.pos - a.pos);
  for (const ev of events) {
    const f = pj.faces[ev.face];
    f.fw = r1(f.fw + ev.d);
    for (const o of pj.openings) if (o.face === ev.face && o.x >= ev.pos - 0.05) o.x = r1(o.x + ev.d);
    for (const l of keep) if (l.face === ev.face && l.x >= ev.pos - 0.05) l.x = r1(l.x + ev.d);
    f.marks = (f.marks || []).map(m => m >= ev.pos - 0.05 ? r1(m + ev.d) : m);
  }
  pj.ledges = keep;
  for (const k of DXF_FACE_LETTERS) if (ans.faces && ans.faces[k] === false) pj.faces[k].skip = true;
  if (sheet.heightNotes && Object.keys(ans).length) {
    const doors = pj.openings.filter(o => o.kind === 'door'), wins = pj.openings.filter(o => o.kind === 'window');
    s.heightNotes = [];
    s.warnings = sheet.warnings.concat(`已確認高度：牆高 ${H}`
      + (doors.length ? `、門高 ${doors.map(o => o.h).join('／')}` : '')
      + (wins.length ? `、窗台／窗高 ${wins.map(o => `${o.y}／${o.h}`).join('、')}` : '')
      + (keep.length ? `、檯高 ${keep.map(l => l.h).join('／')}` : ''));
    const skipped = DXF_FACE_LETTERS.filter(k => pj.faces[k].skip);
    if (skipped.length) s.warnings.push(`不出立面（不鋪磚）：${skipped.join('、')}`);
    const unfolded = keep.filter(l => l.side);
    if (unfolded.length) s.warnings.push(`半高檯側面攤進立面：${unfolded.map(l => `${l.face} 立面 +${l.d}（寬 ${pj.faces[l.face].fw}）`).join('；')}`);
  }
  return s;
}

function sheetLabel(s, i) {
  const dims = s.faceKeys.map(k => `${k}=${s.project.faces[k].fw}`).join('／');
  const name = [s.meta.project, s.meta.drawingName].filter(Boolean).join('｜') || '（無圖名）';
  return `#${i + 1}　${name}${s.meta.number ? '　圖號 ' + s.meta.number : ''}　${dims}　H${s.project.room.H}`;
}

// 多張圖時讓使用者挑一張
let lastDxfSheets = [];

function chooseDxfSheet(sheets) {
  lastDxfSheets = sheets;
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
  // 只有地坪：四面牆是程式生成的，直接套用最佳起磚點（方案比較表留著，可以改選）
  if (s.planOnly && typeof searchPlans === 'function') {
    lastPlans = searchPlans(params());
    const best = lastPlans.find(pl => pl.best);
    if (best && best.id !== 'current') applyPlan(best.id); else renderPlans(lastPlans);
  }
  const notes = s.warnings.concat(s.heightNotes || [], res.warnings);
  alert(`已匯入：${sheetLabel(s, 0).replace(/^#1\s*/, '')}\n`
    + `材料：${s.materials.map(m => `${m.role} ${m.spec}`).join('、') || '無'}`
    + (notes.length ? '\n\n請確認：\n・' + notes.join('\n・') : ''));
}

// ── 只有地坪平面的選房間視窗 ──
let planPick = null;

function planOpts() {
  return { H: num('H', 280), doorH: num('doorH', 210), sill: num('winSill', 90), winH: num('winH', 120), ledgeH: num('ledgeH', 110) };
}

function planRoomLabel(dxf, r, i) {
  const s = buildPlanSheet(dxf, r, planOpts());
  return `#${i + 1}　${s.meta.drawingName || '房間'}　${s.project.faces.floor.fw}×${s.project.faces.floor.fh}　門 ${s.project.openings.length} 樘`;
}

// 畫出整張平面（每個圖元展開成線），標出找到的房間；點一下就用那間
function showPlanPicker(dxf, rooms) {
  const cv = $('planCanvas'), g = cv.getContext('2d');
  if (!dxf.flatAll) {
    const fl = { polys: [], texts: [], notes: [] };
    for (const e of dxf.entities) flattenEntity(e, dxf, q => q, undefined, 0, fl);
    dxf.flatAll = fl;
  }
  // 範圍取 1%～99%（遠處的圖塊基準點、零星圖元不要把圖縮得太小）
  const xs = [], ys = [];
  for (const pl of dxf.flatAll.polys) for (const q of pl.pts) { xs.push(q[0]); ys.push(q[1]); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const qt = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * f)))];
  let x0 = qt(xs, 0.01), x1 = qt(xs, 0.99), y0 = qt(ys, 0.01), y1 = qt(ys, 0.99);
  for (const r of rooms) { x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1); y0 = Math.min(y0, r.y0); y1 = Math.max(y1, r.y1); }
  const pad = 20, sc = Math.min((cv.width - pad * 2) / (x1 - x0 || 1), (cv.height - pad * 2) / (y1 - y0 || 1));
  const P = q => [pad + (q[0] - x0) * sc, cv.height - pad - (q[1] - y0) * sc];
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.lineWidth = 0.6;
  for (const pl of dxf.flatAll.polys) {
    g.strokeStyle = typeof aciColor === 'function' ? aciColor(pl.c) : '#555';
    g.beginPath(); pl.pts.forEach((q, i) => { const [x, y] = P(q); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
  }
  rooms.forEach((r, i) => {
    const [ax, ay] = P([r.x0, r.y1]), [bx, by] = P([r.x1, r.y0]);
    g.fillStyle = 'rgba(221, 34, 34, 0.08)'; g.fillRect(ax, ay, bx - ax, by - ay);
    g.strokeStyle = '#d22'; g.lineWidth = 2; g.strokeRect(ax, ay, bx - ax, by - ay);
    g.fillStyle = '#d22'; g.font = 'bold 14px sans-serif'; g.fillText('#' + (i + 1), ax + 4, ay + 16);
  });
  planPick = { dxf, rooms, toDxf: (px, py) => [x0 + (px - pad) / sc, y0 + (cv.height - pad - py) / sc], toPx: (x, y) => P([x, y]) };
  $('planPickerNote').textContent = rooms.length
    ? `找到 ${rooms.length} 間（紅框）。點紅框或下面的按鈕；不對的話直接點在浴室中間。`
    : '沒有自動找到房間：請點在要做的浴室中間，程式會往四周找牆線。';
  const list = $('planRoomList');
  list.innerHTML = '';
  rooms.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = planRoomLabel(dxf, r, i);
    b.addEventListener('click', () => usePlanRoom(r));
    list.appendChild(b);
  });
  $('planPicker').style.display = 'flex';
}

function usePlanRoom(room) {
  $('planPicker').style.display = 'none';
  showPlanConfirm(buildPlanSheet(planPick.dxf, room, planOpts()));
}

// 匯入前確認：平面看不出來的高度一次填好，再選要出哪幾面立面
let planConfirmSheet = null;

function showPlanConfirm(sheet) {
  planConfirmSheet = sheet;
  const pj = sheet.project, hs = sheet.heights || {};
  const inp = (cls, v, extra) => `<input type="number" class="${cls}" value="${v}" min="0" step="0.5"${extra || ''}>`;
  const src = t => `<span class="pc-src${/預設/.test(t) ? ' warn' : ''}">${t}</span>`;
  const doors = pj.openings.filter(o => o.kind === 'door'), wins = pj.openings.filter(o => o.kind === 'window');
  let html = `<div class="pc-row"><b>牆高</b>${inp('pc-H', pj.room.H)}${src(hs.Hsrc || '')}</div>`;
  doors.forEach((o, i) => { html += `<div class="pc-row">🚪 門 ${i + 1}（${o.face} 面，距左 ${o.x}、寬 ${o.w}）　門高 ${inp('pc-door', o.h)}${src(hs.doorSrc || '')}</div>`; });
  wins.forEach((o, i) => { html += `<div class="pc-row">🪟 窗 ${i + 1}（${o.face} 面，距左 ${o.x}、寬 ${o.w}）　窗台 ${inp('pc-sill', o.y)} 窗高 ${inp('pc-winh', o.h)}${src('網頁預設')}</div>`; });
  (pj.ledges || []).forEach((l, i) => {
    html += `<div class="pc-row">🧱 <label class="pc-chk"><input type="checkbox" class="pc-ledge-use" checked>半高檯 ${i + 1}</label>（${l.face} 牆，距左 ${l.x}、長 ${l.w}、深 ${l.d}）　高 ${inp('pc-ledge-h', l.h)}${src(hs.ledgeSrc || '')}
      <label class="pc-chk"><input type="checkbox" class="pc-ledge-unfold" checked>側面攤進立面</label></div>`;
  });
  html += `<div class="pc-row"><b>要出的立面</b>${DXF_FACE_LETTERS.map(k => `<label class="pc-chk"><input type="checkbox" class="pc-face" data-k="${k}" checked>${k}</label>`).join('')}
    <span class="pc-src">沒勾的那面不鋪磚、不算料</span></div>`;
  $('planConfirmBody').innerHTML = html;
  $('planConfirmNote').textContent = `${sheet.meta.drawingName || '房間'}：地坪 ${pj.faces.floor.fw}×${pj.faces.floor.fh}。平面看不出高度，黃色的是預設值，請照設計圖改。`;
  $('planConfirm').style.display = 'flex';
}

function readPlanConfirm() {
  const vals = cls => [...document.querySelectorAll('#planConfirmBody .' + cls)];
  const v = el => parseFloat(el.value);
  const sills = vals('pc-sill'), winh = vals('pc-winh');
  const use = vals('pc-ledge-use'), lh = vals('pc-ledge-h'), unfold = vals('pc-ledge-unfold');
  const faces = {};
  vals('pc-face').forEach(el => { faces[el.dataset.k] = el.checked; });
  return {
    H: v(document.querySelector('#planConfirmBody .pc-H')),
    doors: vals('pc-door').map(el => ({ h: v(el) })),
    windows: sills.map((el, i) => ({ y: v(el), h: v(winh[i]) })),
    ledges: use.map((el, i) => ({ use: el.checked, h: v(lh[i]), unfold: unfold[i].checked })),
    faces
  };
}

function pickPlanAt(px, py) {
  if (!planPick) return;
  const [x, y] = planPick.toDxf(px, py);
  const hit = planPick.rooms.filter(r => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
    .sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0];
  const room = hit || roomAt(planPick.dxf, x, y);
  if (!room) { alert('這裡找不到圍起來的房間：請點在浴室中間（離牆遠一點、不要點在設備上）。'); return; }
  usePlanRoom(room);
}

function importDxfText(text) {
  const t0 = Date.now();
  const dxf = parseDxf(text);
  const sheets = findDxfSheets(dxf);
  if (!sheets.length) {
    // 沒有立面施工圖：當成只有地坪平面
    const rooms = findPlanRooms(dxf);
    console.log(`DXF 解析 ${Date.now() - t0}ms，只有平面，找到 ${rooms.length} 間`);
    if (rooms.length === 1) { planPick = { dxf, rooms }; usePlanRoom(rooms[0]); } else showPlanPicker(dxf, rooms);
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
  if ($('planPickerCancel')) $('planPickerCancel').addEventListener('click', () => { $('planPicker').style.display = 'none'; });
  if ($('planConfirmOk')) $('planConfirmOk').addEventListener('click', () => {
    $('planConfirm').style.display = 'none';
    if (planConfirmSheet) applyDxfSheet(finalizePlanSheet(planConfirmSheet, readPlanConfirm()));
  });
  if ($('planConfirmCancel')) $('planConfirmCancel').addEventListener('click', () => { $('planConfirm').style.display = 'none'; });
  if ($('planCanvas')) $('planCanvas').addEventListener('click', e => {
    const cv = $('planCanvas'), b = cv.getBoundingClientRect();
    pickPlanAt((e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height);
  });
  // 檔案直接拖進畫面：.dxf 當施工圖／平面圖，.json 當資料檔
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (/\.dxf$/i.test(f.name)) f.text().then(importDxfText);
    else if (/\.json$/i.test(f.name) && typeof importProjectText === 'function') f.text().then(importProjectText);
    else alert('只能拖 .dxf（施工圖或平面圖）或 .json（資料檔）進來。');
  });
}
