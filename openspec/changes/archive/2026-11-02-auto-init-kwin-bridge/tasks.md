# Tasks

## 1. Title-based layer rule

- [x] 1.1 Add a title-matching variant to `LayerRule` (exact `title` match instead of `wmclass`, same description marker, same popup-layer pinning) while keeping WM_CLASS behavior identical for explicit init; verify with extended `tests/layer-rule.test.ts` cases (title rule written, WM_CLASS rule unchanged, upsert updates in place) via `npm test`

## 2. KWin bridge: defaults, lazy init, config extension

- [x] 2.1 Resolve omitted `KWinBridgeOptions` fields to the auto defaults from design D2 (silent logger, per-pid temp scripts dir, package DBus base name, no shortcuts) and add `ensureKWinBridge()` that creates the singleton with defaults, fires `start()` in the background (reporting failures through the console error channel), and notifies the existing init listeners; verify with new KWin bridge unit tests (singleton reuse, listener notification, start kicked off once) via `npm test` and `npm run check-types`
- [x] 2.2 Extend `updateConfig` to accept `overlayTitle` (store and regenerate the main script when changed and started) and re-run the layer-rule upsert when the rule's identity field changes (derived title in auto mode, `windowClass` in explicit mode); verify with unit tests covering regeneration on change, no-op when unchanged, and rule re-install, via `npm test`

## 3. Facade: auto-init wiring and seams

- [x] 3.1 Route `WaylandOverlayController.requireBridge()` and `bindOverlayWindow()` through `ensureKWinBridge()`, and pass the attached window's `getTitle()` as `overlayTitle` in `attachByTitle`; verify with facade tests: attach without init creates and starts the bridge, binding before attach initializes it, explicit init is never overridden, and the X11 path is untouched, via `npm test`
- [x] 3.2 Register a one-time `will-quit` handler stopping an auto-initialized bridge (lazy Electron require inside the Wayland auto path only, no double hook for explicit init); verify with a facade test using a mocked `electron` module that the handler stops the bridge on quit, via `npm test`
- [x] 3.3 Export `onShortcut(listener)` and `onCursor(listener)` facade helpers wrapping the bridge-init notification (immediate when the bridge exists, deferred at creation, no-op off Wayland, no auto-init trigger); verify with facade tests for subscribe-before-first-use and subscribe-after-init ordering, via `npm test`

## 4. Documentation and full verification

- [x] 4.1 Rework the README: zero-config Wayland quick start (import + `attachByTitle`), explicit `initKWinBridge` documented as the override, the title-derived-identity caveat for dynamic overlay titles, the new `onShortcut`/`onCursor` exports in the API list; verify the documented snippets use only exports that exist (`npm run check-types` green with the new API)
- [x] 4.2 Run the full gate: `npm run lint`, `npm run check-types`, `npm test`, and `npm run build` all pass from the repo root

## Workflow follow-up

- Archive the change with `/opsx:archive` after the project's review requirements are satisfied.
