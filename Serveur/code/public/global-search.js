(()=>{
 'use strict';let bound=false,reset=()=>{};
 window.JMHGlobalSearch={reset:()=>reset(),bind(){
  if(bound){reset();return;}bound=true;
  const input=document.getElementById('globalSearch'),root=input.closest('.global-search'),results=document.createElement('div'),submit=document.createElement('button');
  let timer=null,sequence=0,abort=null;
  root.style.position='relative';results.id='jmhSearchResults';results.className='global-search-results';results.hidden=true;results.setAttribute('role','listbox');root.append(results);
  submit.type='button';submit.className='global-search-submit';
  // Loupe dessinée en SVG : le caractère ⌕ dépendait de la police et apparaissait petit et décalé.
  submit.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="display:block;margin:auto" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>';submit.setAttribute('aria-label','Lancer la recherche');root.append(submit);
  input.setAttribute('role','combobox');input.setAttribute('aria-controls',results.id);input.setAttribute('aria-expanded','false');input.placeholder='Musique, film, fichier…';
  function hide(){clearTimeout(timer);sequence++;abort?.abort();abort=null;results.hidden=true;input.setAttribute('aria-expanded','false');}
  reset=()=>{hide();input.value='';results.replaceChildren();};
  async function search(){
   clearTimeout(timer);abort?.abort();abort=new AbortController();const controller=abort,query=input.value.trim(),token=++sequence,user=me?.id;
   if(query.length<2||user==null){hide();return;}
   const can=permission=>me?.role==='admin'||me?.permissions?.[permission]===true,valid=()=>token===sequence&&me?.id===user;
   const groups={music:[],cinema:[],files:[]};let pending=0,failed=0,limited=false;
   results.hidden=false;input.setAttribute('aria-expanded','true');
   function render(){
    if(!valid())return;const focused=results.contains(document.activeElement)?document.activeElement.dataset.searchKey:null;results.replaceChildren();
    const found=[...groups.music,...groups.cinema,...groups.files];
    for(const item of found){
     const choice=document.createElement('button');choice.type='button';choice.className='global-search-result';choice.setAttribute('role','option');choice.dataset.searchKey=item.kind+':'+(item.id||item.file.path);
     const glyph=document.createElement('span');glyph.className='global-search-result-icon';glyph.append(JMHStudio.icon(item.kind==='music'?'music':item.kind==='cinema'?'film':'folder'));
     const copy=document.createElement('span'),title=document.createElement('strong'),small=document.createElement('small');title.textContent=item.kind==='file'?'Mes fichiers · '+item.title:item.title;small.textContent=item.subtitle||'';copy.append(title,small);choice.append(glyph,copy);let opening=false;
     choice.onclick=async()=>{if(opening||me?.id!==user||results.hidden)return;opening=true;hide();input.value='';try{if(item.kind==='music'){await navigateWorkspace('musicPage');await JMHMusic.open(item.id,true);}else if(item.kind==='cinema'){await navigateWorkspace('cinemaPage');await JMHCinema.open(item.id,true);}else{await navigateWorkspace('storagePage');if(item.file.type==='folder')await openStoragePath(item.file.path);else await openStorageFile(item.file);}}catch(error){toast(error.message);}};
     results.append(choice);
    }
    if(pending||!found.length||limited){const note=document.createElement('p');note.textContent=pending?'Recherche en cours…':!found.length?(failed?'Certaines collections sont indisponibles. Réessaie la recherche.':'Aucun résultat pour « '+query+' ».'):'Résultats limités : précise le nom pour affiner.';results.append(note);}
    if(focused)[...results.querySelectorAll('button')].find(b=>b.dataset.searchKey===focused)?.focus();
   }
   const jobs=[];
   function run(fn){pending++;jobs.push((async()=>{try{await fn();}catch(error){if(error.name!=='AbortError')failed++;}finally{pending--;render();}})());}
   if(can('canAccessStorage'))run(async()=>{const files=await api('/api/storage/search?q='+encodeURIComponent(query),{signal:controller.signal});if(!valid())return;limited=Boolean(files.partial)||files.length>8;groups.files=files.slice(0,8).map(file=>({kind:'file',title:file.name,subtitle:file.path,file}));});
   if(can('canAccessMusic'))run(async()=>{await JMHMusic.load();if(valid())groups.music=JMHMusic.search(query).slice(0,6);});
   if(can('canAccessCinema'))run(async()=>{await JMHCinema.load();if(valid())groups.cinema=JMHCinema.search(query).slice(0,6);});
   render();await Promise.allSettled(jobs);
  }
  input.addEventListener('input',()=>{sequence++;abort?.abort();clearTimeout(timer);timer=setTimeout(search,180);});submit.onclick=()=>void search();
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void search();}if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('button')?.focus();}if(event.key==='Escape')hide();});
  results.addEventListener('keydown',event=>{const choices=[...results.querySelectorAll('button')],index=choices.indexOf(document.activeElement);if(event.key==='Escape'){hide();input.focus();}else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();choices[Math.max(0,Math.min(choices.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();}});
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))hide();});document.getElementById('logoutBtn').addEventListener('click',reset);
 }};
})();
