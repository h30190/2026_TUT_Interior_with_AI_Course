// 📐 匯出 DXF：照使用者施工圖的畫法輸出，貼回 AutoCAD 繼續畫
// 對照原施工圖：磚縫＝「地磚」層單線（灰 8）、外框＝0 層、紅線＝色號 1、門窗＝色號 4、
// 「由此線開始放樣」＝色號 62、尺寸＝T-DIM 層「複本 ISO-25」真尺寸物件、小料＝紅圈 r6＋「避免小料」
// 排法同畫面施工圖全景：上排 A、B、C、D 立面（底對齊 y=0、間距 80），下排地坪平面對齊 B 立面
// 單位 1＝1 cm；檔頭寫 mm（跟原圖一樣），插入原圖時不會被放大縮小

const DXF_GAP = 80;         // 立面間距（同施工圖）
const DXF_PLAN_GAP = 160;   // 立面底 → 地坪頂
const DXF_DIM_OFF = 30;     // 尺寸線離面 30
const DXF_TXT = 10;         // 字高 10
const DXF_FONT = '\\fMicrosoft JhengHei|b0|i0|c136|p34;';
const DXF_DIMSTYLE = '複本 ISO-25';
// Hatch 樣式定義（acadiso.pat，比例 1）：[角度, 基準點, 間距位移, 虛線段]
const DXF_PATTERNS = {
  ANSI31: [[45, [0, 0], [-2.2450640303, 2.2450640303], []]],
  ANSI32: [[45, [0, 0], [-6.7351920908, 6.7351920908], []], [45, [4.490128053, 0], [-6.7351920908, 6.7351920908], []]],
  ANSI34: [[45, [0, 0], [-13.4703841816, 13.4703841816], []], [45, [4.490128053, 0], [-13.4703841816, 13.4703841816], []],
    [45, [8.9802561314, 0], [-13.4703841816, 13.4703841816], []], [45, [13.4703841844, 0], [-13.4703841816, 13.4703841816], []]],
  ANSI37: [[45, [0, 0], [-2.2450640303, 2.2450640303], []], [135, [0, 0], [-2.2450640303, -2.2450640303], []]],
  NET: [[0, [0, 0], [0, 3.175], []], [90, [0, 0], [-3.175, 0], []]]
};

