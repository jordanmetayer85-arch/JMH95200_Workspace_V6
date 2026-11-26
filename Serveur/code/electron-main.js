const { app, BrowserWindow, shell, dialog, ipcMain, globalShortcut, safeStorage, session, net, Menu, clipboard } = require("electron");
if(process.platform==="win32")app.setAppUserModelId("com.jmh95200.workspace");
const path = require("path"), fs = require("fs"), http = require("http"), https = require("https");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const { createDesktopUpdater } = require("./desktop-updater");
const { DEFAULT_SERVER_URL, normalizeServerUrl, readClientConfig, saveClientConfig, probeNasServer } = require("./desktop-connection");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const health=require('./desktop-health').createDesktopHealth({app});
app.on('child-process-gone',(_event,details)=>health.record('child-process-gone',{type:details.type,reason:details.reason,exitCode:details.exitCode}));
let mainWindow, setupWindow, startupPromise, restarting = false, loginMigrationWarning='';
const configuring=process.argv.includes("--configure-connection"),{normalizeProfile}=require("./installation-profile"),{pinnedAgent,verifyPinnedCertificate}=require("./secure-transport");
const setupFile = pathToFileURL(path.join(__dirname, "installation-wizard.html")).href;
function connectionConfigPath() { return path.join(app.getPath("userData"), "connection-config.json"); }
function readConnectionConfig() { return readClientConfig(connectionConfigPath()); }
function configuredOrigin() { const config = readConnectionConfig(); if (config.needsMigration) throw new Error("Configurez la connexion au NAS avant de continuer."); return normalizeServerUrl(config.serverUrl); }
function createBaseWindow(options = {}) {
  const window=new BrowserWindow({ width: options.width || 1440, height: options.height || 900, minWidth: options.minWidth || 900, minHeight: options.minHeight || 650, show: false, backgroundColor: "#131116", icon: path.join(__dirname,"public","assets","icon.png"), webPreferences: { preload: path.join(__dirname,"preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  require('./desktop-icon').applyWindowIcon(window,{platform:process.platform,resourcesPath:process.resourcesPath,execPath:process.execPath});
  return window;
}
function isMainCaller(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || (event.senderFrame && event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame)) return false;
  try { const url = new URL(event.senderFrame?.url || event.sender.getURL()); return url.origin === configuredOrigin() && ["/","/index.html"].includes(url.pathname); } catch { return false; }
}
function isConnectionCaller(event) {
  if (setupWindow && !setupWindow.isDestroyed() && event.sender === setupWindow.webContents && (!event.senderFrame || !event.sender.mainFrame || event.senderFrame === event.sender.mainFrame)) {
    try { const url = new URL(event.senderFrame?.url || event.sender.getURL()); if (url.protocol === "file:" && url.href.split("?")[0].split("#")[0] === setupFile) return true; } catch {}
  }
  return isMainCaller(event);
}
function openSetupWindow(message = "") {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.focus(); return; }
  setupWindow = createBaseWindow({ width: 760, height: 700, minWidth: 700, minHeight: 650 });
  setupWindow.removeMenu();setupWindow.loadFile(path.join(__dirname,"installation-wizard.html"),{query:message?{connectionError:String(message)}:{}});setupWindow.once("ready-to-show",()=>setupWindow.show());setupWindow.on("closed",()=>{setupWindow=null;});
}
async function waitForServer(url, timeoutMs = 12000) { return probeNasServer(url,{timeoutMs,tlsPin:readConnectionConfig().tlsPin}); }
function configureCertificateTrust(config){session.defaultSession.setCertificateVerifyProc((request,callback)=>{if(config.tlsPin&&request.hostname===new URL(config.serverUrl).hostname){try{verifyPinnedCertificate(request.certificate.data,config.tlsPin);callback(0);}catch{callback(-2);}}else callback(-3);});}
function restoreVerifiedLocalLogins(config,verified){
 try{require('./local-login-migration').migrateVerifiedLocalLogins({vault:loginVault,config,verified});loginMigrationWarning='';}
 catch(error){loginMigrationWarning='Les anciens comptes sont conservés, mais leur récupération locale a échoué. '+error.message;health.record('login-vault-migration',{error:error.message});}
}
async function startWorkspace() {
  if (startupPromise) return startupPromise;
  startupPromise = (async () => {
    const config = readConnectionConfig();
    if (config.needsMigration || !config.setupComplete) { openSetupWindow(); return; }
    configureCertificateTrust(config);
    const targetUrl = normalizeServerUrl(config.serverUrl);
    let verified;
    try { verified=await waitForServer(targetUrl); }
    catch (error) { openSetupWindow(error.message); return; }
    restoreVerifiedLocalLogins(config,verified);
    mainWindow=createBaseWindow();mainWindow.removeMenu();
    const trustedPermission=(contents,permission,origin)=>contents===mainWindow?.webContents&&permission==='fullscreen'&&origin===targetUrl;
    mainWindow.webContents.session.setPermissionCheckHandler((contents,permission,origin)=>trustedPermission(contents,permission,origin));
    mainWindow.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>{let origin='';try{origin=new URL(details.requestingUrl||contents.getURL()).origin;}catch{}callback(trustedPermission(contents,permission,origin));});
    mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());

    mainWindow.webContents.on('render-process-gone',(_event,details)=>health.record('render-process-gone',details));
    mainWindow.on('unresponsive',()=>health.record('unresponsive',{device:require('os').hostname()}));
    mainWindow.webContents.setWindowOpenHandler(({url})=>{try { const target=new URL(url);if(target.origin===targetUrl||target.protocol==="blob:"&&url.startsWith("blob:"+targetUrl+"/"))return{action:"allow",overrideBrowserWindowOptions:{webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:undefined}}};if(["http:","https:"].includes(target.protocol))shell.openExternal(url); } catch {}return{action:"deny"};});
    mainWindow.webContents.on('context-menu',(_event,params)=>{if(params.frameURL&&new URL(params.frameURL).origin!==targetUrl)return;if(mainWindow.webContents.executeJavaScript){const flags=params.editFlags||{},items=[];if(params.isEditable){items.push({label:'Annuler',role:'undo',enabled:flags.canUndo},{label:'Rétablir',role:'redo',enabled:flags.canRedo},{type:'separator'},{label:'Couper',role:'cut',enabled:flags.canCut},{label:'Copier',role:'copy',enabled:flags.canCopy},{label:'Coller',role:'paste',enabled:flags.canPaste},{label:'Tout sélectionner',role:'selectAll',enabled:flags.canSelectAll});}else if(params.selectionText)items.push({label:'Copier',role:'copy',enabled:flags.canCopy});if(items.length)Menu.buildFromTemplate(items).popup({window:mainWindow});}});
    mainWindow.webContents.on("will-navigate",(event,url)=>{try{if(new URL(url).origin===targetUrl)return;}catch{}event.preventDefault();});
    mainWindow.once("ready-to-show",()=>mainWindow.show());mainWindow.on("closed",()=>{mainWindow=null;});
    await clientVpn.resume();
    try { await mainWindow.loadURL(targetUrl); }
    catch(error){if(mainWindow&&!mainWindow.isDestroyed()){restarting=true;mainWindow.close();}openSetupWindow("JMH n’a pas pu s’ouvrir sur le NAS : "+error.message);}
  })().finally(()=>{startupPromise=null;restarting=false;});
  return startupPromise;
}
ipcMain.handle("connection:get",event=>{if(!isConnectionCaller(event))throw new Error("Fenêtre de connexion non autorisée.");return readConnectionConfig();});
ipcMain.handle("connection:test",async(event,input)=>{try{if(!isConnectionCaller(event))throw Error("Fenêtre de connexion non autorisée.");const value=typeof input==='string'?{serverUrl:input}:input;const result=await probeNasServer(value.serverUrl,{tlsPin:value.tlsPin});return{ok:true,serverUrl:result.origin,version:result.version,serverType:result.serverType};}catch(error){return{ok:false,error:error.message};}});
ipcMain.handle('connection:test-vpn',async(event,value)=>{try{if(!isConnectionCaller(event))throw Error('Fenêtre non autorisée.');const profile=require('./installation-profile').normalizeVpn(value);return{ok:true,...await require('./proxy-probe').probeProxy(profile)};}catch(error){return{ok:false,error:error.message};}});
ipcMain.handle("connection:save",async(event,input)=>{
 try{
  if(!isConnectionCaller(event))throw Error("Fenêtre de connexion non autorisée.");
  const config=normalizeProfile({...input,setupComplete:true},normalizeServerUrl);
  if(process.platform!=='win32'&&config.vpn.mode==='system')throw Error('Sous Linux, choisis le VPN pour JMH.');
  const verified=await probeNasServer(config.serverUrl,{tlsPin:config.tlsPin});
  if(config.vpn.configured){const proof=await require('./proxy-probe').probeProxy(config.vpn);if(!proof.reachable)throw Error('Le proxy VPN est inaccessible.');}
  saveClientConfig(connectionConfigPath(),{...config,serverUrl:verified.origin});
  restoreVerifiedLocalLogins(config,verified);

  restarting=true;
  if(configuring){if(setupWindow&&!setupWindow.isDestroyed())setupWindow.close();app.exit(0);return{ok:true};}
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.close();if(setupWindow&&!setupWindow.isDestroyed())setupWindow.close();await startWorkspace();return{ok:true,serverUrl:verified.origin};
 }catch(error){restarting=false;return{ok:false,error:error.message};}
});
ipcMain.handle("connection:open-settings",event=>{if(!isMainCaller(event))return{ok:false,error:"Fenêtre non autorisée."};openSetupWindow();return{ok:true};});
ipcMain.handle("desktop:capabilities",event=>({nativeMediaPlayer:isMainCaller(event),localImportPickers:false,serverType:"nas",client:true}));
ipcMain.handle("app:version",()=>app.getVersion());

