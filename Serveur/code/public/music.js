(function () {
  "use strict";
  const s = { api:null,toast:null,user:null,tracks:[],trackMap:new Map(),playlists:[],genres:[],artists:[],albums:[],filter:"all",query:"",genre:"",artist:"",album:"",sort:"recent",playlistId:null,page:0,pageSize:60,detailId:null,currentId:null,queue:[],ready:false,wired:false,loaded:false,native:false,canPick:false,loadToken:0,playToken:0,lastSave:0,closing:false,importBusy:false,creatingForTrack:null,viewHistory:[],progressQueue:Promise.resolve() };
  const $ = id => document.getElementById(id);
  const allowed = () => Boolean(s.user && (s.user.role === "admin" || (s.user.permissions?.canAccessStorage&&s.user.permissions?.canAccessMusic!==false)));
  const admin = () => s.user?.role === "admin";
  const canImport = () => admin() || (allowed() && s.user.permissions?.canUploadStorage);
  const trackById = id => s.trackMap.get(String(id))||s.externalTracks?.get(String(id));
  const mayPlay=track=>Boolean((admin()||s.user?.permissions?.canDownloadStorage!==false)&&(track?.playable||track?.browserPlayable));
  const currentDuration=()=>{const track=trackById(s.currentId),measured=s.transcoded?Number(track?.mediaDuration):$("musicAudio").duration;return Number.isFinite(measured)&&measured>0?measured:Number(track?.duration||track?.mediaDuration||track?.progress?.duration)||0;};
  const currentPosition=()=>Math.max(0,Math.min((Number($("musicAudio").currentTime)||0)+(s.transcoded?s.streamOffset||0:0),currentDuration()||Infinity));
  function syncTimeline(){
    const duration=currentDuration(),position=currentPosition(),seek=$("musicSeek");
    if(Number.isFinite(duration)&&duration>0&&s.currentId){s.ready=true;seek.max=String(duration);seek.disabled=false;$("musicDuration").textContent=time(duration);}
    if(!s.seeking){seek.value=String(s.currentId?position:0);$("musicCurrentTime").textContent=time(s.currentId?position:0);}
    seek.style.setProperty('--music-progress',(duration>0?Math.min(100,100*Number(seek.value)/duration):0)+'%');
    seek.setAttribute('aria-valuetext',time(Number(seek.value))+' sur '+time(duration));
  }
  const playlistById = id => s.playlists.find(list => String(list.id) === String(id));
  const url = (track, action="") => `/api/music/tracks/${encodeURIComponent(track.id)}${action}`;
  const notify = text => s.toast?.(String(text));
  const el = (tag,cls,text) => { const node=document.createElement(tag); if(cls)node.className=cls; if(text!==undefined)node.textContent=String(text); return node; };
  const titles = n => `${n.toLocaleString("fr-FR")} titre${n===1?"":"s"}`;
  const size = n => n>=1073741824 ? `${(n/1073741824).toFixed(1).replace(".",",")} Go` : `${Math.max(1,Math.round(n/1048576))} Mo`;
  const time = n => { n=Math.max(0,Math.round(Number(n)||0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`; };
  const status = (id,text="",error=false) => { $(id).textContent=text; $(id).classList.toggle("is-error",error); };
  const artistLabel = track => track.artist||"Artiste inconnu";
  const albumLabel = track => track.album||"Album inconnu";
  const genreLabel = track => track.genre||"À classer";
  // A single collator keeps large-library sorts from stalling the UI thread.
  const collator=new Intl.Collator('fr',{sensitivity:'base',numeric:true});
  const addedTimes=new WeakMap();
  function addedTime(track){const cached=addedTimes.get(track);if(cached&&cached.text===track.addedAt)return cached.value;const value=Date.parse(track.addedAt)||0;addedTimes.set(track,{text:track.addedAt,value});return value;}
  function art(node,seed) { const colors=[["#745060","#262136"],["#5d536e","#201f35"],["#506c65","#202c35"],["#90654c","#342136"],["#614773","#281c39"],["#426377","#202838"]]; let hash=0; for(const c of String(seed||"JMH"))hash=((hash<<5)-hash+c.charCodeAt(0))|0; const pair=colors[Math.abs(hash)%colors.length]; node.style.setProperty("--music-one",pair[0]); node.style.setProperty("--music-two",pair[1]); }
  function show(id) { if(id==="musicEqualizerDialog"&&window.JMHStudio){window.JMHStudio.openAudio().catch(error=>notify(error.message));return;} const dialog=$(id); if(!dialog.open){dialog._musicPreviousFocus=document.activeElement;dialog.showModal();} }
  function close(id) { if(id==="musicEqualizerDialog"&&window.JMHStudio){window.JMHStudio.closeAudio();return;}if($(id).open)$(id).close(); }

  function captureView() {
    return {filter:s.filter,query:s.query,genre:s.genre,artist:s.artist,album:s.album,sort:s.sort,playlistId:s.playlistId,page:s.page,scrollTop:$("musicPage").scrollTop,windowScroll:window.scrollY};
  }

  function syncViewControls() {
    $("musicSearch").value=s.query;$("musicGenre").value=s.genre;$("musicArtist").value=s.artist;$("musicAlbum").value=s.album;$("musicSort").value=s.sort;
  }

  function rememberView() { window.JMHNavigation?.beforeSubview();s.viewHistory.push(captureView());if(s.viewHistory.length>20)s.viewHistory.shift(); }

  function showWholeLibrary() {
    s.viewHistory=[];s.filter="all";s.query="";s.genre="";s.artist="";s.album="";s.playlistId=null;s.page=0;s.sort="recent";syncViewControls();render();
    $("musicLibrary").scrollIntoView({block:"start",behavior:"auto"});
  }

  function returnToLibrary() {
    if(window.JMHNavigation?.canBack){void window.JMHNavigation.go(-1);return;}
    const previous=s.viewHistory.pop();
    if(!previous){showWholeLibrary();return;}
    Object.assign(s,{filter:previous.filter,query:previous.query,genre:previous.genre,artist:previous.artist,album:previous.album,sort:previous.sort,playlistId:previous.playlistId,page:previous.page});
    syncViewControls();render();
    requestAnimationFrame(()=>{$("musicPage").scrollTop=previous.scrollTop;window.scrollTo({top:previous.windowScroll,behavior:"instant"});});
  }

  function openAlbum(artist,album) {
    if(s.album===album&&s.artist===artist&&!s.playlistId)return;
    rememberView();s.filter="all";s.query="";s.genre="";s.artist=artist;s.album=album;s.playlistId=null;s.page=0;syncViewControls();render();
    void window.JMHNavigation?.commitSubview({reset:true});
  }

  function renderReturnNavigation(library) {
    if(!s.album&&!s.artist&&!s.genre&&!s.query&&!s.playlistId&&s.filter==="all"&&s.page===0&&!s.viewHistory.length)return;
    const nav=el("nav","music-return-navigation");nav.setAttribute("aria-label","Retour à la bibliothèque musicale");
    const back=el("button","music-return-button","← Retour à la bibliothèque");back.type="button";back.dataset.musicAction="library-back";
    const all=el("button","music-text-button","Toute la bibliothèque");all.type="button";all.dataset.musicAction="library-all";
    nav.append(back,all);library.append(nav);
  }

  function matching() {
    const query=s.query.trim(), playlist=playlistById(s.playlistId), ids=playlist?new Set(playlist.trackIds.map(String)):null,search=window.JMHLibrarySearch,matches=search.matcher(query);
    const tracks=s.tracks.filter(track=>(!query||matches(search.text(track)))&&(!s.genre||genreLabel(track)===s.genre)&&(!s.artist||artistLabel(track)===s.artist)&&(!s.album||albumLabel(track)===s.album)&&(s.filter!=="favorite"||track.favorite)&&(!ids||ids.has(String(track.id))));
    const compare=(a,b,key)=>collator.compare(String(a[key]||""),String(b[key]||""));
    if(s.sort==="recent")tracks.sort((a,b)=>addedTime(b)-addedTime(a)||compare(a,b,"title"));
    else if(s.sort==="year")tracks.sort((a,b)=>(b.year||0)-(a.year||0)||compare(a,b,"title"));
    else tracks.sort((a,b)=>compare(a,b,s.sort)||compare(a,b,"title"));
    return tracks;
  }

  function filters() {
    [["musicGenre","musicGenresList","genre","Tous les genres",s.genres,genreLabel],["musicArtist","musicArtistsList","artist","Tous les artistes",s.artists,artistLabel],["musicAlbum","musicAlbumsList","album","Tous les albums",s.albums,albumLabel]].forEach(([selectId,listId,key,caption,supplied,label])=>{
      const values=[...new Set([...supplied,...s.tracks.map(label)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,"fr")),options=document.createDocumentFragment(),suggestions=document.createDocumentFragment();
      const all=el("option","",caption);all.value="";options.append(all);
      values.forEach(value=>{const option=el("option","",value);option.value=value;options.append(option);const suggestion=el("option");suggestion.value=value;suggestions.append(suggestion);});
      $(selectId).replaceChildren(options);$(listId).replaceChildren(suggestions);if(!values.includes(s[key]))s[key]="";$(selectId).value=s[key];
    });
  }

  function empty(title,description,action) {
    const box=el("div","music-empty"),icon=el("div","music-empty-icon","♪"),copy=el("div");icon.setAttribute("aria-hidden","true");copy.append(el("span","music-eyebrow","LES BONNES VIBRATIONS COMMENCENT ICI"),el("h2","",title),el("p","",description));box.append(icon,copy);
    if(action){const button=el("button","music-button music-glass",action==="import"?"Ajouter mes musiques ↗":"Créer ma première playlist ↗");button.type="button";button.dataset.musicAction=action;box.append(button);}return box;
  }

  function albumButton(track) {
    const button=el("button","music-track-album",albumLabel(track));button.type="button";button.dataset.musicAction="album";button.dataset.album=albumLabel(track);button.dataset.artist=artistLabel(track);button.setAttribute("aria-label",`Voir l’album ${albumLabel(track)} de ${artistLabel(track)}`);return button;
  }

  function trackRow(track,index) {
    const row=el("div","music-track-row");row.dataset.trackId=track.id;row.dataset.sequence=String(index+1);row.classList.toggle("is-playing",String(track.id)===String(s.currentId));row.append(el("span","music-track-number",String(track.id)===String(s.currentId)?"♫":index+1));
    const play=el("button","music-mini-art","▶");play.type="button";play.dataset.musicAction="play";play.dataset.trackId=track.id;play.setAttribute("aria-label",`${mayPlay(track)?"Écouter":"Ouvrir"} ${track.title}`);play.title=!track.available?"Fichier indisponible : voir la fiche":mayPlay(track)?"Écouter":s.native?"Ouvrir dans mon lecteur":"Voir la fiche et télécharger";art(play,`${artistLabel(track)} ${albumLabel(track)}`);row.append(play);
    const title=el("button","music-track-title");title.type="button";title.dataset.musicAction="details";title.dataset.trackId=track.id;title.append(el("strong","",track.title),el("small","",`${artistLabel(track)}${track.available?"":" · Fichier indisponible"}`));row.append(title,albumButton(track),el("span","music-track-genre",genreLabel(track)),el("span","music-track-duration",(track.duration||track.mediaDuration||track.progress?.duration)?time(track.duration||track.mediaDuration||track.progress.duration):track.durationPending===false?"—":"…"));
    const favorite=el("button","music-icon-button",track.favorite?"♥":"♡");favorite.type="button";favorite.dataset.musicAction="favorite";favorite.dataset.trackId=track.id;favorite.setAttribute("aria-pressed",String(Boolean(track.favorite)));favorite.setAttribute("aria-label",`${track.favorite?"Retirer":"Ajouter"} ${track.title} ${track.favorite?"de":"à"} mes favoris`);
    const details=el("button","music-icon-button music-more","⋯");details.type="button";details.dataset.musicAction="details";details.dataset.trackId=track.id;details.setAttribute("aria-label",`Fiche et classement de ${track.title}`);row.append(favorite,details);return row;
  }

  function albumSection(tracks) {
    const albums=new Map();tracks.forEach(track=>{const key=`${artistLabel(track)}\u0000${albumLabel(track)}`;if(!albums.has(key))albums.set(key,{artist:artistLabel(track),album:albumLabel(track),count:0,track});albums.get(key).count++;});
    const section=el("section"),head=el("div","music-row-head"),grid=el("div","music-album-grid");head.append(el("h2","","Au fil des albums"),el("span","",`${albums.size.toLocaleString("fr-FR")} album${albums.size===1?"":"s"}`));
    [...albums.values()].slice(0,12).forEach(album=>{const card=el("article","music-album-card"),button=el("button","music-album-art");button.type="button";button.dataset.musicAction="album";button.dataset.album=album.album;button.dataset.artist=album.artist;button.setAttribute("aria-label",`Voir ${album.album} de ${album.artist}`);art(button,`${album.artist} ${album.album}`);button.append(el("span","","JMH"),el("b","","♪"),el("small","","PERSONAL COLLECTION"));
      const cover=el("img","music-local-cover");cover.alt="";cover.loading="lazy";cover.src=url(album.track,"/cover");cover.addEventListener("error",()=>cover.remove(),{once:true});button.append(cover);const hover=el("span","music-album-hover","↗");hover.setAttribute("aria-hidden","true");button.append(hover);const title=el("h3","music-album-name",album.album);title.title=album.album;card.append(button,title,el("p","music-album-artist",`${album.artist} · ${titles(album.count)}`));grid.append(card);});section.append(head,grid);return section;
  }

  function playlistOverview(library) {
    if(!s.playlists.length){library.append(empty("Une playlist pour chaque humeur.","Crée ta première playlist, puis ajoutes-y les titres de ta collection depuis leurs fiches.","playlist"));return;}
    const grid=el("div","music-playlist-grid"),known=new Set(s.tracks.map(track=>String(track.id)));
    s.playlists.filter(list=>!s.query||list.name.toLocaleLowerCase("fr").includes(s.query.toLocaleLowerCase("fr"))).forEach(list=>{const card=el("button","music-playlist-card");card.type="button";card.dataset.musicAction="playlist-open";card.dataset.playlistId=list.id;art(card,list.name);card.append(el("span","","≋"),el("strong","",list.name),el("small","",`${titles(list.trackIds.filter(id=>known.has(String(id))).length)} · Playlist personnelle`));grid.append(card);});library.append(grid.childElementCount?grid:empty("Aucune playlist ne correspond.","Essayez un autre nom dans la recherche."));
  }

  function render() {
    $("musicCount").textContent=titles(s.tracks.length);$("musicHeroTrackCount").textContent=s.tracks.length.toLocaleString("fr-FR");$("musicHeroArtistCount").textContent=new Set(s.tracks.map(artistLabel)).size.toLocaleString("fr-FR");$("musicHeroAlbumCount").textContent=new Set(s.tracks.map(track=>`${artistLabel(track)}\0${albumLabel(track)}`)).size.toLocaleString("fr-FR");$("musicFavoriteCount").textContent=s.tracks.filter(track=>track.favorite).length.toLocaleString("fr-FR");$("musicPlaylistCount").textContent=s.playlists.length.toLocaleString("fr-FR");$("musicLibrarySize").textContent=s.tracks.length?`${titles(s.tracks.length)} · ${size(s.tracks.reduce((sum,track)=>sum+(Number(track.size)||0),0))}`:"";
    $("musicHeroListen").disabled=!s.tracks.some(track=>track.available&&mayPlay(track));$("musicHeroImport").classList.toggle("hidden",!canImport());document.querySelectorAll("[data-music-filter]").forEach(button=>{const active=button.dataset.musicFilter===s.filter;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
    const library=$("musicLibrary");library.replaceChildren();renderReturnNavigation(library);["musicGenre","musicArtist","musicAlbum","musicSort"].forEach(id=>$(id).disabled=s.filter==="playlists"&&!s.playlistId);
    if(s.filter==="playlists"&&!s.playlistId){playlistOverview(library);syncDock();return;}
    const tracks=matching(),playlist=playlistById(s.playlistId);
    if(playlist){const hero=el("div","music-playlist-hero"),copy=el("div"),back=el("button","music-playlist-back","← Toutes mes playlists");back.type="button";back.dataset.musicAction="playlist-back";copy.append(back,el("h2","",playlist.name),el("p","",`${titles(playlist.trackIds.length)} · Ta playlist personnelle`));const listen=el("button","music-button music-light","▶ Écouter la playlist");listen.type="button";listen.dataset.musicAction="play-visible";listen.disabled=!tracks.some(track=>track.available&&mayPlay(track));hero.append(copy,listen);library.append(hero);}
    if(!tracks.length){library.append(empty(!s.tracks.length?"Ta bande-son commence ici.":s.filter==="favorite"?"Les titres que tu aimes, juste ici.":playlist?"Cette playlist attend tes titres.":"Aucun titre ne correspond.",!s.tracks.length?admin()?"Ajoute ta musique depuis le NAS ou un disque accessible au serveur. Les morceaux apparaîtront ici avec les informations disponibles dans leurs fichiers.":"L’administrateur peut ajouter des fichiers musicaux à ta bibliothèque.":s.filter==="favorite"?"Ajoutez des favoris avec le cœur à côté des morceaux.":playlist?"Ouvrez la fiche d’un morceau et ajoutez-le à cette playlist.":"Essayez un autre titre, un autre artiste ou réinitialisez les filtres.",!s.tracks.length&&admin()?"import":null));syncDock();return;}
    if(s.filter==="all"&&!s.query&&!s.genre&&!s.artist&&!s.album&&!playlist)library.append(albumSection(tracks));
    const section=el("section"),head=el("div","music-row-head"),list=el("div","music-track-list");head.append(el("h2","",s.filter==="favorite"?"Mes favoris":s.album||"Ta bibliothèque"),el("span","",titles(tracks.length)));section.append(head);
    const pages=Math.max(1,Math.ceil(tracks.length/s.pageSize));s.page=Math.max(0,Math.min(s.page,pages-1));tracks.slice(s.page*s.pageSize,(s.page+1)*s.pageSize).forEach((track,index)=>list.append(trackRow(track,s.page*s.pageSize+index)));section.append(list);
    if(pages>1){const pagination=el("div","music-pagination"),prev=el("button","music-button music-glass","← Précédents"),next=el("button","music-button music-glass","Suivants →");prev.type=next.type="button";prev.dataset.musicAction="page-previous";next.dataset.musicAction="page-next";prev.disabled=s.page===0;next.disabled=s.page+1>=pages;pagination.append(prev,el("span","",`${s.page*s.pageSize+1}–${Math.min((s.page+1)*s.pageSize,tracks.length)} sur ${titles(tracks.length)} · Page ${s.page+1} / ${pages}`),next);section.append(pagination);}library.append(section);syncDock();refreshVisibleDurations();
  }

  function refreshVisibleDurations(){clearTimeout(s.durationTimer);const token=s.durationToken=(s.durationToken||0)+1;if(!s.api||!allowed()||$("musicPage").classList.contains("hidden"))return;const ids=[...document.querySelectorAll('#musicLibrary .music-track-row')].map(row=>row.dataset.trackId).filter(id=>{const t=trackById(id);return t&&!t.duration&&!t.mediaDuration&&!t.progress?.duration;}).slice(0,60);if(!ids.length)return;void s.api('/api/music/durations?ids='+encodeURIComponent(ids.join(','))).then(result=>{if(token!==s.durationToken||!allowed())return;for(const [id,value]of Object.entries(result.durations||{})){const track=trackById(id);if(track&&Number(value)>0)track.duration=Number(value);}document.querySelectorAll('#musicLibrary .music-track-row').forEach(row=>{const track=trackById(row.dataset.trackId),box=row.querySelector('.music-track-duration'),duration=track?.duration||track?.mediaDuration||track?.progress?.duration;if(box)box.textContent=duration?time(duration):result.pending?'…':'—';});if(result.pending)s.durationTimer=setTimeout(refreshVisibleDurations,2000);}).catch(()=>{});}
  function nextIndex(direction) {const index=s.queue.indexOf(String(s.currentId));for(let i=index+direction;i>=0&&i<s.queue.length;i+=direction){const track=trackById(s.queue[i]);if(track?.available&&mayPlay(track))return i;}return -1;}
  function syncDock() {
    $("musicPlayerDock").classList.toggle("hidden",!allowed()||($("musicPage").classList.contains("hidden")&&(!s.currentId||$("musicAudio").paused)));
    const compact=Boolean(s.currentId)&&$("musicPage").classList.contains("hidden");$("musicPlayerDock").classList.toggle("music-dock-compact",compact);document.body.classList.toggle("music-dock-full",allowed()&&!$("musicPage").classList.contains("hidden"));
    if(!$("musicStop")){const stop=el("button","music-icon-button music-stop-button","■");stop.id="musicStop";stop.type="button";stop.title="Arrêter et vider le lecteur";stop.setAttribute("aria-label","Arrêter et vider le lecteur");stop.onclick=stopPlayback;document.querySelector(".music-play-controls").append(stop);}
    if(!$("musicDockLibrary")){const back=el("button","music-dock-library","↗");back.id="musicDockLibrary";back.type="button";back.title="Ouvrir la bibliothèque musicale";back.setAttribute("aria-label","Ouvrir la bibliothèque musicale");back.onclick=()=>window.navigateWorkspace?.("musicPage");$("musicPlayerDock").append(back);}
    const track=trackById(s.currentId),audio=$("musicAudio");$("musicPlayPause").disabled=!track;$("musicPrevious").disabled=!track||nextIndex(-1)<0;$("musicNext").disabled=!track||nextIndex(1)<0;$("musicStop").disabled=!track;$("musicDockFavorite").disabled=!track||!!track.external;$("musicDockArtwork").disabled=!track;
    $("musicPlayPause").textContent=audio.paused?"▶":"Ⅱ";$("musicPlayPause").setAttribute("aria-label",audio.paused?"Lire la musique":"Mettre en pause");$("musicDockTitle").textContent=track?.title||"Choisis un titre.";$("musicDockArtist").textContent=track?`${artistLabel(track)} · ${albumLabel(track)}`:"Ta prochaine écoute t’attend.";$("musicDockFavorite").setAttribute("aria-pressed",String(Boolean(track?.favorite)));$("musicDockFavorite").textContent=track?.favorite?"♥":"♡";$("musicDockFavorite").setAttribute("aria-label",track?.favorite?"Retirer le titre de mes favoris":"Ajouter le titre à mes favoris");art($("musicDockArtwork"),track?`${artistLabel(track)} ${albumLabel(track)}`:"JMH");$("musicQueuePosition").textContent=track?`${s.queue.indexOf(String(track.id))+1} / ${s.queue.length} · À l’écoute`:"Ta collection privée";$("musicDockExternal")?.classList.toggle("hidden",!track||!s.native);
    document.querySelectorAll(".music-track-row").forEach(row=>{const active=row.dataset.trackId===String(s.currentId);row.classList.toggle("is-playing",active);row.querySelector(".music-track-number").textContent=active?"♫":row.dataset.sequence;});
  }

  function stopPlayback(){
    void saveProgress(true);s.playToken++;s.streamRequestToken=(s.streamRequestToken||0)+1;s.closing=true;const audio=$("musicAudio");audio.pause();audio.removeAttribute("src");audio.load();s.currentId=null;s.ready=false;s.queue=[];s.transcoded=false;s.streamOffset=0;s.sleepUntil=0;s.lastSave=0;s.seeking=false;$("musicSeek").style.setProperty("--music-progress","0%");$("musicSeek").value="0";$("musicSeek").max="100";$("musicSeek").disabled=true;$("musicCurrentTime").textContent="0:00";$("musicDuration").textContent="0:00";status("musicPlayerStatus");s.closing=false;syncDock();
  }
  let loadPending=null,accountGeneration=0,favoriteRevision=0;
  const favoriteWrites=new Map(),favoriteChanges=new Map();
  async function flushFavorites(){let timer;try{await Promise.race([Promise.all([...favoriteWrites.values()]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Le NAS ne confirme pas la sauvegarde.')),5000);})]);}finally{clearTimeout(timer);}}
  async function load(force=false){const generation=accountGeneration;if(loadPending?.generation===generation)return loadPending.promise;const pending=loadCore(force);loadPending={generation,promise:pending};try{return await pending;}finally{if(loadPending?.promise===pending)loadPending=null;}}
  async function loadCore(force=false) {
    if(!s.api||!s.user)return;if(!force&&s.loaded&&Date.now()-(s.loadedAt||0)<60000)return;if(s.loading&&!force)return;$("musicContent").classList.toggle("hidden",!allowed());$("musicAccessMessage").classList.toggle("hidden",allowed());$("musicImportBtn").classList.toggle("hidden",!canImport()||!allowed());$("musicNewPlaylistBtn").classList.toggle("hidden",!allowed());if(!allowed())return;
    s.loading=true;const token=++s.loadToken,revision=favoriteRevision;status("musicStatus",s.loaded?"Actualisation de la collection…":"Chargement de la bibliothèque…");
    try{const data=await s.api("/api/music/catalog"+(force?"?refresh=1":""));if(token!==s.loadToken||!allowed())return;s.tracks=Array.isArray(data.tracks)?data.tracks:[];for(const track of s.tracks){const change=favoriteChanges.get(String(track.id));if(change?.revision>revision)track.favorite=change.value;}s.trackMap=new Map(s.tracks.map(track=>[String(track.id),track]));s.playlists=Array.isArray(data.playlists)?data.playlists:[];s.genres=Array.isArray(data.genres)?data.genres:[];s.artists=Array.isArray(data.artists)?data.artists:[];s.albums=Array.isArray(data.albums)?data.albums:[];s.loaded=true;s.loadedAt=Date.now();if(s.playlistId&&!playlistById(s.playlistId))s.playlistId=null;filters();status("musicStatus");render();}catch(error){if(token===s.loadToken)status("musicStatus",`La bibliothèque n’est pas disponible : ${error.message}`,true);}finally{if(token===s.loadToken)s.loading=false;}
  }

  let selectedFiles=[],stopImport=false;
  const uploadExtensions=new Set(['mp3','flac','m4a','aac','ogg','opus','wav','wma','aiff','aif','amr','mpc']);
  function openImport(){if(!admin()||!allowed())return;if(!s.importBusy)status('musicImportResult');show('musicImportDialog');}
  function pick(folder){if(!canImport()||s.importBusy)return;$(folder?'musicFolderInput':'musicFilesInput').click();}
  function chooseFiles(input){if(s.importBusy)return;const all=Array.from(input.files||[]);selectedFiles=all.filter(f=>uploadExtensions.has(f.name.split('.').pop().toLowerCase()));$('musicSelectedSummary').textContent=selectedFiles.length+' titre(s) sélectionné(s) · '+size(selectedFiles.reduce((n,f)=>n+f.size,0))+(all.length>selectedFiles.length?' · '+(all.length-selectedFiles.length)+' fichier(s) non audio ignoré(s)':'');status('musicImportResult','Prêt à copier. Clique sur « Copier sur le NAS et ajouter ».');}
  async function importTracks(event){
    event.preventDefault();if(!admin()||!allowed()||s.importBusy)return;
    if(!selectedFiles.length){status('musicImportResult','Choisis des musiques ou un dossier avec les boutons ci-dessus.',true);return;}
    s.importBusy=true;stopImport=false;$('musicImportCancel').disabled=false;let imported=0,duplicates=0,failed=0,processed=0;const batch=[...selectedFiles],errors=[];
    ['musicPickFiles','musicPickFolder','musicImportSubmit'].forEach(id=>$(id).disabled=true);$('musicImportCancel').classList.remove('hidden');$('musicUploadProgress').classList.remove('hidden');$('musicUploadProgress').value=0;
    try{for(const file of batch){if(stopImport)break;status('musicImportResult','Copie '+(processed+1)+' / '+batch.length+' : '+file.name+'…');try{
      if(file.size>500*1024*1024)throw Error('Dépasse 500 Mo');const form=new FormData();form.append('relativePath',file.webkitRelativePath||file.name);form.append('file',file,file.name);const response=await fetch('/api/music-upload',{method:'POST',body:form,credentials:'same-origin'});const result=await response.json();if(!response.ok)throw Error(result.error||'Envoi refusé');imported+=Number(result.imported)||0;duplicates+=Number(result.duplicates)||0;
    }catch(error){failed++;if(errors.length<5)errors.push(file.name+' : '+error.message)}processed++;$('musicUploadProgress').value=Math.round(processed/batch.length*100);}
    status('musicImportResult',imported+' titre(s) ajouté(s), '+duplicates+' déjà présent(s), '+failed+' échec(s). '+(stopImport?'Copie arrêtée. Les titres déjà copiés restent sur le NAS. ':'')+errors.join(' · '),failed>0);
    selectedFiles=batch.slice(processed);$('musicSelectedSummary').textContent=selectedFiles.length?selectedFiles.length+' titre(s) restant(s).':'Copie terminée. Les titres sont disponibles sur tous les PC.';if(!selectedFiles.length){$('musicFilesInput').value='';$('musicFolderInput').value='';}await load(true);
    }finally{s.importBusy=false;['musicPickFiles','musicPickFolder','musicImportSubmit'].forEach(id=>$(id).disabled=false);$('musicImportCancel').classList.add('hidden');}
  }

  function details(id){if(trackById(id)?.external)return;
    const track=trackById(id);if(!track||!allowed())return;s.detailId=track.id;$("musicDetailsTitle").textContent=track.title;$("musicDetailsArtist").textContent=artistLabel(track);art($("musicDetailsArt"),`${artistLabel(track)} ${albumLabel(track)}`);$("musicDetailsMeta").replaceChildren();[albumLabel(track),genreLabel(track),track.year,(track.extension||"").replace(/^\./,"").toUpperCase(),track.size?size(track.size):null].filter(Boolean).forEach(value=>$("musicDetailsMeta").append(el("span","",value)));$("musicDetailsDescription").textContent=track.description||"";$("musicDetailsAvailability").textContent=!track.available?"Le fichier d’origine n’est pas accessible. Vérifiez le disque ou le NAS.":!mayPlay(track)?"Ce format nécessite un lecteur compatible. Ouvre le fichier dans ton lecteur habituel ou télécharge-le.":"La lecture dépend des codecs du fichier. Tu peux aussi ouvrir ce titre dans ton lecteur habituel.";
    $("musicDetailPlay").disabled=!track.available||!mayPlay(track);$("musicDetailDownload").href=url(track,"/download");$("musicDetailDownload").classList.toggle("hidden",!track.available);$("musicDetailFavorite").textContent=track.favorite?"♥":"♡";$("musicDetailFavorite").setAttribute("aria-pressed",String(Boolean(track.favorite)));$("musicDetailFavorite").setAttribute("aria-label",track.favorite?"Retirer de mes favoris":"Ajouter à mes favoris");$("musicDetailExternal").classList.toggle("hidden",!s.native||!track.available);
    const select=$("musicDetailPlaylist");select.replaceChildren(el("option","","Choisir une playlist"));select.firstChild.value="";s.playlists.forEach(list=>{const option=el("option","",list.name);option.value=list.id;select.append(option);});$("musicAddToPlaylist").disabled=!s.playlists.length;
    $("musicEditDetails").classList.toggle("hidden",!admin());$("musicEditDetails").open=false;$("musicEditTitle").value=track.title||"";$("musicEditArtist").value=artistLabel(track);$("musicEditAlbum").value=albumLabel(track);$("musicEditGenre").value=genreLabel(track);$("musicEditYear").value=track.year||"";$("musicEditDescription").value=track.description||"";status("musicEditStatus");status("musicDetailStatus");show("musicDetailsDialog");
  }

  async function favorite(id,button){if(trackById(id)?.external)return;
    const track=trackById(id),key=String(id),generation=accountGeneration;
    if(!track||!allowed()||button?.disabled||favoriteWrites.has(key))return;
    if(button)button.disabled=true;
    const pending=(async()=>{const value=!track.favorite,result=await s.api(url(track,"/favorite"),{method:"POST",body:JSON.stringify({favorite:value})});if(generation!==accountGeneration)return;const saved=result.track?Boolean(result.track.favorite):value;favoriteChanges.set(key,{value:saved,revision:++favoriteRevision});const current=trackById(id);if(current)current.favorite=saved;render();if(String(s.detailId)===key){$("musicDetailFavorite").textContent=saved?"♥":"♡";$("musicDetailFavorite").setAttribute("aria-pressed",String(saved));$("musicDetailFavorite").setAttribute("aria-label",saved?"Retirer de mes favoris":"Ajouter à mes favoris");}})();
    favoriteWrites.set(key,pending);
    try{await pending;}catch(error){if(generation===accountGeneration)notify('Favori non enregistré : '+error.message);}finally{if(favoriteWrites.get(key)===pending)favoriteWrites.delete(key);if(button?.isConnected)button.disabled=false;}
  }
  async function edit(event){event.preventDefault();const track=trackById(s.detailId);if(!track||!admin())return;const values={title:$("musicEditTitle").value.trim(),artist:$("musicEditArtist").value.trim()||"Artiste inconnu",album:$("musicEditAlbum").value.trim()||"Album inconnu",genre:$("musicEditGenre").value.trim()||"À classer",year:$("musicEditYear").value?Number($("musicEditYear").value):null,description:$("musicEditDescription").value.trim()};if(!values.title)return;$("musicEditSubmit").disabled=true;status("musicEditStatus","Enregistrement…");try{const result=await s.api(url(track),{method:"PATCH",body:JSON.stringify(values)});Object.assign(track,result.track||values);s.genres=[...new Set(s.tracks.map(genreLabel))];s.artists=[...new Set(s.tracks.map(artistLabel))];s.albums=[...new Set(s.tracks.map(albumLabel))];s.loadedAt=0;filters();render();details(track.id);$("musicEditDetails").open=true;status("musicEditStatus","Fiche et classement enregistrés.");}catch(error){status("musicEditStatus",error.message,true);}finally{$("musicEditSubmit").disabled=false;}}

  function newPlaylist(trackId=null){if(!allowed())return;s.creatingForTrack=trackId;$("musicPlaylistName").value="";status("musicPlaylistStatus");show("musicPlaylistDialog");$("musicPlaylistName").focus();}
  async function createPlaylist(event){event.preventDefault();if(!allowed())return;const name=$("musicPlaylistName").value.trim();if(!name)return;$("musicPlaylistSubmit").disabled=true;status("musicPlaylistStatus","Création…");try{let result=await s.api("/api/music/playlists",{method:"POST",body:JSON.stringify({name})});const list=result.playlist;if(!list?.id)throw new Error("Le serveur n’a pas confirmé la création de la playlist.");s.playlists.push(list);if(s.creatingForTrack){result=await s.api(`/api/music/playlists/${encodeURIComponent(list.id)}`,{method:"PATCH",body:JSON.stringify({trackIds:[s.creatingForTrack]})});Object.assign(list,result.playlist||{trackIds:[s.creatingForTrack]});}close("musicPlaylistDialog");render();if($("musicDetailsDialog").open&&s.detailId){details(s.detailId);status("musicDetailStatus",`Playlist « ${list.name} » créée${s.creatingForTrack?" et titre ajouté":""}.`);}notify(`Playlist « ${list.name} » créée.`);}catch(error){render();status("musicPlaylistStatus",error.message,true);}finally{$("musicPlaylistSubmit").disabled=false;s.creatingForTrack=null;}}
  async function addToPlaylist(){const list=playlistById($("musicDetailPlaylist").value),track=trackById(s.detailId);if(!list||!track||!allowed()){status("musicDetailStatus","Choisissez une playlist.",true);return;}if(list.trackIds.some(id=>String(id)===String(track.id))){status("musicDetailStatus","Ce titre est déjà dans cette playlist.");return;}$("musicAddToPlaylist").disabled=true;try{const ids=[...list.trackIds,track.id],result=await s.api(`/api/music/playlists/${encodeURIComponent(list.id)}`,{method:"PATCH",body:JSON.stringify({trackIds:ids})});Object.assign(list,result.playlist||{trackIds:ids});render();status("musicDetailStatus",`Ajouté à « ${list.name} ».`);}catch(error){status("musicDetailStatus",error.message,true);}finally{$("musicAddToPlaylist").disabled=false;}}
  async function external(id){const track=trackById(id);if(!track||!s.native||!track.available)return;try{const result=await window.jmhDesktop.openMediaFile("music",track.id);if(!result?.ok)throw new Error(result?.error||"Le fichier n’a pas pu être ouvert dans le lecteur du PC.");$("musicAudio").pause();notify(`« ${track.title} » ouvert dans ton lecteur habituel. Sa lecture est gérée par cette application.`);}catch(error){notify(error.message);status("musicDetailStatus",error.message,true);}}

  function saveProgress(force=false){
    const track=trackById(s.currentId),audio=$("musicAudio");if(track?.external)return Promise.resolve();if(!track||!s.ready||!Number.isFinite(currentPosition())||!Number.isFinite(currentDuration())||currentDuration()<=0)return Promise.resolve();if(!force&&Date.now()-s.lastSave<15000)return Promise.resolve();s.lastSave=Date.now();const progress={position:Math.max(0,Math.min(currentPosition(),currentDuration())),duration:currentDuration()};track.progress=progress;const api=s.api;
    // Coalesce updates instead of accumulating an unbounded promise queue while
    // the NAS is offline. Playback never waits for this background persistence.
    if(!s.pendingProgress)s.pendingProgress=new Map();
    s.pendingProgress.set(String(track.id),{track,progress,api,user:s.user});
    while(s.pendingProgress.size>20)s.pendingProgress.delete(s.pendingProgress.keys().next().value);
    if(!s.savingProgress)s.savingProgress=(async()=>{while(s.pendingProgress.size){const [id,item]=s.pendingProgress.entries().next().value;s.pendingProgress.delete(id);if(item.user!==s.user)continue;try{await item.api(url(item.track,'/progress'),{method:'PUT',body:JSON.stringify(item.progress)});}catch(error){if(String(s.currentId)===id&&!s.closing)status('musicPlayerStatus','La position n’a pas pu être enregistrée : '+error.message,true);}}})().finally(()=>{s.savingProgress=null;});return s.savingProgress;
  }
  async function playTrack(id,suppliedQueue=null){
    const track=trackById(id);if(!track||!allowed())return;if(s.sleepUntil&&Date.now()>=s.sleepUntil){s.sleepUntil=0;$("musicAudio").pause();notify("La minuterie a arrêté la lecture.");return;}if(!track.available){details(id);return;}if(!mayPlay(track)){if(s.native)await external(id);else details(id);return;}
    ensureAudioGraph();const audio=$("musicAudio");if(String(s.currentId)===String(id)&&!suppliedQueue&&audio.src){if(audio.paused)audio.play().catch(error=>status("musicPlayerStatus",error.message,true));else audio.pause();syncDock();return;}
    const playToken=++s.playToken;void saveProgress(true);if(playToken!==s.playToken||!allowed())return;s.closing=true;audio.pause();s.currentId=track.id;s.queue=(suppliedQueue||matching().map(item=>item.id)).map(String);if(!s.queue.includes(String(id)))s.queue.unshift(String(id));s.ready=false;s.seeking=false;s.lastSave=0;$("musicSeek").disabled=true;$("musicSeek").value="0";$("musicCurrentTime").textContent="0:00";$("musicDuration").textContent="0:00";s.closing=false;s.transcoded=false;s.streamOffset=0;status("musicPlayerStatus","Préparation de l’écoute…");syncDock();if(!track.playable&&track.browserPlayable){await startNasAudio(track,0);syncDock();return;}audio.src=track.external?track.src:url(track,"/stream");audio.load();try{await audio.play();}catch(error){if(playToken===s.playToken&&error.name!=="AbortError")status("musicPlayerStatus",error.name==="NotAllowedError"?"Cliquez sur Lecture pour commencer l’écoute.":"Ce fichier n’a pas pu être lu. Ouvre sa fiche pour utiliser ton lecteur habituel.",true);}syncDock();
  }
  function playVisible(){const tracks=matching(),track=tracks.find(item=>item.available&&mayPlay(item));if(track)playTrack(track.id,tracks.map(item=>item.id));}
  function skip(direction){const index=nextIndex(direction);if(index>=0)playTrack(s.queue[index],[...s.queue]);}

  async function startNasAudio(track,position=0,autoPlay=true){
    const token=s.playToken,request=s.streamRequestToken=(s.streamRequestToken||0)+1;try{const result=await s.api(url(track));if(request!==s.streamRequestToken||token!==s.playToken||String(s.currentId)!==String(track.id))return;track.mediaDuration=Number(result.track?.mediaDuration)||Number(track.progress?.duration)||0;s.transcoded=true;s.streamOffset=Math.max(0,Math.min(position,track.mediaDuration?track.mediaDuration-1:position));s.ready=false;const audio=$("musicAudio");audio.src=track.browserStreamUrl+"?start="+encodeURIComponent(s.streamOffset);audio.load();status("musicPlayerStatus","Le NAS prépare ce format pour l’écoute…");if(autoPlay)await audio.play();}catch(error){if(request===s.streamRequestToken&&token===s.playToken)status("musicPlayerStatus",error.name==="NotAllowedError"?"Cliquez sur Lecture pour commencer l’écoute.":"La lecture depuis le NAS a échoué : "+error.message,true);}
  }
  async function loadServerEqualizer(){const user=s.user,version=s.eqVersion||0;if(!allowed())return;try{const result=await s.api('/api/music/equalizer');if(s.user!==user||(s.eqVersion||0)!==version)return;if(result.configured){const value=result.equalizer;s.eqPrefs={enabled:value.enabled===true,...Object.fromEntries(['bass','mid','treble'].map(key=>[key,Math.max(-12,Math.min(12,Number(value[key])||0))]))};applyEqualizer();}else storeEqualizer();}catch{}}
  function readEqualizer() {
    const defaults={enabled:false,bass:0,mid:0,treble:0};
    try { const stored=JSON.parse(localStorage.getItem(s.eqKey)||"null");if(!stored||typeof stored!=="object")return defaults;return {enabled:stored.enabled===true,...Object.fromEntries(["bass","mid","treble"].map(key=>[key,Math.max(-12,Math.min(12,Number(stored[key])||0))]))}; } catch { return defaults; }
  }

  function storeEqualizer() { try { if(s.eqKey)localStorage.setItem(s.eqKey,JSON.stringify(s.eqPrefs)); } catch {} s.eqVersion=(s.eqVersion||0)+1;clearTimeout(s.eqSaveTimer);const user=s.user,values={...s.eqPrefs};if(!allowed())return;s.eqSaveTimer=setTimeout(()=>{if(s.user!==user)return;s.api('/api/music/equalizer',{method:'PUT',body:JSON.stringify(values)}).then(()=>status('musicEqMessage','Réglages enregistrés sur le NAS.')).catch(error=>status('musicEqMessage','Réglages non enregistrés : '+error.message,true));},500); }

  function applyEqualizer() {
    const prefs=s.eqPrefs,graph=s.eqGraph;
    if(graph) {
      const gains=[prefs.bass,prefs.mid,prefs.treble].map(value=>prefs.enabled?value:0);
      graph.filters.forEach((filter,index)=>{filter.gain.value=gains[index];});
      let headroom=1;
      clearTimeout(graph.headroomTimer);
      if(prefs.enabled&&gains.some(value=>value>0)) {
        // Immediately reserve the sum of all boosts while AudioParams settle.
        headroom=.89*Math.pow(10,-gains.reduce((sum,gain)=>sum+Math.max(0,gain),0)/20);
        graph.headroomTimer=setTimeout(()=>{
          const frequencies=new Float32Array(512),magnitude=new Float32Array(512),phase=new Float32Array(512),product=new Float32Array(512).fill(1);
          const upper=Math.min(22000,graph.context.sampleRate*.49);for(let i=0;i<frequencies.length;i++)frequencies[i]=20*Math.pow(upper/20,i/(frequencies.length-1));
          graph.filters.forEach(filter=>{filter.getFrequencyResponse(frequencies,magnitude,phase);for(let i=0;i<magnitude.length;i++)product[i]*=magnitude[i];});
          graph.headroom.gain.setValueAtTime(Math.min(1,.89/Math.max(1,...product)),graph.context.currentTime);
        },60);
      }
      graph.headroom.gain.setValueAtTime(headroom,graph.context.currentTime);
      graph.limiter.threshold.value=prefs.enabled?-1:0;graph.limiter.knee.value=0;graph.limiter.ratio.value=prefs.enabled?20:1;graph.limiter.attack.value=.003;graph.limiter.release.value=.12;
    }
    $("musicEqEnabled").checked=prefs.enabled;
    ["bass","mid","treble"].forEach(key=>{const value=prefs[key];$("musicEq"+key).value=value;$("musicEqValue"+key).textContent=`${value>0?"+":""}${value} dB`;$("musicEq"+key).disabled=!prefs.enabled;});
    $("musicEqualizerBtn").setAttribute("aria-pressed",String(prefs.enabled));$("musicEqualizerBtn").classList.toggle("is-enabled",prefs.enabled);$("musicEqState").textContent=prefs.enabled?"Égaliseur activé":"Son d’origine · Égaliseur désactivé";
  }

  function ensureAudioGraph() {
    if(!s.eqGraph&&!s.eqPrefs?.enabled)return;
    try {
      if(!s.eqGraph) {
        const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw new Error("L’égaliseur n’est pas disponible dans ce navigateur.");
        const context=new AudioContextClass(),source=context.createMediaElementSource($("musicAudio")),filters=[context.createBiquadFilter(),context.createBiquadFilter(),context.createBiquadFilter()],headroom=context.createGain(),limiter=context.createDynamicsCompressor();
        filters[0].type="lowshelf";filters[0].frequency.value=200;filters[1].type="peaking";filters[1].frequency.value=1000;filters[1].Q.value=.8;filters[2].type="highshelf";filters[2].frequency.value=3500;
        source.connect(headroom);headroom.connect(filters[0]);filters[0].connect(filters[1]);filters[1].connect(filters[2]);filters[2].connect(limiter);limiter.connect(context.destination);s.eqGraph={context,source,filters,headroom,limiter};applyEqualizer();
      }
      if(s.eqGraph.context.state==="suspended")s.eqGraph.context.resume().catch(error=>status("musicEqMessage",error.message,true));
    } catch(error) { status("musicEqMessage",error.message,true); }
  }

  function wireEqualizer() {
    const button=el("button","music-equalizer-button","EQ");button.type="button";button.id="musicEqualizerBtn";button.setAttribute("aria-label","Régler l’égaliseur audio");button.setAttribute("aria-pressed","false");button.title="Égaliseur : basses, médiums et aigus";document.querySelector(".music-play-controls").append(button);
    const toolbar=el("div","music-toolbar-actions"),soundButton=el("button","music-text-button","Régler le son");soundButton.type="button";soundButton.id="musicToolbarEqualizerBtn";soundButton.setAttribute("aria-controls","musicEqualizerDialog");soundButton.setAttribute("aria-haspopup","dialog");const playlistButton=$("musicNewPlaylistBtn");playlistButton.insertAdjacentElement("beforebegin",toolbar);toolbar.append(soundButton,playlistButton);
    const dialog=el("dialog","music-dialog music-equalizer-dialog");dialog.id="musicEqualizerDialog";dialog.setAttribute("aria-labelledby","musicEqTitle");
    dialog.innerHTML='<div class="music-dialog-head"><div><span class="music-eyebrow">LE SON, À VOTRE GOÛT</span><h2 id="musicEqTitle">Égaliseur audio</h2></div><button type="button" id="musicEqClose" class="music-close" aria-label="Fermer l’égaliseur">×</button></div><p class="music-dialog-intro">Plus de profondeur, des voix plus présentes ou un peu de brillance. Ajuste ton écoute en trois gestes.</p><label class="music-eq-toggle"><input type="checkbox" id="musicEqEnabled"><span>Activer l’égaliseur</span></label><div class="music-eq-bands"></div><div class="music-eq-footer"><span id="musicEqState"></span><button type="button" id="musicEqReset" class="music-button music-glass">Réinitialiser</button></div><p class="music-note">Tes réglages sont mémorisés sur cet ordinateur pour ton compte. Ils s’appliquent à la lecture intégrée de JMH. Un lecteur externe utilise ses propres réglages.</p><div id="musicEqMessage" class="music-inline-status" role="status" aria-live="polite"></div>';
    document.body.append(dialog);
    [["bass","Basses","Profondeur · 200 Hz"],["mid","Médiums","Voix et instruments · 1 kHz"],["treble","Aigus","Clarté · 3,5 kHz"]].forEach(([key,label,caption])=>{const row=el("div","music-eq-band"),heading=el("div","music-eq-band-heading"),copy=el("label"),value=el("output","", "0 dB");copy.htmlFor="musicEq"+key;copy.append(el("strong","",label),el("small","",caption));value.id="musicEqValue"+key;value.htmlFor="musicEq"+key;heading.append(copy,value);const range=el("input");range.type="range";range.min="-12";range.max="12";range.step="1";range.value="0";range.id="musicEq"+key;range.setAttribute("aria-label",label+" en décibels");const scale=el("div","music-eq-scale");scale.append(el("span","","−12 dB"),el("span","","Neutre"),el("span","","+12 dB"));row.append(heading,range,scale);dialog.querySelector(".music-eq-bands").append(row);range.addEventListener("input",()=>{s.eqPrefs[key]=Number(range.value);ensureAudioGraph();applyEqualizer();storeEqualizer();});});
    const openEqualizer=()=>{if(!allowed())return;status("musicEqMessage");show("musicEqualizerDialog");};button.addEventListener("click",openEqualizer);soundButton.addEventListener("click",openEqualizer);$("musicEqClose").addEventListener("click",()=>close("musicEqualizerDialog"));dialog.addEventListener("close",()=>{if(dialog._musicPreviousFocus?.isConnected)dialog._musicPreviousFocus.focus();});$("musicEqEnabled").addEventListener("change",event=>{s.eqPrefs.enabled=event.target.checked;ensureAudioGraph();applyEqualizer();storeEqualizer();});$("musicEqReset").addEventListener("click",()=>{s.eqPrefs.bass=0;s.eqPrefs.mid=0;s.eqPrefs.treble=0;ensureAudioGraph();applyEqualizer();storeEqualizer();status("musicEqMessage","Les trois bandes sont revenues au réglage neutre.");});
  }

  function wire(){
    if(s.wired)return;s.wired=true;
    wireEqualizer();
    const detailBack=el("button","music-text-button music-details-back","← Retour à la bibliothèque");detailBack.type="button";detailBack.id="musicDetailsBackBtn";detailBack.addEventListener("click",()=>close("musicDetailsDialog"));document.querySelector("#musicDetailsDialog .music-detail-top").insertAdjacentElement("beforebegin",detailBack);
    const nativeDetail=el("button","music-button music-glass hidden","Ouvrir dans mon lecteur ↗");nativeDetail.type="button";nativeDetail.id="musicDetailExternal";nativeDetail.addEventListener("click",()=>external(s.detailId));$("musicDetailDownload").insertAdjacentElement("afterend",nativeDetail);
    const nativeDock=el("button","music-text-button hidden","Mon lecteur ↗");nativeDock.type="button";nativeDock.id="musicDockExternal";nativeDock.addEventListener("click",()=>external(s.currentId));document.querySelector(".music-dock-side").append(nativeDock);
    $("musicImportBtn").addEventListener("click",openImport);$("musicHeroImport").addEventListener("click",openImport);$("musicHeroListen").addEventListener("click",()=>{const tracks=[...s.tracks].sort((a,b)=>addedTime(b)-addedTime(a)),track=tracks.find(item=>item.available&&mayPlay(item));if(track)playTrack(track.id,tracks.map(item=>item.id));});$("musicNewPlaylistBtn").addEventListener("click",()=>newPlaylist());
    $("musicSearch").addEventListener("input",event=>{s.query=event.target.value;s.page=0;if(s.query.trim()){s.genre='';s.artist='';s.album='';s.playlistId=null;s.filter='all';syncViewControls();}clearTimeout(s.searchTimer);s.searchTimer=setTimeout(render,150);});[["musicGenre","genre"],["musicArtist","artist"],["musicAlbum","album"],["musicSort","sort"]].forEach(([id,key])=>$(id).addEventListener("change",event=>{s[key]=event.target.value;s.page=0;render();}));
    $("musicPage").addEventListener("click",event=>{const tab=event.target.closest("[data-music-filter]");if(tab){if(tab.dataset.musicFilter==="all"){showWholeLibrary();return;}s.viewHistory=[];s.filter=tab.dataset.musicFilter;s.playlistId=null;s.page=0;s.query="";s.genre="";s.artist="";s.album="";syncViewControls();render();return;}const button=event.target.closest("[data-music-action]");if(!button)return;const action=button.dataset.musicAction;
      if(action==="play")playTrack(button.dataset.trackId);else if(action==="details")details(button.dataset.trackId);else if(action==="favorite")favorite(button.dataset.trackId,button);else if(action==="import")openImport();else if(action==="playlist")newPlaylist();else if(action==="album"){openAlbum(button.dataset.artist,button.dataset.album);}else if(action==="library-back"){returnToLibrary();}else if(action==="library-all"){showWholeLibrary();}else if(action==="playlist-open"){rememberView();s.playlistId=button.dataset.playlistId;s.page=0;s.query="";s.genre="";s.artist="";s.album="";syncViewControls();render();void window.JMHNavigation?.commitSubview({reset:true});}else if(action==="playlist-back"){returnToLibrary();}else if(action==="play-visible")playVisible();else if(action==="page-previous"||action==="page-next"){s.page+=action==="page-next"?1:-1;render();document.querySelector(".music-track-list")?.scrollIntoView({block:"start",behavior:"auto"});}
    });
    document.querySelectorAll("[data-music-close]").forEach(button=>button.addEventListener("click",()=>close(button.dataset.musicClose)));["musicImportDialog","musicDetailsDialog","musicPlaylistDialog"].forEach(id=>$(id).addEventListener("close",()=>{if($(id)._musicPreviousFocus?.isConnected)$(id)._musicPreviousFocus.focus();}));
    $("musicPickFiles").addEventListener("click",()=>pick(false));$("musicPickFolder").addEventListener("click",()=>pick(true));$("musicImportForm").addEventListener("submit",importTracks);$('musicFilesInput').addEventListener('change',event=>chooseFiles(event.target));$('musicFolderInput').addEventListener('change',event=>chooseFiles(event.target));$('musicImportCancel').addEventListener('click',()=>{stopImport=true;$('musicImportCancel').disabled=true;status('musicImportResult','Arrêt demandé. Le titre en cours termine sa copie.');});$("musicPlaylistForm").addEventListener("submit",createPlaylist);$("musicDetailNewPlaylist").addEventListener("click",()=>newPlaylist(s.detailId));$("musicAddToPlaylist").addEventListener("click",addToPlaylist);$("musicDetailFavorite").addEventListener("click",event=>favorite(s.detailId,event.currentTarget));$("musicDetailPlay").addEventListener("click",()=>{close("musicDetailsDialog");playTrack(s.detailId);});$("musicEditForm").addEventListener("submit",edit);
    $("musicDockFavorite").addEventListener("click",event=>favorite(s.currentId,event.currentTarget));$("musicDockArtwork").addEventListener("click",()=>details(s.currentId));$("musicPrevious").addEventListener("click",()=>skip(-1));$("musicNext").addEventListener("click",()=>skip(1));$("musicPlayPause").addEventListener("click",()=>{ensureAudioGraph();const audio=$("musicAudio");if(!s.currentId)return;if(audio.paused)audio.play().catch(error=>status("musicPlayerStatus",error.message,true));else audio.pause();});
    const audio=$("musicAudio"),seek=$("musicSeek"),volume=$("musicVolume");
    audio.volume=(window.JMHPreferences?.get().musicDefaultVolume??80)/100;
    seek.step="any";
    const syncVolume=()=>{volume.value=String(audio.volume);volume.style.setProperty('--music-progress',(audio.volume*100)+'%');};
    volume.addEventListener("input",event=>{audio.volume=Math.max(0,Math.min(1,Number(event.target.value)||0));syncVolume();});
    audio.addEventListener("volumechange",syncVolume);syncVolume();
    seek.addEventListener("pointerdown",()=>{s.seeking=true;});
    seek.addEventListener("pointercancel",()=>{s.seeking=false;syncTimeline();});
    seek.addEventListener("blur",()=>{s.seeking=false;syncTimeline();});
    seek.addEventListener("input",event=>{if(!s.ready)return;s.seeking=true;const position=Math.max(0,Math.min(Number(event.target.value)||0,currentDuration()));if(!s.transcoded)audio.currentTime=position;$("musicCurrentTime").textContent=time(position);syncTimeline();});
    seek.addEventListener("change",()=>{s.seeking=false;if(!s.ready)return;if(s.transcoded){const track=trackById(s.currentId);if(track)void startNasAudio(track,Number(seek.value),!audio.paused);}else{syncTimeline();void saveProgress(true);}});
    const metadata=()=>{const track=trackById(s.currentId),duration=currentDuration();if(!track||!Number.isFinite(duration)||duration<=0)return;track.duration=duration;syncTimeline();for(const row of document.querySelectorAll(".music-track-row")){if(row.dataset.trackId===String(track.id))row.querySelector(".music-track-duration").textContent=time(duration);}status("musicPlayerStatus");syncDock();};
    audio.addEventListener("loadedmetadata",metadata);audio.addEventListener("durationchange",metadata);
    audio.addEventListener("timeupdate",()=>{if(!s.ready||s.closing)return;syncTimeline();if(!s.seeking)void saveProgress(false);});
    audio.addEventListener("play",syncDock);
    audio.addEventListener("pause",()=>{syncDock();if(!s.closing)void saveProgress(true);});
    audio.addEventListener("ended",()=>{s.seeking=false;syncTimeline();void saveProgress(true);const next=window.JMHPreferences?.get().autoNext===false?-1:nextIndex(1);if(next>=0)void playTrack(s.queue[next],[...s.queue]);else{status("musicPlayerStatus","La file d’écoute est terminée. Choisis ta prochaine musique.");syncDock();}});
    audio.addEventListener("error",()=>{if(!s.currentId||s.closing)return;const track=trackById(s.currentId);if(!s.transcoded&&track?.browserPlayable&&[3,4].includes(audio.error?.code)){startNasAudio(track,Math.max(0,audio.currentTime||0));return;}status("musicPlayerStatus",audio.error?.code===2?"Le fichier n’est pas accessible. Vérifiez le disque ou le NAS, puis relancez le titre.":"Ce format ou son codec n’est pas pris en charge. Ouvre le titre dans ton lecteur habituel depuis sa fiche.",true);});document.addEventListener("visibilitychange",()=>{if(document.hidden)saveProgress(true);});window.addEventListener("jmh:cinema-play",()=>audio.pause());new MutationObserver(syncDock).observe($("musicPage"),{attributes:true,attributeFilter:["class"]});
  }

  async function detectNative(){const user=s.user;s.native=false;s.canPick=false;if(admin()&&window.jmhDesktop?.openMediaFile){try{const capabilities=window.jmhDesktop.getDesktopCapabilities?await window.jmhDesktop.getDesktopCapabilities():null;const legacy=capabilities?false:(await window.jmhDesktop.getConnectionConfig())?.mode==="server";s.native=s.user===user&&(capabilities?capabilities.nativeMediaPlayer===true:legacy);s.canPick=s.user===user&&(capabilities?capabilities.localImportPickers===true:legacy);}catch{}}syncDock();}
  function init(options){if(!$("musicPage"))return;const changed=s.user?.id!==options.user?.id||s.user?.username!==options.user?.username;if(changed)destroy();$("musicAudio").volume=(window.JMHPreferences?.get().musicDefaultVolume??80)/100;$("musicVolume").value=$("musicAudio").volume;s.api=options.api;s.toast=options.toast;s.user=options.user;wire();if(changed){s.tracks=[];s.playlists=[];s.genres=[];s.artists=[];s.albums=[];s.query="";s.genre="";s.artist="";s.album="";s.filter="all";s.playlistId=null;s.viewHistory=[];s.loaded=false;s.page=0;$("musicSearch").value="";filters();render();}$("musicContent").classList.toggle("hidden",!allowed());$("musicAccessMessage").classList.toggle("hidden",allowed());$("musicImportBtn").classList.toggle("hidden",!admin()||!allowed());$("musicNewPlaylistBtn").classList.toggle("hidden",!allowed());s.eqKey="jmh.music.equalizer.v1."+String(s.user?.id||s.user?.username||"guest");s.eqPrefs=readEqualizer();applyEqualizer();loadServerEqualizer();detectNative();}
  function destroy(){accountGeneration++;favoriteRevision=0;favoriteChanges.clear();favoriteWrites.clear();loadPending=null;clearTimeout(s.durationTimer);s.durationToken=(s.durationToken||0)+1;clearTimeout(s.eqSaveTimer);s.sleepUntil=0;saveProgress(true);s.transcoded=false;s.playToken++;s.closing=true;const audio=$("musicAudio");audio.pause();audio.removeAttribute("src");audio.load();s.currentId=null;s.detailId=null;s.ready=false;s.queue=[];s.seeking=false;$("musicSeek").style.setProperty("--music-progress","0%");$("musicSeek").value="0";$("musicSeek").max="100";$("musicSeek").disabled=true;$("musicCurrentTime").textContent="0:00";$("musicDuration").textContent="0:00";s.loadToken++;["musicImportDialog","musicDetailsDialog","musicPlaylistDialog","musicEqualizerDialog","musicQueueDialog"].forEach(close);s.eqGraph?.context.suspend().catch(()=>{});s.user=null;s.loading=false;s.tracks=[];s.trackMap.clear();s.playlists=[];s.viewHistory=[];s.native=false;s.canPick=false;s.loaded=false;status("musicPlayerStatus");$("musicPlayerDock").classList.add("hidden");s.closing=false;}
  function playFiles(items,index=0){if(!Array.isArray(items)||!items.length)return;s.externalTracks=new Map();const ids=items.map((item,i)=>{const id="nas:"+i;const name=String(item.name||String(item.path).split("/").pop());s.externalTracks.set(id,{id,external:true,title:name.replace(/\.[^.]+$/,""),artist:"Mes fichiers",album:String(item.folder||"NAS"),available:true,playable:true,src:"/api/storage/preview?path="+encodeURIComponent(item.path)});return id;});return playTrack(ids[Math.max(0,Math.min(index,ids.length-1))],ids);}
  window.JMHMusic={getView:()=>({filter:s.filter,query:s.query,genre:s.genre,artist:s.artist,album:s.album,sort:s.sort,playlistId:s.playlistId,page:s.page}),restoreView:value=>{for(const key of ['filter','query','genre','artist','album','sort','playlistId','page'])if(Object.hasOwn(value,key))s[key]=value[key];syncViewControls();render();},search:query=>{const match=window.JMHLibrarySearch.matcher(query);return s.tracks.filter(t=>match(window.JMHLibrarySearch.text(t))).slice(0,6).map(t=>({id:t.id,title:t.title,subtitle:t.artist,kind:"music"}));},playById:playTrack,current:()=>s.currentId,detail:()=>s.detailId,playFiles,stop:stopPlayback,flushFavorites,init,load,destroy,onNavigate:()=>{syncDock();refreshVisibleDurations();},open:async(id,play=false)=>{if(!s.loaded)await load();if(play)return playTrack(id);return details(id);},
    playMix:async(favorites=false)=>{if(!s.loaded)await load();const tracks=s.tracks.filter(track=>track.available&&mayPlay(track)&&(!favorites||track.favorite));for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]];}if(!tracks.length){notify('Aucun titre disponible pour cette sélection.');return;}return playTrack(tracks[0].id,tracks.map(track=>track.id));},
    queueInfo:()=>({currentId:s.currentId,paused:$("musicAudio").paused,sleepUntil:s.sleepUntil||0,items:s.queue.slice(Math.max(0,s.queue.indexOf(String(s.currentId)))).slice(0,40).map(id=>trackById(id)).filter(Boolean).map(track=>({id:track.id,title:track.title,artist:track.artist}))}),
    sleep:minutes=>{s.sleepUntil=Number(minutes)>0?Date.now()+Number(minutes)*60000:0;},checkSleep:()=>{if(s.sleepUntil&&Date.now()>=s.sleepUntil){s.sleepUntil=0;$("musicAudio").pause();notify('La minuterie a arrêté la musique.');syncDock();}}
  };
})();
