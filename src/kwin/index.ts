/**
 * Aggregator for the ported KWin bridge module. Session/backend detection
 * lives in src/detect.ts (design D4), not here.
 */
export { getKWinBridge, initKWinBridge, onKWinBridgeInit } from "./KWinBridge";
export type { KWinBridge, KWinBridgeOptions } from "./KWinBridge";
export type { Logger, ShortcutBinding } from "./types";
