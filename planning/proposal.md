# Proposal

## Why

The fork's KDE Plasma 6 Wayland overlay backend (added in `2d1e5ae5`) lives inside the app (`main/src/windowing/kwin/`) and is wired into app-specific seams. No other Electron app can reuse it, and the app itself carries backend-selection branches across ~10 files. Extracting the backend into a drop-in npm package makes the KDE Wayland support reusable: an app replaces the overlay library import (or adds the package) and Wayland support is selected automatically, while Windows, macOS, and X11 sessions keep using the battle-tested `electron-overlay-window` under the hood. The backend is pure TypeScript (DBus + generated KWin scripts + Electron APIs), so extraction carries no native-code risk; a Rust rewrite of the native library was considered and rejected as high-risk/low-value.

## What Changes

- **New npm package `electron-overlay-window-next`** (separate repository, MIT, TypeScript CJS + types): a drop-in replacement for `electron-overlay-window` exposing the same API surface — `OverlayController` (`attachByTitle`, `activateOverlay`, `focusTarget`, `screenshot`, `events`, `targetBounds`), `OVERLAY_WINDOW_OPTS`, `AttachEvent` — plus detection helpers (`detectBackend`, `isWaylandBackend`) and backend accessors (`getKWinBridge`, cursor listener registration) for app-level seams.
- On KDE Plasma Wayland the package drives the overlay through the existing KWin bridge (ported `kwin/` module: `KWinBridge`, KWin script generators, DBus service, `ScriptLoader`, `LayerRule`); on Windows, macOS, and X11 sessions it delegates to `electron-overlay-window` unchanged (it stays a pinned dependency of the package).
- App-specific constants become package options: overlay window title, DBus service name, overlay window class (used by the layer rule), game window title.
- Backend detection moves into the package and gains a KWin availability check (session env + KDE markers, sync): a Wayland session without KWin (e.g. GNOME) now falls back to the X11 (XWayland) backend instead of a failing Wayland attempt. The `--overlay-backend=x11|wayland` override is preserved. This is the only deliberate behavior change; all other observable behavior is unchanged.
- The app consumes the package: `GameWindow` and `OverlayWindow` drop their backend branches (the facade routes attach/activate/focus internally and owns `setIgnoreMouseEvents` toggling on Wayland; `OVERLAY_WINDOW_OPTS` becomes backend-aware for `resizable`); `main/src/windowing/kwin/` is deleted. The shortcut/clipboard seams (`InputInjector`/ydotool, `WaylandClipboard`/Klipper, `Shortcuts` cursor usage, `WidgetAreaTracker` cursor source) stay in-app and import the detection helpers from the package.
- Package implementation happens in its own repository (blueprint in this change's design; task checklist split by repo). This repository's part is the app migration to the published package (or a git-pinned reference until publication).

## Capabilities

### New Capabilities
- `overlay-backend-package`: the app obtains overlay windowing exclusively through the drop-in package `electron-overlay-window-next` — API parity with `electron-overlay-window`, automatic backend selection with KWin availability check, and app-specific identifiers passed as configuration.

### Modified Capabilities
- `wayland-overlay-backend`: backend selection additionally requires an available KWin compositor (non-KDE Wayland sessions fall back to the X11 backend); the owning module of the KWin bridge implementation becomes the external package instead of `main/src/windowing/kwin/`.
- `overlay-windowing`: the overlay attachment requirement now routes through the drop-in package instead of referencing `electron-overlay-window` directly.

## Impact

- **New repository** `electron-overlay-window-next`: TypeScript package (CJS + types, MIT); dependencies `electron-overlay-window` (pinned) and `dbus-next`, `electron` as peer; vitest for pure logic (script generators, detection, layer-rule file handling); GitHub Actions lint/typecheck/test/build. Publishing to npm is a manual step by the maintainer.
- **App (`main/`)**: `package.json` (add `electron-overlay-window-next`, drop the direct `electron-overlay-window` dependency, fix the stale `allowScripts` version), `build/script.mjs` (esbuild externals), `windowing/GameWindow.ts`, `windowing/OverlayWindow.ts`, `windowing/WidgetAreaTracker.ts`, `main.ts`, `shortcuts/Shortcuts.ts`, `shortcuts/InputInjector.ts`, `shortcuts/WaylandClipboard.ts`, `shortcuts/HostClipboard.ts`; delete `windowing/kwin/`.
- **Docs**: `docs/issues.md` gains a one-line note about the non-KDE Wayland fallback; `docs/kde-setup.md` and `docs/cmd-flags.md` stay valid for users (flag semantics unchanged).
- **Upstream merges**: shared files `GameWindow.ts`/`OverlayWindow.ts` move *closer* to upstream (backend branches collapse into the package import; only the import specifier and small option lines stay fork-specific); deleting the fork-only `kwin/` files is merge-neutral; the `main.ts` diff shrinks. The `shortcuts/` seam files keep their existing fork-branch shape.
- **Gamepad feature**: unaffected — KWin hotkey forwarding (`handleExternalShortcut`), `gamepad-io` plumbing, and shortcut handling stay in-app behind their current interfaces.
- **Linux (X11) support**: unchanged via delegation, with explicit verification tasks. **Windows**: behavior unchanged via delegation; verified by type-checks/build and CI only (no Windows runtime testing in this environment).
- **Out of scope**: GNOME/wlroots native backends and layer-shell; extracting `InputInjector` (ydotool) and `WaylandClipboard` (Klipper) into the package; npm publish automation and credentials; any overlay behavior changes beyond the detection fallback; macOS-specific work.