// ── 寫 DXF 的小工具：往骨架（DXF_TEMPLATE）裡加圖元 ──
function dxfDoc() {
  const tpl = DXF_TEMPLATE;
  let seed = parseInt(tpl.match(/\$HANDSEED\n\s*5\n([0-9A-F]+)/i)[1], 16);
  const msOwner = tpl.match(/BLOCK_RECORD\n\s*5\n([0-9A-F]+)\n330\n[0-9A-F]+\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n\s*2\n\*Model_Space/)[1];
  const brTable = tpl.match(/\s2\nBLOCK_RECORD\n\s*5\n([0-9A-F]+)/)[1];
  const handle = () => (seed++).toString(16).toUpperCase();
  const n = v => String(Math.round(v * 10000) / 10000);
  const records = [], blocks = [], ents = [];

  // 一個「容器」：模型空間或某個圖塊，圖元都寫進 out
  const sink = (owner, out) => {
    const head = (type, layer, color) => {
      out.push([0, type], [5, handle()], [330, owner], [100, 'AcDbEntity'], [8, layer || '0']);
      if (color !== undefined && color !== null && color !== 256) out.push([62, color]);
    };
    const s = {
      line(a, b, layer, color) {
        head('LINE', layer, color);
        out.push([100, 'AcDbLine'], [10, n(a[0])], [20, n(a[1])], [30, 0], [11, n(b[0])], [21, n(b[1])], [31, 0]);
      },
      poly(pts, closed, layer, color) {
        if (pts.length < 2) return;
        head('LWPOLYLINE', layer, color);
        out.push([100, 'AcDbPolyline'], [90, pts.length], [70, closed ? 1 : 0]);
        for (const p of pts) out.push([10, n(p[0])], [20, n(p[1])]);
      },
      circle(c, r, layer, color) {
        head('CIRCLE', layer, color);
        out.push([100, 'AcDbCircle'], [10, n(c[0])], [20, n(c[1])], [30, 0], [40, n(r)]);
      },
      // 圓弧：角度（度）逆時針由 a0 到 a1
      arc(c, r, a0, a1, layer, color) {
        head('ARC', layer, color);
        out.push([100, 'AcDbCircle'], [10, n(c[0])], [20, n(c[1])], [30, 0], [40, n(r)], [100, 'AcDbArc'], [50, n(a0)], [51, n(a1)]);
      },
      // 實心三角（箭頭）
      solid(a, b, c, layer, color) {
        head('SOLID', layer, color);
        out.push([100, 'AcDbTrace'], [10, n(a[0])], [20, n(a[1])], [30, 0], [11, n(b[0])], [21, n(b[1])], [31, 0],
          [12, n(c[0])], [22, n(c[1])], [32, 0], [13, n(c[0])], [23, n(c[1])], [33, 0]);
      },
      // 實心填滿：pts＝[x, y, bulge]（bulge 為該點到下一點的圓弧凸度）
      fill(pts, layer, color) {
        head('HATCH', layer, color);
        out.push([100, 'AcDbHatch'], [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, 'SOLID'], [70, 1], [71, 0],
          [91, 1], [92, 3], [72, 1], [73, 1], [93, pts.length]);
        for (const p of pts) out.push([10, n(p[0])], [20, n(p[1])], [42, n(p[2] || 0)]);
        out.push([97, 0], [75, 0], [76, 1], [98, 0]);
      },
      // 圖案填充：polys＝一個或多個封閉外框（各自填滿），pat＝DXF_PATTERNS 的名稱
      hatch(polys, pat, layer, color) {
        polys = polys.filter(q => q.length >= 3);
        if (!polys.length) return;
        head('HATCH', layer, color);
        out.push([100, 'AcDbHatch'], [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, pat], [70, 0], [71, 0], [91, polys.length]);
        for (const q of polys) {
          out.push([92, 3], [72, 0], [73, 1], [93, q.length]);
          for (const pt of q) out.push([10, n(pt[0])], [20, n(pt[1])]);
          out.push([97, 0]);
        }
        const def = DXF_PATTERNS[pat];
        out.push([75, 1], [76, 1], [52, 0], [41, 1], [77, 0], [78, def.length]);
        for (const [ang, base, off, dash] of def) {
          out.push([53, ang], [43, n(base[0])], [44, n(base[1])], [45, n(off[0])], [46, n(off[1])], [79, dash.length]);
          for (const d of dash) out.push([49, n(d)]);
        }
        out.push([98, 0]);
      },
      // 多行文字：attach 1 左上、4 左中、5 正中、6 右中、7 左下、8 中下、9 右下
      text(p, h, str, attach, opts) {
        opts = opts || {};
        head('MTEXT', opts.layer, opts.color);
        out.push([100, 'AcDbMText'], [10, n(p[0])], [20, n(p[1])], [30, 0], [40, n(h)], [71, attach || 1], [72, 1]);
        const body = '{' + DXF_FONT + mtextEsc(str) + '}';
        const cps = Array.from(body);
        for (let i = 0; i + 250 < cps.length; i += 250) out.push([3, cps.slice(i, i + 250).join('')]);
        out.push([1, cps.slice(Math.floor((cps.length - 1) / 250) * 250).join('')]);
        if (opts.style) out.push([7, opts.style]);
        // 旋轉用方向向量（比角度欄位不易出錯）
        if (opts.rot) out.push([11, n(Math.cos(opts.rot * Math.PI / 180))], [21, n(Math.sin(opts.rot * Math.PI / 180))], [31, 0]);
      },
      // 真尺寸物件（線性）：p1、p2＝兩個量測點，at＝尺寸線經過的點，vertical＝量垂直距離
      dim(p1, p2, at, vertical) {
        const meas = vertical ? Math.abs(p2[1] - p1[1]) : Math.abs(p2[0] - p1[0]);
        if (meas < 0.05) return;
        const name = dimBlock(p1, p2, at, vertical, meas);
        const mid = vertical ? [at[0] - 0.625 - DXF_TXT / 2, (p1[1] + p2[1]) / 2] : [(p1[0] + p2[0]) / 2, at[1] + 0.625 + DXF_TXT / 2];
        head('DIMENSION', 'T-DIM');
        out.push([100, 'AcDbDimension'], [280, 0], [2, name], [3, DXF_DIMSTYLE],
          [10, n(vertical ? at[0] : p2[0])], [20, n(vertical ? p2[1] : at[1])], [30, 0],
          [11, n(mid[0])], [21, n(mid[1])], [31, 0], [70, 32], [71, 5], [1, '<>'],
          [100, 'AcDbAlignedDimension'], [13, n(p1[0])], [23, n(p1[1])], [33, 0], [14, n(p2[0])], [24, n(p2[1])], [34, 0],
          [50, vertical ? 90 : 0], [100, 'AcDbRotatedDimension']);
      }
    };
    return s;
  };

  // 尺寸的顯示圖塊（AutoCAD 照這個畫；之後拉伸或改樣式時 AutoCAD 會自己重算）
  let dimNo = 0;
  function dimBlock(p1, p2, at, vertical, meas) {
    const name = '*D' + (++dimNo);
    const br = handle();
    records.push([0, 'BLOCK_RECORD'], [5, br], [330, brTable], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'],
      [2, name], [340, 0], [70, 0], [280, 1], [281, 0]);
    const out = [];
    out.push([0, 'BLOCK'], [5, handle()], [330, br], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockBegin'],
      [2, name], [70, 1], [10, 0], [20, 0], [30, 0], [3, name], [1, '']);
    const b = sink(br, out);
    const ASZ = 2.5, AW = 0.41, EXO = 0.625, EXE = 1.25;
    // 延伸線（離量測點 0.625、超出尺寸線 1.25）、尺寸線、箭頭、數字（寫在線上方；垂直的轉 90° 寫在左邊）
    if (vertical) {
      const x = at[0], d = Math.sign(x - p1[0]) || -1;
      for (const p of [p1, p2]) b.line([p[0] + d * EXO, p[1]], [x + d * EXE, p[1]], '0', 0);
      const y1 = Math.min(p1[1], p2[1]), y2 = Math.max(p1[1], p2[1]);
      b.line([x, y1], [x, y2], '0', 0);
      b.solid([x, y1], [x - AW, y1 + ASZ], [x + AW, y1 + ASZ], '0', 0);
      b.solid([x, y2], [x - AW, y2 - ASZ], [x + AW, y2 - ASZ], '0', 0);
      b.text([x - 0.625 - DXF_TXT / 2, (y1 + y2) / 2], DXF_TXT, fmtDim(meas), 5, { layer: 'T-DIM', color: 0, rot: 90 });
    } else {
      const y = at[1], d = Math.sign(y - p1[1]) || -1;
      for (const p of [p1, p2]) b.line([p[0], p[1] + d * EXO], [p[0], y + d * EXE], '0', 0);
      const x1 = Math.min(p1[0], p2[0]), x2 = Math.max(p1[0], p2[0]);
      b.line([x1, y], [x2, y], '0', 0);
      b.solid([x1, y], [x1 + ASZ, y + AW], [x1 + ASZ, y - AW], '0', 0);
      b.solid([x2, y], [x2 - ASZ, y + AW], [x2 - ASZ, y - AW], '0', 0);
      b.text([(x1 + x2) / 2, y + 0.625 + DXF_TXT / 2], DXF_TXT, fmtDim(meas), 5, { layer: 'T-DIM', color: 0 });
    }
    out.push([0, 'ENDBLK'], [5, handle()], [330, br], [100, 'AcDbEntity'], [8, '0'], [100, 'AcDbBlockEnd']);
    blocks.push(...out);
    return name;
  }

  const ms = sink(msOwner, ents);
  ms.toString = () => {
    const enc = list => list.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + (list.length ? '\n' : '');
    let s = tpl;
    // 尺寸圖塊登記 → BLOCK_RECORD 表的 ENDTAB 前；圖塊內容 → BLOCKS 段的 ENDSEC 前；圖元 → ENTITIES 段
    const brAt = s.indexOf('  0\nENDTAB', s.search(/\s2\nBLOCK_RECORD\n/));
    s = s.slice(0, brAt) + enc(records) + s.slice(brAt);
    const blkAt = s.indexOf('  0\nENDSEC', s.indexOf('  2\nBLOCKS\n'));
    s = s.slice(0, blkAt) + enc(blocks) + s.slice(blkAt);
    const entAt = s.indexOf('  2\nENTITIES\n') + '  2\nENTITIES\n'.length;
    s = s.slice(0, entAt) + enc(ents) + s.slice(entAt);
    s = s.replace(/(\$HANDSEED\n\s*5\n)[0-9A-F]+/i, '$1' + handle());
    return s.replace(/\n/g, '\r\n');
  };
  return ms;
}

