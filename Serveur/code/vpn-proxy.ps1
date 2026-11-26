param(
  [ValidateSet('Enable','Disable','Status','Credentials')][string]$Action='Status'
)
$ErrorActionPreference='Stop'
$vpnRegistryPath='Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$vpnNames=@('ProxyEnable','ProxyServer','ProxyOverride','AutoConfigURL')
$vpnRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'JMH95200\vpn-proxy'
$vpnStatePath=Join-Path $vpnRoot 'state.json'
$vpnCredentialPath=Join-Path $vpnRoot 'proxy-credential.json'
$vpnProfilePath=Join-Path $PSScriptRoot 'vpn-profile.json'
$vpnHost='192.168.1.27';$vpnPort=8888;$vpnBypass='<local>;localhost;127.0.0.1;192.168.1.*;[::1]'
if(Test-Path -LiteralPath $vpnProfilePath){
 $profile=Get-Content -LiteralPath $vpnProfilePath -Raw|ConvertFrom-Json
 if($profile.host -notmatch '^[a-zA-Z0-9.:-]+$' -or [int]$profile.port -lt 1 -or [int]$profile.port -gt 65535){throw 'Configuration proxy invalide.'}
 $vpnHost=[string]$profile.host;$vpnPort=[int]$profile.port
 if($profile.bypass -match '[\r\n"''\\]'){throw 'Exclusions proxy invalides.'}
 if($profile.bypass){$vpnBypass=[string]$profile.bypass}
}
$vpnEndpoint=if($vpnHost.Contains(':')){'['+$vpnHost+']:'+$vpnPort}else{$vpnHost+':'+$vpnPort}
$vpnProxy='http://'+$vpnEndpoint
$vpnExpected='http='+$vpnEndpoint+';https='+$vpnEndpoint
$vpnApplied=[ordered]@{
  ProxyEnable=[ordered]@{Exists=$true;Kind='DWord';Value=1}
  ProxyServer=[ordered]@{Exists=$true;Kind='String';Value=$vpnExpected}
  ProxyOverride=[ordered]@{Exists=$true;Kind='String';Value=$vpnBypass}
  AutoConfigURL=[ordered]@{Exists=$false;Kind=$null;Value=$null}
}

