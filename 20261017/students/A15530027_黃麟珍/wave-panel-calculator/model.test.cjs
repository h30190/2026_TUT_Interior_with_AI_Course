const assert=require('node:assert/strict');
const {defaults:d,calculate}=require('./model.js');
const base=calculate({...d});
assert(base.area>base.face);assert.equal(base.modules,50);
for(const r of base.rows){assert(Math.abs(r.input-r.output-r.waste)<1e-8);assert(r.score>=0&&r.score<=100);assert(Math.abs(r.cost-(r.materials+r.machining+r.laborCost+r.energy*d.electricity+r.finishing))<1e-8);}
const flat=calculate({...d,depth:0});assert(Math.abs(flat.area-flat.face)<1e-8);
const double=calculate({...d,quantity:2});for(let i=0;i<3;i++){assert(Math.abs(double.rows[i].cost-2*base.rows[i].cost)<1e-6);}
const speed=calculate({...d,printers:2});assert(speed.rows[1].time<base.rows[1].time);assert.equal(speed.rows[1].energy,base.rows[1].energy);
const limited=calculate({...d,moduleDepth:2});assert.equal(limited.ranked.length,1);assert.equal(limited.ranked[0].id,'wood');assert.equal(limited.ranked[0].score,100);
const noWaste=calculate({...d,plasticWaste:0,woodWaste:0});noWaste.rows.forEach(r=>assert(Math.abs(r.material-100)<1e-8));
assert.throws(()=>calculate({...d,printRate:0}));assert.throws(()=>calculate({...d,woodWaste:100}));assert.throws(()=>calculate({...d,weightCost:0,weightTime:0,weightMaterial:0,weightQuality:0,weightEnergy:0}));
console.log('PASS: geometry, quantity scaling, mass/cost balance, parallel equipment, feasibility, zero-waste and input validation.');
console.table(base.rows.map(r=>({method:r.id,cost:r.cost.toFixed(0),hours:r.time.toFixed(1),kWh:r.energy.toFixed(1),score:r.score.toFixed(1)})));
