# Proposal

## Why

On KDE Wayland the package still requires a dedicated initialization ritual before any overlay works: the app must call `initKWinBridge(logger, scriptsDir, { gameTitle, shortcuts, overlayTitle, dbusServiceName, windowClass })`, then drive the bridge lifecycle manually (`start()` and a capped `stop()` on `will-quit`). Every other backend needs none of this — the controller is usable straight after import. This setup-only burden is the last non-drop-in piece of the Wayland path, and it pushes boilerplate into every adopting app.

## What Changes

- **Lazy auto-initialization of the KWin bridge**: on the Wayland backend, the bridge is created and started automatically the first time any bridge-requiring entry point is used (`OverlayController.attachByTitle`, `bindOverlayWindow`, `activateOverlay`, `focusTarget`) — no `initKWinBridge()` call and no `start()` call required.
- **Derived defaults under the hood** when the app does not initialize explicitly: a silent logger, a per-process scripts directory under the OS temp dir, a package-owned DBus service base name, and no shortcuts.
- **Identity derived from the attached window**: the overlay title the KWin scripts match (and the popup layer rule that floats the overlay above fullscreen games) is taken from the attached overlay `BrowserWindow`'s title; in auto mode the layer rule matches the overlay by title instead of WM_CLASS.
- **Automatic bridge shutdown**: the package stops the auto-initialized bridge itself when the Electron app quits (`will-quit`), instead of requiring the app to wire `bridge.stop()`.
- **`initKWinBridge` stays as an explicit override** (non-breaking): apps that need custom logger, scripts dir, DBus name, shortcuts, or WM_CLASS-based rule matching keep calling it; an explicit init suppresses the auto path.
- **Order-safe seam subscriptions**: new module-level `onShortcut`/`onCursor` helpers that subscribe to the bridge whenever it appears, so the documented `getKWinBridge()?.onShortcut(...)` seams keep working regardless of when auto-initialization happens.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `overlay-backend-package`: the "Configurable app identity" requirement changes — app identifiers become optional because the package derives them under the hood (title-based layer rule matching replaces the mandatory WM_CLASS). A new requirement is added for automatic KWin bridge initialization and lifecycle (lazy init/start on first use, auto-stop on quit, explicit init remaining as the override).

## Impact

- `src/kwin/KWinBridge.ts` — defaults for all init options; `updateConfig` extended to accept `overlayTitle` (and drive layer-rule updates); title-based rule support.
- `src/kwin/LayerRule.ts` — layer rule gains title-based matching alongside WM_CLASS matching.
- `src/facade.ts` — auto-initialization hooks in the Wayland controller and `bindOverlayWindow`; quit-time shutdown.
- `src/kwin/index.ts`, `src/index.ts` — new exports (`onShortcut`, `onCursor`).
- `README.md` — zero-config quick start replaces the mandatory setup section.
- Tests: facade and KWin bridge tests extended for the auto-init path; no dependency changes (Electron stays a peer dependency, imported lazily at runtime only).
