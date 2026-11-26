(()=>{'use strict';
let options,current=null,busy=false,delay=null;
const dialog=document.createElement('dialog');dialog.className='desktop-approval';
const title=document.createElement('h2');title.textContent='Autoriser cette action ?';
const info=document.createElement('p');info.textContent='Windows-MCP attend ton accord avant d’agir sur ce PC.';info.setAttribute('role','status');
const tool=document.createElement('strong'),input=document.createElement('pre'),actions=document.createElement('div'),deny=document.createElement('button'),allow=document.createElement('button'),always=document.createElement('button');
deny.type=allow.type=always.type='button';deny.textContent='Refuser';allow.textContent='Autoriser une fois';always.textContent='Autoriser pour cette demande';always.title='Autorise ce type d’action sans redemander jusqu’à la fin de cette demande. Réservé aux clics, défilements et mouvements de souris.';deny.className='secondary';allow.className='secondary';always.className='primary';actions.append(deny,allow,always);dialog.append(title,info,tool,input,actions);document.body.append(dialog);
function waitForApprovalClick(signal){return new Promise(resolve=>{
 const end=performance.now()+3000;let timer;
 const finish=value=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);resolve(value);};
 const cancel=()=>finish(false);
 function tick(){if(signal.aborted)return finish(false);const left=end-performance.now();if(left<=0)return finish(true);info.textContent=`Autorisation reçue · démarrage dans ${Math.ceil(left/1000)} s. Relâche la souris et laisse-la immobile. Tu peux encore annuler.`;timer=setTimeout(tick,Math.min(200,left));}
 signal.addEventListener('abort',cancel,{once:true});tick();
});}
async function decide(value,remember=false){
 if(!current)return;
 if(busy){if(!value)delay?.abort();return;}
 const id=current;busy=true;allow.disabled=always.disabled=true;
 try{
  if(value){delay=new AbortController();deny.textContent='Annuler l’action';value=await waitForApprovalClick(delay.signal);}
  if(current!==id)return;
  if(document.hidden)value=false;
  deny.disabled=true;
  await options.approve({id,allow:value,always:value&&remember});
  if(current===id){current=null;dialog.close();}
 }catch(e){info.textContent=e.message;}
 finally{delay=null;busy=false;deny.textContent='Refuser';deny.disabled=allow.disabled=always.disabled=false;}
}
deny.onclick=()=>void decide(false);allow.onclick=()=>void decide(true);always.onclick=()=>void decide(true,true);dialog.addEventListener('cancel',e=>{e.preventDefault();void decide(false);});
async function refresh(){if(!options||busy||document.hidden||options.enabled&&!options.enabled())return;try{const s=await options.status();const a=s.desktopApproval;if(!a){if(current){current=null;dialog.close();}return;}if(a.id===current)return;current=a.id;tool.textContent={Click:'Cliquer',Type:'Saisir du texte',Scroll:'Faire défiler',Move:'Déplacer la souris',Shortcut:'Raccourci clavier',App:'Gérer une fenêtre'}[a.tool]||a.tool;input.textContent=JSON.stringify(a.input,null,2);always.hidden=!['Click','Scroll','Move'].includes(a.tool);info.textContent='Windows-MCP attend ton accord. Cette demande expire après 90 secondes.';if(!dialog.open)dialog.showModal();}catch{if(current){current=null;dialog.close();}}}
window.AtelierPermissions={configure(value){options=value;void refresh();},close(){current=null;delay?.abort();dialog.close();}};
const timer=setInterval(refresh,1000);
window.addEventListener('pagehide',()=>{clearInterval(timer);window.AtelierPermissions.close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)delay?.abort();});
})();
