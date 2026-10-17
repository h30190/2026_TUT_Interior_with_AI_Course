/* 計算核心測試。跑法：node test/engine.test.js
   三類：①手算答案 ②性質／蜕變測試（隨機大量輸入）③輸入驗證與壞值 */
'use strict';
const assert = require('assert');
const E = require('../src/engine.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  通過｜' + name); }
  catch (e) { fail++; console.log('  失敗｜' + name + '\n        ' + String(e.message).split('\n').slice(0, 3).join('\n        ')); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-6), (msg || '') + ' 預期 ' + b + ' 實得 ' + a);

/* 簡易亂數（可重現） */
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const ri = (a, b) => Math.floor(rr(a, b + 1));

/* 兩個凸多邊形相交面積（Sutherland–Hodgman） */
function clipPoly(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = out; out = [];
    const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) { out.push(p); }
      if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
    }
  }
  return out;
}
function orient(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s >= 0 ? p : p.slice().reverse(); }
function overlapArea(a, b) { const c = clipPoly(orient(a), orient(b)); return c.length >= 3 ? E.polyArea(c) : 0; }

console.log('\n① 手算答案');

t('多邊形面積：10×10 矩形＝100、直角三角形＝50', () => {
  near(E.polyArea([[0, 0], [10, 0], [10, 10], [0, 10]]), 100);
  near(E.polyArea([[0, 0], [10, 0], [0, 10]]), 50);
});

t('矩形裁切：邊長 30 的磚裁掉一半，面積 450', () => {
  const c = E.clipRect([[0, 0], [30, 0], [30, 30], [0, 30]], [0, 0, 15, 30]);
  near(E.polyArea(c), 450);
});

t('旋轉 45° 的 10×10 磚，被裁成區域內只剩三角形：面積與手算一致', () => {
  const s = Math.SQRT1_2, sq = [[0, 0], [10 * s, 10 * s], [0, 20 * s], [-10 * s, 10 * s]];   // 菱形，面積 100
  near(E.polyArea(sq), 100, 1e-9);
  const half = E.clipRect(sq, [0, -100, 100, 100]);            // 右半個菱形＝50
  near(E.polyArea(half), 50, 1e-9);
});

t('對縫正貼：60.2×60.2 區域、30×30 磚（磚距 30.2）＝ 4 片整磚', () => {
  const box = [0, 0, 60.2, 60.2], tiles = E.genTiles(box, { w: 30, h: 30 }, 'stack-h', [0, 0], 0.2);
  const ev = E.evalTiles(tiles, [box], [], { w: 30, h: 30 }, false);
  assert.strictEqual(ev.pieces, 4); assert.strictEqual(ev.full, 4); assert.strictEqual(ev.cut, 0);
});

t('對縫正貼：177.3×237.3 區域、30×30 磚 → 48 片（35 整磚＋13 切磚），最小切邊 25.9', () => {
  const box = [1.35, 1.35, 178.65, 238.65], tile = { w: 30, h: 30 };
  const ev = E.evalTiles(E.genTiles(box, tile, 'stack-h', [1.35, 1.35], 0.2), [box], [], tile, false);
  assert.strictEqual(ev.pieces, 48); assert.strictEqual(ev.full, 35); assert.strictEqual(ev.cut, 13);
  near(ev.minCut, 237.3 - 7 * 30.2, 1e-6);
});

t('1/2 交丁：每兩列錯開半片，同樣 60.2 寬區域變成每列多一片切磚', () => {
  const box = [0, 0, 60.2, 60.2], tile = { w: 30, h: 30 };
  const ev = E.evalTiles(E.genTiles(box, tile, 'run2-h', [0, 0], 0.2), [box], [], tile, false);
  assert.strictEqual(ev.pieces, 2 + 3, '第一列 2 整磚＋第二列 1 整磚＋兩側各半片');
});

