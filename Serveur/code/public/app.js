let me = null;
let socket = null;
let allMessages = [];
let currentStoragePath = "";
let storageInfo = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const PERMISSION_DEFINITIONS = [
 ['canUseGames','Mini-jeux','Accéder aux jeux de détente.'],['canUsePcTools','Outils de cet ordinateur','Ouvrir les réglages Windows et les périphériques de ce PC.'],
 ['canAccessStorage','Accéder aux fichiers du NAS','Accès général aux fichiers et aux médias.'],
 ['canAccessMusic','Musique','Accéder à la bibliothèque musicale.'],['canAccessCinema','Cinéma','Accéder aux films.'],['canAccessPhotos','Photos','Voir les photos et les souvenirs.'],['canAccessVideos','Vidéos personnelles','Voir les vidéos personnelles.'],['canUseVpn','VPN','Utiliser le proxy VPN ; sa gestion reste réservée aux administrateurs.'],
 ['canUploadStorage','Ajouter des fichiers','Importer vers les galeries et le NAS.'],['canDownloadStorage','Lecture et téléchargement','Lire les médias, les aperçus et télécharger les originaux.'],['canCreateStorageFolders','Créer des dossiers','Organiser les fichiers sur le NAS.']
 ];

const ACCESS_PRESETS = {
  full: {
    canSendMessages: true, canSendChatFiles: true, canUsePrivateMessages: true,
    canAccessStorage: true, canUploadStorage: true, canDownloadStorage: true,
    canCreateStorageFolders: true
  },
  messages: {
    canSendMessages: true, canSendChatFiles: false, canUsePrivateMessages: true,
    canAccessStorage: false, canUploadStorage: false, canDownloadStorage: false,
    canCreateStorageFolders: false
  },
  files: {
    canSendMessages: false, canSendChatFiles: true, canUsePrivateMessages: true,
    canAccessStorage: true, canUploadStorage: true, canDownloadStorage: true,
    canCreateStorageFolders: true
  },
  readonly: {
    canSendMessages: false, canSendChatFiles: false, canUsePrivateMessages: false,
    canAccessStorage: true, canUploadStorage: false, canDownloadStorage: true,
    canCreateStorageFolders: false
  }
};

function permissionsForPreset(name) {
  const preset={...(ACCESS_PRESETS[name]||ACCESS_PRESETS.full)};for(const key of ['canAccessMusic','canAccessCinema','canAccessPhotos','canAccessVideos','canUseVpn'])preset[key]=Boolean(preset.canAccessStorage);return preset;
}

function renderPermissionControls(container, permissions, prefix) {
  container.innerHTML = PERMISSION_DEFINITIONS.map(([key, label, description]) => `
    <label class="permission-choice">
      <input type="checkbox" id="${prefix}-${key}" ${permissions[key] ? "checked" : ""}>
      <span><b>${label}</b><small>${description}</small></span>
    </label>
  `).join("");
}

function readPermissionControls(prefix) {
  return Object.fromEntries(
    PERMISSION_DEFINITIONS.map(([key]) => [key, $(`#${prefix}-${key}`).checked])
  );
}

function detectPreset(permissions) {
  for (const [name, preset] of Object.entries(ACCESS_PRESETS)) {
    if (PERMISSION_DEFINITIONS.every(([key]) => Boolean(permissions[key]) === Boolean(preset[key]))) return name;
  }
  return "custom";
}

function permissionSummary(permissions) {
  const labels = {
    canUseGames:"Mini-jeux",canUsePcTools:"Outils du PC",
    canAccessMusic:'Musique',canAccessCinema:'Cinéma',canAccessPhotos:'Photos',canAccessVideos:'Vidéos',canUseVpn:'VPN',
    canSendMessages: "Messages",
    canSendChatFiles: "Fichiers chat",
    canUsePrivateMessages: "Privés",
    canAccessStorage: "NAS",
    canUploadStorage: "Ajout NAS",
    canDownloadStorage: "Téléchargement",
    canCreateStorageFolders: "Dossiers"
  };
  return PERMISSION_DEFINITIONS.map(([key]) =>
    `<span class="access-chip ${permissions[key] ? "" : "off"}">${permissions[key] ? "✓" : "×"} ${labels[key]}</span>`
  ).join("");
}

function applyMyPermissions() {
  const noAccess=me.role!=='admin'&&Object.values(me.permissions||{}).every(v=>v===false);
  let restrictedNotice=document.getElementById('restrictedAccountNotice');if(!restrictedNotice){restrictedNotice=document.createElement('section');restrictedNotice.id='restrictedAccountNotice';restrictedNotice.className='panel restricted-account-notice';restrictedNotice.setAttribute('role','status');restrictedNotice.textContent='Veuillez contacter l’administrateur pour les autorisations d’accès.';document.getElementById('accountPage').prepend(restrictedNotice);}restrictedNotice.classList.toggle('hidden',!noAccess);
 
  const p = me.permissions || {};
  window.JMHTools?.permissions(me);
  for(const [id,key]of [['photosPage','canAccessPhotos'],['personalVideosPage','canAccessVideos'],['vpnPage','canUseVpn']])document.querySelector('[data-page="'+id+'"]')?.classList.toggle('hidden',me.role!=='admin'&&(!p.canAccessStorage||p[key]===false));
  document.querySelectorAll('[data-studio-nav]').forEach(b=>{const key={musicPage:'canAccessMusic',cinemaPage:'canAccessCinema',photosPage:'canAccessPhotos',personalVideosPage:'canAccessVideos',vpnPage:'canUseVpn',storagePage:'canAccessStorage'}[b.dataset.studioNav];b.classList.toggle('hidden',me.role!=='admin'&&(key&&(!p.canAccessStorage||p[key]===false)||b.dataset.studioNav==='downloadsPage'));});
  window.JMHEvolution?.permissions(me);
  window.JMHProfile?.apply(me);
  document.querySelector('[data-page="homePage"]')?.classList.toggle('hidden',me.role!=='admin'&&!p.canAccessStorage);
  const storageNav = document.querySelector('[data-page="storagePage"]');
  if (storageNav) storageNav.classList.toggle("hidden", me.role !== "admin" && !p.canAccessStorage);
  const musicNav = document.querySelector('[data-page="musicPage"]');
  if (musicNav) musicNav.classList.toggle('hidden', me.role !== 'admin' && (!p.canAccessStorage||p.canAccessMusic===false));
  const cinemaNav = document.querySelector('[data-page="cinemaPage"]');
  if (cinemaNav) cinemaNav.classList.toggle("hidden", me.role !== "admin" && (!p.canAccessStorage||p.canAccessCinema===false));

  $("#messageInput").disabled = me.role !== "admin" && !p.canSendMessages;
  $("#messageInput").placeholder = $("#messageInput").disabled
    ? "L’envoi de messages est désactivé pour ton compte"
    : "Écris ton message…";

  $("#fileInput").disabled = me.role !== "admin" && !p.canSendChatFiles;
  $(".file-btn").classList.toggle("disabled-control", $("#fileInput").disabled);

  if (me.role !== "admin" && !p.canUsePrivateMessages) {
    $("#recipientSelect").value = "all";
    $("#recipientSelect").disabled = true;
  }

  if ($("#createFolderBtn")) {
    $("#createFolderBtn").classList.toggle("hidden", me.role !== "admin" && !p.canCreateStorageFolders);
  }
  if ($("#storageFileInput")) {
    const uploadLabel = $("#storageFileInput").closest("label");
    uploadLabel.classList.toggle("hidden", me.role !== "admin" && !p.canUploadStorage);
  }
}


