import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EventEmitter } from "node:events";

/**
 * The facade fixes its backend at import (design D6), so every scenario
 * re-imports src/facade with mocks configured for that backend.
 */

const { x11Opts, holder, electronAppOnce } = vi.hoisted(() => {
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
  const holder = {
    x11Controller: undefined as Record<string, unknown> | undefined,
    bridgeStub: undefined as BridgeStub | undefined,
    initListeners: [] as Array<(bridge: BridgeStub) => void>,
    ensureCount: 0,
  };
  return { x11Opts, holder, electronAppOnce: vi.fn() };
});

type BridgeStub = EventEmitter & {
  targetBounds: { x: number; y: number; width: number; height: number };
  activateOverlay: Mock;
  focusGame: Mock;
  bindOverlayWindow: Mock;
  updateConfig: Mock;
  stop: Mock;
  onShortcut: Mock;
  onCursor: Mock;
};

function makeBridgeStub(): BridgeStub {
  // EventEmitter-backed stub built lazily so vi.fn instances are fresh per
  // construction (vi.hoisted runs before imports).
  return Object.assign(new EventEmitter(), {
    targetBounds: { x: 1, y: 2, width: 3, height: 4 },
    activateOverlay: vi.fn(async () => {}),
    focusGame: vi.fn(async () => {}),
    bindOverlayWindow: vi.fn(),
    updateConfig: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    onShortcut: vi.fn(),
    onCursor: vi.fn(),
  }) as BridgeStub;
}

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

vi.mock("electron", () => ({
  app: { once: electronAppOnce },
}));

vi.mock("../src/kwin", () => ({
  getKWinBridge: vi.fn(() => holder.bridgeStub),
  ensureKWinBridge: vi.fn(() => {
    holder.ensureCount += 1;
    if (!holder.bridgeStub) {
      holder.bridgeStub = makeBridgeStub();
      for (const listener of holder.initListeners) listener(holder.bridgeStub);
    }
    return holder.bridgeStub;
  }),
  onKWinBridgeInit: vi.fn((listener: (bridge: BridgeStub) => void) => {
    holder.initListeners.push(listener);
    if (holder.bridgeStub) listener(holder.bridgeStub);
  }),
}));

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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  holder.bridgeStub = makeBridgeStub();
  holder.initListeners = [];
  holder.ensureCount = 0;
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
    const { OverlayController, bindOverlayWindow, onShortcut } =
      await loadFacade("x11");
    const window = { id: 1 } as never;
    OverlayController.attachByTitle(window, "Some Game");
    bindOverlayWindow(window);
    onShortcut(() => {});
    expect(x11Controller().attachByTitle).toHaveBeenCalledWith(
      window,
      "Some Game",
    );
    expect(bridgeStub().bindOverlayWindow).not.toHaveBeenCalled();
    expect(holder.ensureCount).toBe(0);
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
    const window = { id: 3, getTitle: () => undefined } as never;
    OverlayController.attachByTitle(window, "My Game");
    expect(bridgeStub().bindOverlayWindow).toHaveBeenCalledWith(window);
    expect(bridgeStub().updateConfig).toHaveBeenCalledWith({
      gameTitle: "My Game",
    });
  });

  it("auto-initializes the bridge on attach without explicit init", async () => {
    holder.bridgeStub = undefined;
    const { OverlayController } = await loadFacade("wayland");
    const window = { id: 30, getTitle: () => "My Overlay" } as never;
    OverlayController.attachByTitle(window, "My Game");
    expect(holder.ensureCount).toBe(1);
    expect(bridgeStub().bindOverlayWindow).toHaveBeenCalledWith(window);
    expect(bridgeStub().updateConfig).toHaveBeenCalledWith({
      gameTitle: "My Game",
      overlayTitle: "My Overlay",
    });
  });

  it("initializes the bridge when the overlay window is bound before attach", async () => {
    holder.bridgeStub = undefined;
    const { bindOverlayWindow } = await loadFacade("wayland");
    const window = { id: 31 } as never;
    bindOverlayWindow(window);
    expect(holder.ensureCount).toBe(1);
    expect(bridgeStub().bindOverlayWindow).toHaveBeenCalledWith(window);
  });

  it("keeps an already-initialized bridge untouched by the auto path", async () => {
    const { OverlayController } = await loadFacade("wayland");
    OverlayController.activateOverlay();
    OverlayController.attachByTitle(undefined, "My Game");
    expect(holder.ensureCount).toBe(0);
    expect(bridgeStub().activateOverlay).toHaveBeenCalledOnce();
    expect(bridgeStub().updateConfig).toHaveBeenCalledWith({
      gameTitle: "My Game",
    });
  });

  it("stops an auto-initialized bridge when the Electron app quits", async () => {
    holder.bridgeStub = undefined;
    const { OverlayController } = await loadFacade("wayland");
    OverlayController.attachByTitle(
      { id: 32, getTitle: () => "Ov" } as never,
      "Game",
    );
    await vi.waitFor(() =>
      expect(electronAppOnce).toHaveBeenCalledWith(
        "will-quit",
        expect.any(Function),
      ),
    );
    const handler = electronAppOnce.mock.calls.find(
      (call) => call[0] === "will-quit",
    )![1] as () => Promise<void>;
    await handler();
    expect(bridgeStub().stop).toHaveBeenCalledOnce();
  });

  it("registers the quit hook once even across repeated auto ensures", async () => {
    holder.bridgeStub = undefined;
    const { OverlayController, bindOverlayWindow } =
      await loadFacade("wayland");
    bindOverlayWindow({ id: 33, getTitle: () => "A" } as never);
    OverlayController.attachByTitle(
      { id: 34, getTitle: () => "B" } as never,
      "Game",
    );
    await vi.waitFor(() => expect(electronAppOnce).toHaveBeenCalled());
    expect(electronAppOnce).toHaveBeenCalledTimes(1);
  });

  it("does not hook quit for already-initialized bridges", async () => {
    const { OverlayController } = await loadFacade("wayland");
    OverlayController.attachByTitle(undefined, "Game");
    await flush();
    expect(electronAppOnce).not.toHaveBeenCalled();
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

describe("compositor seams on wayland", () => {
  it("holds shortcut subscriptions made before the bridge exists", async () => {
    holder.bridgeStub = undefined;
    const { onShortcut } = await loadFacade("wayland");
    const listener = vi.fn();
    onShortcut(listener);
    expect(holder.ensureCount).toBe(0); // subscribing must not initialize
    const { OverlayController } = await import("../src/facade");
    OverlayController.attachByTitle(
      { id: 40, getTitle: () => "O" } as never,
      "G",
    );
    expect(bridgeStub().onShortcut).toHaveBeenCalledWith(listener);
  });

  it("delivers cursor subscriptions made after init immediately", async () => {
    const { onCursor } = await loadFacade("wayland");
    const listener = vi.fn();
    onCursor(listener);
    expect(bridgeStub().onCursor).toHaveBeenCalledWith(listener);
    expect(holder.ensureCount).toBe(0);
  });

  it("are no-ops off Wayland", async () => {
    const { onShortcut, onCursor } = await loadFacade("x11");
    const listener = vi.fn();
    onShortcut(listener);
    onCursor(listener);
    expect(bridgeStub().onShortcut).not.toHaveBeenCalled();
    expect(bridgeStub().onCursor).not.toHaveBeenCalled();
  });
});
