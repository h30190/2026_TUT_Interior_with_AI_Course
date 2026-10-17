(function(root){
 'use strict';
 function parse(buffer,extension){
  const triangles=[],limit=100000;
  function add(a,b,c){if(triangles.length>=limit)throw Error('模型超過 100,000 三角面，請先簡化');if([...a,...b,...c].some(x=>!Number.isFinite(x)))throw Error('模型含無效座標');triangles.push([a,b,c]);}
  const text=()=>new TextDecoder().decode(buffer);
  if(extension==='stl'){
   const view=new DataView(buffer);const n=buffer.byteLength>=84?view.getUint32(80,true):0;
   if(n>0&&84+n*50===buffer.byteLength){if(n>limit)throw Error('模型超過 100,000 三角面');for(let i=0;i<n;i++){const pts=[];for(let j=0;j<3;j++){const o=84+i*50+12+j*12;pts.push([view.getFloat32(o,true),view.getFloat32(o+4,true),view.getFloat32(o+8,true)]);}add(...pts);}}
   else{const src=text();if(!/^\s*solid\b/i.test(src))throw Error('STL 格式無法辨識');const pts=[];const re=/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;let m;while((m=re.exec(src))){pts.push(m.slice(1).map(Number));if(pts.length===3){add(...pts);pts.length=0;}}if(pts.length)throw Error('STL 三角面不完整');}
  }else if(extension==='obj'){
   const vertices=[];for(const line of text().split(/\r?\n/)){const s=line.split('#')[0].trim().split(/\s+/);if(s[0]==='v'){if(s.length<4)throw Error('OBJ 頂點不完整');vertices.push(s.slice(1,4).map(Number));if(vertices.length>300000)throw Error('OBJ 頂點過多');}else if(s[0]==='f'){const ids=s.slice(1).map(x=>Number(x.split('/')[0]));if(ids.length!==3)throw Error('請先將 OBJ 面片三角化再上傳');add(...ids.map(i=>{const index=i<0?vertices.length+i:i-1;if(!Number.isInteger(i)||!i||!vertices[index])throw Error('OBJ 面片索引無效');return vertices[index];}));}}
  }else throw Error('請使用 STL 或三角化 OBJ');
  if(!triangles.length)throw Error('檔案沒有可讀取的三角面');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let area=0;
  for(const [a,b,c] of triangles){for(const p of [a,b,c])p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}
  if(!Number.isFinite(area)||area<=0)throw Error('模型沒有有效表面積');
  return {triangles,min,size:max.map((v,i)=>v-min[i]),area};
 }
 const api={parse};if(typeof module!=='undefined')module.exports=api;else root.MeshReader=api;
})(globalThis);
