'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode32(text){let bits=0,value=0,out=[];for(const char of String(text).replace(/=+$/,'')){const n=alphabet.indexOf(char);if(n<0)throw Error('Secret invalide');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function totp(secret,time=Date.now(),digits=6){const step=Math.floor(time/30000),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',decode32(secret)).update(counter).digest(),offset=h[19]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');}
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function verifyTotp(secret,code,last=-1,time=Date.now()){if(!/^\d{6}$/.test(String(code)))return null;for(const drift of [-1,0,1]){const at=time+drift*30000,step=Math.floor(at/30000);if(step>last&&equal(totp(secret,at),String(code)))return step;}return null;}
function atomic(file,value){const temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(temporary,file);}
function createSecurity(directory){fs.mkdirSync(directory,{recursive:true,mode:0o700});const keyFile=path.join(directory,'mfa.key');if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32),{mode:0o600,flag:'wx'});if(fs.lstatSync(keyFile).isSymbolicLink())throw Error('Clé MFA invalide');const key=fs.readFileSync(keyFile);if(key.length!==32)throw Error('Clé MFA invalide');
 return{seal(text){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('jmh-owner-totp-v1'));const data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return{iv:iv.toString('hex'),data:data.toString('hex'),tag:cipher.getAuthTag().toString('hex')};},open(value){const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'hex'));decipher.setAAD(Buffer.from('jmh-owner-totp-v1'));decipher.setAuthTag(Buffer.from(value.tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(value.data,'hex')),decipher.final()]).toString('utf8');}};
}
function createJournal(directory){fs.mkdirSync(directory,{recursive:true,mode:0o700});let rotatedDay='';
 function append(type,details,username='system',timestamp=null){const now=timestamp?new Date(timestamp):new Date(),day=now.toISOString().slice(0,10);if(day!==rotatedDay){rotatedDay=day;for(const name of fs.readdirSync(directory)){if(/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)&&Date.parse(name.slice(0,10))<Date.now()-3*86400000)fs.unlinkSync(path.join(directory,name));}}
  const entry={id:crypto.randomUUID(),at:now.toISOString(),type:String(type).replace(/[\r\n]/g,' ').slice(0,80),details:String(details).replace(/[\r\n]/g,' ').slice(0,1000),username:String(username).replace(/[\r\n]/g,' ').slice(0,128)};
  fs.appendFileSync(path.join(directory,day+'.jsonl'),JSON.stringify(entry)+'\n',{mode:0o600});return entry;
 }
 function list({username='',type='',page=1}={}){const since=Date.now()-86400000,rows=[];for(const name of fs.readdirSync(directory).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)&&Date.parse(n.slice(0,10))>=since-86400000).sort().reverse()){const file=path.join(directory,name);if(fs.statSync(file).size>64*1024**2)throw Error('Journal volumineux : export ou maintenance requis.');const lines=fs.readFileSync(file,'utf8').trim().split('\n').reverse();for(const line of lines){if(!line)continue;const row=JSON.parse(line);if(Date.parse(row.at)>=since&&(!username||row.username===username)&&(!type||row.type===type))rows.push(row);}}
  page=Math.max(1,Number.parseInt(page,10)||1);return{items:rows.slice((page-1)*100,page*100),total:rows.length,page,pages:Math.ceil(rows.length/100),since:new Date(since).toISOString(),until:new Date().toISOString()};
 }
 return{append,list};
}
module.exports={base32,decode32,totp,verifyTotp,hash,equal,atomic,createSecurity,createJournal};
