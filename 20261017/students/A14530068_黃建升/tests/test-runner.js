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
  'js/materials.js',
  'js/export.js',
  'js/dxf-template.js',
  'js/dxf-export.js',
  'js/app.js'
];

requiredFiles.forEach(file => {
  const filePath = path.join(ROOT_DIR, file);
  const exists = fs.existsSync(filePath);
  assert('ci', `檔案存在檢查: ${file}`, exists);
});

// 檢查 JS 檔案語法 (Syntax Check)
const jsFiles = ['config.js', 'columns.js', 'openings.js', 'calculator.js', 'renderer.js', 'project-io.js', 'dxf-import.js', 'materials.js', 'export.js', 'dxf-template.js', 'dxf-export.js', 'app.js'];
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
const scriptOrder = ['config.js', 'columns.js', 'openings.js', 'calculator.js', 'renderer.js', 'project-io.js', 'dxf-import.js', 'materials.js', 'export.js', 'dxf-template.js', 'dxf-export.js', 'app.js'];
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
['config.js', 'columns.js', 'openings.js', 'calculator.js', 'project-io.js', 'dxf-import.js', 'dxf-template.js', 'dxf-export.js'].forEach(f => {
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

// Test S10: 同一面多種磚（B 面 0–117 壁磚 120×120、117–207 主秀壁 14.8×14.8）
assert('smoke', 'DXF：B 面自動判斷出主秀壁分區 117–207（14.8×14.8）',
  fz && JSON.stringify(fz.B.zones) === JSON.stringify([{ x0: 117, x1: 207, TL: 14.8, TW: 14.8, name: '主秀壁' }]) && fz.A.zones.length === 0,
  fz && JSON.stringify(fz.B.zones));
const zoneB = layout({ L: 171, W: 207, H: 289, TL: 120, TW: 120, joint: 0.2, price: 0 }, 207, 289,
  { dir: 'H', mode: 'grid', xalign: 'custom', xoff: 117, yalign: 'bottom', yoff: 0, zones: fz.B.zones }, []);
const gMain = zoneB.groups.find(g => g.key === 'main'), gMosaic = zoneB.groups.find(g => g.key !== 'main');
assert('smoke', '分區：壁磚區 3 片（117 寬的裁切磚 × 3 列）', gMain && gMain.full === 0 && gMain.cut === 3);
assert('smoke', '分區：主秀壁 6 欄 × 20 列＝120 片，頂端 4cm 一列 6 片為小料並紅圈（同施工圖「避免小料」）',
  gMosaic && gMosaic.total === 120 && gMosaic.full === 114 && gMosaic.danger === 6 && gMosaic.avoid === 6 && gMosaic.label.includes('主秀壁'));
assert('smoke', '分區：不同尺寸的磚分開算理論片數（壁 3、主秀壁 119）', gMain && gMosaic && gMain.net === 3 && gMosaic.net === 119);
assert('smoke', '分區文字「117-207: 14.8×14.8 主秀壁」可讀回、可寫出',
  vmCtx.formatZones(vmCtx.parseZones('117-207: 14.8×14.8 主秀壁; 0~50：30x60')) === '117-207: 14.8×14.8 主秀壁; 0-50: 30×60');
const layersOv = vmCtx.zoneLayers(200, 100, [{ x0: 50, x1: 120, TL: 10, TW: 10 }, { x0: 100, x1: 150, TL: 20, TW: 20 }]);
const visOv = layersOv.map(L => vmCtx.rectMinus(L.rect, L.occ).map(q => [q[0], q[2]]));
assert('smoke', '分區重疊時寫在後面的蓋在上面，整面不重複也不漏',
  JSON.stringify(visOv) === '[[[0,50],[150,200]],[[50,100]],[[100,150]]]', JSON.stringify(visOv));

// Test S10b: 同一面混 2～3 種磚——上下分段、腰帶（整面寬，寫在後面的蓋在上面）
const pZ = { TL: 60, TW: 60, joint: 0.2, smallTh: 5, avoidTh: 5 };
const cfgZ = zs => ({ dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0, zones: vmCtx.parseZones(zs) });
const twoBand = layout(pZ, 200, 280, cfgZ('高 0-120: 30×60 下段'), [], true);
const gLow = twoBand.groups.find(g => g.name === '下段'), gUp = twoBand.groups.find(g => g.key === 'main');
assert('smoke', '上下分段：下段 0～120 用 30×60、上段用此面 60×60，面積各自算、磚不跑出自己那段',
  gLow && gUp && Math.abs(gLow.area - 200 * 120) < 1e-6 && Math.abs(gUp.area - 200 * 160) < 1e-6
  && twoBand.tiles.filter(t => t.gkey === 'main').every(t => t.y0 >= 120 - 1e-6)
  && twoBand.tiles.filter(t => t.gkey !== 'main').every(t => t.y0 + t.wW <= 120 + 1e-6 && t.tL === 30),
  JSON.stringify({ low: gLow && [gLow.area, gLow.total], up: gUp && [gUp.area, gUp.total] }));
const waist = layout(pZ, 200, 280, cfgZ('高 100-130: 15×30 腰帶'), [], true);
const gWaist = waist.groups.find(g => g.name === '腰帶');
assert('smoke', '腰帶：離地 100～130 一條 15×30（從腰帶底邊起磚，剛好 1 排），上下照常排此面的磚',
  gWaist && Math.abs(gWaist.area - 200 * 30) < 1e-6 && waist.tiles.filter(t => t.gkey !== 'main').every(t => t.y0 >= 100 - 1e-6 && t.y0 + t.wW <= 130 + 1e-6)
  && waist.tiles.filter(t => t.gkey !== 'main' && t.y0 < 101).length > 0 && !waist.tiles.some(t => t.gkey === 'main' && t.y0 < 129 && t.y0 + t.wW > 101 && t.x0 < 100 && !t.occ && t.y0 > 99));
const both = layout(pZ, 207, 289, cfgZ('117-207: 14.8×14.8 主秀壁; 高 100-130: 15×30 腰帶'), [], true);
const gMos = both.groups.find(g => g.name === '主秀壁'), gW2 = both.groups.find(g => g.name === '腰帶');
assert('smoke', '主秀壁＋腰帶：腰帶寫在後面就橫跨主秀壁，主秀壁面積扣掉腰帶那段',
  gMos && gW2 && Math.abs(gMos.area - 90 * (289 - 30)) < 1e-6 && Math.abs(gW2.area - 207 * 30) < 1e-6
  && !both.tiles.some(t => t.gkey === gMos.key && t.y0 < 130 - 1e-6 && t.y0 + t.wW > 100 + 1e-6));
// 腰帶上方重新從腰帶上緣起磚（使用者的做法）；腰帶下方照原本由地起
const above = waist.tiles.filter(t => t.gkey === 'main' && t.y0 >= 130 - 1e-6), below = waist.tiles.filter(t => t.gkey === 'main' && t.y0 < 100);
assert('smoke', '腰帶上方：此面的磚從腰帶上緣 130 重新起磚（第一排整磚 60），下方仍由地面 0 起',
  above.length && Math.min(...above.map(t => t.y0)) === 130 && above.filter(t => t.y0 === 130).every(t => Math.abs(t.wW - 60) < 1e-6)
  && Math.min(...below.map(t => t.y0)) === 0, JSON.stringify({ a: [...new Set(above.map(t => t.y0))].slice(0, 3), b: [...new Set(below.map(t => t.y0))] }));
const mosAbove = both.tiles.filter(t => t.gkey === gMos.key && t.y0 >= 130 - 1e-6);
assert('smoke', '主秀壁＋腰帶：主秀壁在腰帶上方也從 130 重新起磚，腰帶上緣不會切出小料',
  Math.min(...mosAbove.map(t => t.y0)) === 130 && !mosAbove.some(t => t.y0 < 131 && t.danger), String(Math.min(...mosAbove.map(t => t.y0))));
const upper = twoBand.tiles.filter(t => t.gkey === 'main');
assert('smoke', '上下分段：上段從分段線 120 起磚', Math.min(...upper.map(t => t.y0)) === 120 && upper.filter(t => t.y0 === 120).every(t => Math.abs(t.wW - 60) < 1e-6));
// 牆中間一塊（左右＋高度都寫）：底下的磚包住那塊的轉角 → L 型
const block = layout({ TL: 120, TW: 120, joint: 0.2, smallTh: 5, avoidTh: 5 }, 240.4, 240.4, cfgZ('30-90 高 30-90: 10×10 塊'), [], true);
assert('smoke', '牆中間一塊：底下 120 磚包住那塊的轉角算 L 型', block.lcut === 1 && block.tiles.find(t => t.lcut).occ.length === 1, String(block.lcut));
// 磚縫：底層的直縫不能穿過腰帶（腰帶裡只有腰帶自己的縫）
const jlW = vmCtx.jointLines(waist.tiles, 200, 280, 0.2, [], null, vmCtx.parseZones('高 100-130: 15×30').map(z => vmCtx.zoneRect(z, 200, 280)));
assert('smoke', '匯出 DXF：此面磚的直縫（60.1）在腰帶裡斷開，腰帶裡只畫腰帶自己的縫',
  !jlW.some(l => l[0][0] === 60.1 && l[1][0] === 60.1 && Math.min(l[0][1], l[1][1]) < 115 && Math.max(l[0][1], l[1][1]) > 115)
  && jlW.some(l => l[0][0] === 60.1 && Math.max(l[0][1], l[1][1]) <= 100.2));
const zIO = vmCtx.validateProject({ format: 'tile-setting-out', version: 1, faces: { B: { fw: 200, fh: 280, zones: [{ y0: 100, y1: 130, TL: 15, TW: 30, name: '腰帶' }, { x0: 5, TL: 10, TW: 10 }] } } });
assert('redteam', '資料檔：只寫高度的腰帶可以存讀；左右只寫一邊的分區略過並提醒',
  zIO.project.faces.B.zones.length === 1 && zIO.project.faces.B.zones[0].y1 === 130 && zIO.project.faces.B.zones[0].x0 === undefined
  && zIO.warnings.some(w => w.includes('B.zones')));
assert('smoke', '分區文字：上下分段／腰帶／一塊都能讀回寫出',
  vmCtx.formatZones(vmCtx.parseZones('高 0-120: 30×60 下段；高100~130：15x30 腰帶; 30-90 高 30-90: 10×10 塊')) === '高 0-120: 30×60 下段; 高 100-130: 15×30 腰帶; 30-90 高 30-90: 10×10 塊');

// Test S11: 小料只看露出部分最短邊（< 5 小料、< 3 紅圈避免小料、磚本身 ≤ 5 不列入）
const pTh = { TL: 120, TW: 120, joint: 0.2, price: 0, smallTh: 5, avoidTh: 3 };
const gridCfg = (xoff) => ({ dir: 'H', mode: 'grid', xalign: 'custom', xoff, yalign: 'bottom', yoff: 0 });
const resA = layout(pTh, 171, 289, gridCfg(59), []);
assert('smoke', '小料：A 面左上 59×49 面積雖小但最短邊夠寬，不算小料', resA.danger === 0, `danger=${resA.danger}`);
const resDoor = layout(pTh, 210, 289, gridCfg(104), [{ kind: 'door', x: 104, y: 0, w: 86, h: 239, area: 86 * 239 }]);
assert('smoke', '小料：門旁 20cm 露出條（磚大部分被門遮住）不算小料', resDoor.danger === 0, `danger=${resDoor.danger}`);
const res4 = layout(pTh, 124.2, 120, gridCfg(0), []);
assert('smoke', '小料：右側 4cm 條＝小料但不畫紅圈（≥ 3cm）', res4.danger === 1 && res4.avoid === 0, `danger=${res4.danger} avoid=${res4.avoid}`);
const res2 = layout(pTh, 122.2, 120, gridCfg(0), []);
assert('smoke', '小料：右側 2cm 條＝避免小料（< 3cm 紅圈）', res2.danger === 1 && res2.avoid === 1, `danger=${res2.danger} avoid=${res2.avoid}`);
const resMosaic = layout(Object.assign({}, pTh, { TL: 4.8, TW: 4.8 }), 101, 100, gridCfg(0), []);
assert('smoke', '小料：磚本身 4.8cm（≤ 5）裁到多窄都不列入', resMosaic.cut > 0 && resMosaic.danger === 0);

// Test S12: 設備與備註（B 面馬桶立面＋「因馬桶位置提高一塊磚」；平面馬桶、臉盆、門）
const ovB = fz && fz.B.overlay, ovF = fz && fz.floor.overlay;
assert('smoke', '設備：B 面馬桶立面線稿在 B 面範圍內（圖塊展開）',
  ovB && ovB.polys.length >= 20 && ovB.polys.every(p => p.pts.every(q => q[0] >= -1 && q[0] <= 208 && q[1] >= -1 && q[1] <= 290)));
assert('smoke', '備註：B 面「因馬桶位置／提高一塊磚」，箭頭指在 B 面上',
  ovB && ovB.notes.length === 1 && ovB.notes[0].text === '因馬桶位置\n提高一塊磚'
  && ovB.notes[0].leaders[0][0][0] > 117 && ovB.notes[0].leaders[0][0][0] < 207);
assert('smoke', '設備：平面有馬桶型號 Subway2.0 與臉盆 ALAPE（圖塊內文字）',
  ovF && ovF.texts.some(t => t.text === 'Subway2.0') && ovF.texts.some(t => t.text.startsWith('ALAPE')));
assert('smoke', '設備：不重複搬程式自己會畫的東西（磚縫、紅線、門框、放樣標示、A 面沒有設備）',
  fz && fz.A.overlay.polys.length === 0 && fz.D.overlay.polys.length === 0 && ovB.texts.every(t => !/放樣|填縫/.test(t.text)));
const semi = vmCtx.bulgePts([0, 0], [2, 0], 1);
assert('smoke', '線稿：聚合線 bulge＝1 是半圓，終點正確且弧在弦的右側',
  Math.abs(semi[semi.length - 1][0] - 2) < 1e-9 && Math.abs(semi[semi.length - 1][1]) < 1e-9 && Math.min(...semi.map(p => p[1])) < -0.99);

// Test S13: L 形地坪（DXF 平面內框沒封閉，補直角取面積小的那種，門檻不算地坪）
const ol = fz && fz.floor.outline;
const flCfgL = { dir: 'H', mode: 'grid', xalign: 'custom', xoff: 117, yalign: 'custom', yoff: 172, poly: ol };
const rL = ol && layout({ TL: 120, TW: 60, joint: 0.2, smallTh: 5, avoidTh: 5 }, 207, 187, flCfgL, []);
assert('smoke', 'L 形：外框外（左上 117×29、左下 20×60、門檻 207×15）共 7698 cm² 不鋪',
  rL && Math.abs(rL.voidArea - 7698) < 0.5, rL && `voidArea=${rL.voidArea}`);
assert('smoke', 'L 形：地磚只算外框內（6 片、理論 5 片），外框外不算門窗扣除',
  rL && rL.total === 6 && rL.net === 5 && rL.opArea === 0, rL && `total=${rL.total} net=${rL.net}`);
const rRect = layout({ TL: 50, TW: 50, joint: 0, smallTh: 5, avoidTh: 5 }, 100, 50, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', poly: [[0, 0], [100, 0], [100, 50], [0, 50]] }, []);
assert('smoke', '外框：矩形外框跟沒有外框一樣（2 片整磚）', rRect.full === 2 && rRect.cut === 0 && rRect.voidArea === 0);

assert('smoke', '外框文字「0,29 117,29 …」可讀回、可寫出，少於 3 點＝沒有外框',
  vmCtx.formatOutline(vmCtx.parseOutline('0,29 117,29；117,0 207,0')) === '0,29 117,29 117,0 207,0' && vmCtx.parseOutline('1,2 3,4') === null && vmCtx.parseOutline('') === null);

// Test S13b: 斜牆地坪（右牆由上 x=100 斜到下 x=90）
const trap = [[0, 0], [100, 0], [90, 100], [0, 100]];
const rT = layout({ TL: 50, TW: 50, joint: 0, smallTh: 5, avoidTh: 5 }, 100, 100, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', poly: trap }, []);
assert('smoke', '斜牆：左排 2 片整磚、右排 2 片斜切，理論片數照實際面積 9500 算 4 片',
  rT.full === 2 && rT.cut === 2 && rT.net === 4 && Math.abs(rT.voidArea - 500) < 0.01 && rT.tiles.filter(t => t.poly).length === 2);
assert('smoke', '斜牆：斜切的磚記下實際形狀（梯形 4 點，右邊界在牆上）',
  rT.tiles.filter(t => t.poly).every(t => t.poly.length === 4 && Math.max(...t.poly.map(p => p[0])) <= 100 + 1e-9));
const sliverPoly = [[0, 0], [63, 0], [62, 100], [0, 100]];
const rS = layout({ TL: 60, TW: 60, joint: 0, smallTh: 5, avoidTh: 5 }, 100, 100, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', poly: sliverPoly }, []);
assert('smoke', '斜牆：牆邊剩 2～3cm 的細長條判成小料並紅圈', rS.danger === 2 && rS.avoid === 2, `danger=${rS.danger}`);
assert('smoke', '裁切：多邊形裁到矩形的面積正確（三角形一半在框內）',
  Math.abs(vmCtx.polyArea(vmCtx.clipPolygonRect([[0, 0], [10, 0], [0, 10]], 0, 0, 5, 10)) - 37.5) < 1e-9);

// Test S14: 立面與平面的左右關係（站在房間裡面向牆看：A、D 跟平面左右相反）
const dimsCase = { floor: { fw: 207, fh: 187 }, A: { fw: 171 }, B: { fw: 207 }, C: { fw: 172 }, D: { fw: 210 } };
assert('smoke', '平面：D 面門 104～190 在平面上是 20～106（同施工圖平面門在左下）',
  vmCtx.planPos('D', 104, 86, dimsCase) === 20 && vmCtx.planPos('B', 117, 90, dimsCase) === 117);
assert('smoke', '平面：A 面左右鏡像、C 面不變', vmCtx.planPos('A', 0, 50, dimsCase) === 121 && vmCtx.planPos('C', 30, 40, dimsCase) === 30);

// Test S15: 此面不鋪磚（圖上沒有的立面、油漆牆）
setChecks({ A_skip: true });
const rowsSkip = vmCtx.computeAll(vmCtx.params());
const rowA = rowsSkip.find(r => r.key === 'A'), rowB = rowsSkip.find(r => r.key === 'B');
assert('smoke', '不鋪磚：勾選的 A 面不排磚、不計料，其他面照算', rowA.r.total === 0 && rowA.r.tiles.length === 0 && rowB.r.total > 0);
setChecks({ A_skip: false });

// Test S16: 報價（下單＝叫料×(1＋備品%) 無條件進位；單價以型號查；沒填單價不算金額）
vm.runInContext(`projectMaterials = [{ role: '壁', code: 'W120', spec: '120*120', size: [120, 120] }, { role: '地', code: 'F60', spec: '60*120', size: [60, 120] }];`, vmCtx);
const quote = vmCtx.quoteLines([{ label: '壁 120×120', TL: 120, TW: 120, name: '', total: 21 }, { label: '地 60×120', TL: 120, TW: 60, name: '', total: 6 }],
  { W120: 850 }, 5, 0);
assert('smoke', '報價：壁 21 片加 5% 備品＝下單 23 片 × 850＝19,550 元', quote.lines[0].order === 23 && quote.lines[0].amount === 19550);
assert('smoke', '報價：地磚沒填單價不算金額，合計只算有單價的、並提示 1 種未填', quote.lines[1].amount === null && quote.sum === 19550 && quote.missing === 1);
assert('smoke', '報價：剛好整數不多進一片（20 片×0%＝20、20 片×5%＝21）', vmCtx.orderQty(20, 0) === 20 && vmCtx.orderQty(20, 5) === 21);
vm.runInContext('projectMaterials = [];', vmCtx);

// Test S17: 裁切清單與剩料回收
const reuse1 = vmCtx.planReuse([{ a: 59, b: 60 }, { a: 59, b: 60 }], 120, 60, 0.3, 5);
assert('smoke', '剩料：120 的磚切 59，剩 60.7 還能切第二塊 59 → 2 塊只開 1 片新磚', reuse1.newTiles === 1 && reuse1.saved === 1);
const reuse2 = vmCtx.planReuse([{ a: 70, b: 60 }, { a: 70, b: 60 }], 120, 60, 0.3, 5);
assert('smoke', '剩料：切 70 剩 49.7 不夠第二塊 70 → 2 塊開 2 片', reuse2.newTiles === 2 && reuse2.saved === 0);
const reuse3 = vmCtx.planReuse([{ a: 60, b: 117 }], 120, 120, 0.3, 5);
assert('smoke', '剩料：正方形磚可以轉 90° 放（60×117 放進 120×120）', reuse3.newTiles === 1);
// 120×60 磚切 65 剩 54.7×60；下一塊要 58×50：轉 90° 才放得下，但長方形磚不准轉（紋路方向）→ 另開新磚
const reuse4 = vmCtx.planReuse([{ a: 65, b: 60 }, { a: 58, b: 50 }], 120, 60, 0.3, 5);
assert('smoke', '剩料：長方形磚不轉向（紋路方向），轉了才放得下的不算', reuse4.newTiles === 2 && reuse4.saved === 0);
const pcDoor = vmCtx.cutPieceSize({ x0: 104, y0: 0, wL: 106, wW: 120, full: false }, [{ x: 104, y: 0, w: 86, h: 239 }]);
assert('smoke', '裁切清單：門旁那塊實際只要切 20×120（被門遮住的不用切）', Math.abs(pcDoor.w - 20) < 1e-9 && pcDoor.h === 120);
const pcDoorTop = vmCtx.cutPieceSize({ x0: 104, y0: 120.2, wL: 106, wW: 120, full: false }, [{ x: 104, y: 0, w: 86, h: 239 }]);
assert('smoke', '裁切清單：門頂上方只露 1.2cm 被門框蓋住，那塊也只要切 20×120', Math.abs(pcDoorTop.w - 20) < 1e-9 && Math.abs(pcDoorTop.h - 120) < 1e-9);
const pcL = vmCtx.cutPieceSize({ x0: 0, y0: 29, wL: 117, wW: 60, full: false, poly: [[0, 29], [117, 29], [117, 89], [0, 89]] }, []);
const pcS = vmCtx.cutPieceSize({ x0: 0, y0: 0, wL: 50, wW: 50, full: false, poly: [[0, 0], [50, 0], [45, 50], [0, 50]] }, []);
assert('smoke', '裁切清單：L 形缺角是直角切不標斜切，斜牆切到才標', !pcL.slanted && pcS.slanted);

// Test S18: 自動找最佳起磚點
// 牆寬 124.2、60 磚、縫 0.2：靠左起磚 → 60、60、剩 3.8 小料；最佳起點要讓小料消失
const pS18 = { TL: 60, TW: 60, joint: 0.2, smallTh: 5, avoidTh: 5 };
const cfgS18 = { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 };
const leftS18 = layout(pS18, 124.2, 250, cfgS18, [], true);
const overS18 = vmCtx.bestFaceOffsets(pS18, 124.2, 250, cfgS18, [], null, false);
const bestS18 = layout(pS18, 124.2, 250, Object.assign({}, cfgS18, overS18), [], true);
assert('smoke', '最佳起磚點：124.2 寬牆靠左有小料，自動找的起點小料 0 片', leftS18.danger > 0 && bestS18.danger === 0 && overS18.xalign === 'custom',
  `靠左 ${leftS18.danger}、最佳 ${bestS18.danger}（xoff ${overS18.xoff}）`);
setInputs({ L: 207, W: 187, H: 240, TL: 60, TW: 60, joint: 2,
  floor_fw: 207, floor_fh: 187, A_fw: 187, A_fh: 240, B_fw: 207, B_fh: 240, C_fw: 187, C_fh: 240, D_fw: 207, D_fh: 240 });
['floor', 'A', 'B', 'C', 'D'].forEach(k => setInputs({ [k + '_dir']: 'H', [k + '_mode']: 'grid', [k + '_xalign']: 'left', [k + '_yalign']: 'bottom', [k + '_xoff']: 0, [k + '_yoff']: 0, [k + '_tile']: '', [k + '_marks']: '', [k + '_zones']: '' }));
setOpenings([]);
setColumnParams({ on: false });
const tS18 = Date.now();
const plansS18 = vmCtx.searchPlans(vmCtx.params());
const msS18 = Date.now() - tS18;
const curS18 = plansS18.find(x => x.id === 'current'), bestPlan = plansS18.find(x => x.best);
assert('smoke', '方案比較：列出目前／各面最省／四面對縫／置中，且只有一個推薦',
  ['current', 'perFace', 'joint', 'center'].every(id => plansS18.some(x => x.id === id)) && plansS18.filter(x => x.best).length === 1);
assert('smoke', '方案比較：推薦方案不比目前設定差（小料、浪費都不會變多）',
  bestPlan.score.danger <= curS18.score.danger && (bestPlan.score.danger < curS18.score.danger || bestPlan.score.waste <= curS18.score.waste + 1e-6),
  `目前 ${curS18.score.danger} 片/${curS18.score.waste.toFixed(0)}，推薦 ${bestPlan.name} ${bestPlan.score.danger} 片/${bestPlan.score.waste.toFixed(0)}`);
// 套用四面對縫方案後，牆縫要等於「鎖定四面對縫」算出來的位置
const jointPlan = plansS18.find(x => x.id === 'joint');
setInputs({ floor_xalign: 'custom', floor_xoff: jointPlan.over.floor.xoff, floor_yalign: 'custom', floor_yoff: jointPlan.over.floor.yoff });
const dimsS18 = faceDims(vmCtx.params());
assert('smoke', '方案比較：四面對縫方案的牆起點＝鎖定對縫的牆起點（套用後鎖定不會跳掉）',
  ['A', 'B', 'C', 'D'].every(k => Math.abs(vmCtx.calcJointAlignment(vmCtx.params(), dimsS18, k) - jointPlan.over[k].xoff) < 1e-6));
assert('smoke', `方案比較：一間浴室算完 < 3 秒（實測 ${msS18}ms）`, msS18 < 3000);

// Test S18b: L 型切割（磚包住門窗轉角，再小都算）
// #18 D 面：寬 210、高 289、120 磚、起磚線 104、門 104～190 高 239
const pL = { TL: 120, TW: 120, joint: 0.2, smallTh: 5, avoidTh: 5 };
const doorL = [{ kind: 'door', x: 104, y: 0, w: 86, h: 239 }];
const cfgL = { dir: 'H', mode: 'grid', xalign: 'custom', xoff: 104, yalign: 'bottom', yoff: 0 };
const fromFloor = layout(pL, 210, 289, cfgL, doorL, true);
const lTile = fromFloor.tiles.find(t => t.lcut);
assert('smoke', 'L 型：從地面排，120.2～240.2 那排包住門右上角（門頂只多 1.2cm 也算）',
  fromFloor.lcut === 1 && lTile && lTile.lc[0] === 190 && lTile.lc[1] === 239, JSON.stringify({ n: fromFloor.lcut, lc: lTile && lTile.lc }));
const alignTop = layout(pL, 210, 289, Object.assign({}, cfgL, { yalign: 'custom', yoff: 239 - 120.2 }), doorL, true);
assert('smoke', 'L 型：橫縫對齊門頂 239（像原施工圖）就沒有 L 型', alignTop.lcut === 0, String(alignTop.lcut));
assert('smoke', 'L 型：門邊整條切（直縫剛好在門框）不算 L 型', layout(pL, 210, 289, Object.assign({}, cfgL, { yalign: 'custom', yoff: 239 - 120.2 }), doorL, true).tiles.filter(t => t.lcut).length === 0
  && vmCtx.lCutOf(100, 0, 220, 120, [{ x: 104, y: 0, w: 86, h: 239 }]) === null && JSON.stringify(vmCtx.lCutOf(100, 200, 220, 320, [{ x: 104, y: 0, w: 86, h: 239 }])) === '[104,239]');
const overL = vmCtx.bestFaceOffsets(pL, 210, 289, cfgL, doorL, null, false);
const bestL = layout(pL, 210, 289, Object.assign({}, cfgL, overL), doorL, true);
assert('smoke', 'L 型：自動找起磚點會上下移動避開 L 型，且不產生小料', bestL.lcut === 0 && bestL.danger === 0, JSON.stringify(overL));
assert('smoke', 'L 型：方案比較先比 L 型、再比小料、最後比浪費（牆底一點小料會被地磚蓋住，L 型優先避開）',
  vmCtx.betterScore({ danger: 1, lcut: 0, waste: 9 }, { danger: 0, lcut: 1, waste: 0 }) && vmCtx.betterScore({ danger: 0, lcut: 0, waste: 9 }, { danger: 1, lcut: 0, waste: 0 })
  && vmCtx.betterScore({ danger: 0, lcut: 0, waste: 1 }, { danger: 0, lcut: 0, waste: 2 }));

// Test S18c: 牆底被地磚蓋住（地磚＋黏著層至少墊高約 1cm）
// #11 A 面：寬 214、高 263、120 磚、門 62～142 高 241；橫縫對齊門頂 → 牆底剩 0.6cm
const doorC = [{ kind: 'door', x: 62, y: 0, w: 80, h: 241 }];
const cfgC = { dir: 'H', mode: 'grid', xalign: 'custom', xoff: 22, yalign: 'custom', yoff: 0.6 };
const noCover = layout(Object.assign({}, pL, { floorCover: 0 }), 214, 263, cfgC, doorC, true);
const cover1 = layout(Object.assign({}, pL, { floorCover: 1 }), 214, 263, cfgC, doorC, true);
assert('smoke', '牆底蓋住：0.6cm 的牆底切條不考慮蓋住時是小料；蓋住 1cm 就不算小料、也不用叫料',
  noCover.danger >= 2 && cover1.danger === 0 && cover1.total < noCover.total && cover1.lcut === 0,
  JSON.stringify({ before: [noCover.danger, noCover.total], after: [cover1.danger, cover1.total] }));
const fullFromFloor = layout(Object.assign({}, pL, { floorCover: 1 }), 240.4, 240.4, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 }, [], true);
assert('smoke', '牆底蓋住：從地面起貼的整磚底下被蓋 1cm 還是整磚（不會變成裁切）', fullFromFloor.full === 4 && fullFromFloor.cut === 0, JSON.stringify([fullFromFloor.full, fullFromFloor.cut]));
const strip3 = layout(Object.assign({}, pL, { floorCover: 1 }), 120, 243.4, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'custom', xoff: 0, yoff: 3 }, [], true);
assert('smoke', '牆底蓋住：跨過蓋住線的切條只看露出的部分（3cm 高、露出 2cm → 仍是小料）', strip3.danger === 1, String(strip3.danger));
const coverIO = vmCtx.validateProject({ format: 'tile-setting-out', version: 1, tile: { floorCover: 1.5 } });
const coverBad = vmCtx.validateProject({ format: 'tile-setting-out', version: 1, tile: { floorCover: -2 } });
assert('redteam', '資料檔：牆底蓋住高度可存可讀，負數略過並提醒', coverIO.project.tile.floorCover === 1.5 && coverBad.project.tile.floorCover === undefined && coverBad.warnings.some(w => w.includes('floorCover')));

// Test S18d: 「避免小料」同一橫排／直排只標一次
// 90 寬、64 高牆貼 15 磚（縫 0.2）：頂端一整排只剩 3.2 → 6 片小料、1 個標記；右側再多一直排窄條 → 另 1 個
const pM = { TL: 14.8, TW: 14.8, joint: 0.2, smallTh: 5, avoidTh: 5 };
const rowOnly = layout(pM, 90, 63.2, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 }, [], true);
const rowCol = layout(pM, 93, 63.2, { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 }, [], true);
const mRow = vmCtx.sliverMarks(rowOnly.tiles, []), mRowCol = vmCtx.sliverMarks(rowCol.tiles, []);
assert('smoke', '避免小料：頂端一整排 6 片小料只圈 1 次（圈在中間），再多一直排窄條共圈 2 次；片數照算',
  rowOnly.avoid === 6 && mRow.length === 1 && Math.abs(mRow[0].cx - 52.6) < 8 && mRowCol.length === 2 && rowCol.avoid > 6,
  JSON.stringify({ avoid: [rowOnly.avoid, rowCol.avoid], marks: [mRow.length, mRowCol.length], cx: mRow[0] && mRow[0].cx }));

// Test S20: 只有地坪平面 → 自動生成四面牆
const planDxf = n => vmCtx.parseDxf(fs.readFileSync(path.join(ROOT_DIR, 'tests', 'fixtures', n), 'utf8'));
const dA = planDxf('plan-abcd.dxf'), dO = planDxf('plan-outline.dxf'), dR = planDxf('plan-rooms.dxf'), dF = planDxf('plan-floor.dxf');
const rA = vmCtx.findPlanRooms(dA), sA = rA[0] && vmCtx.buildPlanSheet(dA, rA[0], { H: 280, doorH: 210 });
assert('smoke', '只有地坪（ABCD）：沒有立面也找得到房間 207×187（門洞正對中心也不會穿出去）',
  vmCtx.findDxfSheets(dA).length === 0 && rA.length === 1 && sA.project.faces.floor.fw === 207 && sA.project.faces.floor.fh === 187);
assert('smoke', '只有地坪：四面牆 B/D＝地坪寬、A/C＝地坪深，牆高與門高讀圖上「天花 FL+289」「門高 239」',
  sA.project.faces.B.fw === 207 && sA.project.faces.A.fw === 187 && sA.project.faces.C.fh === 289 && sA.project.room.H === 289
  && JSON.stringify(sA.project.openings.map(o => [o.face, o.x, o.w, o.h])) === '[["D",101,86,239]]', JSON.stringify(sA.project.openings));
assert('smoke', '只有地坪：材料文字（壁 120*120、地 60*120）照樣讀，地坪換成地磚尺寸；房間名稱當圖名',
  sA.project.tile.TL === 120 && sA.project.faces.floor.TL === 120 && sA.project.faces.floor.TW === 60 && sA.meta.drawingName === '主臥浴室');
const sO = vmCtx.buildPlanSheet(dO, vmCtx.findPlanRooms(dO)[0], { H: 250, doorH: 200 });
assert('smoke', '只有地坪（一條 L 形外框）：照外框裁地磚；圖上沒寫高度就用網頁的 H 250、門高 200；A 面門距左 30 寬 80',
  sO.project.faces.floor.outline.length === 6 && sO.project.room.H === 250 && JSON.stringify(sO.project.openings.map(o => [o.face, o.x, o.w, o.h])) === '[["A",30,80,200]]',
  JSON.stringify(sO.project.openings));
const rR = vmCtx.findPlanRooms(dR);
assert('smoke', '只有地坪（兩間、雙線牆）：取內圈當房間、浴缸外框不算一間',
  rR.length === 2 && rR.every(r => !r.e || !(r.x1 - r.x0 === 70)) && rR.map(r => Math.round(r.x1 - r.x0) + 'x' + Math.round(r.y1 - r.y0)).sort().join(',') === '180x240,210x180');
const r1F = vmCtx.roomAt(dF, 150, 200), r2F = vmCtx.roomAt(dF, 415, 90);
const s1F = vmCtx.buildPlanSheet(dF, r1F, {}), s2F = vmCtx.buildPlanSheet(dF, r2F, {});
assert('smoke', '整張平面圖：點哪間就圍哪間；隔壁房間的開門弧線不算到這間',
  vmCtx.findPlanRooms(dF).length === 0 && Math.round(r1F.x1 - r1F.x0) === 300 && s1F.project.openings.length === 0
  && Math.round(r2F.x1 - r2F.x0) === 200 && JSON.stringify(s2F.project.openings.map(o => [o.face, o.x, o.w])) === '[["A",100,70]]');
// 照使用者實際畫法（青色門窗、窗洞讓牆斷開、門片在房內）：射線不能從窗洞穿出去、不能把門片當牆
const dC = planDxf('plan-cyan.dxf');
const cyanRooms = [[121, 60], [30, 20], [220, 100], [20, 100]].map(([x, y]) => vmCtx.roomAt(dC, x, y));
assert('smoke', '青色門窗的平面：點房間任何位置都圍出 243×120（窗洞、門片都不會讓牆跑掉）',
  cyanRooms.every(r => r && Math.round(r.x1 - r.x0) === 243 && Math.round(r.y1 - r.y0) === 120),
  JSON.stringify(cyanRooms.map(r => r && [Math.round(r.x1 - r.x0), Math.round(r.y1 - r.y0)])));
const sC = vmCtx.buildPlanSheet(dC, cyanRooms[0], { H: 231, doorH: 210, sill: 100, winH: 90 });
assert('smoke', '青色門窗的平面：門量牆開口（門框外寬 76，不是門片 66），窗從牆斷開處＋青色窗線找到，左右位置照平面、高度用預設',
  JSON.stringify(sC.project.openings.map(o => [o.kind, o.face, o.x, o.w, o.y, o.h])) === '[["door","C",44,76,0,210],["window","A",28,80,100,90]]',
  JSON.stringify(sC.project.openings));
assert('redteam', '整張平面圖：點在房間外面回「找不到」不當機', vmCtx.roomAt(dF, 2000, 2000) === null);
assert('smoke', '只有地坪：天花／門高文字的各種寫法都讀得到',
  ['天花 FL+289', '天花板高 280', 'CH=280', 'C.H. 300', 'FL+289'].every(t => vm.runInContext('PLAN_TEXT_CEIL', vmCtx).test(t))
  && ['門高 239', 'DH 210', 'D.H.=200'].every(t => vm.runInContext('PLAN_TEXT_DOOR', vmCtx).test(t)));

// Test S19: 匯出 DXF（照施工圖畫法，貼回 AutoCAD）
// 124.2×250 牆、60 磚、縫 0.2、靠左由地起：磚縫取縫中線 → 直縫 60.1、120.3；橫縫 60.1、120.3、180.5、240.7
const wallS19 = layout(pS18, 124.2, 250, cfgS18, [], true);
const jlS19 = vmCtx.jointLines(wallS19.tiles, 124.2, 250, 0.2, []);
const vxS19 = jlS19.filter(l => l[0][0] === l[1][0]).map(l => l[0][0]).sort((a, b) => a - b);
const hyS19 = jlS19.filter(l => l[0][1] === l[1][1]).map(l => l[0][1]).sort((a, b) => a - b);
assert('smoke', '匯出 DXF：磚縫畫成單線（縫中線），每條直縫、橫縫各一條貫通',
  JSON.stringify(vxS19) === '[60.1,120.3]' && JSON.stringify(hyS19) === '[60.1,120.3,180.5,240.7]'
  && jlS19.every(l => (l[0][0] === l[1][0] && l[0][1] === 0 && l[1][1] === 250) || (l[0][1] === l[1][1] && l[0][0] === 0 && l[1][0] === 124.2)),
  JSON.stringify({ vxS19, hyS19, n: jlS19.length }));
const doorS19 = [{ kind: 'door', x: 104, y: 0, w: 86, h: 239 }];
const dS19 = layout({ TL: 120, TW: 120, joint: 0.2, smallTh: 5, avoidTh: 5 }, 210, 289, { dir: 'H', mode: 'grid', xalign: 'custom', xoff: 104, yalign: 'bottom', yoff: 0 }, doorS19, true);
const jdS19 = vmCtx.jointLines(dS19.tiles, 210, 289, 0.2, doorS19);
const inDoor = l => { const mx = (l[0][0] + l[1][0]) / 2, my = (l[0][1] + l[1][1]) / 2; return mx > 104.01 && mx < 189.99 && my > 0.01 && my < 238.99; };
assert('smoke', '匯出 DXF：門裡面不畫磚縫（門框邊的縫保留）', jdS19.length > 0 && !jdS19.some(inDoor) && jdS19.some(l => l[0][0] === 104 && l[1][0] === 104));
// 整張圖：用 S18 的 207×187 浴室加一樘門
setOpenings([{ id: 'dx1', kind: 'door', name: '門', face: 'D', w: 86, h: 239, x: 104, y: 0 }]);
setInputs({ D_xalign: 'custom', D_xoff: 104 });
const dxfS19 = vmCtx.buildDxf(vmCtx.params(), vmCtx.computeAll(vmCtx.params()));
const handles = [];
// 檔頭（HEADER）裡的 $HANDSEED 也是代碼 5，不算物件編號
const bodyS19 = dxfS19.slice(dxfS19.indexOf('ENDSEC'));
bodyS19.split('\r\n').forEach((v, i, a) => { if (i % 2 === 1 && (v.trim() === '5' || v.trim() === '105')) handles.push(parseInt(a[i + 1], 16)); });
const seedS19 = parseInt(dxfS19.match(/\$HANDSEED\r\n\s*5\r\n([0-9A-F]+)/)[1], 16);
assert('smoke', '匯出 DXF：R2013 格式、每個物件編號不重複、下一個編號比全部都大（AutoCAD 才讀得進去）',
  dxfS19.includes('AC1027') && new Set(handles).size === handles.length && seedS19 > Math.max(...handles) && /EOF\s*$/.test(dxfS19),
  `handles ${handles.length}/${new Set(handles).size}, seed ${seedS19} max ${Math.max(...handles)}`);
const reS19 = vmCtx.parseDxf(dxfS19);
const cnt = (t, l, c) => reS19.entities.filter(e => e.type === t && (!l || e.layer === l) && (c === undefined || e.color === c)).length;
// 匯入程式不讀尺寸物件，直接數檔案裡 T-DIM 層的 DIMENSION
const dimsS19 = (dxfS19.match(/ {2}0\r\nDIMENSION\r\n(?:.*\r\n){6} {2}8\r\nT-DIM\r\n/g) || []).length;
assert('smoke', '匯出 DXF：自己的 DXF 讀得回來——壁磚層／地磚層磚縫分開、T-DIM 尺寸、紅線、青色門框都在',
  cnt('LINE', '壁磚') > 10 && cnt('LINE', '地磚') > 0 && dimsS19 >= 8 && cnt('LINE', '0', 1) >= 1 && cnt('LWPOLYLINE', '0', 4) === 1,
  JSON.stringify({ wall: cnt('LINE', '壁磚'), floor: cnt('LINE', '地磚'), dims: dimsS19, red: cnt('LINE', '0', 1), door: cnt('LWPOLYLINE', '0', 4) }));
// Hatch：壁磚、地磚各在自己的 -HATCH 層，不同尺寸的磚用不同樣式（這間牆 60×60、地 60×60 同一種 → 同樣式）
const hatchS19 = [...dxfS19.matchAll(/ {2}0\r\nHATCH\r\n(?:.*\r\n){6} {2}8\r\n(.*)\r\n 62\r\n(\d+)\r\n100\r\nAcDbHatch\r\n(?:.*\r\n){12} {2}2\r\n(.*)\r\n/g)].map(m => m.slice(1).join('|'));
assert('smoke', '匯出 DXF：每面都有 Hatch，壁磚在「壁磚-HATCH」、地磚在「地磚-HATCH」，同一種磚同一個樣式',
  hatchS19.filter(h => h.startsWith('壁磚-HATCH|2|ANSI31')).length === 4 && hatchS19.filter(h => h.startsWith('地磚-HATCH|2|ANSI31')).length === 1,
  JSON.stringify(hatchS19));
// 地坪換成自己的磚（60×120）：地坪 Hatch 要用地磚那一組，不能跟牆一樣
setInputs({ floor_tile: '60×120' });
const dxfS19b = vmCtx.buildDxf(vmCtx.params(), vmCtx.computeAll(vmCtx.params()));
const hatchS19b = [...dxfS19b.matchAll(/ {2}0\r\nHATCH\r\n(?:.*\r\n){6} {2}8\r\n(.*)\r\n 62\r\n(\d+)\r\n100\r\nAcDbHatch\r\n(?:.*\r\n){12} {2}2\r\n(.*)\r\n/g)].map(m => m.slice(1).join('|'));
assert('smoke', '匯出 DXF：牆、地不同磚時，地坪 Hatch 換另一組樣式',
  hatchS19b.some(h => h === '地磚-HATCH|41|ANSI34') && !hatchS19b.some(h => h.startsWith('地磚-HATCH|2|')), JSON.stringify(hatchS19b));
setInputs({ floor_tile: '' });
const hm = vmCtx.hatchIndexMap([{ key: 'A', cfg: {}, r: { groups: [{ label: '壁 120×120' }] } }, { key: 'B', cfg: {}, r: { groups: [{ label: '壁 120×120' }, { label: '主秀壁 14.8×14.8' }] } },
  { key: 'floor', cfg: {}, r: { groups: [{ label: '地 60×120' }] } }]);
assert('smoke', 'Hatch：每種磚依出現順序配一組樣式（壁→主秀壁→地各不同），同一種磚每面一樣',
  hm['壁 120×120'] === 0 && hm['主秀壁 14.8×14.8'] === 1 && hm['地 60×120'] === 2);
assert('smoke', '匯出 DXF：有「由此線開始放樣」（色號 62）與尺寸樣式「複本 ISO-25」',
  dxfS19.includes('由此線開始放樣') && reS19.entities.some(e => e.type === 'MTEXT' && e.color === 62) && dxfS19.includes('複本 ISO-25'));
setOpenings([]);
setInputs({ D_xalign: 'left', D_xoff: 0 });


const caseRows = [{ key: 'B', name: 'B立面', cfg: { dir: 'H', skip: false }, ops: [], r: zoneB }];
const listB = vmCtx.cutListByFace(vmCtx.cutPieces(caseRows));
assert('smoke', '裁切清單：B 面壁磚 117×120 ×2、117×48.5 ×1；主秀壁頂端 15×4 ×6（取到 0.5cm）',
  listB.length === 1 && listB[0].items.some(it => it.label === '120×120' && it.w === 117 && it.h === 120 && it.count === 2)
  && listB[0].items.some(it => it.label === '120×120' && it.w === 117 && it.h === 48.5 && it.count === 1)
  && listB[0].items.some(it => it.label.includes('主秀壁') && it.w === 15 && it.h === 4 && it.count === 6), JSON.stringify(listB[0] && listB[0].items));

// Test S18: Revit 外掛匯出的資料檔（revit-addin/RoomExportModel.cs 對範例浴室實際產生）網頁能讀
const revitJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'revit-sample.json'), 'utf8'));
const revitPj = vmCtx.validateProject(revitJson);
assert('smoke', 'Revit 匯出：資料檔通過檢查（無錯誤、無略過）', revitPj.errors.length === 0 && revitPj.warnings.length === 0, JSON.stringify(revitPj.warnings));
const rDoor = revitPj.project.openings.find(o => o.kind === 'door');
assert('smoke', 'Revit 匯出：門在 D 面、換回平面是 20～106（跟 DXF 第 18 張同一個門）',
  rDoor && rDoor.face === 'D' && vmCtx.planPos('D', rDoor.x, rDoor.w, { D: { fw: revitPj.project.faces.D.fw } }) === 20);
