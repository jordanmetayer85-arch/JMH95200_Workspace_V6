'use strict';
const fs=require('fs'),crypto=require('crypto');
function createMusicDurationIndex({file,describe,valid,enabled=true,delay=250}){
 let records={};try{records=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}const normal=[],priority=[],queued=new Set();let busy=false,saveTimer=null,revision=0;
 const key=track=>crypto.createHash('sha1').update(track.sourcePath+'\0'+track.size+'\0'+track.addedAt).digest('hex');
 function record(track){const r=records[track.id];return r?.key===key(track)&&(!r.failed||Date.now()-r.at<86400000)?r:null;}
 function duration(track){return Number(track.duration)||Number(track.mediaDuration)||record(track)?.duration||0;}
 function save(){saveTimer=null;try{fs.writeFileSync(file+'.tmp',JSON.stringify(records),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}}
 function schedule(tracks,first=false){if(!enabled)return;for(const track of tracks){if(duration(track)||record(track))continue;if(queued.has(track.id)){if(first)priority.push(track);continue;}queued.add(track.id);(first?priority:normal).push(track);}}
 const timer=setInterval(async()=>{if(busy)return;let track;while(priority.length||normal.length){const next=priority.length?priority.pop():normal.shift();if(!queued.has(next.id)||record(next))continue;track=next;break;}if(!track)return;busy=true;try{const result=valid(track)?await describe(track.sourcePath):null,n=Number(result?.duration)||0;records[track.id]={key:key(track),duration:Number.isFinite(n)&&n>0&&n<=7*86400?n:0,failed:!n,at:Date.now()};revision++;if(!saveTimer){saveTimer=setTimeout(save,300);saveTimer.unref();}}catch{records[track.id]={key:key(track),duration:0,failed:true,at:Date.now()};revision++;}finally{queued.delete(track.id);busy=false;}},delay);timer.unref();
 return{duration,schedule,revision:()=>revision,pending:track=>enabled&&!duration(track)&&!record(track),remember(track,value){if(!Number.isFinite(value)||value<=0)return;records[track.id]={key:key(track),duration:value,failed:false,at:Date.now()};revision++;if(!saveTimer){saveTimer=setTimeout(save,300);saveTimer.unref();}},close(){clearInterval(timer);clearTimeout(saveTimer);save();}};
}
module.exports={createMusicDurationIndex};