function fetchLocalMediaJson(route,cookie,maxBytes=65536,timeout=3000,baseUrl) {
  return new Promise((resolve,reject)=>{
    const base=baseUrl||configuredOrigin(),target=new URL(route,base);if(target.origin!==base||!route.startsWith("/api/"))return reject(new Error("Adresse média interdite."));
    const client=target.protocol==="https:"?https:http,request=client.get(target,{agent:target.protocol==="https:"?pinnedAgent(readConnectionConfig().tlsPin):undefined,headers:{Cookie:cookie,Accept:"application/json"}},response=>{
      let body="";response.setEncoding("utf8");response.on("data",chunk=>{body+=chunk;if(Buffer.byteLength(body)>maxBytes){request.destroy();reject(new Error("Réponse média trop volumineuse."));}});
      response.on("end",()=>{if(response.statusCode!==200)return reject(new Error("Accès au média refusé par le NAS."));try{resolve(JSON.parse(body));}catch{reject(new Error("Réponse du serveur invalide."));}});response.on("error",reject);
    });request.setTimeout(timeout,()=>request.destroy(new Error("NAS inaccessible.")));request.on("error",reject);
  });
}
async function localMediaContext(event,adminOnly=true) {
  if(!isMainCaller(event))return null;
  try { const base=configuredOrigin(),cookies=await event.sender.session.cookies.get({url:base});const cookie=cookies.map(item=>{if(/[\r\n;]/.test(item.name+item.value))throw new Error("Session invalide.");return item.name+"="+item.value;}).join("; ");if(!cookie||cookie.length>16384)return null;const auth=await fetchLocalMediaJson("/api/me",cookie,65536,3000,base);return auth.user&&(!adminOnly||auth.user.role==="admin")?{cookie,base,user:auth.user}:null; } catch {return null;}
}

