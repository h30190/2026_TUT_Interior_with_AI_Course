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
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const cssW = 1240, cssH = 760;
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

    ctx.fillStyle = t.danger ? '#e04545' : (t.full ? '#efe9df' : '#f2b48c');
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#d8d2c6';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(px, py, pw, ph);

    interactiveTargets.push({
      type: 'tile',
      box: [px, py, pw, ph],
      tile: t,
      faceName: faceName
    });
  }
}

// 正統建築立面門窗樣式（雙線門樘、窗框、接地）
function drawElevationOpenings(ctx, ox, oy, fw, fh, sc, ops, faceKey) {
  for (const o of ops) {
    const px = ox + o.x * sc;
    const py = oy + (fh - (o.y + o.h)) * sc;
    const pw = o.w * sc, ph = o.h * sc;
    const isDrag = (activeDrag && activeDrag.type === o.kind && activeDrag.faceKey === faceKey);

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
function drawSettingOut(ctx, ox, oy, fw, fh, sc, r, faceKey, isElevation, detail) {
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

  // 🎯 起磚十字靶心
  const isTargetActive = activeDrag && activeDrag.type === 'origin' && activeDrag.faceKey === faceKey;
  ctx.fillStyle = isTargetActive ? '#ff3838' : '#d22';
  ctx.beginPath(); ctx.arc(xPx, yPx, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(xPx, yPx, 2.5, 0, Math.PI * 2); ctx.fill();

  // 📍 起磚點明確標註 (CAD 座標標籤)
  const xVal = Math.round(r.xBase * 10) / 10;
  const yVal = Math.round(r.yBase * 10) / 10;
  const tagText = `⌖ 起磚點 (X:${xVal}, Y:${yVal})`;
  ctx.font = 'bold 10px sans-serif';
  const tagW = ctx.measureText(tagText).width + 10;
  const tagX = (xPx + tagW + 10 < ox + fw * sc) ? xPx + 8 : xPx - tagW - 8;
  const tagY = (yPx - 16 > oy) ? yPx - 10 : yPx + 16;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillRect(tagX, tagY - 10, tagW, 14);
  ctx.strokeStyle = '#d22'; ctx.lineWidth = 1;
  ctx.strokeRect(tagX, tagY - 10, tagW, 14);
  ctx.fillStyle = '#b22'; ctx.textAlign = 'left';
  ctx.fillText(tagText, tagX + 5, tagY + 1);

  // X 距左尺寸引導標註
  if (r.xBase > 0.5) {
    const dimY = oy - 4;
    ctx.strokeStyle = '#d22'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, dimY); ctx.lineTo(xPx, dimY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, dimY - 3); ctx.lineTo(ox, dimY + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xPx, dimY - 3); ctx.lineTo(xPx, dimY + 3); ctx.stroke();
    ctx.fillStyle = '#d22'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`距左 X=${xVal}`, (ox + xPx) / 2, dimY - 3);
  }

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

  // 碎磚處標註「避免小料」
  if (r.danger > 0) {
    let t = null;
    for (const q of r.tiles) { if (q.danger) { t = q; break; } }
    if (t) {
      const cx = ox + (Math.max(t.x0, 0) + t.wL / 2) * sc;
      const cy = isElevation
        ? oy + (fh - (Math.max(t.y0, 0) + t.wW / 2)) * sc
        : oy + (Math.max(t.y0, 0) + t.wW / 2) * sc;
      const ex = cx < ox + fw * sc / 2 ? ox - 10 : ox + fw * sc + 10;
      const ey = cy < oy + fh * sc / 2 ? oy - 10 : oy + fh * sc + 10;
      ctx.strokeStyle = '#d22'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = '#d22'; ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = ex < ox ? 'right' : 'left';
      ctx.fillText('避免小料 (<5cm)', ex + (ex < ox ? -4 : 4), ey + 3);
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
  if (ops && ops.length) {
    drawElevationOpenings(ctx, ox, oy, fw, fh, sc, ops, opts.faceKey || 'A');
  }

  // 繪製放樣基準線與起磚點
  drawSettingOut(ctx, ox, oy, fw, fh, sc, r, opts.faceKey || 'A', isElevation, !!opts.detail);

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

  // 頂部面別資訊標籤
  ctx.fillStyle = '#2b2b2b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
  const dirTxt = cfg.dir === 'H' ? '橫貼' : '直貼';
  const xTxt = XALIGN_NAMES[cfg.xalign] || '靠左';
  const yTxt = YALIGN_NAMES[cfg.yalign] || '由地起';
  ctx.fillText(`${name} ${fw}×${fh}｜${dirTxt}·${MODE_NAMES[cfg.mode]}·X:${xTxt}·Y:${yTxt}`, ox + 4, oy + 15);
}

// 立面下方：圓圈索引標記 ⒶⒷⒸⒹ ＋ 尺寸標註線
function drawElevIndex(ctx, ox, oy, fw, fh, sc, key, r) {
  const cy = oy + fh * sc + 18;
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox, cy); ctx.lineTo(ox + fw * sc, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, cy - 4); ctx.lineTo(ox, cy + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox + fw * sc, cy - 4); ctx.lineTo(ox + fw * sc, cy + 4); ctx.stroke();

  ctx.fillStyle = '#2b2b2b'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(CIRCLED[key], ox + fw * sc / 2, cy + 18);
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#7a756c';
  ctx.fillText(fw + ' cm', ox + fw * sc / 2, cy - 5);
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

  // 2. D 面（地坪下方水平牆）
  (allOps.D || []).forEach(o => {
    const ox = px + o.x * sc, ow = o.w * sc;
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

  // 3. A 面（地坪左側垂直牆）
  (allOps.A || []).forEach(o => {
    const oy = py + o.x * sc, ow = o.w * sc;
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
function drawFloorPlanColumn(ctx, px, py, pw, ph, sc, col, targetFacePos) {
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
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx - 6, cy - 2, Math.max(cw + 12, 28), Math.max(cd + 20, 36)]
    });
  } else if (col.face === 'D') {
    // 依附地坪下方（D面門側）
    cx = px + col.x * sc;
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
      type: 'columnFloor', faceKey: col.face, colX: col.x,
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx - 6, cy - 2, Math.max(cw + 12, 28), Math.max(cd + 8, 28)]
    });
  } else if (col.face === 'A') {
    // 依附地坪左側（A面牆）
    cx = px;
    cy = py + col.x * sc;
    ctx.fillStyle = '#2f2c28';
    ctx.fillRect(cx, cy, cd, cw);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.6;
    ctx.strokeRect(cx, cy, cd, cw);

    ctx.strokeStyle = '#e02424'; ctx.lineWidth = 2.2; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px + pw, cy); ctx.stroke();
    ctx.setLineDash([]);

    interactiveTargets.push({
      type: 'columnFloor', faceKey: col.face, colX: col.x,
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
      type: 'columnFloor', faceKey: col.face, colX: col.x,
      ox: px, oy: py, fw: pw / sc, fh: ph / sc, sc,
      box: [cx - 4, cy - 6, Math.max(cd + 8, 28), Math.max(cw + 12, 28)]
    });
  }
  ctx.restore();
}

