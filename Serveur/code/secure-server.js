'use strict';
const fs=require('fs'),path=require('path'),https=require('https'),crypto=require('crypto');
function startSecureServer({app,attach,environment=process.env}){
 if(!environment.JMH_TLS_CERT&&!environment.JMH_TLS_KEY)return null;
 const certFile=environment.JMH_TLS_CERT,keyFile=environment.JMH_TLS_KEY,port=Number(environment.JMH_TLS_PORT||3443);
 if(!certFile||!keyFile||!path.isAbsolute(certFile)||!path.isAbsolute(keyFile)||!Number.isInteger(port)||port<0||port>65535)throw Error('Configuration HTTPS NAS invalide.');
 for(const file of [certFile,keyFile]){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('Certificat HTTPS ou clé privée invalide.');}
 if(process.platform!=='win32'&&(fs.statSync(keyFile).mode&0o077)!==0)throw Error('La clé privée HTTPS doit être lisible uniquement par le compte serveur.');
 const key=fs.readFileSync(keyFile),cert=fs.readFileSync(certFile),certificate=new crypto.X509Certificate(cert);if(Date.parse(certificate.validTo)<=Date.now())throw Error('Le certificat HTTPS du NAS est expiré.');
 const server=https.createServer({key,cert,minVersion:'TLSv1.2',maxHeaderSize:16384},app);server.requestTimeout=120000;server.headersTimeout=30000;server.keepAliveTimeout=5000;attach?.(server);server.listen(port,'0.0.0.0');server.on('error',error=>console.error('Le service HTTPS JMH n’a pas pu démarrer : '+error.code));return server;
}
module.exports={startSecureServer};
