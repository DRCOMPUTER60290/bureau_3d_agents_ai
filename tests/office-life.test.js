import test from 'node:test';import assert from 'node:assert/strict';
import {officeLayout} from '../shared/layout.js';import {destinations,obstacles,findPath,clearSegment,walkDistance} from '../shared/navigation.js';import {createOfficeLife,tickOfficeLife} from '../shared/office-life.js';import {gatherMeeting,recordArrival} from '../server/meetings.js';import {initialAgents,applyPlan} from '../server/team.js';
const roster=n=>[{id:'boss'},...Array.from({length:n-1},(_,i)=>({id:'a'+i}))];
test('chaque bureau dispose de trajets sans traversée de mobilier vers huit places de réunion et le salon',()=>{
 for(const n of [5,12,24]){const a=roster(n),l=officeLayout(a),d=destinations(l,a),o=obstacles(l,a);
  for(const agent of a)for(const goal of [...d.meeting,...d.lounge]){const ignore=['desk-'+agent.id,goal.key],path=findPath(d.desks[agent.id].position,goal.position,l,o,ignore);assert.ok(path,agent.id+' → '+goal.key);let point=d.desks[agent.id].position;for(const next of path){assert.ok(clearSegment(point,next,l,o,ignore));point=next;}}
 }
});
test('la marche suit la distance parcourue et s’arrête une fois assis au salon',()=>{
 const a=roster(5),w=createOfficeLife(officeLayout(a),a);w.manualBreak='boss';const active=a.slice(1).map(a=>a.id);let sawWalk=false,sawLounge=false;
 for(let i=0;i<1200;i++){const actor=w.actors[0],before=[...actor.position],phase=actor.phase;tickOfficeLife(w,.05,{active});const travelled=walkDistance(before,actor.position);if(travelled>.00001){sawWalk=true;assert.ok(Math.abs((actor.phase-phase)-travelled*Math.PI*2/.9)<.001);}if(actor.state==='lounge'){sawLounge=true;const p=actor.phase;tickOfficeLife(w,.05,{active});assert.equal(actor.phase,p);}}
 assert.ok(sawWalk);assert.ok(sawLounge);assert.equal(w.actors[0].state,'desk');
});
test('les participants rejoignent tous leur chaise puis reviennent sans téléportation',()=>{
 for(const n of [5,24]){const a=roster(n),w=createOfficeLife(officeLayout(a),a),active=a.map(a=>a.id),meeting={id:'meeting-test',status:'gathering',participants:a.slice(0,7).map(a=>a.id)};
  for(let i=0;i<1100;i++){const before=w.actors.map(a=>[...a.position]);tickOfficeLife(w,.05,{active,meeting});w.actors.forEach((actor,j)=>assert.ok(walkDistance(before[j],actor.position)<.06));}
  w.actors.slice(0,7).forEach(actor=>{assert.equal(actor.state,'meeting');assert.equal(actor.arrivedMeeting,meeting.id);assert.equal(actor.sitting,1);});
  for(let i=0;i<1300;i++)tickOfficeLife(w,.05,{active,meeting:{...meeting,status:'finished'}});
  w.actors.forEach(actor=>{assert.equal(actor.state,'desk');assert.deepEqual(actor.position,w.places.desks[actor.id].position);});
 }
});
test('une réunion ne démarre qu’après les arrivées ou le délai de continuité',async()=>{
 const task={status:'working',meeting:{status:'gathering',participants:['boss','a0'],arrived:[]}};assert.equal(recordArrival(task,'intrus'),false);let time=0,waits=0;
 await gatherMeeting({},task,{save:async()=>{},now:()=>time,wait:async()=>{time+=300;waits++;recordArrival(task,waits===1?'boss':'a0');}});
 assert.equal(waits,2);assert.equal(task.meeting.status,'discussing');assert.equal(task.meeting.visualAttendanceComplete,true);
 const other={meeting:{status:'gathering',participants:['boss'],arrived:[]}};time=0;await gatherMeeting({},other,{save:async()=>{},timeout:600,now:()=>time,wait:async()=>{time+=300;}});assert.equal(other.meeting.visualAttendanceComplete,false);
});
test('Nora ne peut réunir que des spécialistes réellement affectés à la mission',()=>{
 const base={kind:'mission',summary:'Revue',newAgents:[],reply:'',assignments:[{agentId:'design',instruction:'Proposer une idée'}],meeting:{needed:true,participants:['design'],topic:'Revue du studio'}};
 const result=applyPlan(initialAgents,base);assert.deepEqual(result.execution.meeting.participants,['boss','design']);assert.throws(()=>applyPlan(initialAgents,{...base,meeting:{...base.meeting,participants:['build']}}),/Participants/);
});
