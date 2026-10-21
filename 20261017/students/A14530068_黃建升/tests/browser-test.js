// 🌐 瀏覽器實測：真的打開 index.html、按按鈕、匯入匯出，抓「計算對了但畫面壞掉」的 bug
// （test-runner.js 只測計算邏輯，當初「吸附門框」按了會壞就是它抓不到的）
//
// 用法：node tests/browser-test.js
// 第一次要先裝 Playwright（只裝在自己電腦，不進 repo）：
//   npm install -g playwright
//   npx playwright install chromium

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* 再找全域安裝 */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  } catch (e) { return null; }
}

const playwright = loadPlaywright();
if (!playwright) {
  console.log('⏭️  略過瀏覽器實測：還沒安裝 Playwright。');
  console.log('   安裝：npm install -g playwright  然後  npx playwright install chromium');
  process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
// 檔案用記憶體傳給上傳欄位：Playwright 讀不到含中文的路徑（資料夾名稱有中文）
const asUpload = (file, name, mimeType) => ({ name, mimeType, buffer: fs.readFileSync(file) });

let passed = 0, failed = 0;
function check(name, ok, info) {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${info ? ' - ' + info : ''}`); }
}

(async () => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const state = () => page.evaluate(() => JSON.stringify(collectProject()));
  const errorsSince = n => errors.slice(n).join(' / ');

  console.log('\n🌐 瀏覽器實測');
  await page.goto(PAGE);
  check('頁面載入沒有錯誤', errors.length === 0, errorsSince(0));

  // 1. 每個按鈕都按一次（列印視窗先攔下來）
  await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  let n = errors.length;
  const count = (await page.$$('button')).length;
  for (let i = 0; i < count; i++) {
    const btn = (await page.$$('button'))[i];
    try { await btn.click({ timeout: 500 }); await page.waitForTimeout(30); } catch (e) { /* 看不到的按鈕略過 */ }
  }
  const pickerOpen = await page.$eval('#dxfSheetPicker', el => el.style.display !== 'none');
  if (pickerOpen) await page.click('#dxfSheetCancel');
  check(`全部 ${count} 個按鈕按過一次沒有錯誤`, errors.length === n, errorsSince(n));

  // 2. 吸附門框／窗台（曾經按了會壞）
  n = errors.length;
  await page.click('button[data-p="demo"]');
  await page.selectOption('#cadFace', 'D');
  await page.click('#cadSnapDoorBtn');
  check('吸附門框：D 面起磚 X 對齊門框左緣 104', await page.$eval('#D_xoff', e => e.value) === '104' && errors.length === n, errorsSince(n));

  // 3. 匯出資料檔 → 重新整理 → 匯入，要一模一樣
  const before = await state();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportProject')]);
  const json = fs.readFileSync(await dl.path());
  await page.reload();
  await page.setInputFiles('#projectFile', { name: 'tile-setting-out.json', mimeType: 'application/json', buffer: json });
  await page.waitForTimeout(300);
  check('資料檔匯出再匯入，整張圖完全一樣', (await state()) === before);

  // 4. 匯入範例 DXF（tests/fixtures/sample-bathroom.dxf）
  n = errors.length;
  const fixtureFile = path.join(__dirname, 'fixtures', 'sample-bathroom.dxf');
  await page.evaluate(t => { window.__fixtureText = t; }, fs.readFileSync(fixtureFile, 'utf8'));
  await page.setInputFiles('#dxfFile', asUpload(fixtureFile, 'sample-bathroom.dxf', 'application/dxf'));
  await page.waitForFunction(() => document.getElementById('projectMetaLine').textContent.includes('範例浴室'), null, { timeout: 15000 }).catch(() => {});
  const dxf = await page.evaluate(() => ({
    meta: document.getElementById('projectMetaLine').textContent,
    widths: ['A', 'B', 'C', 'D'].map(k => $(k + '_fw').value).join('/'),
    zones: $('B_zones').value,
    outline: $('floor_outline').value,
    notes: (faceOverlays.B && faceOverlays.B.notes.length) || 0,
    mats: projectMaterials.length
  }));
  check('DXF：讀到圖名「範例浴室」與四面寬 171/207/172/210', dxf.meta.includes('範例浴室') && dxf.widths === '171/207/172/210', JSON.stringify(dxf));
  check('DXF：B 面主秀壁分區、地坪 L 形外框、備註、3 種材料', dxf.zones.includes('主秀壁') && dxf.outline.split(' ').length >= 8 && dxf.notes === 1 && dxf.mats === 3, JSON.stringify(dxf));
  check('DXF 匯入過程沒有錯誤', errors.length === n, errorsSince(n));

  // 4a. 報價：壁磚填單價、備品 5% → 報價表；重新整理後單價還記得
  await page.fill('#spare', '5');
  await page.fill('.mat-card input[data-price]', '850');
  const quoteRow = await page.$$eval('#quote tbody tr', trs => trs.map(tr => tr.textContent.replace(/\s+/g, ' ').trim()));
  const wallRow = quoteRow.find(r => r.startsWith('壁 120×120')) || '';
  check('報價：壁 120×120 叫料 21 → 下單 23 片 × 850 ＝ 19,550', wallRow.includes('23') && wallRow.includes('19,550'), wallRow);
  // 4a-2. 裁切清單與剩料回收：清單有 D 面門旁 20×120；勾「採用剩料回收」後壁磚下單變少
  const cut = await page.$eval('#cutlist', el => el.textContent.replace(/\s+/g, ' '));
  check('裁切清單：D 面門旁那條列成 20×120', /D立面：.*20×120/.test(cut), cut.slice(0, 200));
  const wallOrder = () => page.$$eval('#quote tbody tr', trs => {
    const tr = trs.find(t => t.textContent.trim().startsWith('壁 120×120'));
    return tr ? +tr.children[3].textContent.replace(/,/g, '') : NaN;
  });
  const orderBefore = await wallOrder();
  await page.check('#useReuse');
  const orderAfter = await wallOrder();
  check(`剩料回收：勾選後壁磚下單變少（${orderBefore} → ${orderAfter}）`, orderAfter < orderBefore);
  await page.uncheck('#useReuse');

  await page.reload();
  await page.setInputFiles('#dxfFile', asUpload(fixtureFile, 'sample-bathroom.dxf', 'application/dxf'));
  await page.waitForTimeout(500);
  check('報價：重新整理再匯入 DXF，壁磚單價 850 還記得', await page.$eval('.mat-card input[data-price]', e => e.value) === '850');
  await page.evaluate(() => { localStorage.removeItem('tile-price-book'); });
  await page.evaluate(t => { window.__fixtureText = t; }, fs.readFileSync(fixtureFile, 'utf8'));

  // 4b. 整份 DXF 總叫料表：同一張圖算兩次，材料要加倍、算完恢復原畫面
  const beforeBatch = await state();
  const batch = await page.evaluate(() => {
    const sh = findDxfSheets(parseDxf(window.__fixtureText));
    const one = batchCsvText(sh), two = batchCsvText([sh[0], sh[0]]);
    const row = (csv, code) => csv.split('\r\n').find(l => l.startsWith('壁,' + code));
    return { one: row(one, 'CC-REX-I120'), two: row(two, 'CC-REX-I120') };
  });
  check('總叫料表：兩張一樣的圖，壁 120×120 片數加倍、圖數 2 張',
    batch.one && batch.two && +batch.two.split(',')[4] === 2 * +batch.one.split(',')[4] && batch.two.split(',')[7] === '2', JSON.stringify(batch));
  check('總叫料表算完恢復原本的圖', (await state()) === beforeBatch);

  // 4c. Revit 外掛匯出的資料檔
  n = errors.length;
  await page.setInputFiles('#projectFile', asUpload(path.join(__dirname, 'fixtures', 'revit-sample.json'), 'revit-sample.json', 'application/json'));
  await page.waitForTimeout(300);
  const rv = await page.evaluate(() => ({ meta: $('projectMetaLine').textContent, d: $('D_fw').value, doors: openingsList.filter(o => o.kind === 'door').length, outline: $('floor_outline').value }));
  check('Revit 資料檔：匯入後圖名、D 面寬 207、1 個門、L 形外框都在', rv.meta.includes('公共衛浴') && rv.d === '207' && rv.doors === 1 && rv.outline.split(' ').length === 10 && errors.length === n, JSON.stringify(rv));

  // 5. 換情境要清掉上一張圖的分區、紅線、各面磚尺寸
  await page.click('button[data-p="demo"]');
  await page.click('button[data-p="living"]');
  const leftover = await page.evaluate(() => ['floor', 'A', 'B', 'C', 'D'].map(k => $(k + '_zones').value + $(k + '_marks').value + $(k + '_tile').value + $(k + '_xoff').value).join('|'));
  check('換情境：上一張圖的分區、紅線、磚尺寸、起磚點都清掉', leftover === '0|0|0|0|0', leftover);

  // 6. 手動地坪外框
  const floorTotal = () => page.evaluate(() => computeAll(params()).find(r => r.key === 'floor').r.total);
  const rectTotal = await floorTotal();
  await page.fill('#floor_outline', '0,0 600,0 600,400 300,400 300,200 0,200');
  const lTotal = await floorTotal();
  check(`手動輸入 L 形外框，地磚變少（${rectTotal} → ${lTotal}）`, lTotal < rectTotal);
  await page.fill('#floor_outline', '');

  // 7. 匯出 PDF（A3 兩頁）與圖片
  n = errors.length;
  await page.click('button[data-p="demo"]');
  await page.click('#btnExportPdf');
  await page.waitForTimeout(500);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(`匯出 PDF：A3，第 1 頁施工圖、後面材料／算料／裁切清單（共 ${pages} 頁）`, pages >= 2 && errors.length === n, errorsSince(n));
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportPng')]);
  check('下載圖片：tile-setting-out.png', png.suggestedFilename() === 'tile-setting-out.png');

  // 8. 自動找最佳起磚點：比較方案、套用推薦
  n = errors.length;
  await page.click('button[data-p="demo"]');
  const scoreNow = () => page.evaluate(() => { const s = planScore(computeAll(params())); return { danger: s.danger, lcut: s.lcut, waste: s.waste }; });
  const before8 = await scoreNow();
  // 示範案例 D 面從地面排會包住門右上角：算料表、結論要提醒 L 型
  const lWarn = await page.evaluate(() => ({ concl: $('concl').textContent, warn: $('warnMsg').textContent, table: document.querySelector('#tbl').textContent }));
  check(`L 型切割：示範案例 D 面 ${before8.lcut} 片，結論、提示列、算料表都有寫`,
    before8.lcut > 0 && lWarn.concl.includes('L 型') && lWarn.warn.includes('L 型切割') && lWarn.table.includes('L 型切割'), JSON.stringify(lWarn).slice(0, 300));
  await page.click('#btnSearchPlans');
  await page.waitForSelector('#planResults tr.best', { timeout: 20000 });
  const planRows = await page.$$eval('#planResults tbody tr', rs => rs.length);
  const bestBtn = await page.$('#planResults tr.best button[data-plan]');
  if (bestBtn) await bestBtn.click();
  const after8 = await scoreNow();
  check(`自動起磚點：列出 ${planRows} 個方案，套用推薦後小料 ${before8.danger} → ${after8.danger}、L 型 ${before8.lcut} → ${after8.lcut}`,
    planRows === 4 && !(await page.evaluate(([a, b]) => betterScore(a, b), [before8, after8])) && errors.length === n,
    JSON.stringify({ before8, after8, err: errorsSince(n) }));

  // 8b. 同一面混磚：按「＋腰帶」「＋上下分段」加進去，算料表多出那種磚
  n = errors.length;
  await page.click('button[data-p="demo"]');
  await page.click('button[data-zone="B"][data-tpl^="高 100"]');
  await page.click('button[data-zone="A"][data-tpl^="高 0"]');
  const mixed = await page.evaluate(() => ({ b: $('B_zones').value, labels: computeAll(params()).flatMap(s => s.r.groups.map(g => s.key + ':' + g.label)) }));
  check('混磚：B 面主秀壁＋腰帶、A 面上下分段，各自成一種磚算料',
    mixed.b.includes('主秀壁') && mixed.b.includes('高 100-130') && mixed.labels.includes('B:腰帶 15×30') && mixed.labels.includes('A:下段 30×60') && errors.length === n,
    JSON.stringify(mixed));

  // 9. 匯出 DXF（照施工圖畫法）
  n = errors.length;
  await page.click('button[data-p="demo"]');
  const [dxfDl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportDxf')]);
  const dxfText = fs.readFileSync(await dxfDl.path(), 'utf8');
  check('匯出 DXF：tile-setting-out.dxf，R2013、有地磚層磚縫、T-DIM 尺寸、由此線開始放樣',
    dxfDl.suggestedFilename() === 'tile-setting-out.dxf' && dxfText.includes('AC1027') && dxfText.includes('\r\n  8\r\n地磚\r\n')
    && dxfText.includes('T-DIM') && dxfText.includes('由此線開始放樣') && errors.length === n, errorsSince(n));

  await browser.close();
  console.log(`\n🎯 瀏覽器實測 ${passed + failed} 項，通過 ${passed}，失敗 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.log('❌ 瀏覽器實測中斷：' + e.message);
  process.exit(1);
});
