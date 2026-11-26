'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFile}=require('node:child_process'),{StringDecoder}=require('node:string_decoder');
const {writeConnectorConfig,READ_TOOLS,ACTION_TOOLS,prefix,INFO}=require('./desktop-connector.cjs');
const {desktopContent}=require('./chat-input.cjs');
function createDesktopAgent({root,environment,models,connected,spawnProcess=spawn,stopProcess=child=>killTree(root,child),turnTimeout=240000,approvalTimeout=90000}){
 let session=null,running=null;
 const readTools=new Set(READ_TOOLS.map(prefix)),actionTools=new Set(ACTION_TOOLS.map(prefix));
 function status(){return{desktopActive:!!session,desktopBusy:!!running,desktopModel:session?.model||'',desktopConnector:INFO,desktopApproval:running?.approval?{id:running.approval.id,tool:running.approval.tool.slice(prefix('').length),input:running.approval.input,expiresAt:running.approval.expiresAt}:null};}
 async function start(body){
  if(body?.captureConsent!==true)throw Error('Autorise l’envoi des captures à Gemini pour cette session.');
  if(session||running)throw Error('Arrête la session en cours avant d’en ouvrir une autre.');
  if(!await connected())throw Error('Connecte Gemini avant de lancer le pilotage.');
  const available=(await models()).filter(m=>typeof m==='string'&&/^gemini\//i.test(m)&&!/(embed|imagen|tts|audio|live)/i.test(m));
  if(!available.length)throw Error('Aucun modèle Gemini compatible n’est disponible. Aucun autre fournisseur ne sera utilisé pour tes captures.');
  if(session||running)throw Error('Une session a déjà été ouverte.');
  const profile=require('./claude-profile.cjs').profileFor(root,'desktop'),directory=path.join(profile,'pilotage',crypto.randomUUID());
  const mcp=writeConnectorConfig(root,directory);
  session={id:crypto.randomUUID(),directory,mcp,model:available[0],resume:'',alwaysAllow:new Set()};
  return{ok:true,desktop:true,model:session.model,connector:INFO};
 }
 function approve(body){
  const a=running?.approval;if(!session||!a||body?.id!==a.id||typeof body.allow!=='boolean'||body.always!==undefined&&typeof body.always!=='boolean'||Date.now()>=a.expiresAt)throw Error('Cette demande d’autorisation a expiré.');
  if(body.allow&&body.always)session.alwaysAllow.add(a.tool);a.respond(body.allow);return{ok:true,always:body.allow&&body.always===true};
 }
 function reset(){if(!session)throw Error('Le pilotage n’est pas actif.');if(running)throw Error('Interromps d’abord l’action en cours.');session.resume='';return{ok:true};}
 async function cancel(){const run=running;if(!run)return{ok:true};run.cancelled=true;run.approval?.respond(false);await stopProcess(run.child);await run.closed;return{ok:true};}
 async function stop(){session=null;await cancel();return{ok:true};}
 async function chat(body,{signal}={}){
  if(!session)throw Error('Active d’abord « Piloter mon PC ».');if(running)throw Error('Une action est déjà en cours.');
  const content=desktopContent(body),owner=session;
  const args=['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--tools','','--strict-mcp-config','--mcp-config',owner.mcp,'--setting-sources','','--settings',JSON.stringify({permissions:{ask:[...actionTools]}}),'--system-prompt',fs.readFileSync(path.join(root,'desktop-control','instructions.txt'),'utf8'),'--permission-mode','manual','--permission-prompt-tool','stdio','--allowedTools',[...readTools].join(','),'--max-turns','12','--disable-slash-commands','--no-chrome','--model',owner.model];
  if(owner.resume)args.push('--resume',owner.resume);
  const child=spawnProcess(path.join(root,'claude-native','package','claude.exe'),args,{cwd:owner.directory,env:environment(owner.model),windowsHide:true,stdio:['pipe','pipe','pipe']});
  let resolveClosed;const closed=new Promise(r=>resolveClosed=r),run={child,closed,approval:null,cancelled:false};running=run;
  const decoder=new StringDecoder('utf8');let buffer='',bytes=0,stderr='',result=null,protocolError='',closeTimer;const calls=[];let lastToolError=false;
  function write(value){if(!child.stdin.destroyed&&!child.stdin.writableEnded)child.stdin.write(JSON.stringify(value)+'\n');}
  function reply(event,response){write({type:'control_response',response:{subtype:'success',request_id:event.request_id,response}});}
  function event(value){
   for(const item of value.message?.content||[]){if(item.type==='tool_use')calls.push(String(item.name));if(item.type==='tool_result'){lastToolError=item.is_error===true;if(item.is_error&&/USER_CONTROL|TAKEOVER_PENDING|PHYSICAL_INPUT_HELD|FAST_TAKEOVER/.test(JSON.stringify(item.content))){owner.alwaysAllow.clear();protocolError='Tu as repris la main. Le pilotage attend une nouvelle demande explicite.';void cancel().catch(()=>{});}}}
   if(value.type==='result'){result=value;child.stdin.end();closeTimer=setTimeout(()=>void stopProcess(child).catch(()=>{}),5000);return;}
   if(value.type!=='control_request')return;
   const request=value.request;
   if(request?.subtype!=='can_use_tool'){write({type:'control_response',response:{subtype:'error',request_id:value.request_id,error:'Demande de contrôle non prise en charge.'}});return;}
   const deny=message=>reply(value,{behavior:'deny',message,toolUseID:request.tool_use_id});
   if(run.cancelled||session!==owner)return deny('La session a été arrêtée.');
   if(readTools.has(request.tool_name))return reply(value,{behavior:'allow',updatedInput:request.input,toolUseID:request.tool_use_id});
   if(!actionTools.has(request.tool_name))return deny('Cet outil n’est pas autorisé pour le pilotage.');
   const input=request.input;
   if(!input||typeof input!=='object'||JSON.stringify(input).length>16000)return deny('Action invalide ou trop volumineuse.');
   if(owner.alwaysAllow?.has(request.tool_name))return reply(value,{behavior:'allow',updatedInput:input,toolUseID:request.tool_use_id});
   if(run.approval)return deny('Une autre action attend déjà une confirmation.');
   let timer;const a={id:crypto.randomBytes(18).toString('hex'),tool:request.tool_name,input,expiresAt:Date.now()+approvalTimeout,respond(allow){if(run.approval!==a)return;clearTimeout(timer);run.approval=null;if(allow&&session===owner&&!run.cancelled)reply(value,{behavior:'allow',updatedInput:input,toolUseID:request.tool_use_id});else deny('Action refusée, expirée ou interrompue.');}};
   run.approval=a;timer=setTimeout(()=>a.respond(false),approvalTimeout);
  }
  child.stdout.on('data',chunk=>{
   bytes+=chunk.length;if(bytes>20*1024*1024){protocolError='Réponse du pilotage trop volumineuse.';void cancel().catch(()=>{});return;}
   buffer+=decoder.write(chunk);let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;try{event(JSON.parse(line));}catch{protocolError='Le connecteur a renvoyé une réponse illisible.';void cancel().catch(()=>{});}}
  });
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8000);});
  const timeout=setTimeout(()=>{protocolError='Le pilotage a dépassé quatre minutes. Relance une action plus courte.';void cancel().catch(()=>{});},turnTimeout);
  const abort=()=>void cancel().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  try{
   const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{resolveClosed();resolve(code);});});
   write({type:'user',session_id:owner.resume||'',message:{role:'user',content},parent_tool_use_id:null});
   const code=await exit;
   if(run.cancelled)throw Error(protocolError||'Action interrompue.');
   if(result?.session_id&&session===owner)owner.resume=String(result.session_id);
   if(code!==0||!result||result.is_error)throw Error(result?.permission_denials?.length?'Une action attendait une autorisation qui n’a pas été accordée.':safeError(result?.result||stderr||'Le connecteur n’a pas renvoyé de résultat.'));
   if(result.permission_denials?.length)throw Error('Une ou plusieurs actions n’ont pas été autorisées. Tu peux reformuler ta demande.');
   if(lastToolError)throw Error('Le connecteur Windows a signalé une erreur pendant l’action. Aucune réussite n’est confirmée.');
   if(typeof result.result!=='string'||!result.result.trim())throw Error('Aucun résultat vérifiable n’a été renvoyé.');
   return{ok:true,message:result.result.trim(),model:owner.model,connector:INFO,toolsUsed:calls};
  }finally{
   clearTimeout(timeout);clearTimeout(closeTimer);signal?.removeEventListener('abort',abort);run.approval?.respond(false);resolveClosed();if(running===run)running=null;
  }
 }
 return{status,start,chat,approve,reset,stop,cancel};
}
function safeError(text){return String(text).replace(/(?:AIza[\w-]+|sk-[\w-]{12,}|Bearer\s+[\w.-]+)/g,'[secret masqué]').replace(/\s+/g,' ').slice(0,900);}
async function killTree(root,child){
 if(!child||child.exitCode!==null||!child.pid)return;
 if(process.platform==='win32')await new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'Stop-DesktopAgent.ps1'),'-SessionPid',String(child.pid)],{windowsHide:true,timeout:10000},error=>error&&child.exitCode===null?reject(Error('Le connecteur ne peut pas être arrêté. Ferme sa session avant de réessayer.')):resolve()));
 else child.kill();
}
module.exports={createDesktopAgent,safeError};
