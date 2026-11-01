# Design

## Context

The KDE Plasma 6 Wayland overlay backend is fully in-app today: `main/src/windowing/kwin/` (`index.ts` detection, `KWinBridge.ts`, `script.ts`, `DBusService.ts`, `ScriptLoader.ts`, `LayerRule.ts`, `types.ts`) plus `isWaylandBackend()`/`getKWinBridge()` branches in 8 consumer files (`GameWindow.ts`, `OverlayWindow.ts`, `WidgetAreaTracker.ts`, `main.ts`, `shortcuts/Shortcuts.ts`, `shortcuts/InputInjector.ts`, `shortcuts/WaylandClipboard.ts`, `shortcuts/HostClipboard.ts`). The backend is pure TypeScript — `dbus-next` + generated KWin scripts + Electron APIs; no native code. The X11/Windows overlay stack is `electron-overlay-window@4.1.0` (pinned, esbuild-external in `main/build/script.mjs:29`). Constraints: the fork tracks upstream (minimal, localized edits in shared files), Windows is the first platform, and the gamepad feature must keep compiling and working. See proposal.md — Why for motivation.

## Goals / Non-Goals

**Goals:**
- An npm package any `electron-overlay-window` consumer can adopt by changing the import source (or adding the package); KDE Wayland support selects itself.
- The app depends only on the package; `main/src/windowing/kwin/` is deleted and `GameWindow`/`OverlayWindow` lose their backend branches (closer to upstream).
- One source of truth for backend detection, including KWin availability.
- The package contains no Exiled Exchange 2 specific values.

**Non-Goals:**
- Rewriting `electron-overlay-window`'s native (Win32/X11) parts in Rust or forking its C++ — the package delegates to it on non-Wayland platforms.
- GNOME/wlroots native backends and layer-shell (Electron has no layer-shell support).
- Extracting `InputInjector` (ydotool) and `WaylandClipboard` (Klipper) — they stay app-level.
- npm publish automation, macOS-specific work, or overlay behavior changes beyond the detection fallback.

## Decisions

**D1 — TypeScript drop-in facade over `electron-overlay-window`, not a rewrite.** The KDE backend needs no native code, so the package is a thin facade: on Windows/macOS/X11 it delegates 1:1 to the pinned original (upstream fixes keep flowing in), on KDE Wayland it runs the ported KWin bridge. Alternatives: Rust/napi-rs rewrite or a C++ fork — both rejected: weeks-to-months of native reimplementation whose only effect is replacing working code on the fork's primary platform (Windows), with zero benefit for the KDE backend.

**D2 — Package layout mirrors the app's `kwin/` module for a mechanical port.**

```
src/
  index.ts        # public API
  facade.ts       # OverlayController-shaped controller routing per backend
  detect.ts       # detectBackend / isWaylandBackend (D4)
  kwin/           # ported as-is: KWinBridge, script, DBusService, ScriptLoader, LayerRule, types
```

Public exports: `OverlayController` (same shape as the original — controller with static-style methods `attachByTitle`, `activateOverlay`, `focusTarget`, `screenshot`, plus `events`, `targetBounds`), `OVERLAY_WINDOW_OPTS`, `AttachEvent` type; helpers `detectBackend`, `isWaylandBackend`, `getKWinBridge`, `bindOverlayWindow`, and KWin cursor listener registration.

**D3 — The facade owns what the branches used to do.** It holds the bound overlay `BrowserWindow` (from `attachByTitle(window, title)` and an explicit `bindOverlayWindow` no-op on non-Wayland), so on Wayland `activateOverlay()` = `KWinBridge.activateOverlay()` + `setIgnoreMouseEvents(false)`, and `focusTarget()` = `focusGame()` + `setIgnoreMouseEvents(true)` — exactly what `OverlayWindow.ts:111-129` branches over today. That is what lets `GameWindow`/`OverlayWindow` collapse to package-only imports. `WidgetAreaTracker` keeps its cursor-source branch (uiohook vs compositor cursor is an app-level input concern, per the proposal's scope).

**D4 — Detection is synchronous and package-owned.** Order: `--overlay-backend=x11|wayland` flag wins; Wayland backend iff `XDG_SESSION_TYPE=wayland && WAYLAND_DISPLAY` **and** a KDE marker is present (`XDG_CURRENT_DESKTOP` containing `KDE`, or `KDE_FULL_SESSION` set); else X11 (XWayland — the upstream fallback). Alternatives: an async DBus probe of `org.kde.KWin` (more robust, rejected: detection runs at module scope in `main.ts:48` to set ozone switches before `app.ready`, and sync keeps it unit-testable). Exotic sessions without KDE env markers lose the Wayland backend — mitigated by the documented flag override. The app calls the package's `detectBackend()` for both the ozone switches and bridge init; no other module may implement its own detection.

**D5 — App identity becomes init options.** Today's hardcoded values move into the init options: `OVERLAY_WINDOW_TITLE` (`kwin/index.ts:7`; script caption matching + the app's own `BrowserWindow` title), the DBus service name `io.github.kvan7.ExiledExchange2.KWin.pid<pid>` (`DBusService.ts`), and the overlay WM_CLASS used by the layer rule (`LayerRule.ts`). Package init keeps the current `initKWinBridge(logger, scriptsDir, { gameTitle, shortcuts })` shape and gains `overlayTitle`, `dbusServiceName`, `windowClass`; `logger` narrows to a `{ write(msg) }` structural interface. The app keeps its title constant locally (matching `renderer/index.html`) and passes it in.

