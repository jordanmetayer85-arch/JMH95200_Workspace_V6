'use strict';
const path=require('node:path'),fs=require('node:fs');
function applyWindowIcon(window,{platform=process.platform,resourcesPath=process.resourcesPath,execPath=process.execPath}={}){
 if(platform!=='win32')return;
 const icon=path.join(resourcesPath,'jmh-atom-v2.ico');
 // The taskbar relaunch icon is a separate Windows property from the title icon.
 // An explicit, versioned ICO avoids reusing the old shortcut icon cache.
 if(!fs.existsSync(icon))return;
 window.setIcon(path.join(__dirname,'public','assets','icon.png'));
 window.setAppDetails({appId:'com.jmh95200.workspace',appIconPath:icon,appIconIndex:0,relaunchCommand:'"'+execPath+'"',relaunchDisplayName:'JMH95200'});
}
module.exports={applyWindowIcon};