// 多行文字的特殊字元：\ { } 要跳脫、換行寫 \P
function mtextEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/[{}]/g, c => '\\' + c).replace(/\r?\n/g, '\\P');
}

function fmtDim(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// 估計文字寬度（中文字約 1 個字高、英數約 0.6）
function dxfTextW(s, h) {
  return Array.from(String(s)).reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 1 : 0.6), 0) * h;
}

// ── 磚縫線：每塊磚往外推半條縫，相鄰兩塊的邊就重合成一條；同一直線上的接起來；貼邊的不畫（外框會畫）；門窗裡面挖掉 ──
function jointLines(tiles, fw, fh, joint, ops, outline) {
  const j2 = joint / 2;
  const refX = [0, fw], refY = [0, fh];
  for (const o of ops) { refX.push(o.x, o.x + o.w); refY.push(o.y, o.y + o.h); }
  const snap = (v, refs) => { for (const r of refs) if (Math.abs(v - r) <= joint + 1e-6) return r; return v; };
  const H = {}, V = {}, slant = [];
  const onOutline = (a, b) => {
    if (!outline) return false;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i], q = outline[(i + 1) % outline.length];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      const cross = Math.abs((mx - p[0]) * dy - (my - p[1]) * dx) / L;
      const t = ((mx - p[0]) * dx + (my - p[1]) * dy) / (L * L);
      if (cross < 0.3 && t > -0.01 && t < 1.01) return true;
    }
    return false;
  };
  const add = (a, b) => {
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) return;
    if (onOutline(a, b)) return;
    if (Math.abs(a[1] - b[1]) < 1e-6) {
      const y = a[1];
      if (y <= 1e-6 || y >= fh - 1e-6) return;
      (H[y.toFixed(2)] = H[y.toFixed(2)] || []).push([Math.min(a[0], b[0]), Math.max(a[0], b[0])]);
    } else if (Math.abs(a[0] - b[0]) < 1e-6) {
      const x = a[0];
      if (x <= 1e-6 || x >= fw - 1e-6) return;
      (V[x.toFixed(2)] = V[x.toFixed(2)] || []).push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
    } else {
      slant.push([a, b]);
    }
  };
  for (const t of tiles) {
    const x0 = Math.max(t.x0, 0), y0 = Math.max(t.y0, 0), x1 = x0 + t.wL, y1 = y0 + t.wW;
    const pts = t.poly || [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0]));
    const by0 = Math.min(...pts.map(p => p[1])), by1 = Math.max(...pts.map(p => p[1]));
    // 外接框的邊往外推半條縫並對齊到附近的面邊、門窗邊
    const mv = p => [
      Math.abs(p[0] - bx0) < 1e-6 ? snap(Math.max(0, p[0] - j2), refX) : Math.abs(p[0] - bx1) < 1e-6 ? snap(Math.min(fw, p[0] + j2), refX) : p[0],
      Math.abs(p[1] - by0) < 1e-6 ? snap(Math.max(0, p[1] - j2), refY) : Math.abs(p[1] - by1) < 1e-6 ? snap(Math.min(fh, p[1] + j2), refY) : p[1]
    ];
    const q = pts.map(mv);
    for (let i = 0; i < q.length; i++) add(q[i], q[(i + 1) % q.length]);
  }
  // 同一直線上的線段接起來，再挖掉門窗裡面
  const merge = list => {
    list.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const s of list) {
      const last = out[out.length - 1];
      if (last && s[0] <= last[1] + joint + 0.01) last[1] = Math.max(last[1], s[1]);
      else out.push(s.slice());
    }
    return out;
  };
  const cut = (segs, holes) => {
    for (const [h0, h1] of holes) {
      segs = segs.flatMap(([a, b]) => (h1 <= a || h0 >= b) ? [[a, b]] : [[a, Math.min(b, h0)], [Math.max(a, h1), b]].filter(([c, d]) => d - c > 0.05));
    }
    return segs;
  };
  const lines = [];
  for (const k of Object.keys(H)) {
    const y = parseFloat(k);
    const holes = ops.filter(o => y > o.y + 0.01 && y < o.y + o.h - 0.01).map(o => [o.x, o.x + o.w]);
    for (const [a, b] of cut(merge(H[k]), holes)) lines.push([[a, y], [b, y]]);
  }
  for (const k of Object.keys(V)) {
    const x = parseFloat(k);
    const holes = ops.filter(o => x > o.x + 0.01 && x < o.x + o.w - 0.01).map(o => [o.y, o.y + o.h]);
    for (const [a, b] of cut(merge(V[k]), holes)) lines.push([[x, a], [x, b]]);
  }
  return lines.concat(slant);
}

