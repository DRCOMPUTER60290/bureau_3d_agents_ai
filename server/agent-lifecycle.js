export function removeAgent(state,id,now=new Date().toISOString()){
  if(id==='boss')throw Error('Nora dirige le studio et ne peut pas être retirée.');
  const agent=state.agents.find(a=>a.id===id);if(!agent)throw Error('Agent introuvable.');
  const inUse=state.tasks.some(t=>['queued','working'].includes(t.status)&&(!t.execution||t.execution.assignments.some(a=>a.agent===id)||t.meeting?.participants.includes(id)));
  if(inUse)throw Error('Cet agent est réservé par une mission. Attendez la fin de la mission avant de le retirer.');
  state.archivedAgents??=[];state.archivedAgents.push({...agent,removedAt:now});state.agents=state.agents.filter(a=>a.id!==id);return agent;
}
export function restoreAgent(state,id,max=24){
  const agent=state.archivedAgents?.find(a=>a.id===id);if(!agent)throw Error('Agent archivé introuvable.');
  if(state.agents.length>=max)throw Error('Le studio a atteint sa capacité.');
  if(state.agents.some(a=>a.id===id||a.name.toLocaleLowerCase('fr')===agent.name.toLocaleLowerCase('fr')))throw Error('Un agent de même nom existe déjà.');
  const {removedAt,...restored}=agent;state.agents.push(restored);state.archivedAgents=state.archivedAgents.filter(a=>a.id!==id);return restored;
}