function Assert-VpnStatePath([string]$Path) {
  $base=[IO.Path]::GetFullPath($vpnRoot).TrimEnd('\')+'\'
  $full=[IO.Path]::GetFullPath($Path)
  if(!$full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Chemin de sauvegarde hors du dossier VPN.'}
  $directory=[IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($full))
  while($null -ne $directory) {
    if($directory.Exists -and (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'Dossier de sauvegarde redirigé. Opération arrêtée.'}
    $directory=$directory.Parent
  }
  if((Test-Path -LiteralPath $full) -and (((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'Fichier de sauvegarde redirigé.'}
  return $full
}
function Write-VpnJson([string]$Path,$Data,[switch]$NewOnly) {
  $safe=Assert-VpnStatePath $Path
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($safe)) | Out-Null
  $json=$Data|ConvertTo-Json -Depth 8
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes($json)
  if($NewOnly) {
    $stream=[IO.File]::Open($safe,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
  } else {
    $temp=Assert-VpnStatePath ($safe+'.'+[Guid]::NewGuid().ToString('N')+'.tmp')
    [IO.File]::WriteAllBytes($temp,$bytes)
    if([IO.File]::Exists($safe)){[IO.File]::Replace($temp,$safe,$safe+'.previous')}
    else{[IO.File]::Move($temp,$safe)}
  }
}
function Read-VpnJson([string]$Path) {
  $safe=Assert-VpnStatePath $Path
  if(!(Test-Path -LiteralPath $safe)){return $null}
  if((Get-Item -LiteralPath $safe).Length -gt 1048576){throw 'Sauvegarde VPN trop volumineuse.'}
  return ([IO.File]::ReadAllText($safe)|ConvertFrom-Json)
}
function Get-VpnValues {
  $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($vpnRegistryPath,$false)
  if($null -eq $key){throw 'Paramètres proxy Windows introuvables.'}
  try {
    $values=[ordered]@{}
    foreach($name in $vpnNames) {
      $exists=$key.GetValueNames() -contains $name
      $kind=$null; $value=$null
      if($exists) {
        $kind=$key.GetValueKind($name).ToString()
        if($kind -notin @('DWord','String','ExpandString')){throw "Type de réglage proxy inattendu : $name"}
        $value=$key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      }
      $values[$name]=[ordered]@{Exists=$exists;Kind=$kind;Value=$value}
    }
    return $values
  }finally{$key.Dispose()}
}
function Set-VpnValues($Values) {
  $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($vpnRegistryPath,$true)
  if($null -eq $key){throw 'Paramètres proxy Windows non modifiables.'}
  try {
    foreach($name in $vpnNames) {
      $record=$Values.$name
      if($null -eq $record -or $null -eq $record.Exists){throw 'Sauvegarde de paramètres proxy invalide.'}
      if(!$record.Exists){$key.DeleteValue($name,$false);continue}
      if($record.Kind -notin @('DWord','String','ExpandString')){throw 'Type de sauvegarde proxy invalide.'}
      $kind=[Enum]::Parse([Microsoft.Win32.RegistryValueKind],[string]$record.Kind)
      if($record.Kind -eq 'DWord'){$value=[int]$record.Value}else{$value=[string]$record.Value}
      $key.SetValue($name,$value,$kind)
    }
  }finally{$key.Dispose()}
  if(!('JmhVpn.Wininet' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace JmhVpn {
 public static class Wininet {
  [DllImport("wininet.dll", SetLastError=true)]
  public static extern bool InternetSetOption(IntPtr handle, int option, IntPtr buffer, int size);
 }
}
'@
  }
  [JmhVpn.Wininet]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0) | Out-Null
  [JmhVpn.Wininet]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0) | Out-Null
}
function Get-VpnCredential {
  $record=Read-VpnJson $vpnCredentialPath
  if($null -eq $record -or $record.User -ne 'jmh-vpn' -or !$record.ProtectedPassword) {
    throw 'Identifiants du proxy non configurés. Exécutez une fois Configurer-VPN-JMH.cmd avec le mot de passe du proxy local fourni lors du déploiement.'
  }
  $secure=ConvertTo-SecureString -String $record.ProtectedPassword
  return [Management.Automation.PSCredential]::new('jmh-vpn',$secure)
}
function Get-VpnPublicIp([bool]$ThroughProxy,$Credential) {
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $request=[Net.HttpWebRequest]::Create('https://api.ipify.org?format=json')
  $request.Method='GET'; $request.Timeout=10000; $request.ReadWriteTimeout=10000; $request.AllowAutoRedirect=$false
  if($ThroughProxy) {
    $proxy=[Net.WebProxy]::new($vpnProxy,$false)
    if($null -ne $Credential){$proxy.Credentials=$Credential.GetNetworkCredential()}
    $request.Proxy=$proxy
  } else {$request.Proxy=$null}
  $response=$request.GetResponse()
  try {
    if([int]$response.StatusCode -ne 200){throw 'Réponse de vérification IP inattendue.'}
    $reader=[IO.StreamReader]::new($response.GetResponseStream())
    try {
      $buffer=New-Object char[] 8193
      $count=$reader.ReadBlock($buffer,0,$buffer.Length)
      if($count -ge 8193){throw 'Réponse IP trop volumineuse.'}
      $text=[string]::new($buffer,0,$count)
    }finally{$reader.Dispose()}
    $data=$text|ConvertFrom-Json
    $address=$null
    if(![Net.IPAddress]::TryParse([string]$data.ip,[ref]$address)){throw 'Adresse IP de vérification invalide.'}
    return $address.ToString()
  }finally{$response.Dispose()}
}
function Invoke-VpnAction {
  if($Action -eq 'Credentials') {
    $password=Read-Host 'Mot de passe du proxy local jmh-vpn (pas le mot de passe Proton ou TrueNAS)' -AsSecureString
    if($password.Length -lt 8){throw 'Le mot de passe du proxy local doit contenir au moins huit caractères.'}
    $protected=ConvertFrom-SecureString -SecureString $password
    Write-VpnJson $vpnCredentialPath ([ordered]@{User='jmh-vpn';ProtectedPassword=$protected;Protection='Windows DPAPI CurrentUser'})
    Write-Host 'Identifiants du proxy enregistrés pour ce compte Windows. Aucun proxy activé.'
    return
  }
  $state=Read-VpnJson $vpnStatePath
  if($Action -eq 'Status') {
    if($null -ne $state -and $state.Active){Write-Host 'Proxy JMH activé précédemment. Le tunnel NAS n''a pas été vérifié par cette commande.'}
    else{Write-Host 'Aucun proxy JMH actif enregistré pour ce compte Windows.'}
    return
  }
  if($Action -eq 'Disable') {
    if($null -eq $state -or !$state.Active){Write-Host 'Aucune configuration proxy JMH à restaurer. Aucun réglage Windows changé.';return}
    $snapshot=Read-VpnJson $state.SnapshotFile
    if($null -eq $snapshot -or $snapshot.RegistryPath -ne $vpnRegistryPath){throw 'Sauvegarde d''origine absente ou invalide. Aucun réglage Windows changé.'}
    Set-VpnValues $snapshot.Values
    $state.Active=$false; $state.RestoredAt=[DateTime]::UtcNow.ToString('o')
    Write-VpnJson $vpnStatePath $state
    Write-Host 'Réglages proxy d''origine restaurés. Vous pouvez arrêter l''application VPN du NAS si aucun autre PC ne l''utilise.'
    return
  }
  if($null -ne $state -and $state.Active){
    $actual=Get-VpnValues
    if([int]$actual.ProxyEnable.Value -eq 1 -and [string]$actual.ProxyServer.Value -eq [string]$vpnApplied.ProxyServer.Value){Write-Host 'Le proxy JMH est déjà activé. La sauvegarde d''origine est conservée.';return}
    throw "Les réglages proxy Windows ont changé depuis l'activation JMH. Désactive JMH pour restaurer sa sauvegarde, puis réactive-le. Aucun réglage remplacé."
  }
  $credential=Get-VpnCredential
  Write-Host 'Vérification de la sortie Internet directe…'
  $directIp=Get-VpnPublicIp $false $null
  Write-Host 'Vérification HTTPS via le proxy du NAS…'
  $vpnIp=Get-VpnPublicIp $true $credential
  if($vpnIp -eq $directIp){throw 'Le proxy présente la même IP que la connexion directe. Aucun réglage changé ; le tunnel doit être vérifié sur le NAS.'}
  $original=Get-VpnValues
  $snapshotPath=Join-Path $vpnRoot ('original-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N')+'.json')
  Write-VpnJson $snapshotPath ([ordered]@{RegistryPath=$vpnRegistryPath;CapturedAt=[DateTime]::UtcNow.ToString('o');Values=$original}) -NewOnly
  $newState=[ordered]@{Active=$true;SnapshotFile=$snapshotPath;EnabledAt=[DateTime]::UtcNow.ToString('o');RestoredAt=$null;Proxy=$vpnProxy;LastVerifiedProxyIp=$vpnIp}
  Write-VpnJson $vpnStatePath $newState
  try {Set-VpnValues $vpnApplied}
  catch {
    $activationError=$_
    Set-VpnValues $original
    $newState.Active=$false; $newState.RestoredAt=[DateTime]::UtcNow.ToString('o'); Write-VpnJson $vpnStatePath $newState
    throw $activationError
  }
  Write-Host "Proxy du NAS activé pour les applications qui suivent le proxy Windows. IP du proxy vérifiée : $vpnIp"
  Write-Host 'Actualisez les onglets ou relancez Opera pour les nouvelles connexions. Le VPN intégré Opera peut modifier la sortie affichée ; désactivez-le pour tester Proton.'
}

# When dot-sourced for isolated tests, only definitions are loaded: no registry,
# credentials, network requests or filesystem mutations are performed.
if($MyInvocation.InvocationName -ne '.') {
  $vpnMutex=[Threading.Mutex]::new($false,'Local\JMH95200_VpnProxy')
  $owned=$false
  try {
    $owned=$vpnMutex.WaitOne(0)
    if(!$owned){throw 'Une autre opération VPN JMH est déjà en cours.'}
    Invoke-VpnAction
  }finally {
    if($owned){$vpnMutex.ReleaseMutex()}
    $vpnMutex.Dispose()
  }
}