// 一段面（x0～x1、高 fh）扣掉門窗後切成幾個長方形，給 Hatch 當外框（門窗裡面不填）
function hatchRects(x0, x1, fh, ops) {
  const xs = [x0, x1];
  for (const o of ops) for (const v of [o.x, o.x + o.w]) if (v > x0 + EPS && v < x1 - EPS) xs.push(v);
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a <= EPS) continue;
    const holes = ops.filter(o => o.x < b - EPS && o.x + o.w > a + EPS).map(o => [Math.max(0, o.y), Math.min(fh, o.y + o.h)]).sort((p, q) => p[0] - q[0]);
    let y = 0;
    for (const [h0, h1] of holes) { if (h0 - y > EPS) out.push([[a, y], [b, y], [b, h0], [a, h0]]); y = Math.max(y, h1); }
    if (fh - y > EPS) out.push([[a, y], [b, y], [b, fh], [a, fh]]);
  }
  return out;
}

// 每種磁磚的 Hatch：依分區切段（同 layout），段內扣掉門窗；地坪有外框時照外框裁
function dxfHatches(d, s, p, map, outline, hmap, layer) {
  const { fw, fh, cfg } = s;
  const ops = s.key === 'floor' ? [] : s.ops;
  const segs = (cfg.zones || []).length ? splitByZones(fw, cfg.zones) : [{ x0: 0, x1: fw, zone: null }];
  const fp = paramsFor(p, s.key); // 該面自己的磚尺寸（例如地坪 60×120、牆 120×120）
  for (const seg of segs) {
    const label = seg.zone ? matLabel(seg.zone.TL, seg.zone.TW, seg.zone.name) : matLabel(fp.TL, fp.TW);
    const st = HATCH_STYLES[hmap[label] || 0];
    const polys = outline
      ? [clipPolygonRect(outline, seg.x0, 0, seg.x1, fh)]
      : hatchRects(seg.x0, seg.x1, fh, ops);
    d.hatch(polys.map(q => q.map(pt => map(pt[0], pt[1]))), st.pat, layer, st.aci);
  }
}

