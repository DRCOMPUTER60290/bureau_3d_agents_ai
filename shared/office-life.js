import {destinations,obstacles,findPath,isWalkable,walkDistance} from './navigation.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const mix=(a,b,t)=>a+(b-a)*t;
export function createOfficeLife(layout,agents){
  const places=destinations(layout,agents),items=obstacles(layout,agents);
  const actors=agents.map((agent,index)=>({id:agent.id,index,position:[...places.desks[agent.id].position],yaw:0,sitting:1,height:.675,phase:0,speed:0,state:'desk',goal:places.desks[agent.id],path:[],time:0,nextBreak:12+index*17,arrivedMeeting:null}));
  return {layout,places,items,actors,time:0,meeting:null,errors:[],manualBreak:null};
}
function go(world,actor,goal){
  if(actor.goal.key===goal.key&&actor.state!=='blocked')return;
  actor.from=actor.goal;actor.goal=goal;actor.path=[];actor.time=0;actor.state='standing-up';actor.arrivedMeeting=null;
}
function route(world,actor){
  actor.ignore=[world.places.desks[actor.id].key,actor.from?.key,actor.goal.key].filter(Boolean);
  const path=findPath(actor.position,actor.goal.position,world.layout,[...world.items,...world.actors.filter(a=>a!==actor).map(a=>({key:'person-'+a.id,x:a.position[0],z:a.position[1],r:.26}))],actor.ignore);
  if(!path){actor.state='waiting';actor.speed=0;actor.time=0;return;}
  actor.path=path;actor.state='walking';actor.time=0;
}
export function tickOfficeLife(world,dt,{active=[],meeting=null}={}){
  dt=Math.min(.05,Math.max(0,dt));world.time+=dt;
  const busy=new Set(active),participants=meeting&&['gathering','discussing'].includes(meeting.status)?meeting.participants:[];
  const usedLounge=new Set(world.actors.filter(a=>a.goal.type==='lounge').map(a=>a.goal.key));
  for(const actor of world.actors){
    const meetingIndex=participants.indexOf(actor.id);
    if(meetingIndex>=0){go(world,actor,world.places.meeting[meetingIndex]);actor.meetingId=meeting.id;}
    else if(actor.goal.type==='meeting'||busy.has(actor.id)&&actor.goal.type!=='desk'){go(world,actor,world.places.desks[actor.id]);}
    else if(actor.state==='lounge'&&actor.time>14){actor.nextBreak=world.time+70+actor.index*11;go(world,actor,world.places.desks[actor.id]);}
    else if(actor.state==='desk'&&!busy.has(actor.id)&&(world.time>actor.nextBreak||world.manualBreak===actor.id)){
      const free=world.places.lounge.find(s=>!usedLounge.has(s.key));if(free){usedLounge.add(free.key);go(world,actor,free);world.manualBreak=null;}
    }
    actor.time+=dt;actor.speed=0;
    if(actor.state==='standing-up'){
      actor.sitting=Math.max(0,actor.sitting-dt/1);if(actor.sitting===0)route(world,actor);
    }else if(actor.state==='waiting'){if(actor.time>.8)route(world,actor);
    }else if(actor.state==='walking'){
      const target=actor.path[0];if(!target){actor.state='sitting-down';actor.time=0;continue;}
      const dx=target[0]-actor.position[0],dz=target[1]-actor.position[1],d=Math.hypot(dx,dz);
      const step=Math.min(d,1.15*dt);let candidate=[actor.position[0]+dx/(d||1)*step,actor.position[1]+dz/(d||1)*step];
      const other=world.actors.find(a=>a!==actor&&walkDistance(candidate,a.position)<.52&&walkDistance(candidate,a.position)<walkDistance(actor.position,a.position));
      if(other)candidate=actor.position;
      if(!isWalkable(candidate,world.layout,world.items,actor.ignore))candidate=actor.position;
      actor.stuck=walkDistance(actor.position,candidate)<.0001?(actor.stuck||0)+dt:0;
      if(actor.stuck>.5){route(world,actor);actor.stuck=0;}
      const travelled=walkDistance(actor.position,candidate);actor.speed=travelled/dt||0;
      if(travelled>.0001){const mx=candidate[0]-actor.position[0],mz=candidate[1]-actor.position[1];actor.yaw=Math.atan2(-mx,-mz);actor.phase+=travelled*Math.PI*2/.9;actor.position=candidate;}
      if(walkDistance(actor.position,target)<.00001){actor.position=[...target];actor.path.shift();}
    }else if(actor.state==='sitting-down'){
      const difference=Math.atan2(Math.sin(actor.goal.yaw-actor.yaw),Math.cos(actor.goal.yaw-actor.yaw));actor.yaw+=difference*Math.min(1,dt*6);
      actor.height=mix(actor.height,actor.goal.height,Math.min(1,dt*8));actor.sitting=clamp(actor.sitting+dt/1);
      if(actor.sitting===1){actor.state=actor.goal.type;actor.time=0;if(actor.goal.type==='meeting')actor.arrivedMeeting=actor.meetingId;}
    }
  }
}
export function actorLabel(actor){return ({desk:'À son bureau',lounge:'Pause au salon',meeting:'En réunion',walking:actor.goal.type==='lounge'?'Vers le salon':actor.goal.type==='meeting'?'Vers la réunion':'Retour au bureau','standing-up':'Se lève','sitting-down':'S’assoit',waiting:'Attend le passage',blocked:'Passage bloqué'})[actor.state]||'Disponible';}
