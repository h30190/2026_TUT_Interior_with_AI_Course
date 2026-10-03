/* 自我檢查：跑法 node scripts/測試.js
   在暫存目錄建假的上游與假的 fork（本機 bare repo），實際觸發每一條防呆，確認它真的擋得住。
   自報成功不算通過——每條阻擋都要有一個會踩到它的情境。
   2026-10-03 起上游改成真的 bare repo：檢查器現在會比對「上游沒有的 commit」，
   上游不存在的話它會（正確地）全部擋下，測試就驗不到其他條了。 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const 檢 = require('./檢查.js');

let 失敗 = 0;
function 驗(名稱, 條件, 說明) {
  if (!條件) 失敗++;
  console.log('  ' + (條件 ? '通過' : '失敗') + '｜' + 名稱 + (說明 && !條件 ? '　' + 說明 : ''));
}
function 有阻擋(r, 關鍵字) {
  return r.阻擋.some(function (s) { return s.indexOf(關鍵字) !== -1; });
}

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'course-submit-test-'));
const 我 = 'A14530068_黃建升', 別人 = 'A15530027_黃麟珍';

/* 每個情境一組全新的假倉庫，互不污染 */
let 序 = 0;
function 新環境(選項) {
  選項 = 選項 || {};
  const 底 = path.join(根, String(++序));
  const 上游 = path.join(底, 'up.git'), 叉 = path.join(底, 'fork.git'), 工 = path.join(底, 'work');
  fs.mkdirSync(底, { recursive: true });
  const g = function (cwd, a) { return execFileSync('git', a, { cwd: cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); };
  g(底, ['init', '--quiet', '--bare', '-b', 'main', 上游]);
  g(底, ['init', '--quiet', '--bare', '-b', 'main', 叉]);
  g(底, ['clone', '--quiet', 上游, 工]);
  g(工, ['config', 'user.email', 'test@example.invalid']);
  g(工, ['config', 'user.name', 'test']);
  g(工, ['config', 'core.autocrlf', 'false']);
  const 寫入 = function (相對, 內容) {
    const p = path.join(工, 相對);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 內容 === undefined ? 'x' : 內容);
  };
  寫入('README.md', '課程主 repo');
  (選項.我的日期 || ['20260919', '20261003']).forEach(function (d) { 寫入(d + '/students/' + 我 + '/README.md', '我'); });
  ['20260919', '20261003'].forEach(function (d) { 寫入(d + '/students/' + 別人 + '/README.md', '別人'); });
  g(工, ['add', '-A']);
  g(工, ['commit', '--quiet', '-m', 'init']);
  g(工, ['push', '--quiet', 'origin', 'HEAD:main']);
  g(工, ['remote', 'add', 'fork', 選項.fork網址 || 叉]);
  if (!選項.留在main) g(工, ['checkout', '--quiet', '-b', 'student/A14530068-測試']);
  const 設定 = {
    repo: 工, 學號姓名: 我, 上游remote: 'origin', 我的fork: 'fork',
    上游網址: 'https://example.invalid/上游/course', fork網址: 'https://example.invalid/我/course',
    主分支: 'main', 分支前綴: 'student/A14530068',
    上課日期資料夾: ['20260919', '20261003', '20261017'],
    大檔案副檔名: ['.skp', '.rvt', '.mp4'],
    單檔上限MB: 1, 總量上限MB: 3
  };
  return { 工: 工, 上游: 上游, 叉: 叉, 設定: 設定, g: function (a) { return g(工, a); }, 寫: 寫入,
           檢: function () { return 檢.檢查(設定); } };
}
const 我的 = function (d, 名) { return d + '/students/' + 我 + '/' + 名; };

console.log('情境 1：還在 main 分支上');
let E = 新環境({ 留在main: true });
E.寫(我的('20260919', 'a.md'));
驗('擋住在 main 上交件', 有阻擋(E.檢(), '先開分支'));

console.log('情境 2：只動自己的資料夾（應該放行）');
E = 新環境();
E.寫(我的('20260919', 'a.md'), '我的作業');
let r = E.檢();
驗('沒有阻擋', r.阻擋.length === 0, r.阻擋.join('｜'));
驗('抓到 1 個變更檔', r.變更.length === 1, r.變更.map(c => c.路徑).join('、'));
驗('中文路徑沒被跳脫', r.變更.length > 0 && r.變更[0].路徑.indexOf('黃建升') !== -1);

