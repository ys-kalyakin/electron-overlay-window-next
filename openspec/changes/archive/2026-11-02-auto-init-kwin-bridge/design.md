# Design

## Context

Today the Wayland path works only after the app calls `initKWinBridge(logger, scriptsDir, options)` and drives `start()` / `stop()` itself (`src/kwin/KWinBridge.ts:293`, README "Wayland setup"). The bridge singleton, its init-notification hook (`onKWinBridgeInit`), and the facade's `requireBridge()`/`bindOverlayWindow` seams already exist; the facade is the only layer that knows the detected backend (`src/detect.ts`, per design D4 of the extraction change). The Electron runtime is currently imported as types only, and tests run in vitest with module mocks (`tests/facade.test.ts`).

See proposal.md — Why for motivation and the delta spec for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Zero-setup Wayland path: import + `attachByTitle` is sufficient; the bridge is created, started, and stopped by the package.
- Identity (overlay title, layer-rule matching) derived from the attached `BrowserWindow`.
- `initKWinBridge` stays fully backward compatible as the explicit override.

**Non-Goals:**

- No change to Windows/macOS/X11 delegation, `OVERLAY_WINDOW_OPTS`, or detection (`detect.ts`).
- No shortcut configuration magic: shortcuts still come only from explicit init (an empty list is the auto default).
- No host-input (ydotool) or clipboard (Klipper) helpers — they remain app-level concerns.
- No debug-logging escape hatch in this change (failures surface via the facade's async error reporting).

## Decisions

**D1 — Lazy `ensureKWinBridge()` in the KWin module, invoked by the facade.** A new `ensureKWinBridge(): KWinBridge` export alongside `initKWinBridge` creates the singleton with default options (if none exists) and kicks off `start()` in the background, reusing `bridgeInitListeners` for notification. The facade calls it from `WaylandOverlayController.requireBridge()` (covering `attachByTitle`, `activateOverlay`, `focusTarget`) and from `bindOverlayWindow()`, both already Wayland-gated — so the KWin module stays backend-agnostic and `detect.ts` remains the single detection source. *Alternatives:* import-time init (rejected: side effects before `app.ready` and wasted compositor work for apps that import without attaching); putting the ensure logic inside the KWin module behind a backend check (rejected: spreads detection into the bridge module).

**D2 — Defaults derived without Electron.** Auto-init supplies: silent no-op logger; scripts dir `path.join(os.tmpdir(), "electron-overlay-window-next", String(process.pid))` (per-pid: generated script names are fixed, so concurrent overlay apps must not clobber each other's files); DBus base name `io.github.electron_overlay_window_next.KWin` (underscores — hyphens are invalid in DBus names; the service appends `.pid<pid>` so concurrent apps coexist on the bus); empty shortcuts; empty game title until `attachByTitle` syncs it. *Alternatives:* `app.getPath("userData")` for scripts (rejected: needs a runtime Electron import and `app.ready` ordering for a directory that only holds generated scratch scripts); console logger (rejected: noise for a drop-in library).

**D3 — Identity from the attached window; title-based layer rule in auto mode.** `attachByTitle` already binds the window; it additionally reads `window.getTitle()` and passes it as `overlayTitle` into `updateConfig`, which gains `overlayTitle` handling (store + regenerate the main script when changed and started). The layer rule gains a title-matching variant (`title` + exact `titlematch` instead of `wmclass`): explicit init keeps WM_CLASS matching unchanged, auto mode installs the rule by derived title. Rule installation becomes an upsert the bridge re-runs when the identity field it depends on changes (the description marker already identifies the package's own rule, so re-running updates in place and KWin reconfigure keeps it cheap). The initial `start()` install uses whatever identity is known at that point; the first attach converges it. *Alternatives:* deriving WM_CLASS from `app.getName()` (rejected per user decision — depends on unverifiable Electron app_id mapping and fails silently); skipping the rule in auto mode (rejected: silently degrades the primary fullscreen use case).

**D4 — Fire-and-forget quit cleanup.** When auto-init creates the bridge, the facade lazily requires Electron (`require("electron")` inside the Wayland auto path only — never reached on other backends, mocked in tests) and registers `app.on("will-quit", () => void bridge.stop())` once. No `preventDefault`/capped-stop dance: a library hijacking the app's quit sequencing is intrusive. *Alternatives:* capped stop with `preventDefault` + `app.exit()` (rejected: interferes with app-level quit logic; the consumer's own main.ts keeps its own handler); `process.on("exit")` (rejected: cannot run async DBus teardown).

**D5 — Explicit init stays authoritative.** `initKWinBridge` keeps its signature and singleton semantics; the auto path only acts when no instance exists. Explicit init after auto-init returns the auto instance (unchanged single-singleton behavior). Explicit mode also keeps the app's own `start()`/`stop()` wiring valid — `start()` remains idempotent and `stop()` is still public.

**D6 — Order-safe seam subscriptions in the facade.** New exports `onShortcut(listener)` and `onCursor(listener)` wrap `onKWinBridgeInit` (immediate delivery if the bridge exists, deferred delivery at creation otherwise) and are no-ops on non-Wayland backends, mirroring `bindOverlayWindow`'s contract. They do not themselves trigger auto-init — subscribing must not force compositor work; events flow once the app attaches. *Alternatives:* making `getKWinBridge()` ensure-init (rejected: changes a read accessor into an initializer); requiring the app to subscribe after attach (rejected: silent lost subscriptions on the documented seam).

## Risks / Trade-offs

- [Overlay title derived at attach goes stale if the overlay page later changes its own title] → the KWin scripts and rule match on the same title the window actually had; apps with dynamic titles should pass `overlayTitle` via explicit init. Documented in the README.
- [Race between auto-`start()` and the first `updateConfig`] → converges either way: `start()` generates the script from the latest stored options, and `updateConfig` reloads when started; one transient extra script load at most.
- [Quit may race the async teardown, leaving the main script loaded or the rule installed] → self-healing: script loading unloads before load, the layer rule is an upsert keyed by the description marker, and the next run re-establishes both.
- [Generated scripts in the OS temp dir persist until OS cleanup] → harmless scratch files in a per-pid directory; KWin loads them by path and the next run overwrites.
- [Silent default logger hides bridge lifecycle detail] → start/activation failures still surface through the facade's console error channel; explicit init accepts a real logger.
- [Runtime `require("electron")` inside library code] → confined to the Wayland auto path (never reached on delegated backends); tests mock the module like their other seams.

## Migration Plan

Non-breaking; no migration required. The consuming app can delete its `initKWinBridge`/`start`/`stop` boilerplate and its windowing init options at its own pace — explicit init keeps working unchanged. Rollback is a package version revert; no data or persisted state changes.

## Open Questions

None.
