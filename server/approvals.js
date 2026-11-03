const hidden=/token|secret|password|authorization|api.?key|cookie|credential/i;
export function redact(value,depth=0){
  if(depth>8)return '[tronqué]';if(Array.isArray(value))return value.map(v=>redact(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hidden.test(k)?'[masqué]':redact(v,depth+1)]));
  if(typeof value==='string')return value.slice(0,30000).replace(/(Bearer\s+)[\w.\-]+/gi,'$1[masqué]').replace(/([?&](?:token|key|secret|code|access_token)=)[^&#\s]+/gi,'$1[masqué]');return value;
}
export function reviewableInput(input){
  try{if(JSON.stringify(input??{}).length>16000)return false;const visit=(v,depth)=>depth<=8&&(!v||typeof v!=='object'||Object.values(v).every(x=>visit(x,depth+1)));return visit(input,0);}catch{return false;}
}
export class ApprovalQueue{
  constructor({timeout=300000}={}){this.timeout=timeout;this.pending=new Map();}
  list(){return [...this.pending.values()].map(p=>p.public);}
  request(context,{signal}={}){
    if(signal?.aborted||!reviewableInput(context.input))return Promise.resolve(false);
    return new Promise(resolve=>{
      const id=crypto.randomUUID();let timer;
      const finish=approved=>{if(!this.pending.has(id))return;this.pending.delete(id);clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(approved);};
      const abort=()=>finish(false);timer=setTimeout(abort,this.timeout);timer.unref?.();signal?.addEventListener('abort',abort,{once:true});
      this.pending.set(id,{public:{id,...context,input:redact(context.input),createdAt:new Date().toISOString()},finish});
    });
  }
  decide(id,approved){const item=this.pending.get(id);if(!item)return false;item.finish(approved===true);return true;}
}
export function authorizedServer(state,agentId,name){const agent=state.agents.find(a=>a.id===agentId);return Boolean(agent)&&(state.integrations?.enabled||[]).includes(name)&&!(agent.blockedMcpServers||[]).includes(name);}
export function createToolGuard({state,agentId,taskId,approvals,record=async()=>{}}){
  const allowedCalls=new Set();
  return {
    hooks:{PreToolUse:[{hooks:[async(input,_toolId,context)=>{
      const server=input.mcp_server?.name;
      if(!server||!authorizedServer(state,agentId,server))return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Ce service n’est pas autorisé pour cet agent.'}};
      const approved=await approvals.request({agentId,agentName:state.agents.find(a=>a.id===agentId)?.name||'Agent',taskId,server,tool:input.tool_name,input:input.tool_input},{signal:context?.signal});
      // Révocation pendant l’attente : une ancienne approbation ne suffit pas.
      const permitted=approved&&authorizedServer(state,agentId,server);if(permitted)allowedCalls.add(input.tool_use_id);
      await record({agentId,server,tool:input.tool_name,status:permitted?'approved':'denied',at:new Date().toISOString()});
      return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:permitted?'allow':'deny',permissionDecisionReason:permitted?'Action validée par l’utilisateur dans le studio.':'Action refusée ou délai dépassé.'}};
    }]}]},
    canUseTool:async(_name,input,options)=>allowedCalls.has(options.toolUseID)?{behavior:'allow',updatedInput:input}:{behavior:'deny',message:'Validation de cette action requise dans le studio.'},
  };
}
