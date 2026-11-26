(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.JMHVaultCrypto=value;})(typeof self==='undefined'?globalThis:self,()=>{
 'use strict';const CHUNK=4*1024*1024,enc=new TextEncoder(),dec=new TextDecoder();
 const bytes=n=>crypto.getRandomValues(new Uint8Array(n)),hex=v=>Array.from(v,b=>b.toString(16).padStart(2,'0')).join('');
 const b64=v=>{let s='';for(const b of new Uint8Array(v))s+=String.fromCharCode(b);return btoa(s);};
 const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const aes=(raw,usages=['encrypt','decrypt'])=>crypto.subtle.importKey('raw',raw,'AES-GCM',false,usages);
 const seal=async(key,value,aad)=>{const iv=bytes(12);return{iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},key,value))};};
 const open=(key,box,aad)=>crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(box.iv),additionalData:enc.encode(aad)},key,unb64(box.data));
 async function passwordKey(password,kdf){if(kdf?.name!=='PBKDF2-SHA256'||kdf.iterations!==600000||unb64(kdf.salt).length!==32)throw Error('Paramètres de chiffrement non reconnus.');const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:unb64(kdf.salt),iterations:kdf.iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
 function recoveryRaw(value){const text=String(value).trim().replace(/^JMH1-/i,'').replace(/-/g,'').toUpperCase();if(!/^[A-F0-9]{64}$/.test(text))throw Error('La clé doit contenir JMH1 suivi de ses 64 caractères.');return Uint8Array.from(text.match(/../g),s=>parseInt(s,16));}
 function recoveryText(raw){return 'JMH1-'+hex(raw).toUpperCase().match(/.{8}/g).join('-');}
 function passwordValid(password,confirm){if(password!==confirm)throw Error('Les deux mots de passe ne sont pas identiques.');if(password.length<12||password.length>512)throw Error('Choisis un mot de passe personnel de 12 caractères au minimum.');}
 async function create(password){
  const raw=bytes(32),rescue=bytes(32),vaultId=hex(bytes(16)),kdf={name:'PBKDF2-SHA256',iterations:600000,salt:b64(bytes(32))},key=await aes(raw),recovery=recoveryText(rescue);
  try{const config={version:1,vaultId,kdf,passwordWrap:await seal(await passwordKey(password,kdf),raw,vaultId+'/password'),recoveryWrap:await seal(await aes(rescue),raw,vaultId+'/recovery'),recoverySecret:await seal(key,enc.encode(recovery),vaultId+'/recovery-secret')};return{config,key,recovery};}finally{raw.fill(0);rescue.fill(0);}
 }
 async function unlock(config,secret,recovery=false){let raw;try{const wrapping=recovery?await aes(recoveryRaw(secret)):await passwordKey(secret,config.kdf);raw=new Uint8Array(await open(wrapping,recovery?config.recoveryWrap:config.passwordWrap,config.vaultId+(recovery?'/recovery':'/password')));if(raw.length!==32)throw Error();return await aes(raw);}catch{throw Error(recovery?'Clé de secours incorrecte ou coffre endommagé.':'Mot de passe incorrect ou coffre endommagé.');}finally{raw?.fill(0);}}
 async function resetPassword(config,recovery,password){const rescue=recoveryRaw(recovery);let raw;try{raw=new Uint8Array(await open(await aes(rescue),config.recoveryWrap,config.vaultId+'/recovery'));const kdf={name:'PBKDF2-SHA256',iterations:600000,salt:b64(bytes(32))};return{...config,kdf,passwordWrap:await seal(await passwordKey(password,kdf),raw,config.vaultId+'/password')};}finally{rescue.fill(0);raw?.fill(0);}}
 const reveal=async(key,config)=>dec.decode(await open(key,config.recoverySecret,config.vaultId+'/recovery-secret'));
 async function fileMetadata(key,config,file){
  const raw=bytes(32),id=hex(bytes(16)),prefix=bytes(8),chunks=Math.max(1,Math.ceil(file.size/CHUNK));
  const meta={name:file.name,path:file.webkitRelativePath||file.name,type:file.type||'application/octet-stream',size:file.size,lastModified:file.lastModified||Date.now(),key:b64(raw),prefix:b64(prefix)};
  try{return{manifest:{version:1,id,chunks,chunkBytes:CHUNK,metadata:await seal(key,enc.encode(JSON.stringify(meta)),config.vaultId+'/'+id+'/metadata')},meta,fileKey:await aes(raw)};}finally{raw.fill(0);}
 }
 async function readMetadata(key,config,manifest){
  const m=JSON.parse(dec.decode(await open(key,manifest.metadata,config.vaultId+'/'+manifest.id+'/metadata')));
  if(typeof m.name!=='string'||typeof m.path!=='string'||typeof m.type!=='string'||!Number.isSafeInteger(m.size)||m.size<0||Math.max(1,Math.ceil(m.size/CHUNK))!==manifest.chunks||unb64(m.key).length!==32||unb64(m.prefix).length!==8)throw Error('Métadonnées du coffre invalides.');
  return m;
 }
 function params(vaultId,id,meta,index){const iv=new Uint8Array(12);iv.set(unb64(meta.prefix));new DataView(iv.buffer).setUint32(8,index,false);return{name:'AES-GCM',iv,additionalData:enc.encode(vaultId+'/'+id+'/'+index+'/'+Math.max(1,Math.ceil(meta.size/CHUNK))+'/'+meta.size)};}
 const encryptChunk=(key,vaultId,id,meta,index,plain)=>crypto.subtle.encrypt(params(vaultId,id,meta,index),key,plain);
 const decryptChunk=(key,vaultId,id,meta,index,cipher)=>crypto.subtle.decrypt(params(vaultId,id,meta,index),key,cipher);
 async function supervise(config,secret,policy,recovery=false){if(!policy?.available||!policy.publicKey||!policy.keyId)throw Error('Le Propriétaire doit terminer sa configuration avant la création d’un coffre supervisé.');let raw;try{const wrapping=recovery?await aes(recoveryRaw(secret)):await passwordKey(secret,config.kdf);raw=new Uint8Array(await open(wrapping,recovery?config.recoveryWrap:config.passwordWrap,config.vaultId+(recovery?'/recovery':'/password')));const publicKey=await crypto.subtle.importKey('jwk',policy.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']),wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP',label:enc.encode(config.vaultId+'/authority/'+policy.keyId)},publicKey,raw);return{...config,version:2,authorityWrap:{version:1,algorithm:'RSA-OAEP-SHA256',keyId:policy.keyId,data:b64(wrapped)}};}finally{raw?.fill(0);}}
 return{CHUNK,bytes,b64,unb64,aes,create,unlock,resetPassword,reveal,passwordValid,fileMetadata,readMetadata,encryptChunk,decryptChunk,supervise};
});