function toast(text) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = text;
  $("#toast").appendChild(element);
  setTimeout(() => element.remove(), 4500);
}

async function api(url, options = {}) {
  const controller=new AbortController(),original=options.signal,abort=()=>controller.abort();
  if(original?.aborted)abort();else original?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,options.body instanceof FormData?600000:30000);
  try{const response = await fetch(url, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,signal:controller.signal
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
  if(Array.isArray(data)&&response.headers.has('X-JMH-Search-Partial'))data.partial=response.headers.get('X-JMH-Search-Partial')==='true';
  return data;
  }catch(error){if(error.name==='AbortError'&&!original?.aborted)throw new Error('Le NAS ne répond pas à temps. Vérifiez la connexion, puis réessayez.');throw error;}finally{clearTimeout(timer);original?.removeEventListener('abort',abort);}
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatDate(value) {
  return new Date(value).toLocaleString("fr-FR");
}

function recipientTag(message) {
  const to = message.to || "all";
  if (to === "all") return '<span class="team-tag">Toute l’équipe</span>';
  return `<span class="private-tag">Privé : ${escapeHtml(message.username)} → ${escapeHtml(to)}</span>`;
}

function renderMessage(message) {
  const element = document.createElement("div");
  element.className = "message" + (message.username === me.username ? " mine" : "");
  const file = message.file
    ? `<a class="file-link" href="${message.file.url}" download="${escapeHtml(message.file.name)}">📎 ${escapeHtml(message.file.name)}</a>`
    : "";

  element.innerHTML = `
    <div class="message-meta">${escapeHtml(message.username)} · ${formatDate(message.at)} ${recipientTag(message)}</div>
    <div>${escapeHtml(message.text || "")}</div>
    ${file}
  `;

  $("#messages").appendChild(element);
}

function renderFilteredMessages() {
  const query = ($("#messageSearch").value || "").trim().toLowerCase();
  $("#messages").innerHTML = "";

  const filtered = query
    ? allMessages.filter(message => [
        message.username,
        message.to || "all",
        message.text || "",
        message.file?.name || ""
      ].join(" ").toLowerCase().includes(query))
    : allMessages;

  filtered.forEach(renderMessage);
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

async function loadRecipients() {
  const users = await api("/api/users");
  const select = $("#recipientSelect");
  const selected = select.value || "all";

  select.innerHTML = '<option value="all">📢 Toute l’équipe</option>' +
    users
      .filter(user => user.username !== me.username)
      .map(user => `<option value="${escapeHtml(user.username)}">👤 ${escapeHtml(user.username)}</option>`)
      .join("");

  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  updateConversationHint();
}

function updateConversationHint() {
  const recipient = $("#recipientSelect").value;
  $("#conversationHint").textContent = recipient === "all"
    ? "Message visible par toute l’équipe"
    : `Message privé avec ${recipient}. L’administrateur peut consulter les échanges.`;
}


function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go", "To"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / Math.pow(1024, index);
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

function fileIcon(item) {
  if (item.type === "folder") return "📁";
  const ext = (item.extension || "").toLowerCase();
  if ([".png",".jpg",".jpeg",".gif",".webp",".bmp"].includes(ext)) return "🖼️";
  if (ext === ".pdf") return "📕";
  if ([".doc",".docx",".odt",".txt",".rtf"].includes(ext)) return "📄";
  if ([".xls",".xlsx",".ods",".csv"].includes(ext)) return "📊";
  if ([".zip",".rar",".7z"].includes(ext)) return "🗜️";
  if ([".mp4",".avi",".mkv",".mov"].includes(ext)) return "🎬";
  if ([".mp3",".wav",".flac",".m4a"].includes(ext)) return "🎵";
  return "📎";
}

function canPreview(item) {
  return item.type === "file" && [
    ".png",".jpg",".jpeg",".gif",".webp",".bmp",".pdf",".txt",".mp3",".m4a",".aac",".wav",".flac",".ogg",".opus",".mp4",".m4v",".webm",".mov"
  ].includes((item.extension || "").toLowerCase());
}

function renderBreadcrumb() {
  const box=$("#storageBreadcrumb");box.replaceChildren();
  const add=(label,folder)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>openStoragePath(folder);box.append(b);};add('Accueil','');
  let folder='';for(const part of currentStoragePath?currentStoragePath.split('/'):[]){folder=folder?folder+'/'+part:part;const divider=document.createElement('span');divider.textContent='›';box.append(divider);add(part,folder);}
}

function renderStorageSummary() {
  if (!storageInfo) return;
  $("#storageSummary").innerHTML = `
    <span>📄 ${storageInfo.totalFiles??'…'} fichier(s)</span>
    <span>📁 ${storageInfo.totalFolders??'…'} dossier(s)</span>
    <span>💽 ${storageInfo.totalBytes==null?'Calcul en arrière-plan':formatBytes(storageInfo.totalBytes)+' utilisés'}</span>
    <span>⬆️ Taille maximale par fichier : ${formatBytes(storageInfo.maxUploadBytes)}</span>
  `;
}

// One active NAS view request: a late search must never replace an opened folder.
const storageNavigationCache=new Map(),storageSearchCache=new Map();
let storageNavigationUser=null,storageGeneration=0,storageController=null;
let storageView={query:'',listPage:0},storageItems=[];
const STORAGE_PAGE_SIZE=100;
function cancelStorageRequest(){storageGeneration++;storageController?.abort();storageController=null;$('#storageSearchStatus').textContent='';}
function storageRequest(){
  cancelStorageRequest();
  if(storageNavigationUser!==me?.id){storageNavigationCache.clear();storageSearchCache.clear();storageItems=[];storageView={query:'',listPage:0};storageNavigationUser=me?.id;}
  storageController=new AbortController();return{token:storageGeneration,user:me?.id,signal:storageController.signal};
}
function currentStorageRequest(request){return request.token===storageGeneration&&request.user===me?.id;}
function cacheStorage(cache,key,data){if(cache.size>=40)cache.delete(cache.keys().next().value);cache.set(key,{data,at:Date.now()});}
function invalidateStorageCache(){storageNavigationCache.clear();storageSearchCache.clear();}
function renderStorageView(){
  renderBreadcrumb();
  if(storageView.query){const note=document.createElement('span');note.textContent='Résultats pour « '+storageView.query+' »';$('#storageBreadcrumb').replaceChildren(note);}
  $('#storageSearchInput').value=storageView.query;
  storageView.listPage=Math.max(0,Math.min(storageView.listPage,Math.ceil(storageItems.length/STORAGE_PAGE_SIZE)-1));
  renderStorageItems(storageItems.slice(storageView.listPage*STORAGE_PAGE_SIZE,(storageView.listPage+1)*STORAGE_PAGE_SIZE));
  const pages=$('#storagePagination');pages.replaceChildren();pages.hidden=storageItems.length<=STORAGE_PAGE_SIZE;
  if(!pages.hidden){
    const count=Math.ceil(storageItems.length/STORAGE_PAGE_SIZE),label=document.createElement('span');label.textContent=storageItems.length+' éléments · page '+(storageView.listPage+1)+' / '+count;pages.append(label);
    const indices=[...new Set([0,storageView.listPage-1,storageView.listPage,storageView.listPage+1,count-1])].filter(n=>n>=0&&n<count).sort((a,b)=>a-b);
    for(const n of indices){const b=document.createElement('button');b.type='button';b.textContent=String(n+1);b.disabled=n===storageView.listPage;b.setAttribute('aria-label','Page fichiers '+(n+1));b.onclick=()=>{window.JMHNavigation?.beforeSubview();storageView.listPage=n;renderStorageView();void window.JMHNavigation?.commitSubview({reset:true});};pages.append(b);}
  }
}
async function searchStorage(options={}){
  const q=String(options.query??$('#storageSearchInput').value).trim();if(q.length<2)return toast('Saisissez au moins 2 caractères.');
  if(options.track!==false)window.JMHNavigation?.beforeSubview();
  const request=storageRequest(),saved=storageSearchCache.get(q.toLocaleLowerCase('fr'));
  $('#storageSearchStatus').textContent='Recherche dans le NAS…';
  try{
    const items=saved&&Date.now()-saved.at<15000?saved.data:await api('/api/storage/search?q='+encodeURIComponent(q),{signal:request.signal});
    if(!currentStorageRequest(request))return false;
    cacheStorage(storageSearchCache,q.toLocaleLowerCase('fr'),items);storageItems=items;storageView={query:q,listPage:options.listPage||0};renderStorageView();
    $('#storageSearchStatus').textContent=items.length+' résultat(s)'+(items.partial?' · indexation en cours ou résultats limités ; précise ou relance la recherche':items.length===200?' · précise la recherche pour affiner':'');
    if(options.track!==false)await window.JMHNavigation?.commitSubview({reset:true});return true;
  }catch(e){if(currentStorageRequest(request)&&e.name!=='AbortError')toast(e.message);return false;}
}
window.JMHStorage={cancel:cancelStorageRequest,getView:()=>({...storageView}),restoreView:async(value={},path=currentStoragePath)=>{
  if(value.query){currentStoragePath=path||'';return searchStorage({query:value.query,listPage:value.listPage||0,track:false});}
  return loadStorage(path,{listPage:value.listPage||0});
}};
function renderStorageItems(items){
  const body=$('#storageTableBody');body.replaceChildren();
  if(!items.length){const row=document.createElement('tr');row.innerHTML='<td colspan="5" class="empty-storage">Aucun élément.</td>';body.append(row);return;}
  for(const item of items){
    const row=document.createElement('tr');row.dataset.path=item.path;row.dataset.fileName=item.name;
    row.innerHTML='<td><div class="storage-name"><span>'+fileIcon(item)+'</span><b>'+escapeHtml(item.name)+'</b></div></td><td>'+(item.type==='folder'?'Dossier':'Fichier')+'</td><td>'+(item.type==='folder'?'—':formatBytes(item.size))+'</td><td>'+formatDate(item.modifiedAt)+'</td><td></td>';
    const actions=row.lastElementChild;
    const action=(label,callback,danger=false)=>{const button=document.createElement('button');button.type='button';button.className='storage-action'+(danger?' danger':'');button.textContent=label;button.addEventListener('click',callback);actions.append(button);};
    if(item.type==='folder')action('Ouvrir',()=>openStoragePath(item.path));
    else if(me.role==='admin'||me.permissions?.canDownloadStorage){if(/\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4v|webm|mov|avi|mkv)$/i.test(item.name))action('▶ Lire',()=>playStorageMedia(item));action('Ouvrir',()=>openStorageFile(item));action('Télécharger',()=>downloadStorageFile(item.path));} const name=row.querySelector('.storage-name b');if(item.type==='folder'||me.role==='admin'||me.permissions?.canDownloadStorage){const open=document.createElement('button');open.type='button';open.className='storage-file-name';open.textContent=item.name;open.addEventListener('click',()=>item.type==='folder'?openStoragePath(item.path):openStorageFile(item));name.replaceWith(open);}
    if(me.role==='admin'){action('Renommer',()=>renameStorageItem(item.path,item.name));}
    body.append(row);
  }
}
async function loadTrash(){const items=await api('/api/storage/trash'),box=$('#trashList');box.replaceChildren();if(!items.length){const empty=document.createElement('div');empty.className='empty-storage';empty.textContent='La corbeille est vide.';box.append(empty);return;}for(const item of items){const row=document.createElement('div');row.className='trash-row';for(const value of [item.name+' · '+item.originalPath,item.type==='folder'?'Dossier':'Fichier',item.deletedBy+' · '+formatDate(item.deletedAt)]){const text=document.createElement('div');text.textContent=value;row.append(text);}const actions=document.createElement('div');for(const [title,fn]of [['Restaurer',()=>restoreTrashItem(item.id)],['Supprimer définitivement',()=>deleteTrashItem(item.id)]]){const button=document.createElement('button');button.type='button';button.className='small-btn';button.textContent=title;button.onclick=fn;actions.append(button);}row.append(actions);box.append(row);}}

