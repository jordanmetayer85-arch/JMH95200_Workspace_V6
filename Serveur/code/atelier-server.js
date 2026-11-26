'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createAtelierService}=require('./atelier-service');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function createAtelierRouter({express,runtime,requireAuth,requirePermission,requireAdmin,readUsers,eligibleUser,service=createAtelierService({runtime}),now=()=>Date.now()}){
 const router=express.Router(),directory=path.join(runtime,'atelier'),devicesFile=path.join(directory,'devices.json'),pending=new Map(),limits=new Map();
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 function devices(){try{return JSON.parse(fs.readFileSync(devicesFile,'utf8'));}catch(e){if(e.code==='ENOENT')return[];throw e;}}
 function saveDevices(value){const active=value.filter(d=>!d.revoked&&d.expiresAt>now()),history=value.filter(d=>d.revoked||d.expiresAt<=now()).sort((a,b)=>b.createdAt-a.createdAt).slice(0,300);if(active.length>5000)throw Error('Limite globale d’appareils atteinte.');const temp=devicesFile+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(temp,JSON.stringify([...active,...history]),{mode:0o600,flag:'wx'});fs.renameSync(temp,devicesFile);}
 router.use((req,res,next)=>{if(process.env.JMH_SERVER_TYPE==='nas'&&!req.secure)return res.status(426).json({error:'Atelier IA exige une connexion HTTPS au NAS.'});res.set('Cache-Control','no-store');next();});
 const allowed=requirePermission('canUsePcTools');
 function session(req,res,next){requireAuth(req,res,()=>allowed(req,res,next));}
 function limit(id,max=25){const time=now();for(const [key,r]of limits)if(r.until<=time)limits.delete(key);const r=limits.get(id)||{count:0,until:time+60000};if(r.count>=max)return false;if(limits.size>=5000&&!limits.has(id))return false;r.count++;limits.set(id,r);return true;}
 function inferenceAuth(req,res,next){
  if(!limit('authentication:'+req.ip,300))return res.status(429).json({error:'Trop de demandes. Réessaie dans une minute.'});const header=req.get('authorization')||'';
  if(!header)return session(req,res,next);
  if(!/^Bearer [a-f0-9]{64}$/.test(header))return res.status(401).json({error:'Connecte cet ordinateur depuis JMH.'});
  const tokenHash=hash(header.slice(7)),device=devices().find(d=>d.tokenHash===tokenHash&&!d.revoked&&d.expiresAt>now());
  const user=device&&readUsers().find(u=>String(u.id)===device.userId);
  if(!user||!eligibleUser(user)||Number(user.authVersion||0)!==device.authVersion)return res.status(401).json({error:'L’autorisation de cet ordinateur a expiré ou a été retirée. Reconnecte-le depuis JMH.'});
  req.atelierUser=user;req.atelierDevice=device;next();
 }
 function identity(req){return String((req.atelierUser||req.session.user).id);}
 async function relay(req,res,route,body){if(!limit('inference:'+identity(req)))return res.status(429).set('Retry-After','60').json({error:{message:'Trop de demandes IA. Attends une minute.',type:'rate_limit_error'}});const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),180000);res.once('close',()=>abort.abort());let release;
  try{const upstream=await service.request(route,body,abort.signal);release=upstream.release;const r=upstream.response;res.status(r.status);res.set('Content-Type',r.headers.get('content-type')||'application/json');res.set('Cache-Control','no-store');if(r.headers.get('retry-after'))res.set('Retry-After',r.headers.get('retry-after'));for await(const part of r.body){if(res.destroyed)break;res.write(part);}res.end();}catch(e){if(!res.headersSent)res.status(e.status||502).json({error:{message:e.status===429?e.message:'Le moteur IA ne répond pas. Réessaie dans quelques instants.',type:e.status===429?'rate_limit_error':'api_error'}});else res.end();}finally{clearTimeout(timer);release?.();}
 }
 router.get('/status',session,(req,res)=>res.json({...service.status(),canManage:req.session.user.role==='admin',connections:[{provider:'gemini',name:'Gemini partagé par le NAS',active:service.status().installed}]}));
 router.post('/start',session,async(req,res)=>{try{await service.start();res.json({ok:true,...service.status()});}catch(e){res.status(503).json({error:e.message});}});
 router.post('/chat',session,(req,res)=>{let messages;try{messages=require('./atelier-chat-input').normalizeChatMessages(req.body?.messages);}catch(e){return res.status(400).json({error:e.message});}return relay(req,res,'/v1/chat/completions',{messages:require('./atelier-chat-input').withSystemPrompt(messages),model:service.model,stream:true,max_tokens:4096});});
 async function createImage(req,res){
  const prompt=typeof req.body?.prompt==='string'?req.body.prompt.trim():'';if(!prompt||prompt.length>2000)return res.status(400).json({error:'Décris l’image en 2000 caractères au maximum.'});
  if(!limit('image:'+identity(req),6))return res.status(429).set('Retry-After','60').json({error:'Trop d’images demandées. Attends une minute.'});
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),150000);res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  try{const result=await service.image(prompt,abort.signal);
   if(result.images.length)return res.json({images:result.images.slice(0,4).map(i=>({mime:i.mime,data:i.base64})),text:result.text||'',model:result.model});
   console.error('Atelier image : aucune image',JSON.stringify(result.attempts));
   const quota=result.attempts.some(a=>a.status===429||/quota|RESOURCE_EXHAUSTED|billing|free tier/i.test(a.error));const safety=result.attempts.some(a=>/safety|blocked|SAFETY|PROHIBITED|policy/i.test(a.error));
   res.status(quota?429:safety?422:502).json({error:safety?'Le service d’images a refusé cette demande (filtre de sécurité). Reformule ta description.':quota?'Le service d’images gratuit est saturé pour le moment. Réessaie dans une minute.':'Le service d’images ne répond pas pour le moment. Réessaie dans quelques instants.',attempts:req.session?.user?.role==='admin'||req.atelierUser?.role==='admin'?result.attempts:undefined});}
  catch(e){if(!res.headersSent)res.status(e.status||502).json({error:e.status===429?e.message:'Le moteur IA ne répond pas. Réessaie dans quelques instants.'});}
  finally{clearTimeout(timer);}
 }
 router.post('/image',session,createImage);
 router.post('/inference/v1/images',inferenceAuth,createImage);
 router.post('/gemini',session,requireAdmin,async(req,res)=>{if(req.body?.freeOnly!==true||typeof req.body.key!=='string'||!/^AIza[\w-]{20,100}$/.test(req.body.key.trim()))return res.status(400).json({error:'Utilise une clé Gemini valide provenant de ton projet sans facturation.'});try{await service.management('/api/providers','POST',{provider:'gemini',name:'Gemini NAS partagé',apiKey:req.body.key.trim(),priority:1});res.json({ok:true,message:'La connexion Gemini est enregistrée sur le NAS.'});}catch{res.status(502).json({error:'La connexion Gemini n’a pas pu être enregistrée.'});}});
 router.post('/devices/pair',session,(req,res)=>{
  if(!limit('pair:'+req.session.user.id,10))return res.status(429).json({error:'Attends une minute avant de connecter un autre appareil.'});for(const [key,item]of pending)if(item.expiresAt<=now())pending.delete(key);if(pending.size>=256)return res.status(429).json({error:'Trop de connexions en préparation.'});
  const code=crypto.randomBytes(32).toString('hex'),userId=String(req.session.user.id),expiresAt=now()+120000,current=readUsers().find(u=>String(u.id)===userId);if(!current||!eligibleUser(current))return res.status(403).json({error:'Compte non autorisé.'});pending.set(hash(code),{userId,authVersion:Number(current.authVersion||0),expiresAt});res.json({code,expiresAt});
 });
 router.post('/devices/claim',(req,res)=>{
  if(!limit('claim:'+req.ip,30))return res.status(429).json({error:'Trop de tentatives.'});const code=req.body?.code;if(typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))return res.status(400).json({error:'Code de connexion invalide.'});const codeHash=hash(code),pendingDevice=pending.get(codeHash);pending.delete(codeHash);if(!pendingDevice||pendingDevice.expiresAt<=now())return res.status(401).json({error:'Le code a expiré. Recommence depuis JMH.'});const user=readUsers().find(u=>String(u.id)===pendingDevice.userId);if(!user||!eligibleUser(user)||Number(user.authVersion||0)!==pendingDevice.authVersion)return res.status(403).json({error:'Compte non autorisé.'});
  const all=devices();if(typeof req.body.replaceId==='string'){const old=all.find(d=>d.id===req.body.replaceId&&d.userId===pendingDevice.userId);if(old)old.revoked=true;}if(all.filter(d=>d.userId===pendingDevice.userId&&!d.revoked&&d.expiresAt>now()).length>=20)return res.status(409).json({error:'Retire un ancien appareil avant d’en connecter un autre.'});
  const token=crypto.randomBytes(32).toString('hex'),id=crypto.randomBytes(16).toString('hex'),name=String(req.body.name||'Mon ordinateur').replace(/[\u0000-\u001f]/g,'').slice(0,70),expiresAt=now()+7*24*3600000;
  if(typeof req.body.replaceId==='string'){const old=all.find(d=>d.id===req.body.replaceId&&d.userId===pendingDevice.userId);if(old)old.revoked=true;}
  all.push({id,userId:pendingDevice.userId,authVersion:pendingDevice.authVersion,name,tokenHash:hash(token),createdAt:now(),expiresAt,revoked:false});saveDevices(all);res.json({id,token,expiresAt,userId:pendingDevice.userId,username:user.username,model:service.model});
 });
 router.get('/devices',session,(req,res)=>res.json({devices:devices().filter(d=>d.userId===String(req.session.user.id)).map(({id,name,createdAt,expiresAt,revoked})=>({id,name,createdAt,expiresAt,revoked}))}));
 router.post('/devices/:id/revoke',session,(req,res)=>{const all=devices(),device=all.find(d=>d.id===req.params.id&&d.userId===String(req.session.user.id));if(!device)return res.status(404).json({error:'Appareil introuvable.'});device.revoked=true;saveDevices(all);res.json({ok:true});});
 router.get('/inference/status',inferenceAuth,(req,res)=>res.json({ok:true,...service.status()}));
 router.get('/inference/v1/models',inferenceAuth,(req,res)=>res.json({object:'list',data:[{id:service.model,object:'model',owned_by:'google'}]}));
 router.post('/inference/v1/messages',inferenceAuth,(req,res)=>{if(!Array.isArray(req.body?.messages)||req.body.messages.length>150)return res.status(400).json({error:'Demande invalide.'});return relay(req,res,'/v1/messages',req.body);});
 router.post('/inference/v1/chat/completions',inferenceAuth,(req,res)=>{if(!Array.isArray(req.body?.messages)||req.body.messages.length>150)return res.status(400).json({error:'Demande invalide.'});return relay(req,res,'/v1/chat/completions',req.body);});
 router.get('/connector/windows',session,(req,res)=>{const file=path.join(directory,'downloads','Atelier-IA-Connecteur-Windows.exe');if(!fs.existsSync(file))return res.status(503).json({error:'Le connecteur est en préparation.'});res.download(file,'Atelier-IA-Connecteur-Windows.exe');});
 return {router,service};
}
module.exports={createAtelierRouter};
