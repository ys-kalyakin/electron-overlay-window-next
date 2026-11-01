import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";
import type { BrowserWindow } from "electron";
import { KWinDBusService, type WindowBounds } from "./DBusService";
import { KWinScriptLoader } from "./ScriptLoader";
import {
  generateFocusGameScript,
  generateFocusOverlayScript,
  generateMainScript,
  generateRestoreLayerScript,
} from "./script";
import {
  installOverlayLayerRule,
  removeOverlayLayerRule,
} from "./LayerRule";
import type { Logger, ShortcutBinding } from "./types";

const SCRIPT_NAME_PREFIX = "electron-overlay-window-next";
const MAIN_SCRIPT_NAME = `${SCRIPT_NAME_PREFIX}-overlay`;
const FOCUS_OVERLAY_SCRIPT_NAME = `${SCRIPT_NAME_PREFIX}-focus-overlay`;
const FOCUS_GAME_SCRIPT_NAME = `${SCRIPT_NAME_PREFIX}-focus-game`;
const RESTORE_PANELS_SCRIPT_NAME = `${SCRIPT_NAME_PREFIX}-restore-panels`;
const LAYER_RULE_DESCRIPTION = `${SCRIPT_NAME_PREFIX} - Wayland overlay backend`;
const DEFAULT_BOUNDS: WindowBounds = { x: 0, y: 0, width: 0, height: 0 };

export type { ShortcutBinding };

export interface KWinBridgeOptions {
  gameTitle: string;
  shortcuts: ShortcutBinding[];
  /** Overlay BrowserWindow title the KWin scripts match and focus. */
  overlayTitle: string;
  /** Base DBus name of the bridge service; the runtime name appends .pid<pid>. */
  dbusServiceName: string;
  /** WM_CLASS of the overlay window, used by the popup layer rule. */
  windowClass: string;
}

/**
 * KDE Wayland overlay backend. Owns the DBus bridge and the generated KWin
 * script that drives game window tracking, overlay placement and stacking.
 *
 * The bridge re-exposes the tracking surface of electron-overlay-window
 * ("attach"/"focus"/"blur"/"detach"/"fullscreen" events plus targetBounds)
 * so GameWindow consumes both backends through the same contract. It also
 * mirrors the overlay window management OverlayController does internally
 * on X11 (show on attach/focus, hide on blur/detach, ignoreMouseEvents).
 */
export class KWinBridge extends EventEmitter {
  private service: KWinDBusService;
  private loader = new KWinScriptLoader();
  private targetBoundsValue: WindowBounds = { ...DEFAULT_BOUNDS };
  private gameTitle: string;
  private shortcuts: ShortcutBinding[];
  private overlayWindow?: BrowserWindow;
  private focusNext: "overlay" | "target" | undefined;
  private targetHasFocus = false;
  private started = false;
  private lastCursorValue?: { x: number; y: number };
  private overlayTitle: string;
  private dbusServiceName: string;
  private windowClass: string;

  constructor(
    private logger: Logger,
    private scriptDir: string,
    options: KWinBridgeOptions,
  ) {
    super();
    this.gameTitle = options.gameTitle;
    this.shortcuts = options.shortcuts;
    this.overlayTitle = options.overlayTitle;
    this.dbusServiceName = options.dbusServiceName;
    this.windowClass = options.windowClass;
    this.service = new KWinDBusService(this.dbusServiceName, {
      onAttach: (isFullscreen, bounds) => {
        this.targetBoundsValue = bounds;
        this.targetHasFocus = true;
        this.showOverlayWindow(true);
        this.emit("attach", {
          hasAccess: undefined,
          is_fullscreen: isFullscreen,
          bounds,
        });
      },
      onBounds: (bounds) => {
        this.targetBoundsValue = bounds;
      },
      onFocus: () => {
        this.focusNext = undefined;
        this.targetHasFocus = true;
        this.showOverlayWindow(true);
        this.emit("focus");
      },
      onBlur: () => {
        this.targetHasFocus = false;
        if (
          this.focusNext !== "overlay" &&
          !(this.overlayWindow?.isFocused() ?? false)
        ) {
          this.overlayWindow?.hide();
        }
        this.emit("blur");
      },
      onFullscreen: (isFullscreen) => {
        this.emit("fullscreen", { is_fullscreen: isFullscreen });
      },
      onDetach: () => {
        this.targetBoundsValue = { ...DEFAULT_BOUNDS };
        this.overlayWindow?.hide();
        this.emit("detach");
      },
      onCursor: (x, y) => {
        this.lastCursorValue = { x, y };
        this.emit("cursor", { x, y });
      },
      onShortcut: (id) => {
        this.emit("shortcut", id);
      },
    });
  }

  get targetBounds(): WindowBounds {
    return this.targetBoundsValue;
  }

  /** Last cursor position reported by the compositor (global coordinates). */
  get lastCursor(): { x: number; y: number } | undefined {
    return this.lastCursorValue;
  }

  onShortcut(listener: (id: string) => void): this {
    return this.on("shortcut", listener);
  }

  onCursor(listener: (position: { x: number; y: number }) => void): this {
    return this.on("cursor", listener);
  }

