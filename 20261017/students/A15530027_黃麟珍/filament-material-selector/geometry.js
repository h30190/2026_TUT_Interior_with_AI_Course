(function(root){'use strict';
function parse(buffer,ext){const triangles=[],maxFaces=100000;function add(...p){if(triangles.length>=maxFaces)throw Error('模型超過10萬個三角面，請先簡化');if(p.flat().some(n=>!Number.isFinite(n)))throw Error('模型有無效座標');triangles.push(p);}const text=()=>new TextDecoder().decode(buffer);
 if(ext==='stl'){const d=new DataView(buffer),n=buffer.byteLength>=84?d.getUint32(80,true):0;if(n&&84+50*n===buffer.byteLength){if(n>maxFaces)throw Error('模型超過10萬個三角面');for(let i=0;i<n;i++){const p=[];for(let j=0;j<3;j++){const o=84+50*i+12+12*j;p.push([d.getFloat32(o,true),d.getFloat32(o+4,true),d.getFloat32(o+8,true)]);}add(...p);}}else{const s=text();if(!/^\s*solid\b/i.test(s))throw Error('STL 格式無法辨識');const re=/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;let m,p=[];while((m=re.exec(s))){p.push(m.slice(1).map(Number));if(p.length===3){add(...p);p=[];}}if(p.length)throw Error('STL 三角面不完整');}}
 else if(ext==='obj'){const vertices=[];for(const line of text().split(/\r?\n/)){const s=line.split('#')[0].trim().split(/\s+/);if(s[0]==='v'){if(s.length<4)throw Error('OBJ 頂點不完整');vertices.push(s.slice(1,4).map(Number));if(vertices.length>300000)throw Error('OBJ 頂點過多');}if(s[0]==='f'){if(s.length!==4)throw Error('OBJ 請先將面片三角化');add(...s.slice(1).map(x=>{const i=Number(x.split('/')[0]),p=vertices[i<0?vertices.length+i:i-1];if(!Number.isInteger(i)||!i||!p)throw Error('OBJ 索引無效');return p;}));}}}else throw Error('模型支援 STL、三角化 OBJ');
 if(!triangles.length)throw Error('檔案沒有有效三角面');const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const t of triangles)for(const p of t)p.forEach((n,i)=>{min[i]=Math.min(min[i],n);max[i]=Math.max(max[i],n);});
 let area=0,signed=0,degenerate=0;const edges=new Map(),parent=triangles.map((_,i)=>i);const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let ti=0;ti<triangles.length;ti++){const [aa,bb,cc]=triangles[ti],a=aa.map((x,i)=>x-min[i]),b=bb.map((x,i)=>x-min[i]),c=cc.map((x,i)=>x-min[i]);const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);const face=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;area+=face;if(face===0)degenerate++;
  signed+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  for(const [p,q] of [[aa,bb],[bb,cc],[cc,aa]]){const x=p.join(','),y=q.join(','),key=x<y?x+'|'+y:y+'|'+x,dir=x<y?1:-1,e=edges.get(key);if(e){e.count++;e.orientation+=dir;parent[find(ti)]=find(e.triangle);}else edges.set(key,{count:1,orientation:dir,triangle:ti});}
 }
 if(!Number.isFinite(area)||area<=0)throw Error('模型表面積無效');const components=new Set(parent.map((_,i)=>find(i))).size;
 const closed=!degenerate&&components===1&&[...edges.values()].every(e=>e.count===2&&e.orientation===0)&&Number.isFinite(signed)&&Math.abs(signed)>0;
 return {triangles,min,size:max.map((n,i)=>n-min[i]),area,volume:closed?Math.abs(signed):null,closed,components};
}
const api={parse};if(typeof module!=='undefined')module.exports=api;else root.FileGeometry=api;
})(globalThis);
