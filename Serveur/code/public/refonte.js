(() => {
 'use strict';
 // JMH — Refonte « Lumière » : moteur d'apparence (préférences locales à cet appareil).
 const KEY='jmh.refonte.v1',PHOTO_KEY='jmh.studio.wallpaper',el=id=>document.getElementById(id);
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const THEMES={
  nuit:{name:'Nuit',hint:'Le classique JMH',light:false,accent:'#a99bf5',wall:'univers',bg:'#0e1020',surface:'#1b1f38',text:'#f1f2fa'},
  clair:{name:'Clair',hint:'Lumineux et net',light:true,accent:'#5b6cf0',wall:'pastel',bg:'#eef0f7',surface:'#ffffff',text:'#151a2e'},
  oled:{name:'Noir profond',hint:'Idéal écrans OLED',light:false,accent:'#9b8cff',wall:'aucun',bg:'#000000',surface:'#121216',text:'#f1f2fa'},
  aurore:{name:'Aurore',hint:'Vert boréal',light:false,accent:'#3ee6b5',wall:'aurore',bg:'#0a1418',surface:'#14303a',text:'#eafaf6'},
  ocean:{name:'Océan',hint:'Bleus profonds',light:false,accent:'#5cc8ff',wall:'ocean',bg:'#07142a',surface:'#10284f',text:'#eef5ff'},
  foret:{name:'Forêt',hint:'Calme et naturel',light:false,accent:'#8fd18a',wall:'foret',bg:'#0b140e',surface:'#1a3022',text:'#eef7ef'},
  sable:{name:'Sable',hint:'Chaleureux, clair',light:true,accent:'#c2703d',wall:'dune',bg:'#f6efe4',surface:'#fffaf2',text:'#2b2116'},
  neon:{name:'Néon',hint:'Ambiance rétro-futur',light:false,accent:'#ff4fd8',wall:'neon',bg:'#0b0618',surface:'#22104a',text:'#fbeeff'},
  lavande:{name:'Lavande',hint:'Douceur mauve',light:true,accent:'#8b5cf6',wall:'lavande',bg:'#f3f0fb',surface:'#ffffff',text:'#221a3a'},
  menthe:{name:'Menthe',hint:'Frais et apaisant',light:true,accent:'#12a07a',wall:'menthe',bg:'#eef8f4',surface:'#ffffff',text:'#12322a'},
  ciel:{name:'Ciel',hint:'Bleu léger, aérien',light:true,accent:'#2f80ed',wall:'ciel',bg:'#eef5fd',surface:'#ffffff',text:'#12253d'},
  sakura:{name:'Sakura',hint:'Rose tendre',light:true,accent:'#e0558f',wall:'sakura',bg:'#fdf1f5',surface:'#ffffff',text:'#3a1a28'}
 };
 const stars='radial-gradient(1px 1px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 32% 72%,#ffffffcc,transparent),radial-gradient(1.5px 1.5px at 58% 28%,#fff,transparent),radial-gradient(1px 1px at 78% 62%,#ffffffaa,transparent),radial-gradient(1px 1px at 88% 14%,#fff,transparent),radial-gradient(1.5px 1.5px at 44% 48%,#ffffffbb,transparent),radial-gradient(1px 1px at 22% 88%,#ffffff99,transparent),radial-gradient(1px 1px at 68% 90%,#fff,transparent)';
 const WALLS={
  aucun:{name:'Couleur unie',css:'none'},
  univers:{name:'Univers JMH',css:"url('/assets/jmh-login-universe-v1.png') center/cover no-repeat"},
  cinema:{name:'Salle de cinéma',css:"url('/home-backdrop.jpg') center/cover no-repeat"},
  aurore:{name:'Aurore boréale',css:'radial-gradient(ellipse at 20% 30%,#1de9b6aa,transparent 52%),radial-gradient(ellipse at 72% 18%,#7c4dffaa,transparent 55%),radial-gradient(ellipse at 50% 95%,#00b0ff66,transparent 60%),linear-gradient(160deg,#04121a,#0b1e2e)'},
  nebuleuse:{name:'Nébuleuse',css:'radial-gradient(circle at 30% 40%,#ff4fd899,transparent 45%),radial-gradient(circle at 75% 60%,#6a5cffcc,transparent 50%),radial-gradient(circle at 60% 18%,#ffb86b55,transparent 40%),'+stars+',linear-gradient(135deg,#0b0420,#1a0b3a)'},
  coucher:{name:'Coucher de soleil',css:'radial-gradient(circle at 50% 78%,#ffd28acc,transparent 22%),linear-gradient(180deg,#2b1055 0%,#7a2a7a 38%,#e8576a 68%,#ffb36b 100%)'},
  ocean:{name:'Océan',css:'radial-gradient(ellipse at 50% 115%,#00c6ffaa,transparent 60%),radial-gradient(ellipse at 15% 10%,#2b6cff55,transparent 50%),linear-gradient(180deg,#020b1f,#06306b)'},
  foret:{name:'Forêt',css:'radial-gradient(ellipse at 30% 18%,#c5e86c44,transparent 50%),radial-gradient(ellipse at 80% 80%,#2e7d3266,transparent 55%),linear-gradient(170deg,#08130c,#16301f 60%,#244a2c)'},
  minuit:{name:'Ciel étoilé',css:stars+',radial-gradient(ellipse at 50% 120%,#3b2a8a88,transparent 60%),linear-gradient(#05060f,#121433)'},
  pastel:{name:'Pastel',css:'radial-gradient(circle at 15% 20%,#ffd6e8,transparent 45%),radial-gradient(circle at 85% 28%,#d6e4ff,transparent 45%),radial-gradient(circle at 50% 92%,#d8ffe9,transparent 50%),#f5f3ff'},
  dune:{name:'Dunes',css:'radial-gradient(ellipse at 70% 15%,#fff3dccc,transparent 40%),linear-gradient(170deg,#fbe8cf,#f1c999 55%,#d99a6c)'},
  neon:{name:'Néon',css:'linear-gradient(transparent 0 96%,#ff4fd833 96%) 0 0/100% 44px,linear-gradient(90deg,transparent 0 96%,#4ff0ff2e 96%) 0 0/44px 100%,radial-gradient(ellipse at 50% 100%,#ff4fd866,transparent 62%),linear-gradient(#0b0618,#1a0838)'},
  lavande:{name:'Lavande',css:'radial-gradient(circle at 18% 22%,#e4d6ff,transparent 46%),radial-gradient(circle at 82% 30%,#f6dcff,transparent 44%),radial-gradient(circle at 55% 95%,#d9e2ff,transparent 52%),#f4f0fb'},
  menthe:{name:'Menthe',css:'radial-gradient(circle at 20% 18%,#c9f3e3,transparent 46%),radial-gradient(circle at 85% 35%,#d4f1ff,transparent 44%),radial-gradient(circle at 45% 100%,#e6fbd9,transparent 52%),#eef8f4'},
  ciel:{name:'Ciel d’été',css:'radial-gradient(ellipse 38% 16% at 22% 28%,#ffffffee,transparent 70%),radial-gradient(ellipse 30% 12% at 72% 18%,#ffffffd9,transparent 70%),radial-gradient(ellipse 45% 18% at 60% 62%,#ffffffb3,transparent 72%),linear-gradient(180deg,#8ec5ff 0%,#cfe6ff 55%,#f2f8ff 100%)'},
  sakura:{name:'Sakura',css:'radial-gradient(circle at 30% 30%,#ff9fbf 0 3px,transparent 4px) 0 0/110px 110px,radial-gradient(circle at 70% 60%,#ffb3cc 0 2.5px,transparent 3.5px) 0 0/80px 80px,radial-gradient(circle at 82% 18%,#ffc7da,transparent 42%),radial-gradient(circle at 18% 85%,#f8c8ef,transparent 48%),linear-gradient(160deg,#fde4ee,#fbd3e2)'},
  abricot:{name:'Abricot',css:'radial-gradient(circle at 75% 20%,#ffe1c7,transparent 45%),radial-gradient(circle at 20% 75%,#ffd3d0,transparent 50%),linear-gradient(160deg,#fff5ec,#ffe6d3)'},
  brume:{name:'Brume',css:'radial-gradient(ellipse at 30% 30%,#ffffffcc,transparent 55%),radial-gradient(ellipse at 75% 70%,#e3e7ef,transparent 60%),linear-gradient(180deg,#eef1f6,#dfe4ec)'},
  lagon:{name:'Lagon',css:'radial-gradient(ellipse at 25% 85%,#00d4b4aa,transparent 55%),radial-gradient(ellipse at 80% 20%,#00a2ff77,transparent 50%),linear-gradient(160deg,#03222a,#064354 60%,#0a6b6b)'},
  volcan:{name:'Volcan',css:'radial-gradient(ellipse at 50% 105%,#ff6a2bcc,transparent 45%),radial-gradient(ellipse at 20% 15%,#ff2d5544,transparent 45%),linear-gradient(180deg,#120607,#2a0b0d 60%,#4a120f)'},
  prisme:{name:'Prisme',css:'conic-gradient(from 210deg at 50% 50%,#ff7eb3,#ffd36e,#7cf2c8,#6ec9ff,#a38bff,#ff7eb3)'},
  photo:{name:'Ma photo',special:true},
  galerie:{name:'Photo de ma galerie',special:true},
  jour:{name:'Photo du jour',special:true}
 };
 // 7.2 : 30 thèmes et 60 fonds supplémentaires (themes72.js, chargé avant ce fichier) ; les fonds « photo » restent en fin de liste.
 Object.assign(THEMES,window.JMH_EXTRA_THEMES||{});
 {const special={photo:WALLS.photo,galerie:WALLS.galerie,jour:WALLS.jour};for(const k in special)delete WALLS[k];Object.assign(WALLS,window.JMH_EXTRA_WALLS||{},special);}
 let themeFilter='tous';
 const ACCENTS=['#a99bf5','#5b6cf0','#5cc8ff','#3ee6b5','#8fd18a','#f2c14e','#ff9f5a','#ff6b6b','#ff4fd8','#c38bff','#c2703d','#9aa4b8'];
 const DEFAULTS={theme:'nuit',accent:null,wallpaper:'univers',galleryId:null,wallBlur:0,wallDim:35,scope:'app',animated:false,glass:true,radius:'soft',density:'normal',font:'system',sidebar:'full',contrast:false,auto:'off',greeting:true};
 let settings=load(),undoStack=[],dailyPhoto=null,dailyLoading=null;
 function load(){let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}const value={...DEFAULTS,...(saved&&typeof saved==='object'?saved:{})};
  // Première ouverture : reprendre les choix de l'ancienne page Apparence.
  if(!localStorage.getItem(KEY)){try{if(localStorage.getItem('jmh-theme')==='light')value.theme='clair';const c=localStorage.getItem('jmh.studio.customColor');if(c&&/^#[0-9a-f]{6}$/i.test(c))value.accent=c;if(localStorage.getItem(PHOTO_KEY))value.wallpaper='photo';}catch{}}
  if(!THEMES[value.theme])value.theme='nuit';if(!WALLS[value.wallpaper])value.wallpaper='univers';return value;}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{status('Enregistrement impossible sur cet appareil.');}}
 function set(patch,{record=true}={}){if(record){undoStack.push(JSON.stringify(settings));if(undoStack.length>30)undoStack.shift();}settings={...settings,...patch};save();apply();render();}
 const currentUser=()=>{try{return typeof me!=='undefined'?me:null;}catch{return null;}};
 function effectiveTheme(){if(settings.auto==='off')return settings.theme;const chosen=THEMES[settings.theme];let wantLight;if(settings.auto==='system')wantLight=matchMedia('(prefers-color-scheme: light)').matches;else{const h=new Date().getHours();wantLight=h>=7&&h<20;}if(wantLight===chosen.light)return settings.theme;return wantLight?'clair':(chosen.light?'nuit':settings.theme);}
 function accentOf(theme){return settings.accent&&/^#[0-9a-f]{6}$/i.test(settings.accent)?settings.accent:THEMES[theme].accent;}
 function hexMix(a,b,t){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const x=p(a),y=p(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');}
 function inkFor(hex){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);return (0.299*r+0.587*g+0.114*b)>0.62?'#14122a':'#ffffff';}
 function photoUrl(){try{const v=localStorage.getItem(PHOTO_KEY);return v&&/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(v)?v:null;}catch{return null;}}
 async function loadDaily(){if(dailyPhoto||dailyLoading||!currentUser())return dailyLoading;dailyLoading=(async()=>{try{const r=await fetch('/api/gallery/catalog?kind=photo&limit=120',{credentials:'same-origin'});if(!r.ok)return;const d=await r.json();const items=d.items||[];if(!items.length)return;const day=Math.floor(Date.now()/86400000);dailyPhoto=items[day%items.length].url;apply();}catch{}finally{dailyLoading=null;}})();return dailyLoading;}
 function wallpaperCss(){const w=settings.wallpaper;if(w==='photo'){const p=photoUrl();return p?'url("'+p+'") center/cover no-repeat':WALLS.univers.css;}
  if(w==='galerie')return settings.galleryId&&/^[a-f0-9]{32}$/.test(settings.galleryId)?"url('/api/gallery/items/"+settings.galleryId+"/file') center/cover no-repeat":WALLS.univers.css;
  if(w==='jour'){if(dailyPhoto)return "url('"+dailyPhoto+"') center/cover no-repeat";void loadDaily();return WALLS.univers.css;}
  return WALLS[w].css;}
 function ensureLayer(){let layer=el('refonteWallpaper');if(!layer){layer=node('div');layer.id='refonteWallpaper';layer.setAttribute('aria-hidden','true');layer.append(node('div','r-wall-image'),node('div','r-wall-dim'));document.body.prepend(layer);}return layer;}
 function apply(){
  const theme=effectiveTheme(),info=THEMES[theme],accent=accentOf(theme),b=document.body;
  b.classList.add('jmh-refonte');b.dataset.rTheme=theme;b.dataset.rGlass=settings.glass?'on':'off';b.dataset.rRadius=settings.radius;b.dataset.rDensity=settings.density;b.dataset.rFont=settings.font;b.dataset.rSidebar=settings.sidebar;b.dataset.rContrast=settings.contrast?'high':'normal';b.dataset.rWallScope=settings.scope;b.dataset.rWallAnimated=settings.animated?'on':'off';b.dataset.rGreeting=settings.greeting?'on':'off';
  b.style.removeProperty('--studio-accent');b.style.removeProperty('--studio-soft');
  b.style.setProperty('--r-accent',accent);b.style.setProperty('--r-accent-2',hexMix(accent,info.light?'#000000':'#ffffff',.35));b.style.setProperty('--r-accent-ink',inkFor(accent));
  b.style.setProperty('--r-wall-blur',Math.max(0,Math.min(40,Number(settings.wallBlur)||0))+'px');b.style.setProperty('--r-wall-dim',String(Math.max(0,Math.min(90,Number(settings.wallDim)||0))/100));
  b.classList.toggle('light-theme',info.light);try{localStorage.setItem('jmh-theme',info.light?'light':'dark');}catch{}
  const layer=ensureLayer(),css=wallpaperCss();layer.querySelector('.r-wall-image').style.background=css;
  const hero=document.querySelector('#homePage .home-hero');if(hero){if(settings.scope==='home'&&css!=='none'){hero.style.setProperty('background',css.replace(/ center\/cover no-repeat$/,'')+'','important');hero.style.setProperty('background-size','cover','important');hero.style.setProperty('background-position','center','important');}else{hero.style.removeProperty('background');hero.style.removeProperty('background-size');hero.style.removeProperty('background-position');hero.style.removeProperty('background-image');}}
  for(const button of document.querySelectorAll('.main-nav .nav')){const label=button.querySelector('span')?.textContent?.trim();if(label){button.dataset.rLabel=label;button.title=settings.sidebar==='compact'?label:'';}}
  let meta=document.querySelector('meta[name=theme-color]');if(!meta){meta=node('meta');meta.name='theme-color';document.head.append(meta);}meta.content=info.light?info.bg:info.bg;
  greeting();
 }
 // ---------- Message d'accueil ----------
 function greeting(){const home=el('homePage');if(!home)return;let box=el('refonteGreeting');const user=currentUser();if(!user||user.role==='owner'){box?.remove();return;}
  if(!box){box=node('section');box.id='refonteGreeting';box.innerHTML='<div><p class="r-hello"></p><p class="r-sub"></p></div><div class="r-clock"><strong></strong><span></span></div>';home.prepend(box);}
  const now=new Date(),h=now.getHours(),name=user.displayName||user.username,hello=h<5?'Bonne nuit':h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir';
  const subs=['Ta collection t’attend.','Qu’est-ce qu’on regarde aujourd’hui ?','Une playlist pour accompagner ta journée ?','Tes souvenirs sont à portée de main.'];
  box.querySelector('.r-hello').textContent=hello+', '+name+' 👋';box.querySelector('.r-sub').textContent=subs[(now.getDate()+h)%subs.length];
  box.querySelector('.r-clock strong').textContent=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});box.querySelector('.r-clock span').textContent=now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});}
 // ---------- Studio Apparence ----------
 let studio=null;
 const status=text=>{const s=el('refonteStatus');if(s){s.textContent=text;clearTimeout(status.t);status.t=setTimeout(()=>{if(s.textContent===text)s.textContent='';},4000);}};
 function section(title,hint){const s=node('section','r-section'),h=node('header');h.append(node('h3','',title));if(hint)h.append(node('p','',hint));s.append(h);return s;}
 function toggle(id,checked,onchange){const wrap=node('label','r-toggle'),input=node('input'),track=node('i');input.type='checkbox';input.id=id;input.checked=checked;input.setAttribute('role','switch');input.onchange=()=>onchange(input.checked);wrap.append(input,track);return wrap;}
 function seg(options,value,onpick,label){const box=node('div','r-seg');box.setAttribute('role','group');if(label)box.setAttribute('aria-label',label);for(const [v,t]of options){const b=node('button','r-seg-btn',t);b.type='button';b.setAttribute('aria-pressed',String(v===value));b.onclick=()=>onpick(v);box.append(b);}return box;}
 function row(title,hint,control){const r=node('div','r-row'),copy=node('span');copy.append(node('strong','',title));if(hint)copy.append(node('small','',hint));r.append(copy,control);return r;}
 function themeSwatch(id,t){const sw=node('div','r-swatch');sw.style.background=WALLS[t.wall].css==='none'?t.bg:WALLS[t.wall].css;const mini=node('div','r-mini'),side=node('i'),main=node('div','r-mini-main'),bar=node('i'),card=node('i');for(const x of [side,card])x.style.background=t.surface+(t.light?'d9':'cc');bar.style.background=t.accent;side.style.boxShadow=card.style.boxShadow='inset 0 0 0 1px '+(t.light?'#0001':'#fff2');main.append(bar,card);mini.append(side,main);sw.append(mini);return sw;}
 function render(){if(!studio)return;const theme=effectiveTheme(),accent=accentOf(theme);studio.replaceChildren();
  // Aperçu en direct
  const live=node('div','r-live'),pv=node('div','r-preview');pv.style.background=wallpaperCss()==='none'?'var(--r-bg)':wallpaperCss();pv.innerHTML='<div class="r-pv-shell"><div class="r-pv-side"><i class="on"></i><i></i><i></i><i></i><i></i></div><div class="r-pv-main"><div class="r-pv-card"><b>Bonsoir 👋</b><span>Ta collection t’attend.</span><br><span class="r-pv-btn">Lire ma musique</span></div><div class="r-pv-row"><i></i><i></i><i></i></div></div></div>';
  const summary=node('div','r-summary');summary.innerHTML='<span class="studio-eyebrow">APPARENCE · EN DIRECT</span>';summary.append(node('h2','',THEMES[theme].name+(settings.auto!=='off'?' · automatique':'')),node('p','','Chaque changement s’applique tout de suite à JMH, sur cet appareil uniquement. Tes médias et ton compte ne sont pas modifiés.'));
  const quick=node('div','r-actions');const undo=node('button','r-chip','↶ Annuler');undo.type='button';undo.disabled=!undoStack.length;undo.onclick=()=>{const prev=undoStack.pop();if(prev){settings={...DEFAULTS,...JSON.parse(prev)};save();apply();render();status('Dernier changement annulé.');}};
  const surprise=node('button','r-chip','🎲 Surprends-moi');surprise.type='button';surprise.onclick=()=>{const keys=Object.keys(THEMES),t=keys[Math.floor(Math.random()*keys.length)],walls=Object.keys(WALLS).filter(k=>!WALLS[k].special);set({theme:t,accent:Math.random()<.5?null:ACCENTS[Math.floor(Math.random()*ACCENTS.length)],wallpaper:walls[Math.floor(Math.random()*walls.length)]});status('Nouvelle ambiance : '+THEMES[t].name+'.');};
  quick.append(undo,surprise);summary.append(quick,Object.assign(node('p','r-status'),{id:'refonteStatus'}));live.append(pv,summary);studio.append(live);
  // Thèmes
  const themes=section('Thèmes',Object.keys(THEMES).length+' thèmes. Un thème règle les couleurs, l’accent et un fond assorti.'),tg=node('div','r-grid');
  // 7.2 : filtre Tous / Sombres / Clairs, utile avec une quarantaine de thèmes.
  const filters=node('div','r-actions r-theme-filter');for(const [key,label] of [['tous','Tous'],['sombre','Sombres'],['clair','Clairs']]){const c=node('button','r-chip'+(themeFilter===key?' r-primary':''),label);c.type='button';c.setAttribute('aria-pressed',String(themeFilter===key));c.onclick=()=>{themeFilter=key;render();};filters.append(c);}themes.append(filters);
  for(const [id,t]of Object.entries(THEMES)){if(themeFilter!=='tous'&&(themeFilter==='clair')!==!!t.light&&settings.theme!==id)continue;const b=node('button','r-tile');b.type='button';b.setAttribute('aria-pressed',String(settings.theme===id));b.append(themeSwatch(id,t),node('strong','',t.name),node('small','',t.hint));b.onclick=()=>{set({theme:id,accent:null,wallpaper:t.wall});status('Thème « '+t.name+' » appliqué.');};tg.append(b);}themes.append(tg);studio.append(themes);
  // Couleur d'accent
  const accents=section('Couleur d’accent','Boutons, sélection, lecture en cours.'),box=node('div','r-accents');const auto=node('button','r-chip'+(settings.accent?'':' r-primary'),'Assortie au thème');auto.type='button';auto.onclick=()=>set({accent:null});box.append(auto);
  for(const c of ACCENTS){const d=node('button','r-dot');d.type='button';d.style.background=c;d.setAttribute('aria-label','Accent '+c);d.setAttribute('aria-pressed',String(settings.accent===c));d.onclick=()=>set({accent:c});box.append(d);}
  const custom=node('label','r-custom'),picker=node('input');picker.type='color';picker.value=accent;picker.onchange=()=>set({accent:picker.value});custom.append(picker,document.createTextNode('Ma couleur'));box.append(custom);accents.append(box);studio.append(accents);
  // Fonds d'écran
  const walls=section('Fond d’écran','Visible derrière toute l’application, ou seulement sur l’Accueil.'),wg=node('div','r-grid');
  for(const [id,w]of Object.entries(WALLS)){const b=node('button','r-tile');b.type='button';b.setAttribute('aria-pressed',String(settings.wallpaper===id));const sw=node('div','r-swatch');if(id==='photo'){const p=photoUrl();sw.style.background=p?'url("'+p+'") center/cover':'repeating-linear-gradient(45deg,var(--r-elev) 0 10px,transparent 10px 20px)';sw.style.display='grid';sw.style.placeItems='center';if(!p)sw.textContent='＋ Choisir';}else if(id==='galerie'){sw.style.background=settings.galleryId?"url('/api/gallery/items/"+settings.galleryId+"/thumbnail') center/cover":'linear-gradient(135deg,var(--r-elev),transparent)';sw.style.display='grid';sw.style.placeItems='center';if(!settings.galleryId)sw.textContent='🖼 Mes photos';}else if(id==='jour'){sw.style.background=dailyPhoto?"url('"+dailyPhoto.replace(/\/file$/,'/thumbnail')+"') center/cover":'linear-gradient(135deg,var(--r-accent),transparent)';sw.style.display='grid';sw.style.placeItems='center';if(!dailyPhoto)sw.textContent='☀ Chaque jour';}else sw.style.background=w.css==='none'?'var(--r-bg)':w.css;
   b.append(sw,node('strong','',w.name));if(id==='jour')b.append(node('small','','Change automatiquement'));
   b.onclick=()=>{if(id==='photo')return el('refontePhotoInput').click();if(id==='galerie')return openGalleryPicker(walls);if(id==='jour'){set({wallpaper:'jour'});void loadDaily().then(render);return;}set({wallpaper:id});};wg.append(b);}
  const file=node('input');file.type='file';file.accept='image/*';file.hidden=true;file.id='refontePhotoInput';file.onchange=()=>usePhoto(file);walls.append(wg,file);
  const wr=node('div','r-rows');wr.style.marginTop='14px';
  const blur=node('input');blur.type='range';blur.min=0;blur.max=30;blur.value=settings.wallBlur;blur.oninput=()=>{document.body.style.setProperty('--r-wall-blur',blur.value+'px');};blur.onchange=()=>set({wallBlur:Number(blur.value)});
  const dim=node('input');dim.type='range';dim.min=0;dim.max=85;dim.value=settings.wallDim;dim.oninput=()=>{document.body.style.setProperty('--r-wall-dim',String(dim.value/100));};dim.onchange=()=>set({wallDim:Number(dim.value)});
  wr.append(row('Flou du fond','Pour mieux lire par-dessus une photo.',blur),row('Assombrir le fond','Plus de contraste avec les panneaux.',dim),row('Où afficher le fond',null,seg([['app','Partout'],['home','Accueil']],settings.scope,v=>set({scope:v}),'Portée du fond')),row('Fond animé','Un léger mouvement, très lent.',toggle('refonteAnimated',settings.animated,v=>set({animated:v}))));walls.append(wr);studio.append(walls);
  // Style
  const style=section('Style de l’interface','Forme, transparence, densité et police.'),sr=node('div','r-rows');
  sr.append(row('Effet verre dépoli','Panneaux translucides au-dessus du fond.',toggle('refonteGlass',settings.glass,v=>set({glass:v}))),
   row('Coins',null,seg([['sharp','Nets'],['soft','Doux'],['round','Ronds']],settings.radius,v=>set({radius:v}),'Arrondi des coins')),
   row('Densité','Plus d’éléments à l’écran, ou plus d’espace.',seg([['compact','Compacte'],['normal','Normale'],['airy','Aérée']],settings.density,v=>set({density:v}),'Densité')),
   row('Police',null,(()=>{const s=node('select');for(const [v,t]of [['system','Moderne (Segoe UI)'],['geo','Géométrique'],['douce','Douce'],['elegant','Élégante'],['tech','Technique']])s.append(new Option(t,v));s.value=settings.font;s.onchange=()=>set({font:s.value});return s;})()),
   row('Barre latérale','Compacte : uniquement les icônes.',seg([['full','Complète'],['compact','Compacte']],settings.sidebar,v=>set({sidebar:v}),'Barre latérale')),
   row('Contraste élevé','Textes secondaires plus lisibles.',toggle('refonteContrast',settings.contrast,v=>set({contrast:v}))));style.append(sr);studio.append(style);
  // Automatique & accueil
  const autoSec=section('Automatique et accueil',null),ar=node('div','r-rows');
  ar.append(row('Thème automatique','Clair le jour, ton thème le soir ; ou comme Windows.',(()=>{const s=node('select');for(const [v,t]of [['off','Désactivé'],['system','Suivre Windows'],['soir','Clair de 7 h à 20 h']])s.append(new Option(t,v));s.value=settings.auto;s.onchange=()=>set({auto:s.value});return s;})()),
   row('Message d’accueil','Salutation, horloge et date sur l’Accueil.',toggle('refonteGreetingToggle',settings.greeting,v=>set({greeting:v}))));autoSec.append(ar);studio.append(autoSec);
  // Sauvegarde
  const backup=section('Sauvegarder mon apparence','Pour la retrouver sur un autre PC.'),act=node('div','r-actions');
  const exp=node('button','r-chip','⇩ Exporter');exp.type='button';exp.onclick=()=>{const data={format:'jmh-apparence',version:1,settings,photo:settings.wallpaper==='photo'?photoUrl():null};const a=node('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download='apparence-jmh.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);status('Fichier d’apparence exporté.');};
  const imp=node('button','r-chip','⇧ Importer');imp.type='button';const impFile=node('input');impFile.type='file';impFile.accept='application/json,.json';impFile.hidden=true;imp.onclick=()=>impFile.click();impFile.onchange=async()=>{try{const data=JSON.parse(await impFile.files[0].text());if(data?.format!=='jmh-apparence'||typeof data.settings!=='object')throw Error();const clean={};for(const k of Object.keys(DEFAULTS)){if(!Object.hasOwn(data.settings,k))continue;const v=data.settings[k];if(k==='accent'||k==='galleryId'){if(v===null||typeof v==='string')clean[k]=v;}else if(typeof v===typeof DEFAULTS[k])clean[k]=v;}if(clean.theme&&!THEMES[clean.theme])delete clean.theme;if(clean.wallpaper&&!WALLS[clean.wallpaper])delete clean.wallpaper;if(typeof data.photo==='string'&&/^data:image\/(jpeg|png|webp);base64,/i.test(data.photo))localStorage.setItem(PHOTO_KEY,data.photo);set({...DEFAULTS,...clean});status('Apparence importée.');}catch{status('Ce fichier n’est pas une apparence JMH.');}finally{impFile.value='';}};
  const reset=node('button','r-chip','Réinitialiser');reset.type='button';reset.onclick=()=>{if(!confirm('Revenir à l’apparence d’origine de JMH sur cet appareil ?'))return;set({...DEFAULTS});status('Apparence d’origine rétablie.');};
  act.append(exp,imp,reset,impFile);backup.append(act);studio.append(backup);
 }
 async function usePhoto(input){const file=input.files[0];if(!file)return;const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=Math.min(image.width,1920);canvas.height=Math.round(image.height*canvas.width/image.width);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);localStorage.setItem(PHOTO_KEY,canvas.toDataURL('image/jpeg',.82));set({wallpaper:'photo'});status('Ta photo est maintenant ton fond d’écran.');}catch{status('Cette image ne peut pas être utilisée (trop lourde ou illisible).');}finally{URL.revokeObjectURL(url);input.value='';}}
 async function openGalleryPicker(container){let picker=container.querySelector('.r-gallery-picker');if(picker){picker.remove();return;}picker=node('div','r-gallery-picker');picker.append(node('p','r-status','Chargement de tes photos…'));container.append(picker);
  try{const r=await fetch('/api/gallery/catalog?kind=photo&limit=60',{credentials:'same-origin'});if(!r.ok)throw Error();const d=await r.json();picker.replaceChildren();if(!d.items?.length){picker.append(node('p','r-status','Aucune photo dans ta galerie pour le moment.'));return;}
   for(const item of d.items){const b=node('button');b.type='button';b.title=item.name;b.setAttribute('aria-label','Utiliser '+item.name);b.style.backgroundImage="url('"+item.thumbnail+"')";b.onclick=()=>{set({wallpaper:'galerie',galleryId:item.id});status('« '+item.name+' » est ton fond d’écran.');};picker.append(b);}}
  catch{picker.replaceChildren(node('p','r-status','Ta galerie n’est pas accessible avec ce compte.'));}}
 function mountStudio(){const page=el('appearancePage');if(!page||el('refonteStudio'))return;studio=node('div');studio.id='refonteStudio';page.append(studio);render();}
 // ---------- Raccordements avec l'existant ----------
 function hook(){
  const legacy=window.JMHStudio?.preferences;if(legacy&&!legacy.refonte){const wrapped=()=>{try{legacy();}catch{}apply();};wrapped.refonte=true;window.JMHStudio.preferences=wrapped;}
  const toggleBtn=el('themeToggle');if(toggleBtn&&!toggleBtn.dataset.refonte){toggleBtn.dataset.refonte='1';toggleBtn.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();const lightNow=THEMES[effectiveTheme()].light;let next;if(lightNow)next=settings.lastDark&&THEMES[settings.lastDark]&&!THEMES[settings.lastDark].light?settings.lastDark:'nuit';else next=settings.lastLight&&THEMES[settings.lastLight]?.light?settings.lastLight:'clair';const patch={theme:next,auto:'off'};if(lightNow)patch.lastLight=effectiveTheme();else patch.lastDark=effectiveTheme();if(settings.wallpaper===THEMES[settings.theme].wall)patch.wallpaper=THEMES[next].wall;set(patch);window.toast?.('Thème « '+THEMES[next].name+' »');},true);}
  mountStudio();
 }
 window.JMHRefonte={apply,get:()=>({...settings}),set,themes:THEMES,wallpapers:WALLS};
 apply();hook();
 // Suivre la connexion, la navigation et l'horloge.
 new MutationObserver(()=>{apply();}).observe(el('appView'),{attributes:true,attributeFilter:['class']});
 setInterval(()=>{if(settings.auto!=='off')apply();else greeting();},30000);
 try{matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(settings.auto==='system')apply();});}catch{}
 window.addEventListener('storage',e=>{if(e.key===KEY){settings=load();apply();render();}});
})();
