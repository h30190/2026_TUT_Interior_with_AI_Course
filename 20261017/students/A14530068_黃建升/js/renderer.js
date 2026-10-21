// Canvas 施工圖排磚放樣繪圖引擎（支援加大圖面、起磚點座標標註、結構柱紅線與分區放樣）

// 全域互動目標暫存表
const interactiveTargets = [];
let hoveredTarget = null;
let activeDrag = null; // { type, faceKey, ... }
let hoveredTile = null;
let currentSnap = null; // { type, axis, val, label, px, py }

function clearInteractiveTargets() {
  interactiveTargets.length = 0;
  currentSnap = null;
}

// 支援高解析度（Retina 2x）與加大圖面尺寸
function setupHiDPICanvas(cv) {
  // 匯出 PDF／圖片時暫時用更高解析度（window.__exportDpr）
  const dpr = window.__exportDpr || Math.max(window.devicePixelRatio || 1, 2);
  const cssW = CANVAS_W, cssH = CANVAS_H;
  if (cv.width !== cssW * dpr || cv.height !== cssH * dpr) {
    cv.width = cssW * dpr;
    cv.height = cssH * dpr;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return { ctx, dpr, width: cssW, height: cssH };
}

// 繪製磁磚網格
function drawTiles(ctx, ox, oy, fw, fh, sc, tiles, faceName, isElevation) {
  for (const t of tiles) {
    const rx = Math.max(t.x0, 0);
    const px = ox + rx * sc;
    const py = isElevation
      ? oy + (fh - (Math.max(t.y0, 0) + t.wW)) * sc
      : oy + Math.max(t.y0, 0) * sc;
    const pw = t.wL * sc, ph = t.wW * sc;

    // 被地坪外框（斜牆、缺角）切到的磚畫實際形狀，其餘畫矩形
    ctx.beginPath();
    if (t.poly) {
      t.poly.forEach((q, i) => {
        const x = ox + q[0] * sc, y = isElevation ? oy + (fh - q[1]) * sc : oy + q[1] * sc;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
    } else {
      ctx.rect(px, py, pw, ph);
    }
    if (drawStyle === 'line') {
      // 線稿：只畫磚縫，小料淡紅底提醒
      ctx.fillStyle = t.avoid ? 'rgba(224, 69, 69, 0.30)' : (t.danger ? 'rgba(224, 69, 69, 0.12)' : '#ffffff');
      ctx.strokeStyle = '#8c8c8c';
      ctx.lineWidth = 0.7;
    } else {
      // 分區磚（例如主秀壁）整磚改用淡藍，一眼分得出兩種材料
      ctx.fillStyle = t.avoid ? '#d62f2f' : t.danger ? '#f08a7a' : (t.full ? (t.zone ? '#dfe9f2' : '#efe9df') : '#f2b48c');
      ctx.strokeStyle = '#d8d2c6';
      ctx.lineWidth = 0.6;
    }
    ctx.fill();
    ctx.stroke();

    interactiveTargets.push({
      type: 'tile',
      box: [px, py, pw, ph],
      tile: t,
      faceName: faceName
    });
  }
}

// AutoCAD 色號 → 畫面顏色（1–9 標準色；10–249 依色相輪；7 白在白底畫成黑）
function aciColor(aci) {
  const base = { 1: '#e02020', 2: '#c8a400', 3: '#1f9d3a', 4: '#13a8c4', 5: '#2347d6', 6: '#d020c8', 7: '#222222', 8: '#7f7f7f', 9: '#b0b0b0' };
  if (base[aci]) return base[aci];
  if (aci >= 250 && aci <= 255) return ['#333', '#505050', '#696969', '#828282', '#bebebe', '#d0d0d0'][aci - 250];
  if (aci < 10 || aci > 249) return '#444444';
  const hue = Math.floor((aci - 10) / 10) * 15, k = aci % 10;
  const val = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][k], sat = k % 2 ? 0.5 : 1;
  const light = val * (1 - sat / 2), s2 = light === 0 || light === 1 ? 0 : (val - light) / Math.min(light, 1 - light);
  return `hsl(${hue}, ${Math.round(s2 * 100)}%, ${Math.round(light * 100 * 0.9)}%)`;
}

// 匯入的設備線稿、文字與備註（照原施工圖的位置與顏色）；備註文字超出面框時往內推
function drawOverlay(ctx, ox, oy, fw, fh, sc, ov, isElevation) {
  if (!ov) return;
  const P = p => [ox + p[0] * sc, isElevation ? oy + (fh - p[1]) * sc : oy + p[1] * sc];
  ctx.save();
  ctx.lineWidth = 0.8; ctx.lineJoin = 'round';
  for (const pl of ov.polys) {
    ctx.strokeStyle = aciColor(pl.c);
    ctx.beginPath();
    pl.pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.textAlign = 'left';
  for (const t of ov.texts) {
    const size = Math.max(7, t.h * sc);
    ctx.font = `${size}px sans-serif`; ctx.fillStyle = aciColor(t.c);
    const [x, y] = P([t.x, t.y]);
    t.text.split('\n').forEach((ln, i) => ctx.fillText(ln, x, (t.top ? y + size : y) + i * size * 1.2));
  }
  for (const n of ov.notes) {
    const col = aciColor(n.c);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    for (const l of n.leaders) {
      ctx.beginPath();
      l.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      const [ax, ay] = P(l[0]), [bx, by] = P(l[1]);
      const ang = Math.atan2(ay - by, ax - bx);
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 7 * Math.cos(ang - 0.35), ay - 7 * Math.sin(ang - 0.35));
      ctx.lineTo(ax - 7 * Math.cos(ang + 0.35), ay - 7 * Math.sin(ang + 0.35));
      ctx.closePath(); ctx.fill();
    }
    const size = Math.max(10, Math.min(13, n.h * sc));
    ctx.font = `bold ${size}px sans-serif`;
    const lines = n.text.split('\n');
    const w = Math.max(...lines.map(s => ctx.measureText(s).width));
    let [x, y] = P([n.x, n.y]);
    x = Math.max(ox + 2, Math.min(ox + fw * sc - w - 2, x));
    y = Math.max(oy + 2, Math.min(oy + fh * sc - lines.length * size * 1.25 - 2, y));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fillRect(x - 2, y - 1, w + 4, lines.length * size * 1.25 + 2);
    ctx.fillStyle = col;
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + size + i * size * 1.25 - 2));
  }
  ctx.restore();
}

