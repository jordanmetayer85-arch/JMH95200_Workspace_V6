'use strict';
const crypto=require('crypto');
// Every card owns a separate dated collection. No item belongs to two cards.
function buildMemoryGroups(items,{now=new Date(),mode='anniversary',count=6,maxItems=48}={}){
 const day=now.toISOString().slice(0,10),rank=value=>crypto.createHash('sha1').update(day+':'+value).digest('hex'),seen=new Set(),buckets=new Map();
 for(const item of items){if(!item?.id||seen.has(item.id))continue;seen.add(item.id);const date=new Date(item.date),valid=Number.isFinite(date.getTime()),period=valid?date.toISOString().slice(0,7):'sans-date',folder=String(item.album||'.'),key=period+'\0'+folder;let bucket=buckets.get(key);if(!bucket){bucket={key,period,folder,items:[],anniversary:false};buckets.set(key,bucket);}bucket.items.push(item);if(valid&&date.getFullYear()<now.getFullYear()){const comparison=new Date(now.getFullYear(),date.getMonth(),date.getDate()),yearDays=(Date.UTC(now.getFullYear()+1,0,1)-Date.UTC(now.getFullYear(),0,1))/86400000,delta=Math.abs(comparison-now)/86400000;if(Math.min(delta,yearDays-delta)<=15)bucket.anniversary=true;}}
 const candidates=[...buckets.values()].sort((a,b)=>(mode==='anniversary'?Number(b.anniversary)-Number(a.anniversary):0)||rank(a.key).localeCompare(rank(b.key))),selected=[],periods=new Set(),folders=new Set();
 // Start with this season, then widen both dates and events rather than choosing
 // six cards from the same period merely because it contains more folders.
 while(candidates.length&&selected.length<count){let best=0,score=-Infinity;for(let i=0;i<candidates.length;i++){const b=candidates[i],value=(periods.has(b.period)?0:4)+(folders.has(b.folder)?0:2)+(mode==='anniversary'&&b.anniversary?1:0);if(value>score){best=i;score=value;}}const [bucket]=candidates.splice(best,1);selected.push(bucket);periods.add(bucket.period);folders.add(bucket.folder);}
 const picked=selected.map(b=>({...b,items:b.items.slice().sort((a,c)=>rank(a.id).localeCompare(rank(c.id)))}));
 // A single folder/month can still yield distinct cards rather than repeats.
 while(picked.length<count){const largest=picked.slice().sort((a,b)=>b.items.length-a.items.length)[0];if(!largest||largest.items.length<2)break;const half=largest.items.splice(Math.ceil(largest.items.length/2));picked.push({...largest,key:largest.key+':'+picked.length,items:half,part:picked.length+1});}
 return picked.map((b,index)=>{b.items=b.items.slice(0,maxItems);const period=b.period==='sans-date'?'Souvenirs sans date':new Date(b.period+'-01T12:00:00Z').toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),folder=b.folder==='.'?'':b.folder.split('/').filter(Boolean).at(-1);return{id:crypto.createHash('sha256').update(b.key).digest('hex').slice(0,16),title:period+(folder?' · '+folder:''),subtitle:(b.part?'Sélection '+(index+1)+' · ':'')+b.items.length+' '+(b.items[0]?.kind==='video'?'vidéos':'photos'),items:b.items};});
}
module.exports={buildMemoryGroups};
