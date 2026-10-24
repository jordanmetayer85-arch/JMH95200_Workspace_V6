# Allège une télé Android TV / Google TV via ADB (débogage réseau).
# Tout est réversible : les applis sont désactivées, pas désinstallées.

$ErrorActionPreference = 'Continue'
$Dossier   = $PSScriptRoot
$Liste     = Join-Path $Dossier 'paquets_a_desactiver.txt'
$Journal   = Join-Path $Dossier 'desactives.log'
$Animations = 'window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'

# Paquets à ne jamais désactiver : la télé deviendrait inutilisable.
$Proteges = @(
    'com.tcl.suspension',            # menu Sources/Entrées (HDMI)
    'com.tcl.tv', 'com.tcl.tvinput', # TV et entrées HDMI/antenne
    'com.tcl.ttvs',                  # mises à jour système
    'com.tcl.providers.config', 'com.tcl.initsetup',  # Wi-Fi
    'com.tcl.tcl_bt_rcu_service', 'com.tcl.autopair', 'com.google.android.tv.remote.service',  # télécommande
    'com.google.android.gms', 'com.google.android.gsf', 'com.android.vending',
    'com.android.location.fused',    # boucle de redémarrage sinon
    'com.google.android.tvlauncher', 'com.google.android.apps.tv.launcherx'  # écran d'accueil
)

function Trouver-Adb {
    $local = Join-Path $Dossier 'platform-tools\adb.exe'
    if (Test-Path $local) { return $local }
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    Write-Host "adb introuvable. Téléchargez 'SDK Platform-Tools for Windows' :" -ForegroundColor Red
    Write-Host "  https://developer.android.com/tools/releases/platform-tools"
    Write-Host "et dézippez le dossier 'platform-tools' à côté de ce script."
    Read-Host 'Entrée pour quitter'; exit 1
}
$Adb = Trouver-Adb

function Shell([string]$commande) { & $Adb shell $commande 2>&1 }

function Connecter {
    $ip = Read-Host "Adresse IP de la télé (Paramètres > Réseau, ex. 192.168.1.42)"
    & $Adb connect "$($ip):5555"
    Write-Host "Si la télé affiche « Autoriser le débogage USB ? », cochez « Toujours » puis OK." -ForegroundColor Yellow
    Read-Host 'Entrée une fois accepté'
    & $Adb devices
}

function Lister {
    Write-Host "`nApplis installées hors système de base (candidates à désactiver) :" -ForegroundColor Cyan
    Shell 'pm list packages' | ForEach-Object { $_ -replace '^package:', '' } |
        Where-Object { $_ -notmatch '^(android|com\.android\.(systemui|settings|providers)|com\.google\.android\.(gms|gsf|tvlauncher|apps\.tv\.launcherx))' } |
        Sort-Object | ForEach-Object { "  $_" }
    Write-Host "`nCopiez dans paquets_a_desactiver.txt celles que vous n'utilisez pas."
}

function Desactiver {
    $installes = Shell 'pm list packages -e' | ForEach-Object { $_ -replace '^package:', '' }
    $cibles = Get-Content $Liste | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') } |
        ForEach-Object { ($_ -split '\s+')[0] }
    foreach ($p in $cibles) {
        if ($Proteges -contains $p -or $p -match 'inputmethod') { Write-Host "  PROTÉGÉ $p (ignoré)" -ForegroundColor Yellow; continue }
        if ($installes -notcontains $p) { Write-Host "  - $p (absent ou déjà désactivé)"; continue }
        $r = Shell "pm disable-user --user 0 $p"
        if ($r -match 'disabled') { Add-Content $Journal $p; Write-Host "  OK $p" -ForegroundColor Green }
        else { Write-Host "  ÉCHEC $p : $r" -ForegroundColor Red }
    }
}

function Accelerer {
    foreach ($a in $Animations) { Shell "settings put global $a 0.5" | Out-Null }
    Write-Host "Animations réduites à 0.5x (la télé paraît nettement plus réactive)." -ForegroundColor Green
}

function Restaurer {
    if (Test-Path $Journal) {
        Get-Content $Journal | Sort-Object -Unique | ForEach-Object {
            Shell "pm enable $_" | Out-Null; Write-Host "  réactivé $_"
        }
        Remove-Item $Journal
    } else { Write-Host 'Aucune appli désactivée par ce script.' }
    foreach ($a in $Animations) { Shell "settings put global $a 1" | Out-Null }
    Write-Host 'Animations remises à 1x. Redémarrez la télé.' -ForegroundColor Green
}

while ($true) {
    Write-Host "`n=== Allègement télé Android ===" -ForegroundColor Cyan
    Write-Host '1. Connecter la télé'
    Write-Host '2. Lister les applis installées'
    Write-Host '3. Désactiver les applis de la liste + accélérer les animations'
    Write-Host '4. Restaurer (tout réactiver)'
    Write-Host '5. Redémarrer la télé'
    Write-Host 'Q. Quitter'
    switch ((Read-Host 'Choix').ToUpper()) {
        '1' { Connecter }
        '2' { Lister }
        '3' { Desactiver; Accelerer; Write-Host 'Terminé. Redémarrez la télé (option 5).' }
        '4' { Restaurer }
        '5' { & $Adb reboot }
        'Q' { & $Adb disconnect | Out-Null; exit }
    }
}
