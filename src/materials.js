import * as THREE from 'three';
export function woodTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#cbb99d';ctx.fillRect(0,0,512,512);
  let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let plank=0;plank<8;plank++){
    ctx.fillStyle=`rgba(${random()>.5?'255,248,224':'135,110,77'},${.025+random()*.055})`;ctx.fillRect(plank*64,0,64,512);
    ctx.fillStyle='rgba(86,71,52,.14)';ctx.fillRect(plank*64,0,1,512);
    for(let i=0;i<36;i++){ctx.strokeStyle=`rgba(105,80,46,${.015+random()*.035})`;ctx.lineWidth=.5;ctx.beginPath();const x=plank*64+random()*64;ctx.moveTo(x,0);ctx.bezierCurveTo(x+3,160,x-3,340,x+random()*4,512);ctx.stroke();}
    ctx.fillStyle='rgba(86,71,52,.10)';ctx.fillRect(plank*64,(plank%3)*170,64,1);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);texture.anisotropy=8;return texture;
}