// 「由此線開始放樣」：線頂往上 25 的 T 形標記＋兩端箭頭＋文字（色號 62）
function dxfStartMark(d, x, top, minX, maxX) {
  const ay = top + 25, lx = Math.max(minX, x - 50), rx = Math.min(maxX, x + 50);
  d.line([x, top], [x, ay], '0', 62);
  d.line([lx, ay], [rx, ay], '0', 62);
  if (lx < x - 4) d.solid([lx, ay], [lx + 7, ay + 2.7], [lx + 7, ay - 2.7], '標註', 62);
  if (rx > x + 4) d.solid([rx, ay], [rx - 7, ay + 2.7], [rx - 7, ay - 2.7], '標註', 62);
  const label = '由此線開始放樣';
  if (rx - x < 20) d.text([rx, ay + 4], DXF_TXT, label, 9, { color: 62, style: 'AEK' });
  else if (x - lx < 20) d.text([lx, ay + 4], DXF_TXT, label, 7, { color: 62, style: 'AEK' });
  else d.text([(lx + rx) / 2, ay + 4], DXF_TXT, label, 8, { color: 62, style: 'AEK' });
}

// 地坪左側的放樣起點：橫向引線＋直立雙箭頭＋直排文字
function dxfStartMarkV(d, y, rightX, minY, maxY) {
  const ax = rightX - 25, ty = Math.min(maxY, y + 50), by = Math.max(minY, y - 50);
  d.line([rightX, y], [ax, y], '0', 62);
  d.line([ax, by], [ax, ty], '0', 62);
  if (ty > y + 4) d.solid([ax, ty], [ax - 2.7, ty - 7], [ax + 2.7, ty - 7], '標註', 62);
  if (by < y - 4) d.solid([ax, by], [ax - 2.7, by + 7], [ax + 2.7, by + 7], '標註', 62);
  d.text([ax - 4, (ty + by) / 2], DXF_TXT, '由此線開始放樣', 8, { color: 62, style: 'AEK', rot: 90 });
}

// 尺寸鏈：pts 為沿線座標；水平鏈在 y＝at，垂直鏈在 x＝at
function dxfChain(d, pts, at, vertical, map) {
  for (let i = 0; i + 1 < pts.length; i++) {
    if (vertical) d.dim(map(0, pts[i]), map(0, pts[i + 1]), [at, 0], true);
    else d.dim(map(pts[i], 0), map(pts[i + 1], 0), [0, at], false);
  }
}

// 立面索引符號（同施工圖 A/B/C/D 圖塊：圓圈＋黑三角帽＋字母）
function dxfIndexSymbol(d, cx, cy, key) {
  const r = 15, bw = 22.4, apex = 26.9;
  d.circle([cx, cy], r, '0', 7);
  d.line([cx - bw, cy], [cx, cy + apex], '0', 7);
  d.line([cx + bw, cy], [cx, cy + apex], '0', 7);
  d.line([cx - bw, cy], [cx - r, cy], '0', 7);
  d.line([cx + bw, cy], [cx + r, cy], '0', 7);
  // 三角形扣掉上半圓的部分塗黑
  d.fill([[cx + bw, cy], [cx, cy + apex], [cx - bw, cy], [cx - r, cy, -1], [cx + r, cy]], '0', 7);
  d.text([cx, cy], 18, key, 5, { color: 7 });
}

