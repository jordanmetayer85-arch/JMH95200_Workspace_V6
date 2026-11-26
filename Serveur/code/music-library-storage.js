'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const AUDIO_EXTENSIONS=new Set(['.mp3','.flac','.m4a','.aac','.ogg','.opus','.wav','.wma','.aiff','.aif','.amr','.mpc']);
async function copyNewAudio(source,target){
  // Stream a new file without copying chmod bits: TrueNAS SMB ACLs may prohibit chmod.
  const {pipeline}=require('stream/promises');const output=fs.createWriteStream(target,{flags:'wx',mode:0o666});let created=false;
  output.once('open',()=>{created=true});
  try{await pipeline(fs.createReadStream(source),output)}catch(e){if(created)try{await fs.promises.unlink(target)}catch{}throw e;}
}
function centralMusicFolder(storageRoot){
  const root=path.resolve(storageRoot),folder=path.join(root,'Medias','Musique','Ajouts');
  for(const part of ['','Medias','Medias/Musique','Medias/Musique/Ajouts']){
    const dir=path.join(root,part);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
    if(fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)throw Error('Dossier de musique redirigé.');
  }return folder;
}
function createMusicUploadRouter({express,requireAuth,requireAdmin,requirePermission,DATA_DIR,storageRoot,importFile}){
  const router=express.Router(),multer=require('multer'),temporary=path.join(DATA_DIR,'music-upload-staging');
  fs.mkdirSync(temporary,{recursive:true,mode:0o700});
  const upload=multer({dest:temporary,limits:{fileSize:500*1024*1024,files:1,fields:1,fieldSize:1024},fileFilter:(req,file,cb)=>cb(null,AUDIO_EXTENSIONS.has(path.extname(file.originalname).toLowerCase()))});
  let queue=Promise.resolve();
  router.use(requireAuth);if(requirePermission)router.use(requirePermission('canAccessMusic'),requirePermission('canUploadStorage'));
  if(requirePermission)router.use(requirePermission('canAccessStorage'));
  router.post('/',(req,res,next)=>upload.single('file')(req,res,error=>{
    if(error)return res.status(400).json({error:error.code==='LIMIT_FILE_SIZE'?'Ce fichier dépasse 500 Mo.': 'Envoi invalide : un fichier audio à la fois.'});
    if(!req.file)return res.status(400).json({error:'Choisis un fichier audio compatible.'});
    const run=async()=>{
      const staged=req.file.path;let target;
      try{
        const relative=req.body.relativePath||req.file.originalname;
        if(typeof relative!=='string'||relative.length>1000||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(x=>!x||x==='.'||x==='..'||/[\x00-\x1f<>:"|?*]/.test(x)))throw Error('Nom de fichier ou de dossier invalide.');
        if(!AUDIO_EXTENSIONS.has(path.extname(relative).toLowerCase()))throw Error('Format audio non pris en charge.');
        const folder=centralMusicFolder(storageRoot),bytes=fs.statSync(staged).size;
        if(!bytes)throw Error('Ce fichier est vide.');
        const space=fs.statfsSync(folder);if(space.bavail*space.bsize<bytes+50*1024*1024)throw Error('Le NAS ne dispose pas d’assez de place.');
        const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(staged))digest.update(chunk);
        const sha=digest.digest('hex'),indexFile=path.join(DATA_DIR,'music_upload_index.json');let index={};
        if(fs.existsSync(indexFile))index=JSON.parse(fs.readFileSync(indexFile,'utf8'));
        let previous=index[sha];
        const sameName=path.resolve(folder,relative);
        if(!previous&&sameName.startsWith(folder+path.sep)&&fs.existsSync(sameName)&&fs.lstatSync(sameName).isFile()&&!fs.lstatSync(sameName).isSymbolicLink()&&fs.realpathSync(sameName)===sameName&&fs.statSync(sameName).size===bytes){
          const candidate=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(sameName))candidate.update(chunk);
          if(candidate.digest('hex')===sha)previous=sameName;
        }
        if(previous&&path.resolve(previous).startsWith(folder+path.sep)&&fs.existsSync(previous)&&!fs.lstatSync(previous).isSymbolicLink()&&fs.realpathSync(previous)===previous){
          const result=await importFile(previous,req.session.user);return res.json({...result,duplicates:Math.max(1,result.duplicates||0),filename:path.basename(previous),destination:'Medias/Musique/Ajouts',alreadyStored:true});
        }
        let parent=folder;for(const part of relative.split('/').slice(0,-1)){
          parent=path.join(parent,part);fs.mkdirSync(parent,{recursive:true});if(fs.lstatSync(parent).isSymbolicLink()||fs.realpathSync(parent)!==parent)throw Error('Dossier redirigé.');
        }
        const name=path.basename(relative),ext=path.extname(name),stem=path.basename(name,ext);target=path.join(parent,name);
        for(let i=1;fs.existsSync(target);i++)target=path.join(parent,stem+' ('+i+')'+ext);
        await copyNewAudio(staged,target);
        const result=await importFile(target,req.session.user);
        if(!result.imported&&!result.duplicates)throw Error('Le NAS n’a pas pu ajouter ce titre à la bibliothèque.');
        index[sha]=target;const tmp=indexFile+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(index),{mode:0o600});fs.renameSync(tmp,indexFile);
        return res.json({...result,filename:path.basename(target),destination:'Medias/Musique/Ajouts',alreadyStored:false});
      }catch(error){return res.status(400).json({error:error.message});}
      finally{try{fs.unlinkSync(staged)}catch{}}
    };
    const task=queue.then(run);queue=task.catch(()=>{});task.catch(next);
  }));return router;
}
module.exports={centralMusicFolder,createMusicUploadRouter,AUDIO_EXTENSIONS,copyNewAudio};
