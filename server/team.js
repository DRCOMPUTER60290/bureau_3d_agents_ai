export const initialAgents = [
  {id:'boss',name:'Nora',role:'Direction & orchestration',color:'#cba481'},
  {id:'strategy',name:'Léa',role:'Stratégie & recherche',color:'#9daed6'},
  {id:'design',name:'Milo',role:'Design & expérience',color:'#bba2cd'},
  {id:'build',name:'Alex',role:'Développement',color:'#87bbaa'},
];
export const MAX_AGENTS=24;
const colors=['#a9bca0','#ccaa94','#a4b9c7','#c6ba8e','#ada4c6','#8fb7b2'];
export const planSchema={type:'object',additionalProperties:false,required:['kind','summary','newAgents','assignments','reply','meeting'],properties:{meeting:{type:'object',additionalProperties:false,required:['needed','participants','topic'],properties:{needed:{type:'boolean'},participants:{type:'array',maxItems:6,items:{type:'string'}},topic:{type:'string'}}},kind:{type:'string',enum:['team','mission']},summary:{type:'string'},reply:{type:'string'},newAgents:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['name','role'],properties:{name:{type:'string'},role:{type:'string'}}}},assignments:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,required:['agentId','instruction'],properties:{agentId:{type:'string'},instruction:{type:'string'}}}}}};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function applyPlan(agents,plan,now=new Date().toISOString()){
  if(!plan||!['team','mission'].includes(plan.kind)||!text(plan.summary,3000)||typeof plan.reply!=='string'||plan.reply.length>4000||!Array.isArray(plan.newAgents)||!Array.isArray(plan.assignments))throw Error('Le plan de Nora est invalide. Aucune création effectuée.');
  if(plan.newAgents.length>6||agents.length+plan.newAgents.length>MAX_AGENTS)throw Error(`Le studio accepte ${MAX_AGENTS} agents, avec six créations au maximum par demande.`);
  const names=new Set(agents.map(a=>a.name.toLocaleLowerCase('fr')));
  const recruits=plan.newAgents.map((a,i)=>{
    if(!a||!text(a.name,40)||!text(a.role,180))throw Error('Nom ou spécialité du nouvel agent invalide.');
    const name=a.name.trim();if(names.has(name.toLocaleLowerCase('fr')))throw Error('Nora a proposé un nom déjà utilisé. Aucune création effectuée.');names.add(name.toLocaleLowerCase('fr'));
    return {id:crypto.randomUUID(),name,role:a.role.trim(),color:colors[(agents.length+i)%colors.length],createdAt:now,createdBy:'boss'};
  });
  if(plan.assignments.length>6||(plan.kind==='mission'&&!plan.assignments.length)||(plan.kind==='team'&&plan.assignments.length))throw Error('La répartition des tâches est invalide.');
  const all=[...agents,...recruits];const assigned=new Set();
  const assignments=plan.assignments.map(a=>{
    if(!a||!text(a.agentId,100)||!text(a.instruction,3000))throw Error('Consigne de délégation invalide.');
    const ref=/^new-(\d+)$/.exec(a.agentId);const agent=ref?recruits[Number(ref[1])]:all.find(x=>x.id===a.agentId);
    if(!agent||agent.id==='boss'||assigned.has(agent.id))throw Error('Agent de délégation inconnu ou sélectionné plusieurs fois.');assigned.add(agent.id);
    return {agent:agent.id,name:agent.name,role:agent.role,instruction:a.instruction.trim()};
  });
  let meeting=null;
  if(plan.meeting?.needed){
    if(plan.kind!=='mission'||!text(plan.meeting.topic,300)||!Array.isArray(plan.meeting.participants)||plan.meeting.participants.length<1||plan.meeting.participants.length>6)throw Error('Réunion invalide.');
    const participants=plan.meeting.participants.map(id=>{const ref=typeof id==='string'&&/^new-(\d+)$/.exec(id);return ref?recruits[Number(ref[1])]?.id:id;});
    if(participants.some(id=>!all.some(a=>a.id===id)||id==='boss')||new Set(participants).size!==participants.length||participants.some(id=>!assignments.some(a=>a.agent===id)))throw Error('Participants de réunion invalides.');
    meeting={participants:['boss',...participants],topic:plan.meeting.topic};
  }
  return {agents:all,execution:{kind:plan.kind,summary:plan.summary.trim(),reply:plan.reply,recruits,assignments,meeting}};
}
export async function executeTask(state,task,{ask,plan,save,coordinateMeeting=async()=>{}}){
  if(!task.execution){
    const proposal=await plan(task.prompt,state.agents,state.messages.filter(m=>m.taskId!==task.id).slice(-6));
    const update=applyPlan(state.agents,proposal);state.agents=update.agents;task.execution=update.execution;task.plan=update.execution.summary;
    await save(); // L’équipe et les identifiants de la mission sont persistés ensemble avant les appels suivants.
  }
  const execution=task.execution;
  if(execution.meeting){
    task.meeting??={id:task.id,participants:execution.meeting.participants,topic:execution.meeting.topic,status:'gathering',arrived:[],createdAt:new Date().toISOString()};
    await save();await coordinateMeeting(state,task,{save});
  }
  if(execution.kind==='team'){
    task.result=execution.reply||'L’équipe a été mise à jour.';
    if(execution.recruits.length)task.result+='\n\nAgents créés et enregistrés : '+execution.recruits.map(a=>a.name+' — '+a.role).join(' ; ')+'.';
    return;
  }
  for(const assignment of execution.assignments){
    let step=task.steps.find(s=>s.agent===assignment.agent);if(step?.status==='done')continue;
    if(!step){step={...assignment,status:'working'};task.steps.push(step);}else step.status='working';await save();
    try{step.output=await ask(`Tu es ${assignment.name}, spécialiste de ${assignment.role}. Réponds en français avec un livrable utile. Utilise les outils chargés si nécessaire et attends la validation humaine. Sans outil chargé, produis uniquement du texte. Ne prétends jamais avoir effectué une action non exécutée ou refusée. Respecte la longueur demandée.`,`Mission : ${task.prompt}\nTa consigne : ${assignment.instruction}\nPlan : ${execution.summary}\nContributions précédentes : ${task.steps.filter(s=>s.status==='done').map(s=>s.output).join('\n')}`,{agentId:assignment.agent,taskId:task.id});step.status='done';await save();}
    catch(error){step.status='error';throw error;}
  }
  task.result=await ask('Tu es Nora. Synthétise en français les contributions réelles. Respecte le format demandé. Les agents indiqués comme créés dans le contexte sont déjà enregistrés par le studio, avec leur bureau. Décris uniquement les actions attestées dans les contributions et leurs éventuels refus.',`Mission : ${task.prompt}\nNouveaux agents enregistrés : ${JSON.stringify(execution.recruits.map(a=>({name:a.name,role:a.role})))}\n${task.steps.map(s=>s.name+' : '+s.output).join('\n')}`);
  if(task.meeting){task.meeting.status='finished';task.meeting.finishedAt=new Date().toISOString();await save();}
}
