// Atelier IA : création d'images (bouton « Image » ou message « Crée une image… »), aperçu, agrandissement, téléchargement.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const form = $('#chat-form'), prompt = $('#prompt'), send = $('#send');
  if (!form || !prompt || !send) return;
  const ASK = /^\s*(?:peux-tu\s+|pourrais-tu\s+|tu\s+peux\s+)?(?:me\s+)?(?:cr[ée]{1,2}r?|cr[ée]e|g[ée]n[èeé]re[rz]?|dessine[rz]?|fai[st]|imagine[rz]?|r[ée]alise[rz]?)(?:[- ]moi)?\s+(?:une?|l['’]|la|le|des)?\s*(?:image|photo|illustration|dessin|logo|affiche|visuel|fond d['’][ée]cran|portrait|paysage)s?\b/i;
  let mode = false, pending = false, generation = 0, controller = null, closeLightbox = null;
  const urls = new Set(), cancelButton = $('#cancel') || $('#cancel-response');

  const chip = document.createElement('button');
  chip.type = 'button'; chip.id = 'image-mode'; chip.className = 'image-mode-chip'; chip.setAttribute('aria-pressed', 'false');
  chip.title = 'Créer une image à partir de ta description';
  chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17 4.8-4.6 3.4 3.1 2.6-2.4 4.2 3.9"/></svg><span>Image</span>';
  $('.attach-wrap')?.after(chip);
  const desktopMode = () => Boolean($('#desktop-mode-banner') && !$('#desktop-mode-banner').hidden);
  const privacy = $('.privacy') || $('.privacy-note'), privacyText = privacy?.textContent || '';
  function setMode(on) {
    mode = on; chip.setAttribute('aria-pressed', String(on)); form.classList.toggle('image-mode', on);
    if (privacy) privacy.textContent = on ? 'La description est transmise à Pollinations ; Gemini peut la reformuler quand il est disponible. Aucun modèle d’images payant ne sera utilisé en secours.' : privacyText;
    prompt.placeholder = on ? 'Décris l’image à créer (sujet, style, couleurs, ambiance)…' : desktopMode() ? 'Demande une action sur ton PC…' : 'Décris ton idée, ou utilise le microphone…';
  }
  chip.addEventListener('click', () => { if (desktopMode()) return window.AtelierAttachmentToast?.('Arrête le pilotage pour créer des images.'); setMode(!mode); prompt.focus(); });

  function clearWelcome() { const box = $('#messages'); if (box && !box.querySelector('.message')) box.replaceChildren(); }
  function bubble(role) {
    clearWelcome();
    const div = document.createElement('div'); div.className = 'message ' + role;
    const author = document.createElement('strong'); author.textContent = role === 'user' ? 'TOI' : 'ATELIER IA';
    div.append(author); $('#messages').append(div); return div;
  }
  const scroll = () => { const box = $('#messages'); box.scrollTop = box.scrollHeight; };
  const stamp = () => { const d = new Date(), n = v => String(v).padStart(2, '0'); return d.getFullYear() + n(d.getMonth() + 1) + n(d.getDate()) + '-' + n(d.getHours()) + n(d.getMinutes()) + n(d.getSeconds()); };

  function lightbox(src, alt) {
    closeLightbox?.(); const previousFocus = document.activeElement;
    const box = document.createElement('div'); box.className = 'image-lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Image en grand');
    const img = document.createElement('img'); img.src = src; img.alt = alt;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'image-lightbox-close'; close.setAttribute('aria-label', 'Fermer'); close.textContent = '×';
    box.append(img, close); document.body.append(box);
    const done = () => { box.remove(); document.removeEventListener('keydown', key); closeLightbox = null; if (previousFocus?.isConnected) previousFocus.focus(); }; closeLightbox = done;
    const key = e => { if (e.key === 'Escape') done(); };
    box.addEventListener('click', e => { if (e.target !== img) done(); }); document.addEventListener('keydown', key); close.focus();
  }

  function card(container, image, description) {
    if (!/^image\/(png|jpeg|webp)$/.test(image.mime) || typeof image.data !== 'string' || image.data.length > 17 * 1024 * 1024) throw Error('L’image reçue est invalide ou trop volumineuse.');
    const bytes = Uint8Array.from(atob(image.data), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: image.mime }));
    urls.add(url);
    const ext = image.mime === 'image/jpeg' ? 'jpg' : image.mime.split('/')[1];
    const figure = document.createElement('figure'); figure.className = 'generated-image';
    const img = document.createElement('img'); img.src = url; img.alt = description; img.title = 'Agrandir'; img.addEventListener('click', () => lightbox(url, description));
    const actions = document.createElement('div'); actions.className = 'generated-actions';
    const download = document.createElement('a'); download.href = url; download.download = 'atelier-image-' + stamp() + '.' + ext; download.className = 'generated-button primary-link';
    download.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>Télécharger';
    const zoom = document.createElement('button'); zoom.type = 'button'; zoom.className = 'generated-button';
    zoom.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>Agrandir'; zoom.addEventListener('click', () => lightbox(url, description));
    const again = document.createElement('button'); again.type = 'button'; again.className = 'generated-button';
    again.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v3.5H16"/></svg>Une autre version'; again.addEventListener('click', () => { if (!pending) create(description); });
    actions.append(download, zoom, again);
    img.addEventListener('load', scroll);
    figure.append(img, actions); container.append(figure);
  }

  async function create(description) {
    description = String(description || '').trim();
    if (pending || window.AtelierConversationBusy?.()) return window.AtelierAttachmentToast?.('Une réponse est déjà en cours.');
    if (!description || description.length > 2000) return window.AtelierAttachmentToast?.('Décris ton image en 2000 caractères au maximum.');
    if (desktopMode()) return window.AtelierAttachmentToast?.('Arrête le pilotage pour créer des images.');
    const token = ++generation; controller = new AbortController();
    pending = true; send.disabled = true; chip.disabled = true; if (cancelButton) cancelButton.hidden = false;
    const user = bubble('user'); const text = document.createElement('span'); text.textContent = 'Image : ' + description; user.append(text);
    const answer = bubble('assistant'); const wait = document.createElement('div'); wait.className = 'generated-loading';
    wait.innerHTML = '<span></span><p>Création de l’image… quelques secondes, parfois jusqu’à une minute.</p>'; answer.append(wait); scroll();
    try {
      const r = await (window.AtelierImageRequest ? window.AtelierImageRequest(description, controller.signal) : fetch('/api/atelier/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: description }), signal: controller.signal }));
      let d = {}; try { d = await r.json(); } catch {}
      if (token !== generation) return;
      if (!r.ok || !d.images?.length) {
        const error = Error(typeof d.error === 'string' ? d.error : 'L’image n’a pas pu être créée.'); error.attempts = d.attempts; throw error;
      }
      wait.remove();
      for (const image of d.images) card(answer, image, description);
      if (d.text) { const note = document.createElement('span'); note.className = 'generated-note'; note.textContent = d.text; answer.append(note); }
    } catch (error) {
      if (token !== generation) return;
      wait.remove(); const span = document.createElement('span'); span.textContent = error.name === 'AbortError' ? 'Création interrompue.' : error.message; answer.append(span);
      if (Array.isArray(error.attempts) && error.attempts.length) {
        const details = document.createElement('details'); details.className = 'generated-details';
        const summary = document.createElement('summary'); summary.textContent = 'Détails techniques (administrateur)';
        const pre = document.createElement('pre'); pre.textContent = error.attempts.map(a => a.model + ' → ' + a.status + ' : ' + a.error).join('\n');
        details.append(summary, pre); answer.append(details);
      }
    } finally { if (token === generation) { pending = false; controller = null; send.disabled = false; chip.disabled = false; if (cancelButton) cancelButton.hidden = true; scroll(); } }
  }

  // Intercepte l'envoi avant le chat texte quand il s'agit d'une image.
  document.addEventListener('submit', event => {
    if (event.target !== form) return;
    const text = prompt.value.trim();
    if (desktopMode() || !text || (!mode && !ASK.test(text))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (pending || window.AtelierConversationBusy?.()) return window.AtelierAttachmentToast?.('Une réponse est déjà en cours.');
    prompt.value = ''; prompt.dispatchEvent(new Event('input'));
    void create(text);
  }, true);
  function clear() { generation++; controller?.abort(); controller = null; pending = false; closeLightbox?.(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); send.disabled = false; chip.disabled = false; if (cancelButton) cancelButton.hidden = true; }
  cancelButton?.addEventListener('click', () => { if (pending) controller?.abort(); });
  window.addEventListener('pagehide', clear);
  window.AtelierImages = { create, setMode, clear, isBusy: () => pending };
})();
