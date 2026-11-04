import { spawn } from 'node:child_process';

// Le binaire officiel gère lui-même sa session. Aucune lecture de jeton.
export function subscriptionEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN$|CLAUDE_CODE_USE_|CLAUDECODE$)/i.test(key)) delete env[key];
  }
  return env;
}

export function runClaude(args, input = '', { timeout = 180000, launch = spawn, onResult } = {}) {
  return new Promise((resolve, reject) => {
    const child = launch(process.env.CLAUDE_CODE_PATH || 'claude', args, {
      shell: false, windowsHide: true, env: subscriptionEnvironment(), stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', size = 0, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Claude Code a dépassé le délai de réponse.'));
    }, timeout);
    child.on('error', () => finish(new Error('Claude Code est introuvable ou ne peut pas démarrer.')));
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { child.kill(); finish(new Error('Réponse Claude Code trop volumineuse.')); return; }
      stdout += chunk.toString();
    });
    // Les diagnostics bruts peuvent contenir des informations du compte.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (code !== 0) return finish(new Error('Claude Code a échoué. Vérifiez la session et les limites de votre abonnement dans le terminal.'));
      try { const result=JSON.parse(stdout);Promise.resolve(onResult?.(result)).then(()=>finish(null,result),()=>finish(null,result)); }
      catch { finish(new Error('La réponse de Claude Code est illisible.')); }
    });
    child.stdin.end(input);
  });
}

export async function getConnection() {
  try {
    const status = await runClaude(['auth', 'status'], '', { timeout: 15000 });
    const connected = status.loggedIn === true && status.authMethod === 'claude.ai';
    return { provider: 'claude-code', connected, subscription: connected ? status.subscriptionType : null,
      message: connected ? 'Session Claude Code connectée' : 'Ouvrez Claude Code et connectez votre compte Claude avec /login.' };
  } catch (error) {
    return { provider: 'claude-code', connected: false, subscription: null, message: error.message };
  }
}

export async function askClaude(system, prompt, options) {
  const args = ['-p', '--output-format', 'json', '--model', process.env.CLAUDE_MODEL || 'sonnet',
    '--safe-mode', '--strict-mcp-config', '--tools', '', '--no-session-persistence', '--system-prompt', system];
  const response = await runClaude(args, prompt, options);
  if (response.is_error || typeof response.result !== 'string' || !response.result.trim()) {
    throw new Error('Claude Code n’a pas pu répondre. Vérifiez votre connexion et les limites de votre abonnement.');
  }
  return response.result;
}

export async function planClaude(prompt,agents,history=[],options){
  const {planSchema,MAX_AGENTS}=await import('./team.js');
  const system=`Tu es Nora, patronne du studio. Tu peux réellement créer des agents via ce plan structuré : le studio les enregistre et construit leur bureau. Réponds uniquement selon le schéma. Réutilise les compétences existantes ; crée les spécialistes manquants si nécessaire ou si demandé explicitement, au plus six par demande et ${MAX_AGENTS} au total. Choisis des prénoms uniques. Pour une demande de création ou de discussion sans livrable, kind=team et assignments=[] : réponds directement via reply. Pour une mission, kind=mission et sélectionne entre un et six experts utiles seulement. Les références des nouveaux agents sont new-0, new-1, etc. Les autres agentId viennent du roster. Ne délègue pas à boss. Chaque consigne doit être précise. Si une discussion commune, une revue ou une réunion est demandée, ou nécessaire pour coordonner les experts, renseigne meeting.needed=true, meeting.topic, et meeting.participants avec les identifiants des experts présents (maximum six, tous doivent aussi recevoir une assignment). Nora sera automatiquement ajoutée. Une demande de réunion est une mission, pas une simple modification d’équipe. Sinon meeting.needed=false et participants=[]. Chaque agent indique ses services MCP disponibles. Pour une mission externe, délègue en priorité à un spécialiste qui possède le service correspondant ; il devra obtenir une validation humaine avant chaque appel. Sans service adapté, explique la connexion manquante sans prétendre avoir accédé aux données. Ne promets aucune action non réalisée ni disponibilité illimitée.`;
  const args=['-p','--output-format','json','--model',process.env.CLAUDE_MODEL||'sonnet','--safe-mode','--strict-mcp-config','--tools','','--no-session-persistence','--system-prompt',system,'--json-schema',JSON.stringify(planSchema)];
  const payload={request:prompt,agents:agents.map(({id,name,role,services})=>({id,name,role,services:services||[]})),recentConversation:history.map(({role,text})=>({role,text:text.slice(0,4000)}))};
  const response=await runClaude(args,JSON.stringify(payload),options);
  if(response.is_error||!response.structured_output)throw Error('Nora n’a pas pu produire un plan structuré. Aucune création effectuée. Vérifiez les limites de Claude Code.');
  return response.structured_output;
}
