import {mkdir,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const site=path.join(root,'cloud-site','app');
for(const [source,target] of [['src','studio'],['shared','shared']]){
  await mkdir(path.join(site,target),{recursive:true});
  for(const name of await readdir(path.join(root,source))){
    if(name==='main.jsx')continue;
    await copyFile(path.join(root,source,name),path.join(site,target,name));
  }
}
// Les imports relatifs du moteur partagé restent identiques dans le site.
for(const folder of ['server','shared'])await mkdir(path.join(site,'core',folder),{recursive:true});
for(const name of ['cloud-core.js','usage.js','team.js','agent-lifecycle.js'])await copyFile(path.join(root,'server',name),path.join(site,'core','server',name));
console.log('Interface et protocole cloud synchronisés.');
