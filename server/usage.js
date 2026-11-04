const number=value=>Number.isFinite(value)&&value>=0?value:0;
export function tokenTotals(result){
  const models=result?.modelUsage;
  if(models&&Object.keys(models).length){
    return Object.values(models).reduce((sum,m)=>({input:sum.input+number(m.inputTokens),output:sum.output+number(m.outputTokens),cacheRead:sum.cacheRead+number(m.cacheReadInputTokens),cacheWrite:sum.cacheWrite+number(m.cacheCreationInputTokens)}),{input:0,output:0,cacheRead:0,cacheWrite:0});
  }
  const u=result?.usage;
  if(!u)return null;
  return {input:number(u.input_tokens),output:number(u.output_tokens),cacheRead:number(u.cache_read_input_tokens),cacheWrite:number(u.cache_creation_input_tokens)};
}
export function normalizeLimits(raw,now=new Date().toISOString()){
  const source=raw?.rate_limits||raw;
  const windows={};
  for(const name of ['five_hour','seven_day','seven_day_sonnet','seven_day_opus','seven_day_oauth_apps']){
    const w=source?.[name];if(!w)continue;
    const used=w.utilization??w.used_percentage;
    if(!Number.isFinite(used)||used<0||used>100)continue;
    const reset=typeof w.resets_at==='number'?new Date(w.resets_at*1000):new Date(w.resets_at);
    windows[name]={usedPercent:used,resetsAt:Number.isFinite(reset.getTime())?reset.toISOString():null};
  }
  return {windows,updatedAt:now,source:'claude-code-sdk',subscription:raw?.subscription_type||null};
}
export function recordUsage(state,result,{taskId,agentId,source='local',id=result?.session_id||result?.uuid}={}){
  const tokens=tokenTotals(result);if(!tokens||!id)return;
  state.usage??={records:[],limits:null};state.usage.records??=[];
  const entry={id,taskId:taskId||null,agentId:agentId||null,source,at:new Date().toISOString(),...tokens};
  const index=state.usage.records.findIndex(r=>r.id===id);
  // Les resultats SDK d'une meme session sont cumulatifs : remplacer, jamais additionner.
  if(index<0)state.usage.records.push(entry);else state.usage.records[index]=entry;
}
export function usageSummary(state,now=Date.now()){
  const records=state.usage?.records||[];
  const sum=rows=>rows.reduce((out,r)=>{for(const k of ['input','output','cacheRead','cacheWrite'])out[k]+=number(r[k]);out.calls++;return out;},{input:0,output:0,cacheRead:0,cacheWrite:0,calls:0});
  return {total:sum(records),fiveHours:sum(records.filter(r=>Date.parse(r.at)>=now-5*3600000)),week:sum(records.filter(r=>Date.parse(r.at)>=now-7*86400000)),limits:state.usage?.limits||null,lastError:state.usage?.lastError||null,scope:'Tokens mesures par le studio depuis cette version ; les quotas concernent tout le compte Claude.'};
}
