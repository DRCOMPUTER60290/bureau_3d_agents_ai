// Navigation sur une grille : les trajets évitent le mobilier et les cloisons.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function destinations(layout,agents){
  const desks={};for(const agent of agents){const p=layout.stations[agent.id].position;desks[agent.id]={key:'desk-'+agent.id,position:[p[0],p[2]+.91],yaw:0,height:.675,type:'desk'};}
  const meeting=Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4;return {key:'meeting-'+i,position:[layout.meeting[0]+Math.sin(angle)*2,layout.meeting[2]+Math.cos(angle)*2],yaw:angle,height:.675,type:'meeting'};});
  const lounge=[-.65,.65].map((x,i)=>({key:'lounge-'+i,position:[-4.6+x,2.27],yaw:Math.PI,height:.65,type:'lounge'}));
  return {desks,meeting,lounge};
}
export function obstacles(layout,agents){
  const seats=destinations(layout,agents);const items=[];
  for(const agent of agents){const [x,,z]=layout.stations[agent.id].position;items.push({key:'table-'+agent.id,x,z,hx:1.23,hz:.62});items.push({key:'desk-'+agent.id,x,z:z+.91,r:.4});}
  items.push({key:'partition',x:-3.75,z:-3.75,hx:.08,hz:1.8},{key:'round-table',x:layout.meeting[0],z:layout.meeting[2],r:1.46});
  seats.meeting.forEach(s=>items.push({key:s.key,x:s.position[0],z:s.position[1],r:.38}));
  items.push({key:'sofa-back',x:-4.6,z:1.93,hx:1.4,hz:.06},{key:'sofa-left',x:-5.92,z:2.28,hx:.11,hz:.42},{key:'sofa-right',x:-3.28,z:2.28,hx:.11,hz:.42},{key:'coffee-table',x:-4.6,z:4.4,r:.78});
  items.push({key:'cafe',x:layout.cafe[0],z:layout.cafe[2],hx:.94,hz:.58},{key:'shelf',x:layout.cafe[0],z:layout.cafe[2]+2.25,hx:.9,hz:.27});
  [[layout.minX+.8,layout.minZ+1],[layout.maxX-.8,layout.minZ+1],[layout.maxX-.7,.2],[layout.minX+.9,5],[-6.3,2.1]].forEach(([x,z],i)=>items.push({key:'plant-'+i,x,z,r:.36}));
  return items;
}
export function isWalkable(point,layout,items,ignore=[],radius=.26){
  const [x,z]=point;if(x<layout.minX+.5||x>layout.maxX-.5||z<layout.minZ+.5||z>layout.maxZ-.5)return false;
  return !items.some(o=>!ignore.includes(o.key)&&(o.r?Math.hypot(x-o.x,z-o.z)<o.r+radius:Math.abs(x-o.x)<o.hx+radius&&Math.abs(z-o.z)<o.hz+radius));
}
export function clearSegment(a,b,layout,items,ignore=[]){
  if(!isWalkable(a,layout,items,ignore)||!isWalkable(b,layout,items,ignore))return false;
  const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const o of items){
    if(ignore.includes(o.key))continue;
    if(o.r){const t=Math.max(0,Math.min(1,((o.x-a[0])*dx+(o.z-a[1])*dz)/(dx*dx+dz*dz||1)));if(Math.hypot(a[0]+dx*t-o.x,a[1]+dz*t-o.z)<o.r+.26)return false;}
    else{let enter=0,leave=1,intersects=true;for(const [start,d,min,max] of [[a[0],dx,o.x-o.hx-.26,o.x+o.hx+.26],[a[1],dz,o.z-o.hz-.26,o.z+o.hz+.26]]){if(Math.abs(d)<1e-9){if(start<min||start>max){intersects=false;break;}}else{const t1=(min-start)/d,t2=(max-start)/d;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));if(enter>leave){intersects=false;break;}}}if(intersects)return false;}
  }
  return true;
}
export function findPath(start,end,layout,items,ignore=[]){
  if(clearSegment(start,end,layout,items,ignore))return [end];
  const cell=.22,nx=Math.ceil((layout.width-1)/cell),nz=Math.ceil((layout.depth-1)/cell),origin=[layout.minX+.5,layout.minZ+.5];
  const toCell=p=>[Math.max(0,Math.min(nx-1,Math.round((p[0]-origin[0])/cell))),Math.max(0,Math.min(nz-1,Math.round((p[1]-origin[1])/cell)))];
  const toPoint=i=>[origin[0]+(i%nx)*cell,origin[1]+Math.floor(i/nx)*cell];
  const nearest=p=>{const [x,z]=toCell(p);for(let r=0;r<12;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,zz=z+dz;if(xx>=0&&xx<nx&&zz>=0&&zz<nz){const q=[origin[0]+xx*cell,origin[1]+zz*cell];if(isWalkable(q,layout,items,ignore)&&clearSegment(p,q,layout,items,ignore))return zz*nx+xx;}}return -1;};
  const first=nearest(start),last=nearest(end);if(first<0||last<0)return null;
  const parents=new Int32Array(nx*nz).fill(-2),queue=[first];parents[first]=-1;
  for(let read=0;read<queue.length&&parents[last]===-2;read++){const cur=queue[read],x=cur%nx,z=Math.floor(cur/nx);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,index=zz*nx+xx;if(xx<0||xx>=nx||zz<0||zz>=nz||parents[index]!==-2)continue;if(!isWalkable(toPoint(index),layout,items,ignore))continue;parents[index]=cur;queue.push(index);}}
  if(parents[last]===-2)return null;
  const path=[end];for(let i=last;i!==-1;i=parents[i])path.push(toPoint(i));path.push(start);path.reverse();
  const simple=[];let cursor=0;while(cursor<path.length-1){let next=path.length-1;while(next>cursor+1&&!clearSegment(path[cursor],path[next],layout,items,ignore))next--;simple.push(path[next]);cursor=next;}
  return simple;
}
export const walkDistance=distance;
