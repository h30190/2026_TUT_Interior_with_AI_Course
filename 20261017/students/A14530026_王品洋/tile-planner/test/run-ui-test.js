/* 介面測試：用 Edge 的遠端除錯介面開啟打包後的 磁磚計畫.html，在頁面裡跑 test/ui.page-test.js（模擬使用者填表、換貼法、拖曳 3D）。
   跑法：node test/run-ui-test.js [msedge.exe 路徑]    需要先 node build.js */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const edge = process.argv[2] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const file = path.join(__dirname, '..', '磁磚計畫.html');
const code = fs.readFileSync(path.join(__dirname, 'ui.page-test.js'), 'utf8');
const PORT = 9400 + Math.floor(Math.random() * 90);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (!fs.existsSync(file)) { console.error('找不到 磁磚計畫.html，請先跑 node build.js'); process.exit(2); }
  const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(require('os').tmpdir(), 'tile_ui_' + Date.now()), 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); if (targets.length) break; } catch (e) { /* 等 Edge 起來 */ } await sleep(200); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = {}; const errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push((x.exception && x.exception.description) || x.text); }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: require('url').pathToFileURL(file).href }); await sleep(1500);
  const r = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const text = (r.result.result && r.result.result.value) || ('EXC ' + JSON.stringify(r.result.exceptionDetails));
  console.log(text);
  const failed = text.split('\n').filter(l => /^失敗/.test(l)).length, passed = text.split('\n').filter(l => /^通過/.test(l)).length;
  console.log('\n頁面未捕捉例外：' + errors.length); errors.slice(0, 5).forEach(e => console.log('  ' + e));
  console.log('結果：' + passed + ' 項通過，' + failed + ' 項失敗');
  ws.close(); proc.kill();
  process.exit(failed || errors.length ? 1 : 0);
})();
