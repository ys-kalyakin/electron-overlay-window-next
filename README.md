# electron-overlay-window-next

A drop-in replacement for
[`electron-overlay-window`](https://www.npmjs.com/package/electron-overlay-window)
that adds KDE Plasma 6 Wayland overlay support through the KWin compositor —
without changing how overlays work on Windows, macOS, and X11.

```ts
// before
import {
  OverlayController,
  OVERLAY_WINDOW_OPTS,
  AttachEvent,
} from "electron-overlay-window";

// after — the KDE Wayland backend selects itself
import {
  OverlayController,
  OVERLAY_WINDOW_OPTS,
  AttachEvent,
} from "electron-overlay-window-next";
```

- **Windows / macOS / X11 sessions** — the package delegates 1:1 to the
  original `electron-overlay-window` (pinned dependency), so platform
  behavior and upstream fixes are unchanged.
- **KDE Plasma 6 Wayland** — game window tracking, overlay placement and
  stacking, activation, and cursor events are driven through a generated
  KWin script and a DBus bridge, behind the same `OverlayController` API.
- **Other Wayland sessions** (GNOME, wlroots, …) — fall back to the X11
  (XWayland) backend instead of attempting KWin integration.

## Backend selection

The backend is chosen once at import: a Wayland session with a KDE marker
(`XDG_CURRENT_DESKTOP` containing `KDE`, or `KDE_FULL_SESSION` set) uses the
KWin backend; everything else uses X11. The detection helpers are exported so
apps route their own seams through the same source of truth:

```ts
import { detectBackend, isWaylandBackend } from "electron-overlay-window-next";
```

A `--overlay-backend=x11|wayland` command-line flag overrides detection.

## Wayland setup

Initialize the KWin bridge once in the Electron main process, before any
overlay window attaches:

```ts
import { initKWinBridge } from "electron-overlay-window-next";

const bridge = initKWinBridge(logger, scriptsDir, {
  gameTitle: "My Cool Game", // window title to track
  shortcuts: [["focusOverlay", "Meta+Shift+O"]],
  overlayTitle: "My Overlay", // overlay BrowserWindow title
  dbusServiceName: "com.example.MyApp.KWin", // base DBus name
  windowClass: "my-overlay", // overlay WM_CLASS for the layer rule
});

app.on("will-quit", () => {
  void bridge.stop();
});
```

Then attach as usual — on Wayland the bridge tracks the game, mirrors the
overlay window, and owns `setIgnoreMouseEvents` toggling during
activation/focus:

```ts
import { OverlayController, bindOverlayWindow } from "electron-overlay-window-next";

OverlayController.attachByTitle(overlayWindow, gameTitle);
bindOverlayWindow(overlayWindow); // no-op on non-Wayland backends
```

KWin hotkey and cursor events flow through the bridge for app-level seams:

```ts
import { getKWinBridge } from "electron-overlay-window-next";

getKWinBridge()?.onShortcut((id) => { /* app shortcut handling */ });
getKWinBridge()?.onCursor((position) => { /* compositor cursor position */ });
```

## Options reference

`initKWinBridge(logger, scriptsDir, options)`:

| Option | Type | Description |
| --- | --- | --- |
| `logger` | `{ write(message: string): void }` | Structural logger for bridge lifecycle messages |
| `scriptsDir` | `string` | Directory the generated KWin scripts are written to |
| `gameTitle` | `string` | Title of the game window to track |
| `shortcuts` | `[id, keySequence][]` | KWin shortcuts that emit `shortcut` events |
| `overlayTitle` | `string` | Title of the overlay `BrowserWindow`, matched by the KWin scripts |
| `dbusServiceName` | `string` | Base DBus name of the bridge service (`.pid<pid>` is appended per instance) |
| `windowClass` | `string` | WM_CLASS of the overlay window, used by the popup layer rule |

## Requirements (Wayland backend)

- KDE Plasma 6 on a Wayland session (selected automatically; other Wayland
  sessions fall back to XWayland/X11)
- Host input injection (ydotool) and unfocused clipboard (Klipper) helpers
  remain app-level concerns outside this package

## API

Everything exported by `electron-overlay-window` keeps its shape:
`OverlayController` (`attachByTitle`, `activateOverlay`, `focusTarget`,
`screenshot`, `events`, `targetBounds`, `targetHasFocus`), `OVERLAY_WINDOW_OPTS`
(backend-aware: `resizable: true` on Wayland), and the `AttachEvent`,
`AttachOptions` types. Additional exports: `detectBackend`, `isWaylandBackend`,
`bindOverlayWindow`, `getKWinBridge`, `initKWinBridge`, and the `KWinBridge`,
`KWinBridgeOptions`, `Logger`, `ShortcutBinding`, `OverlayBackendKind` types.

## Security

Generated KWin scripts are written only inside the configured scripts
directory: `KWinBridge.writeScript` resolves the target path and rejects
any path that would escape it. Behavior for the package's internal fixed
file names is unchanged.

## Development

```sh
npm install
npm run lint
npm run check-types
npm test
npm run build
```

## License

[MIT](LICENSE)
