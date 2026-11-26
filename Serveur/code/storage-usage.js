'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function createStorageUsage({ttl=300000,maxEntries=100000,timeout=15000,accept=()=>true}={}){
 let value={bytes:null,files:null,folders:null,at:null,truncated:false},running=null,next=0;
 async function scan(root){let bytes=0,files=0,folders=0,entries=0,truncated=false;const todo=[{dir:root,depth:0}],deadline=Date.now()+timeout;
  while(todo.length){if(Date.now()>deadline||entries>=maxEntries){truncated=true;break;}const {dir,depth}=todo.pop();let children;try{children=await fs.readdir(dir,{withFileTypes:true});}catch{truncated=true;continue;}
   for(const child of children){if(++entries>maxEntries||Date.now()>deadline){truncated=true;break;}if(child.name==='.jmh_trash'||/sensible/i.test(child.name)||child.isSymbolicLink())continue;const file=path.join(dir,child.name);if(!accept(path.relative(root,file).split(path.sep).join('/')))continue;if(child.isDirectory()){folders++;if(depth<64)todo.push({dir:file,depth:depth+1});else truncated=true;}else if(child.isFile()){try{const stat=await fs.lstat(file);if(stat.isFile()&&!stat.isSymbolicLink()){bytes+=stat.size;files++;}}catch{truncated=true;}}if(entries%128===0)await new Promise(setImmediate);}await new Promise(resolve=>setTimeout(resolve,5));
  }value={bytes,files,folders,at:new Date().toISOString(),truncated};
 }
 function get(root){if(!running&&Date.now()>=next){running=scan(root).catch(()=>{}).finally(()=>{running=null;next=Date.now()+ttl;});}return{...value,scanning:Boolean(running)};}
 return{get};
}
module.exports={createStorageUsage};
