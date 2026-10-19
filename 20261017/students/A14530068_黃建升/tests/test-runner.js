// 🧪 磁磚放樣系統：自動化 CI/CD、煙霧測試與紅隊測試套件
// 執行環境：Node.js 或 瀏覽器端

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT_DIR, 'js');

// 測試結果統計
const results = {
  ci: { passed: 0, failed: 0, details: [] },
  smoke: { passed: 0, failed: 0, details: [] },
  redteam: { passed: 0, failed: 0, details: [] }
};

function assert(category, testName, condition, extraInfo = '') {
  if (condition) {
    results[category].passed++;
    results[category].details.push(`  ✅ [PASS] ${testName}`);
  } else {
    results[category].failed++;
    results[category].details.push(`  ❌ [FAIL] ${testName} ${extraInfo ? '- ' + extraInfo : ''}`);
  }
}

// ==========================================
// 1. CI / CD 靜態語法與模組結構檢查
// ==========================================
console.log('\n========================================');
console.log('🚀 1. 執行 CI/CD 靜態語法與模組完整性檢查');
console.log('========================================');

const requiredFiles = [
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/columns.js',
  'js/openings.js',
  'js/calculator.js',
  'js/renderer.js',
  'js/project-io.js',
  'js/dxf-import.js',
  'js/app.js'
];

requiredFiles.forEach(file => {
  const filePath = path.join(ROOT_DIR, file);
  const exists = fs.existsSync(filePath);
  assert('ci', `檔案存在檢查: ${file}`, exists);
});

// 檢查 JS 檔案語法 (Syntax Check)
const jsFiles = ['config.js', 'columns.js', 'openings.js', 'calculator.js', 'renderer.js', 'project-io.js', 'dxf-import.js', 'app.js'];
jsFiles.forEach(f => {
  const fPath = path.join(JS_DIR, f);
  try {
    const code = fs.readFileSync(fPath, 'utf8');
    // 使用 Function 建構子簡易檢查語法錯誤 (不執行)
    new Function(code);
    assert('ci', `JS 語法解析 (Syntax Lint): ${f}`, true);
  } catch (err) {
    assert('ci', `JS 語法解析 (Syntax Lint): ${f}`, false, err.message);
  }
});

// 檢查 index.html 模組引入順序
const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const scriptOrder = ['config.js', 'columns.js', 'openings.js', 'calculator.js', 'renderer.js', 'project-io.js', 'dxf-import.js', 'app.js'];
let lastIdx = -1;
let orderCorrect = true;
scriptOrder.forEach(s => {
  const idx = htmlContent.indexOf(`src="js/${s}"`);
  if (idx === -1 || idx < lastIdx) orderCorrect = false;
  lastIdx = idx;
});
assert('ci', 'index.html 模組相依引入順序正確性', orderCorrect);

// 檢查核心函式無重複定義（重複定義會互相覆蓋，曾造成 columnParams 行為不一致）
const allJsCode = jsFiles.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');
['columnParams', 'openings', 'layout', 'params', 'faceDims'].forEach(fn => {
  const dup = (allJsCode.match(new RegExp(`function\\s+${fn}\\s*\\(`, 'g')) || []).length;
  assert('ci', `函式無重複定義: ${fn}`, dup === 1, `實際定義 ${dup} 次`);
});

// 模擬前端 DOM 基礎環境以執行演算法驗證（可依測試案例注入真實值）
const fakeValues = {};
const fakeChecks = {};
global.document = {
  getElementById: (id) => {
    return {
      get value() { return (id in fakeValues) ? String(fakeValues[id]) : '0'; },
      set value(v) { fakeValues[id] = v; },
      get checked() { return !!fakeChecks[id]; },
      set checked(v) { fakeChecks[id] = !!v; },
      style: {},
      classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      addEventListener: () => {}
    };
  },
  querySelectorAll: () => []
};
global.$ = id => global.document.getElementById(id);
function setInputs(map) { Object.assign(fakeValues, map); }
function setChecks(map) { Object.assign(fakeChecks, map); }