**D6 — `OVERLAY_WINDOW_OPTS` stays a plain export but is backend-aware.** Computed at import time from the sync detection (`resizable: true` added on Wayland — `OverlayWindow.ts:50`), so the app's `...OVERLAY_WINDOW_OPTS` spread is unchanged. Alternative (a `getOverlayWindowOpts()` function) rejected: it would diverge from the original API surface the package promises.

**D7 — App-side changes are import swaps plus deletions.** `GameWindow.ts`: only the import specifier changes (branches removed; near-upstream shape again). `OverlayWindow.ts`: import from the package, local title const, `bindOverlayWindow` called unconditionally, `activateOverlay`/`focusTarget` unbranched. `main.ts`: imports `detectBackend` + init from the package, init options extended; bridge lifecycle (`start`, `onShortcut` → `handleExternalShortcut`, capped `stop()` on `will-quit`) unchanged. `shortcuts/*` consumers: import the detection helpers from the package, logic unchanged. `main/src/windowing/kwin/` deleted.

**D8 — Packaging.** CJS + `.d.ts` (matches the original and the app's esbuild bundling); strict TypeScript; deps: `electron-overlay-window` (pinned exact) and `dbus-next`; `electron` as peer. In the app: add `electron-overlay-window-next` to `main/package.json` and drop the direct `electron-overlay-window` dependency (it becomes transitive), add the package to the esbuild `external` list (keeping `electron-overlay-window` external too — the native addon must stay in `node_modules`), and fix the stale `allowScripts` entry (`electron-overlay-window@4.0.2` → `4.1.0`) while touching that file anyway.

**D9 — Two repositories, sequenced.** The package lives in its own repo (scaffold, CI: lint/typecheck/test/build on ubuntu, MIT, README with the drop-in usage story); its implementation checklist is in this change's tasks (package section) and this design is the blueprint. The app migration (this repo) pins the package by npm version once published, or by a GitHub URL + tag (`npm i github:<owner>/electron-overlay-window-next#vX.Y.Z`) before that — chosen at implementation. Rollback: revert the migration commit (restores `kwin/` and the old dependency).

**D10 — Package tests cover the pure logic only.** vitest: script generators (snapshot: generated script contains the configured title, hotkeys, DBus name), detection (env matrix + flag override + KDE markers), `LayerRule` file manipulation with mocked fs/`busctl`. KWin/DBus integration needs a live Plasma session — verified manually via the app (as today). The app gains no new tests (no test runner exists in `main/`).

## Risks / Trade-offs

- [Non-KDE Wayland fallback changes behavior for GNOME users] → today such sessions attempt a KWin bridge that cannot work; the fallback restores upstream XWayland behavior; `--overlay-backend` override and a `docs/issues.md` note cover escape hatches.
- [Env-based KDE detection misses exotic sessions (markers unset)] → `--overlay-backend=wayland` override is documented in `docs/cmd-flags.md`; detection is one function, easy to extend.
- [Facade drift if `electron-overlay-window` changes its API] → exact version pin; the app's consumer surface is small and greppable; upstream bumps are deliberate updates.
- [Wayland behaviors hidden behind the facade could mask platform bugs] → explicit manual verification tasks for X11 and KDE Wayland before release; facade routing is thin and one-directional.
- [Windows regression from the import swap] → the delegation path is a 1:1 pass-through; verified by type-check/build + CI packaging; Windows runtime smoke stays with the maintainer as today.
- [Two-repo drift between this blueprint and the package] → the app pins a tagged version; the package README links the adoption story; drift surfaces as an explicit dependency bump.

## Migration Plan

1. Package repo: scaffold, port per D2/D5, tests per D10, CI green, tag `v0.1.0` (outside this repository).
2. App migration (this repo): dependency per D9, import swaps per D7, delete `kwin/`, build config per D8, docs note per D4.
3. Verify: `main` lint/check-types; `renderer` lint/check-types/test; manual X11 run; manual KDE Wayland run (attach, fullscreen stacking, hotkeys, clipboard, price-check cursor placement); Windows build via CI + maintainer smoke.
4. Rollback: single revert of the migration commit.

## Open Questions

- Distribution source for the first migration (npm registry vs GitHub tag) — default: GitHub tag first, npm once published; does not affect specs or task structure.
