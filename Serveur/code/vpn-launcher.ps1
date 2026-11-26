param([ValidateSet('Enable','Disable','Status','Verify')][string]$Operation='Status')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'vpn-proxy.ps1')
$Action=if($Operation -eq 'Verify'){'Status'}else{$Operation}
$launcherMutex=[Threading.Mutex]::new($false,'Local\JMH95200_VpnProxy')
$owned=$false
try {
 $owned=$launcherMutex.WaitOne(0)
 if(!$owned){throw 'Une autre opération VPN est déjà en cours.'}
 if($Operation -eq 'Enable'){
  $inputText=[Console]::In.ReadToEnd()
  if($inputText.Length -gt 4096){throw 'Identifiants proxy invalides.'}
  $credential=$inputText|ConvertFrom-Json
  if($credential.username -ne 'jmh-vpn' -or !$credential.password -or $credential.password.Length -gt 256){throw 'Identifiants proxy invalides.'}
  $secure=ConvertTo-SecureString -String $credential.password -AsPlainText -Force
  Write-VpnJson $vpnCredentialPath ([ordered]@{User='jmh-vpn';ProtectedPassword=(ConvertFrom-SecureString $secure);Protection='Windows DPAPI CurrentUser'})
 }
 if($Operation -notin @('Status','Verify')){Invoke-VpnAction|Out-Null}
 $state=Read-VpnJson $vpnStatePath
 $values=Get-VpnValues
 $configured=([int]$values.ProxyEnable.Value -eq 1 -and [string]$values.ProxyServer.Value -eq $vpnExpected)
 $verified=$false; $verifiedIp=$null; $directIp=$null; $proxyIp=$null; $proxyError=$null
 if($Operation -eq 'Verify'){
  $credential=$null
  $inputText=[Console]::In.ReadToEnd()
  if($inputText.Length -gt 4096){throw 'Identifiants proxy invalides.'}
  if($inputText){$provided=$inputText|ConvertFrom-Json;if($provided.authentication -and $provided.username -eq 'jmh-vpn' -and $provided.password){$credential=[Management.Automation.PSCredential]::new('jmh-vpn',(ConvertTo-SecureString -String $provided.password -AsPlainText -Force))}}
  if($configured){$proxyIp=Get-VpnPublicIp $true $credential;$verifiedIp=$proxyIp;$verified=$true;try{$directIp=Get-VpnPublicIp $false $null}catch{}}
  else{$directIp=Get-VpnPublicIp $false $null;$verifiedIp=$directIp;$verified=$true;try{$proxyIp=Get-VpnPublicIp $true $credential}catch{$proxyError='La sortie du NAS ne répond pas ; ce PC utilise sa connexion habituelle.'}}
 }

 @{ok=$true;verified=$verified;verifiedIp=$verifiedIp;directIp=$directIp;proxyIp=$proxyIp;proxyError=$proxyError;active=$configured;managed=($state -and $state.Active);configured=$configured;publicIp=$state.LastVerifiedProxyIp}|ConvertTo-Json -Compress
}catch{@{ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1}finally{if($owned){$launcherMutex.ReleaseMutex()};$launcherMutex.Dispose()}
