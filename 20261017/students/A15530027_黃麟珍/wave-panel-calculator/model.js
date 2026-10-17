(function (root) {
  'use strict';
  const defaults = {
    width:120,height:240,depth:5,waves:6,quantity:1,printThickness:3,hybridThickness:2,
    woodThickness:4,woodWaste:20,plasticWaste:12,recycled:80,density:1.38,
    woodPrice:650,plasticPrice:140,laborRate:350,electricity:4,
    printRate:0.18,printerPower:0.25,machineRate:35,printers:1,upstreamEnergy:2,
    cncRate:1.5,cncPower:1.2,cncFee:500,woodLabor:5,printLabor:2,hybridLabor:4,
    finishWood:400,finishPrint:500,finishHybrid:450,
    moduleWidth:25,moduleHeight:25,moduleDepth:25,
    qualityWood:80,qualityPrint:75,qualityHybrid:85,
    weightCost:30,weightTime:20,weightMaterial:20,weightQuality:20,weightEnergy:10
  };
  const keys=['cost','time','material','quality','energy'];
  function calculate(p, imported=null) {
    for (const k of Object.keys(defaults)) if(!Number.isFinite(p[k]) || p[k]<0) throw Error('請輸入有效的非負數值：'+k);
    for(const k of ['width','height','quantity','printThickness','hybridThickness','woodThickness','density','printRate','printers','cncRate','moduleWidth','moduleHeight','moduleDepth']) if(p[k]<=0) throw Error('尺寸、厚度、產能及設備數量必須大於零');
    for(const k of ['quantity','printers','waves']) if(!Number.isInteger(p[k])) throw Error('數量、設備台數與波浪數必須為整數');
    if(p.waves>50||p.width>1000||p.height>1000||p.quantity>1000) throw Error('本版範圍：最多 50 道波浪，寬高各 1000 cm，1000 片壁板');
    if(p.moduleWidth<1||p.moduleHeight<1) throw Error('分塊工作範圍寬長至少需 1 cm');
    for(const k of ['woodWaste','plasticWaste']) if(p[k]>=100) throw Error('耗損率必須小於 100%');
    for(const k of ['recycled','qualityWood','qualityPrint','qualityHybrid']) if(p[k]>100) throw Error('比例與造型評分需介於 0–100');
    const sum=p.weightCost+p.weightTime+p.weightMaterial+p.weightQuality+p.weightEnergy;
    if(!sum) throw Error('至少一項評分權重需大於零');
    const w=p.width/100,h=p.height/100,d=p.depth/100;
    // z(x)=D/2*(1-cos(2*pi*n*x/W)); Simpson integration of actual surface length.
    const steps=Math.max(1000,p.waves*100); let acc=0;
    for(let i=0;i<=steps;i++) {const derivative=d*Math.PI*p.waves/w*Math.sin(2*Math.PI*p.waves*i/steps);acc+=(i===0||i===steps?1:i%2?4:2)*Math.sqrt(1+derivative*derivative);}
    const arc=acc*w/steps/3;
    if(imported&&(!Number.isFinite(imported.area)||imported.area<=0||!Number.isFinite(imported.face)||imported.face<=0)) throw Error('上傳造型面積無效');
    const area=(imported?imported.area:arc*h)*p.quantity, face=(imported?imported.face:w*h)*p.quantity;
    // Frame allowance: perimeter plus three full-height ribs, all 20 x 30 mm.
    const frameVolume=(2*w+5*h)*0.02*0.03*p.quantity;
    const woodOutput=area*p.woodThickness/1000*650+frameVolume*500;
    const modulesPerPanel=Math.ceil(p.width/p.moduleWidth)*Math.ceil(p.height/p.moduleHeight);
    const modules=modulesPerPanel*p.quantity;
    const rows=[];
    function row(id,name,woodFactor,shellMm,laborHours,finish,quality) {
      const wood=woodOutput*woodFactor, plastic=area*shellMm*p.density;
      const woodIn=wood/(1-p.woodWaste/100),plasticIn=plastic/(1-p.plasticWaste/100);
      const woodMach=woodFactor?area/p.cncRate*woodFactor:0;
      const printMach=plasticIn/p.printRate;
      const energy=woodMach*p.cncPower+printMach*p.printerPower+plasticIn*p.upstreamEnergy;
      const materials=woodFactor*area*p.woodPrice/(1-p.woodWaste/100)+plasticIn*p.plasticPrice;
      const machining=woodMach*p.cncFee+printMach*p.machineRate;
      const labor=face*laborHours,finishing=face*finish;
      const cost=materials+machining+labor*p.laborRate+energy*p.electricity+finishing;
      const time=woodMach+printMach/p.printers+labor;
      const input=woodIn+plasticIn, output=wood+plastic;
      const feasible=!shellMm || p.depth+shellMm/10<=p.moduleDepth;
      rows.push({id,name,cost,time,material:output/input*100,quality,energy,materials,machining,labor,laborCost:labor*p.laborRate,finishing,wood,plastic,woodIn,plasticIn,input,output,waste:input-output,recycledKg:plasticIn*p.recycled/100,woodMach,printMach,modules:shellMm?modules:0,feasible,reason:feasible?'':'波浪深度加表皮厚度超過列印高度'});
    }
    row('wood','傳統木作 / CNC',1,0,p.woodLabor,p.finishWood,p.qualityWood);
    row('print','再生塑膠 3D 列印',0,p.printThickness,p.printLabor,p.finishPrint,p.qualityPrint);
    row('hybrid','木作＋列印外殼',0.35,p.hybridThickness,p.hybridLabor,p.finishHybrid,p.qualityHybrid);
    const feasible=rows.filter(r=>r.feasible);
    const weights=[p.weightCost,p.weightTime,p.weightMaterial,p.weightQuality,p.weightEnergy];
    rows.forEach(r=>{
      r.scores={}; r.score=0;
      keys.forEach((k,i)=>{const vals=feasible.map(x=>x[k]),lo=Math.min(...vals),hi=Math.max(...vals);const s=hi===lo?100:100*(i===2||i===3?(r[k]-lo)/(hi-lo):(hi-r[k])/(hi-lo)); r.scores[k]=Math.max(0,Math.min(100,s));r.score+=r.scores[k]*weights[i]/sum;});
      r.pareto=r.feasible&&!feasible.some(other=>other!==r&&keys.every((k,i)=>i===2||i===3?other[k]>=r[k]:other[k]<=r[k])&&keys.some((k,i)=>i===2||i===3?other[k]>r[k]:other[k]<r[k]));
    });
    return {area,face,arc,modules,rows,ranked:feasible.slice().sort((a,b)=>b.score-a.score),weightSum:sum};
  }
  const api={defaults,calculate}; if(typeof module!=='undefined')module.exports=api;else root.WaveModel=api;
})(globalThis);
