// 🖨️ 匯出：施工圖 PDF（瀏覽器「列印 → 另存為 PDF」，A3 橫式兩頁）與 PNG 圖片
// 第 1 頁＝施工圖＋圖框標題欄；第 2 頁＝材料表＋五面算料表＋結論

// 用較高解析度重畫一次畫布取圖，再畫回螢幕解析度
function renderHiRes(scale) {
  window.__exportDpr = scale;
  refresh();
  const url = $('cv').toDataURL('image/png');
  window.__exportDpr = 0;
  refresh();
  return url;
}

function todayText() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function preparePrintSheet() {
  const img = renderHiRes(4);
  const m = projectMeta || {};
  const title = [
    ['工程名稱', m.project || '—'],
    ['圖名', m.drawingName || '磁磚放樣施工圖'],
    ['圖面', drawStyle === 'line' ? '施工線稿' : '彩色方案'],
    ['日期', todayText()],
    ['比例', '示意（尺寸以標註為準）'],
    ['圖號', m.number || '—']
  ];
  const mats = projectMaterials.length
    ? projectMaterials.map(mt => `<tr>
        <td class="ps-photo">${mt.photo ? `<img src="${mt.photo}" alt="">` : ''}</td>
        <td><b>${escapeHtml(mt.role)}</b></td><td>${escapeHtml(mt.code)}</td><td>${escapeHtml(mt.spec)}</td><td>${escapeHtml(mt.grout)}</td></tr>`).join('')
    : `<tr><td></td><td colspan="4">共用磁磚 ${params().TL}×${params().TW} cm</td></tr>`;
  $('printSheet').innerHTML = `
    <section class="ps-page">
      <img class="ps-drawing" src="${img}" alt="施工圖">
      <table class="ps-title"><tr>
        ${title.map(([k, v]) => `<td><small>${k}</small><div>${escapeHtml(v)}</div></td>`).join('')}
        <td class="ps-warn">尺寸若有誤差 依現場放樣 再行溝通</td>
      </tr></table>
    </section>
    <section class="ps-page ps-break">
      <h2>材料表</h2>
      <table class="ps-mats"><thead><tr><th></th><th>用途</th><th>型號</th><th>尺寸與名稱</th><th>填縫劑</th></tr></thead><tbody>${mats}</tbody></table>
      <h2>五面明細與算料</h2>
      ${$('tbl').outerHTML.replace('id="tbl"', '')}
      <p class="ps-concl">${escapeHtml($('concl').textContent)}</p>
      <div class="ps-quote">${$('quote') ? $('quote').innerHTML : ''}</div>
      <div class="ps-quote"><h3>裁切清單與剩料回收</h3>${$('cutlist') ? $('cutlist').innerHTML : ''}</div>
      <p class="ps-note">${escapeHtml(document.querySelector('#tbl ~ .note') ? document.querySelector('#tbl ~ .note').textContent : '')}</p>
    </section>`;
}

function exportPdf() {
  preparePrintSheet();
  // 等圖片解碼完再叫出列印視窗，免得第一頁空白
  const img = document.querySelector('#printSheet .ps-drawing');
  const go = () => window.print();
  if (img.complete) go(); else img.onload = go;
}

function exportPng() {
  const a = document.createElement('a');
  a.href = renderHiRes(3);
  a.download = 'tile-setting-out.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function initExport() {
  initBatchExport();
  if ($('btnExportPdf')) $('btnExportPdf').addEventListener('click', exportPdf);
  if ($('btnExportPng')) $('btnExportPng').addEventListener('click', exportPng);
}

// ── 📚 整份 DXF：每張圖各算一次，產生「全案總叫料表」＋每張一頁施工圖 ──

// 目前畫面這張圖：依材料合計（不同尺寸分開），附上對應的材料型號
function sheetMaterialTotals() {
  const byLabel = {};
  const rows = computeAll(params());
  for (const s of rows) {
    for (const g of s.r.groups) {
      const t = byLabel[g.label] || (byLabel[g.label] = { label: g.label, TL: g.TL, TW: g.TW, total: 0, full: 0, cut: 0, net: 0, danger: 0, faces: [] });
      ['total', 'full', 'cut', 'net', 'danger'].forEach(k => { t[k] += g[k]; });
      t.faces.push(s.name);
      const zoneName = g.key !== 'main' ? g.label.replace(/\s[\d.]+×[\d.]+$/, '') : '';
      t.mat = t.mat || matOf(g.TL, g.TW, zoneName);
    }
  }
  // 勾了「採用剩料回收」：扣掉回收省下的片數
  if ($('useReuse') && $('useReuse').checked) {
    const reuse = reuseByMaterial(rows, params());
    Object.values(byLabel).forEach(t => { t.total -= (reuse[t.label] && reuse[t.label].saved) || 0; });
  }
  return Object.values(byLabel);
}

