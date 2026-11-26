(() => {
 'use strict';
 const text=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
 async function refresh(){
  try{
   const response=await fetch('/api/remote-access/status',{cache:'no-store',credentials:'same-origin'});
   if(response.status===401){text('remoteState','Connecte-toi à JMH, puis reviens sur cette page et clique sur Actualiser.');return;}
   if(!response.ok)throw Error();const s=await response.json();
   const states={connected:'NAS relié à Tailscale',NeedsLogin:'Il reste à relier le NAS à ton compte Tailscale',NeedsMachineAuth:'Valide le NAS dans la liste des appareils de ton compte Tailscale',unavailable:'Service momentanément indisponible','not-installed':'Service pas encore installé',Stopped:'Tailscale est arrêté'};
   text('remoteState',states[s.state]||'Connexion en préparation');
   const auth=document.getElementById('authorizeNas');
   if(auth){auth.hidden=!(s.authenticationUrl||s.consentUrl);auth.textContent=s.authenticationUrl?'Relier mon NAS à Tailscale':'Activer le HTTPS privé';}
   text('remoteAddress',s.url||'L’adresse apparaîtra après la connexion à Tailscale.');
   text('remoteFiles',s.ipv4?'smb://'+s.ipv4+' · partage JMH':'L’adresse des fichiers apparaîtra après la connexion.');
   text('remoteHttps',s.httpsConfigured?'Adresse HTTPS configurée. Active Tailscale sur ton appareil pour l’utiliser.':'L’installation mobile attend l’activation de HTTPS.');
   const open=document.getElementById('openRemoteJmh');if(open){open.hidden=!s.url||!s.httpsConfigured;if(s.url)open.href=s.url;}
  }catch{text('remoteState','Impossible de lire l’état. Vérifie que le NAS fonctionne, puis réessaie.');}
 }
 document.getElementById('refreshRemote')?.addEventListener('click',refresh);
 refresh();
})();
