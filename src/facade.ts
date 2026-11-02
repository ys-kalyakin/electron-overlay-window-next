import { EventEmitter } from "node:events";
import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Rectangle,
} from "electron";
import {
  OVERLAY_WINDOW_OPTS as X11_OVERLAY_WINDOW_OPTS,
  OverlayController as X11OverlayController,
  type AttachOptions,
} from "electron-overlay-window";
import {
  detectBackend,
  isWaylandBackend,
  type OverlayBackendKind,
} from "./detect";
import {
  ensureKWinBridge,
  getKWinBridge,
  onKWinBridgeInit,
  type KWinBridge,
} from "./kwin";
import type { WindowBounds } from "./kwin/DBusService";

/**
 * The controller surface of electron-overlay-window, shared 1:1 by both
 * backends (design D3). On Windows/macOS/X11 this is the original
 * implementation; on KDE Wayland it routes to the KWin bridge.
 */
export interface OverlayControllerApi {
  targetBounds: Rectangle;
  targetHasFocus: boolean;
  readonly events: EventEmitter;
  activateOverlay(): void;
  focusTarget(): void;
  attachByTitle(
    electronWindow: BrowserWindow | undefined,
    targetWindowTitle: string,
    options?: AttachOptions,
  ): void;
  screenshot(): Buffer;
}

/**
 * Backend-aware window options (design D6): computed once at import from the
 * sync detection. On Wayland the overlay must be resizable so the compositor
 * integration can drive its geometry; the original opts stay untouched
 * elsewhere.
 */
export const OVERLAY_WINDOW_OPTS: BrowserWindowConstructorOptions =
  isWaylandBackend()
    ? { ...X11_OVERLAY_WINDOW_OPTS, resizable: true }
    : X11_OVERLAY_WINDOW_OPTS;

/** The bridge's "attach" event payload, reshaped to the original AttachEvent. */
interface BridgeAttachPayload {
  hasAccess: boolean | undefined;
  is_fullscreen: boolean;
  bounds: WindowBounds;
}

const DEFAULT_RECT: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

function reportAsyncError(operation: string, error: unknown): void {
  console.error(`[electron-overlay-window-next] ${operation} failed:`, error);
}

let quitStopHooked = false;

/**
 * Stops an auto-initialized bridge when the Electron app quits (design D4):
 * fire-and-forget, no quit-sequencing hijack — leftovers self-heal on the
 * next run. Registers once per process and only on the auto path; explicitly
 * initialized bridges keep the app's own stop wiring.
 */
function hookAutoQuitStop(bridge: KWinBridge): void {
  if (quitStopHooked) return;
  quitStopHooked = true;
  void import("electron")
    .then((electron) => {
      electron.app?.once("will-quit", () => {
        void bridge
          .stop()
          .catch((error: unknown) => reportAsyncError("bridge stop", error));
      });
    })
    .catch(() => undefined); // electron unavailable (tests, non-main-process)
}

/**
 * Returns the bridge, creating it with the auto-init defaults when the app
 * did not initialize one explicitly (design D1). The auto path arms the
 * quit-time cleanup (design D4).
 */
function ensureAutoBridge(): KWinBridge {
  const existing = getKWinBridge();
  if (existing) return existing;
  const created = ensureKWinBridge();
  hookAutoQuitStop(created);
  return created;
}

/**
 * Wayland-side controller: keeps the bound overlay BrowserWindow and routes
 * activation/focus through the KWin bridge, which owns setIgnoreMouseEvents
 * toggling exactly where the app's backend branches used to (design D3).
 */
class WaylandOverlayController {
  private readonly eventsValue: EventEmitter = new EventEmitter();
  private wired = false;
  private targetHasFocusValue = false;

  constructor() {
    // wire the forwarding as soon as the bridge exists: via the init hook
    // for bridges created after this controller, and the checks below (plus
    // the lazy checks in the accessors) for bridges that already exist
    onKWinBridgeInit((bridge) => this.wire(bridge));
    const existing = getKWinBridge();
    if (existing) this.wire(existing);
  }

