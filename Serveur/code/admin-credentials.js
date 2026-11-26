'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {isPending,isExpired}=require('./password-onboarding');
// Separate encrypted store: passwords never enter public user records or audit logs.
function createCredentialVault(directory){
 const keyFile=path.join(directory,'admin-credentials.key'),file=path.join(directory,'admin-credentials.json');let key;
 function getKey(){if(key)return key;try{key=fs.readFileSync(keyFile);}catch(e){if(e.code!=='ENOENT')throw e;try{fs.writeFileSync(keyFile,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(err){if(err.code!=='EEXIST')throw err;}key=fs.readFileSync(keyFile);}if(key.length!==32)throw Error('Clé des identifiants invalide.');return key;}
 function read(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 function write(data){const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file);}
 return {
  store(user,password){if(!isPending(user))throw Error('Seuls les codes provisoires peuvent être conservés par l’administrateur.');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',getKey(),iv);cipher.setAAD(Buffer.from(String(user.id)));const ciphertext=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]),data=read();data[user.id]={iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64'),at:new Date().toISOString(),authVersion:Number(user.authVersion||0),expiresAt:user.temporaryPasswordExpiresAt};write(data);},
  remove(id){const data=read();if(Object.hasOwn(data,id)){delete data[id];write(data);}},
  purgePersonal(users){const data=read(),allowed=new Set(users.filter(u=>isPending(u)&&!isExpired(u)).map(u=>String(u.id)));let changed=false;for(const id of Object.keys(data))if(!allowed.has(id)){delete data[id];changed=true;}if(changed)write(data);},
  list(users){const data=read();return users.map(u=>({id:u.id,username:u.username,displayName:u.displayName||u.username,available:isPending(u)&&!isExpired(u)&&Object.hasOwn(data,u.id)&&data[u.id].authVersion===Number(u.authVersion||0),kind:isPending(u)?u.passwordState:'personal',expiresAt:u.temporaryPasswordExpiresAt||null,updatedAt:data[u.id]?.at||null}));},
  reveal(user){const entry=read()[user.id];if(!entry||!isPending(user)||isExpired(user)||entry.authVersion!==Number(user.authVersion||0))return null;const decipher=crypto.createDecipheriv('aes-256-gcm',getKey(),Buffer.from(entry.iv,'base64'));decipher.setAAD(Buffer.from(String(user.id)));decipher.setAuthTag(Buffer.from(entry.tag,'base64'));return {username:user.username,password:Buffer.concat([decipher.update(Buffer.from(entry.ciphertext,'base64')),decipher.final()]).toString('utf8'),kind:user.passwordState,expiresAt:user.temporaryPasswordExpiresAt,updatedAt:entry.at};}
 };
}
module.exports={createCredentialVault};