window.restoreTrashItem=async id=>{try{await api(`/api/storage/trash/${id}/restore`,{method:"POST"});toast("Élément restauré.");loadTrash();}catch(e){toast(e.message);}};window.deleteTrashItem=async id=>{if(!confirm("Suppression définitive ?"))return;try{await api(`/api/storage/trash/${id}`,{method:"DELETE"});toast("Élément supprimé définitivement.");loadTrash();}catch(e){toast(e.message);}};
async function loadStorage(pathValue = currentStoragePath,options={}) {
  const request=storageRequest(),key=pathValue||'',saved=storageNavigationCache.get(key);
  try{
    const data=!options.force&&saved&&Date.now()-saved.at<15000?saved.data:await api('/api/storage/list?path='+encodeURIComponent(key),{signal:request.signal});
    if(!currentStorageRequest(request))return false;
    cacheStorage(storageNavigationCache,key,data);currentStoragePath=data.currentPath||'';
    storageItems=data.items;storageView={query:'',listPage:options.listPage||0};renderStorageView();
    if(!storageInfo||Date.now()-(window.storageInfoLoadedAt||0)>60000)void api('/api/storage/info').then(info=>{if(me?.id!==request.user)return;storageInfo=info;window.storageInfoLoadedAt=Date.now();renderStorageSummary();}).catch(()=>{});else renderStorageSummary();
    return true;
  }catch(error){if(!currentStorageRequest(request)||error.name==='AbortError')return false;throw error;}
}

window.openStoragePath = async pathValue => {
  try { return await loadStorage(pathValue); }
  catch (error) { toast(error.message); }
};

window.downloadStorageFile = pathValue => {
  const link=document.createElement('a');link.href='/api/storage/download?path='+encodeURIComponent(pathValue);link.download=pathValue.split('/').pop();document.body.append(link);link.click();link.remove();
};