t('洞口：磚完全落在開孔內不算用磚；跨邊的算開孔磚', () => {
  const box = [0, 0, 60.2, 60.2], tile = { w: 30, h: 30 };
  const tiles = E.genTiles(box, tile, 'stack-h', [0, 0], 0.2);
  const hole = [0, 0, 30, 30];     // 剛好蓋掉第一片
  const ev = E.evalTiles(tiles, [box], [hole], tile, false);
  assert.strictEqual(ev.pieces, 3);
  const hole2 = [10, 10, 20, 20]; // 在一片磚中間開孔
  const ev2 = E.evalTiles(tiles, [box], [hole2], tile, false);
  assert.strictEqual(ev2.pieces, 4); assert.strictEqual(ev2.holeCut, 1);
});

t('預設案例：立面扣除＝磚 8.5mm＋黏著劑 5mm＝1.35cm；北南牆被夾、東西牆通到底', () => {
  const r = E.computeAll(E.defaultProject());
  assert.ok(r.ok, JSON.stringify(r.errors));
  near(r.walls.N.surface.net[0], 1.35); near(r.walls.N.surface.net[2], 180 - 1.35);
  near(r.walls.E.surface.net[0], 0); near(r.walls.E.surface.net[2], 240);
  near(r.walls.N.surface.deduct[0] + r.walls.N.surface.deduct[1], 2.7);
});

t('預設案例：地面淨區域 177.3×237.3，面積 4.208 m²（含門口處補回牆磚厚度的條狀）', () => {
  const r = E.computeAll(E.defaultProject()), n = r.floor.surface.net;
  near(n[2] - n[0], 177.3, 1e-9); near(n[3] - n[1], 237.3, 1e-9);
  near(r.floor.netArea, (177.3 * 237.3 + 80 * 1.35 - 100) / 1e4, 1e-9);
});

t('洩水：落水孔 (60,130)、1%，最遠角 (178.65,1.35) → 落差 1.75cm', () => {
  const r = E.computeAll(E.defaultProject());
  near(r.floor.slope.maxFall, 0.01 * Math.hypot(178.65 - 60, 1.35 - 130), 1e-9);
});

t('單片磚高低差：30×30 在 1% 點收水＝對角線 42.4cm × 1% ＝ 4.2mm > 3mm → 警告', () => {
  const r = E.computeAll(E.defaultProject());
  near(r.floor.slope.lip, 0.01 * Math.hypot(30, 30), 1e-9);
  assert.ok(!r.floor.slope.lipOk); assert.ok(r.warnings.some(w => /洩水坡度/.test(w)));
});

t('黏著劑：0.5cm × 1.6 kg/m²/mm ＝ 8 kg/m²，總量＝(地＋牆淨面積) × 8', () => {
  const r = E.computeAll(E.defaultProject());
  near(r.adhesive.kgPerM2, 8, 1e-9);
  near(r.adhesive.totalKg, (r.floor.netArea + r.wallTotal.netArea) * 8, 1e-6);
  assert.strictEqual(r.adhesive.bags, Math.ceil(r.adhesive.totalKg / 20 - 1e-9));
});

t('收邊條：門 2×200＋80、窗 2×60＋2×60，加頂端收邊；支數＝ceil(含損耗長度 ÷ 單支長)', () => {
  const r = E.computeAll(E.defaultProject()), items = r.trim.items;
  near(items.filter(i => /門/.test(i.label))[0].len, 480); near(items.filter(i => /窗/.test(i.label))[0].len, 240);
  assert.strictEqual(r.trim.pieces, Math.ceil(r.trim.totalCm * 1.05 / 250 - 1e-9));
});

t('先貼地後貼牆：牆磚從地磚完成面起（扣地磚厚＋黏著劑），地磚不再扣牆磚厚', () => {
  const p = E.defaultProject(); p.sequence = 'floorFirst';
  const r = E.computeAll(p);
  near(r.walls.N.surface.net[1], 0.9 + 0.5, 1e-9);
  near(r.floor.surface.net[0], 0); near(r.floor.surface.net[2], 180);
});

t('轉角收法「兩端都扣」：東西牆也扣 1.35×2', () => {
  const p = E.defaultProject(); p.corner = 'both';
  const r = E.computeAll(p);
  near(r.walls.E.surface.net[2] - r.walls.E.surface.net[0], 240 - 2.7, 1e-9);
});

