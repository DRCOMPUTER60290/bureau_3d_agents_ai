import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { subscriptionEnvironment, runClaude, askClaude } from '../server/claude-code.js';
function fakeRun(payload, code=0, inspect=()=>{}) {
  return (executable,args,options)=>{
    inspect({executable,args,options});
    const child=new EventEmitter();
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.kill=()=>{};
    child.stdin.on('finish',()=>{child.stdout.end(JSON.stringify(payload));child.emit('close',code)});
    return child;
  };
}
test('préserve le PATH mais exclut les clés, jetons et routes API',()=>{
  const source={PATH:'test',ANTHROPIC_API_KEY:'secret',ANTHROPIC_BASE_URL:'proxy',CLAUDE_CODE_OAUTH_TOKEN:'token',CLAUDE_CODE_USE_BEDROCK:'1',CLAUDECODE:'1'};
  assert.deepEqual(subscriptionEnvironment(source),{PATH:'test'});
  assert.equal(source.ANTHROPIC_API_KEY,'secret');
});
test('passe le prompt via stdin, sans shell et sans outils',async()=>{
  const result=await askClaude('Rôle','Texte " & $(test)',{launch:fakeRun({result:'Réponse'},0,({args,options})=>{
    assert.equal(options.shell,false);
    assert.equal(options.windowsHide,true);
    assert.equal(args[args.indexOf('--tools')+1],'');
    assert.ok(args.includes('--safe-mode'));
    assert.ok(args.includes('--strict-mcp-config'));
    assert.ok(!args.includes('Texte " & $(test)'));
  })});
  assert.equal(result,'Réponse');
});
test('détecte les erreurs structurées même si le processus réussit',async()=>{
  await assert.rejects(askClaude('Rôle','Mission',{launch:fakeRun({is_error:true,result:'quota'})}),/limites/);
});
test('un échec du processus ne devient jamais une réponse réussie',async()=>{
  await assert.rejects(runClaude([], '',{launch:fakeRun({},1)}),/échoué/);
});
test('arrête les appels qui dépassent le délai',async()=>{
  let killed=false;
  await assert.rejects(runClaude([], '',{timeout:10,launch:()=>{
    const child=new EventEmitter(); child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{killed=true};return child;
  }}),/délai/);
  assert.ok(killed);
});
