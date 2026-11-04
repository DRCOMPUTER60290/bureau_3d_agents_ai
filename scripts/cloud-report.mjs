import {readFile,readdir,stat,unlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

export function transcriptTokens(lines){
  const messages=new Map();
  for(const line of lines.split('\n')){
    try{const item=JSON.parse(line);if(item.type==='assistant'&&item.message?.id&&item.message?.usage)messages.set(item.message.id,item.message.usage);}catch{}
  }
  if(!messages.size)return null;
  return [...messages.values()].reduce((out,u)=>{for(const k of ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'])out[k]+=Number.isFinite(u[k])&&u[k]>=0?u[k]:0;return out;},{input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0});
}
async function telemetry(){
  const result={};
  try{const {readAccountUsage}=await import('../server/usage-reader.js');const limits=await readAccountUsage({timeout:10000});result.rate_limits=Object.fromEntries(Object.entries(limits.windows).map(([name,w])=>[name,{utilization:w.usedPercent,resets_at:w.resetsAt}]));result.subscription_type=limits.subscription;}catch{}
  try{
    const directory=path.join(os.homedir(),'.claude','projects');
    const candidates=[];
    for(const project of (await readdir(directory,{withFileTypes:true})).slice(0,200)){
      if(!project.isDirectory())continue;
      const folder=path.join(directory,project.name);
      for(const entry of (await readdir(folder)).filter(n=>n.endsWith('.jsonl')).slice(0,100)){
        const file=path.join(folder,entry),info=await stat(file);if(info.size<12*1024*1024)candidates.push({file,time:info.mtimeMs});
      }
    }
    for(const candidate of candidates.sort((a,b)=>b.time-a.time).slice(0,3)){
      const content=await readFile(candidate.file,'utf8');
      const belongs=content.split('\n').some(line=>{try{return path.resolve(JSON.parse(line).cwd||'/nonexistent')===process.cwd();}catch{return false;}});
      if(!belongs)continue;
      const usage=transcriptTokens(content);if(usage){result.usage=usage;break;}
    }
  }catch{}
  return result;
}
export async function report(context,event,{fetchFn=fetch}={}){
  const url=new URL(context.callbackUrl);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Retour HTTPS requis.');
  // Ces secrets ne peuvent pas devenir des livrables ou des erreurs affiches.
  const remoteSession=process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  if(remoteSession&&/^(cse_|session_)[A-Za-z0-9_-]+$/.test(remoteSession))event={...event,sessionId:remoteSession};
  let serialized=JSON.stringify(event);
  for(const value of [context.callbackToken,context.serviceToken].filter(Boolean))serialized=serialized.replaceAll(value,'[secret masqué]');
  const response=await fetchFn(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+context.callbackToken,...(context.serviceToken?{'OAI-Sites-Authorization':'Bearer '+context.serviceToken}:{})},body:serialized,signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('Retour refusé (HTTP '+response.status+'). Conservez le même eventId pour réessayer.');
  return response.json();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),contextFile=args[args.indexOf('--context')+1],eventFile=args[args.indexOf('--event')+1];
    if(!args.includes('--context')||!args.includes('--event'))throw Error('Utilisez --context <fichier> --event <fichier>.');
    const context=JSON.parse(await readFile(contextFile,'utf8')),event=JSON.parse(await readFile(eventFile,'utf8'));
    if(['completed','error'].includes(event.type))event.telemetry=await telemetry();
    console.log(JSON.stringify(await report(context,event)));
    if(event.type==='completed')await unlink(contextFile).catch(()=>{});
  }catch{console.error('Le retour au bureau a échoué. Vérifiez le réseau, la configuration et les fichiers du protocole. Aucun secret affiché.');process.exitCode=1;}
}
