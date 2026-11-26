(() => {
 'use strict';
 if(window.jmhDesktop)return;
 if(window.isSecureContext && 'serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{}));
 }
 if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){
  document.querySelectorAll('[data-install-jmh]').forEach(el=>el.hidden=true);
 }
 let prompt=null;
 const button=document.getElementById('installMobileApp');
 window.addEventListener('beforeinstallprompt',event=>{
  if(!button)return;
  event.preventDefault();prompt=event;button.hidden=false;
 });
 button?.addEventListener('click',async()=>{
  if(!prompt)return;
  try{await prompt.prompt();await prompt.userChoice;}finally{prompt=null;button.hidden=true;}
 });
 const warning=document.getElementById('secureMobileWarning');
 if(warning && !window.isSecureContext)warning.hidden=false;
})();