// 載入核心純邏輯函式（用 vm 於共用 context 執行，模擬瀏覽器全域共享行為）
const vm = require('vm');
const vmCtx = {
  document: global.document, $: global.$, console,
  Date, Math, JSON, parseFloat, Number, isFinite
};
vm.createContext(vmCtx);
['config.js', 'columns.js', 'openings.js', 'calculator.js', 'project-io.js', 'dxf-import.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), vmCtx, { filename: f });
});
const { layout, faceDims, openings, params, cfgOf, columnParams, setColumnParams,
        getOpeningsByFace, getFaceColumnInfo, detectColumnClashes } = vmCtx;
// openingsList 是 openings.js 的 top-level let（不掛在 vmCtx 上），用 vm 內小工具存取
vm.runInContext('globalThis.__setOps = l => { openingsList = l; }; globalThis.__getOps = () => openingsList;', vmCtx);
const setOpenings = vmCtx.__setOps;

// ==========================================
// 2. 煙霧測試（Smoke Test：核心功能驗證）
// ==========================================
console.log('\n========================================');
console.log('💨 2. 執行核心功能煙霧測試 (Smoke Testing)');
console.log('========================================');

// Test S1: 排磚幾何基本計算 (120x60 磚在 600x400 地坪)
const p1 = { L: 600, W: 400, H: 280, TL: 120, TW: 60, joint: 0.2, price: 0 };
const cfg1 = { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 };
const res1 = layout(p1, 600, 400, cfg1, []);
assert('smoke', '排磚演算法計算成功且有產出磁磚', res1.tiles && res1.tiles.length > 0);
assert('smoke', '整磚計算正確性 (600x400 靠左起磚)', res1.full > 0 && res1.full + res1.cut === res1.total);

// Test S2: 多門窗開口扣除面積測試
setInputs({
  floor_fw: 600, floor_fh: 400,
  A_fw: 600, A_fh: 280, B_fw: 400, B_fh: 280,
  C_fw: 600, C_fh: 280, D_fw: 400, D_fh: 280
});
const testDims = faceDims(p1);
setOpenings([
  { id: 'op_d1', kind: 'door', name: '大門', face: 'D', w: 90, h: 210, x: 20, y: 0 },
  { id: 'op_w1', kind: 'window', name: '主窗', face: 'B', w: 120, h: 120, x: 40, y: 100 }
]);
const faceOps = getOpeningsByFace(testDims);
assert('smoke', 'D面門開口正確解析並夾取', faceOps.D.length === 1 && faceOps.D[0].w === 90);
assert('smoke', 'B面窗開口正確解析並夾取', faceOps.B.length === 1 && faceOps.B[0].w === 120);

const resB = layout(p1, testDims.B.fw, testDims.B.fh, cfg1, faceOps.B);
assert('smoke', '開口面積成功扣除且排磚避開開口', resB.opArea === (120 * 120));

// Test S3: 結構柱選用性（可關閉、開啟）
setColumnParams({ on: false });
let colRes = columnParams();
assert('smoke', '結構柱可正常停用 (on=false)', colRes.on === false);

setColumnParams({ on: true, face: 'B', x: 80, w: 50, d: 50, mode: 'linked' });
colRes = columnParams();
assert('smoke', '結構柱可正常啟用並設定座標', colRes.on === true && colRes.x === 80 && colRes.w === 50);
// Test S4: 角柱雙面連動投影 (AB角隅柱)
setColumnParams({ on: true, face: 'B', x: 0, w: 50, d: 50 });
const colOnB = getFaceColumnInfo('B', columnParams(), testDims);
const colOnA = getFaceColumnInfo('A', columnParams(), testDims);
assert('smoke', '角柱 (X=0) 在 B 面左側正確投影', colOnB !== null && colOnB.x0 === 0 && colOnB.w === 50);
assert('smoke', '角柱 (X=0) 在 A 面右側自動連動投影', colOnA !== null && colOnA.x0 === (600 - 50) && colOnA.w === 50);

