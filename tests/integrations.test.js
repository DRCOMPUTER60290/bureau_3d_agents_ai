import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {removeAgent,restoreAgent} from '../server/agent-lifecycle.js';import {ApprovalQueue,redact,createToolGuard,authorizedServer} from '../server/approvals.js';import {configuredServers,publicServer,validateHttpServer} from '../server/mcp-config.js';
const state=()=>({agents:[{id:'boss',name:'Nora'},{id:'a',name:'Camille'}],tasks:[],integrations:{enabled:['github']}});
test('retirer un agent conserve son historique et permet sa restauration',()=>{const s=state();s.tasks=[{status:'done',steps:[{agent:'a',output:'Historique'}]}];removeAgent(s,'a');assert.equal(s.agents.length,1);assert.equal(s.archivedAgents[0].name,'Camille');assert.equal(s.tasks[0].steps[0].output,'Historique');restoreAgent(s,'a');assert.equal(s.agents.length,2);assert.equal(s.archivedAgents.length,0);});
test('la direction et les agents réservés ne sont pas supprimables',()=>{const s=state();assert.throws(()=>removeAgent(s,'boss'),/Nora/);s.tasks=[{status:'working',execution:{assignments:[{agent:'a'}]}}];assert.throws(()=>removeAgent(s,'a'),/mission/);s.tasks=[{status:'queued'}];assert.throws(()=>removeAgent(s,'a'),/mission/);assert.equal(s.agents.length,2);});
test('la restauration refuse les doublons et les dépassements de capacité',()=>{const s=state();removeAgent(s,'a');s.agents.push({id:'other',name:'Camille'});assert.throws(()=>restoreAgent(s,'a'),/nom/);s.agents.pop();assert.throws(()=>restoreAgent(s,'a',1),/capacité/);});
test('aucun outil ne part sans validation, puis une révocation reste effective',async()=>{const s=state(),queue=new ApprovalQueue(),events=[],guard=createToolGuard({state:s,agentId:'a',taskId:'task',approvals:queue,record:async e=>events.push(e)});const hook=guard.hooks.PreToolUse[0].hooks[0];let settled=false;const request=hook({tool_name:'mcp__github__get_issue',tool_input:{issue:42},tool_use_id:'call-1',mcp_server:{name:'github',source:'dynamic'}},null,{}).then(r=>{settled=true;return r;});await Promise.resolve();assert.equal(settled,false);assert.equal(queue.list().length,1);queue.decide(queue.list()[0].id,true);const result=await request;assert.equal(result.hookSpecificOutput.permissionDecision,'allow');assert.equal((await guard.canUseTool('tool',{}, {toolUseID:'call-1'})).behavior,'allow');assert.equal((await guard.canUseTool('tool',{}, {toolUseID:'unknown'})).behavior,'deny');assert.equal(events[0].status,'approved');
 const waiting=hook({tool_name:'mcp__github__get_issue',tool_input:{},tool_use_id:'call-2',mcp_server:{name:'github'}},null,{});s.integrations.enabled=[];queue.decide(queue.list()[0].id,true);assert.equal((await waiting).hookSpecificOutput.permissionDecision,'deny');});
