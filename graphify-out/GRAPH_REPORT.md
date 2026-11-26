# Graph Report - JMH95200_Workspace_V6  (2026-11-26)

## Corpus Check
- 154 files · ~103,746 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 63 file(s) not represented in the graph (top: .css 44, (none) 12, .webmanifest 3)

## Summary
- 1791 nodes · 3200 edges · 134 communities (97 shown, 37 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 400 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f640e385`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- docker-publish.yml
- authority-server.js
- tv.ps1
- Allègement télé Android TV / Google TV
- ref_fs
- app.cjs
- INSTALLATION_SIMPLE.md
- README.md
- code/server.js
- readJson
- code/public/music.js
- authority-bootstrap.js
- createAuthority
- app/windows-audio.cs
- createConnectorUpdater
- code/public/refonte.js
- app/public/owner-qr.js
- createMusicRouter
- code/package.json
- code/electron-main.js
- m/app.js
- ref_node_crypto
- code/public/cinema.js
- code/desktop-updater.js
- code/public/app.js
- atelier-update/public/app.js
- code/atelier-service.js
- code/desktop-connection.js
- Blocks
- code/public/private-vault.js
- code/authority-bootstrap.js
- readJson
- gallery-server.js
- arcade-pocket/app.mjs
- code/public/authority.js
- cinema-library-storage.js
- createPosterService
- design74.js
- code/public/workspace-core.js
- ref_node_child_process
- api
- code/public/navigation.js
- ref_node_fs
- music-covers.js
- finitions.js
- app/remote-access-server.js
- code/music-library-storage.js
- createNasBridge
- ref_node_path
- app/catalog-response.js
- code/public/gallery.js
- code/desktop-health.js
- enterApp
- FileStore
- atelier-update.js
- createAtelierClient
- getStorageRoot
- loadStorage
- design75.js
- NavigationHistory
- code/public/user-wizard.js
- code/public/vault-crypto.js
- code/password-onboarding.js
- code/public/atelier/app.js
- attachments.js
- code/public/tools.js
- secure-transport.js
- nas-bridge.cjs
- maintenance-artwork-manifest.cjs
- code/public/mini-games.js
- code/public/moderation-appeals.js
- code/vpn-proxy.ps1
- installation-profile.js
- createPlaybackCache
- createPrivateVault
- code/storage-search.js
- createCredentialVault
- atelier-update/public/dictation.js
- public/images.js
- code/authority-transfer.js
- code/public/atelier/dictation.js
- atelier/images.js
- egaliseur71.js
- code/public/local-accounts.js
- code/public/studio.js
- upload-limits.js
- https-only.js
- code/connection-setup.js
- createLocalLoginVault
- code/nas-remap-catalogues.cjs
- atelier/desktop-approval.js
- audit72.js
- code/public/personal-space.js
- code/nas-server.cjs
- code/public/atelier-page.js
- cinema-player.js
- search
- code/public/password-onboarding.js
- code/storage-usage.js
- public/desktop-approval.js
- createMusicDurationIndex
- ajustements.js
- code/public/home.js
- code/public/settings-tools.js
- solitaire71.js
- atelier-chat-input.js
- code/public/library-search.js
- code/public/vpn-credentials.js
- cleanupUpdateTemporary
- manifest.json
- code/public/dictation.js
- galerie71.js
- wire
- code/public/vault-stream-worker.js
- code/public/vpn-verification.js
- createWindowsDictation
- code/public/sw.js

## God Nodes (most connected - your core abstractions)
1. `createAuthority()` - 41 edges
2. `wire()` - 31 edges
3. `createPosterService()` - 23 edges
4. `createCinemaRouter()` - 23 edges
5. `createMusicRouter()` - 21 edges
6. `api()` - 20 edges
7. `render()` - 20 edges
8. `render()` - 19 edges
9. `wire()` - 17 edges
10. `createMusicCoverService()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `newer()` --indirect_call--> `build()`  [INFERRED]
  Serveur/code/desktop-updater.js → Serveur/code/storage-search.js
- `inspect()` --indirect_call--> `build()`  [INFERRED]
  Serveur/code/desktop-updater.js → Serveur/code/storage-search.js
- `navigateWorkspace()` --indirect_call--> `loadStorage()`  [INFERRED]
  Serveur/code/public/workspace-core.js → Serveur/code/public/app.js
- `bindWorkspaceControls()` --indirect_call--> `renderEvents()`  [INFERRED]
  Serveur/code/public/workspace-core.js → Serveur/code/public/app.js
- `enterApp()` --indirect_call--> `applyAppSettings()`  [INFERRED]
  Serveur/code/public/app.js → Serveur/code/public/workspace-core.js

## Import Cycles
- None detected.

## Communities (134 total, 37 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.06
Nodes (37): better-sqlite3, cors, dotenv, helmet, jsonwebtoken, morgan, dependencies, bcryptjs@^2.4.3 (+29 more)

### Community 1 - "docker-publish.yml"
Cohesion: 0.09
Nodes (21): runs-on, steps, jobs, build-and-push, name, on, push, workflow_dispatch (+13 more)

### Community 2 - "authority-server.js"
Cohesion: 0.15
Nodes (16): base32(), createJournal(), createSecurity(), crypto, decode32(), equal(), fs, hash() (+8 more)

### Community 3 - "tv.ps1"
Cohesion: 0.39
Nodes (5): Accelerer(), Desactiver(), Lister(), Restaurer(), Shell()

### Community 4 - "Allègement télé Android TV / Google TV"
Cohesion: 0.29
Nodes (6): 1. Préparer la télé (une seule fois), 2. Préparer le PC Windows (une seule fois), 3. Utiliser, Allègement télé Android TV / Google TV, Précautions, Télés compatibles

### Community 5 - "ref_fs"
Cohesion: 0.07
Nodes (18): crypto, fs, path, crypto, fs, crypto, express, fs (+10 more)

### Community 6 - "app.cjs"
Cohesion: 0.06
Nodes (54): chat(), connections(), crypto, DATA, desktopAgent, desktopChat(), files, fs (+46 more)

### Community 9 - "code/server.js"
Cohesion: 0.03
Nodes (49): ANNOUNCEMENTS_FILE, app, APP_SETTINGS_FILE, AUDIT_FILE, bcrypt, browserTranscoder, canViewMessage(), cinemaRouter (+41 more)

### Community 10 - "readJson"
Cohesion: 0.24
Nodes (11): atelier, authority, backfillUserPermissions(), createNotification(), normalizePermissions(), notifyUsers(), passwordFlow, readJson() (+3 more)

### Community 11 - "code/public/music.js"
Cohesion: 0.11
Nodes (53): addedTime(), addToPlaylist(), albumButton(), albumSection(), applyEqualizer(), art(), captureView(), chooseFiles() (+45 more)

### Community 12 - "authority-bootstrap.js"
Cohesion: 0.22
Nodes (7): bcrypt, bootstrap(), crypto, fs, path, atomic(), ensureAuthorityKeys()

### Community 13 - "createAuthority"
Cohesion: 0.12
Nodes (25): createAuthority(), blocked(), catalog(), challengeUser(), gateMedia(), guard(), isVerified(), moderation() (+17 more)

### Community 14 - "app/windows-audio.cs"
Cohesion: 0.11
Nodes (7): JmhWindows, Controls, Enumerator, IDevice, IDevices, IVolume, PowerStatus

### Community 15 - "createConnectorUpdater"
Cohesion: 0.80
Nodes (5): createConnectorUpdater(), local(), plain(), safePath(), update()

### Community 16 - "code/public/refonte.js"
Cohesion: 0.09
Nodes (36): action(), activity(), applyEnergy(), closeMenu(), heartbeat(), localFiles(), onNavigate(), permissions() (+28 more)

### Community 17 - "app/public/owner-qr.js"
Cohesion: 0.09
Nodes (3): QRCode(), render(), require()

### Community 18 - "createMusicRouter"
Cohesion: 0.10
Nodes (35): AUDIO_TYPES, createMusicRouter(), absoluteExisting(), availableFile(), catalog(), concurrentMap(), deriveMetadata(), findTrack() (+27 more)

### Community 20 - "code/package.json"
Cohesion: 0.08
Nodes (34): express-session, multer, socket.io, ws, buildMemoryGroups(), crypto, createGalleryRouter(), absolute() (+26 more)

### Community 21 - "code/electron-main.js"
Cohesion: 0.09
Nodes (35): { app, BrowserWindow, shell, dialog, ipcMain, globalShortcut, safeStorage, session, net, Menu, clipboard }, atelierClient, checkNetworkFile, clientVpn, configureCertificateTrust(), configuredOrigin(), configuring, connectionConfigPath() (+27 more)

### Community 23 - "m/app.js"
Cohesion: 0.13
Nodes (26): api(), bindPosters(), bindTracks(), cached(), fallbackImage(), filesView(), go(), renderers (+18 more)

### Community 27 - "ref_node_crypto"
Cohesion: 0.18
Nodes (6): crypto, fs, path, crypto, fs, path

### Community 29 - "code/public/cinema.js"
Cohesion: 0.17
Nodes (29): closeDialog(), configurePlayback(), destroy(), detectNative(), editMovie(), favoriteMovie(), importMovies(), init() (+21 more)

### Community 35 - "code/desktop-updater.js"
Cohesion: 0.13
Nodes (24): compareNumbers(), createDesktopUpdater(), attempted(), attemptPath(), configuredOrigin(), context(), download(), executable() (+16 more)

### Community 36 - "code/public/app.js"
Cohesion: 0.09
Nodes (18): ACCESS_PRESETS, allMessages, dropZone, loadRecipients(), loginFeedback, notificationIcon(), PERMISSION_DEFINITIONS, recipientTag() (+10 more)

### Community 37 - "atelier-update/public/app.js"
Cohesion: 0.13
Nodes (20): addFiles(), addMessage(), api(), attachments, dashboard(), extension(), form, historyMessages (+12 more)

### Community 41 - "code/atelier-service.js"
Cohesion: 0.16
Nodes (19): createAtelierRouter(), createImage(), devices(), identity(), inferenceAuth(), limit(), relay(), session() (+11 more)

### Community 42 - "code/desktop-connection.js"
Cohesion: 0.23
Nodes (11): crypto, fs, http, https, normalizeServerUrl(), path, probeNasServer(), readClientConfig() (+3 more)

### Community 44 - "code/public/private-vault.js"
Cohesion: 0.24
Nodes (20): askSupervision(), closePreview(), configured(), download(), formCard(), importFiles(), loadFiles(), lock() (+12 more)

### Community 45 - "code/authority-bootstrap.js"
Cohesion: 0.23
Nodes (9): createModerationAppeals(), addMessage(), notify(), owned(), text(), visible(), crypto, fs (+1 more)

### Community 47 - "readJson"
Cohesion: 0.21
Nodes (12): canAccessStorage(), effectivePermissions(), hasPermission(), normalizeStoragePath(), publicUser(), refreshSession(), requireAdmin(), requireAuth() (+4 more)

### Community 48 - "gallery-server.js"
Cohesion: 0.14
Nodes (12): crypto, fs, path, PHOTO, {spawn}, VIDEO, createDownloadRouter(), crypto (+4 more)

### Community 50 - "arcade-pocket/app.mjs"
Cohesion: 0.21
Nodes (19): cleanup(), definitions, later(), memory(), profile, puzzleGame(), render(), reflex() (+11 more)

### Community 51 - "code/public/authority.js"
Cohesion: 0.26
Nodes (20): button(), copy(), decide(), dialog(), enter(), finishAuth(), header(), inputDialog() (+12 more)

### Community 53 - "cinema-library-storage.js"
Cohesion: 0.19
Nodes (19): categoryFolder(), createFilmUploadRouter(), space(), writable(), createFilmWatcher(), file(), run(), scan() (+11 more)

### Community 54 - "createPosterService"
Cohesion: 0.05
Nodes (64): cleanTitle(), createPosterService(), download(), fetchOne(), file(), findFilmPage(), fromTmdb(), fromWikipedia() (+56 more)

### Community 60 - "design74.js"
Cohesion: 0.19
Nodes (19): applyRights(), arrangeSettings(), buildApplications(), buildCinemaSettings(), posters(), status(), buildFilmDrop(), enqueue() (+11 more)

### Community 61 - "code/public/workspace-core.js"
Cohesion: 0.16
Nodes (19): applyAppSettings(), appSettings, bindWorkspaceControls(), checkUpdatesAfterLogin(), compareUpdateParts(), currentAnnouncements, currentEvents, currentNotifications (+11 more)

### Community 63 - "ref_node_child_process"
Cohesion: 0.18
Nodes (9): fs, path, {spawn}, childProcess, createBrowserTranscoder(), describe(), stream(), fs (+1 more)

### Community 66 - "api"
Cohesion: 0.22
Nodes (19): api(), escapeHtml(), eventAudience(), formatDate(), loadAnnouncements(), loadAudit(), loadDashboard(), loadEventAttendees() (+11 more)

### Community 68 - "code/public/navigation.js"
Cohesion: 0.25
Nodes (14): anchorOf(), apply(), beforeSubview(), capture(), checkSubview(), commitSubview(), ensure(), go() (+6 more)

### Community 70 - "ref_node_fs"
Cohesion: 0.13
Nodes (9): crypto, fs, path, fs, http, os, path, {spawn} (+1 more)

### Community 73 - "music-covers.js"
Cohesion: 0.15
Nodes (26): artistsOf(), cleanTrackTitle(), createMusicCoverService(), fetchOne(), file(), grouping(), needs(), remember() (+18 more)

### Community 74 - "finitions.js"
Cohesion: 0.23
Nodes (11): applyLogin(), buildPanel(), rememberEarly(), renderPanel(), save(), tick(), usePhoto(), wallCss() (+3 more)

### Community 76 - "app/remote-access-server.js"
Cohesion: 0.32
Nodes (6): approvedLink(), createRemoteAccessRouter(), fs, net, path, readState()

### Community 78 - "code/music-library-storage.js"
Cohesion: 0.21
Nodes (11): crypto, fs, migrateMusicDownloads(), path, AUDIO_EXTENSIONS, centralMusicFolder(), copyNewAudio(), createMusicUploadRouter() (+3 more)

### Community 79 - "createNasBridge"
Cohesion: 0.27
Nodes (13): messageEvents(), readJson(), createNasBridge(), connect(), crypt(), equal(), image(), json() (+5 more)

### Community 80 - "ref_node_path"
Cohesion: 0.29
Nodes (3): fs, path, path

### Community 83 - "app/catalog-response.js"
Cohesion: 0.29
Nodes (5): createCatalogResponder(), crypto, gzip, {promisify}, zlib

### Community 89 - "code/public/gallery.js"
Cohesion: 0.32
Nodes (13): close(), fetchPage(), load(), memories(), open(), pagination(), prime(), query() (+5 more)

### Community 92 - "code/desktop-health.js"
Cohesion: 0.20
Nodes (11): createDesktopHealth(), cpu(), diagnostic(), sensors(), snapshot(), fs, os, path (+3 more)

### Community 94 - "enterApp"
Cohesion: 0.23
Nodes (13): applyMyPermissions(), bindCinemaForUser(), boundedDesktopCall(), canUseScreenCapture(), captureScreenImage(), enterApp(), invalidateStorageCache(), openScreenPreview() (+5 more)

### Community 102 - "atelier-update.js"
Cohesion: 0.15
Nodes (9): crypto, {execFile}, fs, http, path, crypto, fs, http (+1 more)

### Community 103 - "createAtelierClient"
Cohesion: 0.67
Nodes (6): createAtelierClient(), command(), identity(), installed(), launch(), local()

### Community 104 - "getStorageRoot"
Cohesion: 0.18
Nodes (12): startNas(), closeServer(), ensureAllUserFolders(), ensureTrashDir(), ensureUserFolder(), fileInfo(), getLocalIps(), getStorageRoot() (+4 more)

### Community 105 - "loadStorage"
Cohesion: 0.23
Nodes (12): cacheStorage(), cancelStorageRequest(), currentStorageRequest(), fileIcon(), formatBytes(), loadStorage(), renderBreadcrumb(), renderStorageItems() (+4 more)

### Community 106 - "design75.js"
Cohesion: 0.35
Nodes (10): applyRights(), attach(), buildSettings(), decorate(), detailsCover(), dock(), refreshEverywhere(), scheduleRetry() (+2 more)

### Community 108 - "code/public/user-wizard.js"
Cohesion: 0.32
Nodes (9): advance(), copy(), credentialFields(), hide(), loadVault(), open(), paintRights(), rights() (+1 more)

### Community 109 - "code/public/vault-crypto.js"
Cohesion: 0.29
Nodes (7): create(), passwordKey(), recoveryRaw(), recoveryText(), resetPassword(), supervise(), unlock()

### Community 112 - "code/password-onboarding.js"
Cohesion: 0.25
Nodes (13): crypto, fs, path, createPasswordFlow(), begin(), challengeUser(), complete(), status() (+5 more)

### Community 113 - "code/public/atelier/app.js"
Cohesion: 0.25
Nodes (5): api(), devices(), status(), tab(), toast()

### Community 114 - "attachments.js"
Cohesion: 0.33
Nodes (9): addFiles(), clear(), extension(), humanSize(), isTextFile(), readDataUrl(), readText(), renderAttachments() (+1 more)

### Community 115 - "code/public/tools.js"
Cohesion: 0.38
Nodes (8): act(), downloads(), health(), message(), onNavigate(), proxyStatus(), showProxyStatus(), vpn()

### Community 116 - "secure-transport.js"
Cohesion: 0.11
Nodes (20): crypto, fs, https, path, crypto, https, normalizePin(), pinnedAgent() (+12 more)

### Community 123 - "nas-bridge.cjs"
Cohesion: 0.20
Nodes (7): crypto, {execFileSync}, fs, http, https, os, path

### Community 124 - "maintenance-artwork-manifest.cjs"
Cohesion: 0.20
Nodes (9): crypto, entries, fs, path, service, stamps, store, tracks (+1 more)

### Community 125 - "code/public/mini-games.js"
Cohesion: 0.36
Nodes (8): act(), card(), draw(), open(), pause(), play(), renderSolitaire(), tick()

### Community 126 - "code/public/moderation-appeals.js"
Cohesion: 0.38
Nodes (8): create(), dialog(), list(), notice(), ownerNotifications(), textarea(), thread(), render()

### Community 127 - "code/vpn-proxy.ps1"
Cohesion: 0.49
Nodes (8): Assert-VpnStatePath(), Get-VpnCredential(), Get-VpnPublicIp(), Get-VpnValues(), Invoke-VpnAction(), Read-VpnJson(), Set-VpnValues(), Write-VpnJson()

### Community 134 - "installation-profile.js"
Cohesion: 0.15
Nodes (11): createClientVpn(), handle(), status(), net, normalizeVpn(), proxyHost(), directPublicIp(), http (+3 more)

### Community 135 - "createPlaybackCache"
Cohesion: 0.23
Nodes (14): allowedQuality, createPlaybackCache(), identity(), load(), prepare(), quota(), run(), save() (+6 more)

### Community 136 - "createPrivateVault"
Cohesion: 0.33
Nodes (7): createPrivateVault(), config(), envelope(), locate(), manifest(), reserve(), safeDir()

### Community 138 - "code/storage-search.js"
Cohesion: 0.19
Nodes (10): createStorageSearch(), build(), search(), warm(), fs, normalize(), path, fs (+2 more)

### Community 146 - "atelier-update/public/dictation.js"
Cohesion: 0.36
Nodes (5): feedback(), native(), nativeBridge(), setActive(), stop()

### Community 147 - "public/images.js"
Cohesion: 0.39
Nodes (5): bubble(), card(), clearWelcome(), create(), lightbox()

### Community 148 - "code/authority-transfer.js"
Cohesion: 0.32
Nodes (7): crypto, digest(), fs, inventory(), walk(), path, transfer()

### Community 149 - "code/public/atelier/dictation.js"
Cohesion: 0.36
Nodes (5): feedback(), native(), nativeBridge(), setActive(), stop()

### Community 150 - "atelier/images.js"
Cohesion: 0.39
Nodes (5): bubble(), card(), clearWelcome(), create(), lightbox()

### Community 151 - "egaliseur71.js"
Cohesion: 0.57
Nodes (7): adopt(), applyPreset(), dress(), markPreset(), opened(), place(), schedule()

### Community 152 - "code/public/local-accounts.js"
Cohesion: 0.54
Nodes (7): actions(), close(), erase(), open(), paint(), refresh(), select()

### Community 154 - "upload-limits.js"
Cohesion: 0.32
Nodes (7): cleanStaging(), createUploadLimits(), freeBytes(), middleware(), fs, isUpload(), path

### Community 158 - "https-only.js"
Cohesion: 0.38
Nodes (5): createHttpsOnly(), httpsOnly(), isLoopback(), net, safeHost()

### Community 159 - "code/connection-setup.js"
Cohesion: 0.57
Nodes (6): byId(), operation(), profile, read(), render(), status()

### Community 160 - "createLocalLoginVault"
Cohesion: 0.52
Nodes (6): createLocalLoginVault(), available(), file(), read(), validAccount(), write()

### Community 162 - "code/nas-remap-catalogues.cjs"
Cohesion: 0.33
Nodes (5): crypto, fs, path, planRemap(), remapPath()

### Community 163 - "atelier/desktop-approval.js"
Cohesion: 0.38
Nodes (4): configure(), decide(), refresh(), waitForApprovalClick()

### Community 165 - "code/public/personal-space.js"
Cohesion: 0.52
Nodes (6): apply(), fill(), loadProfile(), profileUI(), read(), showAvatar()

### Community 170 - "code/nas-server.cjs"
Cohesion: 0.40
Nodes (5): configureNas(), crypto, existingDirectory(), fs, path

### Community 171 - "code/public/atelier-page.js"
Cohesion: 0.53
Nodes (4): allowed(), command(), launch(), permissions()

### Community 172 - "cinema-player.js"
Cohesion: 0.73
Nodes (5): build(), flash(), sync(), togglePlay(), wake()

### Community 173 - "search"
Cohesion: 0.53
Nodes (5): bind(), hide(), search(), render(), run()

### Community 174 - "code/public/password-onboarding.js"
Cohesion: 0.47
Nodes (4): clear(), finish(), run(), showTemporary()

### Community 175 - "code/storage-usage.js"
Cohesion: 0.40
Nodes (5): createStorageUsage(), get(), scan(), fs, path

### Community 183 - "createMusicDurationIndex"
Cohesion: 0.70
Nodes (4): createMusicDurationIndex(), duration(), record(), schedule()

### Community 185 - "code/public/home.js"
Cohesion: 0.70
Nodes (4): filmCard(), load(), renderFilms(), renderTracks()

### Community 186 - "code/public/settings-tools.js"
Cohesion: 0.60
Nodes (3): apply(), fill(), save()

### Community 187 - "solitaire71.js"
Cohesion: 0.80
Nodes (4): attach(), dress(), face(), layout()

### Community 194 - "cleanupUpdateTemporary"
Cohesion: 0.50
Nodes (4): cleanupUpdateTemporary(), openRegularUpdate(), receiveUpdateInstaller(), updatePathEqual()

## Knowledge Gaps
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `startNas()` connect `getStorageRoot` to `code/server.js`, `code/nas-server.cjs`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `createAuthority()` (e.g. with `authority-server.js` and `begin()`) actually correct?**
  _`createAuthority()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06155632984901278 - nodes in this community are weakly interconnected._
- **Why does `createWindowsTools()` connect `code/public/refonte.js` to `code/storage-search.js`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `wire()` (e.g. with `addToPlaylist()` and `createPlaylist()`) actually correct?**
  _`wire()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `docker-publish.yml` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Why does `createNasBridge()` connect `createNasBridge` to `nas-bridge.cjs`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._