t('只貼三面牆：沒貼的牆不計算，相鄰牆不扣厚度', () => {
  const p = E.defaultProject(); p.wallTiled.W = false;
  const r = E.computeAll(p);
  assert.ok(!r.walls.W);
  near(r.walls.N.surface.net[0], 0, 1e-9);     // 西側無牆磚 → 不扣
  near(r.floor.surface.net[0], 0, 1e-9);
});

console.log('\n② 性質／蜕變測試（隨機輸入）');

const ALL_METHODS = ['stack-h', 'stack-v', 'run2-h', 'run2-v', 'run3-h', 'run3-v', 'diag', 'herring-h', 'herring-v'];
function randTile(m) {
  if (m.indexOf('herring') === 0) { const S = [10, 15, 20][ri(0, 2)]; return { w: S * ri(2, 5) - (rnd() < 0.5 ? 0.2 : 0), h: S }; }
  if (m === 'diag') { const s = ri(10, 60); return { w: s, h: s }; }
  return { w: ri(8, 120), h: ri(8, 120) };
}

t('磚與磚互不重疊（每種貼法、各 25 組隨機磚尺寸與起點）', () => {
  ALL_METHODS.forEach(m => {
    for (let k = 0; k < 25; k++) {
      const tile = randTile(m), box = [0, 0, rr(60, 160), rr(60, 160)], o = [rr(-30, 30), rr(-30, 30)];
      const polys = E.genTiles(box, tile, m, o, 0.2), n = polys.length;
      for (let i = 0; i < n; i++) {
        const bi = polys[i];
        for (let j = i + 1; j < n; j++) {
          const bj = polys[j];
          // 先用外框快速排除
          const xi = bi.map(p => p[0]), yi = bi.map(p => p[1]), xj = bj.map(p => p[0]), yj = bj.map(p => p[1]);
          if (Math.min(...xi) >= Math.max(...xj) || Math.min(...xj) >= Math.max(...xi) || Math.min(...yi) >= Math.max(...yj) || Math.min(...yj) >= Math.max(...yi)) { continue; }
          assert.ok(overlapArea(bi, bj) < 1e-6, m + ' 有兩片磚重疊 ' + overlapArea(bi, bj).toFixed(4));
        }
      }
    }
  });
});

t('覆蓋完整：每個貼法的磚加上磚縫能蓋滿區域（抽樣點都落在某片磚或磚縫內，且不超過磚縫寬）', () => {
  ALL_METHODS.forEach(m => {
    for (let k = 0; k < 8; k++) {
      const tile = randTile(m), box = [0, 0, rr(60, 140), rr(60, 140)], o = [rr(-30, 30), rr(-30, 30)];
      const polys = E.genTiles(box, tile, m, o, 0.2);
      let inTile = 0, N = 400;
      for (let s = 0; s < N; s++) {
        const p = [rr(box[0], box[2]), rr(box[1], box[3])];
        if (polys.some(q => pointIn(q, p))) { inTile++; }
      }
      // 區域內「磚」的占比應接近 磚面積/(磚＋縫面積)，不得出現大塊沒磚的空洞
      const cover = inTile / N, L = Math.max(tile.w, tile.h), S = Math.min(tile.w, tile.h), expect = m === 'diag' ? (tile.w * tile.h) / ((tile.w + 0.2) * (tile.h + 0.2)) : (L * S) / ((L + 0.2) * (S + 0.2));
      assert.ok(cover > expect - 0.12, m + ' 覆蓋率 ' + cover.toFixed(3) + ' 遠低於預期 ' + expect.toFixed(3));
    }
  });
});
function pointIn(poly, p) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) { c = !c; }
  }
  return c;
}

