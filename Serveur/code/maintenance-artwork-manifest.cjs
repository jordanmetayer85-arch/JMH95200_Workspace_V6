'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root='/data/data',store=JSON.parse(fs.readFileSync(path.join(root,'music_catalog.json'),'utf8'));
const tracks=store.tracks.filter(t=>typeof t.sourcePath==='string'&&t.sourcePath.startsWith('/storage/Medias/Musique/')&&!/sensible/i.test(t.sourcePath));
const service=require('./music-covers').createMusicCoverService({DATA_DIR:root,tracks:()=>tracks,search:async()=>[]});
const stamps=new Map(),entries=[];
for(const t of tracks){const f=service.file(t);if(!f||!f.path.startsWith(root+'/music-covers/'))continue;let stamp=stamps.get(f.path);if(!stamp){const s=fs.statSync(f.path);stamp=crypto.createHash('sha256').update(f.path+'|'+s.size+'|'+s.mtimeMs).digest('hex');stamps.set(f.path,stamp);}entries.push({id:t.id,path:t.sourcePath,artist:t.artist,album:t.album,title:t.title,cover:f.path,sha256:stamp});}
const value={at:new Date().toISOString(),tracks:tracks.length,covered:entries.length,uniqueImages:stamps.size,entries};
const dest='/data/artwork-sync-manifest.json',temp=dest+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,dest);console.log(JSON.stringify({tracks:tracks.length,covered:entries.length,uniqueImages:stamps.size}));
