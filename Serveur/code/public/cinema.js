(function () {
  "use strict";

  const state = { api: null, toast: null, user: null, movies: [], genres: [], filter: "all", query: "", genre: "", detailId: null, playingId: null, loaded: false, busy: false, loadSequence: 0, wired: false, lastSaveAt: 0, mediaReady: false, playerClosing: false, native: false };
  const $ = id => document.getElementById(id);
  const allowed = () => Boolean(state.user && (state.user.role === "admin" || state.user.permissions?.canAccessStorage));
  const admin = () => state.user?.role === "admin";
  const canPlay=movie=>Boolean(movie?.playable||movie?.browserPlayable);
  const duration=()=>state.transcoded?Number(movieById(state.playingId)?.mediaDuration)||0:$("cinemaVideo").duration;
  const position=()=>$("cinemaVideo").currentTime+(state.transcoded?state.streamOffset||0:0);
  const movieById = id => state.movies.find(movie => String(movie.id) === String(id));
  const endpoint = (movie, suffix = "") => `/api/cinema/movies/${encodeURIComponent(movie.id)}${suffix}`;
  const notify = message => { if (state.toast) state.toast(String(message)); };
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; };
  const countLabel = count => `${count} film${count === 1 ? "" : "s"}`;
  const inProgress = movie => Number(movie.progress?.position) > 5 && (!Number(movie.progress?.duration) || Number(movie.progress.position) < Number(movie.progress.duration) - 15);
  const recent = movies => [...movies].sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0));
  const fileSize = bytes => { if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return ""; if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1).replace(".", ",")} Go`; return `${Math.max(1, Math.round(bytes / 1048576))} Mo`; };
  const timeLabel = seconds => { seconds = Math.max(0, Math.round(Number(seconds) || 0)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`; };
  const palette = genre => { const palettes = [["#654143", "#241c2c"], ["#3b555b", "#182530"], ["#4b4773", "#221c3b"], ["#78543a", "#2a212b"], ["#6b3a55", "#271d33"], ["#3f5d52", "#172b2b"]]; let hash = 0; for (const character of String(genre || "À classer")) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0; return palettes[Math.abs(hash) % palettes.length]; };
  const setArt = (node, genre) => { const colors = palette(genre); node.style.setProperty("--art-one", colors[0]); node.style.setProperty("--art-two", colors[1]); };
  const setStatus = (id, text = "", isError = false) => { $(id).textContent = text; $(id).classList.toggle("is-error", isError); };

  function showDialog(id) {
    const dialog = $(id);
    if (!dialog.open) { dialog._cinemaPreviousFocus = document.activeElement; if(id==="cinemaPlayerDialog"&&window.JMHStudio)dialog.show();else dialog.showModal(); }
  }

  function closeDialog(id) { const dialog = $(id); if (dialog.open) dialog.close(); }

  function makeEmpty(title, description, canImport = false) {
    if (!canImport) { const box = el("div", "cinema-no-results"); box.append(el("h2", "", title), el("p", "", description)); return box; }
    const box = el("div", "cinema-empty");
    const icon = el("div", "cinema-empty-icon", "▶"); icon.setAttribute("aria-hidden", "true");
    const copy = el("div"); copy.append(el("span", "cinema-eyebrow", "LE PREMIER FILM VOUS ATTEND"), el("h2", "", title), el("p", "", description));
    const button = el("button", "cinema-button cinema-glass", "Ajouter mes premiers films ↗"); button.type = "button"; button.dataset.cinemaAction = "import";
    box.append(icon, copy, button); return box;
  }

  function makeCard(movie) {
    const card = el("article", "cinema-movie-card");
    const cover = el("button", "cinema-card-cover"); cover.type = "button"; cover.dataset.cinemaAction = "details"; cover.dataset.movieId = movie.id; cover.setAttribute("aria-label", `Voir la fiche de ${movie.title}`); setArt(cover, movie.genre);
    cover.append(el("small", "", "JMH COLLECTION"), el("strong", "", movie.title));
    const poster = el("img", "cinema-local-poster"); poster.alt = ""; poster.loading = "lazy";
    poster.src = endpoint(movie, "/cover");
    poster.addEventListener("load", () => cover.classList.add("has-poster"), { once: true });
    poster.addEventListener("error", () => poster.remove(), { once: true }); cover.append(poster);
    const play = el("span", "cinema-card-play", "▶"); play.setAttribute("aria-hidden", "true"); cover.append(play);
    if (!movie.available) cover.append(el("span", "cinema-card-badge", "Fichier indisponible"));
    else if (inProgress(movie)) cover.append(el("span", "cinema-card-badge", `Reprendre · ${timeLabel(movie.progress.position)}`));
    const info = el("div", "cinema-card-info"); const copy = el("div");
    const title = el("h3", "cinema-card-title", movie.title); title.title = movie.title;
    const caption = el("div", "cinema-card-caption"); if (movie.year) caption.append(el("span", "", movie.year)); caption.append(el("span", "", movie.genre || "À classer"));
    copy.append(title, caption);
    if (inProgress(movie) && movie.progress?.duration > 0) { const progress = el("div", "cinema-card-progress"); const bar = el("span"); bar.style.width = `${Math.max(0, Math.min(100, (movie.progress.position / movie.progress.duration) * 100))}%`; progress.setAttribute("aria-label", `${Math.round(movie.progress.position / movie.progress.duration * 100)} % du film regardé`); progress.append(bar); copy.append(progress); }
    const favorite = el("button", "cinema-card-favorite", movie.favorite ? "✓" : "+"); favorite.type = "button"; favorite.dataset.cinemaAction = "favorite"; favorite.dataset.movieId = movie.id; favorite.setAttribute("aria-pressed", String(Boolean(movie.favorite))); favorite.setAttribute("aria-label", `${movie.favorite ? "Retirer" : "Ajouter"} ${movie.title} ${movie.favorite ? "de" : "à"} ma liste`); favorite.title = movie.favorite ? "Retirer de ma liste" : "Ajouter à ma liste";
    info.append(copy, favorite); card.append(cover, info); return card;
  }

  function makeRow(title, movies) {
    const section = el("section", "cinema-row"); const heading = el("div", "cinema-row-heading"); heading.append(el("h2", "", title), el("span", "", countLabel(movies.length))); const cards = el("div", "cinema-card-row"); movies.forEach(movie => cards.append(makeCard(movie))); section.append(heading, cards); return section;
  }

  function matchingMovies() {
    const query = state.query.toLocaleLowerCase("fr").trim();
    return recent(state.movies.filter(movie => (!state.genre || movie.genre === state.genre) && (!query || `${movie.title} ${movie.genre || ""} ${movie.year || ""} ${movie.description || ""}`.toLocaleLowerCase("fr").includes(query)) && (state.filter !== "favorite" || movie.favorite) && (state.filter !== "continue" || inProgress(movie))));
  }

  function renderHero(movies) {
    const movie = movies.find(item => inProgress(item) && item.available) || movies.find(item => item.available) || movies[0];
    $("cinemaHeroPlay").classList.toggle("hidden", !movie);
    $("cinemaHeroDetails").classList.toggle("hidden", !movie);
    $("cinemaHeroImport").classList.toggle("hidden", Boolean(movie) || !admin());
    $("cinemaHeroMeta").classList.toggle("hidden", !movie);
    $("cinemaHeroMeta").replaceChildren();
    $("cinemaHero").dataset.movieId = movie?.id || "";
    if (!movie) {
      $("cinemaHeroEyebrow").textContent = "LE CINÉMA, CHEZ VOUS";
      $("cinemaHeroTitle").replaceChildren(document.createTextNode("Ta salle."), el("br"), el("span", "", "Tes films."));
      $("cinemaHeroDescription").textContent = "Un grand écran pour ta collection. Retrouve tes films, classe tes découvertes et reprends la séance là où tu l’as laissée.";
      $("cinemaHeroFootnote").textContent = "◉ Tes fichiers. Ta bibliothèque. Ton rythme.";
      return;
    }
    $("cinemaHeroEyebrow").textContent = inProgress(movie) ? "VOTRE SÉANCE VOUS ATTEND" : "DANS VOTRE COLLECTION";
    $("cinemaHeroTitle").textContent = movie.title;
    const metadata = [movie.genre || "À classer", movie.year, (movie.extension || "").replace(/^\./, "").toUpperCase()].filter(Boolean); metadata.forEach(value => $("cinemaHeroMeta").append(el("span", "", value)));
    $("cinemaHeroDescription").textContent = movie.description || "Ce film fait partie de ta collection personnelle. Retrouve sa fiche, ajoute-le à ta liste et lance ta prochaine séance.";
    $("cinemaHeroPlay").textContent = !canPlay(movie) && state.native ? "Ouvrir dans mon lecteur ↗" : inProgress(movie) ? "▶ Reprendre" : "▶ Regarder";
    $("cinemaHeroPlay").disabled = !movie.available || (!canPlay(movie) && !state.native);
    $("cinemaHeroFootnote").textContent = !movie.available ? "Le fichier d’origine n’est actuellement pas accessible." : !canPlay(movie) ? state.native ? "Ce film s’ouvre dans le lecteur vidéo de ce PC." : "Format à ouvrir dans ton lecteur habituel depuis la fiche." : inProgress(movie) ? `Reprise à ${timeLabel(movie.progress.position)} · Ta position est enregistrée.` : "Ton prochain film, à ton rythme.";
  }

  function render() {
    if (state.genre && !state.movies.some(movie => (movie.genre || "À classer") === state.genre) && !state.genres.includes(state.genre)) state.genre = "";
    const movies = matchingMovies();
    $("cinemaCount").textContent = countLabel(state.movies.length);
    $("cinemaFavoriteCount").textContent = state.movies.filter(movie => movie.favorite).length;
    $("cinemaLibrarySize").textContent = state.movies.length ? `${countLabel(state.movies.length)} · ${fileSize(state.movies.reduce((total, movie) => total + (Number(movie.size) || 0), 0))}` : "";
    document.querySelectorAll("[data-cinema-filter]").forEach(button => { const active = button.dataset.cinemaFilter === state.filter; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
    const genreSelect = $("cinemaGenre"); genreSelect.replaceChildren(el("option", "", "Tous les genres")); genreSelect.firstChild.value = "";
    const datalist = $("cinemaGenresList"); datalist.replaceChildren();
    const genres = [...new Set([...state.genres, ...state.movies.map(movie => movie.genre || "À classer")])].sort((a, b) => a.localeCompare(b, "fr"));
    genres.forEach(genre => { const option = el("option", "", genre); option.value = genre; genreSelect.append(option); const suggestion = el("option"); suggestion.value = genre; datalist.append(suggestion); });
    if (genres.includes(state.genre)) genreSelect.value = state.genre; else { state.genre = ""; genreSelect.value = ""; }
    renderHero(movies);
    const library = $("cinemaLibrary"); library.replaceChildren();
    if (!state.movies.length) { library.append(makeEmpty("La collection commence avec toi.", admin() ? "Ajoutez des films depuis un disque de cet ordinateur ou un dossier du NAS. Ils apparaîtront ici, prêts à être classés." : "Ta collection est prête à accueillir des films. L’administrateur peut ajouter des vidéos depuis les disques ou le NAS.", admin())); return; }
    if (!movies.length) { const descriptions = { favorite: "Ajoute des films à ta liste avec le bouton + sur leurs fiches.", continue: "Les films que tu commences à regarder apparaîtront ici." }; library.append(makeEmpty(state.query || state.genre ? "Aucun film ne correspond." : state.filter === "favorite" ? "Ta prochaine envie, ici." : "Tout est prêt pour une nouvelle séance.", state.query || state.genre ? "Essayez un autre titre ou choisissez tous les genres." : descriptions[state.filter] || "Ajoute tes premiers films à la collection.")); return; }
    if (state.query || state.genre || state.filter !== "all") { library.append(makeRow(state.filter === "favorite" ? "Ma liste" : state.filter === "continue" ? "Continuer à regarder" : state.genre || "Résultats de la recherche", movies)); return; }
    const continuing = movies.filter(inProgress); if (continuing.length) library.append(makeRow("Continuer à regarder", continuing));
    library.append(makeRow("Derniers ajouts", movies.slice(0, 12)));
    genres.forEach(genre => { const byGenre = movies.filter(movie => (movie.genre || "À classer") === genre); if (byGenre.length) library.append(makeRow(genre, byGenre)); });
  }

  let loadPending=null;
  async function load(force=false){if(loadPending)return loadPending;const pending=loadCore(force);loadPending=pending;try{return await pending;}finally{if(loadPending===pending)loadPending=null;}}
  async function loadCore(force=false) {
    if(!force&&state.loaded&&Date.now()-(state.loadedAt||0)<60000)return;
    if(state.loading&&!force)return;
    if (!state.api || !state.user) return;
    $("cinemaContent").classList.toggle("hidden", !allowed()); $("cinemaAccessMessage").classList.toggle("hidden", allowed()); $("cinemaImportBtn").classList.toggle("hidden", !admin() || !allowed());
    if (!allowed()) { state.movies = []; state.genres = []; return; }
    const sequence = ++state.loadSequence;state.loading=true;
    setStatus("cinemaStatus", state.loaded ? "Actualisation de la collection…" : "Chargement de ta collection…");
    try { const data = await state.api("/api/cinema/catalog"+(force?"?refresh=1":"")); if (sequence !== state.loadSequence || !allowed()) return; state.movies = Array.isArray(data.movies) ? data.movies : []; state.genres = Array.isArray(data.genres) ? data.genres : []; state.loaded = true;state.loadedAt=Date.now();state.loading=false; setStatus("cinemaStatus"); render(); }
    catch (error) {state.loading=false; if (sequence === state.loadSequence) setStatus("cinemaStatus", `La collection n’est pas disponible : ${error.message}`, true); }
  }

  async function openImport() {
    if (!admin() || !allowed()) return;
    setStatus("cinemaImportResult");
    let native = Boolean(window.jmhDesktop?.selectCinemaFiles && window.jmhDesktop?.selectCinemaFolder);
    if (native && window.jmhDesktop.getConnectionConfig) { try { native = (await window.jmhDesktop.getConnectionConfig())?.mode === "server"; } catch { native = false; } }
    if (!admin() || !allowed()) return;
    $("cinemaNativePickers").classList.toggle("hidden", !native); $("cinemaRemoteNote").classList.toggle("hidden", native);
    showDialog("cinemaImportDialog");
  }

  async function pickFiles(folder = false) {
    if (!admin() || state.busy) return;
    const button = $(folder ? "cinemaPickFolder" : "cinemaPickFiles"); button.disabled = true;
    try { const selection = folder ? await window.jmhDesktop.selectCinemaFolder() : await window.jmhDesktop.selectCinemaFiles(); const paths = folder ? (selection ? [selection] : []) : (Array.isArray(selection) ? selection : []); if (paths.length) { $("cinemaImportKind").value = folder ? "folder" : "files"; $("cinemaImportPaths").value = paths.join("\n"); setStatus("cinemaImportResult", folder ? "Dossier sélectionné. Cliquez sur Ajouter à la collection." : `${paths.length} fichier${paths.length === 1 ? "" : "s"} sélectionné${paths.length === 1 ? "" : "s"}. Cliquez sur Ajouter à la collection.`); } else setStatus("cinemaImportResult", "Aucune sélection. Tu peux aussi indiquer un chemin accessible au serveur JMH."); }
    catch (error) { setStatus("cinemaImportResult", error.message || "La sélection n’a pas pu s’ouvrir. Indiquez le chemin dans le champ ci-dessous.", true); }
    finally { button.disabled = false; }
  }

  async function importMovies(event) {
    event.preventDefault(); if (!admin() || !allowed() || state.busy) return;
    const paths = $("cinemaImportPaths").value.split(/\r?\n/).map(value => value.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean);
    const folder = $("cinemaImportKind").value === "folder";
    if (!paths.length || (folder && paths.length !== 1)) { setStatus("cinemaImportResult", folder ? "Indiquez un seul chemin de dossier." : "Choisissez au moins un fichier ou indiquez son chemin complet.", true); return; }
    if (paths.some(path => !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path))) { setStatus("cinemaImportResult", "Indiquez un chemin complet, par exemple D:\\Films\\Mon film.mp4 ou un chemin de partage réseau.", true); return; }
    state.busy = true; $("cinemaImportSubmit").disabled = true; $("cinemaImportSubmit").textContent = "Ajout en cours…"; setStatus("cinemaImportResult", "JMH vérifie les fichiers et prépare les fiches…");
    try { const result = await state.api(folder ? "/api/cinema/import-folder" : "/api/cinema/import", { method: "POST", body: JSON.stringify(folder ? { path: paths[0] } : { paths }) }); const messages = [`${countLabel(Number(result.imported) || 0)} ajouté${Number(result.imported) === 1 ? "" : "s"}.`]; if (result.duplicates) messages.push(`${result.duplicates} déjà présent${result.duplicates === 1 ? "" : "s"}.`); if (result.skipped) messages.push(`${result.skipped} fichier${result.skipped === 1 ? "" : "s"} ignoré${result.skipped === 1 ? "" : "s"}.`); if (result.truncated) messages.push("La limite de recherche a été atteinte. Ajoutez un sous-dossier pour continuer."); if (Array.isArray(result.errors) && result.errors.length) messages.push(result.errors.map(item => typeof item === "string" ? item : item.error || item.message || "Un fichier n’a pas pu être ajouté.").join(" ")); setStatus("cinemaImportResult", messages.join(" ")); if (result.imported) { $("cinemaImportPaths").value = ""; notify(messages[0]); } await load(); }
    catch (error) { setStatus("cinemaImportResult", error.message || "Les films n’ont pas pu être ajoutés.", true); }
    finally { state.busy = false; $("cinemaImportSubmit").disabled = false; $("cinemaImportSubmit").textContent = "Ajouter à la collection"; }
  }

  function openDetails(id) {
    const movie = movieById(id); if (!movie || !allowed()) return; state.detailId = movie.id;
    $("cinemaDetailsTitle").textContent = movie.title; $("cinemaDetailsArtTitle").textContent = movie.title; setArt($("cinemaDetailsArt"), movie.genre);
    $("cinemaDetailsMeta").replaceChildren(); [movie.genre || "À classer", movie.year, (movie.extension || "").replace(/^\./, "").toUpperCase(), fileSize(movie.size)].filter(Boolean).forEach(value => $("cinemaDetailsMeta").append(el("span", "", value)));
    $("cinemaDetailsDescription").textContent = movie.description || "Aucune description pour le moment. Tu peux compléter cette fiche pour personnaliser ta collection.";
    $("cinemaDetailsAvailability").textContent = !movie.available ? "Le fichier d’origine n’est pas accessible. Vérifiez que le disque ou le NAS est connecté avant de lancer le film." : !canPlay(movie) ? "Ce format nécessite ton lecteur vidéo habituel. Utilise le lien ci-dessous ; la lecture dans JMH dépend des codecs vidéo et audio." : "Le film reste à son emplacement d’origine. Si un codec n’est pas pris en charge, ouvre-le dans ton lecteur vidéo habituel.";
    $("cinemaDetailPlay").disabled = !movie.available || !canPlay(movie); $("cinemaDetailPlay").textContent = inProgress(movie) ? "▶ Reprendre" : "▶ Regarder";
    $("cinemaDetailDownload").href = endpoint(movie, "/download"); $("cinemaDetailDownload").classList.toggle("hidden", !movie.available);
    refreshNativeButtons();
    $("cinemaDetailFavorite").setAttribute("aria-pressed", String(Boolean(movie.favorite))); $("cinemaDetailFavorite").setAttribute("aria-label", movie.favorite ? "Retirer de ma liste" : "Ajouter à ma liste"); $("cinemaDetailFavorite").textContent = movie.favorite ? "✓" : "+";
    $("cinemaEditDetails").classList.toggle("hidden", !admin()); $("cinemaEditDetails").open = false;
    $("cinemaEditTitle").value = movie.title || ""; $("cinemaEditGenre").value = movie.genre || "À classer"; $("cinemaEditYear").value = movie.year || ""; $("cinemaEditDescription").value = movie.description || ""; setStatus("cinemaEditStatus"); showDialog("cinemaDetailsDialog");
  }

  async function favoriteMovie(id, button) {
    const movie = movieById(id); if (!movie || !allowed() || button?.disabled) return; if (button) button.disabled = true;
    try { const favorite = !movie.favorite; const result = await state.api(endpoint(movie, "/favorite"), { method: "POST", body: JSON.stringify({ favorite }) }); movie.favorite = result.movie ? Boolean(result.movie.favorite) : favorite; render(); if (String(state.detailId) === String(movie.id)) { $("cinemaDetailFavorite").setAttribute("aria-pressed", String(movie.favorite)); $("cinemaDetailFavorite").setAttribute("aria-label", movie.favorite ? "Retirer de ma liste" : "Ajouter à ma liste"); $("cinemaDetailFavorite").textContent = movie.favorite ? "✓" : "+"; } }
    catch (error) { notify(error.message); }
    finally { if (button?.isConnected) button.disabled = false; }
  }

  async function editMovie(event) {
    event.preventDefault(); const movie = movieById(state.detailId); if (!movie || !admin()) return;
    const title = $("cinemaEditTitle").value.trim(); if (!title) return;
    $("cinemaEditSubmit").disabled = true; setStatus("cinemaEditStatus", "Enregistrement…");
    try { const values = { title, genre: $("cinemaEditGenre").value.trim() || "À classer", year: $("cinemaEditYear").value ? Number($("cinemaEditYear").value) : null, description: $("cinemaEditDescription").value.trim() }; const result = await state.api(endpoint(movie), { method: "PATCH", body: JSON.stringify(values) }); Object.assign(movie, result.movie || values); state.genres = [...new Set(state.movies.map(item => item.genre || "À classer"))]; render(); openDetails(movie.id); $("cinemaEditDetails").open = true; setStatus("cinemaEditStatus", "Fiche enregistrée."); notify("Fiche du film enregistrée."); }
    catch (error) { setStatus("cinemaEditStatus", error.message, true); }
    finally { $("cinemaEditSubmit").disabled = false; }
  }

  async function startPlayer(id) {
    const movie = movieById(id); if (!movie || !allowed()) return;
    if (!movie.available) { notify("Le fichier d’origine n’est pas accessible. Vérifiez le disque ou le NAS."); return; }
    if (!canPlay(movie)) { if (state.native) openNativeMovie(movie.id); else openDetails(movie.id); return; }
    window.dispatchEvent(new Event("jmh:cinema-play"));
    closeDialog("cinemaDetailsDialog");
    const opening=state.nasRequest=(state.nasRequest||0)+1;
    state.playingId = movie.id; state.transcoded=false;state.streamOffset=0;state.mediaReady = false; state.playerClosing = false; state.lastSaveAt = 0;state.quality='720';state.audio=0;state.dialogue=false;
    $("cinemaPlayerTitle").textContent = movie.title; $("cinemaPlayerDownload").href = endpoint(movie, "/download"); $("cinemaPlayerStatus").textContent = "Préparation de la lecture…";
    refreshNativeButtons();
    const video = $("cinemaVideo");video.pause();video.removeAttribute('src');video.load();showDialog("cinemaPlayerDialog");$("cinemaNasControls").classList.remove("hidden");$('cinemaNasSeek').disabled=true;$('cinemaQuality').disabled=true;$('cinemaAudioTrack').disabled=true;
    try{const data=await state.api(endpoint(movie));if(opening!==state.nasRequest||!$("cinemaPlayerDialog").open)return;movie.mediaDuration=Number(data.movie?.mediaDuration)||Number(movie.progress?.duration)||0;movie.playback=data.movie?.playback;configurePlayback(movie);const originalUsable=movie.playback?.qualities?.some(q=>q.id==='original')||(movie.playable&&(!movie.playback?.codec||['vp8','vp9','av1'].includes(movie.playback.codec)));state.quality=window.JMHPreferences?.get().cinemaQuality||((!movie.playback?.height||movie.playback.height<=1080)?'original':'720');if(!$('cinemaQuality').querySelector('option[value="'+state.quality+'"]'))state.quality=$('cinemaQuality').value;$('cinemaQuality').value=state.quality;await playAt(movie,Number(movie.progress?.position)||0);}catch(error){if(opening===state.nasRequest)$('cinemaPlayerStatus').textContent='Impossible de préparer le film : '+error.message;}
  }

  function configurePlayback(movie){
    const quality=$('cinemaQuality');quality.replaceChildren();const height=movie.playback?.height||0;const choices=[{id:'original',label:'Source · qualité originale'},{id:'720',label:'720p'+(height&&height<720?' · agrandissement':'')},{id:'1080',label:'1080p'+(height&&height<1080?' · agrandissement':'')}];
    if(movie.playable&&!choices.some(q=>q.id==='original'))choices.unshift({id:'original',label:'Fichier original'});
    if(!choices.length&&movie.browserPlayable)choices.push({id:'720',label:'Compatible · 720p maximum'});
    for(const item of choices){const option=el('option','',item.label);option.value=item.id;quality.append(option);}quality.disabled=!choices.length;
    const audio=$('cinemaAudioTrack');audio.replaceChildren();const tracks=movie.playback?.audio||[{index:0,title:'Piste principale'}];for(const track of tracks){const option=el('option','',(track.title||'Piste '+(track.index+1))+(track.language?' · '+track.language:'')+(track.channels?' · '+track.channels+' canaux':''));option.value=track.index;audio.append(option);}audio.disabled=tracks.length<2;
    $('cinemaDialogue').checked=false;$('cinemaNasSeek').max=movie.mediaDuration||1;
    $('cinemaQualityNote').textContent=movie.playback?.height?'Source : '+movie.playback.width+' × '+movie.playback.height+' · Les conversions sont préparées une fois sur le NAS. Agrandir ne recrée pas les détails absents du fichier.':'Les conversions sont préparées une fois sur le NAS pour une lecture stable.';
  }
  async function playAt(movie,requested=0){
    state.resumeAt=requested;state.mediaReady=false;
    const audioCodec=movie.playback?.audio?.[0]?.codec,codec=movie.playback?.codec;
    const directlyCompatible=!codec||(codec==='h264'&&(!audioCodec||['aac','mp3'].includes(audioCodec)))||(['vp8','vp9','av1'].includes(codec)&&(!audioCodec||['opus','vorbis','aac'].includes(audioCodec)));
    if(state.quality==='original'&&movie.playable&&directlyCompatible&&state.audio===0&&!state.dialogue){state.nasRequest++;state.transcoded=false;state.streamOffset=0;const video=$('cinemaVideo');video.src=endpoint(movie,'/stream');video.load();try{await video.play();}catch(error){if(error.name!=='AbortError')$('cinemaPlayerStatus').textContent='Cliquez sur Lecture pour commencer.';}}
    else return prepareNasMovie(movie,requested);
  }
  function seekTo(value){const movie=movieById(state.playingId),total=duration();if(!movie||!Number.isFinite(total)||total<=0)return;const target=Math.max(0,Math.min(Number(value)||0,total-0.1));if(state.transcoded)prepareNasMovie(movie,target);else{$('cinemaVideo').currentTime=target;saveProgress(true);} }
  const playerTime=value=>{const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600);return(h?h+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
  function updatePlayerControls(){const video=$('cinemaVideo'),total=duration();$('cinemaPlayPause').textContent=video.paused?'▶ Lire':'Ⅱ Pause';$('cinemaNasSeek').disabled=!state.playingId||!Number.isFinite(total)||total<=0;if(!$('cinemaNasSeek').matches(':active'))$('cinemaNasSeek').value=position();$('cinemaNasSeek').max=Number.isFinite(total)&&total>0?total:1;$('cinemaNasTime').textContent=playerTime(position())+' / '+playerTime(total);$('cinemaMute').textContent=video.muted?'Réactiver le son':'Couper le son';}

  async function prepareNasMovie(movie,requested=0){
    const request=state.nasRequest=(state.nasRequest||0)+1;
    const input={quality:state.quality||'original',audio:state.audio||0,dialogue:Boolean(state.dialogue),retry:true};state.mediaReady=false;state.transcoded=false;state.streamOffset=0;state.resumeAt=Math.max(0,requested);const video=$('cinemaVideo');video.pause();video.removeAttribute('src');video.load();
    try{while(request===state.nasRequest&&state.playingId===movie.id&&$('cinemaPlayerDialog').open){const job=await state.api(endpoint(movie,'/prepare'),{method:'POST',body:JSON.stringify(input)});input.retry=false;if(request!==state.nasRequest||state.playingId!==movie.id||!$('cinemaPlayerDialog').open)return;if(job.status==='failed')throw Error(job.error||'La préparation a échoué.');if(job.ready){video.src=job.streamUrl;video.load();await video.play();return;}$('cinemaPlayerStatus').textContent=job.status==='queued'?'Préparation en attente sur le NAS. Elle sera conservée pour les prochaines séances.':'Préparation unique sur le NAS : '+job.percent+' % · Tu pourras ensuite regarder sans conversion en direct.';await new Promise(resolve=>setTimeout(resolve,1500));}}catch(error){if(request===state.nasRequest&&state.playingId===movie.id)$('cinemaPlayerStatus').textContent=error.name==='NotAllowedError'?'Cliquez sur Lecture pour commencer.':'Préparation impossible : '+error.message;}
  }
  async function saveProgress(force = false) {
    const video = $("cinemaVideo"); const movie = movieById(state.playingId);
    if (!movie || !state.mediaReady || !Number.isFinite(position()) || !Number.isFinite(duration()) || duration() <= 0) return;
    if (!force && Date.now() - state.lastSaveAt < 15000) return;
    state.lastSaveAt = Date.now(); const progress = { position: Math.max(0, Math.min(position(), duration())), duration: duration() }; movie.progress = progress;
    try { await state.api(endpoint(movie, "/progress"), { method: "PUT", body: JSON.stringify(progress) }); if (String(state.playingId) === String(movie.id) && $("cinemaPlayerDialog").open) $("cinemaPlayerStatus").textContent = `Position enregistrée · ${timeLabel(progress.position)} / ${timeLabel(progress.duration)}`; }
    catch (error) { if ($("cinemaPlayerDialog").open) $("cinemaPlayerStatus").textContent = `La position n’a pas pu être enregistrée : ${error.message}`; }
  }

  function refreshNativeButtons() {
    renderHero(matchingMovies());
    $("cinemaDetailExternal")?.classList.toggle("hidden", !state.native || !movieById(state.detailId)?.available);
    $("cinemaPlayerExternal")?.classList.toggle("hidden", !state.native || !movieById(state.playingId)?.available);
  }

  async function detectNative() {
    const user = state.user; state.native = false;
    if (admin() && window.jmhDesktop?.openMediaFile) {
      try { const capabilities = window.jmhDesktop.getDesktopCapabilities ? await window.jmhDesktop.getDesktopCapabilities() : null; state.native = state.user === user && (capabilities ? capabilities.nativeMediaPlayer === true : (await window.jmhDesktop.getConnectionConfig())?.mode === "server"); } catch {}
    }
    refreshNativeButtons();
  }

  async function openNativeMovie(id) {
    const movie = movieById(id); if (!state.native || !movie?.available) return;
    try {
      const result = await window.jmhDesktop.openMediaFile("cinema", movie.id);
      if (!result?.ok) throw new Error(result?.error || "Le film n’a pas pu être ouvert dans le lecteur du PC.");
      $("cinemaVideo").pause(); window.dispatchEvent(new Event("jmh:cinema-play"));
      notify(`« ${movie.title} » ouvert dans ton lecteur habituel. La lecture est gérée par cette application.`);
    } catch (error) { notify(error.message); }
  }

  function wire() {
    if (state.wired) return; state.wired = true;const surface=el('div','cinema-player-surface');surface.id='cinemaPlayerSurface';while($('cinemaPlayerDialog').firstChild)surface.append($('cinemaPlayerDialog').firstChild);$('cinemaPlayerDialog').append(surface);
    const controls=el('div','cinema-nas-controls');controls.id='cinemaNasControls';const range=el('input');range.type='range';range.min='0';range.step='1';range.id='cinemaNasSeek';range.setAttribute('aria-label','Position dans le film');const label=el('span');label.id='cinemaNasTime';controls.append(range,label);$('cinemaVideo').insertAdjacentElement('afterend',controls);range.addEventListener('change',()=>seekTo(range.value));range.addEventListener('input',()=>{label.textContent=playerTime(range.value)+' / '+playerTime(duration());});
    const toolbar=el('div','cinema-playback-toolbar');toolbar.innerHTML='<div class="cinema-transport"><button type="button" id="cinemaPlayPause">▶ Lire</button><button type="button" id="cinemaRewind" aria-label="Reculer de 10 secondes">−10 s</button><button type="button" id="cinemaForward" aria-label="Avancer de 10 secondes">+10 s</button><button type="button" id="cinemaMute">Couper le son</button><label>Volume<input id="cinemaVolume" aria-label="Volume du film" type="range" min="0" max="1" step="0.01" value="0.8"></label><button type="button" id="cinemaFullscreen">Plein écran</button></div><div class="cinema-playback-settings"><label>Qualité<select id="cinemaQuality" aria-label="Qualité vidéo"></select></label><label>Audio<select id="cinemaAudioTrack" aria-label="Piste audio"></select></label><label>Vitesse<select id="cinemaSpeed" aria-label="Vitesse de lecture"><option value="0.75">0,75 ×</option><option value="1" selected>Normale</option><option value="1.25">1,25 ×</option><option value="1.5">1,5 ×</option><option value="2">2 ×</option></select></label><label class="cinema-dialogue-switch"><input id="cinemaDialogue" type="checkbox">Voix plus présentes</label></div><p id="cinemaQualityNote"></p>';controls.after(toolbar);
    $('cinemaPlayPause').addEventListener('click',()=>{const video=$('cinemaVideo');if(video.paused)video.play().catch(()=>{$('cinemaPlayerStatus').textContent='Lecture impossible. Relancez le film.';});else video.pause();});$('cinemaRewind').addEventListener('click',()=>seekTo(position()-10));$('cinemaForward').addEventListener('click',()=>seekTo(position()+10));$('cinemaMute').addEventListener('click',()=>{$('cinemaVideo').muted=!$('cinemaVideo').muted;});$('cinemaVolume').addEventListener('input',()=>{$('cinemaVideo').volume=Number($('cinemaVolume').value);$('cinemaVideo').muted=false;});$('cinemaSpeed').addEventListener('change',()=>{$('cinemaVideo').playbackRate=Number($('cinemaSpeed').value);});
    for(const id of ['cinemaQuality','cinemaAudioTrack','cinemaDialogue'])$(id).addEventListener('change',()=>{const movie=movieById(state.playingId);if(!movie)return;const offset=position();state.quality=$('cinemaQuality').value;state.audio=Number($('cinemaAudioTrack').value)||0;state.dialogue=$('cinemaDialogue').checked;playAt(movie,offset);});
    $('cinemaFullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('cinemaPlayerSurface').requestFullscreen)await $('cinemaPlayerSurface').requestFullscreen();else $('cinemaPlayerStatus').textContent='Le plein écran avec commandes n’est pas disponible dans ce navigateur.';}catch{$('cinemaPlayerStatus').textContent='Le navigateur a refusé le plein écran.';}});
    const detailExternal = el("button", "cinema-button cinema-glass hidden", "Ouvrir dans mon lecteur ↗"); detailExternal.type = "button"; detailExternal.id = "cinemaDetailExternal"; detailExternal.addEventListener("click", () => openNativeMovie(state.detailId)); $("cinemaDetailDownload").insertAdjacentElement("afterend", detailExternal);
    const playerExternal = el("button", "cinema-text-link cinema-native-button hidden", "Ouvrir dans mon lecteur ↗"); playerExternal.type = "button"; playerExternal.id = "cinemaPlayerExternal"; playerExternal.addEventListener("click", () => openNativeMovie(state.playingId)); $("cinemaPlayerDownload").insertAdjacentElement("afterend", playerExternal);
    $("cinemaDetailDownload").textContent = "Télécharger le film ↗"; $("cinemaPlayerDownload").textContent = "Télécharger le film ↗";
    $("cinemaImportBtn").addEventListener("click", openImport); $("cinemaHeroImport").addEventListener("click", openImport); $("cinemaEmptyImport")?.addEventListener("click", openImport);
    $("cinemaHeroPlay").addEventListener("click", () => startPlayer($("cinemaHero").dataset.movieId)); $("cinemaHeroDetails").addEventListener("click", () => openDetails($("cinemaHero").dataset.movieId));
    $("cinemaSearch").addEventListener("input", event => { state.query = event.target.value; render(); }); $("cinemaGenre").addEventListener("change", event => { state.genre = event.target.value; render(); });
    $("cinemaPage").addEventListener("click", event => { const filter = event.target.closest("[data-cinema-filter]"); if (filter) { state.filter = filter.dataset.cinemaFilter; render(); return; } const action = event.target.closest("[data-cinema-action]"); if (!action) return; if (action.dataset.cinemaAction === "details") openDetails(action.dataset.movieId); if (action.dataset.cinemaAction === "favorite") favoriteMovie(action.dataset.movieId, action); if (action.dataset.cinemaAction === "import") openImport(); });
    document.querySelectorAll("[data-cinema-close]").forEach(button => button.addEventListener("click", () => closeDialog(button.dataset.cinemaClose)));
    ["cinemaImportDialog", "cinemaDetailsDialog", "cinemaPlayerDialog"].forEach(id => { const dialog = $(id); dialog.addEventListener("close", () => { if (dialog._cinemaPreviousFocus?.isConnected) dialog._cinemaPreviousFocus.focus(); }); });
    $("cinemaPickFiles").addEventListener("click", () => pickFiles(false)); $("cinemaPickFolder").addEventListener("click", () => pickFiles(true)); $("cinemaImportForm").addEventListener("submit", importMovies); $("cinemaImportKind").addEventListener("change", () => { $("cinemaImportPaths").rows = $("cinemaImportKind").value === "folder" ? 2 : 4; });
    $("cinemaDetailFavorite").addEventListener("click", event => favoriteMovie(state.detailId, event.currentTarget)); $("cinemaDetailPlay").addEventListener("click", () => startPlayer(state.detailId)); $("cinemaEditForm").addEventListener("submit", editMovie);
    for(const [dialogId,buttonId] of [['cinemaDetailsDialog','cinemaDetailsBack'],['cinemaPlayerDialog','cinemaPlayerBack']]){const back=el('button','cinema-button cinema-glass','← Retour à la bibliothèque');back.type='button';back.id=buttonId;back.addEventListener('click',async()=>{if(dialogId==='cinemaPlayerDialog'&&document.fullscreenElement)await document.exitFullscreen().catch(()=>{});closeDialog(dialogId);});if(dialogId==='cinemaPlayerDialog')$(dialogId).querySelector('.cinema-player-top').prepend(back);else $(dialogId).prepend(back);}
    const video = $("cinemaVideo");
    video.controls=false;video.volume=(window.JMHPreferences?.get().videoDefaultVolume??80)/100;$("cinemaVolume").value=video.volume;
    video.addEventListener('loadedmetadata',()=>{const movie=movieById(state.playingId);if(!movie)return;state.mediaReady=true;if(!state.transcoded&&state.resumeAt>0&&state.resumeAt<video.duration)video.currentTime=state.resumeAt;updatePlayerControls();$('cinemaPlayerStatus').textContent='Bonne séance. Ta position est enregistrée sur le NAS.';});
    for(const event of ['play','pause','volumechange','timeupdate'])video.addEventListener(event,updatePlayerControls);
    video.addEventListener('waiting',()=>{if(state.playingId)$('cinemaPlayerStatus').textContent='Mise en mémoire tampon… Si cela persiste, choisissez 720p.';});
    video.addEventListener('playing',()=>{$('cinemaPlayerStatus').textContent='Lecture en cours';});
    video.addEventListener("timeupdate", () => {if (!state.playerClosing) saveProgress(false); }); video.addEventListener("pause", () => { if (!state.playerClosing) saveProgress(true); }); video.addEventListener("ended", () => saveProgress(true));
    video.addEventListener("error", () => { if (!state.playingId || state.playerClosing) return;const movie=movieById(state.playingId);if(!state.transcoded&&movie?.browserPlayable&&[3,4].includes(video.error?.code)){state.quality='720';$('cinemaQuality').value='720';prepareNasMovie(movie,Number(movie.progress?.position)||0);return;} $("cinemaPlayerStatus").textContent = video.error?.code === 2 ? "Le fichier n’a pas pu être chargé. Vérifiez l’accès au disque ou au NAS, puis rouvrez le film." : "La lecture intégrée ne peut pas lire cette vidéo ou son codec audio. Ouvre le fichier dans ton lecteur habituel avec le lien ci-dessous."; });
    $("cinemaPlayerDialog").addEventListener("close", () => { state.playerClosing = true;state.nasRequest++;saveProgress(true); video.pause(); video.removeAttribute("src"); video.load(); state.playingId = null; state.mediaReady = false; render(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && state.playingId) saveProgress(true); });
  }

  function init(options) {
    if (!$("cinemaPage")) return;
    const changedUser = state.user?.id !== options.user?.id || state.user?.username !== options.user?.username;
    if (changedUser) { state.movies = []; state.genres = []; state.filter = "all"; state.query = ""; state.genre = ""; state.loaded = false; state.loadSequence++; $("cinemaSearch").value = ""; }
    state.api = options.api; state.toast = options.toast; state.user = options.user; wire();
    $("cinemaImportBtn").classList.toggle("hidden", !admin() || !allowed()); $("cinemaHeroImport").classList.toggle("hidden", !admin()); $("cinemaEmptyImport")?.classList.toggle("hidden", !admin()); $("cinemaContent").classList.toggle("hidden", !allowed()); $("cinemaAccessMessage").classList.toggle("hidden", allowed());
    if (changedUser) render();
    detectNative();
  }

  function destroy() {
    ["cinemaImportDialog", "cinemaDetailsDialog", "cinemaPlayerDialog"].forEach(closeDialog);
    state.loadSequence++; state.loading=false; state.user = null; state.movies = []; state.genres = []; state.loaded = false; state.detailId = null; state.filter = "all"; state.query = ""; state.genre = ""; state.native = false; $("cinemaSearch").value = ""; refreshNativeButtons();
  }

  window.JMHCinema = {getView:()=>({filter:state.filter,query:state.query,genre:state.genre}),restoreView:value=>{for(const key of ['filter','query','genre'])if(Object.hasOwn(value,key))state[key]=value[key];$('cinemaSearch').value=state.query;$('cinemaGenre').value=state.genre;render();},search:query=>{const match=window.JMHLibrarySearch.matcher(query);return state.movies.filter(m=>match(window.JMHLibrarySearch.normalize(m.title+" "+m.genre))).slice(0,6).map(m=>({id:m.id,title:m.title,subtitle:"Cinéma",kind:"cinema"}));},playById:startPlayer, init, load, destroy,open:async(id,play=false)=>{if(!state.loaded)await load();if(play)return startPlayer(id);return openDetails(id);} };
})();
