# Atelier IA — démarre Windows-MCP avec le Python embarqué du connecteur.
# Le python.exe du dossier venv contient le chemin absolu du PC où le connecteur a été préparé :
# il ne démarre pas ailleurs. Ce script charge les bibliothèques du venv à partir de son propre dossier.
import os
import runpy
import site
import sys

here = os.path.dirname(os.path.abspath(__file__))
packages = os.path.join(here, "venv", "Lib", "site-packages")
if not os.path.isdir(os.path.join(packages, "windows_mcp")):
    sys.stderr.write("Windows-MCP est introuvable dans le connecteur Atelier IA.\n")
    sys.exit(3)
sys.path[:] = [p for p in sys.path if "site-packages" not in p.lower()]
site.addsitedir(packages)  # traite aussi les fichiers .pth (pywin32)
_dll_handles = []
for dll in ("pywin32_system32", os.path.join("win32", "lib")):
    folder = os.path.join(packages, dll)
    if os.path.isdir(folder) and hasattr(os, "add_dll_directory"):
        _dll_handles.append(os.add_dll_directory(folder))

# Atelier IA demande un clic « Autoriser une fois » juste avant chaque action. Windows-MCP considérait ce
# clic comme une reprise de la main et refusait l'action pendant 10 s (code USER_CONTROL).
# On attend plutôt un court moment sans mouvement physique avant de commencer l'action.
# La reprise de la main pendant une action (mouvement franc ou raccourci) n'est pas modifiée.
QUIET_SECONDS = 2.5   # calme requis avant de commencer une action
START_PATIENCE = 20.0  # au-delà, l'action est refusée comme avant
try:
    import time
    from windows_mcp.desktop import control as _control

    _Coordinator = _control.ControlCoordinator
    _original_tick = _Coordinator._tick_locked
    _original_snapshot = _Coordinator._snapshot_locked
    _original_begin = _Coordinator.begin_call

    def _tick_locked(self, now):
        # Même logique que l'original, avec QUIET_SECONDS au lieu de 10 s pour quitter l'état « user ».
        if (
            self._state == "user"
            and not self._pressed
            and not self._mouse_down
            and now - max(self._last_user, self._last_physical_event) >= QUIET_SECONDS
        ):
            return self._set_locked("ready")
        if self._state == "ready" and now - self._last_physical_event < QUIET_SECONDS:
            self._last_user = self._last_physical_event
            return self._set_locked("user")
        if self._state == "ready":
            return False
        return _original_tick(self, now)

    def _snapshot_locked(self, now):
        result = _original_snapshot(self, now)
        if result.get("state") == "user":
            result["wait_seconds"] = max(0.0, max(self._last_user, self._last_physical_event) + QUIET_SECONDS - now)
        return result

    def begin_call(self, name):
        # Wait for the real approval click to finish. Never rewrite physical-input
        # timestamps or clear takeover flags to manufacture an idle desktop.
        deadline = time.monotonic() + START_PATIENCE
        while True:
            try:
                return _original_begin(self, name)
            except _control.ControlBlocked as blocked:
                code = str(blocked).split(":", 1)[0]
                if time.monotonic() >= deadline or self._fast_takeover or self._emergency:
                    raise
                if code == "USER_CONTROL":
                    time.sleep(0.1)
                    continue
                if code == "PHYSICAL_INPUT_HELD":
                    time.sleep(0.2)  # le bouton de la souris est encore enfoncé
                    continue
                raise

    _Coordinator._tick_locked = _tick_locked
    _Coordinator._snapshot_locked = _snapshot_locked
    _Coordinator.begin_call = begin_call
except Exception as error:  # Version différente de Windows-MCP : on garde son comportement d'origine.
    sys.stderr.write("Atelier IA : ajustement du contrôle non appliqué (%s)\n" % error)

if __name__ == "__main__":
    sys.argv = ["windows_mcp", *sys.argv[1:]]
    runpy.run_module("windows_mcp", run_name="__main__", alter_sys=True)