test('MCP inconnus, agents exclus et agents retirés restent bloqués',async()=>{const s=state(),queue=new ApprovalQueue(),guard=createToolGuard({state:s,agentId:'a',approvals:queue});const hook=guard.hooks.PreToolUse[0].hooks[0];assert.equal((await hook({mcp_server:{name:'intrus'}},null,{})).hookSpecificOutput.permissionDecision,'deny');s.agents[1].blockedMcpServers=['github'];assert.equal(authorizedServer(s,'a','github'),false);assert.equal(authorizedServer(s,'deleted','github'),false);assert.equal(queue.list().length,0);});
test('les secrets des paramètres sont masqués et un abandon refuse l’action',async()=>{assert.deepEqual(redact({Authorization:'Bearer token',nested:{api_key:'secret'},query:'test'}),{Authorization:'[masqué]',nested:{api_key:'[masqué]'},query:'test'});const queue=new ApprovalQueue(),controller=new AbortController(),result=queue.request({input:{password:'secret'}},{signal:controller.signal});assert.equal(JSON.stringify(queue.list()).includes('secret'),false);controller.abort();assert.equal(await result,false);assert.equal(queue.list().length,0);});
test('les configurations héritées sont fusionnées, sans exposer leurs secrets',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atelier-mcp-'));
 try{
  const cwd=path.join(root,'workspace');await mkdir(cwd);
  const config={mcpServers:{github:{type:'http',url:'https://example.com/mcp',headers:{Authorization:'secret-token'}}},projects:{}};
  config.projects[cwd]={mcpServers:{local:{command:'node',args:['private.js'],env:{TOKEN:'private'}}}};
  await writeFile(path.join(root,'.claude.json'),JSON.stringify(config));
  await writeFile(path.join(cwd,'.mcp.json'),JSON.stringify({mcpServers:{project:{type:'http',url:'https://project.example/mcp'}}}));
  const servers=await configuredServers({home:root,cwd});assert.equal(servers.size,3);assert.equal(servers.get('github').config.headers.Authorization,'secret-token');
  const publicData=JSON.stringify([...servers.values()].map(publicServer));assert.equal(publicData.includes('secret-token'),false);assert.equal(publicData.includes('private.js'),false);assert.equal(publicData.includes('TOKEN'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('l’ajout HTTP valide le nom et refuse les identifiants dans les URL',()=>{assert.equal(validateHttpServer('github','https://api.githubcopilot.com/mcp/').name,'github');assert.throws(()=>validateHttpServer('bad name','https://example.com'),/Nom/);assert.throws(()=>validateHttpServer('bad','https://user:secret@example.com'),/jeton/);assert.throws(()=>validateHttpServer('bad','https://example.com?token=secret'),/jeton/);assert.throws(()=>validateHttpServer('bad','http://external.example/mcp'),/HTTPS/);assert.equal(validateHttpServer('local','http://127.0.0.1:8080/mcp').name,'local');});

// Les sessions de ce bloc sont simulées : aucun appel réseau ou modèle.
import {Integrations} from '../server/integrations.js';
import {reviewableInput} from '../server/approvals.js';
test('une session MCP charge uniquement les services autorisés, sans outils système',async()=>{
 const s=state();let closed=false;
 const manager=new Integrations({state:s,save:async()=>{},approvals:new ApprovalQueue(),queryFn:({options})=>{
  assert.equal(options.strictMcpConfig,true);assert.deepEqual(options.tools,[]);assert.deepEqual(options.settingSources,[]);assert.deepEqual(Object.keys(options.mcpServers),['github']);assert.equal(options.permissionMode,'default');assert.equal(options.env.ENABLE_TOOL_SEARCH,'false');
  const result=(async function*(){yield {type:'result',result:'Livrable simulé',is_error:false};})();result.close=()=>{closed=true;};return result;
 }});
 manager.entries=new Map([['github',{name:'github',config:{type:'http',url:'https://example.com'}}],['autre',{name:'autre',config:{command:'private'}}]]);
 assert.equal(await manager.ask('Rôle','Mission',{agentId:'a',taskId:'job'}),'Livrable simulé');assert.ok(closed);
});
test('un diagnostic SDK brut ne doit pas exposer les secrets d’une configuration',async()=>{
 const manager=new Integrations({state:state(),save:async()=>{},approvals:new ApprovalQueue(),queryFn:()=>{throw Error('Authorization: Bearer secret-credential');}});manager.entries=new Map([['github',{name:'github',config:{type:'http',url:'https://example.com'}}]]);
 await assert.rejects(manager.ask('Rôle','Mission',{agentId:'a'}),e=>!e.message.includes('secret-credential')&&e.message.includes('MCP'));
});
test('les connecteurs de compte activés sont redécouverts après redémarrage',async()=>{
 const s=state();s.integrations.enabled=['claude.ai Gmail'];const manager=new Integrations({state:s});let scans=0;manager.scan=async()=>{scans++;manager.entries.set('claude.ai Gmail',{name:'claude.ai Gmail',config:{type:'claudeai-proxy',url:'https://example.com',id:'opaque-id'}});};await manager.ensureAvailable();assert.equal(scans,1);assert.equal(manager.availableFor('a').length,1);await manager.ensureAvailable();assert.equal(scans,1);
});
test('des paramètres impossibles à examiner sont refusés, sans validation partielle',async()=>{
 assert.equal(reviewableInput({message:'x'.repeat(17000)}),false);let deep={};for(let i=0;i<12;i++)deep={nested:deep};assert.equal(reviewableInput(deep),false);const queue=new ApprovalQueue();assert.equal(await queue.request({input:deep}),false);assert.equal(queue.list().length,0);
});
