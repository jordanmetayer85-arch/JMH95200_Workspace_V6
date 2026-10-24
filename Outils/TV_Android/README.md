# Allègement télé Android TV / Google TV

Rend une télé Android plus rapide en **désactivant** les applis inutiles
(préinstallées, publicités, télémétrie) et en réduisant les animations.
Rien n'est désinstallé : l'option **4. Restaurer** remet tout comme avant.

## Télés compatibles

La liste fournie est réglée pour les **TCL Android TV**, à partir des listes testées par
d'autres propriétaires de TCL ([cleanyourtv](https://github.com/Gathin23/cleanyourtv/tree/main/examples)).
Le script refuse de désactiver les paquets vitaux de TCL (menu Sources/HDMI `com.tcl.suspension`,
entrées `com.tcl.tv`/`com.tcl.tvinput`, Wi-Fi, télécommande, mises à jour `com.tcl.ttvs`…).

- **Oui** : Android TV et Google TV (TCL, Xiaomi, Hisense, Sony, Philips, Nvidia Shield, Chromecast avec Google TV…).
- **Non** : Samsung (Tizen), LG (webOS), Amazon Fire TV (fonctionne en partie mais non testé ici).

## 1. Préparer la télé (une seule fois)

1. Paramètres → Système → À propos → appuyez **7 fois** sur « Version » (ou « Build ») jusqu'au message « Vous êtes développeur ».
2. Retour → Options pour les développeurs → activez **Débogage USB** (et **Débogage réseau / ADB sur réseau** s'il existe).
3. Notez l'**adresse IP** de la télé : Paramètres → Réseau.
4. La télé et le PC doivent être sur la **même box / même Wi-Fi**.

## 2. Préparer le PC Windows (une seule fois)

1. Téléchargez « SDK Platform-Tools for Windows » : <https://developer.android.com/tools/releases/platform-tools>
2. Dézippez-le **dans ce dossier** pour obtenir `Outils\TV_Android\platform-tools\adb.exe`.

## 3. Utiliser

Double-cliquez sur **`Lancer.bat`**, puis :

1. **Connecter** → tapez l'IP, acceptez le message sur la télé (cochez « Toujours »).
2. **Lister** → repérez les applis du fabricant que vous n'utilisez pas, ajoutez-les à `paquets_a_desactiver.txt`.
3. **Désactiver + accélérer**.
4. **Redémarrer** la télé (option 5).

Si quelque chose ne va pas : option **4. Restaurer**, puis redémarrer.

## Précautions

- Après la désactivation et le redémarrage, testez : changement de source HDMI, télécommande, Wi-Fi, son, Netflix/YouTube. En cas de souci : option 4.

- Ne désactivez jamais le lanceur (`com.google.android.tvlauncher`, `com.google.android.apps.tv.launcherx`) ni `com.google.android.gms` : plus d'écran d'accueil / plus de Play Store.
- Le journal `desactives.log` mémorise ce que le script a désactivé ; ne le supprimez pas si vous voulez pouvoir restaurer.
- Une mise à jour de la télé peut réactiver certaines applis : relancez simplement l'option 3.
