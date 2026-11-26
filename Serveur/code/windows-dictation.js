'use strict';
function createWindowsDictation({runPowerShell,platform=process.platform}){
 let busy=false;
 async function start(window){if(platform!=='win32')return{ok:false,error:'Utilise la dictée de ton clavier ou de ton navigateur sur cet appareil.'};if(busy)return{ok:false,error:'Ouverture de la dictée en cours.'};if(!window||window.isDestroyed())return{ok:false,error:'Fenêtre JMH indisponible.'};busy=true;
  try{window.focus();window.webContents.focus();const handle=window.getNativeWindowHandle().readBigUInt64LE().toString();if(!/^\d+$/.test(handle))throw Error('Fenêtre invalide.');const source='using System;using System.Runtime.InteropServices;public static class JmhDictationNative{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);public static void Open(){try{keybd_event(0x5B,0,0,UIntPtr.Zero);keybd_event(0x48,0,0,UIntPtr.Zero);}finally{keybd_event(0x48,0,2,UIntPtr.Zero);keybd_event(0x5B,0,2,UIntPtr.Zero);}}}';return await runPowerShell("Add-Type -TypeDefinition '"+source+"';if([JmhDictationNative]::GetForegroundWindow().ToInt64() -ne "+handle+"){throw 'Remets JMH au premier plan.'};[JmhDictationNative]::Open();@{ok=$true;native=$true}|ConvertTo-Json -Compress",10000);}catch{return{ok:false,error:'La dictée Windows ne peut pas être ouverte. Garde JMH au premier plan, puis utilise Windows + H dans le champ.'};}finally{busy=false;}}
 return{start};
}
module.exports={createWindowsDictation};
