'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
function youtubeUrl(value){if(typeof value!=='string'||value.length>2048)throw Error('Lien invalide.');let u;try{u=new URL(value)}catch{throw Error('Lien invalide.')}if(u.protocol!=='https:'||u.username||u.password||u.port||!['youtube.com','www.youtube.com','music.youtube.com','youtu.be'].includes(u.hostname))throw Error('Colle un lien HTTPS YouTube ou YouTube Music.');const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):'';if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw Error('Le lien doit désigner un seul titre.');return 'https://www.youtube.com/watch?v='+id;}
function createDownloadRouter({express,requireAuth,requireAdmin,DATA_DIR,storageRoot,importFile,spawnOverride,covers=null}){
 const router=express.Router(),file=path.join(DATA_DIR,'music_download_job.json');let running=false;
 const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return null}};
 const persist=job=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(job),{mode:0o600});fs.renameSync(tmp,file)};
 const old=read();if(old?.status==='running'){old.status='failed';old.error='Téléchargement interrompu lors du redémarrage du serveur. Réessaie le lien.';persist(old);}
 router.use(requireAuth,requireAdmin);
 router.get('/status',(req,res)=>res.set('Cache-Control','no-store').json({job:read()}));
 router.post('/',async(req,res)=>{
  let url;try{url=youtubeUrl(req.body?.url)}catch(e){return res.status(400).json({error:e.message})}
  if(running)return res.status(409).json({error:'Un téléchargement est déjà en cours.'});
  const binary=path.join(__dirname,'vendor','yt-dlp_linux');if(!spawnOverride&&(!fs.existsSync(binary)||process.platform!=='linux'))return res.status(503).json({error:'L’import YouTube est disponible sur le serveur NAS.'});
  const folder=require('./music-library-storage').centralMusicFolder(storageRoot),id=crypto.randomUUID(),output=path.join(folder,id+'.%(ext)s');
  try{for(const dir of [folder]){fs.mkdirSync(dir,{recursive:true});if(fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==path.resolve(dir))throw Error('Dossier redirigé');}}catch{return res.status(503).json({error:'Le dossier de téléchargement du NAS est inaccessible.'})}
  const job={id,status:'running',startedAt:new Date().toISOString()};persist(job);running=true;
  const args=['--ignore-config','--no-plugin-dirs','--no-playlist','--no-cache-dir','--no-update','--no-progress','--socket-timeout','15','--retries','1','--fragment-retries','1','--max-filesize','200M','--match-filter','!is_live & duration < 1800','--js-runtimes','node:/usr/local/bin/node','--extract-audio','--audio-format','mp3','--audio-quality','2','--embed-metadata','--ffmpeg-location','/usr/bin','--restrict-filenames','--no-overwrites','--output',output,'--',url];
  let child;try{child=(spawnOverride||spawn)(binary,args,{shell:false,stdio:['ignore','ignore','pipe'],env:{PATH:process.env.PATH,HOME:path.join(path.dirname(DATA_DIR),'download-cache'),LANG:'C.UTF-8'}})}catch{running=false;job.status='failed';job.error='L’outil d’import n’a pas démarré.';persist(job);return res.status(503).json({error:job.error})}
  let done=false,timeout=false,stderr='';child.stderr?.on('data',b=>{stderr=(stderr+b).slice(-4000)});
  const timer=setTimeout(()=>{timeout=true;child.kill('SIGKILL')},180000);
  const finish=async(code)=>{if(done)return;done=true;clearTimeout(timer);try{const target=path.join(folder,id+'.mp3');const stat=fs.existsSync(target)?fs.lstatSync(target):null;if(code!==0||!stat?.isFile()||stat.isSymbolicLink()||!stat.size||stat.size>220*1024**2)throw Error('download failed');const imported=await importFile(target,req.session.user);job.status='complete';job.filename=id+'.mp3';const trackId=imported?.tracks?.[0]?.id;if(covers&&trackId)void covers.remember(trackId,new URL(url).searchParams.get('v'));}catch{job.status='failed';job.error=timeout?'Le téléchargement a dépassé trois minutes. Réessaie un titre plus court.':/sign in|bot|403|429|unavailable|private|premium|members|drm/i.test(stderr)?'YouTube refuse ce titre depuis le NAS. Aucun accès privé ou protection n’est contourné.':'L’import a échoué. Vérifie que ce titre public est accessible et réessaie.';}finally{job.finishedAt=new Date().toISOString();persist(job);running=false;}};
  child.once('error',()=>finish(-1));child.once('close',finish);res.status(202).json({ok:true,id});
 });return router;
}
module.exports={youtubeUrl,createDownloadRouter};
