'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
async function digest(file){const h=crypto.createHash('sha256');for await(const block of fs.createReadStream(file))h.update(block);return h.digest('hex');}
async function inventory(root){const items=[];async function walk(file,relative){const st=await fs.promises.lstat(file);if(st.isSymbolicLink()||await fs.promises.realpath(file)!==file)throw Error('Lien symbolique interdit.');if(st.isDirectory()){items.push({relative,folder:true});for(const name of (await fs.promises.readdir(file)).sort())await walk(path.join(file,name),relative?relative+'/'+name:name);}else if(st.isFile())items.push({relative,folder:false,size:st.size,sha256:await digest(file)});else throw Error('Ce type de fichier ne peut pas être transféré.');}await walk(path.resolve(root),'');return items;}
async function transfer(source,destination){source=path.resolve(source);destination=path.resolve(destination);if(fs.existsSync(destination))throw Error('Destination existante ; aucun écrasement.');const parent=path.dirname(destination);if(await fs.promises.realpath(parent)!==parent)throw Error('Destination invalide.');
 try{await fs.promises.rename(source,destination);return;}catch(e){if(e.code!=='EXDEV')throw e;}
 const before=await inventory(source);for(const item of before){const from=path.join(source,...item.relative.split('/').filter(Boolean)),to=path.join(destination,...item.relative.split('/').filter(Boolean));if(item.folder)await fs.promises.mkdir(to,{mode:0o700});else{await fs.promises.copyFile(from,to,fs.constants.COPYFILE_EXCL);await fs.promises.chmod(to,0o600);}}
 const copied=await inventory(destination),current=await inventory(source);if(JSON.stringify(before)!==JSON.stringify(copied)||JSON.stringify(before)!==JSON.stringify(current))throw Error('La vérification du transfert a échoué. Les copies sont conservées ; aucune suppression de source.');
 // Both paths have been resolved by the caller. Only remove the fully verified source tree.
 for(const item of before.slice().reverse()){const file=path.join(source,...item.relative.split('/').filter(Boolean));if(item.folder)await fs.promises.rmdir(file);else await fs.promises.unlink(file);}
}
module.exports={transfer,inventory,digest};
