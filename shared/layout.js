export function officeLayout(agents){
  const staff=agents.filter(a=>a.id!=='boss');
  const columns=Math.min(4,Math.max(2,Math.ceil(Math.sqrt(staff.length))));
  const rows=Math.max(1,Math.ceil(staff.length/columns));
  const stations={boss:{position:[-5.8,0,-3.6],angle:0}};
  staff.forEach((a,i)=>{stations[a.id]={position:[-1.9+(i%columns)*3.3,0,-1.6+Math.floor(i/columns)*3.6],angle:0};});
  const minX=-8.4,maxX=-1.9+(columns-1)*3.3+6.5,minZ=-6.4,maxZ=Math.max(6.4,-1.6+(rows-1)*3.6+2.8);
  return {stations,columns,rows,minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ,center:[(minX+maxX)/2,0,(minZ+maxZ)/2],meeting:[maxX-3,0,-2.7],cafe:[maxX-1.5,0,2.4]};
}
