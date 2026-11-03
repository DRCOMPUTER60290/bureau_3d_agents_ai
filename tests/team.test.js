import test from 'node:test';
import assert from 'node:assert/strict';
import {initialAgents,applyPlan,executeTask,MAX_AGENTS} from '../server/team.js';
import {officeLayout} from '../shared/layout.js';
const roster=()=>structuredClone(initialAgents);
const proposal={kind:'mission',summary:'Confier les tests à un nouveau spécialiste.',reply:'',newAgents:[{name:'Camille',role:'Assurance qualité'}],assignments:[{agentId:'new-0',instruction:'Rédige trois vérifications.'}]};
test('création et délégation utilisent le même identifiant persistant',()=>{
  const original=roster(),update=applyPlan(original,proposal);
  assert.equal(original.length,4);assert.equal(update.agents.length,5);
  assert.equal(update.execution.assignments[0].agent,update.agents[4].id);
  assert.equal(update.agents[4].createdBy,'boss');
});
test('un plan invalide ne modifie jamais le roster',()=>{
  const original=roster();assert.throws(()=>applyPlan(original,{...proposal,assignments:[{agentId:'absent',instruction:'Test'}]}),/inconnu/);assert.equal(original.length,4);
  assert.throws(()=>applyPlan(original,{...proposal,newAgents:[{name:'Nora',role:'Autre'}]}),/déjà/);
  assert.throws(()=>applyPlan(original,{...proposal,newAgents:[],assignments:[{agentId:'boss',instruction:'Test'}]}),/inconnu/);
});
test('limites de capacité et références vérifiées avant toute mutation',()=>{
  const full=Array.from({length:MAX_AGENTS},(_,i)=>({id:'agent-'+i,name:'Personne '+i}));
  assert.throws(()=>applyPlan(full,proposal),/24/);
  assert.throws(()=>applyPlan(roster(),{...proposal,assignments:[{agentId:'new-5',instruction:'Test'}]}),/inconnu/);
});
test('Nora peut recruter sans lancer de mission aux spécialistes',async()=>{
  const state={agents:roster(),messages:[]};const task={prompt:'Crée Camille',steps:[]};let calls=0;
  await executeTask(state,task,{plan:async()=>({...proposal,kind:'team',assignments:[],reply:'Camille rejoint le studio.'}),ask:async()=>{calls++;},save:async()=>{}});
  assert.equal(calls,0);assert.equal(state.agents.length,5);assert.match(task.result,/Camille/);
});
test('les agents créés produisent une contribution et ne sont pas dupliqués à la reprise',async()=>{
  const state={agents:roster(),messages:[]};const task={prompt:'Teste le studio',steps:[]};let plans=0,calls=0,saves=0;
  const deps={plan:async()=>{plans++;return proposal;},ask:async()=>{calls++;return 'Livrable vérifié';},save:async()=>{saves++;}};
  await executeTask(state,task,deps);assert.equal(state.agents.length,5);assert.equal(task.steps[0].status,'done');assert.equal(calls,2);assert.ok(saves>=3);
  const restored=JSON.parse(JSON.stringify({state,task}));
  await executeTask(restored.state,restored.task,deps);assert.equal(plans,1);assert.equal(restored.state.agents.length,5);assert.equal(calls,3);
});
test('le plan agrandit la surface et réserve un bureau sans chevauchement à chaque agent',()=>{
  let previousArea=0;
  for(let n=4;n<=MAX_AGENTS;n++){
    const agents=[initialAgents[0],...Array.from({length:n-1},(_,i)=>({id:'a'+i}))];const layout=officeLayout(agents);
    assert.equal(Object.keys(layout.stations).length,n);assert.ok(layout.width*layout.depth>=previousArea);previousArea=layout.width*layout.depth;
    const positions=Object.values(layout.stations).map(s=>s.position);
    positions.forEach(([x,,z])=>{assert.ok(x-1.3>layout.minX&&x+1.3<layout.maxX);assert.ok(z-1>layout.minZ&&z+1.6<layout.maxZ);});
    for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert.ok(Math.abs(positions[i][0]-positions[j][0])>=2.6||Math.abs(positions[i][2]-positions[j][2])>=2.8);
  }
});