const STORAGE_AUDIO=/\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i;
window.playStorageAudio=async item=>{if(!window.JMHMusic?.playFiles||!STORAGE_AUDIO.test(item.name||item.path))return false;if(me?.role!=='admin'&&(me?.permissions?.canAccessStorage===false||me?.permissions?.canAccessMusic===false||me?.permissions?.canDownloadStorage===false))return false;try{await window.JMHMusic.load?.();}catch{}const list=storageItems.filter(x=>x.type!=='folder'&&STORAGE_AUDIO.test(x.name)),folder=(currentStoragePath||'').split('/').filter(Boolean).pop()||'NAS';const index=Math.max(0,list.findIndex(x=>x.path===item.path));if(!list.length)return false;await window.JMHMusic.playFiles(list.map(x=>({path:x.path,name:x.name,folder})),index);return true;};
window.playStorageMedia=async item=>{try{if(await window.playStorageAudio(item))return;const info=await api('/api/storage/media-info?path='+encodeURIComponent(item.path));if(info.kind==='music'){await window.JMHMusic.load();await window.JMHMusic.open(info.id,true);return;}if(info.kind==='cinema'){await window.JMHCinema.load();await window.JMHCinema.open(info.id,true);return;}await openStorageFile(item);}catch(e){toast(e.message);}};
let storagePreviewDialog;
window.openStorageFile=async item=>{if(item?.name&&await window.playStorageAudio?.(item))return;
 try{
  const info=await api('/api/storage/open-info?path='+encodeURIComponent(item.path));
  if(!canPreview(item)&&window.jmhDesktop?.openStorageFile){const result=await window.jmhDesktop.openStorageFile(item.path);if(result?.ok)return;if(result?.error)toast(result.error);}
  if(!storagePreviewDialog){storagePreviewDialog=document.createElement('dialog');storagePreviewDialog.className='storage-preview-dialog';storagePreviewDialog.innerHTML='<header><h2></h2><button type="button" aria-label="Fermer">×</button></header><div class="storage-preview-body"></div><footer></footer>';document.body.append(storagePreviewDialog);storagePreviewDialog.querySelector('header button').onclick=()=>storagePreviewDialog.close();storagePreviewDialog.addEventListener('close',()=>storagePreviewDialog.querySelector('.storage-preview-body').replaceChildren());}
  const box=storagePreviewDialog.querySelector('.storage-preview-body'),footer=storagePreviewDialog.querySelector('footer');box.replaceChildren();footer.replaceChildren();storagePreviewDialog.querySelector('h2').textContent=info.name;storagePreviewDialog.showModal();
  const download=document.createElement('button');download.type='button';download.textContent='Télécharger sur ce PC';download.onclick=()=>downloadStorageFile(item.path);footer.append(download);
  if(window.jmhDesktop?.openStorageFile){const native=document.createElement('button');native.type='button';native.textContent='Ouvrir dans mon application Windows';native.onclick=async()=>{native.disabled=true;try{const result=await window.jmhDesktop.openStorageFile(item.path);if(!result?.ok)throw Error(result?.error||'Ouverture impossible');}catch(e){toast(e.message);}finally{native.disabled=false;}};footer.append(native);}
  const ext=(item.extension||'').toLowerCase(),src='/api/storage/preview?path='+encodeURIComponent(item.path);
  if(ext==='.txt'){if(info.size>2*1024*1024){box.textContent='Le texte dépasse 2 Mo. Télécharge-le pour l’ouvrir.';return;}const response=await fetch(src);if(!response.ok)throw Error('Le fichier ne peut pas être chargé.');const pre=document.createElement('pre');pre.textContent=await response.text();if(storagePreviewDialog.open)box.append(pre);}
  else if(['.png','.jpg','.jpeg','.gif','.webp','.bmp'].includes(ext)){const image=document.createElement('img');image.src=src;image.alt=info.name;image.onerror=()=>{box.textContent='Impossible de lire cette image. Utilise Télécharger.'};box.append(image);}
  else if(['.mp3','.m4a','.aac','.wav','.flac','.ogg','.opus','.mp4','.m4v','.webm','.mov'].includes(ext)){const video=['.mp4','.m4v','.webm','.mov'].includes(ext),player=document.createElement(video?'video':'audio');player.controls=true;player.preload='metadata';player.src=src;box.append(player);player.play().catch(()=>{});storagePreviewDialog.addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.load();},{once:true});}
  else if(ext==='.pdf'){const frame=document.createElement('iframe');frame.title=info.name;frame.src=src;frame.setAttribute('sandbox','allow-same-origin');box.append(frame);}
  else {box.textContent='Ce format s’ouvre avec une application compatible sur ton PC. Clique sur Télécharger, puis ouvre le fichier téléchargé.';if(window.jmhDesktop&&!window.jmhDesktop.openStorageFile){const note=document.createElement('p');note.textContent='Installe la mise à jour 2026.10.02.2 pour ouvrir les documents directement dans leur application Windows.';box.append(note);}}
 }catch(error){toast(error.message);}
};
window.previewStorageFile=pathValue=>openStorageFile({path:pathValue,extension:'.'+pathValue.split('.').pop()});

window.renameStorageItem = async (pathValue, oldName) => {
  const newName = prompt("Nouveau nom :", oldName);
  if (!newName || newName === oldName) return;
  try {
    await api("/api/storage/rename", {
      method: "PATCH",
      body: JSON.stringify({ path: pathValue, newName })
    });
    toast("Élément renommé.");
    invalidateStorageCache();
    await loadStorage(currentStoragePath,{force:true});
  } catch (error) {
    toast(error.message);
  }
};

window.deleteStorageItem = async (pathValue, name) => {
  if (!confirm(`Placer « ${name} » dans la corbeille ?`)) return;
  try {
    await api("/api/storage/item", {
      method: "DELETE",
      body: JSON.stringify({ path: pathValue })
    });
    toast("Élément placé dans la corbeille.");
    invalidateStorageCache();
    await loadStorage(currentStoragePath,{force:true});
  } catch (error) {
    toast(error.message);
  }
};

async function uploadStorageFiles(files) {
  if (!files || !files.length) return;
  const form = new FormData();
  for (const file of files) form.append("files", file);
  form.append("path", currentStoragePath);

  const progress = document.createElement("div");
  progress.className = "progress-box";
  progress.textContent = `Envoi de ${files.length} fichier(s) en cours…`;
  $("#storageDropZone").after(progress);

  try {
    await api("/api/storage/upload", { method: "POST", body: form });
    toast(`${files.length} fichier(s) ajouté(s).`);
    invalidateStorageCache();
    await loadStorage(currentStoragePath,{force:true});
  } catch (error) {
    toast(error.message);
  } finally {
    progress.remove();
  }
}


function canUseScreenCapture() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

function screenToolsPermissionAllowed() {
  return me.role === "admin" || Boolean(me.permissions?.canSendChatFiles);
}

function updateScreenToolsAvailability() {
  const allowed = screenToolsPermissionAllowed();
  const supported = canUseScreenCapture();
  const disabled = !allowed || !supported;

  $("#captureScreenBtn").disabled = disabled;
  $("#startRecordingBtn").disabled = disabled;

  if (!allowed) {
    $("#recordingStatus").textContent = "L’envoi de fichiers est désactivé pour ce compte.";
  } else if (!supported) {
    $("#recordingStatus").textContent = "Capture d’écran indisponible dans ce navigateur ou cette connexion.";
  } else {
    $("#recordingStatus").textContent = "";
  }
}

async function uploadGeneratedFile(blob, filename, text = "") {
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: blob.type || "application/octet-stream" }));
  form.append("to", $("#recipientSelect").value);
  form.append("text", text);

  await api("/api/upload", { method: "POST", body: form });
}