// Test S5: 柱窗衝突檢測 (B面窗 X=40~160 與柱 X=0~50 重疊 10cm)
const clashes = detectColumnClashes(testDims);
assert('smoke', '成功偵測柱與窗戶位置衝突', clashes.length > 0);
assert('smoke', '衝突重疊寬度計算精確 (應為 10cm)', clashes[0] && clashes[0].overlapW === 10);

// Test S6: 施工圖案例資料與實際施工圖一致（D 面牆高 289，239 是門高）
const DEMO = vm.runInContext('PRESETS.demo', vmCtx);
const CASE_OPS = vm.runInContext('OPENING_PRESETS.caseop', vmCtx);
assert('smoke', '施工圖案例：四面牆高皆為 289', ['A', 'B', 'C', 'D'].every(k => DEMO.faces[k][1] === 289));
assert('smoke', '施工圖案例：壁磚 120×120', DEMO.TL === 120 && DEMO.TW === 120);
const caseDoor = CASE_OPS.items.find(o => o.kind === 'door');
assert('smoke', '施工圖案例：D 面門 86×239 距左 104（104/86/20）',
  caseDoor && caseDoor.face === 'D' && caseDoor.w === 86 && caseDoor.h === 239 && caseDoor.x === 104
  && 210 - caseDoor.x - caseDoor.w === 20);
const caseD = layout({ L: 171, W: 207, H: 289, TL: 120, TW: 120, joint: 0.2, price: 0 }, 210, 289,
  { dir: 'H', mode: 'grid', xalign: 'custom', yalign: 'bottom', xoff: DEMO.cfg.D.xoff, yoff: 0 }, []);
assert('smoke', '施工圖案例：D 面起磚線對齊門框左緣 104', caseD.xBase === 104);

// Test S7: 分段尺寸鏈與施工圖一致（D：104/86/20；門高 239 與上方 50）
const caseDoorOps = [{ kind: 'door', x: 104, y: 0, w: 86, h: 239 }];
const chD = vmCtx.elevationChains(210, 289, caseD, caseDoorOps);
assert('smoke', '尺寸鏈：D 面水平分段 0/104/190/210', JSON.stringify(chD.h) === '[0,104,190,210]', JSON.stringify(chD.h));
assert('smoke', '尺寸鏈：D 面垂直分段 0/239/289', JSON.stringify(chD.v) === '[0,239,289]', JSON.stringify(chD.v));
assert('smoke', '尺寸鏈：相距 < 0.5cm 的點合併、超出範圍的點忽略',
  JSON.stringify(vmCtx.dimChainPoints(100, [50, 50.3, -5, 120, NaN])) === '[0,50,100]');

// Test S8: 施工圖資料檔（JSON）匯出→檢查→可再匯入
const faceInputs = {};
['floor', 'A', 'B', 'C', 'D'].forEach(k => Object.assign(faceInputs, {
  [k + '_dir']: 'H', [k + '_mode']: 'grid', [k + '_xalign']: 'custom', [k + '_yalign']: 'bottom', [k + '_xoff']: 0, [k + '_yoff']: 0
}));
setInputs(Object.assign(faceInputs, {
  L: 171, W: 207, H: 289, TL: 120, TW: 120, joint: 2, price: 0,
  floor_fw: 207, floor_fh: 171, A_fw: 171, A_fh: 289, B_fw: 207, B_fh: 289, C_fw: 172, C_fh: 289, D_fw: 210, D_fh: 289,
  D_xoff: 104
}));
setOpenings(JSON.parse(JSON.stringify(CASE_OPS.items)));
const exported = JSON.parse(JSON.stringify(vmCtx.collectProject()));
const reimport = vmCtx.validateProject(exported);
assert('smoke', '資料檔：匯出後可原樣通過檢查（無錯誤、無略過）',
  reimport.errors.length === 0 && reimport.warnings.length === 0, JSON.stringify(reimport.warnings));
