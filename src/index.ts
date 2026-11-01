/**
 * Public API of electron-overlay-window-next: a drop-in replacement for
 * electron-overlay-window that adds KDE Plasma 6 Wayland support through the
 * KWin compositor (design D2).
 *
 * - OverlayController / OVERLAY_WINDOW_OPTS / AttachEvent — the original
 *   controller surface, routed per backend by src/facade.ts
 * - detectBackend / isWaylandBackend — the single source of truth for
 *   backend selection (design D4)
 * - getKWinBridge / initKWinBridge / bindOverlayWindow — bridge access and
 *   the overlay-window binding seam (design D3/D5)
 */
export {
  OverlayController,
  OVERLAY_WINDOW_OPTS,
  bindOverlayWindow,
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
