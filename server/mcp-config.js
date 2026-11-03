import {readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('Une configuration MCP est illisible. Vérifiez vos fichiers Claude Code.');}}
function expand(value,root){if(Array.isArray(value))return value.map(v=>expand(v,root));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expand(v,root)]));if(typeof value!=='string')return value;return value.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g,(_,name,fallback)=>name==='CLAUDE_PLUGIN_ROOT'?root||'':process.env[name]??fallback??'${'+name+'}');}
export async function configuredServers({home=os.homedir(),cwd=process.cwd()}={}){
  const config=await readJson(path.join(home,'.claude.json')),entries=new Map();
  const add=(servers,source,root)=>{for(const [name,server] of Object.entries(servers||{})){if(server&&typeof server==='object')entries.set(name,{name,source,config:expand(server,root)});}};
  add(config.mcpServers,'Claude Code · utilisateur');
  const settings=await readJson(path.join(home,'.claude/settings.json'));
  const projectSettings=await readJson(path.join(cwd,'.claude/settings.json')),localSettings=await readJson(path.join(cwd,'.claude/settings.local.json'));
  const enabled={...settings.enabledPlugins,...projectSettings.enabledPlugins,...localSettings.enabledPlugins};
  const plugins=await readJson(path.join(home,'.claude/plugins/installed_plugins.json'));
  for(const [key,list] of Object.entries(plugins.plugins||{})){
    if(enabled[key]!==true||!Array.isArray(list))continue;
    const plugin=list.find(e=>e.scope==='user')||list.find(e=>path.resolve(e.projectPath||'').toLowerCase()===path.resolve(cwd).toLowerCase());if(!plugin?.installPath)continue;
    const data=await readJson(path.join(plugin.installPath,'.mcp.json'));const pluginName=key.split('@')[0];
    const servers=data.mcpServers||data;for(const [name,server] of Object.entries(servers))if(server&&typeof server==='object')add({['plugin:'+pluginName+':'+name]:server},'Plugin Claude Code',plugin.installPath);
  }
  const project=await readJson(path.join(cwd,'.mcp.json'));add(project.mcpServers,'Claude Code · projet');
  for(const [dir,p] of Object.entries(config.projects||{}))if(path.resolve(dir).toLowerCase()===path.resolve(cwd).toLowerCase())add(p.mcpServers,'Claude Code · local');
  return entries;
}
export function publicServer(entry){let host=null;try{host=new URL(entry.config?.url).hostname;}catch{}
  return {name:entry.name,source:entry.source,status:entry.status||'not-tested',host,transport:entry.config?.type||'stdio',tools:(entry.tools||[]).map(t=>({name:t.name,readOnly:t.annotations?.readOnly===true})),checkedAt:entry.checkedAt};
}
export function validateHttpServer(name,url){
  if(typeof name!=='string'||!/^[-\w]{1,64}$/.test(name)||['__proto__','constructor','prototype'].includes(name))throw Error('Nom MCP invalide : lettres, chiffres, tirets, 64 caractères maximum.');
  let target;try{target=new URL(url);}catch{throw Error('URL MCP invalide.');}
  if(target.protocol!=='https:'&&!(target.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(target.hostname)))throw Error('Utilisez HTTPS ou un serveur HTTP local.');
  if(target.username||target.password||target.search||target.hash)throw Error('Ne placez pas de jeton ou d’identifiant dans l’URL. Configurez les secrets directement dans Claude Code.');return {name,url:target.href};
}
