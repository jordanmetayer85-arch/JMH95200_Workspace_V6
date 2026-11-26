'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),https=require('node:https'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{pinnedAgent,normalizePin}=require('./nas-transport.cjs');
function inferenceRoute(method,url){
 const route=url==='/v1/messages?beta=true'?'/v1/messages':url;
 return route==='/v1/models'&&method==='GET'||['/v1/messages','/v1/chat/completions'].includes(route)&&method==='POST'?route:null;
}
function createNasBridge(root,{port=20128}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Port local invalide.');
 const file=path.join(root,'data','nas-connection.json');let cache=null,stamp=0,relay=null;
 function crypt(mode,text){return execFileSync(path.join(root,'AtelierSecrets.exe'),[mode],{input:text,encoding:'utf8',windowsHide:true,maxBuffer:16384}).trim();}
 function profile(){if(!fs.existsSync(file))return null;const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('La connexion NAS locale est invalide.');if(cache&&stamp===stat.mtimeMs)return cache;const p=JSON.parse(fs.readFileSync(file,'utf8'));const url=new URL(p.serverUrl);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Adresse HTTPS NAS invalide.');p.tlsPin=normalizePin(p.tlsPin);p.token=crypt('unprotect',p.protectedToken);if(!/^[a-f0-9]{64}$/.test(p.token))throw Error('Autorisation NAS invalide.');cache=p;stamp=stat.mtimeMs;return p;}
 function connect(config,route,method='GET',body,timeout=180000,signal){return new Promise((resolve,reject)=>{
  const url=new URL(route,config.serverUrl),bytes=body?Buffer.from(JSON.stringify(body)):null;
  const request=https.request(url,{method,signal,agent:pinnedAgent(config.tlsPin),headers:{Accept:'application/json','Content-Type':'application/json',...(config.token?{Authorization:'Bearer '+config.token}:{}),...(bytes?{'Content-Length':bytes.length}:{})}},resolve);
  request.once('error',reject);request.setTimeout(timeout,()=>request.destroy(Error('Le NAS ne répond pas.')));if(bytes)request.write(bytes);request.end();
 });}
 async function json(config,route,body){const r=await connect(config,route,body?'POST':'GET',body,30000);let text='';for await(const b of r){text+=b;if(text.length>65536){r.destroy();throw Error('Réponse NAS trop volumineuse.');}}let result;try{result=JSON.parse(text);}catch{throw Error('Le NAS a renvoyé une réponse invalide.');}if(r.statusCode<200||r.statusCode>=300)throw Error(typeof result.error==='string'?result.error:result.error?.message||'Reconnecte cet ordinateur depuis JMH.');return result;}
 async function pair(value){const url=new URL(String(value.serverUrl));if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Utilise l’adresse HTTPS du NAS.');const pin=normalizePin(value.tlsPin);if(typeof value.code!=='string'||!/^[a-f0-9]{64}$/.test(value.code))throw Error('Code de connexion invalide.');const previous=profile();const result=await json({serverUrl:url.origin,tlsPin:pin},'/api/atelier/devices/claim',{code:value.code,name:os.hostname(),replaceId:previous?.serverUrl===url.origin?previous.id:undefined});if(!/^[a-f0-9]{64}$/.test(result.token)||value.userId&&String(value.userId)!==String(result.userId))throw Error('Le compte de connexion ne correspond pas.');const saved={serverUrl:url.origin,tlsPin:pin,id:result.id,userId:String(result.userId),username:result.username,expiresAt:result.expiresAt,protectedToken:crypt('protect',result.token)};const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(saved),{mode:0o600});fs.renameSync(temp,file);cache=null;stamp=0;return {ok:true,username:saved.username,expiresAt:saved.expiresAt};}
 async function status(){const p=profile();if(!p)return null;const result=await json(p,'/api/atelier/inference/status');return {...result,username:p.username,serverUrl:p.serverUrl,expiresAt:p.expiresAt};}
 async function image(prompt,signal){const p=profile();if(!p)throw Error('Connecte Atelier IA depuis JMH pour partager la création d’images du NAS.');const response=await connect(p,'/api/atelier/inference/v1/images','POST',{prompt},180000,signal);const result=await require('./anthropic-stream.cjs').readJson(response,17*1024*1024);if(response.statusCode<200||response.statusCode>=300){const error=Error(typeof result.error==='string'?result.error:'La création d’images est indisponible.');error.status=response.statusCode;throw error;}return result;}
 function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
 async function startRelay(apiKey){if(relay)return;const candidate=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');if(req.headers.host!=='127.0.0.1:'+candidate.address().port||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){res.writeHead(403);return res.end();}
  const key=req.headers['x-api-key']||String(req.headers.authorization||'').replace(/^Bearer /,'');if(!equal(key,apiKey)){res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{message:'Accès local refusé.',type:'authentication_error'}}));}
  const route=inferenceRoute(req.method,req.url);if(!route){res.writeHead(404);return res.end();}
  try{const p=profile();if(!p)throw Error('Connecte cet ordinateur depuis JMH.');let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>16*1024*1024)throw Error('La demande est trop volumineuse.');chunks.push(b);}const body=size?JSON.parse(Buffer.concat(chunks).toString()):undefined;
   const complete=route==='/v1/messages'&&body?.stream===true;
   const abort=new AbortController();res.once('close',()=>abort.abort());
   const upstream=await connect(p,'/api/atelier/inference'+route,req.method,complete?{...body,stream:false}:body,180000,abort.signal);
   if(complete&&upstream.statusCode>=200&&upstream.statusCode<300){const {readJson,messageEvents}=require('./anthropic-stream.cjs');const events=messageEvents(await readJson(upstream));res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8'});res.end(events);}
   else{res.writeHead(upstream.statusCode,{'Content-Type':upstream.headers['content-type']||'application/json',...(upstream.headers['retry-after']?{'Retry-After':upstream.headers['retry-after']}:{})});upstream.pipe(res);}
  }catch(e){if(res.destroyed)return;if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:e.message,type:'api_error'}}));}else res.end();}
 });await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(port,'127.0.0.1',resolve);});relay=candidate;}
 async function closeRelay(){if(!relay)return;const old=relay;relay=null;old.closeAllConnections();await new Promise(r=>old.close(r));}
 return{hasProfile:()=>fs.existsSync(file),profile,pair,status,image,startRelay,closeRelay,origin:()=>relay?'http://127.0.0.1:'+relay.address().port:null};
}
module.exports={createNasBridge,inferenceRoute};