// 一張一張套用、計算、出圖，最後恢復原本的畫面
function collectAllSheets(sheets, withImages) {
  const saved = collectProject();
  const out = [];
  sheets.forEach((s, i) => {
    const res = validateProject(JSON.parse(JSON.stringify(s.project)));
    if (res.errors.length) { out.push({ i, sheet: s, error: res.errors.join('、') }); return; }
    applyProject(res.project);
    out.push({
      i, sheet: s, totals: sheetMaterialTotals(),
      danger: computeAll(params()).reduce((a, r) => a + r.r.danger, 0),
      lcut: computeAll(params()).reduce((a, r) => a + (r.r.lcut || 0), 0),
      warnings: s.warnings,
      img: withImages ? renderHiRes(3) : null
    });
  });
  const back = validateProject(saved);
  if (!back.errors.length) applyProject(back.project);
  return out;
}

// 全案合計：同用途＋同型號＋同尺寸才合在一起
function projectTotals(results) {
  const all = {};
  for (const r of results.filter(r => !r.error)) {
    for (const t of r.totals) {
      const m = t.mat || {};
      const key = [m.role || t.label, m.code || '', Math.min(t.TL, t.TW), Math.max(t.TL, t.TW)].join('|');
      const a = all[key] || (all[key] = { role: m.role || t.label, code: m.code || '', spec: m.spec || t.label, grout: m.grout || '', total: 0, net: 0, danger: 0, sheets: 0 });
      a.total += t.total; a.net += t.net; a.danger += t.danger; a.sheets++;
      a.key = a.key || matKey(t.mat);
    }
  }
  // 全案一起下單：合計後再乘備品（不是每張圖各自進位）；單價查價格表，沒有型號用共用單價
  const spare = params().spare, fallback = params().price;
  return Object.values(all).map(a => {
    const order = orderQty(a.total, spare);
    const price = a.key ? (priceBook[a.key] || 0) : fallback;
    return Object.assign(a, { order, price, amount: price > 0 ? order * price : null });
  }).sort((a, b) => a.role.localeCompare(b.role, 'zh-Hant') || a.code.localeCompare(b.code));
}

// 工程名稱取各張圖最常出現的那個（範本圖的標題欄常是空白或「圖名」）
function commonProject(sheets) {
  const n = {};
  sheets.forEach(s => { const p = s.meta.project; if (p && p !== '圖名' && p !== '工程名稱') n[p] = (n[p] || 0) + 1; });
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || '—';
}

const sheetName = r => r.sheet.meta.drawingName || `第 ${r.i + 1} 張（無圖名）`;
const totalsText = r => r.error ? `無法匯入：${r.error}` : r.totals.map(t => `${t.label} ${t.total} 片`).join('／');