function openScreenPreview(blob, filename, type) {
  pendingScreenBlob = blob;
  pendingScreenFilename = filename;

  const image = $("#screenPreviewImage");
  const video = $("#screenPreviewVideo");
  const url = URL.createObjectURL(blob);

  image.classList.add("hidden");
  video.classList.add("hidden");
  image.removeAttribute("src");
  video.removeAttribute("src");

  if (type === "image") {
    $("#screenPreviewTitle").textContent = "Aperçu de la capture d’écran";
    image.src = url;
    image.classList.remove("hidden");
  } else {
    $("#screenPreviewTitle").textContent = "Aperçu de l’enregistrement d’écran";
    video.src = url;
    video.classList.remove("hidden");
  }

  $("#screenPreviewDialog").showModal();
}

async function captureScreenImage() {
  if (!canUseScreenCapture()) return toast("La capture d’écran n’est pas disponible.");
  if (!screenToolsPermissionAllowed()) return toast("Ton compte n’est pas autorisé à envoyer des fichiers.");

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false
    });

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    await new Promise(resolve => {
      if (video.readyState >= 2) resolve();
      else video.onloadedmetadata = resolve;
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 0.95));
    if (!blob) throw new Error("Impossible de créer la capture.");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    openScreenPreview(blob, `capture-ecran-${timestamp}.png`, "image");
  } catch (error) {
    if (error.name !== "NotAllowedError") toast(error.message || "Capture annulée.");
  } finally {
    if (stream) stream.getTracks().forEach(track => track.stop());
  }
}

async function startScreenRecording() {
  if (!canUseScreenCapture()) return toast("L’enregistrement d’écran n’est pas disponible.");
  if (!screenToolsPermissionAllowed()) return toast("Ton compte n’est pas autorisé à envoyer des fichiers.");

  try {
    screenRecordingStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 20 },
      audio: true
    });

    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "";

    screenRecordingChunks = [];
    screenRecorder = new MediaRecorder(
      screenRecordingStream,
      mimeType ? { mimeType, videoBitsPerSecond: 2500000 } : undefined
    );

    screenRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) screenRecordingChunks.push(event.data);
    };

    screenRecorder.onstop = () => {
      clearInterval(recordingTimer);
      recordingTimer = null;

      const type = screenRecorder.mimeType || "video/webm";
      const blob = new Blob(screenRecordingChunks, { type });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      openScreenPreview(blob, `enregistrement-ecran-${timestamp}.webm`, "video");

      if (screenRecordingStream) screenRecordingStream.getTracks().forEach(track => track.stop());
      screenRecordingStream = null;
      screenRecorder = null;
      screenRecordingChunks = [];
      $("#startRecordingBtn").classList.remove("hidden");
      $("#stopRecordingBtn").classList.add("hidden");
      $("#recordingStatus").textContent = "";
    };

    screenRecordingStream.getVideoTracks()[0].onended = () => {
      if (screenRecorder && screenRecorder.state !== "inactive") screenRecorder.stop();
    };

    screenRecorder.start(1000);
    recordingStartedAt = Date.now();

    $("#startRecordingBtn").classList.add("hidden");
    $("#stopRecordingBtn").classList.remove("hidden");

    recordingTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
      const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
      const remaining = String(seconds % 60).padStart(2, "0");
      $("#recordingStatus").textContent = `Enregistrement en cours ${minutes}:${remaining}`;
    }, 500);
  } catch (error) {
    if (error.name !== "NotAllowedError") toast(error.message || "Enregistrement annulé.");
    if (screenRecordingStream) screenRecordingStream.getTracks().forEach(track => track.stop());
    screenRecordingStream = null;
    screenRecorder = null;
  }
}

function stopScreenRecording() {
  if (screenRecorder && screenRecorder.state !== "inactive") {
    screenRecorder.stop();
  }
}


async function loadDashboard(){
  const d=await api('/api/dashboard');
  $('#welcomeTitle').textContent='Bonjour, '+me.username+'.';
  $('#statUsers').textContent=d.totalUsers;$('#statOnline').textContent=d.onlineUsers;$('#statMessages').textContent=d.messagesToday;$('#statTasks').textContent=d.pendingTasks;
  $('#dashboardOnlineUsers').innerHTML=d.currentOnlineUsers.length?d.currentOnlineUsers.map(u=>'<div class="online-user-row"><span>'+escapeHtml(u)+'</span><span>En ligne</span></div>').join(''):'<p class="muted-text">Personne en ligne pour le moment.</p>';
  $('#dashboardAnnouncements').innerHTML=d.latestAnnouncements.length?d.latestAnnouncements.map(a=>'<div class="dashboard-item"><b>'+escapeHtml(a.title)+'</b><small>'+formatDate(a.createdAt)+'</small></div>').join(''):'<p class="muted-text">Aucune annonce.</p>';
  $('#dashboardEvents').innerHTML=(d.upcomingEvents||[]).length?d.upcomingEvents.map(e=>'<div class="dashboard-item"><b>'+escapeHtml(e.title)+'</b><small>'+formatDate(e.startAt)+'</small></div>').join(''):'<p class="muted-text">Aucun événement prévu.</p>';
  $('#dashboardTasks').innerHTML=(d.latestTasks||[]).length?d.latestTasks.map(t=>'<div class="dashboard-item"><b>'+escapeHtml(t.title)+'</b><small>'+escapeHtml(t.assignedTo)+'</small></div>').join(''):'<p class="muted-text">Aucune tâche en attente.</p>';
}
async function loadTaskAssignees(){const users=await api('/api/users');$('#taskAssignedTo').innerHTML=users.map(u=>`<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)}</option>`).join('');if([...$('#taskAssignedTo').options].some(o=>o.value===me.username))$('#taskAssignedTo').value=me.username}
function renderTasks(){const f=$('#taskFilter').value;const list=f==='all'?currentTasks:currentTasks.filter(t=>t.status===f);$('#tasksList').innerHTML=list.length?list.map(t=>`<div class="task-card"><div><h4>${escapeHtml(t.title)}</h4><div class="task-meta"><span class="task-badge">${{todo:'A faire',doing:'En cours',done:'Terminee'}[t.status]}</span><span class="task-badge task-priority-${t.priority}">Priorite ${{low:'Basse',normal:'Normale',high:'Haute'}[t.priority]}</span><span>Assignee a ${escapeHtml(t.assignedTo)}</span>${t.dueDate?`<span>Echeance ${escapeHtml(t.dueDate)}</span>`:''}</div>${t.description?`<p>${escapeHtml(t.description)}</p>`:''}</div><div class="task-actions"><button class="small-btn" onclick="setTaskStatus('${t.id}','todo')">A faire</button><button class="small-btn" onclick="setTaskStatus('${t.id}','doing')">En cours</button><button class="small-btn" onclick="setTaskStatus('${t.id}','done')">Terminee</button>${me.role==='admin'?`<button class="small-btn danger" onclick="deleteTask('${t.id}')">Supprimer</button>`:''}</div></div>`).join(''):'<div class="empty-storage">Aucune tache.</div>'}
async function loadTasks(){currentTasks=await api('/api/tasks');renderTasks()}
window.setTaskStatus=async(id,status)=>{try{await api(`/api/tasks/${id}`,{method:'PATCH',body:JSON.stringify({status})});await loadTasks();await loadDashboard()}catch(e){toast(e.message)}};
window.deleteTask=async id=>{if(!confirm('Supprimer cette tache ?'))return;try{await api(`/api/tasks/${id}`,{method:'DELETE'});await loadTasks();await loadDashboard()}catch(e){toast(e.message)}};
function renderAnnouncements(){$('#announcementsList').innerHTML=currentAnnouncements.length?currentAnnouncements.map(a=>`<div class="announcement-card"><h4>${escapeHtml(a.title)}</h4><small>Publie par ${escapeHtml(a.createdBy)} · ${formatDate(a.createdAt)}</small><p>${escapeHtml(a.content)}</p>${me.role==='admin'?`<button class="small-btn danger" onclick="deleteAnnouncement('${a.id}')">Supprimer</button>`:''}</div>`).join(''):'<div class="empty-storage">Aucune annonce.</div>'}
async function loadAnnouncements(){currentAnnouncements=await api('/api/announcements');renderAnnouncements()}
window.deleteAnnouncement=async id=>{if(!confirm('Supprimer cette annonce ?'))return;try{await api(`/api/announcements/${id}`,{method:'DELETE'});await loadAnnouncements();await loadDashboard()}catch(e){toast(e.message)}};


