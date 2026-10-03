/* 資料蒐集層：三個來源，純讀取，不改任何檔案。
   1. Claude 逐字稿  ~/.claude/projects/**  的 Skill 工具呼叫
   2. 龍蝦 SQLite    ~/.openclaw/state/openclaw.sqlite 的 skill_usage 表
   3. 檔案系統       ~/.claude/skills 與 D:/Claude/skills 的清單、description、符號連結
   任何一個來源掛掉都要回報，不可以靜默當成「沒用過」。 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const 路徑 = {
  逐字稿根: 'C:/Users/jason/.claude/projects',
  claude技能: 'C:/Users/jason/.claude/skills',
  龍蝦技能: 'D:/Claude/skills',
  龍蝦DB: 'C:/Users/jason/.openclaw/state/openclaw.sqlite',
  路由表: ['D:/Claude/CLAUDE.md', 'D:/Claude/AGENTS.md']
};

/* ── 來源 1：Claude 逐字稿 ── */
async function 掃逐字稿(根 = 路徑.逐字稿根) {
  /* 統計用沒有原型的物件。2026-10-03 王品洋交叉稽核 #19：一般的 {} 會從 Object.prototype
     撈到 constructor、toString、__proto__，skill 叫這些名字時 !統計[k] 是 false，整支掃描崩潰。 */
  const out = { 統計: Object.create(null), 檔案數: 0, 行數: 0, 壞行: 0, 重複: 0,
                最早: null, 最晚: null, 錯誤: null };
  /* #21：同一筆 tool_use（同一個 id）可能被寫進不只一個逐字稿檔（例如接續對話），只算一次 */
  const 已見 = new Set();
  let 檔案 = [];
  try {
    (function 走(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) 走(p);
        else if (e.name.endsWith('.jsonl')) 檔案.push(p);
      }
    })(根);
  } catch (e) {
    out.錯誤 = '讀不到逐字稿目錄：' + e.message;
    return out;
  }

  for (const f of 檔案) {
    out.檔案數++;
    const rl = readline.createInterface({
      input: fs.createReadStream(f, 'utf8'), crlfDelay: Infinity
    });
    for await (const line of rl) {
      out.行數++;
      const 有時間 = line.indexOf('"timestamp"') !== -1;
      const 有技能 = line.indexOf('"name":"Skill"') !== -1;
      if (!有時間 && !有技能) continue;
      let rec;
      try { rec = JSON.parse(line); } catch (e) { out.壞行++; continue; }
      if (rec.timestamp) {
        if (!out.最早 || rec.timestamp < out.最早) out.最早 = rec.timestamp;
        if (!out.最晚 || rec.timestamp > out.最晚) out.最晚 = rec.timestamp;
      }
      if (!有技能) continue;
      const msg = rec.message;
      if (!msg || !Array.isArray(msg.content)) continue;
      for (const c of msg.content) {
        if (c && c.type === 'tool_use' && c.name === 'Skill' && c.input && c.input.skill) {
          if (c.id) {
            if (已見.has(c.id)) { out.重複++; continue; }
            已見.add(c.id);
          }
          const k = String(c.input.skill);
          if (!out.統計[k]) out.統計[k] = { 次數: 0, 首次: null, 最近: null, sessions: new Set() };
          const s = out.統計[k];
          s.次數++;
          if (rec.sessionId) s.sessions.add(rec.sessionId);
          if (rec.timestamp) {
            if (!s.首次 || rec.timestamp < s.首次) s.首次 = rec.timestamp;
            if (!s.最近 || rec.timestamp > s.最近) s.最近 = rec.timestamp;
          }
        }
      }
    }
  }
  return out;
}

/* ── 來源 2：龍蝦 skill_usage ── */
function 讀龍蝦用量(db路徑 = 路徑.龍蝦DB) {
  const out = { 統計: Object.create(null), 筆數: 0, 錯誤: null };
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch (e) { out.錯誤 = '這個 Node 沒有 node:sqlite（需要 Node 22 以上）：' + e.message; return out; }
  let db;
  try { db = new DatabaseSync(db路徑, { readOnly: true }); }
  catch (e) { out.錯誤 = '開不了龍蝦資料庫：' + e.message; return out; }
  try {
    const 有表 = db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?')
      .get('table', 'skill_usage');
    if (!有表) { out.錯誤 = 'skill_usage 資料表不存在（龍蝦版本可能不同）'; return out; }
    for (const r of db.prepare('SELECT * FROM skill_usage').all()) {
      out.筆數++;
      out.統計[r.skill_name] = {
        次數: r.use_count,
        首次: new Date(r.first_used_at_ms).toISOString(),
        最近: new Date(r.last_used_at_ms).toISOString(),
        來源: r.skill_source
      };
    }
  } catch (e) {
    out.錯誤 = '查詢失敗：' + e.message;
  } finally {
    try { db.close(); } catch (e) { /* 關不掉不影響結果 */ }
  }
  return out;
}

