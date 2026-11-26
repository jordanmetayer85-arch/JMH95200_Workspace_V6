'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function createNativeToolsRouter({express,DATA_DIR,requireAuth}){
 const router=express.Router(),root=path.join(DATA_DIR,'private-notes');router.use(requireAuth,(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const file=user=>path.join(root,crypto.createHash('sha256').update(String(user.id)).digest('hex')+'.json');
 router.get('/',(req,res,next)=>{fs.readFile(file(req.session.user),'utf8').then(value=>res.json(JSON.parse(value))).catch(error=>error.code==='ENOENT'?res.json({note:''}):next(error));});
 router.put('/',(req,res,next)=>{(async()=>{if(typeof req.body?.note!=='string'||Buffer.byteLength(req.body.note)>65536)return res.status(400).json({error:'La note doit contenir au maximum 64 Ko.'});await fs.mkdir(root,{recursive:true,mode:0o700});const target=file(req.session.user),temporary=target+'.'+crypto.randomUUID()+'.tmp',value={note:req.body.note,updatedAt:new Date().toISOString()};await fs.writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});await fs.rename(temporary,target);res.json(value);})().catch(next);});return router;
}
module.exports={createNativeToolsRouter};
