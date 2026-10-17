/* 自我檢查：跑法 node scripts/測試.js
   用假逐字稿驗解析器，確認它抓得到該抓的、不抓不該抓的。
   最重要的一條：skill 名字出現在對話文字裡（例如路由表被注入）不可以被算成一次呼叫——
   2026-09-19 建這支工具時實測過，天真的字串比對會把 interior-boq-quote 算成 216 次。 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const 蒐集 = require('./蒐集.js');

let 失敗 = 0;
function 驗(名稱, 實得, 預期) {
  const 過 = JSON.stringify(實得) === JSON.stringify(預期);
  if (!過) 失敗++;
  console.log('  ' + (過 ? '通過' : '失敗') + '｜' + 名稱 +
              (過 ? '' : '　預期 ' + JSON.stringify(預期) + '，實得 ' + JSON.stringify(實得)));
}

const 暫存 = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-audit-test-'));
const 假稿 = path.join(暫存, 'fake.jsonl');

const 行 = [
  /* 真的呼叫，要算 */
  JSON.stringify({
    type: 'assistant', sessionId: 's1', timestamp: '2026-09-01T10:00:00.000Z',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'interior-ledger', args: '記一筆' } }
    ] }
  }),
  /* 同一個 skill 第二次，不同 session */
  JSON.stringify({
    type: 'assistant', sessionId: 's2', timestamp: '2026-09-05T10:00:00.000Z',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'b', name: 'Skill', input: { skill: 'interior-ledger', args: '' } }
    ] }
  }),
  /* 陷阱一：skill 名出現在使用者訊息文字裡（路由表注入），不可算 */
  JSON.stringify({
    type: 'user', sessionId: 's1', timestamp: '2026-09-02T10:00:00.000Z',
    message: { role: 'user', content: [
      { type: 'text', text: '報價 → interior-boq-quote skill；記帳 → interior-ledger skill' }
    ] }
  }),
  /* 陷阱二：別的工具，名字裡有 skill 字樣，不可算 */
  JSON.stringify({
    type: 'assistant', sessionId: 's1', timestamp: '2026-09-03T10:00:00.000Z',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'c', name: 'ListSkills', input: {} }
    ] }
  }),
  /* 陷阱三：壞掉的 JSON，要被算進壞行而不是讓整支掛掉 */
  '{"type":"assistant","message":{"content":[{"name":"Skill"',
  /* 另一個 skill，只有一次 */
  JSON.stringify({
    type: 'assistant', sessionId: 's3', timestamp: '2026-08-20T10:00:00.000Z',
    message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'd', name: 'Skill', input: { skill: 'thesis-workbench', args: '' } }
    ] }
  })
];
fs.writeFileSync(假稿, 行.join('\n') + '\n', 'utf8');