async function loadEventAttendees() {
  const users = await api("/api/users");
  $("#eventAttendees").innerHTML = users
    .filter(user => user.username !== me.username)
    .map(user => `
      <label class="attendee-choice">
        <input type="checkbox" value="${escapeHtml(user.username)}">
        <span>${escapeHtml(user.username)}</span>
      </label>
    `).join("");

  if (me.role !== "admin") {
    $("#eventVisibility").value = "selected";
    $("#eventVisibility").disabled = true;
    $("#eventAttendees").classList.add("hidden");
  }
}

function notificationIcon(type) {
  return { task: "✅", announcement: "📢", calendar: "📅" }[type] || "🔔";
}

function updateNotificationBadge() {
  const unread = currentNotifications.filter(item => !item.read).length;
  $("#notificationBadge").textContent = unread;
  $("#notificationBadge").classList.toggle("hidden", unread === 0);
  $("#topNotificationBadge").textContent = unread;
  $("#topNotificationBadge").classList.toggle("hidden", unread === 0);
}

function renderNotifications() {
  const box = $("#notificationsList");
  box.innerHTML = currentNotifications.length
    ? currentNotifications.map(item => `
      <div class="notification-row ${item.read ? "" : "unread"}">
        <div class="notification-icon">${notificationIcon(item.type)}</div>
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.message)}</p>
          <small>${formatDate(item.createdAt)}</small>
        </div>
        <div>
          ${item.linkPage ? `<button class="small-btn" onclick="openNotification('${item.id}','${escapeHtml(item.linkPage)}')">Ouvrir</button>` : ""}
          ${!item.read ? `<button class="small-btn secondary" onclick="markNotificationRead('${item.id}')">Lu</button>` : ""}
        </div>
      </div>
    `).join("")
    : `<div class="empty-storage">Aucune notification.</div>`;

  updateNotificationBadge();
}

async function loadNotifications() {
  currentNotifications = await api("/api/notifications");
  renderNotifications();
}

window.markNotificationRead = async id => {
  try {
    await api(`/api/notifications/${id}/read`, { method: "PATCH" });
    const item = currentNotifications.find(n => String(n.id) === String(id));
    if (item) item.read = true;
    renderNotifications();
  } catch (error) {
    toast(error.message);
  }
};

window.openNotification = async (id, page) => {
  await markNotificationRead(id);
  const nav = document.querySelector(`[data-page="${page}"]`);
  if (nav) nav.click();
};

function eventAudience(event) {
  return event.visibility === "all"
    ? "Toute l’équipe"
    : (event.attendees || []).join(", ") || "Personnel";
}

function renderEvents() {
  const filter = $("#calendarFilter").value;
  const now = new Date();
  let events = currentEvents.slice();

  if (filter === "upcoming") events = events.filter(event => new Date(event.endAt) >= now);
  if (filter === "past") events = events.filter(event => new Date(event.endAt) < now);

  $("#eventsList").innerHTML = events.length
    ? events.map(event => `
      <div class="event-card">
        <h4>${escapeHtml(event.title)}</h4>
        <div class="event-meta">
          <span>📅 ${formatDate(event.startAt)} → ${formatDate(event.endAt)}</span>
          ${event.location ? `<span>📍 ${escapeHtml(event.location)}</span>` : ""}
          <span>👥 ${escapeHtml(eventAudience(event))}</span>
          <span>Créé par ${escapeHtml(event.createdBy)}</span>
        </div>
        ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
        ${(me.role === "admin" || event.createdBy === me.username)
          ? `<div class="event-actions"><button class="small-btn danger" onclick="deleteEvent('${event.id}')">Supprimer</button></div>`
          : ""}
      </div>
    `).join("")
    : `<div class="empty-storage">Aucun événement.</div>`;
}

async function loadEvents() {
  currentEvents = await api("/api/events");
  renderEvents();
}

window.deleteEvent = async id => {
  if (!confirm("Supprimer cet événement ?")) return;
  try {
    await api(`/api/events/${id}`, { method: "DELETE" });
    await loadEvents();
    toast("Événement supprimé.");
  } catch (error) {
    toast(error.message);
  }
};

async function enterApp(user) {
  me = user;
  if(user.role==='owner'){window.JMHAuthority.enter(user);return;}
  window.JMHGlobalSearch?.reset();
  if (window.jmhDesktop?.getAppVersion) {
    try { desktopAppVersion = await boundedDesktopCall(window.jmhDesktop.getAppVersion(),1500); } catch {}
  }
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#currentUser").textContent = user.username;
  $("#profileAvatar").textContent = user.username.slice(0, 2).toUpperCase();
  $("#roleBadge").textContent = user.role === "admin" ? "Administrateur" : "Compte personnel";
  $$(".admin-only").forEach(element => element.classList.toggle("hidden", user.role !== "admin"));
  applyMyPermissions();
  updateScreenToolsAvailability();

  const initialResults = await Promise.allSettled([
    loadAppSettings()
  ]);
  for (const result of initialResults) if (result.status === 'rejected') toast(result.reason.message);
  bindCinemaForUser(user);
  void window.JMHMusic.load();void window.JMHCinema.load();
  void window.JMHGallery?.prime();
  const wanted=window.JMHPreferences?.get().startPage||'homePage';const targetNav=document.querySelector('[data-page="'+wanted+'"]');
  await navigateWorkspace(user.role==='admin'||user.permissions?.canAccessStorage?(targetNav&&!targetNav.classList.contains('hidden')?wanted:'homePage'):'accountPage');

  void window.JMHAuthority?.notices();
  socket = io();
  // Organisation screens are retired; media state remains on the NAS.
  socket.on("settings_updated", applyAppSettings);
  socket.on('appeal_changed',data=>window.JMHAppeals?.notice(data));
  socket.on('recovery_decision',data=>{toast((data.state==='accepted'?'Restauration acceptée : ':'Restauration refusée, copie active supprimée : ')+data.reason);});
  socket.on('moderation_changed',data=>{if(data.vault)window.JMHPrivateVault?.lock(data.lifted?'Une censure a été levée. Déverrouille ton coffre pour retrouver le fichier.':'Un élément de ce coffre supervisé a été modéré. Déverrouille pour consulter le motif.');else{window.JMHMusic?.destroy();window.JMHCinema?.destroy();}toast(data.lifted?'Une censure a été levée par le Propriétaire.':'Un contenu a été modéré par le Propriétaire. Consulte Mon compte ou ton coffre supervisé pour le motif.');});
  socket.on('disconnect',reason=>{if(reason==='io server disconnect'){void api('/api/me').then(state=>{if(!state.user){window.JMHMusic?.destroy();window.JMHCinema?.destroy();location.reload();}});}});
  checkUpdatesAfterLogin().catch(error => toast(error.message));
}

