'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function createClientDiagnosticsRouter({express,DATA_DIR,requireAuth,requireAdmin}){
 const router=express.Router(),directory=path.join(DATA_DIR,'client-diagnostics');router.use(requireAuth,requireAdmin,(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.post('/',(req,res,next)=>{(async()=>{
  const input=req.body;if(!input||input.schema!==1||input.source!=='local-client'||input.platform!=='win32'||typeof input.device!=='string'||input.device.length>120)return res.status(400).json({error:'Diagnostic Windows invalide.'});
  const text=JSON.stringify(input);if(Buffer.byteLength(text)>262144)return res.status(413).json({error:'Diagnostic trop volumineux.'});
  const report={schema:1,receivedAt:new Date().toISOString(),diagnostic:Object.fromEntries(['schema','device','platform','source','at','cpu','memory','jmh','temperatures','temperatureSupport','versions','windows','recentJmhEvents','build'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]))};
  await fs.mkdir(directory,{recursive:true,mode:0o700});const id=crypto.randomUUID();await fs.writeFile(path.join(directory,id+'.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});res.status(201).json({ok:true,id,receivedAt:report.receivedAt});
 })().catch(next);});
 router.get('/',(req,res,next)=>{(async()=>{let files;try{files=await fs.readdir(directory);}catch(error){if(error.code==='ENOENT')return res.json({reports:[]});throw error;}const reports=[];for(const name of files.filter(x=>/^[a-f0-9-]{36}\.json$/.test(x)).slice(-100)){const stat=await fs.lstat(path.join(directory,name));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>300000)continue;const data=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));reports.push({id:name.slice(0,-5),device:data.diagnostic.device,receivedAt:data.receivedAt,diagnostic:data.diagnostic});}res.json({reports:reports.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt))});})().catch(next);});
 return router;
}
module.exports={createClientDiagnosticsRouter};