assert('smoke', '資料檔：D 面尺寸、起磚與門窗完整保留',
  reimport.project.faces.D.fw === 210 && reimport.project.faces.D.xoff === 104
  && reimport.project.openings.length === 1 && reimport.project.openings[0].w === 86);
assert('smoke', '資料檔：磚縫以 mm 存檔（2mm）', exported.tile.jointMM === 2);

// Test S9: DXF 匯入（tests/fixtures/sample-bathroom.dxf：從實際施工圖抽出、已去個資的浴室圖）
const dxfText = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-bathroom.dxf'), 'utf8');
const dxfSheets = vmCtx.findDxfSheets(vmCtx.parseDxf(dxfText));
const sh = dxfSheets[0];
assert('smoke', 'DXF：找到 1 張施工圖，圖名「範例浴室」', dxfSheets.length === 1 && sh.meta.drawingName === '範例浴室');
const fz = sh && sh.project.faces;
assert('smoke', 'DXF：四面立面尺寸 171/207/172/210 × 289',
  fz && fz.A.fw === 171 && fz.B.fw === 207 && fz.C.fw === 172 && fz.D.fw === 210 && ['A', 'B', 'C', 'D'].every(k => fz[k].fh === 289));
assert('smoke', 'DXF：「由此線開始放樣」起點 A59／B117／C0／D104',
  fz && fz.A.xoff === 59 && fz.B.xoff === 117 && fz.C.xoff === 0 && fz.D.xoff === 104);
assert('smoke', 'DXF：紅線 A[59,142]／B[117]／D[190]',
  fz && JSON.stringify([fz.A.marks, fz.B.marks, fz.C.marks, fz.D.marks]) === '[[59,142],[117],[],[190]]');
const dxfDoor = sh && sh.project.openings;
assert('smoke', 'DXF：D 面門 86×239 距左 104',
  dxfDoor && dxfDoor.length === 1 && dxfDoor[0].face === 'D' && dxfDoor[0].w === 86 && dxfDoor[0].h === 239 && dxfDoor[0].x === 104);
assert('smoke', 'DXF：地坪 207×187、起點 X117／Y172（由 B 牆量）、地磚 120×60',
  fz && fz.floor.fw === 207 && fz.floor.fh === 187 && fz.floor.xoff === 117 && fz.floor.yoff === 172 && fz.floor.TL === 120 && fz.floor.TW === 60);
assert('smoke', 'DXF：材料 壁／主秀壁／地 與填縫劑，牆磚 120×120',
  sh && sh.materials.map(m => m.role).sort().join(',') === '主秀壁,地,壁'
  && sh.materials.find(m => m.role === '壁').grout === '牙白' && sh.project.tile.TL === 120 && sh.project.tile.TW === 120);
const dxfValid = sh && vmCtx.validateProject(JSON.parse(JSON.stringify(sh.project)));
assert('smoke', 'DXF：轉出的資料檔可直接通過檢查', dxfValid && dxfValid.errors.length === 0 && dxfValid.warnings.length === 0,
  dxfValid && JSON.stringify(dxfValid.warnings));
const dimsDxf = vmCtx.elevationChains(171, 289, { xBase: 59, yBase: 0 }, [], [59, 142]);
assert('smoke', 'DXF：A 面尺寸鏈 59/83/29 與施工圖一致', JSON.stringify(dimsDxf.h) === '[0,59,142,171]');
assert('smoke', '磚尺寸文字「60×120」「60*120」「60x120」都看得懂',
  ['60×120', '60*120', '60x120'].every(s => { const t = vmCtx.parseTileSize(s); return t && t.TL === 60 && t.TW === 120; })
  && vmCtx.parseTileSize('') === null);
