import {query} from '@anthropic-ai/claude-agent-sdk';
import {sdkOptions} from './integrations.js';
import {normalizeLimits} from './usage.js';

export async function readAccountUsage({queryFn=query,timeout=25000}={}){
  let session,release,timer;
  try{
    const prompt=(async function*(){await new Promise(resolve=>release=resolve);})();
    session=queryFn({prompt,options:sdkOptions({strictMcpConfig:true,mcpServers:{},canUseTool:async()=>({behavior:'deny',message:'Lecture de l’usage uniquement.'})})});
    const operation=async()=>{
      await session.initializationResult();
      const method=session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
      if(typeof method!=='function')throw Error('Usage SDK indisponible.');
      const raw=await method.call(session,{skipBehaviors:true});
      if(!raw.rate_limits_available)throw Error('Le compte ne fournit pas ses limites à cette session.');
      return normalizeLimits(raw);
    };
    return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Délai de lecture dépassé.')),timeout);})]);
  }catch{throw Error('Les limites officielles sont indisponibles. Vérifiez la connexion Claude Code ou consultez claude.ai/settings/usage.');}
  finally{clearTimeout(timer);session?.close();release?.();}
}