$("#togglePassword").addEventListener("click", () => {
  const password = $("#password");
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  $("#togglePassword").textContent = visible ? "◉" : "◎";
});

let loginPending=false;
const loginFeedback=document.createElement('p');
loginFeedback.id='loginFeedback';loginFeedback.className='login-feedback';loginFeedback.setAttribute('role','status');loginFeedback.setAttribute('aria-live','polite');
$('#loginForm button[type=submit]').after(loginFeedback);
function boundedDesktopCall(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Le client Windows ne répond pas à temps.')),ms);})]).finally(()=>clearTimeout(timer));}
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if(loginPending)return;
  loginPending=true;
  const button=$('#loginForm button[type=submit]');button.disabled=true;button.textContent='Connexion en cours…';loginFeedback.textContent='Connexion au NAS…';loginFeedback.classList.remove('error');
  try {
    let data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#username").value,
        password: $("#password").value
      })
    });
    let savedPassword=$('#password').value;
    if(data.requiresOwnerAuth){const completed=await window.JMHAuthority.runAuth(data);if(!completed){loginFeedback.textContent='Vérification annulée.';return;}data=completed;}
    if(data.requiresPasswordChange){
      $('#password').value='';savedPassword='';
      const completed=await window.JMHPasswordSetup.run(data);
      if(!completed){loginFeedback.textContent='Connexion annulée. Ton code provisoire reste utilisable jusqu’à son expiration.';return;}
      data=completed.data;savedPassword=completed.password;
    }
    if($('#rememberLogin')?.checked&&window.jmhDesktop?.saveLocalLogin){
      const credentials={username:data.user.username,password:savedPassword};
      // Saving a local convenience must never hold the authenticated workspace hostage.
      void boundedDesktopCall(window.jmhDesktop.saveLocalLogin(credentials),7000).then(saved=>{if(!saved?.ok)throw Error(saved?.error||'Enregistrement impossible');}).catch(e=>toast('Connexion réussie, mais '+e.message));
    }else if(window.jmhDesktop?.markLocalLoginUsed){void boundedDesktopCall(window.jmhDesktop.markLocalLoginUsed(data.user.username),7000).catch(()=>{});}
    savedPassword='';$('#password').value='';
    loginFeedback.textContent='Connexion réussie. Ouverture de ton espace…';
    await enterApp(data.user);
  } catch (error) {
    loginFeedback.textContent=error.message;loginFeedback.classList.add('error');toast(error.message);
  }finally{loginPending=false;button.disabled=false;button.textContent='Se connecter';}
});

$("#logoutBtn").addEventListener("click", async () => {
  try{await window.JMHMusic?.flushFavorites();}catch(error){toast("La sauvegarde d’un favori a échoué. Réessaie avant de te déconnecter.");return;}
  window.JMHCinema?.destroy();
  window.JMHMusic?.destroy();
  window.JMHTools?.destroy();
  window.JMHHome?.reset();
  stopMediaTransferMonitor();
  await api("/api/logout", { method: "POST" });
  location.reload();
});

$("#recipientSelect").addEventListener("change", updateConversationHint);
$("#messageSearch").addEventListener("input", renderFilteredMessages);

$("#exportMessagesBtn").addEventListener("click", () => {
  window.location.href = "/api/export/messages.csv";
});

$("#messageForm").addEventListener("submit", event => {
  event.preventDefault();
  const text = $("#messageInput").value.trim();
  if (!text) return;

  socket.emit("message", {
    text,
    to: $("#recipientSelect").value
  });

  $("#messageInput").value = "";
});

$("#fileInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 25 * 1024 * 1024) {
    toast("Le fichier dépasse 25 Mo.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("to", $("#recipientSelect").value);

  try {
    await api("/api/upload", { method: "POST", body: formData });
    toast("Fichier envoyé.");
  } catch (error) {
    toast(error.message);
  }

  event.target.value = "";
});




$('#createTaskForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/tasks',{method:'POST',body:JSON.stringify({title:$('#taskTitle').value,description:$('#taskDescription').value,assignedTo:$('#taskAssignedTo').value,priority:$('#taskPriority').value,dueDate:$('#taskDueDate').value})});$('#taskTitle').value='';$('#taskDescription').value='';$('#taskDueDate').value='';toast('Tache creee.');await loadTasks();await loadDashboard()}catch(err){toast(err.message)}});
$('#taskFilter').addEventListener('change',renderTasks);
$('#announcementForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/announcements',{method:'POST',body:JSON.stringify({title:$('#announcementTitle').value,content:$('#announcementContent').value})});$('#announcementTitle').value='';$('#announcementContent').value='';toast('Annonce publiee.');await loadAnnouncements();await loadDashboard()}catch(err){toast(err.message)}});

$("#captureScreenBtn").addEventListener("click", captureScreenImage);
$("#startRecordingBtn").addEventListener("click", startScreenRecording);
$("#stopRecordingBtn").addEventListener("click", stopScreenRecording);

$("#cancelScreenPreview").addEventListener("click", () => {
  pendingScreenBlob = null;
  pendingScreenFilename = "";
  $("#screenPreviewDialog").close();
});

$("#sendScreenPreview").addEventListener("click", async () => {
  if (!pendingScreenBlob) return;
  try {
    $("#sendScreenPreview").disabled = true;
    await uploadGeneratedFile(
      pendingScreenBlob,
      pendingScreenFilename,
      pendingScreenFilename.endsWith(".png") ? "Capture d’écran" : "Enregistrement d’écran"
    );
    toast("Contenu d’écran envoyé dans la messagerie.");
    pendingScreenBlob = null;
    pendingScreenFilename = "";
    $("#screenPreviewDialog").close();
  } catch (error) {
    toast(error.message);
  } finally {
    $("#sendScreenPreview").disabled = false;
  }
});

