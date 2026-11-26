(() => {
 'use strict';
 const button=document.querySelector('#dictate'),area=document.querySelector('#prompt'),status=document.querySelector('#dictation-status');
 let recognition=null,nativeBusy=false,accepted=false,active=false;
 function nativeBridge(){try{return window.jmhDesktop?.startDictation?window.jmhDesktop:window.parent!==window&&window.parent.jmhDesktop?.startDictation?window.parent.jmhDesktop:null;}catch{return null;}}
 function feedback(text){status.textContent=text;}
 function setActive(value){active=value;button.classList.toggle('listening',value);button.setAttribute('aria-pressed',String(value));button.setAttribute('aria-label',value?'Arrêter la dictée':'Dicter mon message');button.title=value?'Arrêter la dictée':'Dicter mon message';}
 function consent(){if(accepted)return true;accepted=window.confirm('La dictée transforme ta voix en texte avec le service de ton navigateur ou de Windows, qui peut traiter la voix en ligne. Le texte sera ajouté au message pour relecture : il ne sera pas envoyé automatiquement à Gemini. Activer la dictée ?');return accepted;}
 function insert(text){const start=area.selectionStart,end=area.selectionEnd,max=area.maxLength>0?area.maxLength:12000;let value=(start&&!/\s$/.test(area.value.slice(0,start))?' ':'')+text;value=value.slice(0,Math.max(0,max-area.value.length+(end-start)));area.setRangeText(value,start,end,'end');area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();}
 async function native(){if(nativeBusy)return;nativeBusy=true;button.disabled=true;area.focus();try{const bridge=nativeBridge();const result=bridge?await bridge.startDictation():await window.AtelierDictationNative();if(!result?.ok)throw Error(result?.error||'La dictée Windows ne peut pas être ouverte.');feedback('Dictée Windows ouverte. Parle, puis arrête le micro dans le volet Windows. Relis ton message avant Envoyer.');}catch(e){feedback(e.message+' Tu peux aussi utiliser Windows + H dans ce champ.');}finally{nativeBusy=false;button.disabled=false;}}
 function stop(){try{recognition?.stop();}catch{}recognition=null;setActive(false);}
 button.addEventListener('click',()=>{
  if(active){stop();return;}area.focus();if(!consent())return;
  const bridge=nativeBridge();if(bridge||window.AtelierDictationNative&&/Windows/i.test(navigator.userAgent)){void native();return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){feedback(/iPhone|iPad|Android/i.test(navigator.userAgent)?'Utilise le microphone du clavier de ton téléphone dans ce champ.':'La dictée est indisponible dans ce navigateur. Sous Windows, clique dans le message puis presse Windows + H.');return;}
  recognition=new Recognition();const current=recognition;current.lang='fr-FR';current.continuous=true;current.interimResults=true;
  current.onstart=()=>{setActive(true);feedback('Écoute en cours… Clique sur le micro pour arrêter.');};
  current.onresult=e=>{let preview='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)insert(e.results[i][0].transcript);else preview+=e.results[i][0].transcript;}feedback(preview?'Reconnaissance : '+preview:'Écoute en cours… Ton texte est ajouté au message.');};
  current.onerror=e=>{feedback(e.error==='not-allowed'?'Le microphone n’est pas autorisé. Tu peux modifier son autorisation dans le navigateur.':'Dictée interrompue ('+e.error+'). Tu peux continuer au clavier.');recognition=null;setActive(false);};
  current.onend=()=>{if(recognition===current){recognition=null;feedback('Dictée terminée. Relis ton texte, puis clique sur Envoyer.');}setActive(false);};
  try{current.start();}catch{recognition=null;setActive(false);feedback('Le microphone n’a pas pu démarrer.');}
 });
 document.querySelector('#chat-form').addEventListener('submit',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
 window.AtelierDictation={stop};
})();
