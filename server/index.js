import 'dotenv/config';
import express from 'express';
import {Integrations} from './integrations.js';
import {ApprovalQueue} from './approvals.js';
import {removeAgent,restoreAgent} from './agent-lifecycle.js';
import {getConnection,askClaude,planClaude} from './claude-code.js';
import {gatherMeeting,recordArrival} from './meetings.js';
import {initialAgents,MAX_AGENTS,executeTask} from './team.js';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
const app=express();app.use(express.json({limit:'16kb'}));
const file=path.resolve(process.env.ATELIER_DATA_FILE||'data/state.json');await mkdir(path.dirname(file),{recursive:true});
let state={tasks:[],messages:[],agents:structuredClone(initialAgents)};
try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
state.agents??=structuredClone(initialAgents);
state.integrations??={enabled:[]};state.archivedAgents??=[];
for(const task of state.tasks)if(task.status==='working')task.status='queued';
let saving=Promise.resolve();
function save(){const snapshot=JSON.stringify(state);saving=saving.catch(()=>{}).then(async()=>{await writeFile(file+'.tmp',snapshot);await rename(file+'.tmp',file);});return saving;}
await save();
const approvals=new ApprovalQueue();const integrations=new Integrations({state,save,approvals});await integrations.initialize();
const live=process.env.ATELIER_DEMO!=='1';let connection=await getConnection();let running=false;
app.get('/api/state',(_,res)=>res.json({...state,mode:live?'live':'demo',connection,busy:running,maxAgents:MAX_AGENTS,pendingApprovals:approvals.list()}));

app.delete('/api/agents/:id',async(req,res)=>{try{removeAgent(state,req.params.id);await save();res.json({ok:true});}catch(e){res.status(409).json({error:e.message});}});
app.post('/api/agents/:id/restore',async(req,res)=>{try{restoreAgent(state,req.params.id,MAX_AGENTS);await save();res.json({ok:true});}catch(e){res.status(409).json({error:e.message});}});
app.get('/api/integrations',(_,res)=>res.json(integrations.list()));
app.post('/api/integrations/scan',async(_,res)=>{try{res.json(await integrations.scan());}catch(e){res.status(503).json({error:e.message});}});
app.put('/api/integrations/enabled',async(req,res)=>{try{res.json(await integrations.setEnabled(req.body?.names));}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/agents/:id/integrations',async(req,res)=>{try{await integrations.setAgentAccess(req.params.id,req.body?.blocked);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/integrations/http',async(req,res)=>{try{res.json(await integrations.addHttp(req.body?.name,req.body?.url));}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/approvals/:id',async(req,res)=>{if(typeof req.body?.approved!=='boolean')return res.status(400).json({error:'Décision invalide.'});if(!approvals.decide(req.params.id,req.body.approved))return res.status(409).json({error:'Cette demande a expiré ou a déjà été traitée.'});res.json({ok:true});});

app.post('/api/meetings/:id/arrivals',async(req,res)=>{const task=state.tasks.find(t=>t.id===req.params.id);if(!recordArrival(task,req.body?.agentId))return res.status(409).json({error:'Réunion inactive ou participant inconnu.'});await save();res.json({ok:true});});
app.post('/api/connection/refresh',async(_,res)=>{connection=await getConnection();res.json(connection);});
app.post('/api/tasks',async(req,res)=>{
  const prompt=typeof req.body?.prompt==='string'?req.body.prompt.trim():'';
  if(!prompt||prompt.length>6000)return res.status(400).json({error:'La mission doit contenir entre 1 et 6 000 caractères.'});
  if(live){connection=await getConnection();if(!connection.connected)return res.status(503).json({error:connection.message});}
  if(state.tasks.filter(t=>['queued','working'].includes(t.status)).length>=10)return res.status(429).json({error:'La file contient déjà 10 missions.'});
  const task={id:crypto.randomUUID(),prompt,status:'queued',steps:[],createdAt:new Date().toISOString(),demo:!live};
  state.tasks.push(task);state.messages.push({role:'user',text:prompt,taskId:task.id});await save();res.status(201).json(task);void work();
});
async function work(){
  if(running)return;running=true;
  try{for(let task;(task=state.tasks.find(t=>t.status==='queued'));){
    task.status='working';task.error=null;await save();
    try{
      if(live){await integrations.ensureAvailable();await executeTask(state,task,{ask:(system,prompt,context)=>integrations.ask(system,prompt,context),plan:(prompt,agents,history)=>planClaude(prompt,agents.map(a=>({...a,services:integrations.availableFor(a.id).map(e=>e.name)})),history),save,coordinateMeeting:gatherMeeting});}
      else{await new Promise(r=>setTimeout(r,1200));task.result='Démonstration visuelle uniquement. Aucune création d’agent ni réponse Claude réelle dans ce mode.';}
      task.status='done';state.messages.push({role:'assistant',text:task.result,taskId:task.id});
    }catch(e){task.status='error';if(task.meeting)task.meeting.status='finished';task.error=e.message;state.messages.push({role:'assistant',text:e.message,taskId:task.id});}
    await save();
  }}finally{running=false;}
}
app.use(express.static(path.resolve('dist')));
app.listen(Number(process.env.PORT)||3001,'127.0.0.1',()=>{console.log('Atelier : http://127.0.0.1:'+(process.env.PORT||3001));void work();});