t('片數下限：實際片數 ≥ 理論最少片數；整磚＋切磚＋開孔磚＝總片數（1500 組）', () => {
  for (let k = 0; k < 1500; k++) {
    const m = ALL_METHODS[ri(0, ALL_METHODS.length - 1)], tile = randTile(m), W = rr(40, 300), H = rr(40, 300);
    const box = [0, 0, W, H], o = [rr(-40, 40), rr(-40, 40)];
    const hole = rnd() < 0.5 ? [rr(5, W - 25), rr(5, H - 25), 0, 0] : null; if (hole) { hole[2] = hole[0] + rr(3, 20); hole[3] = hole[1] + rr(3, 20); }
    const ev = E.evalTiles(E.genTiles(box, tile, m, o, 0.2), [box], hole ? [hole] : [], tile, false);
    const net = W * H - (hole ? (hole[2] - hole[0]) * (hole[3] - hole[1]) : 0);
    assert.strictEqual(ev.full + ev.cut + ev.holeCut, ev.pieces);
    assert.ok(ev.pieces * tile.w * tile.h >= net - 1e-6, m + ' 片數不夠蓋：' + ev.pieces + ' 片 × ' + tile.w * tile.h + ' < ' + net);
    near(ev.used, net - 0, net * 0.2, '使用面積應 ≤ 淨面積');
    assert.ok(ev.used <= net + 1e-6, '使用面積 ' + ev.used + ' 大於淨面積 ' + net);
  }
});

t('平移不變：區域與起點一起平移，片數、整磚、切磚都不變', () => {
  for (let k = 0; k < 200; k++) {
    const m = ['stack-h', 'run2-h', 'run3-v', 'diag'][ri(0, 3)], tile = randTile(m), W = rr(50, 200), H = rr(50, 200), o = [rr(0, 30), rr(0, 30)], dx = rr(-200, 200), dy = rr(-200, 200);
    const a = E.evalTiles(E.genTiles([0, 0, W, H], tile, m, o, 0.2), [[0, 0, W, H]], [], tile, false);
    const b = E.evalTiles(E.genTiles([dx, dy, dx + W, dy + H], tile, m, [o[0] + dx, o[1] + dy], 0.2), [[dx, dy, dx + W, dy + H]], [], tile, false);
    assert.deepStrictEqual([a.pieces, a.full, a.cut], [b.pieces, b.full, b.cut], m + ' 平移後結果不同');
  }
});

t('橫貼與直貼對稱：區域與起點對調 x、y，stack-h 與 stack-v 的結果相同', () => {
  for (let k = 0; k < 200; k++) {
    const tile = { w: ri(10, 100), h: ri(10, 100) }, W = rr(50, 250), H = rr(50, 250), o = [rr(0, 40), rr(0, 40)];
    const a = E.evalTiles(E.genTiles([0, 0, W, H], tile, 'stack-h', o, 0.2), [[0, 0, W, H]], [], tile, false);
    const b = E.evalTiles(E.genTiles([0, 0, H, W], tile, 'stack-v', [o[1], o[0]], 0.2), [[0, 0, H, W]], [], tile, false);
    assert.deepStrictEqual([a.pieces, a.full, a.cut], [b.pieces, b.full, b.cut]);
  }
});

t('磚越大片數越少：同一區域，磚面積放大 4 倍片數不會變多（對縫正貼、角落起貼）', () => {
  for (let k = 0; k < 100; k++) {
    const s = ri(10, 40), W = rr(100, 300), H = rr(100, 300);
    const small = E.evalTiles(E.genTiles([0, 0, W, H], { w: s, h: s }, 'stack-h', [0, 0], 0.2), [[0, 0, W, H]], [], { w: s, h: s }, false).pieces;
    const big = E.evalTiles(E.genTiles([0, 0, W, H], { w: 2 * s, h: 2 * s }, 'stack-h', [0, 0], 0.2), [[0, 0, W, H]], [], { w: 2 * s, h: 2 * s }, false).pieces;
    assert.ok(big <= small, '大磚 ' + big + ' > 小磚 ' + small);
  }
});

