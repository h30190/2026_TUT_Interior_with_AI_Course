// 專案配置、常數與全域工具函式
const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const EPS = 1e-6;
// 畫布邏輯尺寸（繪圖與滑鼠座標換算共用）
const CANVAS_W = 1240, CANVAS_H = 820;

function num(id, dft) {
  const el = $(id);
  if (!el) return dft;
  const v = parseFloat(el.value);
  return (Number.isFinite(v) && v > 0) ? v : dft;
}

function num0(id, dft) {
  const el = $(id);
  if (!el) return dft;
  const v = parseFloat(el.value);
  return (Number.isFinite(v) && v >= 0) ? v : dft;
}

const PRESETS = {
  living: { L: 600, W: 400, H: 280, TL: 120, TW: 60 },
  bedroom: { L: 450, W: 350, H: 280, TL: 15, TW: 75 },
  bath: { L: 240, W: 180, H: 240, TL: 30, TW: 60 },
  // 依實際浴室施工圖（DXF 實測）：四面牆高皆 289（239 是 D 面門高），壁磚 120×120、地磚 60×120
  demo: {
    L: 171, W: 207, H: 289, TL: 120, TW: 120,
    faces: { floor: [207, 187], A: [171, 289], B: [207, 289], C: [172, 289], D: [210, 289] },
    // 各面放樣起點（「由此線開始放樣」）與紅線：A 59／142、B 117、C 靠左、D 對齊門框 104／190
    cfg: {
      floor: { xalign: 'custom', xoff: 117, yalign: 'custom', yoff: 172, TL: 120, TW: 60 },
      A: { xalign: 'custom', xoff: 59, marks: [59, 142] },
      B: { xalign: 'custom', xoff: 117, marks: [117] },
      C: { xalign: 'left', xoff: 0 },
      D: { xalign: 'custom', xoff: 104, marks: [190] }
    },
    openings: 'caseop'
  }
};

const FACE_KEYS = ['floor', 'A', 'B', 'C', 'D'];
const FACE_NAMES = { floor: '地坪', A: 'A立面', B: 'B立面', C: 'C立面', D: 'D立面' };
const MODE_NAMES = { grid: '齊貼', '55': '5-5半丁', '37': '3-7步', '28': '2-8步' };
const XALIGN_NAMES = { left: '靠左', right: '靠右', center: '水平中軸', custom: '自訂X' };
const YALIGN_NAMES = { bottom: '由地起', top: '由天花', center: '垂直置中', custom: '自訂Y' };
const CIRCLED = { A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ' };

const DEFAULT_CFG = {
  floor: { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 },
  A:     { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 },
  B:     { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 },
  C:     { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 },
  D:     { dir: 'H', mode: 'grid', xalign: 'left', yalign: 'bottom', xoff: 0, yoff: 0 }
};

let view = 'unfold';
// 圖面風格：'color' 彩色方案（給業主看損耗）／'line' 施工線稿（給師傅放樣）
let drawStyle = 'color';
let face = 'floor';
// 匯入施工圖帶進來的材料（壁／地／主秀壁…）與圖面資訊（工程名稱、圖名）
let projectMaterials = [];
const EMPTY_META = { project: '', drawingName: '', number: '' };
let projectMeta = Object.assign({}, EMPTY_META);

// 結構柱／分界紅線預設設定
const COLUMN_DEFAULT = {
  on: false,
  face: 'B',          // 預設所在立面
  x: 120,             // 柱線位置距左邊界 X (cm)
  w: 50,              // 柱子寬度 (cm)
  d: 50,              // 柱子凸入室內深度 (cm)
  mode: 'linked',     // 'linked' (左右連動) 或 'independent' (左右獨立起磚)
  xoffRight: 0        // 柱右側獨立起磚 X2 偏移量 (cm)
};