console.log('情境 3：動到別人的資料夾、主 repo 共用檔');
E = 新環境();
E.寫('20260919/students/' + 別人 + '/b.md', '別人的東西');
驗('擋住越界新增', 有阻擋(E.檢(), '不在你的資料夾底下'));
E = 新環境();
E.寫('README.md', '偷改主 repo');
驗('擋住改共用檔', 有阻擋(E.檢(), '不在你的資料夾底下'));

console.log('情境 4（交叉稽核 #14）：用改名或先 commit 繞過資料夾限制');
E = 新環境();
E.g(['mv', '20260919/students/' + 別人 + '/README.md', 我的('20260919', 'stolen.md')]);
r = E.檢();
驗('git mv 別人的檔案進來（未 commit）：擋下', 有阻擋(r, '改名／搬走的原位置'), r.阻擋.join('｜'));
E.g(['commit', '--quiet', '-m', 'steal']);
r = E.檢();
驗('git mv 之後先 commit：仍擋下', 有阻擋(r, '已 commit'), r.阻擋.join('｜'));
E = 新環境();
E.寫('20260919/students/' + 別人 + '/README.md', '偷改');
E.g(['commit', '--quiet', '-am', 'sneaky']);
r = E.檢();
驗('先 commit 別人的檔案、工作區乾淨：擋下', 有阻擋(r, '不在你的資料夾底下'), r.阻擋.join('｜') + '｜' + r.提醒.join('｜'));
E = 新環境();
E.寫(我的('20260919', 'ok.md'));
E.g(['add', '-A']); E.g(['commit', '--quiet', '-m', 'mine']);
r = E.檢();
驗('對照組：已 commit 的只有自己的檔案：放行', r.阻擋.length === 0, r.阻擋.join('｜'));

console.log('情境 5（交叉稽核 #16）：大檔案');
E = 新環境();
['模型.skp', 'model.RVT', 'model.rvt.zip', 'model.rvt.bak', 'scene.skp.txt', 'house.rvt.7z'].forEach(function (n) {
  E.寫(我的('20260919', n), 'fake');
});
r = E.檢();
['模型.skp', 'model.RVT', 'model.rvt.zip', 'model.rvt.bak', 'scene.skp.txt', 'house.rvt.7z'].forEach(function (n) {
  驗('擋住 ' + n, r.阻擋.some(function (s) { return s.indexOf('大檔案') !== -1 && s.indexOf(n) !== -1; }));
});
E = 新環境();
E.寫(我的('20260919', 'big.txt'), 'x'.repeat(1.2 * 1024 * 1024));
驗('擋住單檔超過上限', 有阻擋(E.檢(), '超過 1 MB'));
E = 新環境();
E.寫(我的('20260919', 'exact.bin'), Buffer.alloc(1024 * 1024));
驗('恰好等於單檔上限：放行', !有阻擋(E.檢(), '超過 1 MB'));
E = 新環境();
for (let i = 0; i < 4; i++) E.寫(我的('20260919', 'p' + i + '.bin'), Buffer.alloc(900 * 1024));
r = E.檢();
驗('每個都沒超過單檔上限、合計超過總量：擋下', 有阻擋(r, '總量上限') && !有阻擋(r, '超過 1 MB'), r.阻擋.join('｜'));

console.log('情境 6（交叉稽核 #15）：機密檔');
const 該擋 = ['.env', 'x.ENV', '.env.local', 'id_rsa', 'id_ed25519.pub', 'deploy.pfx', 'cert.p12', 'server.pem', 'my.key',
             'token.txt', '.npmrc', 'api_key.json', 'secret.txt', 'password.txt', 'credentials.json', 'secrets.json'];
