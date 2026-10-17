/* 交件前防呆檢查。零 AI，全部是可機器判斷的條件。
   跑法：node scripts/檢查.js
   阻擋項存在就 exit 1。交件.js 會先跑這支，沒過不准 commit。

   2026-10-03 王品洋交叉稽核後的原則：**檢查的是「即將推出去的東西」，不是工作區的表面。**
   原本只看 git status（未提交的變更），所以先手動 commit、或用 git mv 改名，
   「只准動自己的資料夾」這條最核心的承諾就被繞過了（#14）。
   現在檢查範圍＝未提交的變更 ∪ 上游沒有、但這條分支有的所有 commit，改名的新舊兩個路徑都算。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function 讀設定() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '設定.json'), 'utf8'));
}

function git(設定, 參數, 可失敗) {
  try {
    return execFileSync('git', 參數, {
      cwd: 設定.repo, encoding: 'utf8', windowsHide: true,
      /* 允許失敗的指令（fetch、rev-list）把 stderr 吞掉，
         否則沒設好上游時畫面會噴一堆 fatal，看起來像工具壞了 */
      stdio: 可失敗 ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    if (可失敗) return null;
    throw new Error('git ' + 參數.join(' ') + ' 失敗：' + (e.stderr || e.message).toString().trim());
  }
}

/* git status --porcelain -z：用 NUL 分隔，避免中文路徑被跳脫成 \351\273
   改名／複製（R／C）在 -z 格式下是「新路徑\0舊路徑\0」。
   舊路徑原本被 i++ 直接跳過——可是改名等於「從舊位置刪掉」，舊路徑在別人資料夾就是越界（#14）。 */
