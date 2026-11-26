'use strict';
const defaults=require('./installation-defaults.json');

// Call only with the result of probeNasServer. No HTTP endpoint, other NAS,
// arbitrary redirect or unverified certificate may receive legacy credentials.
function migrateVerifiedLocalLogins({vault,config,verified}){
 if(config.serverUrl!==defaults.serverUrl||config.tlsPin!==defaults.tlsPin||
    verified?.origin!==defaults.serverUrl||verified.product!=='jmh95200-workspace-stable'||verified.serverType!=='nas')return{migrated:0,skipped:true};
 return vault.migrateFrom(defaults.legacyServerUrl);
}
module.exports={migrateVerifiedLocalLogins};
