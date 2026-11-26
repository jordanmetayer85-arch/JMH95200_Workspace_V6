'use strict';
// Atelier IA — small local launcher for the official OmniRoute distribution.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const nasBridge=require('./nas-bridge.cjs').createNasBridge(__dirname);
const ROOT=__dirname, DATA=path.join(ROOT,'data'), ORIGIN='http://127.0.0.1:20127', GATEWAY='http://127.0.0.1:20128';
fs.mkdirSync(DATA,{recursive:true});
const secretFile=path.join(DATA,'secrets.json');
if(!fs.existsSync(secretFile))fs.writeFileSync(secretFile,JSON.stringify({launcher:crypto.randomBytes(32).toString('hex'),JWT_SECRET:crypto.randomBytes(48).toString('hex'),API_KEY_SECRET:crypto.randomBytes(32).toString('hex'),STORAGE_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),INITIAL_PASSWORD:crypto.randomBytes(32).toString('base64url'),OMNIROUTE_API_KEY:'sk-atelier-'+crypto.randomBytes(32).toString('hex')}),{flag:'wx'});
const secrets=JSON.parse(fs.readFileSync(secretFile,'utf8'));
const desktopAgent=require('./desktop-agent.cjs').createDesktopAgent({root:ROOT,
 environment:model=>{const env={...process.env,ANTHROPIC_BASE_URL:GATEWAY,ANTHROPIC_AUTH_TOKEN:secrets.OMNIROUTE_API_KEY,ANTHROPIC_MODEL:model,ANTHROPIC_DEFAULT_OPUS_MODEL:model,ANTHROPIC_DEFAULT_SONNET_MODEL:model,ANTHROPIC_DEFAULT_HAIKU_MODEL:model,CLAUDE_CONFIG_DIR:require('./claude-profile.cjs').profileFor(ROOT,'desktop'),ENABLE_TOOL_SEARCH:'false',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};delete env.ANTHROPIC_API_KEY;return env;},
 connected:async()=>ready&&(await connections()).some(c=>c.active&&c.provider==='gemini'),
 models:async()=>{const r=await fetch(GATEWAY+'/v1/models',{headers:{Authorization:'Bearer '+secrets.OMNIROUTE_API_KEY},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Impossible de récupérer les modèles Gemini.');const d=await r.json();return(d.data||[]).map(m=>m.id).filter(id=>/^gemini\//i.test(id)).sort((a,b)=>Number(b.includes('3.1-flash-lite'))-Number(a.includes('3.1-flash-lite')));}
});
const startDesktop=body=>desktopAgent.start(body),stopDesktop=()=>desktopAgent.stop(),resetDesktop=()=>desktopAgent.reset();
async function desktopChat(body,res){const abort=new AbortController();const closed=()=>{if(!res.writableEnded)abort.abort();};res.once('close',closed);try{return json(res,200,await desktopAgent.chat(body,{signal:abort.signal}));}catch(e){if(!res.destroyed)return json(res,502,{error:e.message});}finally{res.removeListener('close',closed);}}

let gatewayProcess, ready=false, startupError='', stopping=false, sessionCookie='', sessionTime=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function safeEqual(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
async function readBody(req,max=65536){let n=0,parts=[];for await(const part of req){n+=part.length;if(n>max)throw new Error('La demande est trop volumineuse.');parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{throw new Error('Demande invalide.');}}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
async function login(){if(sessionCookie&&Date.now()-sessionTime<3600000)return sessionCookie;const r=await fetch(GATEWAY+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:GATEWAY},body:JSON.stringify({password:secrets.INITIAL_PASSWORD}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Le tableau de bord ne répond pas correctement. Réessaie dans quelques secondes.');sessionCookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');if(!sessionCookie)throw new Error('La session locale ne peut pas être ouverte.');sessionTime=Date.now();return sessionCookie;}
async function management(url,method='GET',body,retry=true){const cookie=await login();const r=await fetch(GATEWAY+url,{method,headers:{'Content-Type':'application/json',Cookie:cookie,Origin:GATEWAY},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});if(r.status===401&&retry){sessionCookie='';return management(url,method,body,false);}const result=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||'OmniRoute ne peut pas effectuer cette action.');return result;}
async function connections(){if(nasBridge.hasProfile()){const info=await nasBridge.status();return [{provider:'gemini',name:'Gemini partagé par le NAS · '+info.username,active:true,status:'active'}];}const data=await management('/api/providers');return (data.connections||data.providers||[]).map(p=>({name:p.name,provider:p.provider,active:p.isActive!==false,status:p.testStatus||'à tester'}));}
async function startGateway(){
 try{
  if(nasBridge.hasProfile()){await nasBridge.startRelay(secrets.OMNIROUTE_API_KEY);ready=true;startupError='';return;}
  if(fs.existsSync(path.join(ROOT,'connector-defaults.json'))&&!fs.existsSync(path.join(ROOT,'omniroute'))){startupError='Connecte cet ordinateur depuis JMH → Applications → Atelier IA après installation du client JMH à jour.';return;}
  // Refuse to attach to an unrelated process occupying the dedicated gateway port.
  await new Promise((resolve,reject)=>{const probe=http.createServer();probe.once('error',()=>reject(new Error('Le port 20128 est déjà utilisé. Ferme l’autre instance OmniRoute puis relance Atelier IA.')));probe.listen(20128,'127.0.0.1',()=>probe.close(resolve));});
  const log=fs.openSync(path.join(DATA,'omniroute.log'),'a');
  const env={...process.env,JWT_SECRET:secrets.JWT_SECRET,API_KEY_SECRET:secrets.API_KEY_SECRET,STORAGE_ENCRYPTION_KEY:secrets.STORAGE_ENCRYPTION_KEY,INITIAL_PASSWORD:secrets.INITIAL_PASSWORD,OMNIROUTE_API_KEY:secrets.OMNIROUTE_API_KEY,DATA_DIR:path.join(DATA,'omniroute'),PORT:'20128',HOSTNAME:'127.0.0.1',HOST:'127.0.0.1',OMNIROUTE_SERVER_HOST:'127.0.0.1',NEXT_PUBLIC_BASE_URL:GATEWAY,REQUIRE_API_KEY:'true',CLI_ALLOW_CONFIG_WRITES:'false',OMNIROUTE_AUTO_SYNC_CODEX_PROFILES:'false',OMNIROUTE_AUTO_SYNC_CLAUDE_PROFILES:'false',OMNIROUTE_CODEX_APPSERVER_AUTO_APPROVE:'false',NEXT_TELEMETRY_DISABLED:'1',ENABLE_REQUEST_LOGS:'false',FREE_PROXY_AUTO_SYNC_ENABLED:'false',OMNIROUTE_DISABLE_BACKGROUND_SERVICES:'true',ARENA_ELO_SYNC_ENABLED:'false',OPENROUTER_PROVIDER_STATS_ENABLED:'false',OMNIROUTE_SKIP_DNS_WRITE:'1',SKIP_ANTIGRAVITY_DNS:'true',OMNI_COMPRESSION_WORKERS:'1'};
  gatewayProcess=spawn(path.join(ROOT,'node.exe'),['--max-old-space-size=1024',path.join(ROOT,'gateway.cjs')],{cwd:path.join(ROOT,'omniroute'),env,windowsHide:true,stdio:['ignore',log,log,'ipc']});
  fs.closeSync(log);
  gatewayProcess.on('error',()=>{ready=false;startupError='Impossible de démarrer OmniRoute.';});
  gatewayProcess.on('exit',()=>{ready=false;if(!stopping)startupError='OmniRoute s’est arrêté. Ferme Atelier IA puis relance-le depuis le Bureau.';});
  for(let i=0;i<90;i++){await sleep(1000);if(gatewayProcess.exitCode!==null)throw new Error('Le moteur a rencontré une erreur au démarrage. Consulte le guide de dépannage.');try{const r=await fetch(GATEWAY+'/api/monitoring/health',{signal:AbortSignal.timeout(3000)});if(r.ok){await login();await management('/api/settings','PATCH',{hidePaidModels:true,excludeTosAvoid:true,credentialRedactionEnabled:true,cloudEnabled:false,mcpEnabled:false,a2aEnabled:false});ready=true;return;}}catch{}}
  throw new Error('Le démarrage prend trop de temps. Ferme Atelier IA et relance-le.');
 }catch(e){startupError=e.message;}
}
let chatBusy=false;
const {normalizeChatMessages}=require('./chat-input.cjs');
async function chat(body,res){
 if(chatBusy)return json(res,409,{error:'Une réponse est déjà en cours.'});
 let messages;try{messages=normalizeChatMessages(body.messages);}catch(e){return json(res,400,{error:e.message});}
 const available=await connections();if(!available.some(c=>c.active))return json(res,409,{error:'Connecte d’abord Gemini dans « Connexions ».'});
 chatBusy=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);res.on('close',()=>controller.abort());
 try{
  const r=await fetch(GATEWAY+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secrets.OMNIROUTE_API_KEY},body:JSON.stringify({model:body.mode==='code'?'auto/coding:free':'auto/best-free',messages:require('./chat-input.cjs').withSystemPrompt(messages),stream:true,max_tokens:2048}),signal:controller.signal});
  if(!r.ok){const detail=await r.text().catch(()=>'');return json(res,r.status===429?429:502,{error:r.status===429?'Le quota gratuit est atteint. Réessaie après son renouvellement, ou ajoute un autre fournisseur autorisé dans OmniRoute.':detail&&detail.length<500?'Le fournisseur a refusé la demande : '+detail:'Aucun modèle compatible n’est disponible pour cette demande. Vérifie la connexion, le modèle et le quota dans OmniRoute.'});}
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  for await(const part of r.body){if(res.destroyed)break;res.write(part);}res.end();
 }catch(e){if(!res.headersSent)json(res,504,{error:'La réponse a été interrompue ou a pris trop de temps. Tu peux réessayer.'});else res.end();}finally{clearTimeout(timeout);chatBusy=false;}
}
async function launchCode(body){
 if(body.desktop!==undefined&&typeof body.desktop!=='boolean')throw new Error('Mode de lancement invalide.');
 if(body.desktop===true)return startDesktop(body);
 if(!(await connections()).some(c=>c.active))throw new Error('Connecte d’abord Gemini.');
 const name=String(body.project||'Mon premier projet').trim();if(!/^[\p{L}\p{N} _-]{1,70}$/u.test(name)||name==='.'||name==='..')throw new Error('Utilise un nom de projet simple, avec des lettres, chiffres, espaces ou tirets.');
 const folder=path.join(process.env.USERPROFILE,'Documents','Atelier IA','Mes projets',name);fs.mkdirSync(folder,{recursive:true});
 const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File',path.join(ROOT,'coder.ps1'),'-ProjectPath',folder],{cwd:folder,detached:true,windowsHide:false,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new Error('Impossible d’ouvrir la fenêtre de commande.')));});child.unref();return {ok:true,folder,desktop:false};
}
const files={'/images.js':['images.js','text/javascript; charset=utf-8'],'/image-tools.css':['image-tools.css','text/css; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/logo.svg':['logo.svg','image/svg+xml'],'/guide.html':['guide.html','text/html; charset=utf-8'],'/pilotage.html':['pilotage.html','text/html; charset=utf-8'],'/demo.html':['demo.html','text/html; charset=utf-8'],'/demo.js':['demo.js','text/javascript; charset=utf-8'],'/dictation.js':['dictation.js','text/javascript; charset=utf-8'],'/desktop-approval.js':['desktop-approval.js','text/javascript; charset=utf-8']};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 if(req.headers.host!=='127.0.0.1:20127'||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return json(res,403,{error:'Accès local uniquement.'});
 const url=new URL(req.url,ORIGIN);
 if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{application:'atelier-ia',ready});
 if(files[url.pathname]&&req.method==='GET'){const [file,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return fs.createReadStream(path.join(ROOT,'public',file)).pipe(res);}
 if(!url.pathname.startsWith('/api/'))return json(res,404,{error:'Page introuvable.'});
 if(!safeEqual(req.headers['x-atelier-key'],secrets.launcher))return json(res,401,{error:'Ouvre Atelier IA depuis son icône sur le Bureau.'});
 if(req.method!=='GET'&&req.headers.origin!==ORIGIN)return json(res,403,{error:'Origine refusée.'});
 try{
  if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{ready,error:startupError,version:'1.3.0',gatewayVersion:'3.8.52',...desktopAgent.status(),connections:ready?await connections():[]});
  if(url.pathname==='/api/desktop/status'&&req.method==='GET')return json(res,200,desktopAgent.status());
  if(url.pathname==='/api/desktop/start'&&req.method==='POST')return json(res,200,await startDesktop(await readBody(req,2048)));
  if(url.pathname==='/api/desktop/chat'&&req.method==='POST')return await desktopChat(await readBody(req,8*1024*1024),res);
  if(url.pathname==='/api/desktop/reset'&&req.method==='POST'){await readBody(req,512);return json(res,200,await resetDesktop());}
  if(url.pathname==='/api/desktop/approve'&&req.method==='POST')return json(res,200,desktopAgent.approve(await readBody(req,1024)));
  if(url.pathname==='/api/desktop/cancel'&&req.method==='POST'){await readBody(req,512);await desktopAgent.cancel();return json(res,200,{ok:true});}
  if(url.pathname==='/api/desktop/stop'&&req.method==='POST'){await readBody(req,512);await stopDesktop();return json(res,200,{ok:true});}
  if(url.pathname==='/api/dictation'&&req.method==='POST'){const body=await readBody(req,512);if(body.consent!==true)return json(res,400,{error:'La dictée doit être demandée avec ton accord.'});if(process.platform!=='win32')return json(res,400,{error:'Utilise le microphone du clavier de cet appareil.'});await new Promise((resolve,reject)=>execFile(path.join(ROOT,'AtelierDictation.exe'),[],{windowsHide:true,timeout:5000},error=>error?reject(new Error('Garde Atelier IA au premier plan pour ouvrir la dictée.')):resolve()));return json(res,200,{ok:true,native:true});}
  if(url.pathname==='/api/nas/pair'&&req.method==='POST'){
   if(desktopAgent.status().desktopActive)return json(res,409,{error:'Arrête le pilotage en cours avant de changer la connexion.'});
   const body=await readBody(req,4096),result=await nasBridge.pair(body);ready=false;sessionCookie='';
   if(gatewayProcess&&gatewayProcess.exitCode===null){const child=gatewayProcess;await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},12000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.send({type:'shutdown'});else child.kill();});gatewayProcess=null;}
   await startGateway();return json(res,200,result);
  }
  if(!ready&&url.pathname!=='/api/stop')return json(res,503,{error:startupError||'Le moteur démarre, patiente quelques secondes.'});
  if(url.pathname==='/api/gemini'&&req.method==='POST'){
   if(nasBridge.hasProfile())return json(res,409,{error:'Cette connexion est partagée par le NAS. Gère Gemini depuis JMH avec le compte administrateur.'});
   const body=await readBody(req,4096);if(typeof body.key!=='string'||!/^AIza[\w-]{20,100}$/.test(body.key.trim()))return json(res,400,{error:'Colle la clé API créée dans Google AI Studio, sans espaces supplémentaires.'});
   if(body.freeOnly!==true)return json(res,400,{error:'Utilise un projet Google sans facturation pour rester dans le quota gratuit.'});
   // Provider credentials are stored only by OmniRoute, encrypted at rest.
   const result=await management('/api/providers','POST',{provider:'gemini',name:'Mon Gemini — quota gratuit',apiKey:body.key.trim(),priority:1});
   return json(res,200,{ok:true,message:'Gemini est enregistré. Lance une première question pour vérifier le quota de ton compte.'});
  }
  if(url.pathname==='/api/image'&&req.method==='POST'){
   const body=await readBody(req,8192),prompt=typeof body.prompt==='string'?body.prompt.trim():'';
   if(!prompt||prompt.length>2000)return json(res,400,{error:'Décris l’image en 2000 caractères au maximum.'});
   const abort=new AbortController(),close=()=>{if(!res.writableEnded)abort.abort();};res.once('close',close);
   try{return json(res,200,await nasBridge.image(prompt,abort.signal));}catch(e){if(!res.destroyed)return json(res,e.status>=400&&e.status<=599?e.status:502,{error:e.message});}finally{res.removeListener('close',close);}
  }
  if(url.pathname==='/api/chat'&&req.method==='POST')return await chat(await readBody(req,8*1024*1024),res);
  if(url.pathname==='/api/dashboard'&&req.method==='POST'){
   if(nasBridge.hasProfile())return json(res,200,{url:nasBridge.profile().serverUrl+'/'});
   const body=await readBody(req);const routes={providers:'/dashboard/providers',routing:'/dashboard/auto-combo',compression:'/dashboard/compression',usage:'/dashboard/usage',home:'/dashboard'};const cookie=await login();
   res.setHeader('Set-Cookie',cookie.split('; ').map(v=>v+'; Path=/; HttpOnly; SameSite=Strict'));
   return json(res,200,{url:GATEWAY+(routes[body.page]||routes.home)});
  }
  if(url.pathname==='/api/code'&&req.method==='POST')return json(res,200,await launchCode(await readBody(req,4096)));
  if(url.pathname==='/api/stop'&&req.method==='POST'){if(chatBusy||desktopAgent.status().desktopBusy)return json(res,409,{error:'Arrête la réponse ou l’action en cours avant de fermer le moteur.'});json(res,200,{ok:true});setTimeout(shutdown,300);return;}
  json(res,404,{error:'Action introuvable.'});
 }catch(e){json(res,400,{error:e.message});}
});
async function shutdown(){if(stopping)return;stopping=true;server.close();await nasBridge.closeRelay();await stopDesktop().catch(()=>{});if(gatewayProcess?.connected){gatewayProcess.send({type:'shutdown'});await Promise.race([new Promise(r=>gatewayProcess.once('exit',r)),sleep(12000)]);}if(gatewayProcess&&gatewayProcess.exitCode===null)gatewayProcess.kill();process.exit(0);}
server.listen(20127,'127.0.0.1',()=>{fs.writeFileSync(path.join(DATA,'process.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));startGateway();});
server.on('error',e=>{console.error('Atelier IA : '+e.code);process.exit(1);});
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