/* ── 來源 3：檔案系統盤點 ── */
/* 讀 SKILL.md 開頭 frontmatter 的 description。
   2026-10-03 王品洋交叉稽核 #20：原本只拿同一行，YAML 多行寫法（description: >-）
   讀到的是「>-」兩個字，季節性關鍵字比對全部落空，交屋手冊這種一年用一次的 skill
   被列成「可刪候選」。這裡處理三種寫法：單行（含引號）、區塊（> 或 |）、縮排續行。 */
function 讀描述文字(frontmatter) {
  const 行 = frontmatter.split(/\r?\n/);
  for (let i = 0; i < 行.length; i++) {
    const m = 行[i].match(/^description:\s*(.*)$/);
    if (!m) continue;
    let 首 = m[1].trim();
    const 區塊 = /^[>|][+-]?\d*$/.test(首);
    const 續 = [];
    for (let j = i + 1; j < 行.length; j++) {
      if (/^\s+\S/.test(行[j]) || (區塊 && /^\s*$/.test(行[j]))) 續.push(行[j].trim());
      else break;
    }
    if (區塊) 首 = '';
    let 全 = [首].concat(續).filter(Boolean).join(' ').trim();
    if (/^(["']).*\1$/.test(全)) 全 = 全.slice(1, -1);
    return 全;
  }
  return '';
}

function 讀描述(skillMd) {
  try {
    const s = fs.readFileSync(skillMd, 'utf8').replace(/^﻿/, '');
    const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return m ? 讀描述文字(m[1]) : '';
  } catch (e) { return ''; }
}

/* 盤點一個 skills 資料夾。
   #20：沒有 SKILL.md 的資料夾（_archive、node_modules）原本被當成 skill 列入並建議可刪；
   壞掉的符號連結原本被 continue 靜默丟掉——違反本檔開頭「任何來源掛掉都要回報」。
   現在每一項都回傳，標上 有SKILL檔／壞連結，由稽核.js 決定怎麼呈現，不在這裡偷偷過濾。 */
function 盤點(目錄, 擁有者) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(目錄, { withFileTypes: true }); }
  catch (e) { return out; }
  for (const e of entries) {
    const p = path.join(目錄, e.name);
    const 是連結 = e.isSymbolicLink();
    let 是目錄 = e.isDirectory();
    let 連結目標 = null;
    let 壞連結 = false;
    if (是連結) {
      try { 連結目標 = fs.readlinkSync(p); } catch (err) { /* 目標可能已消失 */ }
      try { 是目錄 = fs.statSync(p).isDirectory(); } catch (err) { 是目錄 = false; 壞連結 = true; }
    }
    if (!是目錄 && !壞連結) continue;   /* 一般檔案（README 之類）本來就不是 skill */
    const skillMd = path.join(p, 'SKILL.md');
    out.push({
      名稱: e.name,
      擁有者: 擁有者,
      路徑: p,
      是連結: 是連結,
      連結目標: 連結目標,
      壞連結: 壞連結,
      有SKILL檔: !壞連結 && fs.existsSync(skillMd),
      描述: 壞連結 ? '' : 讀描述(skillMd)
    });
  }
  return out.sort((a, b) => a.名稱.localeCompare(b.名稱));
}

/* 路由表有沒有指名這個 skill：要是完整的名字，前後不能接著名字可用的字元。
   #20：原本用 indexOf，skill「ledger」被路由表裡的「interior-ledger」誤判成有指名；
   反過來，名字是別人前綴的 skill 永遠不會被列為可刪。 */
function 有指名(內容, 名稱) {
  const 跳脫 = 名稱.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^A-Za-z0-9_-])' + 跳脫 + '($|[^A-Za-z0-9_-])').test(內容);
}

/* ── 路由表：這個 skill 有沒有被指名 ── */
function 讀路由表(檔案清單 = 路徑.路由表) {
  const out = { 內容: '', 讀到: [], 讀不到: [] };
  for (const f of 檔案清單) {
    try { out.內容 += fs.readFileSync(f, 'utf8') + '\n'; out.讀到.push(f); }
    catch (e) { out.讀不到.push(f); }
  }
  return out;
}

module.exports = { 路徑, 掃逐字稿, 讀龍蝦用量, 盤點, 讀路由表, 讀描述文字, 有指名 };
