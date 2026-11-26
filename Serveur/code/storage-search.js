'use strict';
// A bounded in-memory name index. No file content, symlinks or trash are indexed.
const fs=require('fs'),path=require('path');
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[\s_-]+/g,' ').trim();
function createStorageSearch({ttl=120000,maxEntries=200000,maxScanMs=30000}={}){
 let state=null;
 function invalidate(){if(state)state.invalid=true;}
 function build(root){
  const next={root,items:[],at:0,invalid:false,truncated:false,promise:null};state=next;
  next.promise=(async()=>{
   const queue=[{absolute:root,relative:''}],started=Date.now();
   for(let head=0;head<queue.length;head++){
    if(next.invalid||next.items.length>=maxEntries||Date.now()-started>maxScanMs){next.truncated=true;break;}
    const dir=queue[head];let entries;try{entries=await fs.promises.readdir(dir.absolute,{withFileTypes:true});}catch{continue;}
    for(const entry of entries){
     if(entry.name==='.jmh_trash'||/sensible/i.test(entry.name)||entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))continue;
     if(next.items.length>=maxEntries){next.truncated=true;break;}
     const relative=dir.relative?dir.relative+'/'+entry.name:entry.name;
     next.items.push({name:entry.name,path:relative,type:entry.isDirectory()?'folder':'file',key:normalize(entry.name)});
     if(entry.isDirectory())queue.push({absolute:path.join(dir.absolute,entry.name),relative});
    }
    if(head%16===0)await new Promise(r=>setImmediate(r));
   }
   next.at=Date.now();return next;
  })();return next;
 }
 function warm(root){if(!state||state.root!==root||state.invalid||state.at&&Date.now()-state.at>ttl)return build(root);return state;}
 async function search(root,query,accept,aborted=()=>false){
  const index=warm(root),q=normalize(query);if(q.length<2)return{items:[],partial:false};
  // A cold scan may be slow on disks waking from standby. Keep it running without
  // blocking Node; subsequent queries reuse it. Never cache a user's permission result.
  let timer;try{await Promise.race([index.promise,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}
  const matches=index.items.filter(item=>item.key.includes(q)&&accept(item.path)).sort((a,b)=>(a.type===b.type?0:a.type==='folder'?-1:1)||a.path.localeCompare(b.path,'fr',{sensitivity:'base'}));
  const items=[];
  for(const item of matches){
   if(aborted()||items.length>=200)break;
   const full=path.join(root,...item.path.split('/'));let stat;try{stat=await fs.promises.lstat(full);}catch{continue;}
   if(stat.isSymbolicLink()||!stat.isFile()&&!stat.isDirectory())continue;
   // Re-check every ancestor: a directory may have been replaced since indexing.
   let current=root,safe=true;for(const part of item.path.split('/').slice(0,-1)){current=path.join(current,part);try{if((await fs.promises.lstat(current)).isSymbolicLink()){safe=false;break;}}catch{safe=false;break;}}
   if(!safe)continue;
   items.push({name:item.name,path:item.path,type:stat.isDirectory()?'folder':'file',size:stat.isDirectory()?0:stat.size,modifiedAt:stat.mtime.toISOString(),extension:stat.isDirectory()?'':path.extname(item.name).toLowerCase()});
  }
  return{items,partial:!index.at||index.truncated||matches.length>200};
 }
 return{search,warm,invalidate};
}
module.exports={createStorageSearch,normalize};
