(function(root){
const base='https://prusament.com/wp-content/uploads/';
const materials=[
 {id:'pla',name:'PLA',grade:'Prusament PLA',density:1.24,hdt:55,nozzle:210,bed:60,flex:false,uv:false,enclosure:false,dry:false,abrasive:false,price:550,rate:120,power:.16,loss:8,dryHours:0,recycled:0,source:base+'2022/10/PLA_Prusament_TDS_2021_10_EN.pdf',note:'室內展示與裝飾原型；避免將 HDT 當作長期使用溫度。',evidence:'C · 廠商 TDS，2022-02-16'},
 {id:'petg',name:'PETG',grade:'Prusament PETG',density:1.27,hdt:68,nozzle:250,bed:80,flex:false,uv:null,enclosure:false,dry:false,abrasive:false,price:650,rate:100,power:.2,loss:10,dryHours:4,recycled:0,source:base+'2022/10/PETG_Prusament_TDS_2021_10_EN.pdf',note:'室內外殼與一般功能件候選；PETG 不等同瓶用 PET，長期日曬需另驗證。',evidence:'C · 廠商 TDS，2022-02-16'},
 {id:'asa',name:'ASA',grade:'Prusament ASA',density:1.07,hdt:86,nozzle:260,bed:110,flex:false,uv:true,enclosure:true,dry:false,abrasive:false,price:850,rate:80,power:.28,loss:15,dryHours:0,recycled:0,source:base+'2022/10/ASA_Prusament_TDS_2022_16_EN.pdf',note:'日曬、半戶外裝飾外殼候選；大型件需封箱穩定製程。HDT 1.8MPa 為86°C，93°C是0.45MPa結果。',evidence:'C · 廠商 TDS，2022-02-16'},
 {id:'tpu',name:'TPU 95A',grade:'Prusament TPU 95A（聚醚型）',density:1.25,hdt:78.6,nozzle:230,bed:65,flex:true,uv:null,enclosure:false,dry:false,abrasive:false,price:1200,rate:35,power:.18,loss:12,dryHours:0,recycled:0,source:'https://storage.googleapis.com/prusa3d-content-prod-14e8-wordpress-prusament-prod/2025/05/80316f6d-tds-prusament_tpu_95a_en-1.pdf',note:'柔性包覆、握把與緩衝墊候選；這是特定聚醚型配方，不能套用所有 TPU。',evidence:'C · 廠商 TDS，2025-05-29'},
 {id:'pa11cf',name:'PA11-CF',grade:'Prusament PA11 Carbon Fiber',density:1.11,hdt:152,nozzle:285,bed:110,flex:false,uv:null,enclosure:false,dry:true,abrasive:true,price:1900,rate:65,power:.28,loss:15,dryHours:6,recycled:0,source:base+'2022/08/TDS_PA11CFB.pdf',note:'耐熱、耐磨功能件候選；需乾燥、耐磨噴嘴與相容列印板。含再生碳纖維，但總再生質量比例未報告，計分暫填0。',evidence:'C · 廠商 TDS，2022-06-29'},
 {id:'rpet',name:'再生 PET',grade:'瓶身料／未指定批次（研究情境）',density:1.38,hdt:null,nozzle:250,bed:null,flex:false,uv:null,enclosure:false,dry:true,abrasive:false,price:300,rate:70,power:.23,loss:20,dryHours:8,recycled:100,source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC7464207/',note:'研究證實海岸 PET 瓶可再製列印；此批次 HDT、熱床與耐候未報告，因此列待確認。密度與加工成本為情境值。100%再生為示範假設。',evidence:'A · 原始研究僅支持製程可行性；本批次性能未知'}
];
const defaults={scene:'indoor',temperature:35,margin:15,behavior:'rigid',maxNozzle:300,maxBed:120,enclosure:true,dryer:true,hardened:true,certification:false,volume:1000,quantity:1,electricity:4,machineRate:30,laborHours:1,laborRate:350,dryerPower:.08,weightCost:35,weightTime:25,weightEnergy:20,weightRecycled:20};
function calculate(p,list=materials){
 for(const k of Object.keys(defaults)){if(typeof defaults[k]==='number'&&(!Number.isFinite(p[k])||p[k]<0))throw Error('請輸入有效數字：'+k);}
 if(p.volume<=0||p.quantity<1||!Number.isInteger(p.quantity))throw Error('材料體積需大於0，數量需為正整數');
 if(!['indoor','humid','sun','outdoor','splash'].includes(p.scene)||!['rigid','flex','any'].includes(p.behavior))throw Error('場域或用途選項無效');
 const weights=[p.weightCost,p.weightTime,p.weightEnergy,p.weightRecycled],sum=weights.reduce((a,b)=>a+b,0);if(sum===0)throw Error('至少一個權重需大於0');
 const rows=list.map(m=>{
  for(const k of ['density','price','rate','power','loss','dryHours','recycled'])if(!Number.isFinite(m[k])||m[k]<0)throw Error(m.name+' 參數無效');
  if(m.density<=0||m.rate<=0||m.loss>=100||m.recycled>100)throw Error(m.name+' 密度、產能或比例超出範圍');
  const exclude=[],pending=[],notes=[];
  if(p.behavior==='rigid'&&m.flex)exclude.push('用途要求剛性，本材料為柔性');
  if(p.behavior==='flex'&&!m.flex)exclude.push('用途要求柔性，本材料為剛性');
  if(m.nozzle>p.maxNozzle)exclude.push('噴嘴溫度不足');if(m.bed===null)pending.push('此料源熱床設定未知');else if(m.bed>p.maxBed)exclude.push('熱床溫度不足');
  if(m.enclosure&&!p.enclosure)exclude.push('本工具針對大型裝飾件採封箱製程門檻');if(m.dry&&!p.dryer)exclude.push('需乾燥設備');if(m.abrasive&&!p.hardened)exclude.push('需耐磨噴嘴');
  if(m.hdt===null)pending.push('此批次 HDT 未報告');else if(p.temperature+p.margin>m.hdt)exclude.push('預估溫度＋篩選裕量超過 HDT');
  if(['sun','outdoor'].includes(p.scene)&&m.uv!==true)pending.push('本工具未取得此牌號的長期耐候依據');
  if(p.scene==='humid')notes.push('潮濕場域需驗證尺寸穩定性；列印前乾燥與使用中防潮是不同問題');
  if(p.scene==='splash')pending.push('直接淋水／清潔劑與層間滲漏需產品試驗');
  if(p.certification)pending.push('未附此製品的室內裝修防火／排放認證');
  const volume=p.volume*p.quantity,inputVolume=volume/(1-m.loss/100),mass=volume*m.density/1000,input=inputVolume*m.density/1000,waste=input-mass;
  const printHours=inputVolume/m.rate,time=printHours+m.dryHours+p.laborHours;
  const energy=printHours*m.power+m.dryHours*p.dryerPower;
  const materialCost=input*m.price,electricityCost=energy*p.electricity,machineCost=printHours*p.machineRate,laborCost=p.laborHours*p.laborRate;
  return {...m,status:exclude.length?'excluded':pending.length?'pending':'candidate',exclude,pending,notes,mass,input,waste,printHours,time,energy,materialCost,electricityCost,machineCost,laborCost,cost:materialCost+electricityCost+machineCost+laborCost,recycledKg:input*m.recycled/100,score:null};
 });
 const eligible=rows.filter(r=>r.status==='candidate'),keys=['cost','time','energy','recycled'];
 eligible.forEach(r=>{r.score=keys.reduce((total,k,i)=>{const vals=eligible.map(v=>v[k]),lo=Math.min(...vals),hi=Math.max(...vals),s=hi===lo?100:100*(i===3?(r[k]-lo)/(hi-lo):(hi-r[k])/(hi-lo));return total+s*weights[i]/sum;},0);});
 return {rows,ranked:eligible.slice().sort((a,b)=>b.score-a.score),weightSum:sum};
}
const api={materials,defaults,calculate};if(typeof module!=='undefined')module.exports=api;else root.MaterialModel=api;
})(globalThis);
