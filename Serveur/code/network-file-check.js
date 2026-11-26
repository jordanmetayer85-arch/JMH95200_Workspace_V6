'use strict';
const fs=require('node:fs');
// SMB timeouts must never block Electron's main/UI process. Keep a ceiling on
// pending kernel requests, including ones whose user-visible timer expired.
function createNetworkFileCheck({lstat=file=>fs.promises.lstat(file),timeout=5000,maxPending=2}={}){
  let pending=0;
  return async file=>{
    if(pending>=maxPending)throw Error('Le partage NAS ne répond pas. Réessayez après sa reconnexion.');
    pending++;let timer;
    const request=Promise.resolve().then(()=>lstat(file));
    request.then(()=>pending--,()=>pending--);
    try{const stat=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Le partage NAS ne répond pas à temps.')),timeout);})]);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Fichier NAS inaccessible ou redirigé.');return stat;}
    finally{clearTimeout(timer);}
  };
}
module.exports={createNetworkFileCheck};
