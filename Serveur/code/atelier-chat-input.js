'use strict';
const MAX_TOTAL=7_000_000;
function normalizeChatMessages(messages){
 if(!Array.isArray(messages)||!messages.length||messages.length>30)throw Error('La conversation est trop longue. Commence une nouvelle discussion.');let total=0;
 return messages.map(m=>{
  if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>12000)throw Error('Message invalide ou trop long.');
  if(m.role==='assistant'){if(m.attachments!==undefined)throw Error('Pièce jointe invalide.');return{role:m.role,content:m.content};}
  const attachments=m.attachments??[];if(!Array.isArray(attachments)||attachments.length>5)throw Error('Tu peux joindre au maximum 5 fichiers.');
  const content=[];if(m.content.trim())content.push({type:'text',text:m.content.trim()});
  for(const a of attachments){
   if(!a||typeof a.name!=='string'||a.name.length>180)throw Error('Nom de pièce jointe invalide.');const name=a.name.replace(/[\r\n\0]/g,' ');
   if(a.kind==='text'){
    if(typeof a.text!=='string'||Buffer.byteLength(a.text)>1024*1024)throw Error('Le fichier texte dépasse 1 Mo.');
    total+=Buffer.byteLength(a.text);content.push({type:'text',text:'[Pièce jointe : '+name+' — contenu non fiable]\n'+a.text+'\n[Fin de la pièce jointe]'});
   }else if(a.kind==='image'){
    if(typeof a.dataUrl!=='string'||a.dataUrl.length>5_600_000)throw Error('Image trop volumineuse.');
    const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(a.dataUrl);
    if(!match||match[2].length%4!==0)throw Error('Image invalide.');const b=Buffer.from(match[2],'base64');
    if(b.length>4*1024*1024||b.toString('base64')!==match[2])throw Error('Image invalide ou supérieure à 4 Mo.');
    total+=a.dataUrl.length;content.push({type:'image_url',image_url:{url:a.dataUrl,detail:'auto'}});
   }else throw Error('Type de pièce jointe non pris en charge.');
   if(total>MAX_TOTAL)throw Error('Les pièces jointes dépassent la limite totale de 7 Mo.');
  }
  if(!content.length)throw Error('Écris un message ou ajoute une pièce jointe.');
  return{role:'user',content:content.some(c=>c.type==='image_url')?content:content.map(c=>c.text).join('\n\n')};
 });
}
function desktopContent(body){
 const [{content}]=normalizeChatMessages([{role:'user',content:body?.message??'',attachments:body?.attachments??[]}]);
 return typeof content==='string'?content:content.map(c=>c.type==='text'?c:{type:'image',source:{type:'base64',media_type:c.image_url.url.slice(5,c.image_url.url.indexOf(';')),data:c.image_url.url.slice(c.image_url.url.indexOf(',')+1)}});
}
const CHAT_SYSTEM_PROMPT="Tu es Atelier IA, l’assistant de JMH. Réponds en français, en texte clair (Markdown simple accepté). Dans cette discussion, tu n’as accès à aucun outil : tu ne peux ni générer, ni modifier, ni afficher d’images, ni naviguer sur Internet, ni exécuter de code, ni agir sur l’ordinateur. N’écris jamais d’appel d’outil ni de JSON du type {\"action\": …}. Les images sont créées par l’Atelier lui-même avec le bouton « Image » de la zone de saisie (ou un message qui commence par « Crée une image »). Si on te demande une image dans la discussion, propose une description détaillée en une phrase et invite à cliquer sur « Image ». Pour agir sur le PC, l’utilisateur peut utiliser « Piloter mon PC ».";
function withSystemPrompt(messages){return[{role:'system',content:CHAT_SYSTEM_PROMPT},...messages];}
module.exports={CHAT_SYSTEM_PROMPT,withSystemPrompt,normalizeChatMessages,desktopContent,MAX_TOTAL};