$("#storageSearchBtn").addEventListener("click",()=>void searchStorage());
$("#storageResetSearchBtn").addEventListener("click", async()=>{$("#storageSearchInput").value="";await loadStorage(currentStoragePath);});
$("#storageSearchInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();if(!e.repeat)void searchStorage();}});

$("#createFolderBtn").addEventListener("click", async () => {
  const name = prompt("Nom du nouveau dossier :");
  if (!name) return;
  try {
    await api("/api/storage/folder", {
      method: "POST",
      body: JSON.stringify({ path: currentStoragePath, name })
    });
    toast("Dossier créé.");
    invalidateStorageCache();
    await loadStorage(currentStoragePath,{force:true});
  } catch (error) {
    toast(error.message);
  }
});

$("#storageFileInput").addEventListener("change", async event => {
  await uploadStorageFiles([...event.target.files]);
  event.target.value = "";
});

const dropZone = $("#storageDropZone");
["dragenter","dragover"].forEach(eventName => {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});
["dragleave","drop"].forEach(eventName => {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});
dropZone.addEventListener("drop", async event => {
  await uploadStorageFiles([...event.dataTransfer.files]);
});

$$(".nav").forEach(button => button.addEventListener('click',()=>navigateWorkspace(button.dataset.page)));

renderPermissionControls($("#newPermissionsPanel"), permissionsForPreset("full"), "newperm");

$("#newAccessPreset").addEventListener("change", event => {
  const custom = event.target.value === "custom";
  $("#newPermissionsPanel").classList.toggle("hidden", !custom);
  if (!custom) renderPermissionControls($("#newPermissionsPanel"), permissionsForPreset(event.target.value), "newperm");
});

$("#newRole").addEventListener("change", event => {
  if (event.target.value === "admin") {
    $("#newAccessPreset").value = "full";
    renderPermissionControls($("#newPermissionsPanel"), permissionsForPreset("full"), "newperm");
    $("#newPermissionsPanel").classList.add("hidden");
  }
});


async function loadUsers() {
  const users = await api("/api/admin/users");

  window.currentAdminUsers = users;
  $("#usersTable").innerHTML = users.map(user => `
    <div class="user-row">
      <div>
        <b>${escapeHtml(user.username)}</b><br><small>${user.role==='admin'?'Administrateur':'Compte personnel'}</small>
        <div class="access-summary">${permissionSummary(user.permissions || {})}</div>
      </div>
      <div>${user.active ? "🟢 Actif" : "🔴 Désactivé"}</div>
      <div><small>Dernière connexion<br>${user.lastLogin ? formatDate(user.lastLogin) : "Jamais"}</small></div>
      <div>
        <button class="small-btn" onclick="openEditUser('${user.id}')">Modifier</button>
        <button class="small-btn" onclick="resetPassword('${user.id}')">Mot de passe aléatoire</button>
        ${user.username !== me.username
          ? `<button class="small-btn ${user.active ? "danger" : ""}" onclick="toggleUser('${user.id}')">${user.active ? "Désactiver" : "Activer"}</button>
             <button class="small-btn danger" onclick="deleteUser('${user.id}','${escapeHtml(user.username)}')">Supprimer</button>`
          : ""}
      </div>
    </div>
  `).join("");
}


window.openEditUser = id => {
  const user = (window.currentAdminUsers || []).find(item => String(item.id) === String(id));
  if (!user) return toast("Utilisateur introuvable.");

  $("#editUserId").value = user.id;
  $("#editUsername").value = user.username;
  $("#editRole").value = user.role;
  const preset = detectPreset(user.permissions || {});
  $("#editAccessPreset").value = preset;
  renderPermissionControls($("#editPermissionsPanel"), user.permissions || permissionsForPreset("full"), "editperm");
  $("#editUserDialog").showModal();
};

$("#cancelEditUser").addEventListener("click", () => $("#editUserDialog").close());

$("#editAccessPreset").addEventListener("change", event => {
  if (event.target.value !== "custom") {
    renderPermissionControls($("#editPermissionsPanel"), permissionsForPreset(event.target.value), "editperm");
  }
});

$("#editUserForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("#editUserId").value;
  try {
    const data = await api(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        username: $("#editUsername").value,
        role: $("#editRole").value,
        permissions: readPermissionControls("editperm")
      })
    });
    $("#editUserDialog").close();
    toast("Compte et autorisations mis à jour.");
    if (String(me.id) === String(id)) {
      me = data.user;
      $("#currentUser").textContent = me.username;
      applyMyPermissions();
      updateScreenToolsAvailability();
    }
    await loadUsers();
    await loadRecipients();
  } catch (error) {
    toast(error.message);
  }
});


window.deleteUser = async (id, username) => {
  if (!confirm(`Supprimer définitivement le compte « ${username} » ?`)) return;
  try {
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    toast("Compte supprimé.");
    await loadUsers();
    await loadRecipients();
  } catch (error) {
    toast(error.message);
  }
};

window.resetPassword = async id => {
  try {
    const data = await api(`/api/admin/users/${id}/reset-password`, { method: "POST" });
    window.JMHPasswordSetup.showTemporary(data);
    await loadUsers();
  } catch (error) {
    toast(error.message);
  }
};

window.toggleUser = async id => {
  try {
    await api(`/api/admin/users/${id}/toggle`, { method: "PATCH" });
    await loadUsers();
    await loadRecipients();
  } catch (error) {
    toast(error.message);
  }
};

async function loadAudit() {
  const logs = await api("/api/admin/audit");
  $("#auditList").innerHTML = logs.map(log => `
    <div class="audit-row">
      <div>${formatDate(log.at)}</div>
      <div>${escapeHtml(log.username)}</div>
      <div>${escapeHtml(log.details)}</div>
      <div>${escapeHtml(log.type)}</div>
    </div>
  `).join("");
}

bindWorkspaceControls();
function bindCinemaForUser(user){window.JMHCinema.init({api,toast,user});window.JMHMusic.init({api,toast,user});startMediaTransferMonitor();}

async function refreshLocalLogin(){
 if(window.JMHLocalAccounts)return window.JMHLocalAccounts.refresh();
 const bridge=window.jmhDesktop;if(!bridge?.localLoginStatus){$('#localLoginStatus').textContent='La mémorisation locale est disponible dans l’application Windows JMH.';return;}
 try{const info=await bridge.localLoginStatus();if(window.JMHLocalAccounts)return window.JMHLocalAccounts.refresh();$('#localLoginControls').classList.toggle('hidden',!info.available);$('#fillSavedLogin').classList.toggle('hidden',!info.saved);$('#clearSavedLogin').classList.toggle('hidden',!info.saved);$('#rememberLogin').checked=info.saved;$('#localLoginStatus').textContent=info.available?'Identifiants chiffrés sur ce PC uniquement. Remplir ne déclenche pas la connexion.':'Le chiffrement local n’est pas disponible sur ce PC.';}catch(e){$('#localLoginStatus').textContent=e.message;}
}
$('#fillSavedLogin').addEventListener('click',async()=>{if(window.JMHLocalAccounts)return window.JMHLocalAccounts.fill();try{const saved=await window.jmhDesktop.fillLocalLogin();if(!saved?.ok)throw Error(saved?.error||'Lecture impossible');$('#username').value=saved.username;$('#password').value=saved.password;$('#localLoginStatus').textContent='Identifiants remplis. Clique sur Se connecter.';}catch(e){toast(e.message);}});
$('#clearSavedLogin').addEventListener('click',async()=>{if(window.JMHLocalAccounts)return window.JMHLocalAccounts.forget();const result=await window.jmhDesktop.clearLocalLogin();if(result?.ok){$('#password').value='';await refreshLocalLogin();toast('Identifiants effacés sur ce PC.');}else toast(result?.error||'Effacement impossible.');});
// Always present the login screen; a remembered session never opens the workspace automatically.
refreshLocalLogin();

document.getElementById('logoutBtn').addEventListener('click',()=>{cancelStorageRequest();invalidateStorageCache();storageItems=[];storageView={query:'',listPage:0};storageNavigationUser=null;});
