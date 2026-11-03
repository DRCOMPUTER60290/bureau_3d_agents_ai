import React, {useEffect, useRef, useState, useMemo, createContext, useContext} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {Html, OrbitControls, RoundedBox} from '@react-three/drei';
import * as THREE from 'three';

import SeatedPerson from './SeatedPerson.jsx';
import {officeLayout} from '../shared/layout.js';
import {createOfficeLife,tickOfficeLife} from '../shared/office-life.js';
import {woodTexture} from './materials.js';
const MotionContext=createContext(true);
const palette={ink:'#354843',oak:'#c49b72',ivory:'#eeece3',stone:'#d2d3c6',sage:'#8eab97',brass:'#b7955e'};
function SoftBox({position,size,color,radius=.08,rotation=[0,0,0],...props}){return <RoundedBox args={size} position={position} rotation={rotation} radius={Math.max(.0001,Math.min(radius,...size.map(x=>x/2-.0001)))} smoothness={4} castShadow={Math.min(...size)>.04} receiveShadow={Math.min(...size)>.04} {...props}><meshStandardMaterial color={color} roughness={.65}/></RoundedBox>}
function Sphere({position,scale=[1,1,1],color, ...props}){return <mesh position={position} scale={scale} castShadow {...props}><sphereGeometry args={[1,24,20]}/><meshStandardMaterial color={color} roughness={.7}/></mesh>}
function Cylinder({position,radius=.1,height=1,color,rotation=[0,0,0]}){return <mesh position={position} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[radius,radius,height,32]}/><meshStandardMaterial color={color} roughness={.5} metalness={color===palette.brass?.55:0}/></mesh>}
function Foliage({position,large=false}){const leaves=useRef(),time=useRef(0),motion=useContext(MotionContext);useFrame((_,delta)=>{if(motion)time.current+=delta;if(leaves.current)leaves.current.rotation.z=Math.sin(time.current*.65+position[0])*.015});return <group position={position} scale={large?1.3:.8}><mesh position={[0,.25,0]} castShadow><cylinderGeometry args={[.26,.2,.5,32]}/><meshStandardMaterial color="#dad5c5" roughness={.85}/></mesh><group ref={leaves}>{[0,1,2,3,4,5,6].map(i=><group key={i} rotation={[0,i*2.4,0]}><Cylinder position={[.11,.55+i*.09,0]} radius={.018} height={.65} color="#5f7554" rotation={[0,0,-.35]}/><Sphere position={[.25,.83+i*.09,0]} scale={[.19,.36,.065]} color={i%2?'#698766':'#849b6f'} rotation={[0,0,-.6]}/></group>)}</group></group>}
function Chair({position=[0,0,0],rotation=0,color='#7e9587'}){return <group position={position} rotation={[0,rotation,0]}><Cylinder position={[0,.3,0]} radius={.045} height={.48} color="#656b63"/>{[0,1,2,3,4].map(i=><group key={i} rotation={[0,i*Math.PI*.4,0]}><Cylinder position={[0,.12,.18]} radius={.026} height={.4} color="#656b63" rotation={[Math.PI/2,0,0]}/><Sphere position={[0,.09,.36]} scale={[.055,.055,.055]} color="#3e4843"/></group>)}<SoftBox position={[0,.59,0]} size={[.66,.17,.59]} radius={.08} color={color}/><SoftBox position={[0,.96,.27]} size={[.66,.65,.16]} color={color}/>{[-1,1].map(x=><SoftBox key={x} position={[x*.35,.8,0]} size={[.065,.07,.4]} color="#5c6b61"/>)}</group>}
function Monitor({position=[0,0,0],active=false}){return <group position={position}><SoftBox position={[0,.37,0]} size={[1.02,.62,.065]} radius={.03} color="#344340"/><SoftBox position={[0,.37,.04]} size={[.94,.54,.013]} radius={.012} color="#1b3535"/>{[0,1,2,3].map(i=><SoftBox key={i} position={[-.13+(i%2)*.08,.54-i*.105,.051]} size={[.48+(i%2)*.18,.022,.008]} radius={.002} color={i%2?'#85bda7':'#cad8c0'}/>)}<mesh position={[.35,.15,.05]}><sphereGeometry args={[.018,12,12]}/><meshStandardMaterial color={active?'#afffc0':'#7f9c91'} emissive={active?'#75eaa3':'#111111'} emissiveIntensity={active?1:0}/></mesh><Cylinder position={[0,.04,-.005]} radius={.035} height={.3} color="#7c8980"/><SoftBox position={[0,-.09,.04]} size={[.42,.025,.27]} radius={.012} color="#b6bcb1"/></group>}
function DeskFurniture({agent,active,world,motion}){return <group><SoftBox position={[0,.9,0]} size={[2.45,.12,1.22]} radius={.058} color={agent.id==='boss'?'#b98b60':'#d6b594'}/>{[-.92,.92].map(x=><group key={x}><Cylinder position={[x,.43,0]} radius={.038} height={.84} color="#64736b"/><SoftBox position={[x,.06,0]} size={[.12,.08,.9]} radius={.03} color="#64736b"/></group>)}<Monitor position={[0,1.1,-.26]} active={active}/><SoftBox position={[-.05,.98,.28]} size={[.7,.035,.25]} radius={.015} color="#eeeade"/>{[0,1,2].map(i=><SoftBox key={i} position={[-.05,1.002,.21+i*.065]} size={[.6,.005,.013]} radius={.002} color="#b5bcae"/>)}<Sphere position={[.53,.99,.28]} scale={[.065,.025,.09]} color="#e2dfd2"/><Cylinder position={[.92,1.065,.21]} radius={.085} height={.18} color={agent.color}/><mesh position={[1.015,1.07,.21]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.055,.015,8,16]}/><meshStandardMaterial color={agent.color}/></mesh><SoftBox position={[-.84,.99,.16]} size={[.29,.04,.4]} color="#8a9d85"/><SoftBox position={[-.84,1.015,.16]} size={[.25,.012,.36]} color="#eee8d7"/><MovingChair world={world} seatKey={"desk-"+agent.id} position={[0,0,.91]} motion={motion} color={agent.id==='boss'?'#9d7559':'#7d9588'}/></group>}
function MovingChair({world,seatKey,position,motion,color}){
  const chair=useRef();useFrame((_,delta)=>{if(!motion||!chair.current)return;const actor=world.actors.find(a=>a.goal.key===seatKey||a.from?.key===seatKey);const offset=actor&&(actor.goal.key!==seatKey||actor.sitting<1)?(1-(actor.goal.key===seatKey?actor.sitting:0))*.45:0;chair.current.position.z=THREE.MathUtils.damp(chair.current.position.z,offset,5,delta);});
  return <group position={position}><group ref={chair}><Chair color={color}/></group></group>;
}
function LifeActors({world,agents,active,meeting,motion,onArrival}){
  const reported=useRef(new Set());useFrame((_,delta)=>{if(!motion)return;tickOfficeLife(world,delta,{active,meeting});for(const actor of world.actors){if(actor.arrivedMeeting&&onArrival){const key=actor.arrivedMeeting+':'+actor.id;if(!reported.current.has(key)){reported.current.add(key);Promise.resolve(onArrival(actor.arrivedMeeting,actor.id)).catch(()=>reported.current.delete(key));}}}},-1);
  return agents.map((agent,index)=><SeatedPerson key={agent.id} agent={agent} index={index} active={active.includes(agent.id)} motion={motion} actor={world.actors[index]} world={world}/>);
}

