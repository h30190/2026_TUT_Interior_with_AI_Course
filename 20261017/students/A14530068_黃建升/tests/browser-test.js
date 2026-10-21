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
  await page.setInputFiles('#dxfFile', asUpload(path.join(__dirname, 'fixtures', 'sample-bathroom.dxf'), 'sample-bathroom.dxf', 'application/dxf'));
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
  check(`匯出 PDF：A3 共 2 頁（實際 ${pages} 頁）`, pages === 2 && errors.length === n, errorsSince(n));
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportPng')]);
  check('下載圖片：tile-setting-out.png', png.suggestedFilename() === 'tile-setting-out.png');

  await browser.close();
  console.log(`\n🎯 瀏覽器實測 ${passed + failed} 項，通過 ${passed}，失敗 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.log('❌ 瀏覽器實測中斷：' + e.message);
  process.exit(1);
});
