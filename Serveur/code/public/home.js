(function(){
  'use strict';
  const byId=id=>document.getElementById(id), node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  let sequence=0;
  const nav=document.querySelector('.main-nav'), first=nav.querySelector('.nav');
  const home=node('button','nav');home.type='button';home.dataset.page='homePage';home.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8 M5 10v11h14V10 M9 21v-8h6v8"/></svg><span>Accueil</span>';
  first.before(home);
  for(const [title,pages] of [['Organisation',['dashboardPage','chatPage','tasksPage','calendarPage','notificationsPage','announcementsPage','trashPage']],['Mon espace',['usersPage','auditPage','accountPage','updatesPage','settingsPage']]]){
    const details=node('details','home-nav-group'),summary=node('summary','',title);details.append(summary);const buttons=pages.map(page=>nav.querySelector('[data-page="'+page+'"]')).filter(Boolean);if(buttons.length){buttons[0].before(details);buttons.forEach(button=>details.append(button));}
  }
  nav.querySelectorAll('.nav-divider').forEach((divider,index)=>{if(index>0)divider.remove();});
  document.querySelector('#homePage').addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.dataset.homeNav)return await navigateWorkspace(button.dataset.homeNav);
      if(button.dataset.homeMovie){await navigateWorkspace('cinemaPage');await window.JMHCinema.open(button.dataset.homeMovie,button.dataset.play==='true');}
      if(button.dataset.homeTrack){await navigateWorkspace('musicPage');await window.JMHMusic.open(button.dataset.homeTrack,true);}
      if(button.id==='homeMusicMix'||button.id==='homeMusicFavorites'){await navigateWorkspace('musicPage');await window.JMHMusic.playMix(button.id==='homeMusicFavorites');}
    }catch(error){toast(error.message);}
  });
  function filmCard(movie,play){
    const button=node('button','home-film-card');button.type='button';button.dataset.homeMovie=movie.id;button.dataset.play=String(play);button.setAttribute('aria-label',(play?'Reprendre ':'Voir ')+movie.title);
    const art=node('div','home-film-art'),image=node('img');image.alt='';image.loading='lazy';image.src='/api/cinema/movies/'+encodeURIComponent(movie.id)+'/cover';image.addEventListener('error',()=>image.remove(),{once:true});art.append(node('span','home-film-initial',movie.title.slice(0,1)),image,node('span','home-card-play',play?'▶ Reprendre':'Voir la fiche →'));
    button.append(art,node('strong','',movie.title),node('small','',movie.available?(movie.genre||'À découvrir'):'Copie sur le NAS en attente'));
    if(play&&movie.progress?.duration){const bar=node('div','home-progress'),fill=node('span');fill.style.width=Math.min(100,100*movie.progress.position/movie.progress.duration)+'%';bar.append(fill);button.append(bar);}return button;
  }
  function renderFilms(id,items,play,empty){const box=byId(id);box.replaceChildren(...items.map(item=>filmCard(item,play)));if(!items.length)box.append(node('p','home-empty',empty));}
  function renderTracks(items){const box=byId('homeTracks');box.replaceChildren();for(const track of items){const button=node('button','home-track-card');button.type='button';button.dataset.homeTrack=track.id;const art=node('span','home-track-art','♫'),copy=node('span','home-track-copy');copy.append(node('strong','',track.title),node('small','',track.artist+' · '+track.album));button.append(art,copy,node('span','home-track-play','▶'));box.append(button);}if(!items.length)box.append(node('p','home-empty','Ajoute des titres aux favoris pour les retrouver ici.'));
  }
  async function load({api,user}){
    const token=++sequence;if(!user||!(user.role==='admin'||user.permissions?.canAccessStorage))return;
    byId('homeLoadStatus').textContent='';
    const results=await Promise.allSettled([api('/api/cinema/overview'),api('/api/music/overview')]);if(token!==sequence||byId('appView').classList.contains('hidden'))return;
    const cinema=results[0].status==='fulfilled'?results[0].value:{total:0,continueWatching:[],recent:[]},music=results[1].status==='fulfilled'?results[1].value:{total:0,albums:0,playlists:0,favorites:0,favoriteTracks:[],recent:[]};
    byId('homeStats').replaceChildren(...[[cinema.total,'films dans ta collection'],[music.total,'titres à écouter'],[music.albums,'albums'],[music.playlists,'playlists personnelles']].map(([value,label])=>{const item=node('div','home-stat');item.append(node('strong','',Number(value).toLocaleString('fr-FR')),node('span','',label));return item;}));
    renderFilms('homeContinue',cinema.continueWatching,true,'Tes films commencés apparaîtront ici. En attendant, découvre les derniers ajouts.');renderFilms('homeRecentFilms',cinema.recent,false,'Ta collection cinéma attend ses premiers films.');renderTracks(music.favoriteTracks.length?music.favoriteTracks:music.recent);
    byId('homeMusicFavorites').disabled=!music.favorites;byId('homeMusicMix').disabled=!music.total;
    if(results.some(x=>x.status==='rejected'))byId('homeLoadStatus').textContent='Une partie de la collection n’a pas pu être chargée. Ouvre sa bibliothèque pour réessayer.';
  }
  window.JMHHome={load,reset:()=>{sequence++;['homeStats','homeContinue','homeRecentFilms','homeTracks'].forEach(id=>byId(id).replaceChildren());}};
})();
