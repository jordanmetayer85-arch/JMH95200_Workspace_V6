'use strict';
const crypto=require('crypto');
function createVpnMaps({BrowserWindow,session,net,icon}){
 let window=null,credentials=null,opening=false;
 const proxyHost='192.168.1.27',proxyPort=8888;
 const isProxy=info=>info?.isProxy&&info.host===proxyHost&&Number(info.port)===proxyPort;
 function checkIp(ses,c){return new Promise((resolve,reject)=>{
  const req=net.request({url:'https://api4.ipify.org?format=json',session:ses,redirect:'error',credentials:'include'});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{finish(Error('La sortie Maps par le NAS ne répond pas.'));req.abort();},12000);
  req.on('login',(info,callback)=>isProxy(info)&&c.authentication?callback(c.username,c.password):callback());req.on('error',()=>finish(Error('La sortie Maps par le VPN ne peut pas être vérifiée.')));
  req.on('response',response=>{let bytes='';response.on('data',data=>{bytes+=data;if(bytes.length>1024){finish(Error('Réponse de vérification invalide.'));req.abort();}});response.on('error',()=>finish(Error('Vérification interrompue.')));response.on('end',()=>{try{if(response.statusCode!==200)throw Error();const ip=JSON.parse(bytes).ip;if(typeof ip!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))throw Error();finish(null,ip);}catch{finish(Error('Adresse Maps non vérifiable.'));}});});req.end();
 });}
 return {
  owns(contents){return !!window&&!window.isDestroyed()&&contents===window.webContents;},
  authenticate(event,contents,info,callback){if(!this.owns(contents)||!isProxy(info))return false;event.preventDefault();credentials?.authentication?callback(credentials.username,credentials.password):callback();return true;},
  close(){if(window&&!window.isDestroyed())window.close();credentials=null;},
  async open(c,status){if(opening)return{ok:false,error:'Maps est déjà en préparation.'};opening=true;try{
   if(c?.host!==proxyHost||Number(c.port)!==proxyPort||status?.tunnel!=='running'||!status.publicIp)throw Error('Le tunnel NAS doit être connecté avant d’ouvrir Maps.');
   if(window&&!window.isDestroyed()){window.close();window=null;}credentials=null;
   // No persisted Google account, location permission, cookies or JMH preload.
   const ses=session.fromPartition('jmh-vpn-maps-'+crypto.randomUUID());ses.setPermissionCheckHandler(()=>false);ses.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));ses.on('will-download',event=>event.preventDefault());
   await ses.setProxy({mode:'fixed_servers',proxyRules:'http='+proxyHost+':'+proxyPort+';https='+proxyHost+':'+proxyPort,proxyBypassRules:'<-loopback>'});await ses.closeAllConnections();
   if(await checkIp(ses,c)!==status.publicIp)throw Error('L’adresse de sortie de Maps ne correspond pas au VPN du NAS. Aucune carte ouverte.');
   credentials=c;window=new BrowserWindow({width:1100,height:780,minWidth:700,minHeight:550,title:'JMH · Maps par le VPN · localisation précise bloquée',icon,backgroundColor:'#171922',webPreferences:{session:ses,contextIsolation:true,nodeIntegration:false,sandbox:true,webRTCIPHandlingPolicy:'disable_non_proxied_udp'}});window.removeMenu();
   const active=window;active.on('closed',()=>{if(window===active){window=null;credentials=null;}void ses.clearStorageData().catch(()=>{});});
   const allowed=url=>{try{const u=new URL(url);return u.protocol==='https:'&&((['www.google.com','www.google.fr'].includes(u.hostname)&&u.pathname.startsWith('/maps'))||u.hostname==='consent.google.com'||u.hostname==='consent.google.fr');}catch{return false;}};
   for(const event of ['will-navigate','will-redirect'])active.webContents.on(event,(e,url)=>{if(!allowed(url))e.preventDefault();});active.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   active.webContents.on('page-title-updated',event=>{event.preventDefault();active.setTitle('JMH · Maps par le VPN · localisation précise bloquée');});
   await active.loadURL('https://www.google.com/maps?hl=fr');return{ok:true,ip:status.publicIp};
  }catch(error){this.close();return{ok:false,error:error.message};}finally{opening=false;}}
 };
}
module.exports={createVpnMaps};