  /** The overlay BrowserWindow mirrors OverlayController's internal handling. */
  bindOverlayWindow(window: BrowserWindow | undefined): void {
    this.overlayWindow = window;
  }

  /** Loads the compositor bridge: DBus service first, then the KWin script. */
  async start(): Promise<void> {
    if (this.started) return;
    await this.service.start();
    await this.installLayerRuleSafe();
    await this.loadMainScript();
    this.started = true;
    this.logger.write("info [KWin] bridge started");
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.loader.unloadScript(MAIN_SCRIPT_NAME).catch(() => undefined);
    // the main script can no longer re-raise the game once unloaded
    await this.runOneShot(
      RESTORE_PANELS_SCRIPT_NAME,
      generateRestoreLayerScript(this.gameTitle),
    ).catch(() => undefined);
    await removeOverlayLayerRule({
      description: LAYER_RULE_DESCRIPTION,
    }).catch(() => undefined);
    this.service.stop();
    this.started = false;
    this.logger.write("info [KWin] bridge stopped");
  }

  /** Floats the overlay above the compositor's fullscreen stacking layer. */
  private async installLayerRuleSafe(): Promise<void> {
    try {
      await installOverlayLayerRule({
        description: LAYER_RULE_DESCRIPTION,
        windowClass: this.windowClass,
      });
    } catch (error) {
      this.logger.write(
        `error [KWin] failed to install the overlay layer rule: ${error}`,
      );
    }
  }

  /** Regenerates and reloads the script; used when title or hotkeys change. */
  async updateConfig(options: Partial<KWinBridgeOptions>): Promise<void> {
    let reload = false;
    if (
      options.gameTitle !== undefined &&
      options.gameTitle !== this.gameTitle
    ) {
      this.gameTitle = options.gameTitle;
      reload = true;
    }
    if (options.shortcuts !== undefined) {
      const next = JSON.stringify(options.shortcuts);
      if (next !== JSON.stringify(this.shortcuts)) {
        this.shortcuts = options.shortcuts;
        reload = true;
      }
    }
    if (reload && this.started) {
      await this.loadMainScript();
      this.logger.write("info [KWin] script reloaded (config changed)");
    }
  }

  async activateOverlay(): Promise<void> {
    this.focusNext = "overlay";
    this.overlayWindow?.setIgnoreMouseEvents(false);
    await this.runOneShot(
      FOCUS_OVERLAY_SCRIPT_NAME,
      generateFocusOverlayScript(this.overlayTitle),
    );
  }

  async focusGame(): Promise<void> {
    this.focusNext = "target";
    this.overlayWindow?.setIgnoreMouseEvents(true);
    await this.runOneShot(
      FOCUS_GAME_SCRIPT_NAME,
      generateFocusGameScript(this.gameTitle),
    );
  }

  private async loadMainScript(): Promise<void> {
    const scriptFile = this.writeScript(
      "main.js",
      generateMainScript({
        serviceName: this.service.serviceName,
        dbusPath: this.service.dbusPath,
        dbusInterface: this.service.dbusInterface,
        gameTitle: this.gameTitle,
        overlayTitle: this.overlayTitle,
        shortcuts: this.shortcuts,
      }),
    );
    await this.loader.unloadScript(MAIN_SCRIPT_NAME);
    await this.loader.loadScript(scriptFile, MAIN_SCRIPT_NAME);
    await this.loader.start();
  }

  private async runOneShot(name: string, content: string): Promise<void> {
    const scriptFile = this.writeScript(`${name}.js`, content);
    await this.loader.unloadScript(name);
    await this.loader.loadScript(scriptFile, name);
    await this.loader.start();
  }

  private writeScript(fileName: string, content: string): string {
    const resolvedRoot = path.resolve(this.scriptDir);
    const filePath = path.resolve(resolvedRoot, fileName);
    if (!filePath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(
        `Script file name escapes the script directory: ${fileName}`,
      );
    }
    fs.mkdirSync(resolvedRoot, { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  private showOverlayWindow(ignoreMouse: boolean): void {
    const window = this.overlayWindow;
    if (!window) return;
    window.setIgnoreMouseEvents(ignoreMouse);
    if (!window.isVisible()) {
      window.showInactive();
    }
  }
}

let bridge: KWinBridge | undefined;
const bridgeInitListeners = new Set<(bridge: KWinBridge) => void>();

export function getKWinBridge(): KWinBridge | undefined {
  return bridge;
}

/**
 * Notifies the listener when the singleton bridge is created (immediately if
 * it already exists). Internal seam: lets the facade wire its event
 * forwarding as soon as the bridge is initialized, regardless of call order.
 */
export function onKWinBridgeInit(
  listener: (bridge: KWinBridge) => void,
): void {
  if (bridge) listener(bridge);
  bridgeInitListeners.add(listener);
}

export function initKWinBridge(
  logger: Logger,
  scriptDir: string,
  options: KWinBridgeOptions,
): KWinBridge {
  let instance = bridge;
  if (!instance) {
    instance = new KWinBridge(logger, scriptDir, options);
    bridge = instance;
    for (const listener of bridgeInitListeners) listener(instance);
  }
  return instance;
}
