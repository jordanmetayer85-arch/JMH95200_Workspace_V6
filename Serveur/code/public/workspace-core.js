let currentTasks = [], currentAnnouncements = [], currentEvents = [], currentNotifications = [];
let desktopAppVersion = '5.1.0', appSettings = {};
let screenRecordingStream = null, screenRecorder = null, screenRecordingChunks = [];
let recordingStartedAt = 0, recordingTimer = null, pendingScreenBlob = null, pendingScreenFilename = '';

function applyAppSettings(settings) {
  appSettings = settings || {};
  document.body.dataset.accent = appSettings.accent || 'blue';
  const savedTheme = localStorage.getItem('jmh-theme');
  document.body.classList.toggle('light-theme', (savedTheme || appSettings.defaultTheme) === 'light');
  $('#sidebarWorkspaceName').textContent = appSettings.workspaceName || 'JMH95200';
  $('#settingCompanyName').value = appSettings.companyName || 'JMH95200';
  $('#settingWorkspaceName').value = appSettings.workspaceName || 'JMH95200';
  $('#settingSlogan').value = appSettings.slogan || '';
  $('#settingAccent').value = appSettings.accent || 'blue';
  $('#settingDefaultTheme').value = appSettings.defaultTheme || 'dark';
  window.JMHStudio?.preferences();
}
async function loadAppSettings() { applyAppSettings(await api('/api/settings')); }
async function saveAppSettings(changes) {
  applyAppSettings(await api('/api/settings', {method:'PUT',body:JSON.stringify({...appSettings,...changes})}));
  toast('Paramètres enregistrés.');
}
async function loadSystemStatus() {
  const data = await api('/api/system/status');
  $('#serverHostname').textContent = data.hostname;
  $('#systemMemory').textContent = formatBytes(data.usedMemory);
  $('#systemStorage').textContent = `${data.storageFiles} fichiers`;
  $('#systemUptime').textContent = `${Math.floor(data.uptime / 3600)} h`;
  const values = [['Ordinateur',data.hostname],['Système',data.platform],['Processeur',data.cpuModel],['Mémoire',formatBytes(data.totalMemory)],['Documents',data.storageRoot],['Occupation',formatBytes(data.storageBytes)],['Application',data.appVersion],['Port',data.port]];
  $('#systemDetails').innerHTML = values.map(([label,value]) => `<div class="system-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}
async function loadUpdateStatus() {
  const data = await api('/api/updates/current');
  const box = $('#updateStatus');
  box.replaceChildren();
  const title = document.createElement('h4');
  title.textContent = data.filename ? `Version publiée : ${data.version}${data.build ? ' · build ' + data.build : ''}` : 'Aucune mise à jour publiée';
  box.append(title);
  const detail = document.createElement('p');
  detail.textContent = data.filename ? (data.notes || 'Aucune note de version.') : 'Aucun installateur Windows n’a été publié. L’interface est chargée depuis le serveur principal à chaque ouverture.';
  box.append(detail);
  if (typeof data.filename === 'string' && /^JMH95200-Workspace-Update-[A-Za-z0-9.-]+\.exe$/.test(data.filename) &&
      data.downloadUrl === '/api/updates/download/' + encodeURIComponent(data.filename)) {
    const link = document.createElement('a');
    link.className = 'download-link'; link.href = data.downloadUrl; link.textContent = 'Télécharger l’installateur';
    box.append(link);
  }
  if (safeDesktopUpdater() && validPublishedUpdate(data)) {
    const version = await window.jmhDesktop.getAppVersion();
    const build = await window.jmhDesktop.getAppBuild();
    if (compareUpdateParts(data.version, version) > 0 ||
        (compareUpdateParts(data.version, version) === 0 && compareUpdateParts(data.build, build) > 0)) {
      const button = document.createElement('button');
      button.className = 'secondary'; button.textContent = 'Installer depuis le serveur';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await window.jmhDesktop.installUpdate();
          toast(result.ok && result.action === 'install-launched' ? 'Installateur vérifié lancé. JMH va se fermer.' :
            result.error || 'Ce PC dispose déjà de la version publiée.');
        } catch (error) { toast(error.message); }
        finally { button.disabled = false; }
      });
      box.append(button);
    }
  } else if (data.filename) {
    const note = document.createElement('p');
    note.textContent = safeDesktopUpdater() ? 'Cette publication ne permet pas une installation automatique vérifiée.' :
      'Ce navigateur ou cet ancien programme ne permet pas l’installation automatique. Utilisez un installateur JMH compatible pour mettre à niveau le programme Windows.';
    box.append(note);
  }
}
function safeDesktopUpdater() {
  return window.jmhDesktop?.updaterProtocol === 1 && typeof window.jmhDesktop.checkForUpdate === 'function' &&
    typeof window.jmhDesktop.getAppBuild === 'function' && typeof window.jmhDesktop.getAppVersion === 'function' &&
    typeof window.jmhDesktop.installUpdate === 'function';
}
function compareUpdateParts(left, right) {
  const a = String(left).split('.').map(Number), b = String(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
function validPublishedUpdate(data) {
  return data?.schema === 1 && data.product === 'jmh95200-workspace-stable' && data.platform === 'win32' && data.arch === 'x64' &&
    typeof data.version === 'string' && data.version.length <= 64 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(data.version) &&
    data.version.split('.').every(part => Number.isSafeInteger(Number(part))) && typeof data.build === 'string' && data.build.length <= 48 &&
    /^\d{1,10}(?:\.\d{1,10}){1,7}$/.test(data.build) && data.build.split('.').every(part => Number.isSafeInteger(Number(part))) &&
    typeof data.filename === 'string' && data.filename.length <= 240 && /^JMH95200-Workspace-Update-[A-Za-z0-9.-]+\.exe$/.test(data.filename) &&
    typeof data.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(data.sha256) && Number.isSafeInteger(data.size) && data.size >= 68 && data.size <= 2 * 1024 * 1024 * 1024 &&
    typeof data.publishedAt === 'string' && Number.isFinite(Date.parse(data.publishedAt)) &&
    data.downloadUrl === '/api/updates/download/' + encodeURIComponent(data.filename);
}
async function checkUpdatesAfterLogin() {
  if (!safeDesktopUpdater()) {
    return { ok: true, automaticSupported: false };
  }
  const result = await window.jmhDesktop.checkForUpdate();
  if (!result.ok) toast(result.error || 'La vérification de mise à jour a échoué.');
  else if (result.action === 'install-launched') toast('Mise à jour vérifiée : l’installateur démarre et JMH va se fermer.');
  else if (result.action === 'next-launch') toast('Une mise à jour compatible sera installée au prochain lancement de JMH.');
  else if (result.action === 'already-attempted') toast('Cette installation a déjà été lancée. Si elle a été annulée, ouvrez Mises à jour pour la relancer.');
  return result;
}
function bindWorkspaceControls() {
  $('#themeToggle').addEventListener('click', () => {
    const light = document.body.classList.toggle('light-theme');
    localStorage.setItem('jmh-theme',light?'light':'dark');
  });
  $('#sidebarToggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $('#topNotificationsBtn').addEventListener('click', () => navigateWorkspace('notificationsPage'));
  $$('[data-jump]').forEach(button => button.addEventListener('click', () => navigateWorkspace(button.dataset.jump)));
  window.JMHGlobalSearch?.bind();
  $$('.settings-tab').forEach(button => button.addEventListener('click', () => {
    $$('.settings-tab').forEach(tab=>tab.classList.toggle('active',tab===button));
    $$('.settings-panel').forEach(panel=>panel.classList.toggle('hidden',panel.id!==`settings-${button.dataset.settingsTab}`));
  }));
  $('#generalSettingsForm').addEventListener('submit', async event => {
    event.preventDefault(); try {await saveAppSettings({companyName:$('#settingCompanyName').value,workspaceName:$('#settingWorkspaceName').value,slogan:$('#settingSlogan').value});}catch(error){toast(error.message);}
  });
  $('#appearanceSettingsForm').addEventListener('submit', async event => {
    event.preventDefault();try {await saveAppSettings({accent:$('#settingAccent').value,defaultTheme:$('#settingDefaultTheme').value});localStorage.removeItem('jmh-theme');applyAppSettings(appSettings);}catch(error){toast(error.message);}
  });
  $('#refreshSystemBtn').addEventListener('click',()=>loadSystemStatus().catch(error=>toast(error.message)));
  $('#connectionSettingsBtn').classList.toggle('hidden',!window.jmhDesktop?.openConnectionSettings);
  $('#connectionSettingsBtn').addEventListener('click',()=>window.jmhDesktop?.openConnectionSettings());
  $('#changePasswordForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if($('#newPassword').value!==$('#confirmPassword').value)return toast('Les deux nouveaux mots de passe ne correspondent pas.');
    try{await api('/api/account/change-password',{method:'POST',body:JSON.stringify({currentPassword:$('#currentPassword').value,newPassword:$('#newPassword').value,confirmPassword:$('#confirmPassword').value})});event.target.reset();toast('Mot de passe modifié.');}catch(error){toast(error.message);}
  });
  $('#publishUpdateForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const build = prompt('Numéro de build contenu dans cet installateur JMH pour Windows 64 bits (exemple : 2026.10.02.1).');
    if (build === null) return;
    const form=new FormData();form.append('version',$('#publishVersion').value);form.append('build',build.trim());form.append('notes',$('#publishNotes').value);form.append('installer',$('#publishInstaller').files[0]);
    try{await api('/api/admin/updates',{method:'POST',body:form});event.target.reset();await loadUpdateStatus();toast('Mise à jour publiée.');}catch(error){toast(error.message);}
  });
  $('#markAllNotificationsBtn').addEventListener('click',async()=>{try{await api('/api/notifications/read-all',{method:'POST'});await loadNotifications();}catch(error){toast(error.message);}});
  $('#clearNotificationsBtn').addEventListener('click',async()=>{if(!confirm('Vider tes notifications ?'))return;try{await api('/api/notifications',{method:'DELETE'});await loadNotifications();}catch(error){toast(error.message);}});
  $('#calendarFilter').addEventListener('change',renderEvents);
  $('#eventVisibility').addEventListener('change',()=>$('#eventAttendees').classList.toggle('hidden',$('#eventVisibility').value==='all'));
  $('#eventForm').addEventListener('submit',async event=>{
    event.preventDefault();const attendees=$$('#eventAttendees input:checked').map(input=>input.value);
    try{await api('/api/events',{method:'POST',body:JSON.stringify({title:$('#eventTitle').value,startAt:$('#eventStart').value,endAt:$('#eventEnd').value,location:$('#eventLocation').value,description:$('#eventDescription').value,visibility:$('#eventVisibility').value,attendees})});event.target.reset();await loadEvents();toast('Événement créé.');}catch(error){toast(error.message);}
  });
}
const WORKSPACE_PAGES = {
  homePage:['Accueil','Ton cinéma, ta musique et ton espace personnel.'],
  musicPage:['Musiques','Tes titres, tes albums et tes playlists.'], cinemaPage:['Cinéma','Ta collection, à ton rythme.'], dashboardPage:['Vue d’ensemble','Tout ton espace, au même endroit.'],
  chatPage:['Messages','Tes échanges en temps réel.'],storagePage:['Mes fichiers','Tes documents sur le NAS.'],
  tasksPage:['Tâches','Un peu d’ordre pour tes projets.'],calendarPage:['Calendrier','Tes rendez-vous et événements.'],
  notificationsPage:['Notifications','Les dernières nouvelles.'],announcementsPage:['Annonces','Les informations à partager.'],
  trashPage:['Corbeille','Retrouver les fichiers supprimés.'],usersPage:['Utilisateurs','Les comptes et leurs accès.'],
  auditPage:['Journal','L’activité de ton espace.'],accountPage:['Mon compte','Ton profil et ton mot de passe.'],
  updatesPage:['Mises à jour','Les versions de l’application.'],settingsPage:['Paramètres','Un espace à ton image.']
};
async function navigateWorkspace(pageId) {
  if(['updatesPage','appearancePage','usersPage','accountPage'].includes(pageId)){if(!me||(pageId==='usersPage'&&me.role!=='admin'))return;await navigateWorkspace('settingsPage');window.JMHPreferences?.openTab({updatesPage:'updates',appearancePage:'appearance',usersPage:'users',accountPage:'account'}[pageId]);return;}
  if(pageId==='audioPage'){window.JMHStudio.openAudio();return;}
  const button=document.querySelector(`.nav[data-page="${pageId}"]`);
  if(!me || !button || button.hidden || button.classList.contains('studio-retired') || button.classList.contains('hidden'))return;
  const disclosure=button.closest('details');if(disclosure)disclosure.open=true;
  $$('.nav').forEach(item=>item.classList.toggle('active',item===button));
  $$('.page').forEach(page=>page.classList.toggle('hidden',page.id!==pageId));
  $('.sidebar').classList.remove('open');
  $('#pageTitle').textContent=WORKSPACE_PAGES[pageId][0];$('#pageSubtitle').textContent=WORKSPACE_PAGES[pageId][1];
  try{
    window.JMHEvolution?.onNavigate(pageId);
    window.JMHMusic?.onNavigate?.(pageId);
    await window.JMHTools?.onNavigate(pageId);
    if(pageId==='homePage')await window.JMHHome.load({api,user:me});
    if(pageId==='cinemaPage')await window.JMHCinema.load();
    if(pageId==='musicPage')await window.JMHMusic.load();
    if(pageId==='photosPage'||pageId==='personalVideosPage')await window.JMHGallery.load(pageId);
    const loaders={dashboardPage:loadDashboard,tasksPage:loadTasks,calendarPage:loadEvents,notificationsPage:loadNotifications,announcementsPage:loadAnnouncements,storagePage:loadStorage,trashPage:loadTrash,usersPage:loadUsers,auditPage:loadAudit,updatesPage:loadUpdateStatus};
    if(loaders[pageId])await loaders[pageId]();
    if(pageId==='dashboardPage')await loadSystemStatus();
    if(pageId==='settingsPage')window.JMHPreferences?.load();if(pageId==='accountPage')await window.JMHProfile?.load();if(pageId==='homePage')void window.JMHHomeMemories?.load();
  }catch(error){toast(error.message);}
}

let mediaTransferTimer=null;
function stopMediaTransferMonitor(){clearInterval(mediaTransferTimer);mediaTransferTimer=null;}
function startMediaTransferMonitor(){
  stopMediaTransferMonitor();const banner=$('#mediaTransferStatus');
  if(me.role!=='admin'&&!me.permissions?.canAccessStorage){banner.classList.add('hidden');return;}
  const refresh=async()=>{try{const state=await api('/api/media-transfer');
    if(!state.status||state.status==='none'){banner.classList.add('hidden');return;}
    banner.classList.toggle('hidden',state.status==='complete');banner.classList.toggle('transfer-complete',state.status==='complete');
    const stale=['copying','verifying'].includes(state.status)&&state.updatedAt&&Date.now()-Date.parse(state.updatedAt)>120000;
    if(state.status==='complete')banner.textContent='✓ La copie sur le NAS a été vérifiée. Les bibliothèques utilisent le NAS et les originaux restent sur My Passport.';
    else if(stale||['failed','interrupted'].includes(state.status))banner.textContent='La copie vers le NAS est interrompue. Tes originaux restent sur My Passport. Les fichiers déjà copiés sur le NAS sont accessibles dans JMH.';
    else if(state.status==='verifying')banner.textContent='Vérification des copies sur le NAS en cours. Garde le PC, le NAS et My Passport allumés et connectés.';
    else banner.textContent='Copie vers le NAS en cours'+(state.phase==='music'?' : musiques':state.phase==='films'?' : films':'')+'. Tes originaux restent sur My Passport. Garde le PC, le NAS et le disque connectés.';
    const details=document.getElementById('studioTransferStatus');if(details)details.textContent=banner.textContent;
  }catch{/* Keep the last transfer state while the local server reconnects. */}};
  refresh();mediaTransferTimer=setInterval(refresh,30000);
}
