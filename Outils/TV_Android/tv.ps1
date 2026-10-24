# Allège une télé Android TV / Google TV via ADB (débogage réseau).
# Tout est réversible : les applis sont désactivées, pas désinstallées.

$ErrorActionPreference = 'Continue'
$Dossier   = $PSScriptRoot
$Liste     = Join-Path $Dossier 'paquets_a_desactiver.txt'
$Journal   = Join-Path $Dossier 'desactives.log'
$IpParDefaut = '192.168.1.46'
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
    Write-Host "Téléchargement de l'outil de connexion Google (une seule fois)..." -ForegroundColor Cyan
    $zip = Join-Path $Dossier 'platform-tools.zip'
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive $zip -DestinationPath $Dossier -Force
        Remove-Item $zip
    } catch { Write-Host "Échec du téléchargement : $_" -ForegroundColor Red }
    if (Test-Path $local) { return $local }
    Write-Host "Vérifiez la connexion Internet du PC puis relancez." -ForegroundColor Red
    Read-Host 'Entrée pour quitter'; exit 1
}
$Adb = Trouver-Adb

function Shell([string]$commande) { & $Adb shell $commande 2>&1 }

function Connecter {
    $ip = Read-Host "Adresse IP de la télé [Entrée = $IpParDefaut]"
    if (-not $ip) { $ip = $IpParDefaut }
    & $Adb connect "$($ip):5555" | Out-Null
    Write-Host "Regardez la télé : acceptez le message « Autoriser le débogage ? » (cochez « Toujours », puis OK)." -ForegroundColor Yellow
    for ($i = 0; $i -lt 60; $i++) {
        if ((& $Adb devices) -match "$([regex]::Escape($ip)):5555\s+device") { Write-Host 'Télé connectée.' -ForegroundColor Green; return $true }
        Start-Sleep 2; & $Adb connect "$($ip):5555" | Out-Null
    }
    Write-Host "Impossible de joindre la télé. Vérifiez qu'elle est allumée, sur le même Wi-Fi, et que le débogage est activé." -ForegroundColor Red
    return $false
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

function Installer-Lanceur {
    $pkg = 'com.spocky.projengmenu'   # Projectivy Launcher (Play Store, gratuit)
    if (-not ((Shell "pm list packages $pkg") -match "package:$pkg\s*$")) {
        Shell "am start -a android.intent.action.VIEW -d market://details?id=$pkg" | Out-Null
        Write-Host "Sur la télé, le Play Store s'ouvre : appuyez sur « Installer » avec la télécommande." -ForegroundColor Yellow
        for ($i = 0; $i -lt 100 -and -not ((Shell "pm list packages $pkg") -match "package:$pkg\s*$"); $i++) { Start-Sleep 3 }
        if (-not ((Shell "pm list packages $pkg") -match "package:$pkg\s*$")) { Write-Host "Projectivy n'est pas installé, on arrête là." -ForegroundColor Red; return }
    }
    Write-Host 'Projectivy est installé.' -ForegroundColor Green
    # Écran d'accueil par défaut
    $accueil = (Shell "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME $pkg") |
        ForEach-Object { "$_".Trim() } | Where-Object { $_ -match '^\S+/\S+$' } | Select-Object -Last 1
    if ($accueil) { Shell "cmd package set-home-activity $accueil" | Out-Null }
    # Service d'accessibilité : fait apparaître Projectivy quand on appuie sur le bouton Maison
    $service = [regex]::Matches((Shell "dumpsys package $pkg") -join "`n", "$pkg/[\w.]*Accessibility[\w.]*") |
        Select-Object -First 1 -ExpandProperty Value
    if ($service) {
        $actifs = "$(Shell 'settings get secure enabled_accessibility_services')".Trim()
        if ($actifs -eq 'null' -or -not $actifs) { $actifs = $service }
        elseif ($actifs -notmatch [regex]::Escape($service)) { $actifs = "$($actifs):$service" }
        Shell "settings put secure enabled_accessibility_services $actifs" | Out-Null
        Shell 'settings put secure accessibility_enabled 1' | Out-Null
        Write-Host 'Bouton Maison redirigé vers Projectivy.' -ForegroundColor Green
    } else {
        Write-Host "Dans Projectivy : Paramètres > Général > activez « Remplacer le lanceur actuel »." -ForegroundColor Yellow
    }
    Shell 'input keyevent KEYCODE_HOME' | Out-Null
    Write-Host "Terminé. Pour revenir à l'ancien écran : désinstallez Projectivy depuis le Play Store." -ForegroundColor Green
}

while ($true) {
    Write-Host "`n=== Allègement télé Android ===" -ForegroundColor Cyan
    Write-Host 'Entrée. TOUT FAIRE (conseillé) : connecter, alléger, redémarrer' -ForegroundColor Green
    Write-Host '1. Connecter la télé'
    Write-Host '2. Lister les applis installées'
    Write-Host '3. Désactiver les applis de la liste + accélérer les animations'
    Write-Host '4. Restaurer (tout réactiver)'
    Write-Host '5. Redémarrer la télé'
    Write-Host '6. Nouvel écran d''accueil épuré (Projectivy, comme dans la vidéo)'
    Write-Host 'Q. Quitter'
    switch ((Read-Host 'Choix').ToUpper()) {
        ''  { if (Connecter) { Desactiver; Accelerer; Write-Host 'Terminé ! La télé redémarre.' -ForegroundColor Green; & $Adb reboot } }
        '1' { Connecter | Out-Null }
        '2' { Lister }
        '3' { Desactiver; Accelerer; Write-Host 'Terminé. Redémarrez la télé (option 5).' }
        '4' { Restaurer }
        '5' { & $Adb reboot }
        '6' { if (Connecter) { Installer-Lanceur } }
        'Q' { & $Adb disconnect | Out-Null; exit }
    }
}
