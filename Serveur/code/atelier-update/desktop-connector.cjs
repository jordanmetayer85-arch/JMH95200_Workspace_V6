'use strict';
const fs=require('node:fs'),path=require('node:path');
// WaitFor relit toute l'arborescence d'accessibilité à chaque essai (plus de 20 s sur un poste chargé) : non proposé.
const READ_TOOLS=['ControlStatus','DisplayInventory','Screenshot','Snapshot','Wait'];
const ACTION_TOOLS=['Click','Type','Scroll','Move','Shortcut','App'];
const prefix=name=>'mcp__windows-visual__'+name;
// Le python.exe du venv contient le chemin absolu du PC où le connecteur a été préparé :
// on démarre le Python embarqué avec un lanceur qui charge les bibliothèques du venv.
function embeddedPython(control){
 const base=path.join(control,'python');
 const found=fs.existsSync(base)?fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^cpython-/i.test(e.name)).map(e=>path.join(base,e.name,'python.exe')).filter(f=>fs.existsSync(f)).sort().reverse():[];
 if(!found.length)throw Error('Connecteur Windows incomplet : Python embarqué introuvable.');
 return found[0];
}
function connectorConfig(root,tools=[...READ_TOOLS,...ACTION_TOOLS]){
 const control=path.join(root,'desktop-control');
 return {mcpServers:{'windows-visual':{type:'stdio',command:embeddedPython(control),args:[path.join(control,'start-windows-mcp.py'),'serve','--transport','stdio','--config',path.join(control,'config.toml'),'--tools',tools.join(',')],env:{ANONYMIZED_TELEMETRY:'false',POSTHOG_API_KEY:'',WINDOWS_MCP_WATCHDOG:'false',PYTHONUTF8:'1'}}}};
}
function verifyConnector(root){
 const control=path.join(root,'desktop-control');
 embeddedPython(control);
 for(const file of [path.join(control,'start-windows-mcp.py'),path.join(control,'config.toml'),path.join(control,'instructions.txt'),path.join(control,'venv','Lib','site-packages','windows_mcp','__init__.py'),path.join(root,'claude-native','package','claude.exe')]){
  if(!fs.existsSync(file))throw Error('Connecteur Windows incomplet : '+path.basename(file));
 }
}
function writeConnectorConfig(root,directory){
 verifyConnector(root);fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'windows-mcp.json');
 fs.writeFileSync(file,JSON.stringify(connectorConfig(root)),{mode:0o600});return file;
}
const INFO=Object.freeze({name:'Windows-MCP',version:'0.8.8',mode:'local',codexTool:'Computer Use',codexModule:'@oai/sky',codexEmbedded:false,description:'Le connecteur Windows-MCP agit sur cet ordinateur. Le plugin Computer Use de Codex est distinct et n’est pas embarqué.'});
module.exports={embeddedPython,connectorConfig,writeConnectorConfig,verifyConnector,READ_TOOLS,ACTION_TOOLS,prefix,INFO};
