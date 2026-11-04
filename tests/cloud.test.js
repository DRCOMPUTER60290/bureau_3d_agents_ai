import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudOffice,freshState,publicCloudState,digest} from '../server/cloud-core.js';
import {recordUsage,usageSummary,normalizeLimits} from '../server/usage.js';
import {readAccountUsage} from '../server/usage-reader.js';
import {transcriptTokens,report} from '../scripts/cloud-report.mjs';
function memory(){let state=freshState(),version=0;return {async read(){return {state:structuredClone(state),version};},async write(expected,next){if(expected!==version)return false;state=structuredClone(next);version++;return true;}};}
const config={fireUrl:'https://api.anthropic.com/v1/claude_code/routines/trig_example/fire',token:'sk-ant-oat01-test-secret',publicUrl:'https://office.example'};
async function setup(fetchFn=async()=>Response.json({claude_code_session_id:'session_example'})){
  const store=memory(),office=new CloudOffice({store,vaultKey:'test-vault-key',fetchFn});await office.configure(config);return {store,office};
}
const plan={kind:'mission',summary:'Deux contributions',newAgents:[{name:'Sofia',role:'Marketing'}],assignments:[{agentId:'strategy',instruction:'Analyser'},{agentId:'new-0',instruction:'Proposer'}],reply:'',meeting:{needed:false,topic:'',participants:[]}};
test('le cloud chiffre le jeton, refuse les faux domaines et ne publie aucun secret',async()=>{
  const {store,office}=await setup();const {state}=await store.read();
  assert.equal(JSON.stringify(state).includes(config.token),false);
  assert.equal(JSON.stringify(publicCloudState(state)).includes('authHash'),false);
  assert.equal(JSON.stringify(publicCloudState(state)).includes('test-vault-key'),false);
  await assert.rejects(office.configure({...config,fireUrl:'https://evil.example/fire'}));
  await assert.rejects(office.configure({...config,token:'sk-ant-api03-not-a-routine'}));
  await assert.rejects(office.configure({...config,publicUrl:'http://127.0.0.1:3001'}));
});
test('une mission cloud attend les vrais retours puis les valide sans dupliquer les agents',async()=>{
  let payload,requests=0;
  const {store,office}=await setup(async(url,options)=>{requests++;payload=JSON.parse(JSON.parse(options.body).text.split('ATELIER_RUN=')[1]);return Response.json({claude_code_session_id:'session_example'});});
  const {id}=await office.enqueue('Préparer un lancement');
  assert.equal(requests,1);assert.equal((await store.read()).state.tasks[0].status,'working');
  await assert.rejects(office.callback(id,'wrong',{eventId:'plan',type:'plan',plan}));
  const accepted=await office.callback(id,payload.callbackToken,{eventId:'plan',type:'plan',plan});
  const recruited=accepted.execution.recruits[0].id;
  await office.callback(id,payload.callbackToken,{eventId:'plan',type:'plan',plan});
  assert.equal((await store.read()).state.agents.length,5);
  await assert.rejects(office.callback(id,payload.callbackToken,{eventId:'early',type:'completed',result:'Trop tôt'}));
  for(const agentId of ['strategy',recruited])await office.callback(id,payload.callbackToken,{eventId:agentId,type:'contribution',agentId,output:'Livrable réel'});
  await office.callback(id,payload.callbackToken,{eventId:'finish',type:'completed',result:'Synthèse réelle'});
  const s=(await store.read()).state;assert.equal(s.tasks[0].status,'done');assert.equal(s.messages.at(-1).text,'Synthèse réelle');
  assert.equal(JSON.stringify(publicCloudState(s)).includes(payload.callbackToken),false);
});
test('un declenchement incertain ne repasse jamais automatiquement par fire et conserve la file',async()=>{
  let requests=0;const {store,office}=await setup(async()=>{requests++;throw Error('timeout');});
  await office.enqueue('Mission');await office.dispatchNext();await office.enqueue('Mission suivante');
  assert.equal(requests,1);const state=(await store.read()).state;
  assert.equal(state.tasks[0].cloud.phase,'uncertain');assert.equal(state.tasks[1].status,'queued');
});
test('les mises à jour concurrentes ne perdent pas de missions et les callbacks exigent une autorisation',async()=>{
  const {store,office}=await setup();
  await Promise.all([office.enqueue('Un'),office.enqueue('Deux')]);
  assert.equal((await store.read()).state.tasks.length,2);
  const response=await office.handle(new Request('https://office.example/api/state'));
  assert.equal(response.status,401);
  const denied=await office.handle(new Request('https://office.example/api/cloud/callback/unknown',{method:'POST',body:JSON.stringify({eventId:'x',type:'completed',result:'fake'})}));
  assert.equal(denied.status,401);
});
test('les callbacks expirés ne peuvent plus changer une mission',async()=>{
  const {store,office}=await setup();await office.enqueue('Mission');
  await office.update(s=>{s.tasks[0].cloud.startedAt='2020-01-01T00:00:00Z';});
  const s=(await store.read()).state,token='test';s.tasks[0].cloud.authHash=await digest(token);
  const current=await store.read();await store.write(current.version,s);
  await assert.rejects(office.callback(s.tasks[0].id,token,{eventId:'x',type:'error',error:'x'}),/expiré/);
});
test('les totaux SDK cumulatifs remplacent les précédents et les quotas manquants restent absents',()=>{
  const state={};recordUsage(state,{session_id:'one',uuid:'first',modelUsage:{sonnet:{inputTokens:20,outputTokens:5,cacheReadInputTokens:10,cacheCreationInputTokens:2}}});
  recordUsage(state,{session_id:'one',uuid:'second',modelUsage:{sonnet:{inputTokens:30,outputTokens:8,cacheReadInputTokens:12,cacheCreationInputTokens:3}}});
  assert.deepEqual(usageSummary(state).total,{input:30,output:8,cacheRead:12,cacheWrite:3,calls:1});
  const limits=normalizeLimits({rate_limits:{five_hour:{utilization:0,resets_at:'2026-11-04T15:00:00Z'},seven_day:{utilization:null,resets_at:null}}});
  assert.equal(limits.windows.five_hour.usedPercent,0);assert.equal(limits.windows.seven_day,undefined);
});
test('la lecture de compte ne soumet aucun prompt ni outil et ferme la session',async()=>{
  let options,submitted=false,closed=false;
  const result=await readAccountUsage({queryFn:({prompt,options:o})=>{options=o;prompt.next().then(r=>{if(!r.done)submitted=true;});return {initializationResult:async()=>({}),usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET:async args=>{assert.equal(args.skipBehaviors,true);return {rate_limits_available:true,rate_limits:{seven_day:{utilization:14,resets_at:'2026-11-10T10:00:00Z'}}};},close(){closed=true;}};}});
  assert.equal(submitted,false);assert.equal(closed,true);assert.deepEqual(options.tools,[]);assert.deepEqual(options.mcpServers,{});assert.equal(result.windows.seven_day.usedPercent,14);
});
test('les compteurs de transcription dédupliquent les messages et ne transmettent pas les secrets de retour',async()=>{
  const row=u=>JSON.stringify({type:'assistant',message:{id:'same',usage:{input_tokens:10,output_tokens:u}}});
  assert.equal(transcriptTokens(row(1)+'\n'+row(3)).output_tokens,3);
  let body;await report({callbackUrl:'https://office.example/api/cloud/callback/test',callbackToken:'sensitive',serviceToken:'private-site'},{type:'completed',result:'sensitive private-site'},{fetchFn:async(_url,options)=>{body=options.body;return Response.json({ok:true});}});
  assert.equal(body.includes('sensitive'),false);assert.equal(body.includes('private-site'),false);
});
