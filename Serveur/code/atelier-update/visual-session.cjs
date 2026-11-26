'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=__dirname;
(async()=>{
 const profile=require('./claude-profile.cjs').profileFor(root,'desktop'),mcp=require('./desktop-connector.cjs').writeConnectorConfig(root,path.join(profile,'interactive'));
 const response=await fetch('http://127.0.0.1:20128/v1/models',{headers:{Authorization:'Bearer '+String(process.env.ANTHROPIC_AUTH_TOKEN||'')},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Le moteur Gemini ne répond pas.');const models=(await response.json()).data||[];
 const model=models.map(m=>m.id).find(m=>typeof m==='string'&&/^gemini\//i.test(m)&&!/embed|imagen|tts|audio|live/i.test(m));if(!model)throw Error('Aucun modèle Gemini compatible n’est disponible.');
 const env={...process.env,ANTHROPIC_MODEL:model,CLAUDE_CONFIG_DIR:profile,ENABLE_TOOL_SEARCH:'false'};delete env.ANTHROPIC_API_KEY;
 const child=spawn(path.join(root,'claude-native','package','claude.exe'),['--tools','','--strict-mcp-config','--mcp-config',mcp,'--system-prompt',fs.readFileSync(path.join(root,'desktop-control/instructions.txt'),'utf8'),'--permission-mode','manual','--model',model],{env,stdio:'inherit',windowsHide:false});
 process.on('SIGINT',()=>{});child.on('error',()=>{console.error('Impossible d’ouvrir la session.');process.exitCode=1;});child.on('exit',code=>process.exitCode=code||0);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
