/**
 * Public API of electron-overlay-window-next: a drop-in replacement for
 * electron-overlay-window that adds KDE Plasma 6 Wayland support through the
 * KWin compositor (design D2).
 *
 * - OverlayController / OVERLAY_WINDOW_OPTS / AttachEvent — the original
 *   controller surface, routed per backend by src/facade.ts
 * - detectBackend / isWaylandBackend — the single source of truth for
 *   backend selection (design D4)
 * - bindOverlayWindow — the overlay-window binding seam (design D3/D7); on
 *   Wayland the bridge auto-initializes with defaults under the hood
 *   (design D1)
 * - onShortcut / onCursor — order-safe compositor event seams for app-level
 *   handling (design D6)
 * - getKWinBridge / initKWinBridge — explicit bridge access and
 *   initialization (the override for custom logger, scripts dir, DBus name,
 *   shortcuts, or WM_CLASS-based rule matching)
 */
export {
  OverlayController,
  OVERLAY_WINDOW_OPTS,
  bindOverlayWindow,
  onShortcut,
  onCursor,
  type OverlayControllerApi,
} from "./facade";
export type { AttachEvent, AttachOptions } from "electron-overlay-window";
export {
  detectBackend,
  isWaylandBackend,
  type OverlayBackendKind,
} from "./detect";
export {
  getKWinBridge,
  initKWinBridge,
  type KWinBridge,
  type KWinBridgeOptions,
} from "./kwin";
export type { Logger, ShortcutBinding } from "./kwin";