assert('smoke', 'MTEXT 格式碼清除（\\P 換行、字型、^J）',
  vmCtx.cleanMText('{\\fSimSun|b0;壁}\\P120*120^J填縫劑') === '壁\n120*120\n填縫劑');

// ==========================================
// 3. 紅隊測試（Red Team Testing：極端邊界與破壞性注入）
// ==========================================
console.log('\n========================================');
console.log('🔴 3. 執行紅隊極端邊界與安全性測試 (Red Team)');
console.log('========================================');

// Test R1: 極端開口尺寸超出牆體邊界
setOpenings([
  { id: 'op_giant', kind: 'window', name: '超大巨窗', face: 'B', w: 99999, h: 88888, x: -500, y: -200 }
]);
const giantOps = getOpeningsByFace(testDims);
assert('redteam', '開口位置負數溢出自動夾取 (X夾回 0, Y夾回 0)', giantOps.B[0].x === 0 && giantOps.B[0].y === 0);
assert('redteam', '開口尺寸超出牆體自動截斷至面寬面高以內', giantOps.B[0].w <= testDims.B.fw && giantOps.B[0].h <= testDims.B.fh);

// Test R2: 惡意零數值與負數值防呆 (防除以零與死循環)
setInputs({ L: 0, W: -200, H: 0, TL: 0, TW: -50, joint: -1, price: -99 });
try {
  const bad = params();
  assert('redteam', 'params() 對 0/負數自動回退安全預設值',
    bad.L === 600 && bad.TL === 120 && bad.TW === 60 && bad.joint === 0.2 && bad.price === 0);
  const safeRes = layout(bad, 600, 400, cfg1, []);
  assert('redteam', '極端髒參數下排磚仍正常產出不當機', safeRes.tiles.length > 0 && safeRes.total > 0);
} catch (e) {
  assert('redteam', '磁磚尺寸為 0 或負數防呆不應拋例外', false, e.message);
}
setInputs({ L: 600, W: 400, H: 280, TL: 120, TW: 60, joint: 2, price: 0 });

// Test R3: 柱體完全包裹門窗 (極端完全覆蓋衝突)
setColumnParams({ on: true, face: 'B', x: 20, w: 200, d: 50 });
setOpenings([
  { id: 'op_inner', kind: 'window', name: '柱內窗', face: 'B', w: 50, h: 50, x: 50, y: 50 }
]);
const fullClash = detectColumnClashes(testDims);
assert('redteam', '柱體完全覆蓋開口時 100% 偵測出衝突', fullClash.length === 1 && fullClash[0].overlapW === 50);

// Test R4: 柱體與門窗剛好切齊邊界 (無重疊零交集邊界)
setColumnParams({ on: true, face: 'B', x: 0, w: 50, d: 50 });
setOpenings([
  { id: 'op_touch', kind: 'window', name: '切齊窗', face: 'B', w: 60, h: 60, x: 50, y: 50 } // 剛好接在 50
]);
const touchClash = detectColumnClashes(testDims);
assert('redteam', '柱體與門窗剛好切齊邊界 (無重疊) 不應誤判衝突', touchClash.length === 0);

// Test R5: XSS 與惡意字元注入開口名稱測試
setOpenings([
  { id: 'op_xss', kind: 'door', name: '<SCRIPT>alert("xss")</SCRIPT>', face: 'D', w: 80, h: 200, x: 20, y: 0 }
]);
const xssOps = getOpeningsByFace(testDims);
assert('redteam', '開口名稱接受特殊字元不中斷執行', xssOps.D[0].name.toUpperCase().includes('SCRIPT'));

