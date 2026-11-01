import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

/**
 * The facade fixes its backend at import (design D6), so every scenario
 * re-imports src/facade with mocks configured for that backend.
 */

const { x11Opts, holder } = vi.hoisted(() => {
  const x11Opts = {
    fullscreenable: true,
    skipTaskbar: true,
    frame: false,
    show: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    alwaysOnTop: false,
  };
  // EventEmitter-backed stubs are built lazily inside the mock factories
  // (vi.hoisted runs before imports, so it cannot construct them itself).
  const holder: {
    x11Controller?: Record<string, unknown>;
    bridgeStub?: EventEmitter;
  } = {};
  return { x11Opts, holder };
});

vi.mock("electron-overlay-window", async () => {
  const { EventEmitter } = await import("node:events");
  if (!holder.x11Controller) {
    holder.x11Controller = {
      targetBounds: { x: 0, y: 0, width: 0, height: 0 },
      targetHasFocus: false,
      events: new EventEmitter(),
      activateOverlay: vi.fn(),
      focusTarget: vi.fn(),
      attachByTitle: vi.fn(),
      screenshot: vi.fn(),
    };
  }
  return {
    OverlayController: holder.x11Controller,
    OVERLAY_WINDOW_OPTS: x11Opts,
  };
});

vi.mock("../src/kwin", async () => {
  const { EventEmitter } = await import("node:events");
  if (!holder.bridgeStub) {
    holder.bridgeStub = Object.assign(new EventEmitter(), {
      targetBounds: { x: 1, y: 2, width: 3, height: 4 },
      activateOverlay: vi.fn(async () => {}),
      focusGame: vi.fn(async () => {}),
      bindOverlayWindow: vi.fn(),
      updateConfig: vi.fn(async () => {}),
    });
  }
  return {
    getKWinBridge: vi.fn(() => holder.bridgeStub),
    onKWinBridgeInit: vi.fn(),
  };
});

const x11Controller = () => holder.x11Controller!;
const bridgeStub = () => holder.bridgeStub!;

const detect = vi.hoisted(() => ({
  detectBackend: vi.fn<() => "x11" | "wayland">(() => "x11"),
  isWaylandBackend: vi.fn(() => false),
}));

vi.mock("../src/detect", () => ({
  detectBackend: detect.detectBackend,
  isWaylandBackend: detect.isWaylandBackend,
  OverlayBackendKind: undefined,
}));

async function loadFacade(backend: "x11" | "wayland") {
  vi.resetModules();
  detect.detectBackend.mockReturnValue(backend);
  detect.isWaylandBackend.mockReturnValue(backend === "wayland");
  return await import("../src/facade");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OverlayController on x11", () => {
  it("delegates activateOverlay and focusTarget to the original", async () => {
    const { OverlayController } = await loadFacade("x11");
    OverlayController.activateOverlay();
    OverlayController.focusTarget();
    expect(x11Controller().activateOverlay).toHaveBeenCalledOnce();
    expect(x11Controller().focusTarget).toHaveBeenCalledOnce();
    expect(bridgeStub().activateOverlay).not.toHaveBeenCalled();
  });

  it("delegates attachByTitle to the original and never touches the bridge", async () => {
    const { OverlayController } = await loadFacade("x11");
    const window = { id: 1 } as never;
    OverlayController.attachByTitle(window, "Some Game");
    expect(x11Controller().attachByTitle).toHaveBeenCalledWith(
      window,
      "Some Game",
    );
    expect(bridgeStub().bindOverlayWindow).not.toHaveBeenCalled();
  });

  it("bindOverlayWindow is a no-op on non-Wayland", async () => {
    const { bindOverlayWindow } = await loadFacade("x11");
    const window = { id: 2 } as never;
    bindOverlayWindow(window);
    expect(bridgeStub().bindOverlayWindow).not.toHaveBeenCalled();
  });

  it("OVERLAY_WINDOW_OPTS are the original options unchanged", async () => {
    const { OVERLAY_WINDOW_OPTS } = await loadFacade("x11");
    expect(OVERLAY_WINDOW_OPTS).toEqual(x11Opts);
  });
});

describe("OverlayController on wayland", () => {
  it("routes activateOverlay to the bridge (which owns ignoreMouseEvents)", async () => {
    const { OverlayController } = await loadFacade("wayland");
    OverlayController.activateOverlay();
    expect(bridgeStub().activateOverlay).toHaveBeenCalledOnce();
    expect(x11Controller().activateOverlay).not.toHaveBeenCalled();
  });

  it("routes focusTarget to the bridge's focusGame", async () => {
    const { OverlayController } = await loadFacade("wayland");
    OverlayController.focusTarget();
    expect(bridgeStub().focusGame).toHaveBeenCalledOnce();
    expect(x11Controller().focusTarget).not.toHaveBeenCalled();
  });

  it("attachByTitle binds the overlay window and syncs the game title", async () => {
    const { OverlayController } = await loadFacade("wayland");
    const window = { id: 3 } as never;
    OverlayController.attachByTitle(window, "My Game");
    expect(bridgeStub().bindOverlayWindow).toHaveBeenCalledWith(window);
    expect(bridgeStub().updateConfig).toHaveBeenCalledWith({
      gameTitle: "My Game",
    });
  });

  it("targetBounds mirrors the bridge's tracked bounds", async () => {
    const { OverlayController } = await loadFacade("wayland");
    expect(OverlayController.targetBounds).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });

  it("reshapes bridge attach events to the original AttachEvent shape", async () => {
    const { OverlayController } = await loadFacade("wayland");
    const seen: unknown[] = [];
    OverlayController.events.on("attach", (e) => seen.push(e));
    bridgeStub().emit("attach", {
      hasAccess: undefined,
      is_fullscreen: true,
      bounds: { x: 5, y: 6, width: 7, height: 8 },
    });
    expect(seen).toEqual([
      {
        hasAccess: undefined,
        isFullscreen: true,
        x: 5,
        y: 6,
        width: 7,
        height: 8,
      },
    ]);
    expect(OverlayController.targetHasFocus).toBe(true);
  });

  it("tracks focus state from blur/detach events", async () => {
    const { OverlayController } = await loadFacade("wayland");
    bridgeStub().emit("focus");
    expect(OverlayController.targetHasFocus).toBe(true);
    bridgeStub().emit("blur");
    expect(OverlayController.targetHasFocus).toBe(false);
    bridgeStub().emit("attach", {
      hasAccess: undefined,
      is_fullscreen: false,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
    expect(OverlayController.targetHasFocus).toBe(true);
    bridgeStub().emit("detach");
    expect(OverlayController.targetHasFocus).toBe(false);
  });

  it("reshapes bridge fullscreen events", async () => {
    const { OverlayController } = await loadFacade("wayland");
    const seen: unknown[] = [];
    OverlayController.events.on("fullscreen", (e) => seen.push(e));
    bridgeStub().emit("fullscreen", { is_fullscreen: true });
    expect(seen).toEqual([{ isFullscreen: true }]);
  });

  it("bindOverlayWindow binds the window on the bridge", async () => {
    const { bindOverlayWindow } = await loadFacade("wayland");
    const window = { id: 4 } as never;
    bindOverlayWindow(window);
    expect(bridgeStub().bindOverlayWindow).toHaveBeenCalledWith(window);
  });

  it("OVERLAY_WINDOW_OPTS force resizable on Wayland", async () => {
    const { OVERLAY_WINDOW_OPTS } = await loadFacade("wayland");
    expect(OVERLAY_WINDOW_OPTS).toEqual({ ...x11Opts, resizable: true });
  });
});
