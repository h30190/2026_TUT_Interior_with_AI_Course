const E=require('../src/engine.js'),fs=require('fs');
const p=JSON.parse(fs.readFileSync(__dirname+'/一樓後浴室.project.json','utf8'));
for(const top of [320,260]){p.wallTop=top;const r=E.computeAll(p);
 if(!r.ok){console.log(top,'ERR',JSON.stringify(r.errors||r.error));continue}
 console.log('wallTop',top,'地',r.floor.pieces,r.floor.chosen.method,r.floor.chosen.start,'牆',r.wallTotal.pieces,'警告',r.warnings.length);
 r.warnings.forEach(w=>console.log('  !',w));}