// Test R5b: 亂寫的資料檔不能匯入或只略過壞欄位
assert('redteam', '資料檔：format 不對直接拒絕', vmCtx.validateProject({ format: 'xxx', version: 1 }).errors.length > 0);
assert('redteam', '資料檔：不是物件直接拒絕', vmCtx.validateProject(null).errors.length > 0);
const dirty = vmCtx.validateProject({
  format: 'tile-setting-out', version: 1,
  room: { L: -1, W: 'abc', H: 289 }, tile: { TL: 120, TW: 0, jointMM: 2 },
  faces: { A: { fw: 171, fh: 289, dir: 'X', xoff: -5 } },
  openings: [
    { kind: 'door', face: 'D', w: 86, h: 239, x: 104, y: 50 },
    { kind: 'sofa', face: 'D', w: 10, h: 10, x: 0 },
    { kind: 'window', face: 'Z', w: 10, h: 10, x: 0 }
  ]
});
assert('redteam', '資料檔：負數／文字／未知選項只略過該欄並提示',
  dirty.errors.length === 0 && dirty.project.room.L === undefined && dirty.project.room.H === 289
  && dirty.project.tile.TW === undefined && dirty.project.faces.A.dir === undefined && dirty.project.faces.A.xoff === undefined
  && dirty.warnings.length >= 6, JSON.stringify(dirty.warnings));
assert('redteam', '資料檔：門的離地高度強制為 0、不明門窗略過',
  dirty.project.openings.length === 1 && dirty.project.openings[0].y === 0);

// Test R5c: 亂丟的 DXF 不能讓程式當掉
let dxfCrash = null;
try {
  const empty = vmCtx.findDxfSheets(vmCtx.parseDxf(''));
  const junk = vmCtx.findDxfSheets(vmCtx.parseDxf('hello\nworld\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n'));
  // 只有索引圖塊、沒有立面外框
  const onlySym = vmCtx.findDxfSheets(vmCtx.parseDxf(dxfText.replace(/\nLWPOLYLINE\r?\n/g, '\nXLWPOLY\n')));
  assert('redteam', 'DXF：空檔、亂碼、缺外框都回 0 張圖而不當機', empty.length === 0 && junk.length === 0 && onlySym.length === 0);
} catch (e) { dxfCrash = e; }
if (dxfCrash) assert('redteam', 'DXF：空檔、亂碼、缺外框都回 0 張圖而不當機', false, dxfCrash.message);

// Test R6: 大量門窗高負載壓力測試 (50 個動態開口)
const stressList = [];
for (let i = 0; i < 50; i++) {
  stressList.push({
    id: `stress_${i}`,
    kind: i % 2 === 0 ? 'door' : 'window',
    name: `測試開口 ${i}`,
    face: ['A', 'B', 'C', 'D'][i % 4],
    w: 30, h: 40, x: (i * 10) % 300, y: 0
  });
}
setOpenings(stressList);
const stressStart = Date.now();
const stressOps = getOpeningsByFace(testDims);
const stressClash = detectColumnClashes(testDims);
const stressElapsed = Date.now() - stressStart;
assert('redteam', `50個開口高負載批次處理耗時 < 50ms (實測: ${stressElapsed}ms)`, stressElapsed < 50);

// ==========================================
// 4. 總結輸出
// ==========================================
console.log('\n========================================');
console.log('📊 測試統計總結報告');
console.log('========================================');

['ci', 'smoke', 'redteam'].forEach(cat => {
  const c = results[cat];
  const name = { ci: 'CI/CD 靜態結構', smoke: '煙霧核心功能', redteam: '紅隊極端測試' }[cat];
  console.log(`\n【${name}】通過: ${c.passed} / 失敗: ${c.failed}`);
  c.details.forEach(d => console.log(d));
});

const totalPassed = results.ci.passed + results.smoke.passed + results.redteam.passed;
const totalFailed = results.ci.failed + results.smoke.failed + results.redteam.failed;

console.log('\n----------------------------------------');
console.log(`🎯 總測試項目: ${totalPassed + totalFailed}，全部通過率: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
if (totalFailed === 0) {
  console.log('✨ 所有測試項目 100% 通過！系統極度穩健！');
} else {
  console.log(`⚠️ 有 ${totalFailed} 個項目未通過，請檢查詳細日誌。`);
}
console.log('----------------------------------------\n');
