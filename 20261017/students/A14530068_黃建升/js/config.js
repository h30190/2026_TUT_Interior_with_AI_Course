// 專案配置、常數與全域工具函式
const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const EPS = 1e-6;

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
  demo: {
    L: 171, W: 207, H: 289, TL: 30, TW: 60,
    faces: { floor: [207, 171], A: [171, 289], B: [207, 289], C: [172, 289], D: [210, 239] }
  }
};

const OPEN_PRESETS = {
  bathop: {
    door_on: true, door_face: 'D', door_w: 86, door_h: 239, door_x: 104, door_y: 0,
    win_on: true, win_face: 'B', win_w: 60, win_h: 60, win_x: 40, win_y: 140
  },
  livingop: {
    door_on: true, door_face: 'A', door_w: 100, door_h: 220, door_x: 20, door_y: 0,
    win_on: true, win_face: 'C', win_w: 240, win_h: 220, win_x: 40, win_y: 0
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
let face = 'floor';

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