// 正統建築立面門窗樣式（雙線門樘、窗框、接地）
function drawElevationOpenings(ctx, ox, oy, fw, fh, sc, ops, faceKey) {
  for (const o of ops) {
    const px = ox + o.x * sc;
    const py = oy + (fh - (o.y + o.h)) * sc;
    const pw = o.w * sc, ph = o.h * sc;
    const isDrag = (activeDrag && activeDrag.type === o.kind && activeDrag.faceKey === faceKey);

    if (drawStyle === 'line') {
      // 線稿：門窗只畫青色外框與內框（同施工圖）
      const thk = Math.max(3, 4.5 * sc);
      ctx.save();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = isDrag ? '#d22' : '#18a7c9'; ctx.lineWidth = isDrag ? 2 : 1.4;
      ctx.strokeRect(px, py, pw, ph);
      ctx.lineWidth = 0.9;
      if (o.kind === 'door') ctx.strokeRect(px + thk, py + thk, pw - thk * 2, ph - thk);
      else ctx.strokeRect(px + thk, py + thk, pw - thk * 2, ph - thk * 2);
      if (pw > 36) {
        ctx.fillStyle = '#0f7f99'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${o.kind === 'door' ? '門' : '窗'} ${o.w}×${o.h}`, px + pw / 2, py + ph / 2);
      }
      ctx.restore();
      interactiveTargets.push({
        type: o.kind, faceKey: faceKey, op: o,
        box: [px, py, pw, ph], ox, oy, fw, fh, sc
      });
      continue;
    }

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px, py, pw, ph);

    if (o.kind === 'door') {
      const frameThk = Math.max(3, 4.5 * sc);
      ctx.fillStyle = '#f0efe9';
      ctx.fillRect(px, py, pw, ph);

      ctx.strokeStyle = isDrag ? '#d22' : '#333333';
      ctx.lineWidth = isDrag ? 2 : 1.4;
      ctx.strokeRect(px, py, pw, ph);

      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + frameThk, py + frameThk, pw - frameThk * 2, ph - frameThk);

      const handleY = py + ph - 95 * sc;
      ctx.beginPath();
      ctx.moveTo(px + frameThk, handleY);
      ctx.lineTo(px + pw - frameThk, handleY);
      ctx.stroke();

      ctx.fillStyle = '#222222';
      const handleSide = (o.x < fw / 2) ? px + pw - frameThk - 8 : px + frameThk + 4;
      ctx.fillRect(handleSide, handleY - 3, 6, 6);

      if (pw > 36) {
        ctx.fillStyle = '#222222'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`門 ${o.w}×${o.h}`, px + pw / 2, py + ph / 2);
        ctx.font = '10px sans-serif'; ctx.fillStyle = '#666666';
        ctx.fillText('FL+0', px + pw / 2, py + ph - 8);
      }
    } else {
      const frameThk = Math.max(3, 4 * sc);
      ctx.fillStyle = '#eef4f8';
      ctx.fillRect(px, py, pw, ph);

      ctx.strokeStyle = isDrag ? '#d22' : '#2b5a8c';
      ctx.lineWidth = isDrag ? 2 : 1.4;
      ctx.strokeRect(px, py, pw, ph);

      ctx.strokeStyle = '#4a7ea8';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + frameThk, py + frameThk, pw - frameThk * 2, ph - frameThk * 2);

      ctx.beginPath();
      ctx.moveTo(px + pw / 2, py + frameThk); ctx.lineTo(px + pw / 2, py + ph - frameThk);
      ctx.stroke();

      if (pw > 36) {
        ctx.fillStyle = '#1c4a75'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`窗 ${o.w}×${o.h}`, px + pw / 2, py + ph / 2);
        ctx.font = '10px sans-serif'; ctx.fillStyle = '#4a7ea8';
        ctx.fillText(`台高 ${o.y}`, px + pw / 2, py + ph - 6);
      }
    }
    ctx.restore();

    interactiveTargets.push({
      type: o.kind, faceKey: faceKey, op: o,
      box: [px, py, pw, ph], ox, oy, fw, fh, sc
    });
  }
}

// 紅色放樣基準線 ＋ 🎯 起磚十字靶 ＋ 起磚點明確標註 ＋ CAD 鎖點
function drawSettingOut(ctx, ox, oy, fw, fh, sc, r, faceKey, isElevation, detail, ops) {
  const xPx = ox + Math.max(0, r.xBase) * sc;
  const yPx = isElevation
    ? oy + (fh - Math.max(0, r.yBase)) * sc
    : oy + Math.max(0, r.yBase) * sc;

  ctx.save();
  // 紅色放樣基準線
  ctx.strokeStyle = '#d22';
  ctx.lineWidth = (activeDrag && activeDrag.faceKey === faceKey) ? 2.2 : 1.4;
  ctx.beginPath(); ctx.moveTo(xPx, oy); ctx.lineTo(xPx, oy + fh * sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, yPx); ctx.lineTo(ox + fw * sc, yPx); ctx.stroke();

  // 🎯 起磚十字靶心（線稿只留小紅點，仍可拖曳）
  const isTargetActive = activeDrag && activeDrag.type === 'origin' && activeDrag.faceKey === faceKey;
  const lineStyle = drawStyle === 'line';
  ctx.fillStyle = isTargetActive ? '#ff3838' : '#d22';
  ctx.beginPath(); ctx.arc(xPx, yPx, lineStyle ? 4 : 7, 0, Math.PI * 2); ctx.fill();
  if (!lineStyle) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(xPx, yPx, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // 📍 起磚點明確標註 (CAD 座標標籤；線稿改由尺寸鏈表達)
  const xVal = Math.round(r.xBase * 10) / 10;
  const yVal = Math.round(r.yBase * 10) / 10;
  const tagText = `⌖ 起磚點 (X:${xVal}, Y:${yVal})`;
  ctx.font = 'bold 10px sans-serif';
  const tagW = ctx.measureText(tagText).width + 10;
  const tagX = (xPx + tagW + 10 < ox + fw * sc) ? xPx + 8 : xPx - tagW - 8;
  // 不壓到面頂的面別標題列
  const tagY = Math.max(oy + 34, (yPx - 16 > oy) ? yPx - 10 : yPx + 16);
  if (!lineStyle) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(tagX, tagY - 10, tagW, 14);
    ctx.strokeStyle = '#d22'; ctx.lineWidth = 1;
    ctx.strokeRect(tagX, tagY - 10, tagW, 14);
    ctx.fillStyle = '#b22'; ctx.textAlign = 'left';
    ctx.fillText(tagText, tagX + 5, tagY + 1);
  }
  // （距左 X 改由面外的分段尺寸鏈標示）

  // 註冊互動目標
  interactiveTargets.push({
    type: 'origin', faceKey, xPx, yPx, ox, oy, fw, fh, sc, isElevation, radius: 12
  });
  interactiveTargets.push({
    type: 'settingOutX', faceKey, xPx, ox, oy, fw, fh, sc, isElevation,
    box: [xPx - 5, oy, 10, fh * sc]
  });
  interactiveTargets.push({
    type: 'settingOutY', faceKey, yPx, ox, oy, fw, fh, sc, isElevation,
    box: [ox, yPx - 5, fw * sc, 10]
  });

  // 最短邊 < 避免小料門檻（預設 5cm）的磚才畫紅圈標「避免小料」（文字留在面內，不會被畫布邊緣切掉）
  if (r.avoid > 0) {
    let t = null;
    for (const q of r.tiles) { if (q.avoid) { t = q; break; } }
    if (t) {
      const vis = visiblePart(t, ops || []);
      const cx = ox + vis.cx * sc;
      const cy = isElevation ? oy + (fh - vis.cy) * sc : oy + vis.cy * sc;
      const rad = Math.max(6, Math.min(14, vis.minDim * sc / 2 + 3));
      ctx.strokeStyle = '#d22'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
      const label = '避免小料';
      ctx.font = 'bold 11px sans-serif';
      const lw = ctx.measureText(label).width;
      const toLeft = cx + rad + 6 + lw > ox + fw * sc;
      const lx = toLeft ? cx - rad - 6 - lw : cx + rad + 6;
      const ly = Math.max(oy + 34, Math.min(oy + fh * sc - 6, cy + 4));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(lx - 2, ly - 11, lw + 4, 14);
      ctx.fillStyle = '#d22'; ctx.textAlign = 'left';
      ctx.fillText(label, lx, ly);
    }
  }
  ctx.restore();
}

// 繪製單個立面或地坪盒子（含結構柱紅線與分區起磚）
function drawFaceBox(ctx, ox, oy, fw, fh, sc, name, p, cfg, r, ops, opts) {
  opts = opts || {};
  const isElevation = opts.faceKey !== 'floor';
  ctx.fillStyle = '#fff'; ctx.fillRect(ox, oy, fw * sc, fh * sc);

  drawTiles(ctx, ox, oy, fw, fh, sc, r.tiles, name, isElevation);
  if (cfg.skip) {
    // 不鋪磚：灰色斜線網底＋字
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, fw * sc, fh * sc); ctx.clip();
    ctx.strokeStyle = '#d6d2ca'; ctx.lineWidth = 1;
    for (let d = -fh * sc; d < fw * sc; d += 12) { ctx.beginPath(); ctx.moveTo(ox + d, oy + fh * sc); ctx.lineTo(ox + d + fh * sc, oy); ctx.stroke(); }
    ctx.fillStyle = '#8a857c'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('不鋪磚', ox + fw * sc / 2, oy + fh * sc / 2);
    ctx.restore();
  }
  if (ops && ops.length) {
    drawElevationOpenings(ctx, ox, oy, fw, fh, sc, ops, opts.faceKey || 'A');
  }

  // 地坪實際外框（L 形）：缺角留白，外框描粗線（有匯入牆線時牆線已經畫了）
  if (opts.faceKey === 'floor' && floorOutline && !faceOverlays.floor) {
    ctx.save();
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    floorOutline.forEach((p, i) => { const x = ox + p[0] * sc, y = oy + p[1] * sc; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  // 匯入的設備（馬桶、臉盆…）與備註，畫在磁磚上、紅線下
  drawOverlay(ctx, ox, oy, fw, fh, sc, faceOverlays[opts.faceKey], isElevation);

  // 施工圖紅線（分界、門框、對縫基準）：整面高度的紅色實線
  if (cfg.marks && cfg.marks.length) {
    ctx.save();
    ctx.strokeStyle = '#d22'; ctx.lineWidth = 1.2;
    for (const m of cfg.marks) {
      if (m <= 0 || m >= fw) continue;
      ctx.beginPath(); ctx.moveTo(ox + m * sc, oy); ctx.lineTo(ox + m * sc, oy + fh * sc); ctx.stroke();
    }
    ctx.restore();
  }

  // 繪製放樣基準線與起磚點
  if (!cfg.skip) drawSettingOut(ctx, ox, oy, fw, fh, sc, r, opts.faceKey || 'A', isElevation, !!opts.detail, ops);

  // 🏛️ 結構柱分界紅線繪製（支援主面與相鄰角隅立面雙面呈現！）
  if (r.col && r.col.on) {
    const colInfo = r.col;
    const x0 = (colInfo.x0 !== undefined) ? colInfo.x0 : colInfo.x;
    const x1 = (colInfo.x1 !== undefined) ? colInfo.x1 : (colInfo.x + (colInfo.w || 50));
    const colLineX = (colInfo.colX !== undefined) ? colInfo.colX : colInfo.x;
    const colPx = ox + colLineX * sc;

    ctx.save();
    // 柱體陰影網底 (柱身範圍)
    const colBoxX = ox + Math.min(x0, x1) * sc;
    const colBoxW = Math.abs(x1 - x0) * sc;
    if (colBoxW > 2) {
      ctx.fillStyle = 'rgba(45, 45, 45, 0.08)';
      ctx.fillRect(colBoxX, oy, colBoxW, fh * sc);
      ctx.strokeStyle = 'rgba(45, 45, 45, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(colBoxX, oy, colBoxW, fh * sc);
    }

    // 粗紅虛線標示結構柱放樣線
    ctx.strokeStyle = '#e02424';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(colPx, oy); ctx.lineTo(colPx, oy + fh * sc); ctx.stroke();
    ctx.setLineDash([]);

    // 柱頂部標籤
    const colTag = colInfo.label || `🏛️ 柱線 X=${colLineX}cm`;
    ctx.font = 'bold 9.5px sans-serif';
    const cW = ctx.measureText(colTag).width + 10;
    ctx.fillStyle = '#e02424';
    const tagX = Math.max(ox + cW / 2, Math.min(ox + fw * sc - cW / 2, colPx));
    ctx.fillRect(tagX - cW / 2, oy + 2, cW, 15);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(colTag, tagX, oy + 13);

    // 註冊柱線為可拖曳目標（主面與相鄰面皆支援）
    interactiveTargets.push({
      type: 'columnLine', faceKey: opts.faceKey, colX: colLineX,
      ox, oy, fw, fh, sc, box: [colPx - 8, oy, 16, fh * sc]
    });

    // ⚠️ 柱子與開口（門/窗）碰撞衝突高亮警示
    if (ops && ops.length) {
      for (const o of ops) {
        const overMin = Math.max(x0, o.x);
        const overMax = Math.min(x1, o.x + o.w);
        if (overMin < overMax - 0.1) {
          const overW = Math.round((overMax - overMin) * 10) / 10;
          const overPx = ox + overMin * sc;
          const overPw = (overMax - overMin) * sc;

          // 亮紅半透明衝突遮罩
          ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
          ctx.fillRect(overPx, oy, overPw, fh * sc);

          // 衝突紅框
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(overPx, oy, overPw, fh * sc);
          ctx.setLineDash([]);

          // 衝突警告標籤
          const alertTxt = `⚠️ 柱${o.kind === 'door' ? '門' : '窗'}衝突！重疊 ${overW}cm`;
          ctx.font = 'bold 10px sans-serif';
          const aW = ctx.measureText(alertTxt).width + 12;
          const aX = Math.max(ox + 4, Math.min(ox + fw * sc - aW - 4, overPx + overPw / 2 - aW / 2));
          const aY = oy + fh * sc / 2;
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(aX, aY - 11, aW, 22);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
          ctx.strokeRect(aX, aY - 11, aW, 22);
          ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
          ctx.fillText(alertTxt, aX + aW / 2, aY + 4);
        }
      }
    }

    // 若為「左右獨立起磚」模式，繪製柱右側第 2 起磚點
    if (colInfo.mode === 'independent' && r.xBase2 !== undefined) {
      const xPx2 = ox + r.xBase2 * sc;
      const yPx = isElevation
        ? oy + (fh - Math.max(0, r.yBase)) * sc
        : oy + Math.max(0, r.yBase) * sc;

      ctx.strokeStyle = '#8e24aa'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(xPx2, oy); ctx.lineTo(xPx2, oy + fh * sc); ctx.stroke();

      ctx.fillStyle = '#8e24aa';
      ctx.beginPath(); ctx.arc(xPx2, yPx, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();

      const x2Val = Math.round((colInfo.xoffRight || 0) * 10) / 10;
      const tag2 = `⌖ 柱右起磚 (X2:${x2Val})`;
      ctx.font = 'bold 9.5px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const t2W = ctx.measureText(tag2).width + 8;
      ctx.fillRect(xPx2 + 6, yPx - 18, t2W, 14);
      ctx.strokeStyle = '#8e24aa'; ctx.lineWidth = 1;
      ctx.strokeRect(xPx2 + 6, yPx - 18, t2W, 14);
      ctx.fillStyle = '#8e24aa'; ctx.textAlign = 'left';
      ctx.fillText(tag2, xPx2 + 10, yPx - 7);

      interactiveTargets.push({
        type: 'origin2', faceKey: opts.faceKey,
        xPx: xPx2, yPx, ox, oy, fw, fh, sc, radius: 10
      });
    }
    ctx.restore();
  }

  // 外牆線（粗黑線）
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.6; ctx.strokeRect(ox, oy, fw * sc, fh * sc);

  // 頂部面別資訊標籤（線稿不寫，面別看下方索引符號）
  if (drawStyle === 'line') return;
  ctx.fillStyle = '#2b2b2b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
  const dirTxt = cfg.dir === 'H' ? '橫貼' : '直貼';
  const xTxt = XALIGN_NAMES[cfg.xalign] || '靠左';
  const yTxt = YALIGN_NAMES[cfg.yalign] || '由地起';
  // 面寬不夠時只寫面別與尺寸，避免標題超出框外
  const fullTitle = `${name} ${fw}×${fh}｜${dirTxt}·${MODE_NAMES[cfg.mode]}·X:${xTxt}·Y:${yTxt}`;
  const title = ctx.measureText(fullTitle).width < fw * sc - 8 ? fullTitle : `${name} ${fw}×${fh}`;
  ctx.fillText(title, ox + 4, oy + 15);
}

function fmtLen(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// 分段尺寸鏈：pts 為沿線 cm 座標（已排序）；(ax, ay) 為 0 點像素位置，(dx, dy) 為方向（水平 1,0／往上 0,-1／往下 0,1）
// 水平鏈文字寫在線上方，垂直鏈文字轉 90° 寫在線左側
function drawDimChain(ctx, ax, ay, dx, dy, sc, pts, color) {
  if (!pts || pts.length < 2) return;
  const P = v => [ax + dx * v * sc, ay + dy * v * sc];
  const vertical = dx === 0;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 0.8;
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  const [sx, sy] = P(pts[0]), [ex, ey] = P(pts[pts.length - 1]);
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  for (const v of pts) {
    const [x, y] = P(v);
    ctx.beginPath();
    if (vertical) { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); }
    else { ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); }
    ctx.moveTo(x - 3, y + 3); ctx.lineTo(x + 3, y - 3); // 建築尺寸斜線端點
    ctx.stroke();
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const len = pts[i + 1] - pts[i];
    if (len * sc < 16) continue; // 太短的段寫不下，只留端點
    const [mx, my] = P((pts[i] + pts[i + 1]) / 2);
    if (vertical) {
      ctx.save(); ctx.translate(mx - 4, my); ctx.rotate(-Math.PI / 2);
      ctx.fillText(fmtLen(len), 0, 0); ctx.restore();
    } else {
      ctx.fillText(fmtLen(len), mx, my - 4);
    }
  }
  ctx.restore();
}

const START_GREEN = '#7cb518';

// 「由此線開始放樣」：起磚線上方的綠色雙向箭頭（對照施工圖畫法）
function drawStartMarker(ctx, xPx, topY, minX, maxX) {
  const ay = topY - 12;
  const lx = Math.max(minX, xPx - 36), rx = Math.min(maxX, xPx + 36);
  ctx.save();
  ctx.strokeStyle = START_GREEN; ctx.fillStyle = START_GREEN; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(xPx, topY); ctx.lineTo(xPx, ay); ctx.moveTo(lx, ay); ctx.lineTo(rx, ay); ctx.stroke();
  if (lx < xPx - 4) { ctx.beginPath(); ctx.moveTo(lx, ay); ctx.lineTo(lx + 6, ay - 3.5); ctx.lineTo(lx + 6, ay + 3.5); ctx.closePath(); ctx.fill(); }
  if (rx > xPx + 4) { ctx.beginPath(); ctx.moveTo(rx, ay); ctx.lineTo(rx - 6, ay - 3.5); ctx.lineTo(rx - 6, ay + 3.5); ctx.closePath(); ctx.fill(); }
  // 起磚線貼在面的邊緣時，文字往面內對齊，才不會跟隔壁面的標示疊在一起
  ctx.font = '11px sans-serif';
  if (rx - xPx < 20) { ctx.textAlign = 'right'; ctx.fillText('由此線開始放樣', rx, ay - 4); }
  else if (xPx - lx < 20) { ctx.textAlign = 'left'; ctx.fillText('由此線開始放樣', lx, ay - 4); }
  else { ctx.textAlign = 'center'; ctx.fillText('由此線開始放樣', (lx + rx) / 2, ay - 4); }
  ctx.restore();
}

// 垂直方向的放樣起點（地坪左側）：橫向引線＋上下雙向箭頭＋直排文字
function drawStartMarkerV(ctx, yPx, rightX, minY, maxY) {
  const ax = rightX - 12;
  const ty = Math.max(minY, yPx - 36), by = Math.min(maxY, yPx + 36);
  ctx.save();
  ctx.strokeStyle = START_GREEN; ctx.fillStyle = START_GREEN; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(rightX, yPx); ctx.lineTo(ax, yPx); ctx.moveTo(ax, ty); ctx.lineTo(ax, by); ctx.stroke();
  if (ty < yPx - 4) { ctx.beginPath(); ctx.moveTo(ax, ty); ctx.lineTo(ax - 3.5, ty + 6); ctx.lineTo(ax + 3.5, ty + 6); ctx.closePath(); ctx.fill(); }
  if (by > yPx + 4) { ctx.beginPath(); ctx.moveTo(ax, by); ctx.lineTo(ax - 3.5, by - 6); ctx.lineTo(ax + 3.5, by - 6); ctx.closePath(); ctx.fill(); }
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.translate(ax - 5, (ty + by) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('由此線開始放樣', 0, 0);
  ctx.restore();
}

// 立面索引符號：黑色三角帽＋白底圓圈字母（同施工圖）
function drawIndexSymbol(ctx, cx, cy, key) {
  ctx.save();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.moveTo(cx - 15, cy + 1); ctx.lineTo(cx + 15, cy + 1); ctx.lineTo(cx, cy - 18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(key, cx, cy + 1);
  ctx.restore();
}

// 地坪中央視角符號：圓心＋四向三角指向 A/B/C/D 立面（同施工圖）
function drawPlanCompass(ctx, cx, cy) {
  ctx.save();
  ctx.fillStyle = '#1a1a1a'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
  const dirs = [['B', 0, -1], ['D', 0, 1], ['A', -1, 0], ['C', 1, 0]];
  for (const [, dx, dy] of dirs) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 19, cy + dy * 19);
    ctx.lineTo(cx + dx * 7 - dy * 8, cy + dy * 7 - dx * 8);
    ctx.lineTo(cx + dx * 7 + dy * 8, cy + dy * 7 + dx * 8);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [k, dx, dy] of dirs) {
    const tx = cx + dx * 28, ty = cy + dy * 28;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.fillRect(tx - 6, ty - 7, 12, 14);
    ctx.fillStyle = '#1a1a1a'; ctx.fillText(k, tx, ty + 1);
  }
  ctx.restore();
}

const DIM_COLOR = '#6b665e';

// 立面外圍：下方水平尺寸鏈＋左側垂直尺寸鏈＋索引符號＋上方「由此線開始放樣」
function drawElevIndex(ctx, ox, oy, fw, fh, sc, key, r, ops, marks) {
  const ch = elevationChains(fw, fh, r, ops || [], marks);
  const baseY = oy + fh * sc;
  drawDimChain(ctx, ox, baseY + 14, 1, 0, sc, ch.h, DIM_COLOR);
  drawDimChain(ctx, ox - 10, baseY, 0, -1, sc, ch.v, DIM_COLOR);
  drawIndexSymbol(ctx, ox + fw * sc / 2, baseY + 38, key);
  if (r.tiles.length || r.total) drawStartMarker(ctx, ox + Math.max(0, r.xBase) * sc, oy, ox - 10, ox + fw * sc + 10);
}

// 地坪平面圖中的四面牆正統門窗圖例（支援 A/B/C/D 任意多個門與窗）
function drawFloorPlanOpenings(ctx, px, py, pw, ph, sc, allOps, dims) {
  ctx.save();
  const wallThk = 10;

  // 1. B 面（地坪上方水平牆）
  (allOps.B || []).forEach(o => {
    const ox = px + o.x * sc, ow = o.w * sc;
    if (o.kind === 'window') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox, py - wallThk / 2, ow, wallThk);
      ctx.strokeStyle = '#2b5a8c'; ctx.lineWidth = 1.4; ctx.strokeRect(ox, py - wallThk / 2, ow, wallThk);
      ctx.strokeStyle = '#4a7ea8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + ow, py); ctx.stroke();
      ctx.fillStyle = '#2b5a8c'; ctx.font = 'bold 9.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`🪟 ${o.name || '窗'} ${o.w}`, ox + ow / 2, py - wallThk / 2 - 4);
    } else {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox, py - wallThk / 2, ow, wallThk);
      ctx.strokeStyle = '#888888'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + ow, py); ctx.stroke();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox, py + ow); ctx.stroke();
      ctx.strokeStyle = '#7a756c'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(ox, py, ow, 0, Math.PI / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#222222'; ctx.font = 'bold 9.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`🚪 ${o.name || '門'} ${o.w}`, ox + ow / 2, py - wallThk / 2 - 4);
    }
  });

  // 2. D 面（地坪下方水平牆；立面左右跟平面相反）
  (allOps.D || []).forEach(o => {
    const ox = px + planPos('D', o.x, o.w, dims) * sc, ow = o.w * sc;
    if (o.kind === 'door') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox, py + ph - wallThk / 2, ow, wallThk);
      ctx.strokeStyle = '#888888'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(ox, py + ph); ctx.lineTo(ox + ow, py + ph); ctx.stroke();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ox, py + ph); ctx.lineTo(ox, py + ph - ow); ctx.stroke();
      ctx.strokeStyle = '#7a756c'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(ox, py + ph, ow, -Math.PI / 2, 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#222222'; ctx.font = 'bold 9.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`🚪 ${o.name || '門'} ${o.w}`, ox + ow / 2, py + ph + wallThk + 12);
    } else {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox, py + ph - wallThk / 2, ow, wallThk);
      ctx.strokeStyle = '#2b5a8c'; ctx.lineWidth = 1.4; ctx.strokeRect(ox, py + ph - wallThk / 2, ow, wallThk);
      ctx.strokeStyle = '#4a7ea8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ox, py + ph); ctx.lineTo(ox + ow, py + ph); ctx.stroke();
      ctx.fillStyle = '#2b5a8c'; ctx.font = 'bold 9.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`🪟 ${o.name || '窗'} ${o.w}`, ox + ow / 2, py + ph + wallThk + 12);
    }
  });

  // 3. A 面（地坪左側垂直牆；立面左右跟平面相反）
  (allOps.A || []).forEach(o => {
    const oy = py + planPos('A', o.x, o.w, dims) * sc, ow = o.w * sc;
    if (o.kind === 'door') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px - wallThk / 2, oy, wallThk, ow);
      ctx.strokeStyle = '#888888'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + ow); ctx.stroke();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px + ow, oy); ctx.stroke();
      ctx.strokeStyle = '#7a756c'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(px, oy, ow, 0, Math.PI / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#222222'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`🚪 ${o.name || '門'} ${o.w}`, px - wallThk - 4, oy + ow / 2 + 3);
    } else {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px - wallThk / 2, oy, wallThk, ow);
      ctx.strokeStyle = '#2b5a8c'; ctx.lineWidth = 1.4; ctx.strokeRect(px - wallThk / 2, oy, wallThk, ow);
      ctx.strokeStyle = '#4a7ea8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + ow); ctx.stroke();
      ctx.fillStyle = '#2b5a8c'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`🪟 ${o.name || '窗'} ${o.w}`, px - wallThk - 4, oy + ow / 2 + 3);
    }
  });

  // 4. C 面（地坪右側垂直牆）
  (allOps.C || []).forEach(o => {
    const oy = py + o.x * sc, ow = o.w * sc;
    if (o.kind === 'door') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px + pw - wallThk / 2, oy, wallThk, ow);
      ctx.strokeStyle = '#888888'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(px + pw, oy); ctx.lineTo(px + pw, oy + ow); ctx.stroke();
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(px + pw, oy); ctx.lineTo(px + pw - ow, oy); ctx.stroke();
      ctx.strokeStyle = '#7a756c'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(px + pw, oy, ow, Math.PI / 2, Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#222222'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`🚪 ${o.name || '門'} ${o.w}`, px + pw + wallThk + 4, oy + ow / 2 + 3);
    } else {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px + pw - wallThk / 2, oy, wallThk, ow);
      ctx.strokeStyle = '#2b5a8c'; ctx.lineWidth = 1.4; ctx.strokeRect(px + pw - wallThk / 2, oy, wallThk, ow);
      ctx.strokeStyle = '#4a7ea8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px + pw, oy); ctx.lineTo(px + pw, oy + ow); ctx.stroke();
      ctx.fillStyle = '#2b5a8c'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`🪟 ${o.name || '窗'} ${o.w}`, px + pw + wallThk + 4, oy + ow / 2 + 3);
    }
  });

  ctx.restore();
}

// 繪製地壁對縫垂直導引延伸線
function drawJointAlignmentGuide(ctx, px, py, pw, flR, bX, bY, bH, bR, sc) {
  ctx.save();
  ctx.strokeStyle = 'rgba(26, 122, 51, 0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  const joints = getTileJoints(flR.xBase, flR.pitchL, pw / sc);
  for (const j of joints) {
    if (j > 5 && j < (pw / sc) - 5) {
      const gx = px + j * sc;
      ctx.beginPath();
      ctx.moveTo(gx, py);
      ctx.lineTo(gx, bY + bH);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 🏛️ 地坪平面圖中的結構柱繪製、尺寸標註與立面紅線垂直連動導引
function drawFloorPlanColumn(ctx, px, py, pw, ph, sc, col, targetFacePos, dims) {
  if (!col || !col.on) return;
  const colW = col.w || 50;
  const colD = col.d || 50;
  const cw = colW * sc;
  const cd = colD * sc;

  let cx = px + col.x * sc;
  let cy = py;
  let lineX = cx;

  ctx.save();
  if (col.face === 'B') {
    // 依附地坪上方（B面牆）
    cx = px + col.x * sc;
    cy = py;
    lineX = cx;

    // 1. 結構柱剖面實體（標準建築 RC 柱符號）
    ctx.fillStyle = '#2f2c28';
    ctx.fillRect(cx, cy, cw, cd);

    // 剖面斜線紋理
    ctx.strokeStyle = '#5a554e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + cw, cy + cd);
    ctx.moveTo(cx + cw, cy); ctx.lineTo(cx, cy + cd);
    ctx.stroke();

    // 柱外框
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(cx, cy, cw, cd);

    // 2. 柱角放樣紅線（貫穿地坪平面）
    ctx.strokeStyle = '#e02424';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, py);
    ctx.lineTo(cx, py + ph);
    ctx.stroke();

    // 3. 向上延伸垂直對齊紅虛線，直通上方 B 立面的柱紅線！
    if (targetFacePos) {
      ctx.strokeStyle = 'rgba(224, 36, 36, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, py);
      ctx.lineTo(cx, targetFacePos.y + targetFacePos.h);
      ctx.stroke();

      // 連動標記
      ctx.fillStyle = '#e02424';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      const midY = (py + targetFacePos.y + targetFacePos.h) / 2;
      ctx.fillText('🔗 柱位連動線', cx, midY);
    }
    ctx.setLineDash([]);

    // 4. 平面柱標註文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🏛️柱 ${colW}×${colD}`, cx + cw / 2, cy + cd / 2 + 3);

    // 平面柱位尺寸標註
    ctx.fillStyle = '#e02424';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⌖ 平面柱位 X: ${col.x}cm`, cx + cw / 2, cy + cd + 14);

    // 註冊為平面可拖曳柱子目標
    interactiveTargets.push({
      type: 'columnFloor',
      faceKey: col.face,
      colX: col.x,
      faceFw: dims && dims[col.face] ? dims[col.face].fw : pw / sc,
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx - 6, cy - 2, Math.max(cw + 12, 28), Math.max(cd + 20, 36)]
    });
  } else if (col.face === 'D') {
    // 依附地坪下方（D面門側；立面左右跟平面相反）
    cx = px + planPos('D', col.x, colW, dims) * sc;
    cy = py + ph - cd;
    ctx.fillStyle = '#2f2c28';
    ctx.fillRect(cx, cy, cw, cd);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.6;
    ctx.strokeRect(cx, cy, cw, cd);

    ctx.strokeStyle = '#e02424'; ctx.lineWidth = 2.2; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(cx, py); ctx.lineTo(cx, py + ph); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`🏛️柱 ${colW}×${colD}`, cx + cw / 2, cy + cd / 2 + 3);

    interactiveTargets.push({
      type: 'columnFloor', faceKey: col.face, colX: col.x, faceFw: dims && dims[col.face] ? dims[col.face].fw : pw / sc,
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx - 6, cy - 2, Math.max(cw + 12, 28), Math.max(cd + 8, 28)]
    });
  } else if (col.face === 'A') {
    // 依附地坪左側（A面牆；立面左右跟平面相反）
    cx = px;
    cy = py + planPos('A', col.x, colW, dims) * sc;
    ctx.fillStyle = '#2f2c28';
    ctx.fillRect(cx, cy, cd, cw);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.6;
    ctx.strokeRect(cx, cy, cd, cw);

    ctx.strokeStyle = '#e02424'; ctx.lineWidth = 2.2; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px + pw, cy); ctx.stroke();
    ctx.setLineDash([]);

    interactiveTargets.push({
      type: 'columnFloor', faceKey: col.face, colX: col.x, faceFw: dims && dims[col.face] ? dims[col.face].fw : pw / sc,
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx, cy - 6, Math.max(cd + 8, 28), Math.max(cw + 12, 28)]
    });
  } else if (col.face === 'C') {
    // 依附地坪右側（C面牆）
    cx = px + pw - cd;
    cy = py + col.x * sc;
    ctx.fillStyle = '#2f2c28';
    ctx.fillRect(cx, cy, cd, cw);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.6;
    ctx.strokeRect(cx, cy, cd, cw);

    ctx.strokeStyle = '#e02424'; ctx.lineWidth = 2.2; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px + pw, cy); ctx.stroke();
    ctx.setLineDash([]);

    interactiveTargets.push({
      type: 'columnFloor', faceKey: col.face, colX: col.x, faceFw: dims && dims[col.face] ? dims[col.face].fw : pw / sc,
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx - 4, cy - 6, Math.max(cd + 8, 28), Math.max(cw + 12, 28)]
    });
  }
  ctx.restore();
}

// 匯入線稿的範圍（該面座標），用來讓尺寸鏈避開牆線
function overlayExtent(ov) {
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  for (const pl of ov.polys) for (const p of pl.pts) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

// 地坪四面牆門窗文字標籤最寬者（決定左側尺寸鏈要讓出多少空間）
function planLabelWidth(ctx, ops) {
  ctx.save(); ctx.font = 'bold 9px sans-serif';
  let w = 0;
  for (const o of ops || []) {
    w = Math.max(w, ctx.measureText(`${o.kind === 'door' ? '🚪' : '🪟'} ${o.name || ''} ${o.w}`).width);
  }
  ctx.restore();
  return w;
}

// 視角 1：施工圖全景（上排四面立面排開＋下排地坪平面，外圍尺寸鏈與放樣起點）
function drawUnfold(p, rows) {
  clearInteractiveTargets();
  const cv = $('cv');
  const { ctx, width: cvW, height: cvH } = setupHiDPICanvas(cv);
  ctx.clearRect(0, 0, cvW, cvH);

  const byKey = {}; rows.forEach(s => byKey[s.key] = s);
  const dims = faceDims(p);
  const allOps = openings(dims);

  const order = ['A', 'B', 'C', 'D'];
  const gap = 30;          // 立面間距（容納左側垂直尺寸鏈）
  const padL = 34, padR = 16;
  const padT = 34;         // 立面上方「由此線開始放樣」
  const elevBottom = 58;   // 立面下方尺寸鏈＋索引符號
  const planTop = 40;      // 地坪上方放樣標示與 B 牆門窗標籤
  const planBottom = 48;   // 地坪下方 D 牆門窗標籤＋尺寸鏈
  const topH = Math.max(...order.map(k => byKey[k].fh));
  const Lf = byKey.floor.fw, Wf = byKey.floor.fh;

  const s = Math.min(
    (cvW - padL - padR - (order.length - 1) * gap) / order.reduce((a, k) => a + byKey[k].fw, 0),
    (cvH - padT - elevBottom - planTop - planBottom - 8) / (topH + Wf)
  );

  const rowW = order.reduce((a, k) => a + byKey[k].fw * s, 0) + (order.length - 1) * gap;
  let curX = padL + (cvW - padL - padR - rowW) / 2;
  const elevY = padT;

  const facePosX = {};
  for (const k of order) {
    const row = byKey[k];
    const bH = row.fh * s;
    const oy = elevY + (topH * s - bH);
    facePosX[k] = { x: curX, y: oy, w: row.fw * s, h: bH };

    drawFaceBox(ctx, curX, oy, row.fw, row.fh, s, row.name, p, row.cfg, row.r, row.ops, { detail: false, faceKey: k });
    drawElevIndex(ctx, curX, oy, row.fw, row.fh, s, k, row.r, row.ops, chainMarks(row.cfg));
    curX += row.fw * s + gap;
  }

  // 下排：地坪平面圖（X 座標完全垂直對齊 B 立面）
  const planW = Lf * s, planH = Wf * s;
  const px = facePosX.B.x;
  const py = elevY + topH * s + elevBottom + planTop;
  const flR = byKey.floor.r;

  drawJointAlignmentGuide(ctx, px, py, planW, flR, facePosX.B.x, facePosX.B.y, facePosX.B.h, byKey.B.r, s);
  drawFaceBox(ctx, px, py, Lf, Wf, s, '地坪平面', p, byKey.floor.cfg, flR, [], { detail: false, faceKey: 'floor' });
  // 有匯入平面線稿時門已經畫在線稿裡，不再重畫一次
  if (!faceOverlays.floor) drawFloorPlanOpenings(ctx, px, py, planW, planH, s, allOps, dims);
  const col = columnParams();
  drawFloorPlanColumn(ctx, px, py, planW, planH, s, col, facePosX[col.face || 'B'], dims);
  drawPlanCompass(ctx, px + planW / 2, py + planH / 2);

  // 地坪外圍尺寸鏈與放樣起點（避開四面牆的門窗文字）
  const fch = floorChains(Lf, Wf, flR, allOps, chainMarks(byKey.floor.cfg), dims);
  // 有匯入平面線稿時，尺寸鏈讓到牆線外面；沒有時讓開四面牆的門窗文字
  const ov = faceOverlays.floor;
  const oe = ov ? overlayExtent(ov) : null;
  const botY = oe ? py + Math.max(Wf, oe.y1) * s + 14 : py + planH + ((allOps.D || []).length ? 40 : 14);
  drawDimChain(ctx, px, botY, 1, 0, s, fch.h, DIM_COLOR);
  const leftX = oe ? px + Math.min(0, oe.x0) * s - 10
    : px - 10 - ((allOps.A || []).length ? planLabelWidth(ctx, allOps.A) + 12 : 0);
  drawDimChain(ctx, leftX, py, 0, 1, s, fch.v, DIM_COLOR);
  const markTop = oe ? py + Math.min(0, oe.y0) * s : py - ((allOps.B || []).length ? 14 : 0);
  drawStartMarker(ctx, px + Math.max(0, flR.xBase) * s, markTop, px - 10, px + planW + 10);
  drawStartMarkerV(ctx, py + Math.max(0, flR.yBase) * s, leftX - 16, py - 10, py + planH + 10);

  // 材料（匯入施工圖時照圖上的材料標註列出；沒有就列共用磁磚規格）
  ctx.textAlign = 'left';
  let ty = py + 14;
  if (projectMaterials.length) {
    for (const m of projectMaterials) {
      // 有材質照片時畫在文字左邊（同施工圖材料表）
      const img = typeof materialPhoto === 'function' ? materialPhoto(m) : null;
      const tx = img ? padR + 52 : padR;
      const top = ty;
      if (img) {
        const k = Math.min(46 / img.naturalWidth, 46 / img.naturalHeight);
        ctx.drawImage(img, padR, ty - 11, img.naturalWidth * k, img.naturalHeight * k);
      }
      ctx.fillStyle = '#c0703a'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(m.role, tx, ty); ty += 15;
      ctx.fillStyle = '#3a3a3a'; ctx.font = '10.5px sans-serif';
      [m.code, m.spec, '填縫劑：' + (m.grout || '')].filter(t => t && t.trim()).forEach(t => { ctx.fillText(t, tx, ty); ty += 13; });
      ty = Math.max(ty, img ? top + 40 : ty) + 6;
    }
  } else {
    ctx.fillStyle = '#5a544b'; ctx.font = '11px sans-serif';
    [
      '【施工圖規格】',
      `磁磚：${p.TL}×${p.TW} cm（縫寬 ${p.joint} cm）`,
      `工法：橫/直貼與起磚依各面設定`,
      '對縫：地磚縫垂直向上連通 B/D 壁磚',
      '收邊：轉角陽角處倒 45 度背切收邊'
    ].forEach((t, i) => ctx.fillText(t, padR, py + 14 + i * 16));
  }
  ctx.fillStyle = '#5a544b'; ctx.font = '11px sans-serif';

  // 操作說明只在螢幕上看，匯出 PDF／圖片時不畫
  if (window.__exportDpr) { drawActiveDragGuide(ctx); return; }
  ctx.textAlign = 'right';
  const spec2 = [
    '【CAD 互動放樣說明】',
    '🎯 紅色靶心＝拖曳調整起磚基準點',
    '🏛️ 柱分界紅線＝可拖曳位置，支援左右連動/獨立起磚',
    '🧲 自動鎖點＝接近門框/窗台/柱線自動吸附',
    '🔗 一鍵對縫＝壁磚垂直縫精確對齊地磚'
  ];
  spec2.forEach((t, i) => ctx.fillText(t, cvW - padR, py + 14 + i * 16));

  drawActiveDragGuide(ctx);
}

// 視角 2：單面特寫放樣＋外圍分段尺寸鏈
function drawSingle(p, rows) {
  clearInteractiveTargets();
  const cv = $('cv');
  const { ctx, width: cvW, height: cvH } = setupHiDPICanvas(cv);
  ctx.clearRect(0, 0, cvW, cvH);

  const row = rows.find(s => s.key === face);
  const fw = row.fw, fh = row.fh;
  const pad = 64;
  const sc = Math.min((cvW - 2 * pad) / fw, (cvH - 2 * pad) / fh);
  const ox = (cvW - fw * sc) / 2, oy = (cvH - fh * sc) / 2;

  drawFaceBox(ctx, ox, oy, fw, fh, sc, row.name, p, row.cfg, row.r, row.ops, { detail: true, faceKey: face });

  if (face === 'floor') {
    const ch = floorChains(fw, fh, row.r, {}, chainMarks(row.cfg));
    drawDimChain(ctx, ox, oy + fh * sc + 22, 1, 0, sc, ch.h, DIM_COLOR);
    drawDimChain(ctx, ox - 22, oy, 0, 1, sc, ch.v, DIM_COLOR);
    drawStartMarker(ctx, ox + Math.max(0, row.r.xBase) * sc, oy, ox - 10, ox + fw * sc + 10);
    drawStartMarkerV(ctx, oy + Math.max(0, row.r.yBase) * sc, ox - 40, oy - 10, oy + fh * sc + 10);
  } else {
    const ch = elevationChains(fw, fh, row.r, row.ops, chainMarks(row.cfg));
    drawDimChain(ctx, ox, oy + fh * sc + 22, 1, 0, sc, ch.h, DIM_COLOR);
    drawDimChain(ctx, ox - 22, oy + fh * sc, 0, -1, sc, ch.v, DIM_COLOR);
    drawStartMarker(ctx, ox + Math.max(0, row.r.xBase) * sc, oy, ox - 10, ox + fw * sc + 10);
  }

  drawActiveDragGuide(ctx);
}

// 拖曳中的動態尺寸線與鎖點標籤
function drawActiveDragGuide(ctx) {
  if (currentSnap) {
    ctx.save();
    ctx.strokeStyle = '#00a854';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    const sx = currentSnap.px, sy = currentSnap.py;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 6);
    ctx.lineTo(sx + 6, sy);
    ctx.lineTo(sx, sy + 6);
    ctx.lineTo(sx - 6, sy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#00a854';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🧲 ${currentSnap.label} (${Math.round(currentSnap.val)}cm)`, sx + 9, sy - 4);
    ctx.restore();
  }

  if (!activeDrag) return;
  ctx.save();
  ctx.strokeStyle = '#0070f3';
  ctx.fillStyle = '#0070f3';
  ctx.lineWidth = 1.5;
  ctx.font = 'bold 12px sans-serif';

  if (activeDrag.type === 'origin' || activeDrag.type === 'settingOutX') {
    const curX = activeDrag.curX;
    ctx.beginPath(); ctx.moveTo(activeDrag.ox, activeDrag.oy - 14); ctx.lineTo(curX, activeDrag.oy - 14); ctx.stroke();
    const valX = Math.round(activeDrag.curValX);
    ctx.textAlign = 'center';
    ctx.fillText(`起磚 X = ${valX} cm`, (activeDrag.ox + curX) / 2, activeDrag.oy - 18);
  }
  if (activeDrag.type === 'origin' || activeDrag.type === 'settingOutY') {
    const curY = activeDrag.curY;
    ctx.beginPath(); ctx.moveTo(activeDrag.ox - 14, activeDrag.oy); ctx.lineTo(activeDrag.ox - 14, curY); ctx.stroke();
    const valY = Math.round(activeDrag.curValY);
    ctx.textAlign = 'center';
    ctx.fillText(`起磚 Y = ${valY} cm`, activeDrag.ox - 40, (activeDrag.oy + curY) / 2);
  }
  if (activeDrag.type === 'columnLine') {
    const curX = activeDrag.curX;
    ctx.strokeStyle = '#e02424';
    ctx.beginPath(); ctx.moveTo(activeDrag.ox, activeDrag.oy - 14); ctx.lineTo(curX, activeDrag.oy - 14); ctx.stroke();
    const valX = Math.round(activeDrag.curValX);
    ctx.fillStyle = '#e02424';
    ctx.textAlign = 'center';
    ctx.fillText(`🏛️ 柱位置 X = ${valX} cm`, (activeDrag.ox + curX) / 2, activeDrag.oy - 18);
  }
  ctx.restore();
}

function draw(p, rows) {
  p = p || params();
  rows = rows || computeAll(p);
  if (view === 'unfold') drawUnfold(p, rows);
  else drawSingle(p, rows);

  // ⚠️ 即時結構柱與開口碰撞衝突檢測與橫幅渲染
  if (typeof detectColumnClashes === 'function' && typeof renderClashBanner === 'function') {
    const clashes = detectColumnClashes(faceDims(p));
    renderClashBanner(clashes);
  }
}
