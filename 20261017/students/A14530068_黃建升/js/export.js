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
  if ($('btnExportPdf')) $('btnExportPdf').addEventListener('click', exportPdf);
  if ($('btnExportPng')) $('btnExportPng').addEventListener('click', exportPng);
}
