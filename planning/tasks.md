# Tasks

Groups 1–3 are performed in the **new package repository** (`electron-overlay-window-next`, created by the maintainer; this change's design.md is the blueprint). Groups 4–5 are performed in **this repository**. Task order follows the dependency chain: the app migration starts only after a tagged, installable package exists.

## 1. Package repository — scaffold

- [ ] 1.1 Create the repo with `package.json` (name `electron-overlay-window-next`, CJS `main` + `types`, MIT), strict `tsconfig`, eslint + prettier, git init; verify `npx tsc --noEmit` passes on the stub `src/index.ts`
- [ ] 1.2 Add dependencies `electron-overlay-window@4.1.0` (pinned exact) and `dbus-next`, `electron` as peerDependency; verify `npm i` resolves and the lockfile is committed
- [ ] 1.3 Add GitHub Actions CI (lint, typecheck, test, build on ubuntu); verify the workflow is green on the first push

## 2. Package — port the KWin backend (design D2–D6)

- [ ] 2.1 Port `kwin/` modules (`KWinBridge`, `script`, `DBusService`, `ScriptLoader`, `LayerRule`, `types`) into `src/kwin/`, replacing hardcoded values with init options (`overlayTitle`, `dbusServiceName`, `windowClass`, plus existing `gameTitle`, `shortcuts`, `scriptsDir`, a structural `{ write(msg) }` logger); verify `npx tsc --noEmit` and that no Exiled Exchange 2 specific strings remain in `src/` (grep)
- [ ] 2.2 Implement `src/detect.ts` (flag override → session env + KDE markers → x11) and vitest env-matrix tests (Wayland+KDE, Wayland without KDE, X11, each `--overlay-backend` value); verify `npm test` passes
- [ ] 2.3 Implement `src/facade.ts`: `OverlayController`-shaped controller (`attachByTitle`, `activateOverlay`, `focusTarget`, `screenshot`, `events`, `targetBounds`), `bindOverlayWindow` no-op on non-Wayland, `setIgnoreMouseEvents` ownership on Wayland activation/focus, backend-aware `OVERLAY_WINDOW_OPTS`, `AttachEvent` re-export, exports `detectBackend`/`isWaylandBackend`/`getKWinBridge`; verify with a unit test routing to mocked delegate/bridge per backend and `npx tsc --noEmit`
- [ ] 2.4 Add vitest for the KWin script generators (snapshot contains configured title, hotkeys, DBus name) and `LayerRule` file manipulation (mocked fs + `busctl`); verify `npm test` passes
- [ ] 2.5 Write README (drop-in usage: swap the import source, KDE Plasma 6 requirements, options reference) and LICENSE; verify the README's import example compiles against the actual exports in a scratch TS project (`tsc --noEmit`)

## 3. Package — release gate

- [ ] 3.1 Verify CI is green, tag `v0.1.0`, and publish to npm (or pin the GitHub tag as the first distribution source per design D9); verify installability by `npm i electron-overlay-window-next` (or the git URL) in a scratch project and type-checking an import of `OverlayController`, `OVERLAY_WINDOW_OPTS`, `AttachEvent`, `detectBackend`, `isWaylandBackend`

## 4. App — migration (this repository)

- [ ] 4.1 `main/package.json`: add `electron-overlay-window-next` (tagged version per 3.1), remove the direct `electron-overlay-window` dependency, fix the stale `allowScripts` entry (`electron-overlay-window@4.0.2` → `4.1.0`); run `npm i` in `main` and verify the package resolves (`node -e "console.log(require.resolve('electron-overlay-window-next/package.json'))"` from `main/`)
- [ ] 4.2 `main/build/script.mjs`: add `electron-overlay-window-next` to the esbuild externals (keep `electron-overlay-window` external); verify `npm run dev` starts in `main/` without module-not-found errors
- [ ] 4.3 `windowing/GameWindow.ts`: swap imports to the package and remove the `isWaylandBackend`/`getKWinBridge` branches (design D7); verify `npm run check-types` in `main/`
- [ ] 4.4 `windowing/OverlayWindow.ts`: import from the package, keep the overlay title as a local constant matching `renderer/index.html`, call `bindOverlayWindow` unconditionally, and use unbranched `activateOverlay`/`focusTarget`; verify `npm run check-types` in `main/`
- [ ] 4.5 `main.ts`: import `detectBackend` and the bridge init from the package, extend init options with the app identifiers (`overlayTitle`, `dbusServiceName`, `windowClass`), keep the bridge lifecycle (`start`, `onShortcut`, capped `stop` on `will-quit`) unchanged; verify `npm run check-types` in `main/`
- [ ] 4.6 `windowing/WidgetAreaTracker.ts` and `shortcuts/Shortcuts.ts`, `shortcuts/InputInjector.ts`, `shortcuts/WaylandClipboard.ts`, `shortcuts/HostClipboard.ts`: switch helper imports to the package with no logic changes; verify `npm run check-types` in `main/`
- [ ] 4.7 Delete `main/src/windowing/kwin/`; verify `grep -rn "windowing/kwin" main/src` is empty and `docs/cmd-flags.md` / `docs/issues.md` mention only the flag semantics and the new non-KDE Wayland fallback (one line); verify `npm run check-types` in `main/`

## 5. App — verification (this repository)

- [ ] 5.1 `main/`: `npm run lint` and `npm run check-types` both pass
- [ ] 5.2 `renderer/`: `npm run lint`, `npm run check-types`, and `npm run test` all pass (gamepad feature compiles and tests untouched)
- [ ] 5.3 Manual X11 run: overlay attaches to the game, visibility follows focus, pinned state and price check work; verify the `overlay-windowing` scenarios
- [ ] 5.4 Manual KDE Plasma 6 Wayland run: attach, fullscreen stacking, KWin hotkeys, Klipper clipboard, price-check cursor placement, ydotool notice; verify the `wayland-overlay-backend` scenarios
- [ ] 5.5 Verify `--overlay-backend=x11` forces the X11 backend on a Wayland session, and the Windows CI build/package is green; maintainer performs the Windows runtime smoke as today

## Workflow follow-up

- On `/opsx:sync`, update the `wayland-overlay-backend` Purpose (and `overlay-windowing` Purpose if module wording is affected) to reference `electron-overlay-window-next` as the owning module of the KWin bridge implementation, replacing the `main/src/windowing/kwin/` reference.
- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
