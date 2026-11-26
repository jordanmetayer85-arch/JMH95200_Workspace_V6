"use strict";
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function createBrowserTranscoder({ binary = process.env.JMH_FFMPEG_PATH || "", spawn = childProcess.spawn, maxConcurrent = 2,cacheRoot } = {}) {
  let available = false;
  if (binary && path.isAbsolute(binary)) {
    try { available = fs.statSync(binary).isFile(); fs.accessSync(binary, fs.constants.X_OK); } catch { available = false; }
  }
  let active = 0;
  const durations=new Map();
  async function describe(file){
    if(!available||!path.isAbsolute(file))return{duration:0};
    const stat=await fs.promises.stat(file), key=file+'\0'+stat.size+'\0'+stat.mtimeMs;
    if(durations.has(key))return durations.get(key);
    const promise=new Promise(resolve=>{
      let done=false,body='',child,timer;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(typeof value==='object'?value:{duration:value});};
      try{child=spawn(path.join(path.dirname(binary),process.platform==='win32'?'ffprobe.exe':'ffprobe'),['-v','error','-protocol_whitelist','file,pipe','-show_entries','format=duration:stream=index,codec_type,codec_name,width,height,pix_fmt,channels:stream_tags=language,title','-of','json',file],{shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{return finish(0);}
      timer=setTimeout(()=>{child.kill();finish(0)},15000);timer.unref();
      child.stdout.on('data',chunk=>{body+=chunk;if(body.length>65536){child.kill();finish(0)}});child.on('error',()=>finish(0));
      child.on('close',()=>{try{const raw=JSON.parse(body),value=Number(raw.format?.duration),video=raw.streams?.find(s=>s.codec_type==='video'),audio=(raw.streams||[]).filter(s=>s.codec_type==='audio').slice(0,16).map((s,i)=>({index:i,codec:s.codec_name,channels:s.channels,language:String(s.tags?.language||'').slice(0,12),title:String(s.tags?.title||'').slice(0,100)}));const height=Number(video?.height)||0,width=Number(video?.width)||0;const copyVideo=video?.codec_name==='h264'&&['yuv420p','yuvj420p'].includes(video?.pix_fmt);finish({duration:Number.isFinite(value)&&value>0&&value<=7*86400?value:0,width,height,codec:video?.codec_name||'',copyVideo,audio,qualities:[...(copyVideo?[{id:'original',label:'Original · '+(height>=2160?'4K':height+'p'),height,copy:true}]:[]),...[720,1080].filter(h=>height>=h).map(h=>({id:String(h),label:h+'p',height:h,copy:false})),...(height>0&&height<720?[{id:'720',label:'Compatible · '+height+'p',height,copy:false}]:[])]});}catch{finish(0)}});
    });
    if(durations.size>=200)durations.delete(durations.keys().next().value);durations.set(key,promise);
    promise.then(value=>{if(!value.duration&&durations.get(key)===promise)durations.delete(key);});
    return promise;
  }
  async function stream(req, res, { kind, file }) {
    if (!available) return res.status(503).json({ error: "Le transcodage du NAS n’est pas disponible. Utilisez le lecteur de votre PC." });
    if (!["cinema", "music"].includes(kind) || !path.isAbsolute(file)) return res.status(400).json({ error: "Média invalide." });
    const start = req.query.start === undefined ? 0 : Number(req.query.start);
    if (!Number.isFinite(start) || start < 0 || start > 7 * 24 * 60 * 60 || Array.isArray(req.query.start)) return res.status(400).json({ error: "Position de lecture invalide." });
    const quality=req.query.quality===undefined?'720':req.query.quality,audio=req.query.audio===undefined?0:Number(req.query.audio),dialogue=req.query.dialogue===undefined?'0':req.query.dialogue;
    if(!['original','720','1080'].includes(quality)||!Number.isInteger(audio)||audio<0||audio>15||Array.isArray(req.query.audio)||!['0','1'].includes(dialogue))return res.status(400).json({error:'Réglage de lecture invalide.'});
    const headers = { "Content-Type": kind === "music" ? "audio/mpeg" : "video/mp4",
      "Accept-Ranges": "none", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" };
    if (req.method === "HEAD") return res.set(headers).end();
    const metadata=kind==='cinema'?await describe(file):null;
    if(res.destroyed||req.aborted)return;
    if(kind==='cinema'&&((quality==='original'&&!metadata.copyVideo)||(audio>0&&!metadata.audio?.some(a=>a.index===audio))||(quality==='1080'&&metadata.height<1080)))return res.status(400).json({error:'Cette qualité ou piste audio n’existe pas dans ce fichier.'});
    if(kind==='cinema'&&metadata.duration>0&&start>=metadata.duration)return res.status(400).json({error:'Cette position dépasse la durée du film.'});
    if (active >= maxConcurrent) return res.status(503).set("Retry-After", "10").json({ error: "Le NAS prépare déjà d’autres lectures. Réessayez dans quelques secondes." });
    // Registered local files only. Playlist/manifest demuxers and network protocols are excluded.
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "2", "-filter_threads", "1", "-re",
      "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi,mpeg,mpegts,asf,flv,ogg,mp3,flac,aac,wav,aiff,amr,mpc,mpc8",
      ...(start ? ["-ss", String(start)] : []), "-i", file, "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn"];
    if (kind === "music") args.push("-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3", "pipe:1");
    else {
      args.push('-map','0:v:0','-map','0:a:'+audio+'?');
      if(quality==='original')args.push('-c:v','copy');
      else args.push('-vf',`scale=w='min(iw,${quality==='1080'?1920:1280})':h='min(ih,${quality})':force_original_aspect_ratio=decrease:force_divisible_by=2`,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-threads','2','-g','48');
      args.push('-c:a','aac','-ac','2','-ar','48000','-b:a','192k');
      if(dialogue==='1')args.push('-af','acompressor=threshold=0.125:ratio=3:attack=20:release=250:makeup=2,alimiter=limit=0.95');
      args.push('-movflags','frag_keyframe+empty_moov+default_base_moof','-f','mp4','pipe:1');
    }
    let child;
    try { child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }); }
    catch { return res.status(503).json({ error: "Le lecteur du NAS n’a pas pu démarrer." }); }
    active++;
    let released = false;
    let cancelled = false;
    let started = false;
    let startupTimer;
    let lifetimeTimer;
    const release = () => {
      if (released) return;
      released = true; active--; clearTimeout(startupTimer); clearTimeout(lifetimeTimer);
    };
    const stop = () => {
      if(cancelled)return;cancelled=true;clearTimeout(startupTimer);clearTimeout(lifetimeTimer);
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000);
        timer.unref();
      }
    };
    const failure = () => {
      stop();
      if (!res.headersSent) res.status(503).json({ error: "Ce média ne peut pas être lu par le NAS. Utilisez le lecteur de votre PC." });
      else res.destroy();
    };
    startupTimer = setTimeout(failure, 30000); startupTimer.unref();
    lifetimeTimer = setTimeout(failure, 7 * 60 * 60 * 1000); lifetimeTimer.unref();
    child.on("error", failure);
    child.stdout.once("data", chunk => {
      if (released || cancelled || res.destroyed) return;
      started = true; clearTimeout(startupTimer); res.set(headers); res.write(chunk); child.stdout.pipe(res);
    });
    child.stdout.on("error", failure);
    child.on("close", code => {
      release();
      if (code !== 0 || !started) {
        if (!res.headersSent) res.status(503).json({ error: "Ce média ne peut pas être lu par le NAS." });
        else if (!res.writableEnded) res.destroy();
      } else if (!res.writableEnded) res.end();
    });
    req.once("aborted", stop);
    res.once("close", stop);
  }
  const cache=available&&cacheRoot?require('./playback-cache').createPlaybackCache({root:cacheRoot,binary,spawn,describe}):null;
  return { available, stream, describe,cache };
}
module.exports = { createBrowserTranscoder };
