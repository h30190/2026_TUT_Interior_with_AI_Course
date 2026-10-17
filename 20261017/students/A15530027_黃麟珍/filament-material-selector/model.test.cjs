const assert=require('node:assert/strict');const {defaults:d,materials,calculate}=require('./materials.js');
const base=calculate({...d});assert(base.ranked.length>=2);assert.equal(base.rows.find(r=>r.id==='rpet').status,'pending');assert.equal(base.rows.find(r=>r.id==='tpu').status,'excluded');
const outside=calculate({...d,scene:'outdoor',temperature:60});assert.deepEqual(outside.ranked.map(m=>m.id),['asa']);assert.equal(outside.ranked[0].hdt,86);
const flex=calculate({...d,behavior:'flex'});assert.deepEqual(flex.ranked.map(m=>m.id),['tpu']);
assert.equal(calculate({...d,certification:true}).ranked.length,0);assert.equal(calculate({...d,scene:'splash'}).ranked.length,0);
const noEquipment=calculate({...d,maxNozzle:100});assert.equal(noEquipment.ranked.length,0);
for(const r of base.rows){assert(Math.abs(r.input-r.mass-r.waste)<1e-9);assert(Math.abs(r.cost-r.materialCost-r.electricityCost-r.machineCost-r.laborCost)<1e-8);}
const doubled=calculate({...d,volume:d.volume*2});assert.equal(doubled.rows[0].mass,base.rows[0].mass*2);assert.equal(doubled.rows[0].printHours,base.rows[0].printHours*2);
assert.throws(()=>calculate({...d,volume:0}));assert.throws(()=>calculate({...d,weightCost:0,weightTime:0,weightEnergy:0,weightRecycled:0}));assert.throws(()=>calculate(d,materials.map(m=>({...m,loss:100}))));
console.log('PASS: field/equipment filters, unknown-batch exclusion, uniform thermal load, empty candidates, mass and cost balance, volume scaling, validation.');