  /**
   * Subscribes to the bridge's tracking events, reshaping payloads to the
   * original event surface. Idempotent.
   */
  private wire(bridge: KWinBridge): void {
    if (this.wired) return;
    this.wired = true;
    bridge.on("attach", (e: BridgeAttachPayload) => {
      this.targetHasFocusValue = true;
      this.eventsValue.emit("attach", {
        hasAccess: e.hasAccess,
        isFullscreen: e.is_fullscreen,
        x: e.bounds.x,
        y: e.bounds.y,
        width: e.bounds.width,
        height: e.bounds.height,
      });
    });
    bridge.on("fullscreen", (e: { is_fullscreen: boolean }) => {
      this.eventsValue.emit("fullscreen", { isFullscreen: e.is_fullscreen });
    });
    bridge.on("focus", () => {
      this.targetHasFocusValue = true;
      this.eventsValue.emit("focus");
    });
    bridge.on("blur", () => {
      this.targetHasFocusValue = false;
      this.eventsValue.emit("blur");
    });
    bridge.on("detach", () => {
      this.targetHasFocusValue = false;
      this.eventsValue.emit("detach");
    });
  }

  /** Wires the bridge if it exists; returns it for the caller's use. */
  private ensureWired(): KWinBridge | undefined {
    const bridge = getKWinBridge();
    if (bridge) this.wire(bridge);
    return bridge;
  }

  private requireBridge(): KWinBridge {
    return this.ensureWired() ?? ensureAutoBridge();
  }

  get events(): EventEmitter {
    this.ensureWired();
    return this.eventsValue;
  }

  get targetBounds(): Rectangle {
    this.ensureWired();
    return getKWinBridge()?.targetBounds ?? DEFAULT_RECT;
  }

  get targetHasFocus(): boolean {
    return this.targetHasFocusValue;
  }

  activateOverlay(): void {
    const bridge = this.requireBridge();
    void bridge
      .activateOverlay()
      .catch((error) => reportAsyncError("activateOverlay", error));
  }

  focusTarget(): void {
    const bridge = this.requireBridge();
    void bridge
      .focusGame()
      .catch((error) => reportAsyncError("focusTarget", error));
  }

  attachByTitle(
    electronWindow: BrowserWindow | undefined,
    targetWindowTitle: string,
    _options?: AttachOptions,
  ): void {
    const bridge = this.requireBridge();
    bridge.bindOverlayWindow(electronWindow ?? undefined);
    // the KWin script tracks the game by title and matches/focuses the
    // overlay window by its title; keep both in sync with the attach request
    // (no-ops unless the configured values changed). The derived title also
    // feeds the auto-mode popup layer rule (design D3).
    const overlayTitle = electronWindow?.getTitle();
    void bridge
      .updateConfig(
        overlayTitle !== undefined
          ? { gameTitle: targetWindowTitle, overlayTitle }
          : { gameTitle: targetWindowTitle },
      )
      .catch((error) => reportAsyncError("updateConfig", error));
  }

  screenshot(): Buffer {
    throw new Error("Not implemented on your platform.");
  }
}

/**
 * Builds the controller for the given backend. Exposed for unit tests;
 * production code uses the OverlayController singleton, which fixes the
 * backend once at import (design D6).
 */
export function createOverlayController(
  backend: OverlayBackendKind,
): OverlayControllerApi {
  return backend === "wayland"
    ? new WaylandOverlayController()
    : // the original implementation satisfies the facade surface 1:1
      (X11OverlayController as OverlayControllerApi);
}

export const OverlayController: OverlayControllerApi =
  createOverlayController(detectBackend());

/**
 * Bind the overlay BrowserWindow to the KWin bridge (Wayland backend),
 * initializing the bridge under the hood when the app did not (design D1).
 * A no-op on every other backend, so callers can invoke it unconditionally
 * (design D3/D7).
 */
export function bindOverlayWindow(window?: BrowserWindow): void {
  if (isWaylandBackend()) {
    ensureAutoBridge().bindOverlayWindow(window ?? undefined);
  }
}

/**
 * Subscribe to compositor shortcut events (Wayland backend). Delivered via
 * the bridge whenever it exists — immediately, or as soon as it is created —
 * so the seam works regardless of initialization order. Subscribing does not
 * itself initialize the bridge; a no-op off Wayland.
 */
export function onShortcut(listener: (id: string) => void): void {
  if (isWaylandBackend()) {
    onKWinBridgeInit((bridge) => bridge.onShortcut(listener));
  }
}

/**
 * Subscribe to compositor cursor position events (Wayland backend). Same
 * delivery semantics as onShortcut.
 */
export function onCursor(
  listener: (position: { x: number; y: number }) => void,
): void {
  if (isWaylandBackend()) {
    onKWinBridgeInit((bridge) => bridge.onCursor(listener));
  }
}