(async function () {
  const r = await 蒐集.掃逐字稿(暫存);

  驗('interior-ledger 算到 2 次', r.統計['interior-ledger'] && r.統計['interior-ledger'].次數, 2);
  驗('interior-ledger 橫跨 2 個 session', r.統計['interior-ledger'].sessions.size, 2);
  驗('interior-ledger 最近一次', r.統計['interior-ledger'].最近, '2026-09-05T10:00:00.000Z');
  驗('thesis-workbench 算到 1 次', r.統計['thesis-workbench'].次數, 1);
  驗('路由表注入不算呼叫', r.統計['interior-boq-quote'], undefined);
  驗('ListSkills 不算呼叫', Object.keys(r.統計).sort(), ['interior-ledger', 'thesis-workbench']);
  驗('壞行被記錄而非中斷', r.壞行, 1);
  驗('最早時間', r.最早, '2026-08-20T10:00:00.000Z');

  /* ── 2026-10-03 王品洋交叉稽核 #19～#21 ── */
  const 呼叫 = function (skill, id, sid) {
    return JSON.stringify({ type: 'assistant', sessionId: sid || 's1', timestamp: '2026-10-01T10:00:00.000Z',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: id, name: 'Skill', input: { skill: skill } }] } });
  };
  const 夾 = function (名) { const d = path.join(暫存, 名); fs.mkdirSync(d, { recursive: true }); return d; };

  const j = 夾('j');
  fs.writeFileSync(path.join(j, 'x.jsonl'),
    ['constructor', 'toString', '__proto__', 'hasOwnProperty'].map(function (n, i) { return 呼叫(n, 'j' + i); }).join('\n') + '\n');
  let rj = null, 錯 = null;
  try { rj = await 蒐集.掃逐字稿(j); } catch (e) { 錯 = e.message; }
  驗('#19 skill 名稱是 constructor／toString／__proto__ 不崩潰', 錯, null);
  驗('#19 而且照常算到', rj && ['constructor', 'toString', '__proto__', 'hasOwnProperty'].map(function (n) {
    return rj.統計[n] && rj.統計[n].次數; }), [1, 1, 1, 1]);

  const a = 夾('a');
  fs.writeFileSync(path.join(a, 'one.jsonl'), 呼叫('interior-ledger', 'toolu_X') + '\n');
  fs.writeFileSync(path.join(a, 'two.jsonl'), 呼叫('interior-ledger', 'toolu_X') + '\n' + 呼叫('interior-ledger', 'toolu_Y') + '\n');
  const ra = await 蒐集.掃逐字稿(a);
  驗('#21 同一個 tool_use id 出現在兩個檔只算一次', ra.統計['interior-ledger'].次數, 2);
  驗('#21 重複筆數有記下來', ra.重複, 1);

  驗('#20 多行 description（>-）讀到內容',
      蒐集.讀描述文字('name: x\ndescription: >-\n  整理業主交屋手冊\n  與保固通知\nother: 1'), '整理業主交屋手冊 與保固通知');
  驗('#20 多行 description（|）讀到內容', 蒐集.讀描述文字('description: |\n  第一行\n  第二行'), '第一行 第二行');
  驗('#20 引號單行照舊', 蒐集.讀描述文字('description: "交屋時才會用到"'), '交屋時才會用到');
  驗('#20 一般單行照舊', 蒐集.讀描述文字('name: a\ndescription: 記帳用\nx: 1'), '記帳用');

  const 路由 = '記帳 → interior-ledger skill\n論文 → thesis-workbench\n';
  驗('#20 ledger 不被 interior-ledger 誤判成有指名', 蒐集.有指名(路由, 'ledger'), false);
  驗('#20 interior 不被 interior-ledger 誤判成有指名', 蒐集.有指名(路由, 'interior'), false);
  驗('#20 完整名稱照常判定有指名', [蒐集.有指名(路由, 'interior-ledger'), 蒐集.有指名(路由, 'thesis-workbench')], [true, true]);

  const sk = 夾('skills');
  const 建 = function (名, 描述) {
    fs.mkdirSync(path.join(sk, 名), { recursive: true });
    if (描述 !== null) fs.writeFileSync(path.join(sk, 名, 'SKILL.md'), '---\nname: ' + 名 + '\n' + 描述 + '\n---\n');
  };
  建('handover-booklet', 'description: >-\n  整理業主交屋手冊與保固通知');
  建('_archive', null);
  建('node_modules', null);
  let 有連結 = false;
  try {
    const 目標 = 夾('gone-target');
    fs.symlinkSync(目標, path.join(sk, 'broken-link'), 'junction');
    fs.rmSync(目標, { recursive: true, force: true });
    有連結 = true;
  } catch (e) { /* 沒有建連結的權限就跳過這一條 */ }
  const 清單 = 蒐集.盤點(sk, 'Claude');
  const 找 = function (n) { return 清單.find(function (i) { return i.名稱 === n; }); };
  驗('#20 多行 description 的 skill 盤點時讀到交屋字樣', /交屋/.test((找('handover-booklet') || {}).描述 || ''), true);
  驗('#20 沒有 SKILL.md 的資料夾標記為非 skill', [(找('_archive') || {}).有SKILL檔, (找('node_modules') || {}).有SKILL檔], [false, false]);
  if (有連結) 驗('#20 壞掉的連結沒有靜默消失，標記為壞連結', (找('broken-link') || {}).壞連結, true);
  else console.log('  略過｜#20 壞連結（這台機器建不了 junction）');

  const 龍蝦 = 蒐集.讀龍蝦用量();
  console.log('  ' + (龍蝦.錯誤 ? '注意' : '通過') + '｜龍蝦資料庫　' +
              (龍蝦.錯誤 || 龍蝦.筆數 + ' 筆'));

  fs.rmSync(暫存, { recursive: true, force: true });
  console.log('');
  console.log(失敗 ? '共 ' + 失敗 + ' 項失敗' : '全部通過');
  process.exit(失敗 ? 1 : 0);
})();
