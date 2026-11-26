'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function createLocalLoginVault({safeStorage,directory,getOrigin,platform=process.platform}){
 const MAX_ACCOUNTS=50,key=name=>name.trim().toLocaleLowerCase('fr');
 function file(origin=getOrigin()){return path.join(directory,'local-login-'+crypto.createHash('sha256').update(origin).digest('hex').slice(0,24)+'.json');}
 function available(){return safeStorage.isEncryptionAvailable()&&(platform!=='linux'||typeof safeStorage.getSelectedStorageBackend==='function'&&safeStorage.getSelectedStorageBackend()!=='basic_text');}
 function validAccount(value){return typeof value?.username==='string'&&value.username.trim().length>0&&value.username.length<=128&&typeof value.password==='string'&&value.password.length>0&&value.password.length<=1024;}
 function read(origin=getOrigin()){
  let record;try{const f=file(origin),stat=fs.lstatSync(f);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>524288)throw Error('Coffre local invalide.');record=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){if(e.code==='ENOENT')return{accounts:[],lastUsername:null};throw Error('Les identifiants locaux ne peuvent pas être lus. Ils ont été conservés.');}
  if(record.origin!==origin||![1,2].includes(record.version)||typeof record.encrypted!=='string')throw Error('Coffre local incompatible. Les identifiants ont été conservés.');
  if(!available())throw Error('Le chiffrement sécurisé de ce compte est indisponible.');
  let value;try{value=JSON.parse(safeStorage.decryptString(Buffer.from(record.encrypted,'base64')));}catch{throw Error('Le coffre local ne peut pas être déchiffré sur ce compte utilisateur.');}
  if(record.version===1){if(!validAccount(value))throw Error('Identifiants locaux invalides.');return{accounts:[{username:value.username.trim(),password:value.password,lastUsedAt:0}],lastUsername:value.username.trim()};}
  if(!Array.isArray(value.accounts)||value.accounts.length>MAX_ACCOUNTS||!value.accounts.every(validAccount)||new Set(value.accounts.map(a=>key(a.username))).size!==value.accounts.length)throw Error('Liste de comptes locaux invalide.');
  if(value.migratedOrigins!==undefined&&(!Array.isArray(value.migratedOrigins)||value.migratedOrigins.length>50||!value.migratedOrigins.every(origin=>typeof origin==='string'&&origin.length<=2048)))throw Error('Historique de migration locale invalide. Les identifiants ont été conservés.');
  return{accounts:value.accounts.map(a=>({username:a.username.trim(),password:a.password,lastUsedAt:Number(a.lastUsedAt)||0})),lastUsername:typeof value.lastUsername==='string'?value.lastUsername:null,migratedOrigins:value.migratedOrigins||[],migrationsBlocked:value.migrationsBlocked===true};
 }
 function write(value){
  if(!available())throw Error('Le chiffrement sécurisé de ce compte est indisponible.');fs.mkdirSync(directory,{recursive:true});if(fs.lstatSync(directory).isSymbolicLink())throw Error('Dossier de mémorisation redirigé.');
  const f=file();try{if(fs.lstatSync(f).isSymbolicLink())throw Error('Coffre local redirigé.');}catch(e){if(e.code!=='ENOENT')throw e;}
  const tmp=f+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({version:2,origin:getOrigin(),encrypted:safeStorage.encryptString(JSON.stringify(value)).toString('base64')}),{mode:0o600,flag:'wx'});fs.renameSync(tmp,f);}finally{try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 function sorted(store){return store.accounts.slice().sort((a,b)=>Number(key(b.username)===key(store.lastUsername||''))-Number(key(a.username)===key(store.lastUsername||''))||b.lastUsedAt-a.lastUsedAt||a.username.localeCompare(b.username,'fr'));}
 return{
  migrateFrom(origin){
   if(origin===getOrigin())return{migrated:0};
   const current=read();
   if(current.migrationsBlocked||current.migratedOrigins?.includes(origin))return{migrated:0,alreadyMigrated:true};
   if(!fs.existsSync(file(origin)))return{migrated:0};
   const prior=read(origin),names=new Set(current.accounts.map(a=>key(a.username)));let added=0;
   for(const a of prior.accounts){if(!names.has(key(a.username))){current.accounts.push(a);names.add(key(a.username));added++;}}
   if(current.accounts.length>MAX_ACCOUNTS)throw Error('Les coffres ont été conservés séparément car leur total dépasse 50 comptes.');
   current.lastUsername=current.lastUsername||prior.lastUsername;
   current.migratedOrigins=[...(current.migratedOrigins||[]),origin];
   if(current.migratedOrigins.length>50)throw Error('Historique de migration plein. Les coffres ont été conservés séparément.');
   // Keep the old encrypted file intact. The encrypted receipt prevents a later
   // update from resurrecting credentials the user has deliberately forgotten.
   write(current);return{migrated:added};
  },
  status(){if(!available())return{available:false,saved:fs.existsSync(file()),accounts:[],protocol:2};const store=read();return{available:true,saved:store.accounts.length>0,protocol:2,accounts:sorted(store).map(a=>({username:a.username})),lastUsername:store.lastUsername};},
  fill(username){const store=read();if(username!==undefined&&(typeof username!=='string'||!username.trim()||username.length>128))throw Error('Compte enregistré invalide.');const record=username===undefined?sorted(store)[0]:store.accounts.find(a=>key(a.username)===key(username));if(!record)throw Error('Ce compte n’est pas enregistré sur ce PC.');return{username:record.username,password:record.password};},
  save(value){if(!validAccount(value))throw Error('Identifiants invalides.');const store=read(),username=value.username.trim(),index=store.accounts.findIndex(a=>key(a.username)===key(username));if(index<0&&store.accounts.length>=MAX_ACCOUNTS)throw Error('50 comptes sont déjà enregistrés. Retire un compte pour en ajouter un autre.');const record={username,password:value.password,lastUsedAt:Date.now()};if(index<0)store.accounts.push(record);else store.accounts[index]=record;store.lastUsername=username;write(store);return{ok:true};},
  touch(username){if(typeof username!=='string')throw Error('Compte enregistré invalide.');const store=read(),record=store.accounts.find(a=>key(a.username)===key(username));if(!record)return{ok:true};record.lastUsedAt=Date.now();store.lastUsername=record.username;write(store);return{ok:true};},
  clear(username){if(username===undefined){write({accounts:[],lastUsername:null,migrationsBlocked:true});return{ok:true};}if(typeof username!=='string'||!username.trim()||username.length>128)throw Error('Compte enregistré invalide.');const store=read(),remaining=store.accounts.filter(a=>key(a.username)!==key(username));if(remaining.length===store.accounts.length)return{ok:true};store.accounts=remaining;if(key(store.lastUsername||'')===key(username))store.lastUsername=remaining.slice().sort((a,b)=>b.lastUsedAt-a.lastUsedAt)[0]?.username||null;write(store);return{ok:true};}
 };
}
module.exports={createLocalLoginVault};