const checkNetworkFile=require('./network-file-check').createNetworkFileCheck();
async function openRegisteredMedia(file) {
  const player = path.join(app.getPath("userData"), "players", "vlc", "vlc.exe");
  if (!fs.existsSync(player)) {
    const error = await shell.openPath(file);
    return error ? { ok: false, error } : { ok: true };
  }
  const stat = fs.lstatSync(player);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Lecteur local invalide.");
  await new Promise((resolve, reject) => {
    const child = spawn(player, ["--ignore-config", "--no-crashdump", "--no-qt-privacy-ask",
      "--no-metadata-network-access", "--no-qt-updates-notif", "--no-media-library",
      "--no-qt-recentplay", "--no-qt-autoload-extensions", "--no-one-instance",
      "--no-one-instance-when-started-from-file", "--", file], { shell: false, detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
  return { ok: true, player: "vlc" };
}

// Local file pickers cannot import a PC path into the NAS server.
ipcMain.handle("cinema:select-files",async()=>[]);ipcMain.handle("cinema:select-folder",async()=>null);ipcMain.handle("music:select-files",async()=>[]);ipcMain.handle("music:select-folder",async()=>null);
ipcMain.handle("media:open-file",async(event,selection)=>{
  try{
    const kind=selection?.kind,id=selection?.id;
    if(!["cinema","music"].includes(kind)||typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return{ok:false,error:"Sélection de média invalide."};
    const context=await localMediaContext(event);if(!context)return{ok:false,error:"Connectez-vous à JMH sur le NAS avec un compte administrateur pour ouvrir ce média."};
    const details=await fetchLocalMediaJson("/api/"+kind+"/"+(kind==="cinema"?"movies":"tracks")+"/"+encodeURIComponent(id),context.cookie,65536,3000,context.base),item=kind==="cinema"?details.movie:details.track;
    const raw=item?.clientPath,extensions=kind==="cinema"?[".mp4",".m4v",".webm",".ogv",".mkv",".avi",".mov",".mpeg",".mpg",".wmv",".flv",".ts",".m2ts"]:[".mp3",".flac",".m4a",".aac",".ogg",".opus",".wav",".wma",".aiff",".aif",".amr",".mpc"];
    if(item?.id!==id||item.available!==true||typeof raw!=="string"||/[\u0000-\u001f<>:"|?*]/.test(raw))return{ok:false,error:"Le NAS n’a pas fourni de chemin média compatible."};
    const file=path.win32.normalize(raw),share="\\\\192.168.1.27\\JMH\\";
    if(!file.toLowerCase().startsWith(share.toLowerCase())||!extensions.includes(path.win32.extname(file).toLowerCase()))return{ok:false,error:"Seuls les médias du partage JMH du NAS peuvent être ouverts."};
    await checkNetworkFile(file);
    return await openRegisteredMedia(file);
  }catch{return{ok:false,error:"Impossible d’ouvrir ce média du NAS avec le lecteur Windows. Vérifiez l’accès au partage JMH."};}
});
ipcMain.handle('telemetry:get',async event=>{const context=await localMediaContext(event,false);if(!context||context.user.role!=='admin'&&context.user.permissions?.canUsePcTools!==true)return{error:'L’administrateur doit autoriser les outils de cet ordinateur.'};return health.snapshot();});
ipcMain.handle('telemetry:diagnostic',async event=>{if(!await localMediaContext(event))return{ok:false,error:'Connecte-toi avec le compte administrateur pour envoyer un diagnostic.'};const diagnostic=await health.diagnostic();diagnostic.build=require('./build-info.json').build;const file=path.join(app.getPath('userData'),'diagnostics','stability.jsonl');try{if((await fs.promises.stat(file)).size<=2100000)diagnostic.recentJmhEvents=(await fs.promises.readFile(file,'utf8')).trim().split('\n').slice(-40).map(line=>JSON.parse(line));}catch{}return{ok:true,diagnostic};});
ipcMain.handle('telemetry:export',async event=>{const context=await localMediaContext(event,false);if(!context||context.user.role!=='admin'&&context.user.permissions?.canUsePcTools!==true)return{ok:false,error:'L’administrateur doit autoriser les outils de cet ordinateur.'};const data=await health.diagnostic();const picked=await dialog.showSaveDialog(mainWindow,{title:'Enregistrer le diagnostic JMH',defaultPath:path.join(app.getPath('desktop'),'Diagnostic-JMH-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),filters:[{name:'Diagnostic JSON',extensions:['json']}]});if(picked.canceled)return{ok:false,canceled:true};fs.writeFileSync(picked.filePath,JSON.stringify(data,null,2));return{ok:true};});
let proxyBusy=false;
async function windowsProxyOperation(event,operation){if(!isMainCaller(event)||!['Enable','Disable','Status','Verify'].includes(operation))return{ok:false,error:'Commande proxy invalide.'};if(proxyBusy)return{ok:false,error:'Une opération VPN est déjà en cours.'};proxyBusy=true;try{if(['Disable','Enable'].includes(operation))vpnMaps.close();let credentials=null;if(['Enable','Verify'].includes(operation)){const base=configuredOrigin(),cookies=await event.sender.session.cookies.get({url:base}),cookie=cookies.map(x=>x.name+'='+x.value).join('; ');credentials=await fetchLocalMediaJson('/api/vpn/proxy-credentials',cookie,8192,5000,base);}
const scriptRoot=path.join(app.getPath('userData'),'vpn-tool');fs.mkdirSync(scriptRoot,{recursive:true});fs.writeFileSync(path.join(scriptRoot,'vpn-profile.json'),JSON.stringify(readConnectionConfig().vpn),{mode:0o600});for(const name of ['vpn-launcher.ps1','vpn-proxy.ps1']){const target=path.join(scriptRoot,name);if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('Script redirigé.');fs.writeFileSync(target,fs.readFileSync(path.join(__dirname,name)));}
return await new Promise(resolve=>{const ps=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');const child=spawn(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(scriptRoot,'vpn-launcher.ps1'),'-Operation',operation],{windowsHide:true,shell:false,stdio:['pipe','pipe','ignore']});let output='';const timer=setTimeout(()=>{child.kill();resolve({ok:false,error:'Le réglage VPN prend trop de temps. Vérifie son état avant de réessayer.'});},35000);child.stdout.on('data',b=>{output+=b;if(output.length>16384)child.kill()});child.on('error',()=>{clearTimeout(timer);resolve({ok:false,error:'Commande Windows indisponible.'})});child.on('close',()=>{clearTimeout(timer);try{const line=output.trim().split(/\r?\n/).reverse().find(x=>x.trim().startsWith('{'));resolve(JSON.parse(line));}catch{resolve({ok:false,error:'Réponse Windows invalide.'})}});child.stdin.end(credentials?JSON.stringify(credentials):'');});
}catch{return{ok:false,error:'Impossible de configurer le VPN sur ce PC.'}}finally{proxyBusy=false}}
function vpnStatePath(){return path.join(app.getPath('userData'),'vpn-client-state.json');}
function currentVpnConfig(){const config=readConnectionConfig();try{const state=JSON.parse(fs.readFileSync(vpnStatePath(),'utf8'));if(state.key===config.serverUrl+JSON.stringify(config.vpn))config.vpn.enabled=state.enabled===true;}catch{}return config;}
async function vpnCredentials(){if(!mainWindow||mainWindow.isDestroyed())throw Error('Ouvre JMH.');const base=configuredOrigin(),cookies=await mainWindow.webContents.session.cookies.get({url:base}),cookie=cookies.map(x=>x.name+'='+x.value).join('; ');return fetchLocalMediaJson('/api/vpn/proxy-credentials',cookie,8192,5000,base);}
const clientVpn=require('./client-vpn').createClientVpn({getConfig:currentVpnConfig,getSession:()=>session.defaultSession,getCredentials:vpnCredentials,windowsOperation:operation=>windowsProxyOperation({sender:mainWindow.webContents},operation),saveState:async enabled=>{const config=readConnectionConfig(),file=vpnStatePath(),temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify({key:config.serverUrl+JSON.stringify(config.vpn),enabled}),{mode:0o600});fs.renameSync(temp,file);}});
ipcMain.handle('vpn:proxy',async(event,operation)=>{const ctx=await localMediaContext(event,false);if(!ctx||ctx.user.role!=='admin'&&ctx.user.permissions?.canUseVpn!==true)return{ok:false,error:'Ton compte n’a pas accès au VPN.'};if(['Enable','Disable'].includes(operation))vpnMaps.close();return clientVpn.handle(operation);});
const vpnMaps=require('./vpn-maps').createVpnMaps({BrowserWindow,session,net,icon:path.join(__dirname,'public','assets','icon.png')});
ipcMain.handle('vpn:maps',async event=>{try{const ctx=await localMediaContext(event,false);if(!ctx||ctx.user.role!=='admin'&&(!ctx.user.permissions?.canAccessStorage||ctx.user.permissions?.canUseVpn===false))return{ok:false,error:'Ton compte n’a pas accès au VPN.'};const [credentials,status]=await Promise.all([fetchLocalMediaJson('/api/vpn/proxy-credentials',ctx.cookie,8192,5000,ctx.base),fetchLocalMediaJson('/api/vpn/status',ctx.cookie,16384,7000,ctx.base)]);return await vpnMaps.open(credentials,status);}catch{return{ok:false,error:'Maps ne peut pas être ouvert par le VPN. Vérifie la connexion au NAS.'};}});
app.on('login',async(event,contents,_details,authInfo,callback)=>{if(vpnMaps.authenticate(event,contents,authInfo,callback))return;if(!authInfo.isProxy||authInfo.host!==readConnectionConfig().vpn.host||Number(authInfo.port)!==readConnectionConfig().vpn.port||contents!==mainWindow?.webContents)return;event.preventDefault();try{const base=configuredOrigin(),cookies=await contents.session.cookies.get({url:base}),cookie=cookies.map(x=>x.name+'='+x.value).join('; '),c=await fetchLocalMediaJson('/api/vpn/proxy-credentials',cookie,8192,5000,base);callback(c.username,c.password);}catch{callback();}});
const windowsDictation=require('./windows-dictation').createWindowsDictation({runPowerShell:require('./desktop-health').runPowerShell});
const atelierClient=require('./atelier-client').createAtelierClient({documents:app.getPath('documents'),context:async event=>{const ctx=await localMediaContext(event,false);return ctx&&(ctx.user.role==='admin'||ctx.user.permissions?.canUsePcTools===true)?ctx:null;},fetchPair:async ctx=>{
 if(!ctx.base.startsWith('https://'))throw Error('Configure la connexion HTTPS de JMH.');
 const result=await new Promise((resolve,reject)=>{const request=https.request(new URL('/api/atelier/devices/pair',ctx.base),{method:'POST',agent:pinnedAgent(readConnectionConfig().tlsPin),headers:{Cookie:ctx.cookie,Origin:ctx.base,'Content-Type':'application/json','Content-Length':'2'}},response=>{let body='';response.on('data',b=>{body+=b;if(body.length>8192)request.destroy(Error('Réponse invalide.'));});response.on('end',()=>{try{const data=JSON.parse(body);if(response.statusCode!==200)throw Error(data.error||'La connexion de cet ordinateur a été refusée.');resolve(data);}catch(e){reject(e);}});});request.once('error',reject);request.setTimeout(10000,()=>request.destroy(Error('Le NAS ne répond pas.')));request.end('{}');});
 return{...result,serverUrl:ctx.base,tlsPin:readConnectionConfig().tlsPin};
}});
ipcMain.handle('atelier:launch',(event,value)=>atelierClient.launch(event,value));
ipcMain.handle('atelier:stop',event=>atelierClient.stop(event));
for(const operation of ['status','chat','approve','reset','cancel'])ipcMain.handle('atelier:'+operation,(event,value)=>atelierClient.command(event,operation,value));
ipcMain.handle('dictation:start',async event=>{const context=await localMediaContext(event,false);if(!context)return{ok:false,error:'Connecte-toi à JMH pour utiliser la dictée.'};return windowsDictation.start(mainWindow);});
ipcMain.handle('clipboard:write',async(event,text)=>{if(!isMainCaller(event)||typeof text!=='string'||text.length>10000)return{ok:false};await clipboard.writeText(text);return{ok:true};});
const windowsTools=require('./windows-tools').createWindowsTools({shell,runPowerShell:require('./desktop-health').runPowerShell});
for(const [operation,method]of [['status','status'],['volume','volume'],['settings','settings'],['list','list'],['open','open']])ipcMain.handle('windows:'+operation,async(event,value,offset)=>{try{const context=await localMediaContext(event,false);if(!context||(context.user.role!=='admin'&&!context.user.permissions?.canUsePcTools))throw Error('L’administrateur doit autoriser les outils de cet ordinateur.');return await windowsTools[method](value,offset);}catch(e){return{ok:false,error:e.message};}});
const loginVault=require('./local-login-vault').createLocalLoginVault({safeStorage,directory:process.platform==='win32'&&process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'JMH95200','private-login'):app.getPath('userData'),getOrigin:configuredOrigin});
for(const [operation,method] of [['status','status'],['fill','fill'],['clear','clear']])ipcMain.handle('credentials:'+operation,(event,username)=>{try{if(!isMainCaller(event))throw Error('Fenêtre non autorisée.');const result=loginVault[method](username);return{ok:true,...result,...(operation==='status'&&loginMigrationWarning?{warning:loginMigrationWarning}:{})};}catch(e){return{ok:false,error:e.message}}});
ipcMain.handle('credentials:save',async(event,value)=>{try{const context=await localMediaContext(event,false);if(!context||typeof value?.username!=='string'||context.user.username.toLocaleLowerCase('fr')!==value.username.trim().toLocaleLowerCase('fr'))throw Error('Connecte-toi avant d’enregistrer ces identifiants.');return loginVault.save({...value,username:context.user.username});}catch(e){return{ok:false,error:e.message}}});
ipcMain.handle('credentials:used',async(event,username)=>{try{const context=await localMediaContext(event,false);if(!context||typeof username!=='string'||context.user.username.toLocaleLowerCase('fr')!==username.trim().toLocaleLowerCase('fr'))throw Error('Compte non connecté.');return loginVault.touch(context.user.username);}catch(e){return{ok:false,error:e.message}}});
ipcMain.handle('storage:open-file',async(event,relative)=>{try{if(typeof relative!=='string'||!relative||relative.length>1000||/[\u0000-\u001f]/.test(relative))throw Error('Fichier invalide.');const context=await localMediaContext(event,false);if(!context)throw Error('Connecte-toi à JMH.');const info=await fetchLocalMediaJson('/api/storage/open-info?path='+encodeURIComponent(relative),context.cookie,65536,3000,context.base);const share='\\\\192.168.1.27\\JMH\\',raw=info.clientPath;if(typeof raw!=='string'||/[\u0000-\u001f<>:"|?*]/.test(raw))throw Error('Chemin NAS incompatible.');const file=path.win32.normalize(raw);const allowed=['.pdf','.doc','.docx','.odt','.xls','.xlsx','.ods','.ppt','.pptx','.odp','.txt','.csv','.rtf','.png','.jpg','.jpeg','.gif','.webp','.bmp','.mp3','.flac','.m4a','.aac','.ogg','.opus','.wav','.wma','.aiff','.aif','.amr','.mpc','.mp4','.mkv','.avi','.mov','.webm','.wmv'];if(!file.toLowerCase().startsWith(share.toLowerCase())||!allowed.includes(path.win32.extname(file).toLowerCase()))throw Error('Utilise Télécharger pour ouvrir ce format.');await checkNetworkFile(file);const error=await shell.openPath(file);if(error)throw Error(error);return{ok:true};}catch(e){return{ok:false,error:e.message}}});
const desktopUpdater=createDesktopUpdater({app,getMainWindow:()=>mainWindow,readConnectionConfig});
ipcMain.handle("update:check",event=>desktopUpdater.check(event));ipcMain.handle("app:build",()=>desktopUpdater.getBuild());ipcMain.handle("update:download-and-run",(event,suppliedUrl)=>desktopUpdater.install(event,suppliedUrl));
app.whenReady().then(()=>{globalShortcut.register("CommandOrControl+Shift+S",()=>openSetupWindow());if(configuring)openSetupWindow();else startWorkspace();});
app.on("window-all-closed",()=>{if(!restarting){if(configuring)app.exit(2);else app.quit();}});app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)startWorkspace();});app.on("before-quit",()=>globalShortcut.unregisterAll());
