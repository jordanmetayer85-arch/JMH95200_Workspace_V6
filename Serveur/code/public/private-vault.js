(()=>{
 'use strict';const C=window.JMHVaultCrypto,el=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const page=make('section',null,'page studio-page private-vault hidden');page.id='privateVaultPage';WORKSPACE_PAGES[page.id]=['Contenu sensible','Ton coffre personnel chiffré.'];
 page.innerHTML='<div class="vault-heading"><div><span class="studio-eyebrow">TON ESPACE CHIFFRÉ</span><h1>Sensible</h1><p>Un coffre chiffré par compte. La supervision par le Propriétaire est activée à la création du coffre ou lors de son premier déverrouillage confirmé.</p></div><button id="vaultLock" type="button" class="secondary" hidden>Verrouiller</button></div><div id="vaultStatus" role="status" aria-live="polite"></div><div id="vaultPanel"></div>';
 document.querySelector('#appView main').append(page);
 const nav=make('button',null,'nav');nav.type='button';nav.dataset.page=page.id;nav.append(JMHStudio.icon('shield'),make('span','Contenu sensible'));document.querySelector('.nav[data-page="personalVideosPage"]').after(nav);nav.onclick=()=>void navigateWorkspace(page.id);
 let consentPrompt=null;let owner=null,key=null,configuration=null,revision=null,entries=[],generation=0,upload=null,preview=null,warning=null,activityAt=Date.now(),timer=null,lastSessionCheck=0,loading=false;
 const panel=el('vaultPanel'),status=el('vaultStatus');
 function message(text,error=false){status.textContent=text;status.classList.toggle('vault-error',error);}
 function visible(){return!page.classList.contains('hidden')&&!el('appView').classList.contains('hidden');}
 const action=(text,fn,cls='secondary')=>{const b=make('button',text,cls);b.type='button';b.onclick=fn;return b;};
 async function request(route,options={}){return api('/api/private-vault'+route,options);}
 async function workerMessage(value){
  if(!navigator.serviceWorker)throw Error('Ce navigateur ne propose pas la lecture privée en continu.');
  await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Ferme puis rouvre JMH pour activer le lecteur privé.')),5000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(t);resolve();},{once:true});});
  return new Promise((resolve,reject)=>{const channel=new MessageChannel(),t=setTimeout(()=>reject(Error('Le lecteur privé ne répond pas. Rouvre le coffre.')),5000);channel.port1.onmessage=e=>{clearTimeout(t);channel.port1.close();e.data?.ok?resolve():reject(Error('Lecteur privé indisponible.'));};navigator.serviceWorker.controller.postMessage(value,[channel.port2]);});
 }
 function closePreview(){if(!preview)return;preview.querySelectorAll('audio,video').forEach(p=>{p.pause();p.removeAttribute('src');p.load();});preview.close();preview.remove();preview=null;activityAt=Date.now();}
 function lock(reason='Ton coffre est verrouillé.'){
  generation++;consentPrompt?.(false);upload?.abort();upload=null;key=null;configuration=null;revision=null;entries=[];lastSessionCheck=0;closePreview();warning?.close();warning?.remove();warning=null;
  document.querySelectorAll('.vault-secret-dialog').forEach(d=>{d.querySelectorAll('input').forEach(i=>i.value='');d.close();d.remove();});
  navigator.serviceWorker?.controller?.postMessage({type:'vault-revoke'});panel.replaceChildren();el('vaultLock').hidden=true;message(reason);owner=me?.id??null;
  if(visible())showLocked();
 }
 let passwordFieldId=0;
 function passwordField(form,label,confirm=false){
  const box=make('div',null,'vault-field'),caption=make('label',label),row=make('div',null,'vault-password-control'),input=make('input');
  input.id='vault-password-'+(++passwordFieldId);caption.htmlFor=input.id;input.type='password';input.autocomplete=confirm?'new-password':'off';input.required=true;input.minLength=12;input.maxLength=512;
  const toggle=action('Afficher',()=>{setVisible(input.type==='password');input.focus({preventScroll:true});},'secondary vault-password-toggle');toggle.setAttribute('aria-controls',input.id);
  function setVisible(show){input.type=show?'text':'password';toggle.textContent=show?'Masquer':'Afficher';toggle.setAttribute('aria-pressed',String(show));toggle.setAttribute('aria-label',(show?'Masquer : ':'Afficher : ')+label);}
  setVisible(false);form.addEventListener('reset',()=>setVisible(false));row.append(input,toggle);box.append(caption,row);form.append(box);return input;
 }
 function formCard(title,description){const form=make('form',null,'vault-card');form.append(make('h2',title),make('p',description));return form;}
 async function askSupervision(){
  return new Promise(resolve=>{const dialog=make('dialog',null,'vault-card vault-supervision-dialog');let finished=false;
   const finish=accepted=>{if(finished)return;finished=true;consentPrompt=null;dialog.close();dialog.remove();resolve(accepted);};consentPrompt=finish;
   dialog.append(make('h2','Autoriser la supervision du coffre'),make('p','Pour continuer à utiliser ce coffre dans JMH, tu dois autoriser le Propriétaire à consulter, censurer ou retirer tous ses fichiers, y compris ceux déjà présents.'),make('p','Ton mot de passe habituel et ta clé de secours restent inchangés. Les fichiers restent chiffrés. Après ton accord, saisis le mot de passe du coffre pour terminer la conversion.'),make('p','Si tu refuses, le coffre reste bloqué dans JMH. Aucun fichier ne sera supprimé ; tu pourras revenir accepter plus tard.'),action('Autoriser la supervision',()=>finish(true),''),action('Refuser — garder le coffre bloqué',()=>finish(false)));
   dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});document.body.append(dialog);dialog.showModal();
  });
 }
 async function configured(){const state=await request('/status');return state.configured;}
 async function showLocked(){
  if(loading||!me||!visible())return;loading=true;const token=generation,user=me.id;owner=user;
  try{
   if(!window.isSecureContext||!crypto.subtle){const card=formCard('Une connexion HTTPS est nécessaire','Le coffre ne s’ouvre pas sur une adresse HTTP. Utilise l’adresse HTTPS privée du NAS ou configure le client JMH avec cette adresse.');const link=make('a','Ouvrir le guide HTTPS');link.href='/guide-coffre.html';link.target='_blank';link.rel='noopener';card.append(link);if(window.jmhDesktop?.openConnectionSettings)card.append(action('Configurer la connexion HTTPS',()=>window.jmhDesktop.openConnectionSettings()));panel.replaceChildren(card);return;}
   const exists=await configured(),policy=await request('/supervision'),existingConfig=exists?(await request('/config')).config:null,needsSupervision=exists&&existingConfig.version===1&&policy.required;if(token!==generation||me?.id!==user||!visible())return;
   let supervisionAuthorized=false;if(needsSupervision){supervisionAuthorized=await askSupervision();if(token!==generation||me?.id!==user||!visible())return;if(!supervisionAuthorized){const blocked=formCard('Accès au coffre bloqué','La supervision du Propriétaire n’a pas été autorisée. Tes fichiers chiffrés sont conservés. Pour retrouver l’accès dans JMH, accepte la supervision puis utilise ton mot de passe habituel.');blocked.append(action('Revoir la demande de supervision',()=>void showLocked()));panel.replaceChildren(blocked);message('Coffre verrouillé · supervision non autorisée.');return;}}
   const form=formCard(exists?'Déverrouiller mon coffre':'Créer mon coffre personnel',exists?'Ton mot de passe de coffre reste sur cet appareil. La connexion à JMH ne déverrouille jamais le coffre.':'Choisis un mot de passe différent de celui de JMH, de 12 caractères au minimum. Une clé de secours personnelle sera créée sur ton appareil.');
   let consent=null;if((!exists||needsSupervision)&&policy.required){form.append(make('p',needsSupervision?'Au déverrouillage, ce coffre sera automatiquement converti en coffre supervisé. Le Propriétaire pourra consulter, censurer ou retirer tous ses fichiers, y compris ceux déjà présents. Ton mot de passe, ta clé de secours et tes fichiers sont conservés.':'Ce nouveau coffre est supervisé : le Propriétaire pourra en consulter, censurer ou retirer les fichiers. Il ne s’agit pas d’un coffre privé inaccessible au Propriétaire.','vault-note'));const label=make('label','Je comprends et j’accepte que le Propriétaire puisse consulter et modérer ce coffre.'),input=make('input');input.type='checkbox';input.required=true;input.id='vaultSupervisionConsent';label.prepend(input);consent=input;if(!needsSupervision)form.append(label);else input.checked=supervisionAuthorized;}
   const password=passwordField(form,'Mot de passe du coffre'),confirm=exists?null:passwordField(form,'Répéter le mot de passe',true),submit=make('button',needsSupervision?'Déverrouiller et activer la supervision':exists?'Déverrouiller':'Créer mon coffre');submit.type='submit';form.append(submit);
   if(exists)form.append(action('Mot de passe oublié · utiliser ma clé de secours',()=>showRecovery()));
   form.onsubmit=async e=>{
    e.preventDefault();if(submit.disabled)return;submit.disabled=true;const pass=password.value,repeat=confirm?.value,accepted=supervisionAuthorized||consent?.checked===true;form.reset();const intent=++generation;
    try{
     let result;
     if(exists){const response=await request('/config');const unlocked=await C.unlock(response.config,pass);result={key:unlocked,config:response.config,revision:response.revision};if(response.config.version===1&&policy.required){if(!accepted)throw Error('Confirme la supervision avant de poursuivre.');message('Activation de la supervision… Tes fichiers restent en place.');const updated=await C.supervise(response.config,pass,policy);if(intent!==generation||me?.id!==user||!visible())return;const saved=await request('/config',{method:'PUT',body:JSON.stringify({config:updated,revision:response.revision,supervisionConsent:true})});result.config=updated;result.revision=saved.revision;}}
     else{C.passwordValid(pass,repeat);result=await C.create(pass);if(policy.required){if(!accepted)throw Error('Confirme la supervision avant de créer ce coffre.');result.config=await C.supervise(result.config,pass,policy);}if(intent!==generation||me?.id!==user||!visible())return;const response=await request('/config',{method:'PUT',body:JSON.stringify({config:result.config,supervisionConsent:accepted})});result.revision=response.revision;}
     if(intent!==generation||me?.id!==user||!visible())return;
     key=result.key;lastSessionCheck=0;configuration=result.config;revision=result.revision;activityAt=Date.now();el('vaultLock').hidden=false;message(configuration.version===2?'Coffre supervisé déverrouillé · le Propriétaire peut en consulter et modérer le contenu.':'Ancien coffre privé déverrouillé · aucune conversion effectuée.');await loadFiles();if(!exists)await showKey(true);
    }catch(error){if(intent===generation)message(error.message,true);}finally{submit.disabled=false;}
   };panel.replaceChildren(form);
  }catch(error){if(token===generation)message(error.message,true);}finally{loading=false;}
 }
 async function showRecovery(){
  const token=generation,user=me?.id;try{
   const [initial,policy]=await Promise.all([request('/config'),request('/supervision')]);if(token!==generation||me?.id!==user||!visible())return;const needsSupervision=initial.config.version===1&&policy.required;
   const form=formCard('Retrouver mon coffre','Ta clé personnelle permet de définir un nouveau mot de passe du coffre. Le mot de passe du compte JMH ne suffit pas.');let consent=null;
   if(needsSupervision){form.append(make('p','Après récupération, ton coffre sera converti automatiquement en coffre supervisé : le Propriétaire pourra consulter et modérer les fichiers déjà présents et les prochains imports. Les fichiers et ta clé de secours sont conservés.','vault-note'));const label=make('label','Je comprends et j’accepte la supervision de ce coffre.'),check=make('input');check.type='checkbox';check.id='vaultRecoverySupervisionConsent';check.required=true;label.prepend(check);form.append(label);consent=check;}
   const rescue=passwordField(form,'Clé de secours JMH1'),password=passwordField(form,'Nouveau mot de passe du coffre'),repeat=passwordField(form,'Répéter le nouveau mot de passe',true),submit=make('button','Définir le nouveau mot de passe');rescue.minLength=64;submit.type='submit';form.append(submit,action('Annuler',()=>void showLocked()));panel.replaceChildren(form);
   form.onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;const secret=rescue.value,pass=password.value,again=repeat.value,accepted=consent?.checked===true;form.reset();const intent=++generation;
    try{C.passwordValid(pass,again);const response=await request('/config');let updated=await C.resetPassword(response.config,secret,pass),supervisionConsent=false;if(updated.version===1&&policy.required){if(!accepted)throw Error('Confirme la supervision avant de poursuivre.');updated=await C.supervise(updated,pass,policy);supervisionConsent=true;}if(intent!==generation||me?.id!==user||!visible())return;const save=await request('/config',{method:'PUT',body:JSON.stringify({config:updated,revision:response.revision,supervisionConsent})});const unlocked=await C.unlock(updated,pass);if(intent!==generation||me?.id!==user||!visible())return;configuration=updated;revision=save.revision;key=unlocked;lastSessionCheck=0;activityAt=Date.now();el('vaultLock').hidden=false;message(updated.version===2?'Mot de passe du coffre modifié. Ce coffre est supervisé par le Propriétaire. Tes fichiers sont conservés.':'Mot de passe du coffre modifié. Tes fichiers sont conservés.');await loadFiles();}catch(error){if(intent===generation)message(error.message,true);}finally{submit.disabled=false;}};
  }catch(error){if(token===generation)message(error.message,true);}
 }
 async function loadFiles(){
  const token=generation,current=key,config=configuration;const manifests=await request('/files'),values=[];
  for(const manifest of manifests){if(token!==generation||!key)return;const meta=await C.readMetadata(current,config,manifest),fileKey=await C.aes(C.unb64(meta.key));delete meta.key;values.push({manifest,meta,fileKey});}
  if(token!==generation||!key)return;entries=values.sort((a,b)=>b.meta.lastModified-a.meta.lastModified);renderFiles();
 }
 function renderFiles(){
  const toolbar=make('div',null,'vault-toolbar'),files=make('input');files.type='file';files.multiple=true;files.hidden=true;files.setAttribute('aria-label','Importer tes fichiers dans le coffre');files.onchange=()=>{const chosen=[...files.files];files.value='';void importFiles(chosen);};
  const folder=make('input');folder.type='file';folder.multiple=true;folder.webkitdirectory=true;folder.hidden=true;folder.onchange=()=>{const chosen=[...folder.files];folder.value='';void importFiles(chosen);};
  if(configuration.version===1)toolbar.append(action('Convertir volontairement en coffre supervisé',()=>void superviseExisting()));
  toolbar.append(action('Importer tes fichiers',()=>files.click(),''),action('Importer un dossier',()=>folder.click()),action('Ma clé de secours',()=>void showKey()),files,folder);
  const note=make('p',(configuration.version===2?'COFFRE SUPERVISÉ — le Propriétaire peut consulter, censurer ou retirer les fichiers. ':'ANCIEN COFFRE PRIVÉ — inaccessible au Propriétaire sans conversion volontaire. ')+'Tous les formats peuvent être conservés. La lecture intégrée dépend des formats pris en charge par ton appareil. Les originaux sélectionnés restent à leur emplacement.','vault-note'),grid=make('div',null,'vault-file-grid');
  if(!entries.length)grid.append(make('p','Ton coffre est vide. Importe tes premiers fichiers pour commencer.','vault-empty'));
  for(const entry of entries){const row=make('article',null,'vault-file'),info=make('div');row.append(JMHStudio.icon(/^image\//.test(entry.meta.type)?'photo':/^video\//.test(entry.meta.type)?'video':/^audio\//.test(entry.meta.type)?'music':'folder'));info.append(make('strong',entry.meta.name),make('small',entry.meta.path+' · '+formatBytes(entry.meta.size)));row.append(info);if(entry.manifest.moderation){info.append(make('p','Censuré par le Propriétaire : '+entry.manifest.moderation.reason));row.append(action('Contester la censure',()=>window.JMHAppeals.create(entry.manifest.moderation.id)));}else row.append(action('Ouvrir',()=>void viewFile(entry)),action('Télécharger',()=>void download(entry)));grid.append(row);}
  panel.replaceChildren(toolbar,note,grid);
 }
 async function superviseExisting(){if(!key||configuration.version!==1)return;const original=configuration,rev=revision,form=formCard('Conversion volontaire vers un coffre supervisé','Après conversion, le Propriétaire pourra lire et modérer tous les fichiers de ce coffre, y compris ceux déjà présents. Cette supervision ne peut pas être retirée depuis ton compte. Tu peux annuler et conserver ton coffre privé ; tes fichiers restent inchangés.');const password=passwordField(form,'Mot de passe actuel du coffre'),label=make('label','J’accepte explicitement de partager l’accès à ce coffre avec le Propriétaire.'),check=make('input');check.type='checkbox';check.required=true;label.prepend(check);const submit=make('button','Accepter et convertir');submit.type='submit';form.append(label,submit,action('Annuler — garder mon coffre privé',renderFiles));panel.replaceChildren(form);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;const token=generation;try{const policy=await request('/supervision'),updated=await C.supervise(original,password.value,policy);password.value='';if(token!==generation)return;const result=await request('/config',{method:'PUT',body:JSON.stringify({config:updated,revision:rev,supervisionConsent:check.checked})});configuration=updated;revision=result.revision;message('Conversion volontaire terminée. Ce coffre est désormais supervisé par le Propriétaire.');renderFiles();}catch(error){message(error.message,true);submit.disabled=false;}};}
 async function importFiles(files){
  if(!key||upload||!files.length)return;const token=generation,current=key,config=configuration;upload=new AbortController();const signal=upload.signal;let completed=0;
  try{
   for(const file of files){
    if(signal.aborted||token!==generation)throw Error('Import interrompu au verrouillage.');if(file.size>64*1024**3)throw Error('Ce fichier dépasse la limite de 64 Go par import.');
    const result=await C.fileMetadata(current,config,file);if(signal.aborted||token!==generation)throw Error('Import interrompu.');
    await request('/files',{method:'POST',body:JSON.stringify(result.manifest),signal});
    for(let index=0;index<result.manifest.chunks;index++){
     if(signal.aborted||token!==generation)throw Error('Import interrompu.');
     const block=await file.slice(index*C.CHUNK,(index+1)*C.CHUNK).arrayBuffer(),cipher=await C.encryptChunk(result.fileKey,config.vaultId,result.manifest.id,result.meta,index,block);new Uint8Array(block).fill(0);
     const response=await fetch('/api/private-vault/files/'+result.manifest.id+'/chunks/'+index,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:cipher,signal});if(!response.ok)throw Error((await response.json()).error||'Bloc non enregistré.');
     message('Import chiffré · '+(completed+1)+' / '+files.length+' · '+Math.round((index+1)/result.manifest.chunks*100)+' %');activityAt=Date.now();await new Promise(r=>setTimeout(r,0));
    }
    await request('/files/'+result.manifest.id+'/commit',{method:'POST',body:'{}',signal});completed++;
   }
   if(token===generation){message(completed+' fichier(s) importé(s) dans ton coffre. Aucun original déplacé ou supprimé.');await loadFiles();}
  }catch(error){if(token===generation)message(error.message+' Les originaux restent intacts.',true);}finally{if(token===generation)upload=null;}
 }
 async function streamUrl(entry){if(!key)throw Error('Coffre verrouillé.');const token=C.b64(C.bytes(32)),hex=Array.from(C.unb64(token),b=>b.toString(16).padStart(2,'0')).join('');await workerMessage({type:'vault-stream',token:hex,id:entry.manifest.id,vaultId:configuration.vaultId,meta:entry.meta,fileKey:entry.fileKey});if(!key){navigator.serviceWorker.controller.postMessage({type:'vault-revoke',token:hex});throw Error('Coffre verrouillé.');}return'/private-vault-stream/'+hex;}
 async function download(entry){try{const url=await streamUrl(entry),link=make('a');link.href=url+'?download=1';document.body.append(link);link.click();link.remove();message('Téléchargement déchiffré demandé sur cet appareil. Protège également le fichier téléchargé.');}catch(error){message(error.message,true);}}
 async function viewFile(entry){
  const token=generation;try{const url=await streamUrl(entry);if(token!==generation)return;closePreview();const dialog=make('dialog',null,'vault-preview'),heading=make('header'),title=make('h2',entry.meta.name),body=make('div',null,'vault-preview-body');heading.append(title,action('Fermer',closePreview));dialog.append(heading,body);preview=dialog;document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();closePreview();});dialog.addEventListener('close',()=>{if(preview===dialog)closePreview();});dialog.showModal();
   const mime=entry.meta.type.toLowerCase(),ext=entry.meta.name.split('.').pop().toLowerCase();
   if(/^image\/(jpeg|png|gif|webp|bmp|avif)$/.test(mime)){const image=make('img');image.src=url;image.alt=entry.meta.name;body.append(image);}
   else if(/^audio\//.test(mime)||/^video\//.test(mime)){const player=make(mime.startsWith('video')?'video':'audio');player.controls=true;player.preload='metadata';player.src=url;player.addEventListener('error',()=>message('Ce format ne peut pas être lu par cet appareil. Télécharge-le pour utiliser une application compatible.',true));body.append(player);}
   else if(mime==='application/pdf'){const frame=make('iframe');frame.title=entry.meta.name;frame.sandbox='allow-same-origin';frame.src=url+'?inline=1';body.append(frame);}
   else if((mime==='text/plain'||['txt','md','csv','log'].includes(ext))&&entry.meta.size<=2*1024*1024){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Lecture indisponible.');const text=await response.text();if(preview===dialog&&token===generation)body.append(make('pre',text));}
   else body.append(make('p','Ce format reste conservé et chiffré. Télécharge-le pour l’ouvrir dans une application compatible.'));
   dialog.append(action('Télécharger sur cet appareil',()=>void download(entry)));activityAt=Date.now();
  }catch(error){if(token===generation)message(error.message,true);}
 }
 async function showKey(first=false){
  if(!key)return;const token=generation,secret=await C.reveal(key,configuration);if(token!==generation||!key)return;
  const dialog=make('dialog',null,'vault-secret-dialog vault-card'),input=make('input');input.type='text';input.readOnly=true;input.value=secret;input.setAttribute('aria-label','Clé personnelle de récupération');dialog.append(make('h2',first?'Conserve ta clé de secours':'Ta clé personnelle de récupération'),make('p','Cette clé donne accès à ton coffre. Conserve-la hors du NAS, dans un gestionnaire de mots de passe ou sur papier. Ne la communique pas à l’administrateur.'),input);
  const close=()=>{input.value='';dialog.close();dialog.remove();};dialog.append(action('Copier la clé',async()=>{try{await navigator.clipboard.writeText(input.value);message('Clé copiée. Le presse-papiers reste sensible : ne la colle pas dans un espace partagé.');}catch{input.select();}}),action('J’ai conservé ma clé · Fermer',close,''));dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(dialog);dialog.showModal();setTimeout(close,60000);
 }
 function activity(){if(!key)return;activityAt=Date.now();if(warning){warning.close();warning.remove();warning=null;}}
 for(const name of ['pointermove','pointerdown','keydown','wheel','touchstart'])document.addEventListener(name,activity,{passive:true});
 el('vaultLock').onclick=()=>lock();document.getElementById('logoutBtn').addEventListener('click',()=>lock());window.addEventListener('pagehide',()=>lock());
 timer=setInterval(()=>{
  if(key&&(!me||me.id!==owner||!visible()))return lock();
  if(!key){if(visible()&&me&&!loading&&(owner!==me.id||!panel.childNodes.length)){owner=me.id;void showLocked();}return;}
  const idle=Date.now()-activityAt,limit=preview?600000:180000;
  if(idle>=limit+(preview?30000:0))return lock('Ton coffre a été verrouillé après inactivité.');
  if(preview&&idle>=limit&&!warning){warning=make('dialog',null,'vault-card vault-secret-dialog');warning.append(make('h2','Verrouillage dans 30 secondes'),make('p','Bouge la souris ou appuie sur une touche pour continuer la consultation.'),action('Continuer',activity));warning.addEventListener('cancel',e=>{e.preventDefault();activity();});document.body.append(warning);warning.showModal();}
  if(warning&&preview)warning.querySelector('h2').textContent='Verrouillage dans '+Math.max(0,Math.ceil((limit+30000-idle)/1000))+' secondes';
  if(Date.now()-lastSessionCheck>15000){lastSessionCheck=Date.now();const intent=generation;void request('/status').catch(()=>{if(intent===generation)lock('Session expirée ou connexion interrompue. Déverrouille à nouveau ton coffre.');});}
 },1000);
 const previous=window.JMHEvolution.onNavigate;window.JMHEvolution.onNavigate=function(id){previous?.(id);if(id!==page.id){if(key||panel.childNodes.length||consentPrompt)lock();return;}if(!key)void showLocked();};
 window.JMHPrivateVault={lock,get locked(){return!key;}};
})();
