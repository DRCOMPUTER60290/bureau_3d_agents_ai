import React,{useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import * as THREE from 'three';
import {actorLabel} from '../shared/office-life.js';
const up=new THREE.Vector3(0,1,0);
function Segment({bind,radius,color}){return <mesh ref={bind} castShadow><capsuleGeometry args={[radius,1-radius*2,6,14]}/><meshStandardMaterial color={color} roughness={.88}/></mesh>}
function Ellipsoid({bind,position,scale,color,...props}){return <mesh ref={bind} position={position} scale={scale} castShadow {...props}><sphereGeometry args={[1,24,20]}/><meshStandardMaterial color={color} roughness={.8}/></mesh>}
function setSegment(mesh,a,b){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.sub(start);mesh.position.copy(start).addScaledVector(dir,.5);mesh.quaternion.setFromUnitVectors(up,dir.clone().normalize());mesh.scale.y=dir.length();}
const blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export default function Person({agent,index,active,motion,actor,world}){
  const nodes=useRef({}),root=useRef(),label=useRef(),lastLabel=useRef('');const bind=key=>node=>{nodes.current[key]=node;};
  const skins=['#d2a181','#a77559','#e1b697','#b58a6f'],hair=['#553b30','#2d2e2a','#684732','#292e2b'];const skin=skins[index%4],hairColor=hair[index%4];
  useFrame((_,delta)=>{
    if(!root.current)return;const n=nodes.current,t=world.time+index*2,sit=actor.sitting,stand=1-sit,offset=(actor.height-.675)*sit,lift=.275*stand+offset;
    root.current.position.set(actor.position[0],0,actor.position[1]);const diff=Math.atan2(Math.sin(actor.yaw-root.current.rotation.y),Math.cos(actor.yaw-root.current.rotation.y));if(motion)root.current.rotation.y+=diff*Math.min(1,delta*12);
    const speed=Math.min(1,actor.speed/1.15),gesture=actor.state==='meeting'&&active?Math.sin(t*3)*.045:0;
    n.pelvis.position.set(0,.765+lift,0);n.chest.position.y=.84+lift;n.chest.scale.y=1+Math.sin(t*1.7)*.004;
    n.head.position.set(0,1.68+lift,0);n.head.rotation.y=Math.sin(t*.6)*(active?.04:.1);n.head.rotation.x=.025*stand+Math.sin(t*.85)*.015;
    const blink=t%4.8;n.eyes.scale.y=blink>4.64?Math.max(.08,Math.abs(blink-4.72)/.08):1;
    for(const side of [-1,1]){
      const k=side<0?'l':'r',phase=actor.phase+(side<0?0:Math.PI),footZ=Math.cos(phase)*.23*speed,footLift=Math.max(0,Math.sin(phase))*.13*speed;
      const hip=[side*.135,.76+lift,-.03*sit],standingAnkle=[side*.145,.155+footLift,footZ];
      const ankle=blend(standingAnkle,[side*.145,.155+offset,-.42],sit);
      const dy=standingAnkle[1]-(.76+.275),dz=standingAnkle[2],length=Math.hypot(dy,dz),bend=Math.sqrt(Math.max(0,.47*.47-length*length/4));
      const standingKnee=[side*.145,(1.035+standingAnkle[1])/2+dz/(length||1)*bend,footZ/2+dy/(length||1)*bend];
      const knee=blend(standingKnee,[side*.145,.715+offset,-.42],sit);
      setSegment(n[k+'thigh'],hip,knee);setSegment(n[k+'shin'],knee,ankle);
      n[k+'shoe'].position.set(ankle[0],ankle[1]-.07,ankle[2]-.09);n[k+'sole'].position.set(ankle[0],ankle[1]-.12,ankle[2]-.10);
      const swing=Math.sin(phase)*.16*speed,relaxed=actor.goal.type==='lounge'&&sit>.9;
      const shoulder=[side*.22,1.31+lift,0];
      const elbow=blend([side*.27,1.28,swing*.35],[side*.30,1.035+offset,-.22],sit);
      const wrist=blend([side*.27,1.0,swing],relaxed?[side*.13,.88+offset,-.22]:[side*.18,1.025+offset+gesture,-.59],sit);
      setSegment(n[k+'upper'],shoulder,elbow);setSegment(n[k+'forearm'],elbow,wrist);
      const typing=active&&actor.state==='desk'?Math.sin(t*13+side)*.006:0;n[k+'hand'].position.set(wrist[0],wrist[1]+typing,wrist[2]-.04*sit);
    }
    const text=actorLabel(actor);if(label.current&&lastLabel.current!==text){label.current.textContent=text;lastLabel.current=text;}
  });
  return <group ref={root} position={[actor.position[0],0,actor.position[1]]}>
    <Ellipsoid bind={bind('pelvis')} position={[0,.765,0]} scale={[.22,.09,.18]} color="#3e4946"/>
    {[-1,1].map(side=>{const k=side<0?'l':'r';return <group key={side}>
      <Segment bind={bind(k+'thigh')} radius={.087} color="#44524e"/><Segment bind={bind(k+'shin')} radius={.071} color="#44524e"/>
      <Ellipsoid bind={bind(k+'shoe')} scale={[.094,.065,.19]} color="#d9d8cc"/><Ellipsoid bind={bind(k+'sole')} scale={[.099,.02,.195]} color="#444d46"/>
      <Segment bind={bind(k+'upper')} radius={.068} color={agent.color}/><Segment bind={bind(k+'forearm')} radius={.052} color={skin}/>
      <group ref={bind(k+'hand')}><Ellipsoid scale={[.075,.031,.09]} color={skin}/>{[0,1,2,3].map(i=><Ellipsoid key={i} position={[-.043+i*.028,-.006,-.075]} scale={[.011,.015,.036]} color={skin}/>)}</group>
    </group>;})}
    <group ref={bind('chest')} position={[0,.84,0]}><mesh position={[0,.28,0]} castShadow><capsuleGeometry args={[.205,.24,8,24]}/><meshStandardMaterial color={agent.color} roughness={.9}/></mesh><Ellipsoid position={[0,.18,-.135]} scale={[.155,.22,.045]} color={agent.color}/><mesh position={[0,.565,0]}><cylinderGeometry args={[.066,.066,.13,16]}/><meshStandardMaterial color={skin}/></mesh></group>
    <group ref={bind('head')} position={[0,1.68,0]}><Ellipsoid scale={[.205,.255,.205]} color={skin}/><Ellipsoid position={[0,-.09,-.035]} scale={[.165,.16,.17]} color={skin}/>{[-1,1].map(side=><Ellipsoid key={side} position={[side*.204,-.005,0]} scale={[.035,.062,.04]} color={skin}/>)}<mesh position={[0,.035,.015]} castShadow><sphereGeometry args={[.214,28,20,0,Math.PI*2,0,Math.PI*.54]}/><meshStandardMaterial color={hairColor} roughness={.92}/></mesh>{index%4===0&&<Ellipsoid position={[0,.17,.17]} scale={[.1,.105,.1]} color={hairColor}/>}<group ref={bind('eyes')}>{[-1,1].map(side=><group key={side}><Ellipsoid position={[side*.075,.015,-.183]} scale={[.038,.023,.015]} color="#eee8db"/><Ellipsoid position={[side*.075,.012,-.197]} scale={[.015,.019,.008]} color="#394238"/></group>)}</group><Ellipsoid position={[0,-.044,-.205]} scale={[.028,.045,.035]} color={skin}/><Ellipsoid position={[0,-.115,-.178]} scale={[.036,.008,.01]} color="#956b5a"/></group>
    <Html position={[0,2.28,0]} center zIndexRange={[20,0]}><div className={'person-label '+(active?'working':'')}><i style={{background:agent.color}}/>{agent.name}<span ref={label}>{actorLabel(actor)}</span></div></Html>
  </group>;
}