// 視角 1：施工圖全景（加大畫面，縮小邊距）
function drawUnfold(p, rows) {
  clearInteractiveTargets();
  const cv = $('cv');
  const { ctx, width: cvW, height: cvH } = setupHiDPICanvas(cv);
  ctx.clearRect(0, 0, cvW, cvH);

  const byKey = {}; rows.forEach(s => byKey[s.key] = s);
  const dims = faceDims(p);
  const allOps = openings(dims);

  const order = ['A', 'B', 'C', 'D'];
  const gap = 20; // 緊湊間隔
  const topH = Math.max(...order.map(k => byKey[k].fh));
  const Lf = byKey.floor.fw, Wf = byKey.floor.fh;
  const pad = 16; // 最小化邊距以放大圖面

  // 顯著放大圖面比例
  const s = Math.min(
    (cvW - 2 * pad - (order.length - 1) * gap) / order.reduce((a, k) => a + byKey[k].fw, 0),
    (cvH - 2 * pad - 55) / (topH + Wf)
  );

  const rowW = order.reduce((a, k) => a + byKey[k].fw * s, 0) + (order.length - 1) * gap;
  let curX = (cvW - rowW) / 2;
  const elevY = pad + 10;

  const facePosX = {};
  for (const k of order) {
    const row = byKey[k];
    const bH = row.fh * s;
    const oy = elevY + (topH * s - bH);
    facePosX[k] = { x: curX, y: oy, w: row.fw * s, h: bH };

    drawFaceBox(ctx, curX, oy, row.fw, row.fh, s, row.name, p, row.cfg, row.r, row.ops, { detail: false, faceKey: k });
    drawElevIndex(ctx, curX, oy, row.fw, row.fh, s, k, row.r);
    curX += row.fw * s + gap;
  }

  // 下排：地坪平面圖（X 座標完全垂直對齊 B 立面）
  const planW = Lf * s, planH = Wf * s;
  const px = facePosX.B.x;
  const py = elevY + topH * s + 62;

  drawJointAlignmentGuide(ctx, px, py, planW, byKey.floor.r, facePosX.B.x, facePosX.B.y, facePosX.B.h, byKey.B.r, s);
  drawFaceBox(ctx, px, py, Lf, Wf, s, '地坪平面', p, byKey.floor.cfg, byKey.floor.r, [], { detail: false, faceKey: 'floor' });
  drawFloorPlanOpenings(ctx, px, py, planW, planH, s, allOps, dims);
  const col = columnParams();
  drawFloorPlanColumn(ctx, px, py, planW, planH, s, col, facePosX[col.face || 'B']);

  // 四向立面索引箭頭指南針（指針 B 朝上直指正上方 B 立面！）
  ctx.fillStyle = '#2b2b2b'; ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.3;
  ctx.font = 'bold 13px sans-serif';
  const arrow = (ax, ay, dir, label) => {
    ctx.save(); ctx.translate(ax, ay);
    const rot = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[dir];
    ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(1, -4); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    const off = { up: [0, -14], down: [0, 20], left: [-22, 4], right: [22, 4] }[dir];
    ctx.fillText(label, ax + off[0], ay + off[1]);
  };

  arrow(px + planW / 2, py - 6, 'up', 'Ⓑ 立面（直對）');
  arrow(px + planW / 2, py + planH + 6, 'down', 'Ⓓ 立面');
  arrow(px - 6, py + planH / 2, 'left', 'Ⓐ 立面');
  arrow(px + planW + 6, py + planH / 2, 'right', 'Ⓒ 立面');

  // 材料規格與操作說明
  ctx.fillStyle = '#5a544b'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  const spec = [
    '【施工圖規格】',
    `磁磚：${p.TL}×${p.TW} cm（縫寬 ${p.joint} cm）`,
    `工法：橫/直貼與起磚依各面設定`,
    '對縫：地磚縫垂直向上連通 B/D 壁磚',
    '收邊：轉角陽角處倒 45 度背切收邊'
  ];
  spec.forEach((t, i) => ctx.fillText(t, pad, py + 14 + i * 16));

  ctx.textAlign = 'right';
  const spec2 = [
    '【CAD 互動放樣說明】',
    '🎯 紅色靶心＝拖曳調整起磚基準點',
    '🏛️ 柱分界紅線＝可拖曳位置，支援左右連動/獨立起磚',
    '🧲 自動鎖點＝接近門框/窗台/柱線自動吸附',
    '🔗 一鍵對縫＝壁磚垂直縫精確對齊地磚'
  ];
  spec2.forEach((t, i) => ctx.fillText(t, cvW - pad, py + 14 + i * 16));

  drawActiveDragGuide(ctx);
}