assert('smoke', 'Revit 匯出：L 形地坪外框 10 點、窗在 B 面窗台 140',
  revitPj.project.faces.floor.outline.length === 10 && revitPj.project.openings.some(o => o.face === 'B' && o.y === 140));

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

// Test R5e: 材料照片只收圖片 data URL
const photoChk = vmCtx.validateProject({ format: 'tile-setting-out', version: 1, materials: [
  { role: '壁', photo: 'data:image/jpeg;base64,AAAA' }, { role: '地', photo: 'javascript:alert(1)' }, { role: '主秀壁', photo: 'http://x/y.jpg' }] });
assert('redteam', '資料檔：材料照片只接受圖片 data URL（網址、程式碼一律丟掉）',
  photoChk.project.materials[0].photo === 'data:image/jpeg;base64,AAAA' && photoChk.project.materials[1].photo === undefined && photoChk.project.materials[2].photo === undefined);

// Test R5d: 資料檔裡的設備線稿亂寫，只留正確的部分
const badOv = vmCtx.cleanOverlay({ polys: [{ c: 5, pts: [[0, 0], [1, 1]] }, { pts: [[0, 'x']] }, null], texts: [{ x: 1, y: 2, text: 'ok' }, { x: 'a' }], notes: 'nope' });
assert('redteam', '資料檔：壞掉的設備線稿／文字被略過，好的保留',
  badOv.polys.length === 1 && badOv.texts.length === 1 && badOv.notes.length === 0 && vmCtx.cleanOverlay(null) === undefined);

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