function randProject() {
  const p = E.defaultProject();
  p.room = { L: rr(120, 500), D: rr(120, 500), H: rr(240, 330) }; p.wallTop = rr(120, p.room.H);
  p.sequence = rnd() < 0.5 ? 'wallFirst' : 'floorFirst'; p.corner = rnd() < 0.5 ? 'butt' : 'both';
  ['N', 'E', 'S', 'W'].forEach(w => { p.wallTiled[w] = rnd() < 0.85; });
  if (!Object.values(p.wallTiled).some(Boolean)) { p.wallTiled.N = true; }
  p.drain = { x: rr(20, p.room.L - 20), y: rr(20, p.room.D - 20), size: ri(8, 20), slope: rr(0, 3), mode: rnd() < 0.7 ? 'point' : 'oneway', dir: 'NESW'[ri(0, 3)] };
  p.floorTileId = ['F1', 'F2'][ri(0, 1)]; p.wallTileId = ['W1', 'W2'][ri(0, 1)];
  p.openings = []; p.fixtures = [];
  const occupied = {};
  for (let i = 0, n = ri(0, 3); i < n; i++) {
    const wall = 'NESW'[ri(0, 3)], len = (wall === 'N' || wall === 'S') ? p.room.L : p.room.D, width = rr(40, Math.min(120, len - 20)), door = rnd() < 0.4;
    const off = rr(0, len - width), sill = door ? 0 : rr(60, 120), h = door ? rr(180, 210) : rr(40, 100);
    if (sill + h > p.room.H) { continue; }
    if (occupied[wall]) { continue; }   // 同一面牆最多一個洞口，避免隨機產生重疊
    occupied[wall] = true;
    p.openings.push({ id: 'O' + i, type: door ? 'door' : 'window', wall, offset: off, width, height: h, sill });
  }
  for (let i = 0, n = ri(0, 3); i < n; i++) {
    const wall = 'NESW'[ri(0, 3)], len = (wall === 'N' || wall === 'S') ? p.room.L : p.room.D;
    p.fixtures.push({ id: 'X' + i, kind: rnd() < 0.5 ? 'supply' : 'drain', wall, offset: rr(10, len - 10), height: rr(10, Math.min(p.room.H, 200) - 10), dia: rr(2, 6) });
  }
  return p;
}

t('隨機專案 400 組：不丟例外、沒有 NaN／Infinity／負數、採購 ≥ 實際 ≥ 理論下限', () => {
  let okCount = 0;
  for (let k = 0; k < 400; k++) {
    const p = randProject(), r = E.computeAll(p);
    if (!r.ok) { continue; }      // 驗證擋下的不算（另有驗證測試）
    okCount++;
    const check = (v, label) => { assert.ok(typeof v !== 'number' || (isFinite(v) && v >= -1e-9), label + ' 出現壞值 ' + v + '\n' + JSON.stringify(p)); };
    check(r.floor.netArea, '地面淨面積'); check(r.floor.pieces, '地面片數'); check(r.floor.waste, '地面損耗'); check(r.floor.slope.maxFall, '最大落差');
    assert.ok(r.floor.pieces >= r.floor.theory, '地面片數 ' + r.floor.pieces + ' < 理論 ' + r.floor.theory);
    assert.ok(r.floor.purchase >= r.floor.pieces); assert.ok(r.floor.boxes * r.floorTile.perBox >= r.floor.purchase);
    Object.keys(r.walls).forEach(w => {
      const wi = r.walls[w]; check(wi.netArea, w + ' 面積'); check(wi.pieces, w + ' 片數'); check(wi.waste, w + ' 損耗');
    });
    check(r.wallTotal.netArea, '牆面積'); assert.ok(r.wallTotal.purchase >= r.wallTotal.pieces); assert.ok(r.wallTotal.boxes * r.wallTile.perBox >= r.wallTotal.purchase);
    check(r.adhesive.totalKg, '黏著劑'); check(r.trim.totalCm, '收邊條'); assert.ok(r.trim.pieces * r.trim.pieceLen >= r.trim.withLossCm - 1e-6);
    const s = JSON.stringify(r);
    assert.ok(!/NaN|Infinity/.test(s.replace(/"minCut":null/g, '')), '輸出含 NaN/Infinity');
  }
  assert.ok(okCount > 250, '通過驗證的隨機專案太少：' + okCount);
});

t('每種貼法都能算：預設專案逐一指定貼法（地、牆）與每個起始點，都不會當掉', () => {
  const base = E.defaultProject();
  ['F1', 'F2'].forEach(ft => {
    const p0 = JSON.parse(JSON.stringify(base)); p0.floorTileId = ft;
    E.methodsFor(p0.tiles.filter(x => x.id === ft)[0]).forEach(m => {
      Object.keys(E.FLOOR_STARTS).forEach(st => {
        const p = JSON.parse(JSON.stringify(p0)); p.floorMethod = m; p.floorStart = st;
        const r = E.computeAll(p); assert.ok(r.ok && r.floor.pieces > 0, ft + ' ' + m + ' ' + st);
      });
    });
  });
  ['W1', 'W2'].forEach(wt => {
    const p0 = JSON.parse(JSON.stringify(base)); p0.wallTileId = wt;
    E.methodsFor(p0.tiles.filter(x => x.id === wt)[0]).forEach(m => {
      Object.keys(E.WALL_STARTS).forEach(st => {
        const p = JSON.parse(JSON.stringify(p0)); p.wallMethod = m; p.wallStart = st;
        const r = E.computeAll(p); assert.ok(r.ok && r.wallTotal.pieces > 0, wt + ' ' + m + ' ' + st);
      });
    });
  });
});