// 地坪中央視角符號：圓心＋四向三角＋ABCD
function dxfCompass(d, cx, cy) {
  const dirs = [['B', 0, 1], ['D', 0, -1], ['A', -1, 0], ['C', 1, 0]];
  d.circle([cx, cy], 10, '0', 7);
  for (const [k, dx, dy] of dirs) {
    d.solid([cx + dx * 26, cy + dy * 26], [cx + dx * 11 - dy * 10, cy + dy * 11 - dx * 10], [cx + dx * 11 + dy * 10, cy + dy * 11 + dx * 10], '0', 7);
    d.text([cx + dx * 36, cy + dy * 36], 12, k, 5, { color: 7 });
  }
}

// 匯入的設備線稿、文字與引線備註（照原施工圖位置與色號）；map＝面座標 → 圖面座標
function dxfOverlay(d, ov, map) {
  if (!ov) return;
  for (const pl of ov.polys) d.poly(pl.pts.map(p => map(p[0], p[1])), false, '0', pl.c);
  for (const t of ov.texts) d.text(map(t.x, t.y), Math.max(1, t.h), t.text, t.top ? 1 : 7, { color: t.c });
  for (const no of ov.notes) {
    for (const l of no.leaders) {
      const pts = l.map(p => map(p[0], p[1]));
      d.poly(pts, false, '0', no.c);
      if (pts.length >= 2) {
        const [a, b] = pts, ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
        const side = s => [a[0] - 6 * Math.cos(ang + s), a[1] - 6 * Math.sin(ang + s)];
        d.solid(a, side(0.3), side(-0.3), '0', no.c);
      }
    }
    d.text(map(no.x, no.y), no.h || DXF_TXT, no.text, 1, { color: no.c });
  }
}

// 自動材料引線（沒有匯入的引線備註時才加）：每種磚挑一塊整磚，引線拉到右上方寫規格
// away：要避開的點（地坪中央的視角符號），挑離它最遠的整磚
function dxfMaterialLabels(d, r, fw, fh, map, ops, away) {
  for (const g of r.groups) {
    const cand = r.tiles.filter(q => q.gkey === g.key && q.full);
    const dist = q => away ? Math.hypot(q.x0 + q.wL / 2 - away[0], q.y0 + q.wW / 2 - away[1]) : 0;
    const t = cand.sort((a, b) => dist(b) - dist(a))[0] || r.tiles.find(q => q.gkey === g.key);
    if (!t) continue;
    const v = visiblePart(t, ops);
    const m = matOf(g.TL, g.TW, g.name);
    const label = m && m.spec ? m.spec : `${fmtDim(Math.min(g.TL, g.TW))}*${fmtDim(Math.max(g.TL, g.TW))}${g.name ? ' ' + g.name : ''}`;
    const w = dxfTextW(label, DXF_TXT);
    const toLeft = v.cx + 20 + w > fw;
    // 引線往圖面上方拉：立面 y 往上、地坪 y 往下（由 B 牆量），方向相反
    const up = away ? -20 : 20;
    const ex = toLeft ? v.cx - 20 : v.cx + 20, ey = Math.max(4, Math.min(fh - 4, v.cy + up));
    const a = map(v.cx, v.cy), b = map(ex, ey);
    d.line(a, b, '0');
    const ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
    const side = s => [a[0] - 6 * Math.cos(ang + s), a[1] - 6 * Math.sin(ang + s)];
    d.solid(a, side(0.3), side(-0.3), '0');
    d.text(b, DXF_TXT, label, toLeft ? 9 : 7);
  }
}