function batchExportPdf(sheets) {
  const results = collectAllSheets(sheets, true);
  const totals = projectTotals(results);
  const proj = commonProject(sheets);
  const lossOf = a => a.net > 0 ? ((a.total - a.net) / a.net * 100).toFixed(1) : '0.0';
  const cover = `
    <section class="ps-page">
      <h1 class="ps-h1">全案總叫料表</h1>
      <p class="ps-sub">工程名稱：${escapeHtml(proj)}　｜　共 ${results.length} 張施工圖　｜　${todayText()}${$('useReuse') && $('useReuse').checked ? '　｜　已採用剩料回收' : ''}</p>
      <h2>材料總計</h2>
      <table class="ps-mats"><thead><tr><th>用途</th><th>型號</th><th>尺寸與名稱</th><th>填縫劑</th><th>總叫料（片）</th><th>理論片數</th><th>損耗率%</th><th>小料</th><th>用到的圖</th><th>下單（備品 ${params().spare}%）</th><th>單價</th><th>金額</th></tr></thead>
        <tbody>${totals.map(a => `<tr><td><b>${escapeHtml(a.role)}</b></td><td>${escapeHtml(a.code)}</td><td>${escapeHtml(a.spec)}</td><td>${escapeHtml(a.grout)}</td>
          <td><b>${a.total}</b></td><td>${a.net}</td><td>${lossOf(a)}</td><td>${a.danger || '—'}</td><td>${a.sheets} 張</td>
          <td><b>${a.order}</b></td><td>${a.price > 0 ? fmt(a.price) : '未填'}</td><td>${a.amount !== null ? fmt(a.amount) : '—'}</td></tr>`).join('')}
          <tr class="total"><td colspan="11">全案合計${totals.some(a => a.amount === null) ? `（${totals.filter(a => a.amount === null).length} 種材料未填單價）` : ''}</td><td><b>${fmt(totals.reduce((s, a) => s + (a.amount || 0), 0))}</b></td></tr></tbody></table>
      <h2>各圖明細</h2>
      <table class="ps-mats"><thead><tr><th>#</th><th>圖名</th><th>叫料</th><th>小料</th><th>L 型</th><th>需要確認</th></tr></thead>
        <tbody>${results.map(r => `<tr><td>${r.i + 1}</td><td>${escapeHtml(sheetName(r))}</td><td>${escapeHtml(totalsText(r))}</td>
          <td>${r.danger || '—'}</td><td>${r.lcut || '—'}</td><td class="ps-small">${escapeHtml((r.warnings || []).join('；'))}</td></tr>`).join('')}</tbody></table>
      <p class="ps-note">叫料＝整磚＋裁切（裁切磚不回填復用），未含現場備品；請依各圖「需要確認」項目核對後再下單。</p>
    </section>`;
  const pages = results.filter(r => r.img).map(r => `
    <section class="ps-page ps-break">
      <img class="ps-drawing" src="${r.img}" alt="">
      <table class="ps-title"><tr>
        <td><small>工程名稱</small><div>${escapeHtml(r.sheet.meta.project || '—')}</div></td>
        <td><small>圖名</small><div>${escapeHtml(sheetName(r))}</div></td>
        <td><small>叫料</small><div>${escapeHtml(totalsText(r))}</div></td>
        <td><small>日期</small><div>${todayText()}</div></td>
        <td><small>頁次</small><div>${r.i + 1} / ${results.length}</div></td>
        <td class="ps-warn">尺寸若有誤差 依現場放樣 再行溝通</td>
      </tr></table>
    </section>`).join('');
  $('printSheet').innerHTML = cover + pages;
  const imgs = [...document.querySelectorAll('#printSheet img')];
  Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => window.print());
  return { results, totals };
}

function csvCell(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function batchCsvText(sheets) {
  const results = collectAllSheets(sheets, false);
  const totals = projectTotals(results);
  const rows = [['全案總叫料表', todayText()], [],
    ['用途', '型號', '尺寸與名稱', '填縫劑', '總叫料（片）', '理論片數', '小料', '用到幾張圖', `下單（備品 ${params().spare}%）`, '單價（元/片）', '金額（元）']];
  totals.forEach(a => rows.push([a.role, a.code, a.spec, a.grout, a.total, a.net, a.danger, a.sheets, a.order, a.price || '', a.amount === null ? '' : a.amount]));
  rows.push(['全案合計', '', '', '', '', '', '', '', '', '', totals.reduce((s, a) => s + (a.amount || 0), 0)]);
  rows.push([], ['#', '圖名', '材料', '叫料（片）', '理論片數', '小料', '需要確認']);
  results.forEach(r => {
    if (r.error) { rows.push([r.i + 1, sheetName(r), '無法匯入', '', '', '', r.error]); return; }
    r.totals.forEach((t, k) => rows.push([r.i + 1, sheetName(r), t.label, t.total, t.net, t.danger, k === 0 ? (r.warnings || []).join('；') : '']));
  });
  // 加 BOM，Excel 才認得中文
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

function batchExportCsv(sheets) {
  const blob = new Blob([batchCsvText(sheets)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'project-tile-totals.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initBatchExport() {
  const close = () => { $('dxfSheetPicker').style.display = 'none'; };
  if ($('btnBatchPdf')) $('btnBatchPdf').addEventListener('click', () => { close(); batchExportPdf(lastDxfSheets); });
  if ($('btnBatchCsv')) $('btnBatchCsv').addEventListener('click', () => { close(); batchExportCsv(lastDxfSheets); });
}
