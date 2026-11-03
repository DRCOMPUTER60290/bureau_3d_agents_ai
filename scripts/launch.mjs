import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,unlinkSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const noBrowser=process.argv.includes('--no-browser');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server,ownsLock=false;
const lock=path.join(root,'data','launcher.json');

function cleanup(){
  if(ownsLock){try{unlinkSync(lock);}catch{} ownsLock=false;}
}
process.on('exit',cleanup);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(server&&!server.killed)server.kill();
  process.exit(0);
});

async function ready(url){
  try{
    const response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(1200)});
    if(!response.ok)return false;
    const state=await response.json();
    return Array.isArray(state.agents)&&Array.isArray(state.tasks)&&state.connection?.provider==='claude-code';
  }catch{return false;}
}
function occupied(port){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port});
    socket.setTimeout(1500);
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('timeout',()=>{socket.destroy();reject(new Error('La verification du port a expire.'));});
    socket.once('error',error=>error.code==='ECONNREFUSED'?resolve(false):reject(error));
  });
}
async function openBrowser(url){
  console.log('\nBureau IA disponible : '+url);
  if(noBrowser)return;
  // URL locale transmise comme donnee, sans interpolation dans du code PowerShell.
  await new Promise(resolve=>{
    const browser=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process $env:ATELIER_LAUNCH_URL'],{
      windowsHide:true,stdio:'ignore',env:{...process.env,ATELIER_LAUNCH_URL:url}
    });
    browser.once('error',()=>{console.log('Ouvrez cette adresse dans votre navigateur.');resolve();});
    browser.once('exit',code=>{if(code)console.log('Ouvrez cette adresse dans votre navigateur.');resolve();});
  });
}
function latestInput(file){
  if(!existsSync(file))return 0;
  const info=statSync(file);
  return info.isDirectory()?Math.max(0,...readdirSync(file).map(name=>latestInput(path.join(file,name)))):info.mtimeMs;
}
async function build(){
  const output=path.join(root,'dist','index.html');
  const changed=Math.max(...['src','shared','index.html','vite.config.js','package.json','package-lock.json'].map(latestInput));
  if(existsSync(output)&&statSync(output).mtimeMs>=changed)return;
  console.log('Preparation du visuel 3D...');
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:root,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error('La compilation a echoue. Consultez le message ci-dessus.')));
  });
}

try{
  console.log('ATELIER AGENTS - Lancement du bureau IA\n');
  try{await import('dotenv/config');}catch{throw new Error('Dependances absentes. Ouvrez un terminal dans ce dossier et executez npm install.');}
  const port=Number(process.env.PORT)||3001;
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Le PORT configure doit etre compris entre 1 et 65535.');
  const url='http://127.0.0.1:'+port;
  if(await ready(url)){
    console.log('Le bureau est deja lance. La fenetre qui le fait tourner doit rester ouverte.');
    await openBrowser(url);
  }else{
    mkdirSync(path.dirname(lock),{recursive:true});
    try{writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});ownsLock=true;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;
      try{owner=JSON.parse(readFileSync(lock,'utf8')).pid;}catch{}
      let alive=true;
      if(Number.isInteger(owner)&&owner>0){try{process.kill(owner,0);}catch(e){if(e.code==='ESRCH')alive=false;}}
      if(!alive){unlinkSync(lock);writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});ownsLock=true;}
    }
    if(!ownsLock){
      console.log('Un autre lanceur est deja ouvert. Attente du bureau...');
      const deadline=Date.now()+90000;
      while(Date.now()<deadline&&!await ready(url))await sleep(700);
      if(!await ready(url))throw new Error('Le bureau ne repond pas. Consultez la premiere fenetre du lanceur.');
      await openBrowser(url);
    }else{
      if(await occupied(port))throw new Error('Le port '+port+' est utilise par un autre programme. Changez PORT dans .env ou fermez ce programme.');
      await build();
      console.log('Demarrage du serveur et verification de Claude Code...');
      console.log('Gardez cette fenetre ouverte. Ctrl+C ou sa fermeture arrete le bureau.');
      server=spawn(process.execPath,['server/index.js'],{cwd:root,stdio:'inherit'});
      let finished=false;
      const stopped=new Promise((resolve,reject)=>{
        server.once('error',error=>{finished=true;reject(error);});
        server.once('exit',code=>{finished=true;code===0?resolve():reject(new Error('Le serveur s\'est arrete (code '+code+').'));});
      });
      // Observer tout de suite les erreurs, meme pendant l'attente HTTP.
      stopped.catch(()=>{});
      const deadline=Date.now()+90000;
      while(!finished&&Date.now()<deadline&&!await ready(url))await sleep(700);
      if(finished){await stopped;throw new Error('Le serveur s\'est arrete avant son ouverture.');}
      if(!await ready(url)){server.kill();throw new Error('Demarrage trop long. Consultez les messages ci-dessus puis relancez.');}
      await openBrowser(url);
      await stopped;
    }
  }
}catch(error){
  console.error('\nImpossible de lancer le bureau : '+error.message);
  process.exitCode=1;
}finally{cleanup();}
