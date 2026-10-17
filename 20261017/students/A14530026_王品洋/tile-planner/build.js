/* 打包：把 src 內的 CSS／JS 內嵌進模板，輸出單一離線 HTML。跑法：node build.js */
'use strict';
const fs = require('fs');
const path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let html = rd('index.template.html');
const put = (marker, code) => {
  if (/<\/script/i.test(code)) { throw new Error(marker + ' 內含 </script，會截斷內嵌腳本'); }
  html = html.replace(marker, () => code);
};
put('/*STYLE*/', rd('style.css'));
put('/*ENGINE*/', rd('engine.js'));
put('/*DRAW*/', rd('draw.js'));
put('/*REPORT*/', rd('report.js'));
put('/*APP*/', rd('app.js'));
const out = path.join(__dirname, '磁磚計畫.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已產生：' + out + '（' + Buffer.byteLength(html) + ' bytes）');