function 變更清單(設定) {
  const 原始 = execFileSync('git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: 設定.repo, encoding: 'utf8', windowsHide: true });
  const 片段 = 原始.split('\0').filter(function (s) { return s.length; });
  const out = [];
  for (let i = 0; i < 片段.length; i++) {
    const s = 片段[i];
    const 狀態 = s.slice(0, 2);
    out.push({ 狀態: 狀態, 路徑: s.slice(3), 來源: '未提交' });
    if (狀態[0] === 'R' || 狀態[0] === 'C') {
      i++;
      if (片段[i]) out.push({ 狀態: 狀態[0] === 'R' ? 'R舊' : 'C舊', 路徑: 片段[i], 來源: '未提交' });
    }
  }
  return out;
}

/* 已經 commit、但上游還沒有的變更。三點語法＝從分岔點到 HEAD，只算這條分支自己做的事；
   就算先把上游合併進來，合併進來的別人的檔案也不會被算進去。
   -z 格式：「狀態\0路徑\0」，改名是「R100\0舊\0新\0」。 */
function 已提交變更(設定, 基準) {
  const 原始 = execFileSync('git',
    ['diff', '--name-status', '-z', '-M', 基準 + '...HEAD'],
    { cwd: 設定.repo, encoding: 'utf8', windowsHide: true });
  const 片段 = 原始.split('\0').filter(function (s) { return s.length; });
  const out = [];
  for (let i = 0; i < 片段.length; i++) {
    const 狀態 = 片段[i];
    if (狀態[0] === 'R' || 狀態[0] === 'C') {
      out.push({ 狀態: 狀態[0] + '舊', 路徑: 片段[i + 1], 來源: '已提交' });
      out.push({ 狀態: 狀態[0], 路徑: 片段[i + 2], 來源: '已提交' });
      i += 2;
    } else {
      out.push({ 狀態: 狀態, 路徑: 片段[i + 1], 來源: '已提交' });
      i += 1;
    }
  }
  return out;
}

/* 網址比對前先正規化。原本是字串全等，同一個倉庫只差結尾斜線、.git、大小寫、
   https 與 ssh 寫法就認不出來（#18）。 */
function 正規化網址(u) {
  let s = String(u || '').trim().replace(/\\/g, '/');
  s = s.replace(/^git@([^:]+):/i, '$1/');               /* git@github.com:a/b → github.com/a/b */
  s = s.replace(/^[a-z+]+:\/\/(?:[^@/]+@)?/i, '');      /* 去掉 https:// ssh://git@ file:// */
  s = s.replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return s.toLowerCase();
}

/* 機密檔：比對「檔名」，不是整條路徑包含某字串（#15）。
   原本用 路徑.includes('.key') 之類，id_rsa、.pfx、token.txt 漏抓，a.keynote、my.environment.md 誤抓。 */
const 預設機密規則 = {
  檔名: ['.env', '.npmrc', '.pypirc', '.netrc', '.git-credentials', '.htpasswd',
         'credentials', 'credentials.json', 'secrets.json', 'secrets.yml', 'secrets.yaml'],
  開頭: ['.env.', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'],
  副檔名: ['.env', '.pem', '.key', '.pfx', '.p12', '.keystore', '.jks', '.ppk', '.kdbx'],
  關鍵字: ['secret', 'secrets', 'password', 'passwd', 'token', 'apikey', 'api_key', 'api-key',
           'private_key', 'private-key', 'privatekey']
};
function 是機密檔(路徑, 規則) {
  const r = 規則 || 預設機密規則;
  const 名 = path.posix.basename(路徑.replace(/\\/g, '/')).toLowerCase();
  if ((r.檔名 || []).indexOf(名) !== -1) return true;
  if ((r.開頭 || []).some(function (p) { return 名.indexOf(p) === 0; })) return true;
  if ((r.副檔名 || []).some(function (x) { return 名.endsWith(x); })) return true;
  /* 關鍵字要是完整的詞：用 . _ - 空白切開後整段相等，或「api_key」這種本身帶分隔的整串出現 */
  const 段 = 名.split(/[.\s_-]+/);
  return (r.關鍵字 || []).some(function (k) {
    return /[_-]/.test(k) ? new RegExp('(^|[.\\s_-])' + k.replace(/[-]/g, '\\-') + '([.\\s_-]|$)').test(名)
                          : 段.indexOf(k) !== -1;
  });
}

/* 大檔案：檔名裡任何一段副檔名命中都算（#16）。
   原本只看最後一段，model.rvt.zip、scene.skp.txt 就放行了。 */
function 大檔副檔名(路徑, 清單) {
  const 名 = path.posix.basename(路徑.replace(/\\/g, '/')).toLowerCase();
  const 段 = 名.split('.').slice(1).map(function (x) { return '.' + x; });
  return 段.filter(function (x) { return 清單.indexOf(x) !== -1; });
}

function 檢查(設定) {
  const 阻擋 = [], 提醒 = [];

  if (!fs.existsSync(path.join(設定.repo, '.git'))) {
    return { 阻擋: ['找不到 git repo：' + 設定.repo], 提醒: [], 變更: [], 分支: null };
  }

  /* remote 設定 */
  const remotes = git(設定, ['remote']).split('\n').map(s => s.trim());
  if (!remotes.includes(設定.我的fork)) {
    阻擋.push('remote「' + 設定.我的fork + '」不存在，推不上去。先 git remote add ' +
              設定.我的fork + ' ' + 設定.fork網址 + '.git');
  }
  if (remotes.includes(設定.我的fork) && remotes.includes(設定.上游remote)) {
    const f = git(設定, ['remote', 'get-url', 設定.我的fork]);
    const o = git(設定, ['remote', 'get-url', 設定.上游remote]);
    if (正規化網址(f) === 正規化網址(o)) 阻擋.push('fork 與上游指向同一個網址（正規化後是同一個倉庫：' + f + '），會推到別人的 repo');
  }

  /* 分支 */
  const 分支 = git(設定, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (分支 === 'HEAD') {
    /* #18：原本 detached HEAD 照樣通過，commit 完 push 才失敗，留下一個懸空的 commit */
    阻擋.push('目前不在任何分支上（detached HEAD），commit 了也推不上去。先開分支：git checkout -b ' +
              設定.分支前綴 + '-<主題>');
  } else if (分支 === 設定.主分支) {
    阻擋.push('目前在 ' + 設定.主分支 + ' 上。先開分支：git checkout -b ' +
              設定.分支前綴 + '-<主題>');
  } else if (設定.分支前綴 && 分支.indexOf(設定.分支前綴) !== 0) {
    提醒.push('分支名「' + 分支 + '」不是以 ' + 設定.分支前綴 + ' 開頭，助教可能認不出是誰的');
  }

  /* 先 fetch，已提交變更的比較基準才是新的 */
  git(設定, ['fetch', 設定.上游remote, '--quiet'], true);
  const 基準 = 設定.上游remote + '/' + 設定.主分支;
  const 有基準 = git(設定, ['rev-parse', '--verify', '--quiet', 基準], true);

  /* 變更內容：未提交 ∪ 已提交未進上游 */
  const 未提交 = 變更清單(設定);
  let 已提交 = [];
  if (!有基準) {
    /* 寧可擋也不放行：比不出已提交的內容，就無法保證沒動到別人的資料夾 */
    阻擋.push('找不到 ' + 基準 + '，無法確認已 commit 的內容只動到你的資料夾。先 git fetch ' + 設定.上游remote);
  } else {
    已提交 = 已提交變更(設定, 基準);
  }
  const 變更 = 未提交.slice();
  已提交.forEach(function (c) {
    if (!變更.some(function (x) { return x.路徑 === c.路徑; })) 變更.push(c);
  });

  const 我的資料夾 = 設定.上課日期資料夾.map(function (d) {
    return d + '/students/' + 設定.學號姓名 + '/';
  });

  const 越界 = 變更.filter(function (c) {
    return !我的資料夾.some(function (p) { return c.路徑.indexOf(p) === 0; });
  });
  if (越界.length) {
    阻擋.push('有 ' + 越界.length + ' 個檔案不在你的資料夾底下，會動到別人或主 repo：\n      ' +
              越界.map(function (c) {
                return c.路徑 + (c.狀態.indexOf('舊') !== -1 ? '（改名／搬走的原位置）' : '') +
                       (c.來源 === '已提交' ? '（已 commit）' : '');
              }).join('\n      '));
  }

  /* 大檔案、機密檔、單檔與總量上限 */
  const 上限 = 設定.單檔上限MB * 1024 * 1024;
  const 總上限 = (設定.總量上限MB || 20) * 1024 * 1024;
  let 總量 = 0;
  for (const c of 變更) {
    if (c.狀態.indexOf('舊') !== -1 || c.狀態[0] === 'D') continue;   /* 已不存在的路徑不檢查內容 */
    const 命中 = 大檔副檔名(c.路徑, 設定.大檔案副檔名);
    if (命中.length) {
      阻擋.push('大檔案不進 repo：' + c.路徑 + '（' + 命中.join('、') + '，原檔留本機；改副檔名或壓縮也一樣）');
    }
    if (是機密檔(c.路徑, 設定.機密檔規則)) {
      阻擋.push('疑似機密檔：' + c.路徑);
    }
    const 全路徑 = path.join(設定.repo, c.路徑);
    try {
      const st = fs.statSync(全路徑);
      if (st.isFile()) {
        總量 += st.size;
        if (st.size > 上限) {
          阻擋.push('檔案超過 ' + 設定.單檔上限MB + ' MB：' + c.路徑 +
                    '（' + (st.size / 1048576).toFixed(1) + ' MB）');
        }
      }
    } catch (e) { /* 已刪除的檔案 stat 不到，正常 */ }
  }
  /* #16：原本只有單檔上限，30 個 4.9 MB 的檔案（147 MB）全部放行 */
  if (總量 > 總上限) {
    阻擋.push('這次交件合計 ' + (總量 / 1048576).toFixed(1) + ' MB，超過總量上限 ' +
              (設定.總量上限MB || 20) + ' MB。大檔放雲端，repo 只放連結');
  }

  /* 與上游的落差 */
  const 落後 = git(設定, ['rev-list', '--count', 'HEAD..' + 基準], true);
  if (落後 && +落後 > 0) {
    提醒.push('你的分支落後上游 ' + 落後 + ' 筆。不影響交件，但建議先同步：git pull ' +
              設定.上游remote + ' ' + 設定.主分支);
  }

  if (!未提交.length) {
    const 待推 = git(設定, ['rev-list', '--count',
      設定.我的fork + '/' + 分支 + '..HEAD'], true);
    if (待推 && +待推 > 0) 提醒.push('沒有未提交的變更，但有 ' + 待推 + ' 筆 commit 還沒 push');
    else if (!已提交.length) 提醒.push('沒有任何變更可交');
  }

  return { 阻擋: 阻擋, 提醒: 提醒, 變更: 變更, 未提交: 未提交, 分支: 分支 };
}

if (require.main === module) {
  const 設定 = 讀設定();
  const r = 檢查(設定);
  console.log('交件前檢查：' + 設定.repo);
  console.log('分支：' + r.分支 + '　變更檔案：' + r.變更.length + ' 個');
  console.log('');
  if (r.變更.length) {
    r.變更.forEach(function (c) { console.log('  ' + c.狀態 + ' ' + c.路徑 + (c.來源 === '已提交' ? '　（已 commit）' : '')); });
    console.log('');
  }
  r.提醒.forEach(function (s) { console.log('  提醒｜' + s); });
  r.阻擋.forEach(function (s) { console.log('  阻擋｜' + s); });
  console.log('');
  console.log(r.阻擋.length ? '有 ' + r.阻擋.length + ' 項阻擋，先處理再交件' : '檢查通過');
  process.exit(r.阻擋.length ? 1 : 0);
}

module.exports = { 讀設定, 檢查, git, 變更清單, 已提交變更, 正規化網址, 是機密檔, 大檔副檔名 };
