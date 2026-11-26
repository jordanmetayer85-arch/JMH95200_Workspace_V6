'use strict';
process.on('message',m=>{if(m?.type==='shutdown')process.emit('SIGTERM');});
process.on('disconnect',()=>process.emit('SIGTERM'));
import(require('node:url').pathToFileURL(require('node:path').join(__dirname,'atelier-omniroute','omniroute','dist','server-ws.mjs')).href);
