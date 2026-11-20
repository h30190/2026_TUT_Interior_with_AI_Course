// 應用程式入口：UI 事件綁定、畫布滑鼠拖曳放樣、CAD 鎖點與一鍵地壁對縫

// 開口名稱：門、窗；半高檯造成的空白用自己的名稱（檯側面上方、檯擋住…）
function opLabel(o) {
  return o.void ? o.name : (o.kind === 'door' ? '門' : '窗');
}

// 碎磚警示欄：小料片數（其中要避免的另外註明）＋包住門窗轉角的 L 型切割
function sliverTxt(g) {
  if (!g.danger && !g.lcut) return '—';
  const parts = [];
  if (g.danger) parts.push(`⚠ ${g.danger} 片` + (g.avoid ? `<br><small>避免小料 ${g.avoid}</small>` : ''));
  if (g.lcut) parts.push(`<small>L 型切割 ${g.lcut}</small>`);
  return parts.join('<br>');
}

function renderTable(rows, p) {
  const tb = document.querySelector('#tbl tbody');
  tb.innerHTML = '';
  const lossOf = g => g.net > 0 ? ((g.total - g.net) / g.net * 100) : 0;
  const byMat = {};
  let danger = 0, lcut = 0, opArea = 0;
  for (const s of rows) {
    danger += s.r.danger; lcut += s.r.lcut || 0; opArea += s.r.opArea;
    const opTxt = s.ops.length || s.r.voidArea
      ? s.ops.map(o => opLabel(o) + ' ' + o.w + '×' + o.h)
        .concat(s.r.voidArea > 1 ? [`外框外 ${(s.r.voidArea / 10000).toFixed(2)} m²`] : []).join('<br>')
      : '—';
    const xTxt = XALIGN_NAMES[s.cfg.xalign] + (s.cfg.xalign === 'custom' ? (' ' + s.cfg.xoff) : '');
    const yTxt = YALIGN_NAMES[s.cfg.yalign] + (s.cfg.yalign === 'custom' ? (' ' + s.cfg.yoff) : '');
    if (s.cfg.skip) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.name}</td><td>${s.fw}×${s.fh}</td><td colspan="10" style="text-align:center;color:var(--muted)">不鋪磚</td>`;
      tb.appendChild(tr);
      continue;
    }
    // 有分區的面：每種磚各一行（不同尺寸的片數不能相加）
    s.r.groups.forEach((g, gi) => {
      const m = byMat[g.label] || (byMat[g.label] = { net: 0, full: 0, cut: 0, total: 0, danger: 0, avoid: 0, lcut: 0, TL: g.TL, TW: g.TW, name: g.name });
      ['net', 'full', 'cut', 'total', 'danger', 'avoid', 'lcut'].forEach(k => { m[k] += g[k] || 0; });
      const tr = document.createElement('tr');
      const multi = s.r.groups.length > 1;
      tr.innerHTML = `<td>${s.name}${multi ? `<br><small>${g.label}</small>` : ''}</td><td>${gi === 0 ? s.fw + '×' + s.fh : ''}</td>
        <td>${s.cfg.dir === 'H' ? '橫貼' : '直貼'}</td>
        <td>${MODE_NAMES[s.cfg.mode]}</td>
        <td>${gi === 0 ? xTxt : ''}</td>
        <td>${gi === 0 ? yTxt : ''}</td>
        <td>${gi === 0 ? opTxt : ''}</td>
        <td>${fmt(g.full)}</td><td>${fmt(g.cut)}</td><td>${fmt(g.total)}</td>
        <td>${lossOf(g).toFixed(1)}</td>
        <td class="${g.danger > 0 || g.lcut > 0 ? 'danger' : ''}">${sliverTxt(g)}</td>`;
      tb.appendChild(tr);
    });
  }
  // 依材料合計
  const mats = Object.keys(byMat).map(label => Object.assign({ label }, byMat[label]));
  mats.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.className = 'total';
    tr.innerHTML = `<td>合計｜${m.label}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      <td>${i === 0 && opArea > 0 ? (opArea / 10000).toFixed(2) + ' m²' : '—'}</td>
      <td>${fmt(m.full)}</td><td>${fmt(m.cut)}</td><td>${fmt(m.total)}</td>
      <td>${lossOf(m).toFixed(1)}</td>
      <td class="${m.danger > 0 || m.lcut > 0 ? 'danger' : ''}">${sliverTxt(m)}</td>`;
    tb.appendChild(tr);
  });
  return { mats, danger, lcut, opArea };
}

function renderConcl(p, tot) {
  const rows = computeAll(p);
  const worst = rows.filter(s => s.r.danger > 0)
    .sort((a, b) => b.r.danger - a.r.danger);
  const opNames = rows.flatMap(s => s.ops.map(o => `${s.name}${opLabel(o)} ${o.w}×${o.h}`));
  let txt = '【全室五面】' + tot.mats.map(m => {
    const loss = m.net > 0 ? ((m.total - m.net) / m.net * 100) : 0;
    return `${m.label} 叫料 ${fmt(m.total)} 片（整磚 ${fmt(m.full)}＋裁切 ${fmt(m.cut)}，損耗 ${loss.toFixed(1)}%）`;
  }).join('；') + '。';
  if (tot.opArea > 0) {
    txt += ` 已扣除${rows.some(s => s.ops.some(o => o.void)) ? '門窗開口與半高檯' : '門窗開口'} ${opNames.join('、')}（共 ${(tot.opArea / 10000).toFixed(2)} m²，不鋪磚）。`;
  }
  if (tot.danger > 0) {
    const names = worst.map(s => `${s.name} ${s.r.danger} 片`).join('、');
    const avoid = rows.reduce((a, s) => a + s.r.avoid, 0);
    txt += ` ⚠️ 全室共 ${tot.danger} 片小料（最短邊 < ${p.smallTh}cm：${names}）`
      + (avoid ? `，其中 ${avoid} 片 < ${p.avoidTh}cm 已在圖上紅圈標「避免小料」` : '')
      + '，可拖曳紅線或點「✨ 智慧消滅小料」調整。';
  } else {
    txt += '  未出現危險碎磚，排磚配置安全。';
  }
  if (tot.lcut > 0) {
    const names = rows.filter(s => s.r.lcut > 0).map(s => `${s.name} ${s.r.lcut} 片`).join('、');
    txt += ` ⚠️ 有 ${tot.lcut} 片磚包住門窗轉角要切成 L 型（${names}），圖上紅圈標「避免L型」，可點「🧠 自動找最佳起磚點」找不會包轉角的起點。`;
  }
  document.getElementById('concl').textContent = txt;
}

// 報價表：叫料 →（備品）下單片數 × 單價＝金額
// 勾了「採用剩料回收」：各材料叫料扣掉回收省下的片數
function matsAfterReuse(mats, reuse) {
  if (!$('useReuse') || !$('useReuse').checked) return mats;
  return mats.map(m => Object.assign({}, m, { total: m.total - ((reuse[m.label] && reuse[m.label].saved) || 0) }));
}

function renderCutList(rows, reuse) {
  const host = $('cutlist');
  if (!host) return;
  const faces = cutListByFace(cutPieces(rows, params().smallTh));
  const mats = Object.values(reuse);
  host.innerHTML = `<table><thead><tr><th>材料</th><th>裁切塊數</th><th>不回收要開</th><th>回收後要開</th><th>省下</th></tr></thead><tbody>
    ${mats.map(m => `<tr><td>${m.label}</td><td>${m.cut}</td><td>${m.cut} 片</td><td>${m.newTiles} 片</td><td>${m.saved ? `<b>${m.saved} 片</b>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">沒有裁切磚</td></tr>'}
    </tbody></table>
    <div class="cut-faces">${faces.map(f => `<div><b>${f.faceName}</b>：${f.items.map(it =>
      `${it.label.replace(/\s*[\d.]+×[\d.]+$/, '') || it.label} <span class="cut-size">${it.w}×${it.h}</span>${it.slanted ? '（斜切）' : ''} ×${it.count}`).join('、')}</div>`).join('')}</div>`;
}

function renderQuote(p, tot, reuse) {
  const host = $('quote');
  if (!host) return;
  const useR = $('useReuse') && $('useReuse').checked;
  const q = quoteLines(matsAfterReuse(tot.mats, reuse || {}), priceBook, p.spare, p.price);
  host.innerHTML = `<h3>報價${useR ? '（已採用剩料回收）' : ''}</h3>
    <table><thead><tr><th>材料</th><th>叫料（片）</th><th>備品</th><th>下單（片）</th><th>單價（元/片）</th><th>金額（元）</th></tr></thead><tbody>
    ${q.lines.map(l => `<tr><td>${l.label}${l.mat && l.mat.code ? `<br><small>${l.mat.code}</small>` : ''}</td><td>${fmt(l.total)}</td><td>${p.spare}%</td>
      <td>${fmt(l.order)}</td><td>${l.price > 0 ? fmt(l.price) : '<span class="muted">未填</span>'}</td><td>${l.amount !== null ? fmt(l.amount) : '—'}</td></tr>`).join('')}
    <tr class="total"><td>合計</td><td colspan="4">${q.missing ? `還有 ${q.missing} 種材料沒填單價（左側「材料」卡片填寫）` : ''}</td><td>${fmt(q.sum)}</td></tr>
    </tbody></table>`;
}

// 同步更新 CAD 工具列的數值
function syncCADToolbar() {
  const sel = $('cadFace');
  if (!sel) return;
  const faceKey = sel.value;
  const xVal = $(faceKey + '_xoff') ? $(faceKey + '_xoff').value : 0;
  const yVal = $(faceKey + '_yoff') ? $(faceKey + '_yoff').value : 0;
  $('cadX').value = xVal;
  $('cadY').value = yVal;
}

// 全域四面對縫鎖定狀態
let lockAllJoints = false;

// 套用四面對縫（讓 A/B/C/D 壁磚垂直縫對齊地坪磚縫）
function applyLockAllJoints() {
  const p = params();
  const dims = faceDims(p);
  for (const k of ['A', 'B', 'C', 'D']) {
    const bestX = calcJointAlignment(p, dims, k);
    const xAlignSel = $(k + '_xalign');
    const xOffInp = $(k + '_xoff');
    if (xAlignSel) xAlignSel.value = 'custom';
    if (xOffInp) xOffInp.value = bestX;
  }
}

// 更新鎖定對縫按鈕與標籤狀態
function updateLockUI() {
  const btn1 = $('btnLockJointsPanel');
  const btn2 = $('cadLockJointsBtn');
  if (btn1) {
    btn1.classList.toggle('locked', lockAllJoints);
    btn1.textContent = lockAllJoints ? '🔒 四面對縫：已鎖定（壁磚自動跟隨地磚）' : '🔓 四面對縫：未鎖定（點擊一鍵鎖定）';
  }
  if (btn2) {
    btn2.classList.toggle('locked', lockAllJoints);
    btn2.textContent = lockAllJoints ? '🔒 四面對縫(鎖定中)' : '🔓 鎖定四面對縫';
  }
  for (const k of ['A', 'B', 'C', 'D']) {
    const badge = $('badge_' + k);
    const blk = $('faceblk_' + k);
    if (badge) badge.style.display = lockAllJoints ? 'inline-block' : 'none';
    if (blk) blk.classList.toggle('locked-joint', lockAllJoints);
  }
}

function refresh() {
  if (lockAllJoints) {
    applyLockAllJoints();
  }
  updateLockUI();

  const p = params();
  const rows = computeAll(p);
  if (typeof updateOpeningWarnings === 'function') updateOpeningWarnings(faceDims(p));
  const tot = renderTable(rows, p);
  const reuse = reuseByMaterial(rows, p);
  renderCutList(rows, reuse);
  renderConcl(p, tot);
  renderQuote(p, tot, reuse);

  // 碎磚警示條與智慧消滅小料按鈕聯動
  const anyDanger = tot.danger > 0 || tot.lcut > 0;
  const w = document.getElementById('warn');
  const btnAuto = document.getElementById('btnAutoFix');
  if (anyDanger) {
    w.style.display = 'flex';
    document.getElementById('warnMsg').textContent =
      `⚠️ ${[tot.danger ? `細長碎磚 ${tot.danger} 片` : '', tot.lcut ? `L 型切割 ${tot.lcut} 片` : ''].filter(Boolean).join('、')}，`
      + (tot.danger ? '建議用滑鼠拖曳起磚靶心 🎯，或一鍵自動優化：' : '可點下方「🧠 自動找最佳起磚點」找不會包住門窗轉角的起點。');
    if (btnAuto) btnAuto.style.display = tot.danger ? 'inline-block' : 'none';
  } else {
    w.style.display = 'none';
    if (btnAuto) btnAuto.style.display = 'none';
  }

  syncCADToolbar();
  // 外框由匯入／案例設定時，欄位跟著顯示（正在輸入時不改，免得游標跳掉）
  const olInp = $('floor_outline');
  if (olInp && document.activeElement !== olInp) olInp.value = formatOutline(floorOutline);
  draw(p, rows);
}

// 產生五面控制面板（支援五欄橫向展開與鎖定高亮）
function buildPanels() {
  const host = $('faceCfgs');
  const dims = { floor: 'L×W', A: 'L×H', B: 'W×H', C: 'L×H', D: 'W×H' };
  const dimLabels = {
    floor: ['長度 L (cm)', '寬度 W (cm)'],
    A: ['寬度 W (cm)', '高度 H (cm)'],
    B: ['寬度 W (cm)', '高度 H (cm)'],
    C: ['寬度 W (cm)', '高度 H (cm)'],
    D: ['寬度 W (cm)', '高度 H (cm)']
  };
  const dimDefaults = { floor: [600, 400], A: [600, 280], B: [400, 280], C: [600, 280], D: [400, 280] };
  for (const k of FACE_KEYS) {
    const d = DEFAULT_CFG[k];
    const blk = document.createElement('div');
    blk.className = 'faceblk';
    blk.id = 'faceblk_' + k;
    blk.innerHTML =
      `<div class="faceblk-header">`
      + `<div><span class="fname">${FACE_NAMES[k]}</span><span class="fdim">${dims[k]}</span></div>`
      + (k !== 'floor' ? `<span class="joint-badge" id="badge_${k}" style="display:none">🔒 已對縫</span>` : '<span class="joint-badge" style="background:#e3f2fd;color:#1976d2;border-color:#bbdefb">基準面</span>')
      + `</div>`
      + `<div class="row2">`
      + `<div><label>實測${dimLabels[k][0]}</label><input id="${k}_fw" type="number" value="${dimDefaults[k][0]}"></div>`
      + `<div><label>實測${dimLabels[k][1]}</label><input id="${k}_fh" type="number" value="${dimDefaults[k][1]}"></div>`
      + `</div>`
      + `<div class="row3">`
      + `<div><label>方向</label><select id="${k}_dir">`
      + `<option value="H"${d.dir === 'H' ? ' selected' : ''}>橫貼</option>`
      + `<option value="V"${d.dir === 'V' ? ' selected' : ''}>直貼</option></select></div>`
      + `<div><label>工法</label><select id="${k}_mode">`
      + `<option value="grid"${d.mode === 'grid' ? ' selected' : ''}>齊貼</option>`
      + `<option value="55"${d.mode === '55' ? ' selected' : ''}>5-5半丁</option>`
      + `<option value="37"${d.mode === '37' ? ' selected' : ''}>3-7步</option>`
      + `<option value="28"${d.mode === '28' ? ' selected' : ''}>2-8步</option></select></div>`
      + `</div>`
      + `<div class="row2">`
      + `<div><label>水平起磚（X）</label><select id="${k}_xalign">`
      + `<option value="left"${d.xalign === 'left' ? ' selected' : ''}>靠左起磚</option>`
      + `<option value="right"${d.xalign === 'right' ? ' selected' : ''}>靠右起磚</option>`
      + `<option value="center"${d.xalign === 'center' ? ' selected' : ''}>水平中軸</option>`
      + `<option value="custom"${d.xalign === 'custom' ? ' selected' : ''}>自訂距左X</option></select></div>`
      + `<div><label>距左 X (cm)</label><input id="${k}_xoff" type="number" value="0" min="0"></div>`
      + `</div>`
      + `<div class="row2">`
      + `<div><label>垂直起磚（Y）</label><select id="${k}_yalign">`
      + `<option value="bottom"${d.yalign === 'bottom' ? ' selected' : ''}>由地起磚</option>`
      + `<option value="top"${d.yalign === 'top' ? ' selected' : ''}>由天花向下</option>`
      + `<option value="center"${d.yalign === 'center' ? ' selected' : ''}>垂直置中</option>`
      + `<option value="custom"${d.yalign === 'custom' ? ' selected' : ''}>自訂起磚高Y</option></select></div>`
      + `<div><label>起磚高 Y (cm)</label><input id="${k}_yoff" type="number" value="0" min="0"></div>`
      + `</div>`
      + `<div class="row2">`
      + `<div><label>此面磚 長×寬</label><input id="${k}_tile" type="text" placeholder="空白＝共用"></div>`
      + `<div><label>紅線 X (cm)</label><input id="${k}_marks" type="text" placeholder="例 59, 142"></div>`
      + `</div>`
      + (k === 'floor' ? '' : `<div><label title="牆面在這裡轉折（凹凸的側面、另一段牆）：不同平面，跨過的磚要切開；畫紅線">牆面轉折 X (cm)</label><input id="${k}_jogs" type="text" placeholder="例 147"></div>`)
      + `<div><label>分區磚（同一面混 2～3 種磚，分號隔開，後寫的蓋在上面）</label><input id="${k}_zones" type="text" placeholder="例 117-207: 14.8×14.8 主秀壁; 高 100-130: 15×30 腰帶"></div>`
      + (k === 'floor' ? '' : `<div class="zone-add">加入：<button type="button" data-zone="${k}" data-tpl="0-60: 30×60 分區">＋左右分區</button>`
        + `<button type="button" data-zone="${k}" data-tpl="高 0-120: 30×60 下段">＋上下分段</button>`
        + `<button type="button" data-zone="${k}" data-tpl="高 100-130: 15×30 腰帶">＋腰帶</button></div>`)
      + (k === 'floor' ? `<div><label>外框頂點 x,y（由左上量，空白＝整個矩形）</label><input id="floor_outline" type="text" placeholder="例 0,29 117,29 117,0 207,0 207,172 0,172"></div>` : '')
      + `<label class="openable" style="margin-top:6px"><input type="checkbox" id="${k}_skip"> 此面不鋪磚</label>`;
    host.appendChild(blk);
  }
}

function syncOpBlocks() {
  if ($('doorBlk')) $('doorBlk').classList.toggle('disabled', !$('door_on').checked);
  if ($('winBlk')) $('winBlk').classList.toggle('disabled', !$('win_on').checked);
}

// 空間 L／W／H 帶到五面：L＝A、C 牆長（地坪深），W＝B、D 牆長（地坪寬，平面 B 在上），H＝牆高
// only：只改動到的那一個（'L'／'W'／'H'），其他面的實測尺寸（例如 DXF 匯入的）不要被洗掉
function syncFaceDims(override, only) {
  const L = num('L', 600), W = num('W', 400), H = num('H', 280);
  const setW = (k, v) => { $(k + '_fw').value = v; }, setH = (k, v) => { $(k + '_fh').value = v; };
  if (!only || only === 'L') { setW('A', L); setW('C', L); setH('floor', L); }
  if (!only || only === 'W') { setW('B', W); setW('D', W); setW('floor', W); }
  // 半高檯側面攤進立面的那幾面：立面寬＝牆長＋攤開的側面
  for (const k of ['A', 'B', 'C', 'D']) {
    const ret = typeof ledgeReturnTotal === 'function' ? ledgeReturnTotal(k) : 0;
    if (ret && (!only || only === ((k === 'A' || k === 'C') ? 'L' : 'W'))) setW(k, Math.round(((k === 'A' || k === 'C' ? L : W) + ret) * 10) / 10);
  }
  if (!only || only === 'H') ['A', 'B', 'C', 'D'].forEach(k => setH(k, H));
  if (override) {
    for (const k in override) { setW(k, override[k][0]); setH(k, override[k][1]); }
  }
}

// 🎮 滑鼠畫布互動引擎（支援 CAD 自動鎖點磁吸與地壁對縫）
function initCanvasInteraction() {
  const cv = $('cv');
  const inspector = $('tileInspector');

  cv.addEventListener('mousedown', e => {
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);

    for (const t of interactiveTargets) {
      if (t.type === 'origin') {
        const dist = Math.hypot(mx - t.xPx, my - t.yPx);
        if (dist <= t.radius + 6) {
          activeDrag = {
            type: 'origin', faceKey: t.faceKey, isElevation: t.isElevation,
            ox: t.ox, oy: t.oy, fw: t.fw, fh: t.fh, sc: t.sc,
            curX: t.xPx, curY: t.yPx,
            curValX: Math.max(0, (t.xPx - t.ox) / t.sc),
            curValY: t.isElevation ? Math.max(0, t.fh - (t.yPx - t.oy) / t.sc) : Math.max(0, (t.yPx - t.oy) / t.sc)
          };
          $('cadFace').value = t.faceKey;
          cv.style.cursor = 'grabbing';
          return;
        }
      } else if (t.type === 'origin2') {
        const dist = Math.hypot(mx - t.xPx, my - t.yPx);
        if (dist <= t.radius + 6) {
          activeDrag = {
            type: 'origin2', faceKey: t.faceKey,
            ox: t.ox, oy: t.oy, fw: t.fw, fh: t.fh, sc: t.sc,
            curX: t.xPx, curY: t.yPx
          };
          cv.style.cursor = 'grab';
          return;
        }
      } else if ((t.type === 'columnLine' || t.type === 'columnFloor') && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          activeDrag = {
            type: t.type, faceKey: t.faceKey,
            ox: t.ox, oy: t.oy, fw: t.fw, fh: t.fh, sc: t.sc,
            startX: t.colX, startMx: mx, startMy: my, faceFw: t.faceFw,
            curX: mx, curValX: t.colX
          };
          cv.style.cursor = (t.type === 'columnFloor' && (t.faceKey === 'A' || t.faceKey === 'C')) ? 'ns-resize' : 'ew-resize';
          return;
        }
      } else if (t.type === 'settingOutX' && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          activeDrag = {
            type: 'settingOutX', faceKey: t.faceKey, isElevation: t.isElevation,
            ox: t.ox, oy: t.oy, fw: t.fw, fh: t.fh, sc: t.sc,
            curX: t.xPx, curY: my,
            curValX: Math.max(0, (t.xPx - t.ox) / t.sc),
            curValY: 0
          };
          $('cadFace').value = t.faceKey;
          cv.style.cursor = 'ew-resize';
          return;
        }
      } else if (t.type === 'settingOutY' && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          activeDrag = {
            type: 'settingOutY', faceKey: t.faceKey, isElevation: t.isElevation,
            ox: t.ox, oy: t.oy, fw: t.fw, fh: t.fh, sc: t.sc,
            curX: mx, curY: t.yPx,
            curValX: 0,
            curValY: t.isElevation ? Math.max(0, t.fh - (t.yPx - t.oy) / t.sc) : Math.max(0, (t.yPx - t.oy) / t.sc)
          };
          $('cadFace').value = t.faceKey;
          cv.style.cursor = 'ns-resize';
          return;
        }
      } else if ((t.type === 'door' || t.type === 'window') && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          activeDrag = {
            type: t.type, faceKey: t.faceKey, op: t.op,
            ox: t.ox, oy: t.oy, fw: t.fw, fh: t.fh, sc: t.sc,
            startMx: mx, startMy: my,
            origX: t.op.x, origY: t.op.y
          };
          cv.style.cursor = 'move';
          return;
        }
      }
    }
  });

  cv.addEventListener('mousemove', e => {
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);

    if (activeDrag) {
      const p = params();
      const dims = faceDims(p);
      const allOps = openings(dims);
      const snaps = getSnapPoints(p, dims, activeDrag.faceKey, allOps);

      if (activeDrag.type === 'origin' || activeDrag.type === 'settingOutX' || activeDrag.type === 'settingOutY') {
        let valX = Math.max(0, Math.min(activeDrag.fw, (mx - activeDrag.ox) / activeDrag.sc));
        let valY = activeDrag.isElevation
          ? Math.max(0, Math.min(activeDrag.fh, activeDrag.fh - (my - activeDrag.oy) / activeDrag.sc))
          : Math.max(0, Math.min(activeDrag.fh, (my - activeDrag.oy) / activeDrag.sc));

        // CAD 鎖點磁吸判定（距離 <= 6cm 自動吸附）
        let snapX = null, snapY = null;
        if (activeDrag.type === 'origin' || activeDrag.type === 'settingOutX') {
          for (const sp of snaps) {
            if (sp.axis === 'X' && Math.abs(valX - sp.val) <= 6) {
              snapX = sp;
              break;
            }
          }
        }
        if (activeDrag.type === 'origin' || activeDrag.type === 'settingOutY') {
          for (const sp of snaps) {
            if (sp.axis === 'Y' && Math.abs(valY - sp.val) <= 6) {
              snapY = sp;
              break;
            }
          }
        }

        if (snapX) {
          valX = snapX.val;
          currentSnap = {
            axis: 'X', val: snapX.val, label: snapX.label,
            px: activeDrag.ox + valX * activeDrag.sc,
            py: my
          };
        } else if (snapY) {
          valY = snapY.val;
          currentSnap = {
            axis: 'Y', val: snapY.val, label: snapY.label,
            px: mx,
            py: activeDrag.isElevation
              ? activeDrag.oy + (activeDrag.fh - valY) * activeDrag.sc
              : activeDrag.oy + valY * activeDrag.sc
          };
        } else {
          currentSnap = null;
        }

        activeDrag.curX = mx; activeDrag.curY = my;
        activeDrag.curValX = valX; activeDrag.curValY = valY;

        // 若手動微調個別立面的水平起磚線，自動解除全室鎖定
        if (activeDrag.faceKey !== 'floor' && lockAllJoints && (activeDrag.type === 'origin' || activeDrag.type === 'settingOutX')) {
          lockAllJoints = false;
          updateLockUI();
        }

        if (activeDrag.type === 'origin') {
          $(activeDrag.faceKey + '_xalign').value = 'custom';
          $(activeDrag.faceKey + '_xoff').value = Math.round(valX * 10) / 10;
          $(activeDrag.faceKey + '_yalign').value = 'custom';
          $(activeDrag.faceKey + '_yoff').value = Math.round(valY * 10) / 10;
        } else if (activeDrag.type === 'settingOutX') {
          $(activeDrag.faceKey + '_xalign').value = 'custom';
          $(activeDrag.faceKey + '_xoff').value = Math.round(valX * 10) / 10;
        } else if (activeDrag.type === 'settingOutY') {
          $(activeDrag.faceKey + '_yalign').value = 'custom';
          $(activeDrag.faceKey + '_yoff').value = Math.round(valY * 10) / 10;
        }
        refresh();
      } else if (activeDrag.type === 'columnLine' || activeDrag.type === 'columnFloor') {
        let valX;
        if (activeDrag.type === 'columnFloor') {
          // 平面上沿著牆拖：B 往右、C 往下為正；A、D 跟平面左右相反
          const colW = parseFloat($('col_w').value) || 50;
          const dx = (mx - activeDrag.startMx) / activeDrag.sc, dy = (my - activeDrag.startMy) / activeDrag.sc;
          const along = { B: dx, C: dy, D: -dx, A: -dy }[activeDrag.faceKey] || dx;
          valX = Math.max(0, Math.min((activeDrag.faceFw || activeDrag.fw) - colW, activeDrag.startX + along));
        } else {
          valX = Math.max(5, Math.min(activeDrag.fw - 5, (mx - activeDrag.ox) / activeDrag.sc));
        }
        activeDrag.curX = mx;
        activeDrag.curValX = valX;
        $('col_x').value = Math.round(valX);
        refresh();
      } else if (activeDrag.type === 'origin2') {
        const colX = parseFloat($('col_x').value) || 0;
        const absX = (mx - activeDrag.ox) / activeDrag.sc;
        const xoffRight = Math.max(0, absX - colX);
        activeDrag.curX = mx;
        activeDrag.curValX = xoffRight;
        $('col_xoff_right').value = Math.round(xoffRight * 10) / 10;
        refresh();
      } else if (activeDrag.type === 'door' || activeDrag.type === 'window') {
        const dx = (mx - activeDrag.startMx) / activeDrag.sc;
        const dy = (my - activeDrag.startMy) / activeDrag.sc;

        const newX = Math.max(0, Math.round(activeDrag.origX + dx));
        // 立面 Y 軸為地面向上，因此向下拖曳為減小高度
        const newY = Math.max(0, Math.round(activeDrag.origY - dy));

        if (activeDrag.op && activeDrag.op.id && typeof openingsList !== 'undefined') {
          const item = openingsList.find(o => o.id === activeDrag.op.id);
          if (item) {
            item.x = newX;
            if (item.kind === 'window') item.y = newY;
            const inpX = document.querySelector(`input[data-id="${item.id}"][data-field="x"]`);
            if (inpX) inpX.value = newX;
            const inpY = document.querySelector(`input[data-id="${item.id}"][data-field="y"]`);
            if (inpY && item.kind === 'window') inpY.value = newY;
          }
        }
        refresh();
      }
      if (inspector) inspector.style.display = 'none';
      return;
    }

    // 游標懸停提示
    let hitAny = false;
    for (const t of interactiveTargets) {
      if (t.type === 'origin' || t.type === 'origin2') {
        if (Math.hypot(mx - t.xPx, my - t.yPx) <= t.radius + 6) {
          cv.style.cursor = 'grab'; hitAny = true; break;
        }
      } else if ((t.type === 'settingOutX' || t.type === 'columnLine' || t.type === 'columnFloor') && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          cv.style.cursor = 'ew-resize'; hitAny = true; break;
        }
      } else if (t.type === 'settingOutY' && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          cv.style.cursor = 'ns-resize'; hitAny = true; break;
        }
      } else if ((t.type === 'door' || t.type === 'window') && t.box) {
        const [bx, by, bw, bh] = t.box;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          cv.style.cursor = 'move'; hitAny = true; break;
        }
      }
    }

    // X 光磁磚透視卡
    if (!hitAny) {
      let hoveredTileItem = null;
      for (const t of interactiveTargets) {
        if (t.type === 'tile') {
          const [bx, by, bw, bh] = t.box;
          if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
            hoveredTileItem = t;
            break;
          }
        }
      }
      if (hoveredTileItem && inspector) {
        cv.style.cursor = 'crosshair';
        const tile = hoveredTileItem.tile;
        const ratio = ((tile.wL * tile.wW) / (tile.tL * tile.tW) * 100).toFixed(0);
        inspector.style.display = 'block';
        inspector.style.left = (e.pageX + 14) + 'px';
        inspector.style.top = (e.pageY + 14) + 'px';
        inspector.innerHTML =
          `<div class="title">🔍 ${hoveredTileItem.faceName} 磁磚檢查</div>`
          + `實鋪尺寸：<b>${tile.wL.toFixed(1)} × ${tile.wW.toFixed(1)} cm</b><br>`
          + `原磚規格：${tile.tL} × ${tile.tW} cm<br>`
          + `狀態：${tile.full ? '<span style="color:#7bed9f">整磚 (100%)</span>' : `裁切磚 (保留 ${ratio}%)`}<br>`
          + (tile.danger ? `<div class="danger">⚠️ ${tile.avoid ? '避免小料' : '小料'}（露出最短邊 ${tile.visMin.toFixed(1)} cm）</div>` : '');
      } else if (inspector) {
        inspector.style.display = 'none';
        cv.style.cursor = 'default';
      }
    } else if (inspector) {
      inspector.style.display = 'none';
    }
  });

  window.addEventListener('mouseup', () => {
    if (activeDrag) {
      activeDrag = null;
      currentSnap = null;
      cv.style.cursor = 'default';
      refresh();
    }
  });

  cv.addEventListener('mouseleave', () => {
    if (inspector) inspector.style.display = 'none';
    if (activeDrag) {
      activeDrag = null;
      currentSnap = null;
      refresh();
    }
  });
}

// 📐 初始化 CAD 放樣座標與鎖點工具列
function initCADToolbar() {
  const selFace = $('cadFace');
  if (!selFace) return;

  selFace.addEventListener('change', syncCADToolbar);

  $('cadApplyBtn').addEventListener('click', () => {
    const k = selFace.value;
    const x = parseFloat($('cadX').value) || 0;
    const y = parseFloat($('cadY').value) || 0;
    $(k + '_xalign').value = 'custom';
    $(k + '_xoff').value = x;
    $(k + '_yalign').value = 'custom';
    $(k + '_yoff').value = y;
    refresh();
  });

  // 🔗 一鍵地壁對縫
  $('cadAlignFloorBtn').addEventListener('click', () => {
    const k = selFace.value;
    if (k === 'floor') {
      alert('地坪為對縫基準面，請選擇 A、B、C 或 D 立面進行對縫！');
      return;
    }
    const p = params();
    const dims = faceDims(p);
    const bestX = calcJointAlignment(p, dims, k);
    $(k + '_xalign').value = 'custom';
    $(k + '_xoff').value = bestX;
    $('cadX').value = bestX;
    refresh();
  });

  // 🧲 吸附門框（取當前立面上第一個門的左緣；改為多門窗後不再有 door_x 欄位）
  $('cadSnapDoorBtn').addEventListener('click', () => {
    const k = selFace.value;
    const door = openingsList.find(o => o.kind === 'door' && o.face === k);
    if (!door) {
      alert(`${FACE_NAMES[k]} 上沒有門，請先選擇有門的立面，或在左側新增開門。`);
      return;
    }
    const doorX = parseFloat(door.x) || 0;
    $(k + '_xalign').value = 'custom';
    $(k + '_xoff').value = doorX;
    $('cadX').value = doorX;
    refresh();
  });

  // 🧲 吸附窗台（取當前立面上第一個窗的窗台高度）
  $('cadSnapWinBtn').addEventListener('click', () => {
    const k = selFace.value;
    const win = openingsList.find(o => o.kind === 'window' && o.face === k);
    if (!win) {
      alert(`${FACE_NAMES[k]} 上沒有窗，請先選擇有窗的立面，或在左側新增開窗。`);
      return;
    }
    const winY = parseFloat(win.y) || 0;
    $(k + '_yalign').value = 'custom';
    $(k + '_yoff').value = winY;
    $('cadY').value = winY;
    refresh();
  });

  // ⚖️ 水平居中對稱
  $('cadSnapCenterBtn').addEventListener('click', () => {
    const k = selFace.value;
    $(k + '_xalign').value = 'center';
    refresh();
  });

  // 🔒 鎖定／解鎖四面對縫
  const toggleLock = () => {
    lockAllJoints = !lockAllJoints;
    if (lockAllJoints) {
      applyLockAllJoints();
    }
    updateLockUI();
    refresh();
  };
  if ($('cadLockJointsBtn')) $('cadLockJointsBtn').addEventListener('click', toggleLock);
  if ($('btnLockJointsPanel')) $('btnLockJointsPanel').addEventListener('click', toggleLock);
}

// ✨ 一鍵智能消滅小料事件綁定
function initAutoFix() {
  const btn = $('btnAutoFix');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const p = params();
    const rows = computeAll(p);
    const dangerFaces = rows.filter(s => s.r.danger > 0);

    if (!dangerFaces.length) {
      alert('太棒了！目前全室五面均無危險碎磚，配置已非常安全。');
      return;
    }

    let fixCount = 0;
    for (const df of dangerFaces) {
      const res = autoFixSlivers(df.key);
      if (res.success) {
        $(df.key + '_xalign').value = 'custom';
        $(df.key + '_xoff').value = res.bestX;
        fixCount++;
      }
    }
    refresh();
    alert(`✨ 智能優化完成！已為 ${fixCount} 個牆面自動微調放樣基準，成功避開危險小料！`);
  });
}

// 🧠 自動找最佳起磚點：列出幾個方案比較，按「套用」改五面起磚設定
let lastPlans = null;

function renderPlans(plans) {
  const host = $('planResults');
  if (!host) return;
  if (!plans) { host.style.display = 'none'; host.innerHTML = ''; return; }
  const labels = [];
  plans.forEach(pl => Object.keys(pl.score.byLabel).forEach(l => { if (!labels.includes(l)) labels.push(l); }));
  const cur = plans.find(pl => pl.id === 'current');
  const diff = (pl, l) => {
    const d = (pl.score.byLabel[l] || 0) - (cur.score.byLabel[l] || 0);
    return pl === cur || !d ? '' : ` <small class="muted">(${d > 0 ? '+' : ''}${d})</small>`;
  };
  host.style.display = 'block';
  host.innerHTML = `<h3>🧠 起磚方案比較（先比 L 型切割，再比小料片數，最後比浪費面積）</h3>
    <table><thead><tr><th>方案</th><th>說明</th><th>L 型</th><th>小料</th>${labels.map(l => `<th>${l}（片）</th>`).join('')}<th>浪費 m²</th><th></th></tr></thead><tbody>
    ${plans.map(pl => `<tr class="${pl.best ? 'best' : ''}"><td>${pl.best ? '<span class="star">★推薦</span> ' : ''}${pl.name}</td><td class="muted">${pl.desc}</td>
      <td>${pl.score.lcut}</td><td>${pl.score.danger}</td>${labels.map(l => `<td>${fmt(pl.score.byLabel[l] || 0)}${diff(pl, l)}</td>`).join('')}
      <td>${(pl.score.waste / 10000).toFixed(2)}</td>
      <td>${pl.id === 'current' ? '<span class="muted">目前</span>' : `<button data-plan="${pl.id}">套用</button>`}</td></tr>`).join('')}
    </tbody></table>
    <div class="muted" style="margin-top:6px">牆面左右逐公分試、上下試由地起與磚縫對齊門頂／窗台；改了設定請再按一次重新比較。</div>`;
  host.querySelectorAll('button[data-plan]').forEach(b => b.addEventListener('click', () => applyPlan(b.dataset.plan)));
}

function applyPlan(id) {
  const pl = (lastPlans || []).find(x => x.id === id);
  if (!pl) return;
  for (const k of Object.keys(pl.over)) {
    for (const f of ['xalign', 'xoff', 'yalign', 'yoff']) {
      if (pl.over[k][f] !== undefined && $(k + '_' + f)) $(k + '_' + f).value = pl.over[k][f];
    }
  }
  // 四面對縫方案：打開鎖定，之後動地磚牆磚會跟著
  lockAllJoints = id === 'joint';
  refresh();
  lastPlans = searchPlans(params());
  renderPlans(lastPlans);
}

function initPlanSearch() {
  const btn = $('btnSearchPlans');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = '🧠 計算中…';
    // 讓按鈕文字先畫出來再算
    setTimeout(() => {
      try {
        lastPlans = searchPlans(params());
        renderPlans(lastPlans);
      } finally {
        btn.disabled = false;
        btn.textContent = '🧠 自動找最佳起磚點';
      }
    }, 30);
  });
}

// 初始化與事件綁定
function initApp() {
  buildPanels();

  document.querySelectorAll('.presets button[data-p]').forEach(b => {
    b.addEventListener('click', () => {
      const pr = PRESETS[b.dataset.p];
      // 內建案例沒有半高檯（先清掉，牆寬才不會多加上一張圖攤開的側面）
      ledgeList = [];
      renderLedgesUI();
      $('L').value = pr.L; $('W').value = pr.W; $('H').value = pr.H;
      $('TL').value = pr.TL; $('TW').value = pr.TW;
      syncFaceDims(pr.faces);
      // 換成內建案例：清掉上一張匯入圖的材料與圖名
      projectMaterials = [];
      faceOverlays = {};
      floorOutline = pr.outline || null;
      renderMaterialsUI();
      projectMeta = Object.assign({}, EMPTY_META);
      renderProjectMeta();
      // 換情境＝各面設定全部回到預設（再套上案例自己的起磚點、紅線、分區），不沿用上一張圖的分區、紅線、磚尺寸
      {
        lockAllJoints = false;
        lastPlans = null;
        renderPlans(null);
        for (const k of FACE_KEYS) {
          const c = Object.assign({}, DEFAULT_CFG[k], (pr.cfg || {})[k] || {});
          ['dir', 'mode', 'xalign', 'yalign', 'xoff', 'yoff'].forEach(f => { $(k + '_' + f).value = c[f]; });
          $(k + '_tile').value = c.TL ? `${c.TL}×${c.TW}` : '';
          $(k + '_marks').value = (c.marks || []).join(', ');
          if ($(k + '_jogs')) $(k + '_jogs').value = (c.jogs || []).join(', ');
          $(k + '_zones').value = formatZones(c.zones);
          $(k + '_skip').checked = !!c.skip;
        }
      }
      if (pr.openings) applyOpeningPreset(pr.openings);
      refresh();
    });
  });

  ['L', 'W', 'H'].forEach(id => $(id).addEventListener('input', () => {
    syncFaceDims(null, id);
    refresh();
  }));

  $('useReuse').addEventListener('change', refresh);
  ['TL', 'TW', 'joint', 'price', 'spare', 'smallTh', 'avoidTh', 'floorCover'].forEach(id => $(id).addEventListener('input', refresh));
  FACE_KEYS.forEach(k => ['_fw', '_fh'].forEach(s => $(k + s).addEventListener('input', refresh)));
  FACE_KEYS.forEach(k => ['_dir', '_mode', '_xalign', '_yalign', '_skip'].forEach(s => $(k + s).addEventListener('change', refresh)));
  FACE_KEYS.forEach(k => ['_xoff', '_yoff', '_tile', '_marks', '_zones', '_jogs'].forEach(s => { if ($(k + s)) $(k + s).addEventListener('input', refresh); }));
  $('floor_outline').addEventListener('input', e => { floorOutline = parseOutline(e.target.value); refresh(); });
  // 分區快速加入：塞一段範本進去，數字再自己改
  document.querySelectorAll('button[data-zone]').forEach(b => b.addEventListener('click', () => {
    const inp = $(b.dataset.zone + '_zones');
    inp.value = (inp.value.trim() ? inp.value.trim().replace(/[;；]$/, '') + '; ' : '') + b.dataset.tpl;
    inp.focus();
    refresh();
  }));

  $('syncWalls').addEventListener('click', () => {
    ['B', 'C', 'D'].forEach(k => {
      $(k + '_dir').value = $('A_dir').value;
      $(k + '_mode').value = $('A_mode').value;
      $(k + '_xalign').value = $('A_xalign').value;
      $(k + '_yalign').value = $('A_yalign').value;
      $(k + '_xoff').value = $('A_xoff').value;
      $(k + '_yoff').value = $('A_yoff').value;
    });
    refresh();
  });

  $('viewUnfold').addEventListener('click', () => {
    view = 'unfold';
    $('viewUnfold').classList.add('on');
    $('viewSingle').classList.remove('on');
    $('faceTabs').style.display = 'none';
    refresh();
  });

  $('viewSingle').addEventListener('click', () => {
    view = 'single';
    $('viewSingle').classList.add('on');
    $('viewUnfold').classList.remove('on');
    $('faceTabs').style.display = 'flex';
    refresh();
  });

  // 🎨／✏️ 彩色方案與施工線稿切換（同一份資料，兩種給不同人看的畫法）
  const setStyle = st => {
    drawStyle = st;
    $('styleColor').classList.toggle('on', st === 'color');
    $('styleLine').classList.toggle('on', st === 'line');
    $('legendColor').style.display = st === 'color' ? 'flex' : 'none';
    $('legendLine').style.display = st === 'line' ? 'flex' : 'none';
    refresh();
  };
  $('styleColor').addEventListener('click', () => setStyle('color'));
  $('styleLine').addEventListener('click', () => setStyle('line'));

  document.querySelectorAll('#faceTabs button').forEach(b => {
    b.addEventListener('click', () => {
      face = b.dataset.f;
      document.querySelectorAll('#faceTabs button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      refresh();
    });
  });

  initCanvasInteraction();
  initCADToolbar();
  initAutoFix();
  initDxfExport();
  initPlanSearch();
  initColumnModule();
  initOpeningsModule();
  initLedgesModule();
  initProjectIO();
  initDxfImport();
  initMaterials();
  initExport();

  refresh();
}

document.addEventListener('DOMContentLoaded', initApp);
