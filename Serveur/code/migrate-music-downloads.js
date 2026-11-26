'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{centralMusicFolder,copyNewAudio}=require('./music-library-storage');
async function migrateMusicDownloads({DATA_DIR,storageRoot}){
 const file=path.join(DATA_DIR,'music_catalog.json');if(!fs.existsSync(file))return{updated:0};
 const store=JSON.parse(fs.readFileSync(file,'utf8')),old=path.join(storageRoot,'Telechargements','Musique'),folder=centralMusicFolder(storageRoot);let updated=0;
 const hash=async f=>{const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(f))h.update(chunk);return h.digest('hex')};
 for(const track of store.tracks){
  if(path.dirname(track.sourcePath)!==old)continue;
  if(!fs.existsSync(track.sourcePath))continue;
  const st=fs.lstatSync(track.sourcePath);if(!st.isFile()||st.isSymbolicLink()||fs.realpathSync(track.sourcePath)!==track.sourcePath)throw Error('Ancien téléchargement redirigé.');
  let target=path.join(folder,path.basename(track.sourcePath));
  if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||await hash(target)!==await hash(track.sourcePath))target=path.join(folder,crypto.randomUUID()+path.extname(target));}
  if(!fs.existsSync(target))await copyNewAudio(track.sourcePath,target);
  if(await hash(target)!==await hash(track.sourcePath))throw Error('Copie non vérifiée.');
  track.sourcePath=target;updated++;
 }
 if(updated){const backup=file+'.before-central-music-'+Date.now()+'.json';fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);const tmp=file+'.migration.tmp';fs.writeFileSync(tmp,JSON.stringify(store,null,2),{mode:0o600});fs.renameSync(tmp,file);}
 return{updated,originalNasDownloadsPreserved:true,idsPreserved:true};
}
module.exports={migrateMusicDownloads};
if(require.main===module)migrateMusicDownloads({DATA_DIR:process.env.JMH_MIGRATE_DATA_DIR,storageRoot:process.env.JMH_MIGRATE_STORAGE_ROOT}).then(result=>{fs.writeFileSync(process.env.JMH_MIGRATE_REPORT,JSON.stringify({passed:true,...result}));console.log(JSON.stringify(result));}).catch(e=>{try{fs.writeFileSync(process.env.JMH_MIGRATE_REPORT,JSON.stringify({passed:false,error:e.message}));}catch{}console.error(e.message);process.exitCode=1});