const 不該擋 = ['a.keynote', 'my.environment.md', 'design-tokens.md', 'keyboard.md', 'README.md', '報告.md'];
該擋.forEach(function (n) { 驗('擋住 ' + n, 檢.是機密檔(我的('20260919', n))); });
不該擋.forEach(function (n) { 驗('不誤擋 ' + n, !檢.是機密檔(我的('20260919', n))); });
E = 新環境();
E.寫(我的('20260919', 'id_rsa'), 'KEY');
驗('整合：工作區有 id_rsa 會被檢查擋下', 有阻擋(E.檢(), '疑似機密檔'));

console.log('情境 7：remote 設定');
E = 新環境();
E.g(['remote', 'remove', 'fork']);
驗('擋住沒有 fork remote', 有阻擋(E.檢(), 'remote「fork」不存在'));
E = 新環境();
E.g(['remote', 'set-url', 'fork', E.上游]);
驗('擋住 fork 等於上游', 有阻擋(E.檢(), '同一個倉庫'));
E = 新環境();
E.g(['remote', 'set-url', 'fork', E.上游.replace(/\\/g, '/') + '/']);
驗('擋住 fork 與上游只差結尾斜線（交叉稽核 #18）', 有阻擋(E.檢(), '同一個倉庫'));
[['https://github.com/a/b', 'https://github.com/a/b.git'], ['https://github.com/a/b', 'git@github.com:a/b.git'],
 ['https://github.com/A/B/', 'ssh://git@github.com/a/b']].forEach(function (p) {
  驗('網址正規化：' + p[0] + ' ＝ ' + p[1], 檢.正規化網址(p[0]) === 檢.正規化網址(p[1]));
});
驗('網址正規化：不同倉庫仍不同', 檢.正規化網址('https://github.com/a/b') !== 檢.正規化網址('https://github.com/a/c'));

console.log('情境 8（交叉稽核 #18）：detached HEAD');
E = 新環境();
E.g(['checkout', '--quiet', '--detach']);
E.寫(我的('20260919', 'a.md'));
驗('擋住 detached HEAD', 有阻擋(E.檢(), 'detached HEAD'));

console.log('情境 9：找不到上游基準時寧可擋');
E = 新環境();
E.g(['remote', 'set-url', 'origin', path.join(根, 'no-such-upstream')]);
E.g(['update-ref', '-d', 'refs/remotes/origin/main']);
E.寫(我的('20260919', 'a.md'));
驗('比不出已 commit 的內容：擋下', 有阻擋(E.檢(), '無法確認已 commit 的內容'));

/* ── 交件.js 整段流程：複製腳本到暫存，設定指向假倉庫 ── */
function 交件環境(選項) {
  const E = 新環境(選項);
  const cs = path.join(path.dirname(E.工), 'cs');
  fs.mkdirSync(path.join(cs, 'scripts'), { recursive: true });
  ['檢查.js', '交件.js'].forEach(function (f) { fs.copyFileSync(path.join(__dirname, f), path.join(cs, 'scripts', f)); });
  fs.writeFileSync(path.join(cs, '設定.json'), JSON.stringify(E.設定));
  E.交件 = function (訊息) {
    return spawnSync(process.execPath, [path.join(cs, 'scripts', '交件.js'), 訊息], { encoding: 'utf8', windowsHide: true });
  };
  return E;
}

console.log('情境 10（交叉稽核 #17）：只有部分日期有我的資料夾');
E = 交件環境({ 我的日期: ['20260919'] });
E.寫(我的('20260919', 'a.md'));
r = E.交件('20260919 測試交件');
驗('交件成功（不存在的日期資料夾不拖垮 git add）', r.status === 0, (r.stdout + r.stderr).split('\n').slice(-6).join(' / '));
驗('fork 上真的收到', E.g(['ls-remote', 'fork']).indexOf('student/A14530068-測試') !== -1);

console.log('情境 11（交叉稽核 #18）：commit 訊息只有空白');
E = 交件環境();
E.寫(我的('20260919', 'a.md'));
r = E.交件('   ');
驗('拒絕並結束', r.status !== 0);
驗('沒有殘留暫存', E.g(['diff', '--cached', '--name-only']).trim() === '', E.g(['diff', '--cached', '--name-only']));

fs.rmSync(根, { recursive: true, force: true });
console.log('');
console.log(失敗 ? '共 ' + 失敗 + ' 項失敗' : '全部通過');
process.exit(失敗 ? 1 : 0);
