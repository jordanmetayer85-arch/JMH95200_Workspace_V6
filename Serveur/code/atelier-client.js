'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {execFile}=require('node:child_process');
function createAtelierClient({documents,fetchPair,context}){
 const root=path.join(documents,'Atelier IA','Application');let launching=false,owner=null;
 const updater=require('./atelier-update').createConnectorUpdater({root});
 function installed(){return['node.exe','AtelierSecrets.exe','connect-and-launch.cjs','app.cjs','desktop-agent.cjs'].every(name=>{try{const stat=fs.lstatSync(path.join(root,name));return stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}});}
 function identity(ctx,event){return String(ctx.user.id)+'\n'+ctx.base+'\n'+event.sender.id;}
 function local(route,body,timeout=25000){return new Promise((resolve,reject)=>{
  let key;try{key=JSON.parse(fs.readFileSync(path.join(root,'data','secrets.json'))).launcher;if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error();}catch{return reject(Error('Ouvre le connecteur Atelier IA à jour.'));}
  const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));if(bytes&&bytes.length>8*1024*1024)return reject(Error('Les pièces jointes dépassent la limite de 7 Mo.'));
  const request=http.request('http://127.0.0.1:20127/api/desktop/'+route,{method:bytes?'POST':'GET',headers:{'X-Atelier-Key':key,Origin:'http://127.0.0.1:20127',...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{})}},response=>{
   let text='';response.on('data',b=>{text+=b;if(text.length>1024*1024)request.destroy(Error('Réponse locale trop volumineuse.'));});response.once('error',reject);response.on('end',()=>{try{const value=JSON.parse(text);if(response.statusCode!==200)throw Error(value.error||'Le connecteur local a refusé l’action.');resolve(value);}catch(e){reject(e);}});
  });request.once('error',reject);request.setTimeout(timeout,()=>request.destroy(Error('Le connecteur local ne répond pas.')));request.end(bytes);
 });}
 async function launch(event,value){
  if(launching)return{ok:false,error:'Connexion de l’ordinateur déjà en cours.'};const ctx=await context(event);if(!ctx)return{ok:false,error:'L’administrateur doit autoriser les outils du PC.'};
  if(process.platform!=='win32')return{ok:false,error:'Le pilotage visuel nécessite le connecteur Windows. La discussion reste disponible sur cet appareil.'};
  if(!['code','desktop'].includes(value?.mode)||value.mode==='desktop'&&value.captureConsent!==true)return{ok:false,error:'Confirme le mode et l’envoi des captures pour cette session.'};
  const project=String(value.project||'Mon premier projet').trim();if(!/^[\p{L}\p{N} _-]{1,70}$/u.test(project))return{ok:false,error:'Choisis un nom de projet simple.'};
  if(launching)return{ok:false,error:'Connexion de l’ordinateur déjà en cours.'};launching=true;let requestFile;
  try{
   await updater.update();if(!installed())throw Error('Installe le nouveau connecteur Windows proposé dans cette page, puis réessaie.');
   if(owner&&owner!==identity(ctx,event))await local('stop',{});
   const pair=await fetchPair(ctx);requestFile=path.join(root,'data','jmh-pair-'+crypto.randomBytes(12).toString('hex')+'.json');fs.mkdirSync(path.dirname(requestFile),{recursive:true});
   fs.writeFileSync(requestFile,JSON.stringify({...pair,mode:value.mode,project,captureConsent:value.captureConsent===true,userId:String(ctx.user.id)}),{flag:'wx',mode:0o600});
   await new Promise((resolve,reject)=>execFile(path.join(root,'node.exe'),[path.join(root,'connect-and-launch.cjs'),requestFile],{cwd:root,windowsHide:true,timeout:100000,maxBuffer:32768},(error,stdout,stderr)=>error?reject(Error((stderr||'Le connecteur ne répond pas.').trim().slice(0,300))):resolve()));
   if(!await context(event)){await local('stop',{}).catch(()=>{});throw Error('La connexion JMH a expiré.');}owner=identity(ctx,event);return{ok:true,desktop:value.mode==='desktop'};
  }catch(e){return{ok:false,error:e.message};}finally{launching=false;if(requestFile)try{fs.unlinkSync(requestFile);}catch{}}
 }
 async function command(event,operation,value){
  try{
   if(!['status','chat','approve','reset','cancel','stop'].includes(operation))throw Error('Commande de pilotage inconnue.');
   const ctx=await context(event);if(!ctx){if(owner&&owner.endsWith('\n'+event.sender.id)){await local('stop',{}).catch(()=>{});owner=null;}throw Error('Connecte-toi avec un compte autorisé.');}
   if(!owner||owner!==identity(ctx,event)){if(operation==='status')return{ok:true,desktopActive:false,desktopBusy:false,desktopApproval:null};throw Error('Démarre le pilotage depuis ce compte JMH.');}
   const profile=JSON.parse(fs.readFileSync(path.join(root,'data','nas-connection.json'),'utf8'));if(String(profile.userId)!==String(ctx.user.id)||profile.serverUrl!==ctx.base){await local('stop',{}).catch(()=>{});owner=null;throw Error('La connexion locale a changé de compte. Relance le pilotage.');}
   const result=await local(operation,operation==='status'?undefined:value||{},operation==='chat'?260000:25000);if(operation==='stop')owner=null;return{ok:true,...result};
  }catch(e){return{ok:false,error:e.message};}
 }
 return{launch,stop:event=>command(event,'stop',{}),command,installed};
}
module.exports={createAtelierClient};
