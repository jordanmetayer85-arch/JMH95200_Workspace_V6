'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function createConnectorUpdater({root,bundle=path.join(__dirname,'atelier-update')}){
 let pending=null;
 function plain(file){if(!fs.existsSync(file))return false;const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink();}
 function safePath(base,relative){if(!/^[a-zA-Z0-9 ._\/-]+$/.test(relative)||relative.split('/').some(p=>p==='..'||!p))throw Error('Chemin de mise à jour invalide.');const file=path.join(base,...relative.split('/'));let parent=path.dirname(file);while(parent!==base){if(fs.existsSync(parent)&&(!fs.lstatSync(parent).isDirectory()||fs.lstatSync(parent).isSymbolicLink()))throw Error('Dossier de mise à jour redirigé.');parent=path.dirname(parent);}if(fs.existsSync(file)&&!plain(file))throw Error('Fichier de mise à jour redirigé.');return file;}
 async function local(route,body){
  const health=await fetch('http://127.0.0.1:20127/health',{signal:AbortSignal.timeout(1500)}).then(r=>r.json());if(health.application!=='atelier-ia')throw Error('Le port du connecteur est utilisé par une autre application.');
  const key=JSON.parse(fs.readFileSync(path.join(root,'data/secrets.json'),'utf8')).launcher;
  const r=await fetch('http://127.0.0.1:20127/api/'+route,{method:body?'POST':'GET',headers:{'X-Atelier-Key':key,Origin:'http://127.0.0.1:20127',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});const value=await r.json();if(!r.ok)throw Error(value.error||'Le connecteur n’a pas accepté la mise à jour.');return value;
 }
 async function update(){
  if(!plain(path.join(bundle,'manifest.json')))return{updated:false};
  const manifest=JSON.parse(fs.readFileSync(path.join(bundle,'manifest.json'),'utf8'));
  if(manifest.version!=='1.3.0'||!Array.isArray(manifest.files)||manifest.files.length>60)throw Error('Manifeste du connecteur invalide.');
  if(!['node.exe','AtelierSecrets.exe','claude-native/package/claude.exe','desktop-control/venv/Scripts/python.exe'].every(n=>plain(path.join(root,n))))return{updated:false,requiresInstaller:true};
  if(fs.lstatSync(root).isSymbolicLink())throw Error('Dossier Atelier IA redirigé.');
  const rows=manifest.files.map(row=>{if(!/^[a-f0-9]{64}$/.test(row.sha256)||row.path.startsWith('data/')||row.path.endsWith('.exe'))throw Error('Fichier de mise à jour interdit.');const source=safePath(bundle,row.path),target=safePath(root,row.path),bytes=fs.readFileSync(source);if(bytes.length>1024*1024||hash(bytes)!==row.sha256)throw Error('La vérification du connecteur a échoué.');return{...row,target,bytes};});
  if(rows.every(row=>plain(row.target)&&hash(fs.readFileSync(row.target))===row.sha256))return{updated:false,current:true};
  let running=false;try{running=(await fetch('http://127.0.0.1:20127/health',{signal:AbortSignal.timeout(1000)}).then(r=>r.json())).application==='atelier-ia';}catch{}
  if(running){const status=await local('status');if(status.desktopActive||status.desktopBusy)throw Error('Arrête le pilotage avant de mettre le connecteur à jour.');await local('stop',{});let stopped=false;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));try{await fetch('http://127.0.0.1:20127/health',{signal:AbortSignal.timeout(500)});}catch{stopped=true;break;}}if(!stopped)throw Error('Ferme Atelier IA puis réessaie.');}
  const backups=path.join(root,'data','program-updates');if(fs.existsSync(backups)&&fs.lstatSync(backups).isSymbolicLink())throw Error('Dossier de sauvegarde redirigé.');const backup=path.join(backups,Date.now()+'-'+crypto.randomBytes(4).toString('hex'));fs.mkdirSync(backup,{recursive:true});
  const written=[];try{for(const row of rows){const existed=fs.existsSync(row.target);if(existed){const saved=path.join(backup,row.path);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(row.target,saved);}fs.mkdirSync(path.dirname(row.target),{recursive:true});const temp=row.target+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';fs.writeFileSync(temp,row.bytes,{flag:'wx'});fs.renameSync(temp,row.target);written.push({...row,existed});}return{updated:true,version:manifest.version};}
  catch(e){for(const row of written.reverse())if(row.existed)fs.copyFileSync(path.join(backup,row.path),row.target);throw e;}
 }
 return{update(){if(!pending)pending=update().finally(()=>pending=null);return pending;}};
}
module.exports={createConnectorUpdater};
