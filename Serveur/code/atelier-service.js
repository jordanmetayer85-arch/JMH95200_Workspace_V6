'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn}=require('node:child_process');
const MODEL='gemini/gemini-3.1-flash-lite';
// Adaptive Claude reasoning is not interoperable with this Gemini tool relay.
// Keep actual tool results and images intact; disable only this incompatible mode.
function toolRequestBody(route,body){return route==='/v1/messages'&&Array.isArray(body?.tools)&&body.tools.length?{...body,thinking:{type:'disabled'}}:body;}

function createAtelierService({runtime,codeRoot=__dirname,fetchImpl=fetch}){
 const directory=path.join(runtime,'atelier'),origin='http://127.0.0.1:20128';
 let child=null,starting=null,cookie='',ready=false,lastError='',inflight=0,lastUse=Date.now();
 function secrets(){const p=path.join(directory,'secrets.json');const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Configuration IA invalide.');return JSON.parse(fs.readFileSync(p,'utf8'));}
 async function stop(){ready=false;cookie='';if(child?.connected)child.send({type:'shutdown'});}
 async function start(){
  lastUse=Date.now();if(ready&&child&&child.exitCode===null)return;if(starting)return starting;
  starting=(async()=>{
   const config=secrets();await new Promise((resolve,reject)=>{const probe=http.createServer();probe.once('error',()=>reject(Error('Le port interne de l’IA est occupé.')));probe.listen(20128,'127.0.0.1',()=>probe.close(resolve));});
   const log=fs.openSync(path.join(directory,'engine.log'),'a',0o600);
   const env={...process.env,JWT_SECRET:config.JWT_SECRET,API_KEY_SECRET:config.API_KEY_SECRET,STORAGE_ENCRYPTION_KEY:config.STORAGE_ENCRYPTION_KEY,INITIAL_PASSWORD:config.INITIAL_PASSWORD,OMNIROUTE_API_KEY:config.OMNIROUTE_API_KEY,DATA_DIR:path.join(directory,'omniroute'),PORT:'20128',HOST:'127.0.0.1',HOSTNAME:'127.0.0.1',OMNIROUTE_SERVER_HOST:'127.0.0.1',NEXT_PUBLIC_BASE_URL:origin,REQUIRE_API_KEY:'true',NEXT_TELEMETRY_DISABLED:'1',ENABLE_REQUEST_LOGS:'false',OMNIROUTE_DISABLE_BACKGROUND_SERVICES:'true',CLI_ALLOW_CONFIG_WRITES:'false',OMNIROUTE_AUTO_SYNC_CODEX_PROFILES:'false',OMNIROUTE_AUTO_SYNC_CLAUDE_PROFILES:'false',OMNIROUTE_CODEX_APPSERVER_AUTO_APPROVE:'false',FREE_PROXY_AUTO_SYNC_ENABLED:'false',ARENA_ELO_SYNC_ENABLED:'false',OPENROUTER_PROVIDER_STATS_ENABLED:'false',OMNIROUTE_SKIP_DNS_WRITE:'1',SKIP_ANTIGRAVITY_DNS:'true',OMNI_COMPRESSION_WORKERS:'1'};
   child=spawn(process.execPath,['--max-old-space-size=512',path.join(codeRoot,'atelier-gateway.cjs')],{cwd:path.join(codeRoot,'atelier-omniroute','omniroute'),env,stdio:['ignore',log,log,'ipc'],windowsHide:true});fs.closeSync(log);
   const launched=child;try{os.setPriority(launched.pid,10);}catch{}
   launched.on('error',()=>{if(child===launched){ready=false;lastError='Le moteur IA ne peut pas démarrer.';}});launched.on('exit',()=>{if(child===launched){ready=false;cookie='';child=null;}});
   for(let i=0;i<60;i++){if(launched.exitCode!==null)throw Error('Le moteur IA s’est arrêté au démarrage.');try{const r=await fetchImpl(origin+'/api/monitoring/health',{signal:AbortSignal.timeout(1500)});if(r.ok){ready=true;lastError='';return;}}catch{}await new Promise(r=>setTimeout(r,500));}
   throw Error('Le moteur IA met trop de temps à démarrer.');
  })().catch(e=>{ready=false;lastError=e.message;throw e;}).finally(()=>starting=null);return starting;
 }
 async function management(route,method='GET',body){await start();if(!cookie){const r=await fetchImpl(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({password:secrets().INITIAL_PASSWORD}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('La configuration IA ne peut pas être ouverte.');cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');}
  const r=await fetchImpl(origin+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie,Origin:origin},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(r.status===401)cookie='';const d=await r.json();if(!r.ok)throw Error('Le moteur ne peut pas modifier cette configuration.');return d;
 }
 async function request(route,body,signal){await start();if(inflight>=2){const e=Error('Deux demandes IA sont déjà en cours. Réessaie dans quelques secondes.');e.status=429;throw e;}inflight++;lastUse=Date.now();let closed=false;const release=()=>{if(!closed){closed=true;inflight--;lastUse=Date.now();}};
  try{const r=await fetchImpl(origin+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secrets().OMNIROUTE_API_KEY},...(body?{body:JSON.stringify({...toolRequestBody(route,body),model:MODEL,max_tokens:Math.max(64,Math.min(Number(body.max_tokens)||4096,8192))})}:{}),signal});return {response:r,release};}catch(e){release();throw e;}
 }
 // Images : le service sans clé uniquement. Aucun repli vers un modèle payant.
 const POLLINATIONS='https://image.pollinations.ai/prompt/';
 function imageSize(prompt){if(/portrait|vertical|t[ée]l[ée]phone|smartphone|affiche|poster/i.test(prompt))return[768,1024];if(/carr[ée]|logo|avatar|ic[ôo]ne|profil/i.test(prompt))return[1024,1024];if(/fond d['’]?[ée]cran|wallpaper|banni[èe]re|panoram/i.test(prompt))return[1280,720];return[1024,768];}
 // Délai maximal, en plus de l'annulation demandée par le client (compatible avec les anciennes versions de Node).
 function within(signal,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);t.unref?.();if(signal){if(signal.aborted)c.abort();else signal.addEventListener('abort',()=>c.abort(),{once:true});}return c.signal;}
 async function englishPrompt(prompt,signal){
  if(!ready)return prompt;
  try{const r=await fetchImpl(origin+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secrets().OMNIROUTE_API_KEY},body:JSON.stringify({model:MODEL,stream:false,max_tokens:200,messages:[{role:'system',content:'Rewrite the user request as one English prompt for an image generator: subject, style, lighting, colours, composition. At most 70 words. Output only the prompt, no quotes.'},{role:'user',content:prompt}]}),signal:within(signal,20000)});
   const text=String((await r.json())?.choices?.[0]?.message?.content||'').trim().replace(/^["'«]|["'»]$/g,'');return r.ok&&text&&text.length<=800?text:prompt;}
  catch{return prompt;}}
 async function pollinations(prompt,signal){
  const [width,height]=imageSize(prompt),seed=Math.floor(Math.random()*2**31);
  const url=POLLINATIONS+encodeURIComponent((await englishPrompt(prompt,signal)).slice(0,900))+'?width='+width+'&height='+height+'&seed='+seed+'&nologo=true&safe=true&model=flux';
  const r=await fetchImpl(url,{headers:{Accept:'image/*'},signal:within(signal,100000)});
  const type=(r.headers.get('content-type')||'').split(';')[0].trim();
  if(!r.ok||!/^image\/(png|jpeg|webp)$/.test(type)){const e=Error((r.ok?'réponse inattendue ('+type+')':'statut '+r.status)+' : '+(await r.text().catch(()=>'')).slice(0,200));e.status=r.status;throw e;}
  let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>12*1024*1024){await r.body.cancel().catch(()=>{});throw Error('image trop volumineuse');}chunks.push(chunk);}const bytes=Buffer.concat(chunks);if(bytes.length<1000)throw Error('image invalide');
  return{mime:type,base64:bytes.toString('base64')};}
 function imagesFrom(data){const found=[];const push=url=>{const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(url||''));if(m)found.push({mime:m[1],base64:m[2].replace(/\s/g,'')});};
  for(const item of data?.data||[]){if(item.b64_json)found.push({mime:'image/png',base64:item.b64_json});else push(item.url);}
  const message=data?.choices?.[0]?.message||{};for(const item of message.images||[])push(item.image_url?.url||item.url);
  if(Array.isArray(message.content))for(const part of message.content){if(part.type==='image_url')push(part.image_url?.url);if(part.inline_data?.data)found.push({mime:part.inline_data.mime_type||'image/png',base64:part.inline_data.data});}
  return found;}
 const clean=text=>String(text||'').replace(/AIza[\w-]{20,}/g,'[clé]').replace(/Bearer\s+\S+/g,'Bearer [jeton]').slice(0,300);
 async function image(prompt,signal){if(inflight>=2){const e=Error('Deux demandes IA sont déjà en cours. Réessaie dans quelques secondes.');e.status=429;throw e;}inflight++;lastUse=Date.now();const attempts=[];
  try{try{return{images:[await pollinations(prompt,signal)],text:'',model:'pollinations/flux',attempts};}
   catch(e){if(signal?.aborted)throw e;attempts.push({route:'pollinations',model:'pollinations/flux',status:e.status||0,error:clean(e.message)});}
   return{images:[],attempts};}
  finally{inflight--;lastUse=Date.now();}}
 const idle=setInterval(()=>{if(ready&&!inflight&&Date.now()-lastUse>15*60*1000)void stop();},60000);idle.unref();
 process.once('exit',()=>{try{child?.kill();}catch{}});
 return{model:MODEL,start,stop,request,image,management,status:()=>({ready,starting:!!starting,error:lastError,installed:fs.existsSync(path.join(directory,'secrets.json')),model:MODEL,shared:true}),close:()=>{clearInterval(idle);void stop();}};
}
module.exports={createAtelierService,MODEL,toolRequestBody};
