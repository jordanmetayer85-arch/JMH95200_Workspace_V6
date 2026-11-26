(function(root){
 'use strict';
 const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const cached=new WeakMap();
 function text(track,field='all'){let entry=cached.get(track);if(!entry){entry={};cached.set(track,entry);}if(entry[field]!==undefined)return entry[field];return entry[field]=field==='artist'?normalize([track.artist,track.searchHint].filter(Boolean).join(' ')):field==='title'?normalize(track.title):field==='album'?normalize(track.album):normalize([track.title,track.artist,track.album,track.genre,track.searchHint].filter(Boolean).join(' '));}
 function matcher(query){const terms=normalize(query).split(' ').filter(Boolean);return haystack=>{if(!terms.length)return true;const words=haystack.split(' ');return terms.every(term=>words.some(word=>word===term||((term.length>=4||term.length<3)&&word.startsWith(term))));};}
 function matches(haystack,query){return matcher(query)(haystack);}
 const api={normalize,text,matches,matcher};if(typeof module==='object'&&module.exports)module.exports=api;else root.JMHLibrarySearch=api;
})(typeof window!=='undefined'?window:globalThis);