// 視角 2：單面特寫放樣＋外圍尺寸線
function drawSingle(p, rows) {
  clearInteractiveTargets();
  const cv = $('cv');
  const { ctx, width: cvW, height: cvH } = setupHiDPICanvas(cv);
  ctx.clearRect(0, 0, cvW, cvH);

  const row = rows.find(s => s.key === face);
  const fw = row.fw, fh = row.fh;
  const pad = 60;
  const sc = Math.min((cvW - 2 * pad) / fw, (cvH - 2 * pad) / fh);
  const ox = (cvW - fw * sc) / 2, oy = (cvH - fh * sc) / 2;

  drawFaceBox(ctx, ox, oy, fw, fh, sc, row.name, p, row.cfg, row.r, row.ops, { detail: true, faceKey: face });

  ctx.strokeStyle = '#8a7f6d'; ctx.lineWidth = 1; ctx.fillStyle = '#8a7f6d';
  ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  const dimY = oy + fh * sc + 24;
  ctx.beginPath(); ctx.moveTo(ox, dimY); ctx.lineTo(ox + fw * sc, dimY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, dimY - 4); ctx.lineTo(ox, dimY + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox + fw * sc, dimY - 4); ctx.lineTo(ox + fw * sc, dimY + 4); ctx.stroke();
  ctx.fillText(fw + ' cm', ox + fw * sc / 2, dimY + 14);

  const dimX = ox - 24;
  ctx.save(); ctx.translate(dimX, oy + fh * sc / 2); ctx.rotate(-Math.PI / 2);
  ctx.beginPath(); ctx.moveTo(-fh * sc / 2, 0); ctx.lineTo(fh * sc / 2, 0); ctx.stroke();
  ctx.fillText(fh + ' cm', 0, -6);
  ctx.restore();

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
