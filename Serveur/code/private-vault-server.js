'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),express=require('express');
const CHUNK=4*1024*1024,ID=/^[a-f0-9]{32}$/;
function createPrivateVault({runtime,requireAuth,supervisionPolicy=()=>({available:false,required:false}),validateSupervised=()=>false,vaultModeration=()=>null}){
 const root=path.resolve(runtime,'private-vaults');fs.mkdirSync(root,{recursive:true,mode:0o700});
 function safeDir(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)throw Error('Stockage privé non disponible.');return dir;}
 function reserve(id){const dir=safeDir(path.join(root,crypto.createHash('sha256').update(String(id)).digest('hex')));safeDir(path.join(dir,'files'));safeDir(path.join(dir,'pending'));return dir;}
 const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 function atomic(file,value){const tmp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
 const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
 function envelope(v,max=65536){return keys(v,['iv','data'])&&typeof v.iv==='string'&&/^[A-Za-z0-9+/]{16}$/.test(v.iv)&&typeof v.data==='string'&&v.data.length>=24&&v.data.length<=max&&/^[A-Za-z0-9+/]+={0,2}$/.test(v.data);}
 function config(v){return keys(v,['version','vaultId','kdf','passwordWrap','recoveryWrap','recoverySecret','authorityWrap'])&&[1,2].includes(v.version)&&(v.version===1?!v.authorityWrap:keys(v.authorityWrap,['version','algorithm','keyId','data'])&&v.authorityWrap.version===1&&v.authorityWrap.algorithm==='RSA-OAEP-SHA256'&&/^[a-f0-9]{64}$/.test(v.authorityWrap.keyId)&&typeof v.authorityWrap.data==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(v.authorityWrap.data)&&v.authorityWrap.data.length===684)&&typeof v.vaultId==='string'&&ID.test(v.vaultId)&&keys(v.kdf,['name','iterations','salt'])&&v.kdf.name==='PBKDF2-SHA256'&&v.kdf.iterations===600000&&typeof v.kdf.salt==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(v.kdf.salt)&&envelope(v.passwordWrap,256)&&envelope(v.recoveryWrap,256)&&envelope(v.recoverySecret,256);}
 function manifest(v){return keys(v,['version','id','chunks','chunkBytes','metadata'])&&v.version===1&&typeof v.id==='string'&&ID.test(v.id)&&v.chunkBytes===CHUNK&&Number.isInteger(v.chunks)&&v.chunks>=1&&v.chunks<=16384&&envelope(v.metadata,32768);}
 const router=express.Router();router.use(requireAuth,(req,res,next)=>{
  res.set('Cache-Control','private, no-store').set('Pragma','no-cache');
  if(process.env.JMH_SERVER_TYPE==='nas'&&!req.secure)return res.status(426).json({error:'Le coffre exige une connexion HTTPS. Ouvre JMH avec son adresse HTTPS privée.'});
  try{req.vaultDir=reserve(req.session.user.id);next();}catch{res.status(503).json({error:'Le stockage privé ne peut pas être ouvert.'});}
 });
 router.get('/supervision',(req,res)=>res.json(supervisionPolicy()));
 router.get('/status',(req,res)=>res.json({configured:fs.existsSync(path.join(req.vaultDir,'config.json')),name:'Sensible'}));
 router.get('/config',(req,res)=>{try{const value=json(path.join(req.vaultDir,'config.json'));res.json({config:value,revision:digest(value)});}catch{res.status(404).json({error:'Configure d’abord ton coffre.'});}});
 router.put('/config',(req,res)=>{
  const value=req.body?.config,file=path.join(req.vaultDir,'config.json');if(!config(value))return res.status(400).json({error:'Configuration chiffrée invalide.'});
  try{
   const existing=fs.existsSync(file)?json(file):null;if(value.version===2&&existing?.version!==2&&req.body?.supervisionConsent!==true)return res.status(400).json({error:'Confirme explicitement que le Propriétaire pourra lire et modérer ce coffre.'});
   if(value.version===2&&!validateSupervised(value))return res.status(400).json({error:'La clé de supervision ne correspond pas au coffre.'});
   if(!fs.existsSync(file)&&supervisionPolicy().required&&value.version!==2)return res.status(409).json({error:'Les nouveaux coffres doivent être supervisés. Termine la configuration du Propriétaire.'});
   if(fs.existsSync(file)){const old=json(file);if(old.version===2&&(value.version!==2||JSON.stringify(old.authorityWrap)!==JSON.stringify(value.authorityWrap)))return res.status(409).json({error:'La supervision de ce coffre ne peut pas être retirée ou remplacée.'});if(req.body.revision!==digest(old)||old.vaultId!==value.vaultId||JSON.stringify(old.recoveryWrap)!==JSON.stringify(value.recoveryWrap)||JSON.stringify(old.recoverySecret)!==JSON.stringify(value.recoverySecret))return res.status(409).json({error:'Le coffre a changé sur un autre appareil. Déverrouille-le à nouveau.'});}
   else if(req.body.revision)return res.status(409).json({error:'Le coffre a changé.'});
   atomic(file,value);res.json({ok:true,revision:digest(value)});
  }catch{res.status(500).json({error:'La configuration du coffre n’a pas pu être enregistrée.'});}
 });
 router.use((req,res,next)=>{
  if(!/^\/files(?:\/|$)/i.test(req.path))return next();
  try{const file=path.join(req.vaultDir,'config.json');if(supervisionPolicy().required&&(!fs.existsSync(file)||json(file).version!==2))return res.status(423).json({error:'Accès au coffre bloqué : accepte la supervision du Propriétaire, puis déverrouille ton coffre avec ton mot de passe habituel.',supervisionRequired:true});next();}
  catch{res.status(503).json({error:'Le statut de supervision du coffre ne peut pas être vérifié.'});}
 });
 router.get('/files',async(req,res)=>{
  try{const items=[];for(const entry of await fs.promises.readdir(path.join(req.vaultDir,'files'),{withFileTypes:true})){if(!entry.isDirectory()||entry.isSymbolicLink()||!ID.test(entry.name))continue;const value=json(path.join(req.vaultDir,'files',entry.name,'manifest.json'));if(manifest(value))items.push({...value,...(vaultModeration(req.session.user.id,value.id)?{moderation:{id:vaultModeration(req.session.user.id,value.id).id,reason:vaultModeration(req.session.user.id,value.id).reason}}:{})});}res.json(items);}catch{res.status(500).json({error:'La liste chiffrée ne peut pas être lue.'});}
 });
 router.post('/files',(req,res)=>{
  if(!fs.existsSync(path.join(req.vaultDir,'config.json')))return res.status(409).json({error:'Configure d’abord ton coffre.'});
  if(!manifest(req.body))return res.status(400).json({error:'Import chiffré invalide.'});
  const dir=path.join(req.vaultDir,'pending',req.body.id);
  try{if(fs.existsSync(path.join(req.vaultDir,'files',req.body.id)))return res.status(409).json({error:'Cet import existe déjà.'});if(fs.readdirSync(path.join(req.vaultDir,'pending')).length>=100)return res.status(429).json({error:'Trop d’imports interrompus. Contacte le support sans fournir tes clés.'});fs.mkdirSync(dir,{mode:0o700});atomic(path.join(dir,'manifest.json'),req.body);res.status(201).json({ok:true});}catch(error){res.status(error.code==='EEXIST'?409:500).json({error:'Cet import n’a pas pu être préparé.'});}
 });
 function locate(req,pending=false){if(!ID.test(req.params.id))throw Error('Identifiant invalide.');const dir=path.join(req.vaultDir,pending?'pending':'files',req.params.id);if(fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)throw Error('Chemin invalide.');const m=json(path.join(dir,'manifest.json'));if(!manifest(m))throw Error('Manifeste invalide.');return{dir,m};}
 function number(req,m){if(!/^(0|[1-9][0-9]*)$/.test(req.params.chunk))throw Error('Bloc invalide.');const n=Number(req.params.chunk);if(n>=m.chunks)throw Error('Bloc invalide.');return n;}
 router.put('/files/:id/chunks/:chunk',express.raw({type:'application/octet-stream',limit:CHUNK+16,inflate:false}),(req,res)=>{
  try{const {dir,m}=locate(req,true),n=number(req,m),bytes=req.body;if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>CHUNK+16||n<m.chunks-1&&bytes.length!==CHUNK+16)return res.status(400).json({error:'Bloc chiffré incomplet.'});const space=fs.statfsSync(dir);if(space.bavail*space.bsize<4*1024**3)return res.status(507).json({error:'Le NAS conserve une réserve de sécurité. Libère de l’espace avant cet import.'});fs.writeFileSync(path.join(dir,n+'.bin'),bytes,{flag:'wx',mode:0o600});res.json({ok:true});}catch(e){res.status(e.code==='EEXIST'?409:400).json({error:'Bloc chiffré non enregistré.'});}
 });
 router.post('/files/:id/commit',async(req,res)=>{
  try{const {dir,m}=locate(req,true);for(let n=0;n<m.chunks;n++){const st=await fs.promises.lstat(path.join(dir,n+'.bin'));if(!st.isFile()||st.isSymbolicLink()||st.size<16||st.size>CHUNK+16||n<m.chunks-1&&st.size!==CHUNK+16)throw Error();}const target=path.join(req.vaultDir,'files',req.params.id);if(fs.existsSync(target))return res.status(409).json({error:'Cet import est déjà terminé.'});fs.renameSync(dir,target);res.json({ok:true});}catch{res.status(400).json({error:'Import incomplet. Aucun fichier en clair n’a été enregistré.'});}
 });
 router.get('/files/:id/chunks/:chunk',(req,res)=>{
  const rule=vaultModeration(req.session.user.id,req.params.id);if(rule)return res.status(451).json({error:'Cet élément du coffre supervisé a été censuré par le Propriétaire. '+rule.reason});
  try{const {dir,m}=locate(req),n=number(req,m);res.type('application/octet-stream').set('Content-Disposition','attachment').sendFile(path.join(dir,n+'.bin'),error=>{if(error&&!res.headersSent)res.status(404).end();});}catch{res.status(404).json({error:'Bloc introuvable dans ton coffre.'});}
 });
 router.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.type==='entity.too.large'?413:400).json({error:'Le bloc chiffré ne peut pas être reçu.'});});
 return{router,reserve};
}
module.exports={createPrivateVault,CHUNK};