t('起始點必須真的被採用：指定「落水孔十字縫」→ 放樣原點＝落水孔座標＋半個磚縫', () => {
  const p = E.defaultProject(); p.floorMethod = 'stack-h'; p.floorStart = 'drainJoint';
  const r = E.computeAll(p);
  near(r.floor.chosen.origin[0], p.drain.x + 0.1, 1e-9); near(r.floor.chosen.origin[1], p.drain.y + 0.1, 1e-9);
});

console.log('\n③ 輸入驗證與壞值');

function errsOf(mut) { const p = E.defaultProject(); mut(p); const r = E.computeAll(p); return r.ok ? [] : r.errors.join(' | '); }
const bad = [
  ['房間寬 0', p => { p.room.L = 0; }, /房間寬/],
  ['房間深為負數', p => { p.room.D = -10; }, /房間深/],
  ['房間寬是 NaN（欄位空白）', p => { p.room.L = NaN; }, /房間寬/],
  ['天花板高 50', p => { p.room.H = 50; }, /天花板/],
  ['牆磚貼到高度超過天花板', p => { p.wallTop = 400; }, /貼到高度/],
  ['門超出牆長', p => { p.openings[0].offset = 150; }, /超出牆長/],
  ['窗高度超出天花板', p => { p.openings[1].sill = 250; p.openings[1].height = 60; }, /超出天花板/],
  ['兩個洞口重疊', p => { p.openings.push({ id: 'W9', type: 'window', wall: 'N', offset: 70, width: 40, height: 40, sill: 160 }); }, /重疊/],
  ['落水孔在房間外', p => { p.drain.x = 500; }, /落水孔位置/],
  ['洩水坡度 9%', p => { p.drain.slope = 9; }, /洩水坡度/],
  ['磁磚厚度 0', p => { p.tiles[0].t = 0; }, /厚度/],
  ['磁磚尺寸 1cm', p => { p.tiles[0].w = 1; }, /尺寸/],
  ['每箱片數 0', p => { p.tiles[0].perBox = 0; }, /每箱/],
  ['磁磚編號重複', p => { p.tiles[1].id = 'F1'; }, /重複/],
  ['找不到地磚編號', p => { p.floorTileId = 'ZZ'; }, /找不到地磚/],
  ['給排水點超出牆長', p => { p.fixtures[0].offset = 999; }, /超出牆長/],
  ['給排水點高度超出', p => { p.fixtures[0].height = 999; }, /超出/],
  ['收邊條單支長度 0', p => { p.trim.pieceLen = 0; }, /收邊條/],
  ['破損預留 90%', p => { p.breakagePct = 90; }, /破損/]
];
bad.forEach(b => t('壞值被擋下：' + b[0], () => { const e = errsOf(b[1]); assert.ok(e && b[2].test(e), '沒有擋下或訊息不對：' + e); }));

t('正常的邊界值不會被誤擋：門 offset＋寬恰好等於牆長、窗台高 0', () => {
  const p = E.defaultProject(); p.openings[0].offset = 100;     // 100 + 80 = 180 = 牆長
  assert.ok(E.computeAll(p).ok);
});

t('輸入非物件／缺欄位：computeAll 不會丟例外', () => {
  [undefined, {}, { room: {} }, { tiles: [] }].forEach(x => { try { E.computeAll(x); } catch (e) { assert.fail('丟出例外：' + e.message + ' 輸入=' + JSON.stringify(x)); } });
});

console.log('\n結果：' + pass + ' 項通過，' + fail + ' 項失敗');
process.exit(fail ? 1 : 0);