function Station({agent,index,active,selected,onSelect,motion,station,world}){return <group position={station.position} rotation={[0,station.angle,0]} onClick={e=>{e.stopPropagation();onSelect(agent.id)}}><DeskFurniture agent={agent} active={active} world={world} motion={motion}/>{selected&&<mesh position={[0,.055,.15]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.48,1.51,64]}/><meshBasicMaterial color="#d3ac70" transparent opacity={.65}/></mesh>}</group>}
function Meeting({position,world,motion}){return <group position={position}><mesh position={[0,.025,0]} rotation={[-Math.PI/2,0,0]} receiveShadow><circleGeometry args={[2.05,64]}/><meshStandardMaterial color="#c8cab5" roughness={1}/></mesh><Cylinder position={[0,.51,0]} radius={.36} height={.94} color="#a5ad9c"/><Cylinder position={[0,1.02,0]} radius={1.45} height={.12} color="#e2d5be"/>{Array.from({length:8},(_,i)=><group key={i} rotation={[0,i*Math.PI/4,0]}><MovingChair world={world} motion={motion} seatKey={'meeting-'+i} position={[0,0,2]} color="#a6b398"/></group>)}<SoftBox position={[.2,1.1,.15]} size={[.57,.035,.38]} color="#697f75"/><Cylinder position={[-.45,1.16,-.3]} radius={.11} height={.2} color="#d1a97e"/></group>}
function Lounge(){return <group position={[-4.6,0,3.4]}><SoftBox position={[0,.03,0]} size={[4.1,.055,3.3]} radius={.027} color="#c1b29d"/><SoftBox position={[0,.35,-1.13]} size={[2.8,.6,.88]} radius={.26} color="#b4bda7"/><SoftBox position={[0,.75,-1.47]} size={[2.8,.74,.23]} radius={.11} color="#9faa93"/>{[-1,1].map(x=><SoftBox key={x} position={[x*1.32,.61,-1.12]} size={[.22,.5,.83]} radius={.1} color="#9faa93"/>)}<SoftBox position={[-.85,.76,-1.19]} size={[.43,.38,.18]} radius={.08} color="#e3c5a0" rotation={[.2,0,-.2]}/><Cylinder position={[0,.32,1]} radius={.68} height={.49} color="#b68b64"/><Cylinder position={[0,.59,1]} radius={.78} height={.07} color="#e4d3b7"/><SoftBox position={[.18,.64,.97]} size={[.31,.035,.43]} color="#63796c"/><Cylinder position={[-.3,.71,1]} radius={.07} height={.18} color="#d9b784"/><mesh position={[1.27,.4,1.1]} castShadow><capsuleGeometry args={[.36,.2,8,24]}/><meshStandardMaterial color="#b49a7e"/></mesh><Foliage position={[-1.7,0,-1.3]} large/></group>}
function Architecture({layout}){
  const {minX,maxX,minZ,maxZ,width,depth,center}=layout;
  const texture=useMemo(()=>woodTexture(),[]);useEffect(()=>()=>texture.dispose(),[texture]);
  const windowCount=Math.max(4,Math.floor(width/3.7));
  return <group>
    <SoftBox position={[center[0],-.22,center[2]]} size={[width,.4,depth]} color="#b9b4a8" radius={.16}/>
    <mesh position={[center[0],-.012,center[2]]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[width-.12,depth-.12]}/><meshStandardMaterial map={texture} roughness={.74} metalness={.025}/></mesh>
    <SoftBox position={[center[0],1.5,minZ+.12]} size={[width-.2,3,.16]} color="#dedbd0"/>
    <SoftBox position={[minX+.12,1.5,-2.5]} size={[.16,3,7.4]} color="#dedbd0"/>
    {Array.from({length:windowCount},(_,i)=>{const w=(width-.9)/windowCount;const x=minX+.45+w*(i+.5);return <group key={i}>
      <SoftBox position={[x,1.75,minZ+.23]} size={[w-.18,2.1,.04]} radius={.015} color="#bfd1cf"/>
      <SoftBox position={[x,1.75,minZ+.27]} size={[.035,2.1,.03]} radius={.01} color="#f3efe4"/>
      <SoftBox position={[x,.67,minZ+.37]} size={[w-.1,.08,.28]} color="#c2af90"/>
    </group>;})}
    <SoftBox position={[-3.75,.75,-3.75]} size={[.055,1.5,3.5]} color="#bcb29f"/>
    {Array.from({length:9},(_,i)=><Cylinder key={i} position={[-3.75,1.8,-5.3+i*.4]} radius={.028} height={2.05} color="#a9906c"/>)}
    <mesh position={[-3.75,1.5,-3.75]}><boxGeometry args={[.018,2.6,3.45]}/><meshPhysicalMaterial color="#d6e6df" transparent opacity={.1} roughness={.12} depthWrite={false}/></mesh>
    <SoftBox position={[-5.9,.012,-3.65]} size={[4.1,.025,4.05]} radius={.01} color="#aeb29d"/>
    <SoftBox position={[-1.9+(layout.columns-1)*1.65,.012,-1.2+(layout.rows-1)*1.8]} size={[layout.columns*3.3-.35,.025,layout.rows*3.6-.4]} radius={.01} color="#c4c7b6"/>
    <group position={layout.cafe}>
      <SoftBox position={[0,.48,0]} size={[1.75,.96,1.05]} color="#86958a"/>
      <SoftBox position={[0,1.0,0]} size={[1.85,.08,1.15]} color="#dad4c6"/>
      <SoftBox position={[0,1.36,0]} size={[.62,.62,.45]} color="#3c4640"/>
      <Cylinder position={[0,1.13,.34]} radius={.075} height={.16} color="#ece4d2"/>
      <SoftBox position={[0,.57,2.25]} size={[1.75,1.14,.5]} color="#b6a58b"/>
      {[0,1,2,3,4,5].map(i=><SoftBox key={i} position={[-.63+i*.23,1.24,2.25]} size={[.14,.3+(i%3)*.055,.28]} color={['#819486','#c7ac8f','#697f78'][i%3]}/>)}
    </group>
    {[[minX+.8,0,minZ+1],[maxX-.8,0,minZ+1],[maxX-.7,0,.2],[minX+.9,0,5]].map((p,i)=><Foliage key={i} position={p} large/>)}
    {[[-.3,3.2,-1.2],[...layout.meeting.slice(0,1),3.3,-2.7],[-4.6,3,3.4]].map((p,i)=><group key={i} position={p}><Cylinder position={[0,.45,0]} radius={.01} height={.9} color={palette.brass}/><mesh><sphereGeometry args={[.5,32,16,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color={i===2?'#b99f7c':'#e6dfcf'} side={THREE.DoubleSide}/></mesh><mesh rotation={[Math.PI/2,0,0]}><circleGeometry args={[.46,32]}/><meshStandardMaterial color="#ffe3b2" emissive="#ffdfaa" emissiveIntensity={.25}/></mesh></group>)}
    <Html position={[-5.9,.08,-5.8]} center zIndexRange={[1,0]}><span className="zone-label">DIRECTION</span></Html>
    <Html position={[.1,.08,-3.7]} center zIndexRange={[1,0]}><span className="zone-label">OPEN SPACE · {Object.keys(layout.stations).length-1} POSTES</span></Html>
    <Html position={[layout.meeting[0],.08,-5.4]} center zIndexRange={[1,0]}><span className="zone-label">RÉUNION</span></Html>
    <Html position={[-5.1,.08,5.5]} center zIndexRange={[1,0]}><span className="zone-label">LE SALON</span></Html>
  </group>;
}

function CameraRig({view,layout}){
  const {camera,size}=useThree(),controls=useRef();
  useEffect(()=>{
    const target=new THREE.Vector3(layout.center[0],.4,layout.center[2]);
    camera.position.copy(target).add(new THREE.Vector3(...(view==='top'?[0,35,.01]:[19,22,26])));
    camera.lookAt(target);camera.updateMatrixWorld(true);
    const points=[];for(const x of [layout.minX,layout.maxX])for(const y of [-.4,3.8])for(const z of [layout.minZ,layout.maxZ])points.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    const bounds=new THREE.Box3().setFromPoints(points);const extent=bounds.getSize(new THREE.Vector3());
    camera.zoom=Math.min(size.width/(extent.x*1.1),size.height/(extent.y*1.12));camera.updateProjectionMatrix();
    if(controls.current){controls.current.target.copy(target);controls.current.update();}
  },[view,size.width,size.height,layout,camera]);
  return <OrbitControls ref={controls} makeDefault enablePan minZoom={5} maxZoom={160} minPolarAngle={.02} maxPolarAngle={Math.PI/2.2}/>;
}
export default function Office({agents,active,selected,onSelect,view,meeting,onArrival}){
  const [motion,setMotion]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rosterKey=agents.map(a=>a.id).join(',');
  const layout=useMemo(()=>officeLayout(agents),[rosterKey]);
  const world=useMemo(()=>createOfficeLife(layout,agents),[layout]);
  const lightTarget=useMemo(()=>{const target=new THREE.Object3D();target.position.set(...layout.center);return target;},[layout]);
  const extent=Math.max(layout.width,layout.depth)*.75;
  return <><Canvas orthographic shadows dpr={[1,1.8]} gl={{preserveDrawingBuffer:true,antialias:true}} camera={{position:[19,22,26],zoom:30,near:.1,far:160}}>
    <color attach="background" args={['#e0e3dc']}/><hemisphereLight args={['#fff5e1','#9caea3',1.3]}/>
    <primitive object={lightTarget}/><directionalLight position={[layout.center[0]-8,18,layout.center[2]+6]} target={lightTarget} intensity={2.0} castShadow shadow-mapSize={[4096,4096]} shadow-camera-near={.5} shadow-camera-far={70} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-normalBias={.045} shadow-bias={-.00005}/>
    <MotionContext.Provider value={motion}><Architecture layout={layout}/><Meeting position={layout.meeting} world={world} motion={motion}/><Lounge/>{agents.map((agent,index)=><Station key={agent.id} world={world} station={layout.stations[agent.id]} agent={agent} index={index} active={active.includes(agent.id)} selected={selected===agent.id} onSelect={onSelect} motion={motion}/>)}<LifeActors world={world} agents={agents} active={active} meeting={meeting} motion={motion} onArrival={onArrival}/></MotionContext.Provider>
    <CameraRig view={view} layout={layout}/>
  </Canvas><button className="motion-toggle" onClick={()=>setMotion(!motion)} aria-pressed={!motion}>{motion?'Ⅱ Mettre en pause':'▷ Animer le studio'}</button><button className="break-toggle" onClick={()=>{world.manualBreak=selected;}}>☕ Pause au salon</button>{meeting&&['gathering','discussing'].includes(meeting.status)&&<div className="meeting-banner"><b>{meeting.status==='gathering'?'L’équipe rejoint la réunion':'Réunion en cours'}</b><span>{meeting.topic}</span></div>}</>;
}
