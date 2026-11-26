'use strict';
importScripts('/vault-crypto.js');
const vaultStreams=new Map(),VC=self.JMHVaultCrypto;
self.addEventListener('message',event=>{
 const value=event.data;if(!value||!event.source?.id)return;
 if(value.type==='vault-revoke'){
  for(const [token,entry]of vaultStreams)if(entry.owner===event.source.id&&(!value.token||value.token===token)){entry.abort.abort();vaultStreams.delete(token);}
  event.ports[0]?.postMessage({ok:true});return;
 }
 if(value.type==='vault-stream'&&/^[a-f0-9]{64}$/.test(value.token)&&/^[a-f0-9]{32}$/.test(value.id)&&value.fileKey?.type==='secret'){
  const sourceBase=typeof value.sourceBase==='string'&&/^\/api\/authority\/(?:vaults\/[A-Za-z0-9_-]{1,80}|trash\/[a-f0-9-]{36})\/files$/.test(value.sourceBase)?value.sourceBase:'/api/private-vault/files';
  vaultStreams.set(value.token,{...value,sourceBase,owner:event.source.id,expires:Date.now()+11*60*1000,abort:new AbortController()});event.ports[0]?.postMessage({ok:true});
 }
});
setInterval(()=>{for(const [token,value]of vaultStreams)if(value.expires<Date.now()){value.abort.abort();vaultStreams.delete(token);}},30000);
async function privateStream(event,token,download){
 const entry=vaultStreams.get(token);
 if(!entry||entry.expires<Date.now()||event.clientId&&event.clientId!==entry.owner||!await self.clients.get(entry.owner))return new Response('Coffre verrouillé.',{status:423});
 const {meta}=entry,size=meta.size,range=event.request.headers.get('range');let start=0,end=Math.max(0,size-1);
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2]||size===0)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});if(!match[1])start=Math.max(0,size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});}
 let index=Math.floor(start/VC.CHUNK),position=start;
 const stream=new ReadableStream({async pull(controller){
  if(!vaultStreams.has(token)||entry.abort.signal.aborted){controller.error(Error('Coffre verrouillé.'));return;}
  if(position> end||size===0){controller.close();return;}
  try{
   const response=await fetch(entry.sourceBase+'/'+entry.id+'/chunks/'+index,{credentials:'same-origin',cache:'no-store',signal:entry.abort.signal});if(!response.ok)throw Error('Session expirée ou bloc indisponible.');
   const plain=new Uint8Array(await VC.decryptChunk(entry.fileKey,entry.vaultId,entry.id,meta,index,await response.arrayBuffer()));
   if(!vaultStreams.has(token))throw Error('Coffre verrouillé.');
   const from=position-index*VC.CHUNK,to=Math.min(plain.length,end-index*VC.CHUNK+1),chunk=plain.slice(from,to);plain.fill(0);controller.enqueue(chunk);position+=chunk.length;index++;if(position>end)controller.close();
  }catch(error){controller.error(error);}
 }});
 // Never cache plaintext. A navigation is forced to download, not render active content.
 const safeType=/^(image\/(?:jpeg|png|gif|webp|bmp|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/i.test(meta.type)?meta.type:'application/octet-stream';
 const headers={'Content-Type':safeType,'Content-Length':String(size===0?0:end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox allow-downloads",'Referrer-Policy':'no-referrer'};
 if(range)headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
 if(download||event.request.mode==='navigate'&&!(safeType==='application/pdf'&&new URL(event.request.url).searchParams.get('inline')==='1'))headers['Content-Disposition']="attachment; filename*=UTF-8''"+encodeURIComponent(meta.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
 return new Response(event.request.method==='HEAD'?null:stream,{status:range?206:200,headers});
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),match=/^\/private-vault-stream\/([a-f0-9]{64})$/.exec(url.pathname);
 if(url.origin===self.location.origin&&match&&['GET','HEAD'].includes(event.request.method))event.respondWith(privateStream(event,match[1],url.searchParams.get('download')==='1'));
});
