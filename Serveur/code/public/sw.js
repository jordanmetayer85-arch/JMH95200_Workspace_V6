'use strict';
// Cache only the explanatory offline page and public icons. No credentials,
// library, API response, document, music or movie is stored by this worker.
const CACHE='jmh-offline-v3-20261103';
const PUBLIC=['/offline.html','/assets/jmh-app-192.png','/assets/jmh-app-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(PUBLIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jmh-offline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'&&['/','/index.html','/mobile.html','/acces-distance.html','/m/','/m/index.html'].includes(url.pathname)){
   event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));
 }
});

// Private streaming uses only temporary in-memory keys; never Cache Storage.
importScripts('/vault-stream-worker.js');
