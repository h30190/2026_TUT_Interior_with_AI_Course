/* 交件主流程：檢查 → commit → push 到 fork → 印出 PR 連結。
   跑法：node scripts/交件.js "commit 訊息"
        node scripts/交件.js "訊息" --dry    只看會做什麼，不真的動手

   順序是刻意的：檢查沒過就不 commit，commit 沒成功就不 push。
   PR 這一步不自動開——沒有 gh CLI，而且發 PR 是對外動作，由人按下去。 */
'use strict';

const { execFileSync } = require('child_process');
const 檢 = require('./檢查.js');

const 設定 = 檢.讀設定();
const 訊息 = process.argv[2];
const 試跑 = process.argv.includes('--dry');

function 跑(參數) {
  if (試跑) { console.log('  [試跑] git ' + 參數.join(' ')); return ''; }
  return execFileSync('git', 參數, {
    cwd: 設定.repo, encoding: 'utf8', windowsHide: true
  }).trim();
}

if (!訊息) {
  console.error('要給 commit 訊息，例：node scripts/交件.js "20260919 完成油漆計算機"');
  process.exit(1);
}

/* ── 第 1 步：檢查 ── */
console.log('第 1 步　交件前檢查');
const r = 檢.檢查(設定);
console.log('  分支：' + r.分支 + '　變更檔案：' + r.變更.length + ' 個');
r.變更.forEach(function (c) { console.log('    ' + c.狀態 + ' ' + c.路徑); });
r.提醒.forEach(function (s) { console.log('  提醒｜' + s); });
if (r.阻擋.length) {
  r.阻擋.forEach(function (s) { console.log('  阻擋｜' + s); });
  console.log('');
  console.log('檢查沒過，沒有 commit 任何東西。');
  process.exit(1);
}
console.log('  檢查通過');
console.log('');

/* ── 第 2 步：commit ── */
let 有新commit = false;
if (r.變更.length) {
  console.log('第 2 步　commit');
  const 我的資料夾 = 設定.上課日期資料夾.map(function (d) {
    return d + '/students/' + 設定.學號姓名;
  });
  跑(['add', '--'].concat(我的資料夾));
  跑(['commit', '-m', 訊息]);
  有新commit = true;
  if (!試跑) console.log('  ' + 跑(['log', '--oneline', '-1']));
  console.log('');
} else {
  console.log('第 2 步　沒有未提交的變更，跳過 commit');
  console.log('');
}

/* ── 第 3 步：push 到 fork ── */
console.log('第 3 步　push 到 ' + 設定.我的fork);
跑(['push', '-u', 設定.我的fork, r.分支]);
console.log('  已推上 ' + 設定.我的fork + '/' + r.分支 + '（push 到 fork 就算交件）');
console.log('');

/* ── 第 4 步：PR 連結 ── */
const fork帳號 = 設定.fork網址.split('/')[3];
const repo名 = 設定.fork網址.split('/')[4];
const pr網址 = 設定.上游網址 + '/compare/' + 設定.主分支 + '...' +
               fork帳號 + ':' + repo名 + ':' + r.分支 + '?expand=1';

console.log('第 4 步　PR（要不要發由你決定）');
console.log('  課程規則是 push 到 fork 就算交件，期末才發 PR 回主 repo。');
console.log('  要發的話開這個連結：');
console.log('  ' + pr網址);
console.log('');
console.log(試跑 ? '以上是試跑，沒有真的動任何東西。' :
            (有新commit ? '交件完成。' : '沒有新 commit，只做了 push。'));