// 一面（立面或地坪）：外框、磚縫、門窗、設備、紅線、小料、材料
// map(x, y)：面座標 → 圖面座標；ops 為此面門窗（立面座標）
function dxfFace(d, s, p, map, outline, hmap) {
  const { fw, fh, cfg, r } = s;
  const ops = s.key === 'floor' ? [] : s.ops;
  // 壁磚、地磚分開圖層；Hatch 在各自的 -HATCH 層
  const layer = s.key === 'floor' ? '地磚' : '壁磚';
  const ol = outline || [[0, 0], [fw, 0], [fw, fh], [0, fh]];
  d.poly(ol.map(q => map(q[0], q[1])), true, '0');
  if (cfg.skip) {
    d.text(map(fw / 2, fh / 2), DXF_TXT, '不鋪磚', 5);
    return;
  }
  dxfHatches(d, s, p, map, outline, hmap, layer + '-HATCH');
  for (const [a, b] of jointLines(r.tiles, fw, fh, p.joint, ops, outline)) d.line(map(a[0], a[1]), map(b[0], b[1]), layer);
  for (const o of ops) d.poly([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(q => map(q[0], q[1])), true, '0', 4);
  const ov = faceOverlays[s.key];
  dxfOverlay(d, ov, map);
  // 紅線：施工圖紅線＋起磚線（跟紅線重疊就不重畫）
  const reds = (cfg.marks || []).filter(m => m > 0.5 && m < fw - 0.5);
  if (r.xBase > 0.5 && r.xBase < fw - 0.5 && !reds.some(m => Math.abs(m - r.xBase) < 0.5)) reds.push(r.xBase);
  for (const m of reds) d.line(map(m, 0), map(m, fh), '0', 1);
  if (r.yBase > 0.5 && r.yBase < fh - 0.5) d.line(map(0, r.yBase), map(fw, r.yBase), '0', 1);
  if (r.col && r.col.on) {
    const cx = r.col.colX !== undefined ? r.col.colX : r.col.x;
    if (cx > 0 && cx < fw) d.line(map(cx, 0), map(cx, fh), '0', 1);
  }
  // 小料：同一橫排／直排只圈一次（圈在中間那塊），第一個加「避免小料」
  let labeled = false;
  for (const v of sliverMarks(r.tiles, ops)) {
    const c = map(v.cx, v.cy);
    d.circle(c, 6, layer, 1);
    if (labeled) continue;
    labeled = true;
    const toLeft = v.cx + 6 + 12 + dxfTextW('避免小料', DXF_TXT) > fw;
    const e = map(toLeft ? v.cx - 18 : v.cx + 18, v.cy);
    d.line(map(toLeft ? v.cx - 6 : v.cx + 6, v.cy), e, layer, 1);
    d.text(e, DXF_TXT, '避免小料', toLeft ? 6 : 4, { layer, color: 1 });
  }
  // L 型切割：紅圈圈在包住的門窗轉角，第一個加「避免L型」
  r.tiles.filter(t => t.lcut).forEach((t, i) => {
    const c = map(t.lc[0], t.lc[1]);
    d.circle(c, 6, layer, 1);
    if (i) return;
    const toLeft = t.lc[0] + 18 + dxfTextW('避免L型', DXF_TXT) > fw;
    const e = map(toLeft ? t.lc[0] - 18 : t.lc[0] + 18, t.lc[1] + (s.key === 'floor' ? -10 : 10));
    d.line(map(toLeft ? t.lc[0] - 6 : t.lc[0] + 6, t.lc[1]), e, layer, 1);
    d.text(e, DXF_TXT, '避免L型', toLeft ? 9 : 7, { layer, color: 1 });
  });
  if (!ov || !ov.notes.length) dxfMaterialLabels(d, r, fw, fh, map, ops, s.key === 'floor' ? [fw / 2, fh / 2] : null);
}

// 整張圖：四面立面＋地坪平面
function buildDxf(p, rows) {
  const d = dxfDoc();
  const byKey = {}; rows.forEach(s => byKey[s.key] = s);
  const dims = faceDims(p);
  const allOps = openings(dims);
  const hmap = hatchIndexMap(rows);
  const order = ['A', 'B', 'C', 'D'];
  const pos = {};
  let x = 0, prevH = null;
  for (const k of order) {
    const s = byKey[k];
    const ox = x;
    pos[k] = ox;
    const map = (fx, fy) => [ox + fx, fy];
    dxfFace(d, s, p, map, null, hmap);
    // 照施工圖：牆高只標在第一面左側（之後牆高不同才再標）；門窗高、起磚高標在該面右側
    if (prevH === null || Math.abs(s.fh - prevH) > 0.5) dxfChain(d, [0, s.fh], ox - DXF_DIM_OFF, true, map);
    prevH = s.fh;
    if (!s.cfg.skip) {
      const ch = elevationChains(s.fw, s.fh, s.r, s.ops, chainMarks(s.cfg));
      dxfChain(d, ch.h, -DXF_DIM_OFF, false, map);
      const right = ch.v.filter(v => v < s.fh - 0.5);
      if (right.length > 1) dxfChain(d, right, ox + s.fw + 24, true, map);
      if (s.r.tiles.length || s.r.total) dxfStartMark(d, ox + Math.max(0, s.r.xBase), s.fh, ox - 10, ox + s.fw + 10);
    }
    dxfIndexSymbol(d, ox + s.fw / 2, -85, k);
    x += s.fw + DXF_GAP;
  }

  // 地坪：x 對齊 B 立面，平面 y 由 B 牆往下 → 圖面 y 往下減
  const fl = byKey.floor;
  const px = pos.B, top = -DXF_PLAN_GAP;
  const fmap = (fx, fy) => [px + fx, top - fy];
  dxfFace(d, fl, p, fmap, floorOutline, hmap);
  const ov = faceOverlays.floor;
  if (!ov) dxfPlanOpenings(d, fl.fw, fl.fh, allOps, dims, fmap);
  dxfCompass(d, px + fl.fw / 2, top - fl.fh / 2);
  if (!fl.cfg.skip) {
    const oe = ov ? dxfExtent(ov) : { x0: 0, y0: 0, x1: fl.fw, y1: fl.fh };
    const fch = floorChains(fl.fw, fl.fh, fl.r, allOps, chainMarks(fl.cfg), dims);
    dxfChain(d, fch.h, top - Math.max(fl.fh, oe.y1) - DXF_DIM_OFF, false, fmap);
    const leftX = px + Math.min(0, oe.x0) - DXF_DIM_OFF;
    dxfChain(d, fch.v, leftX, true, fmap);
    dxfStartMark(d, px + Math.max(0, fl.r.xBase), top - Math.min(0, oe.y0), px - 10, px + fl.fw + 10);
    dxfStartMarkV(d, top - Math.max(0, fl.r.yBase), leftX - 20, top - fl.fh - 10, top + 10);
  }
  dxfHatchLegend(d, hmap, px + fl.fw + 120, top);
  return d.toString();
}

// 圖例：每種磁磚一個 Hatch 小方塊＋材料名稱（有匯入材料時寫型號與規格）
function dxfHatchLegend(d, hmap, x, y) {
  const labels = Object.keys(hmap);
  if (!labels.length) return;
  d.text([x, y + 6], 12, '磁磚圖例', 7);
  labels.forEach((label, i) => {
    const st = HATCH_STYLES[hmap[label]];
    const y0 = y - 30 - i * 32;
    const box = [[x, y0], [x + 40, y0], [x + 40, y0 + 20], [x, y0 + 20]];
    d.hatch([box], st.pat, '0', st.aci);
    d.poly(box, true, '0');
    const sz = label.match(/([\d.]+)×([\d.]+)/);
    const m = sz ? matOf(parseFloat(sz[1]), parseFloat(sz[2]), label.replace(/\s*[\d.]+×[\d.]+$/, '').trim()) : null;
    d.text([x + 50, y0 + 10], DXF_TXT, m ? `${label}　${m.code || ''} ${m.spec || ''}`.trim() : label, 4);
  });
}

// 匯入線稿的範圍（地坪座標，含面本身），尺寸鏈要讓到牆線外面
function dxfExtent(ov) {
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  for (const pl of ov.polys) for (const q of pl.pts) {
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
  }
  return { x0, y0, x1, y1 };
}

// 沒有匯入平面線稿時，平面上的門（門片＋開門弧線）與窗（雙線），色號 4
function dxfPlanOpenings(d, fw, fh, allOps, dims, map) {
  const C = 4;
  for (const o of allOps.B || []) {
    if (o.kind === 'door') { d.line(map(o.x, 0), map(o.x, o.w), '0', C); d.arc(map(o.x, 0), o.w, 270, 360, '0', C); }
    else d.poly([map(o.x, -5), map(o.x + o.w, -5), map(o.x + o.w, 5), map(o.x, 5)], true, '0', C);
  }
  for (const o of allOps.D || []) {
    const s = planPos('D', o.x, o.w, dims);
    if (o.kind === 'door') { d.line(map(s, fh), map(s, fh - o.w), '0', C); d.arc(map(s, fh), o.w, 0, 90, '0', C); }
    else d.poly([map(s, fh - 5), map(s + o.w, fh - 5), map(s + o.w, fh + 5), map(s, fh + 5)], true, '0', C);
  }
  for (const o of allOps.A || []) {
    const s = planPos('A', o.x, o.w, dims);
    if (o.kind === 'door') { d.line(map(0, s), map(o.w, s), '0', C); d.arc(map(0, s), o.w, 270, 360, '0', C); }
    else d.poly([map(-5, s), map(5, s), map(5, s + o.w), map(-5, s + o.w)], true, '0', C);
  }
  for (const o of allOps.C || []) {
    if (o.kind === 'door') { d.line(map(fw, o.x), map(fw - o.w, o.x), '0', C); d.arc(map(fw, o.x), o.w, 180, 270, '0', C); }
    else d.poly([map(fw - 5, o.x), map(fw + 5, o.x), map(fw + 5, o.x + o.w), map(fw - 5, o.x + o.w)], true, '0', C);
  }
}

function exportDxf() {
  const p = params();
  const text = buildDxf(p, computeAll(p));
  const blob = new Blob([text], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tile-setting-out.dxf'; // 中文檔名部分瀏覽器會變成 download
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initDxfExport() {
  if ($('btnExportDxf')) $('btnExportDxf').addEventListener('click', exportDxf);
}
