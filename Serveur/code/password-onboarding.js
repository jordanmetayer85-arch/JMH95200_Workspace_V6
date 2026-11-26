'use strict';
const crypto=require('crypto');
const isPending=user=>['activation','temporary'].includes(user?.passwordState);
const isExpired=user=>isPending(user)&&(!Number.isFinite(user.temporaryPasswordExpiresAt)||Date.now()>user.temporaryPasswordExpiresAt);
function validatePersonalPassword(password,confirmation){
 if(typeof password!=='string'||typeof confirmation!=='string'||password!==confirmation)return 'Les deux mots de passe ne correspondent pas.';
 if([...password].length<12)return 'Choisis un mot de passe personnel d’au moins 12 caractères.';
 if(Buffer.byteLength(password,'utf8')>72)return 'Le mot de passe dépasse 72 octets. Choisis une phrase un peu plus courte.';
 return null;
}
function markTemporary(user,kind){user.passwordState=kind;user.temporaryPasswordExpiresAt=Date.now()+24*60*60*1000;user.authVersion=Number(user.authVersion||0)+1;}
function createPasswordFlow({readUsers,writeUsers,credentialVault,bcrypt,audit,io,publicUser}){
 const regenerate=req=>new Promise((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve()));
 function challengeUser(req){
  const challenge=req.session.passwordChallenge;
  if(!challenge||challenge.expiresAt<Date.now())return null;
  const user=readUsers().find(u=>String(u.id)===challenge.userId);
  if(!user?.active||!isPending(user)||isExpired(user)||Number(user.authVersion||0)!==challenge.version||user.passwordHash!==challenge.passwordHash)return null;
  return user;
 }
 function status(req){const user=challengeUser(req);return user?{requiresPasswordChange:true,reason:user.passwordState,username:user.username,expiresAt:req.session.passwordChallenge.expiresAt}:null;}
 async function begin(req,res,user){
  if(isExpired(user))return res.status(401).json({error:'Ce code d’activation ou mot de passe provisoire a expiré. Demande-en un nouveau à l’administrateur.'});
  await regenerate(req);
  req.session.passwordChallenge={userId:String(user.id),version:Number(user.authVersion||0),passwordHash:user.passwordHash,expiresAt:Date.now()+10*60*1000,nonce:crypto.randomBytes(24).toString('hex')};
  res.set('Cache-Control','no-store').json(status(req)||{requiresPasswordChange:true,reason:user.passwordState,username:user.username});
 }
 async function complete(req,res,next){
  try{
   if(process.env.JMH_SERVER_TYPE==='nas'&&!req.secure)return res.status(426).json({error:'Utilise la connexion HTTPS de JMH pour choisir ton mot de passe.'});
   const candidate=challengeUser(req);if(!candidate)return res.status(401).json({error:'La demande a expiré ou a été remplacée. Reconnecte-toi avec le dernier code provisoire.'});
   const password=req.body?.newPassword,validation=validatePersonalPassword(password,req.body?.confirmPassword);if(validation)return res.status(400).json({error:validation});
   if(await bcrypt.compare(password,candidate.passwordHash))return res.status(400).json({error:'Choisis un mot de passe personnel différent du code provisoire.'});
   const passwordHash=await bcrypt.hash(password,12),challenge=req.session.passwordChallenge;
   // Another request, reset or suspension may have happened during hashing.
   if(!challengeUser(req)||!challenge)return res.status(409).json({error:'Le compte a changé. Reconnecte-toi avant de réessayer.'});
   await regenerate(req);
   const records=readUsers(),user=records.find(u=>String(u.id)===String(candidate.id));
   if(!user?.active||!isPending(user)||isExpired(user)||user.passwordHash!==challenge.passwordHash||Number(user.authVersion||0)!==challenge.version)return res.status(409).json({error:'Le compte a changé. Reconnecte-toi avant de réessayer.'});
   user.passwordHash=passwordHash;user.passwordState='personal';delete user.temporaryPasswordExpiresAt;user.authVersion=Number(user.authVersion||0)+1;user.lastLogin=new Date().toISOString();
   credentialVault.remove(user.id);writeUsers(records);
   for(const socket of io.sockets.sockets.values())if(String(socket.request.session?.user?.id)===String(user.id))socket.disconnect(true);
   req.session.user=publicUser(user);req.session.authVersion=user.authVersion;
   audit('password_personalized','Mot de passe personnel choisi ; le code provisoire est révoqué',user.username);
   res.set('Cache-Control','no-store').json({user:req.session.user,passwordChanged:true});
  }catch(error){next(error);}
 }
 return{begin,complete,status};
}
module.exports={isPending,isExpired,markTemporary,validatePersonalPassword,createPasswordFlow};
