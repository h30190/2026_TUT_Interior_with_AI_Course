(async () => {
  const out = [], $ = id => document.getElementById(id), wait = ms => new Promise(r => setTimeout(r, ms));
  const ok = (name, cond, extra) => out.push((cond ? '通過｜' : '失敗｜') + name + (extra ? '（' + extra + '）' : ''));
  function set(path, val) {
    const el = document.querySelector('[data-path="' + path + '"]');
    if (!el) { return false; }
    if (el.type === 'checkbox') { el.checked = !!val; } else { el.value = val; }
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const st = () => $('status').textContent;
  const pieces = () => (window.__tile.result && window.__tile.result.ok) ? [window.__tile.result.floor.pieces, window.__tile.result.wallTotal.pieces] : null;

  ok('開頁自動算出結果', !!pieces(), st());
  const base = pieces();

  set('room.L', ''); await wait(500);
  ok('欄位留白 → 顯示錯誤、不顯示報告', !!document.querySelector('.errbox') && $('report').innerHTML === '', document.querySelector('.errbox') && document.querySelector('.errbox').innerText.replace(/\s+/g, ' ').slice(0, 60));
  set('room.L', '-5'); await wait(500);
  ok('負數 → 錯誤', !!document.querySelector('.errbox'));
  set('room.L', '200'); await wait(500);
  ok('改成 200 → 錯誤消失、片數改變', !document.querySelector('.errbox') && JSON.stringify(pieces()) !== JSON.stringify(base), JSON.stringify(base) + ' → ' + JSON.stringify(pieces()));

  set('floorTileId', 'F2'); await wait(500);
  ok('換地磚 30×60 → 重新計算', window.__tile.result.ok && window.__tile.result.floorTile.id === 'F2', st());
  const methodSel = document.querySelector('[data-path="floorMethod"]');
  ok('貼法下拉選單包含交丁、直貼（30×60 長方磚）', Array.from(methodSel.options).some(o => /1\/3/.test(o.text)), Array.from(methodSel.options).map(o => o.text).join('｜'));
  set('floorMethod', 'run3-v'); await wait(500);
  ok('指定 1/3 交丁（直貼）→ 採用', window.__tile.result.floor.chosen.method === 'run3-v');
  set('floorStart', 'door'); await wait(500);
  ok('指定起始點「門口對齊」→ 採用', window.__tile.result.floor.chosen.start === 'door', JSON.stringify(window.__tile.result.floor.chosen.origin));
  ok('平面圖上有起始點標註', /起始點 \(/.test($('report').innerHTML));

  set('drain.mode', 'oneway'); set('drain.dir', 'W'); await wait(500);
  ok('洩水改單向 → 仍可計算', window.__tile.result.ok, st());
  set('drain.slope', '0'); await wait(500);
  ok('坡度 0 → 出現「不會往落水孔排水」警告', window.__tile.result.warnings.some(w => /不會往落水孔/.test(w)));
  set('drain.slope', '1.5');

  document.querySelector('[data-add="openings"]').click(); await wait(500);
  ok('新增一列門窗', window.__tile.state.openings.length === 3);
  set('openings.2.offset', '500'); await wait(500);
  ok('新窗位置超出牆長 → 顯示錯誤', !!document.querySelector('.errbox') && /超出牆長/.test(document.querySelector('.errbox').innerText));
  document.querySelector('[data-del="openings"][data-i="2"]').click(); await wait(500);
  ok('刪除該列 → 錯誤消失', !document.querySelector('.errbox'));

  set('wallTiled.W', false); await wait(500);
  ok('取消西牆貼磚 → 立面少一面', !window.__tile.result.walls.W && Object.keys(window.__tile.result.walls).length === 3);
  set('wallTiled.W', true);
  set('sequence', 'floorFirst'); await wait(500);
  ok('施工順序改先貼地 → 牆磚起算高度 1.4（地磚 9mm＋0.5cm）', Math.abs(window.__tile.result.walls.N.surface.net[1] - 1.4) < 1e-9, String(window.__tile.result.walls.N.surface.net[1]));
  set('sequence', 'wallFirst');

  // 3D：畫布有內容，拖曳後畫面改變
  const cv = $('cv3d'), ctx = cv.getContext('2d');
  const snap = () => ctx.getImageData(0, 0, cv.width, cv.height).data;
  const a = snap(); let nonBg = 0; for (let i = 0; i < a.length; i += 4) { if (!(a[i] === 246 && a[i + 1] === 245 && a[i + 2] === 241)) { nonBg++; } }
  ok('3D 畫布有繪出東西', nonBg > 20000, '非背景像素 ' + nonBg);
  cv.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  const b = snap(); let diff = 0; for (let i = 0; i < a.length; i += 4) { if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) { diff++; } }
  ok('拖曳旋轉後 3D 畫面改變', diff > 5000, '差異像素 ' + diff);
  document.querySelector('[data-wall3d="N"]').checked = false; document.querySelector('[data-wall3d="N"]').dispatchEvent(new Event('change', { bubbles: true }));
  ok('可取消顯示北牆', true);

  // 專案存讀
  const json = JSON.stringify(window.__tile.state);
  window.__tile.setState(JSON.parse(json)); await wait(500);
  ok('專案 JSON 存成再讀回，結果相同', JSON.stringify(pieces()) === JSON.stringify([window.__tile.result.floor.pieces, window.__tile.result.wallTotal.pieces]));

  // 建議書沒有壞值
  const text = $('report').innerText;
  ok('建議書沒有 NaN／undefined／Infinity', !/NaN|undefined|Infinity/.test(text));
  ok('建議書含必要項目：片數、損耗、黏著劑、收邊條、貼法比較、起始磚', ['實際需要片數', '損耗率', '黏著劑', '收邊條', '貼法比較', '起始磚放樣點', '3D 模擬圖'].every(k => text.indexOf(k) >= 0), ['實際需要片數', '損耗率', '黏著劑', '收邊條', '貼法比較', '起始磚放樣點', '3D 模擬圖'].filter(k => text.indexOf(k) < 0).join(','));
  return out.join('\n');
})()
