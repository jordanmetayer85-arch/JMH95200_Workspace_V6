'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function sessionSecret(directory,configured){
 if(configured)return configured;
 const file=path.join(directory,'session-secret.key');
 try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Clé de session invalide.');const key=fs.readFileSync(file,'utf8').trim();if(!/^[a-f0-9]{96}$/.test(key))throw Error('Clé de session invalide.');return key;}catch(e){if(e.code!=='ENOENT')throw e;}
 const key=crypto.randomBytes(48).toString('hex');fs.writeFileSync(file,key,{flag:'wx',mode:0o600});return key;
}
function createRequestSecurity(){
 const attempts=new Map(),period=10*60*1000,limit=20;
 function headers(req,res,next){res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');res.set('X-Frame-Options','SAMEORIGIN');res.set('Cross-Origin-Resource-Policy','same-origin');res.set('Permissions-Policy','camera=(), microphone=(self), geolocation=(), usb=(), fullscreen=(self)');res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' https://api4.ipify.org https://api.ipify.org; font-src 'self' data:; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'");if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');next();}
 function sameOrigin(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const origin=req.get('origin');if(req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Cette demande provient d’un autre site.'});
  if(origin){try{const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||u.host!==req.get('host'))throw Error();}catch{return res.status(403).json({error:'Origine de la demande refusée.'});}}
  next();
 }
 function loginLimit(req,res,next){const now=Date.now();for(const [key,value]of attempts){if(value.until<=now)attempts.delete(key);}const key=req.ip,record=attempts.get(key)||{count:0,until:now+period};if(record.count>=limit){res.set('Retry-After',String(Math.ceil((record.until-now)/1000)));return res.status(429).json({error:'Trop de tentatives. Réessaie dans quelques minutes.'});}if(attempts.size>=10000&&!attempts.has(key))return res.status(429).json({error:'Trop de tentatives. Réessaie dans quelques minutes.'});record.count++;attempts.set(key,record);res.once('finish',()=>{if(res.statusCode===200)attempts.delete(key);});next();}
 return{headers,sameOrigin,loginLimit};
}
module.exports={sessionSecret,createRequestSecurity};
