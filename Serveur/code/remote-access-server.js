'use strict';
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
function approvedLink(value) {
  try { const u=new URL(value); return u.protocol==='https:' && u.hostname==='login.tailscale.com' && !u.username && !u.password && /^\/(a|f|admin)(\/|$)/.test(u.pathname) ? u.href : null; } catch { return null; }
}
function readState(root) {
  const file=path.join(root,'status.json');
  if (!fs.existsSync(file)) return {configured:false,state:'not-installed'};
  if (Date.now()-fs.statSync(file).mtimeMs>90000) return {configured:true,state:'unavailable'};
  const status=JSON.parse(fs.readFileSync(file,'utf8'));
  let serves={}; try { serves=JSON.parse(fs.readFileSync(path.join(root,'serve.json'),'utf8')); } catch {}
  const name=String(status.Self?.DNSName||'').replace(/\.$/,'');
  const hostname=/^[a-z0-9][a-z0-9.-]*\.ts\.net$/i.test(name)?name:null;
  const ipv4=(status.TailscaleIPs||[]).find(ip=>net.isIP(ip)===4 && /^100\./.test(ip))||null;
  const isRunning=status.BackendState==='Running' && status.Self?.Online===true;
  const httpsConfigured=!!(hostname && serves.TCP?.['443']?.HTTPS && serves.Web?.[hostname+':443']?.Handlers?.['/']?.Proxy==='http://127.0.0.1:3000');
  let consentUrl=null;
  try { for (const raw of fs.readFileSync(path.join(root,'serve-output.txt'),'utf8').match(/https:\/\/login\.tailscale\.com\/[^\s<>"']+/g)||[]) { consentUrl=approvedLink(raw); if(consentUrl)break; } } catch {}
  return {configured:true,state:isRunning?'connected':String(status.BackendState||'starting'),hostname,ipv4,
    url:hostname?'https://'+hostname:null,httpsConfigured,filesConfigured:serves.TCP?.['445']?.TCPForward==='127.0.0.1:445',
    authenticationUrl:isRunning?null:approvedLink(status.AuthURL),consentUrl:httpsConfigured?null:consentUrl,
    checkedAt:fs.statSync(file).mtime.toISOString()};
}
function createRemoteAccessRouter({express,DATA_DIR,requireAuth,requireAdmin}) {
  const router=express.Router(),root=path.join(path.dirname(DATA_DIR),'remote-access','status');
  router.use(requireAuth);
  router.get('/status',(req,res)=>{
    res.set('Cache-Control','no-store');
    try { const result=readState(root); if(req.session.user.role!=='admin'){delete result.authenticationUrl;delete result.consentUrl;} res.json(result); }
    catch { res.status(503).json({error:'Le service d’accès à distance ne répond pas encore.'}); }
  });
  router.get('/authorization',requireAdmin,(req,res)=>{
    res.set('Cache-Control','no-store');
    try { const s=readState(root),url=s.authenticationUrl||s.consentUrl; if(!url)return res.status(409).json({error:'Aucune autorisation n’est actuellement demandée.'}); res.redirect(303,url); }
    catch { res.status(503).json({error:'Le service d’accès à distance ne répond pas encore.'}); }
  });
  return router;
}
module.exports={createRemoteAccessRouter,readState,approvedLink};
