import { beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { parse } from "ini";
import { KWinBridge } from "../src/kwin/KWinBridge";

/**
 * The bridge is exercised with mocked DBus/filesystem so start(), config
 * changes and rule upserts are observable without a compositor.
 */

const { dbusMock, fsMock, execFileMock } = vi.hoisted(() => ({
  dbusMock: {
    sessionBus: vi.fn(),
    Message: class {
      constructor(public opts: unknown) {}
    },
    MessageType: { METHOD_CALL: 1, REPLY: 2, ERROR: 3, SIGNAL: 4 },
    interface: {
      Interface: class {
        static configureMembers = vi.fn();
        constructor(_name: string) {}
      },
      configureMembers: vi.fn(),
    },
  },
  fsMock: {
    existsSync: vi.fn<() => boolean>(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn<() => string>(() => ""),
    writeFileSync: vi.fn(),
  },
  execFileMock: vi.fn(),
}));

vi.mock("dbus-next", () => dbusMock);
vi.mock("node:fs", () => ({
  default: fsMock,
  existsSync: fsMock.existsSync,
  mkdirSync: fsMock.mkdirSync,
  readFileSync: fsMock.readFileSync,
  writeFileSync: fsMock.writeFileSync,
}));
vi.mock("node:child_process", () => ({
  default: { execFile: execFileMock },
  execFile: execFileMock,
}));

function mockBus(): void {
  dbusMock.sessionBus.mockReturnValue({
    call: vi.fn(async () => ({ type: 2, body: [true] })),
    export: vi.fn(),
    unexport: vi.fn(),
    requestName: vi.fn(async () => 1),
  });
}

/** Writes are the generated scripts (…/main.js) and kwinrulesrc. */
function writtenFiles(): { path: string; content: string }[] {
  return fsMock.writeFileSync.mock.calls.map(([p, c]) => ({
    path: p as string,
    content: c as string,
  }));
}

function mainScriptWrites(): string[] {
  return writtenFiles()
    .filter((f) => f.path.endsWith("main.js"))
    .map((f) => f.content);
}

function kwinRulesWrites(): string[] {
  return writtenFiles()
    .filter((f) => f.path.endsWith("kwinrulesrc"))
    .map((f) => f.content);
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.existsSync.mockReturnValue(false);
  fsMock.readFileSync.mockReturnValue("");
  execFileMock.mockImplementation(
    (_file: string, _args: string[], cb: (error: null) => void) => cb(null),
  );
  mockBus();
});

describe("ensureKWinBridge", () => {
  /**
   * The module keeps the singleton in module state, so every scenario loads
   * a fresh instance (the dbus/fs mocks are file-level and survive).
   */
  async function loadFresh(): Promise<
    typeof import("../src/kwin/KWinBridge")
  > {
    vi.resetModules();
    return await import("../src/kwin/KWinBridge");
  }

  it("creates the singleton once and reuses it", async () => {
    const { ensureKWinBridge: ensure } = await loadFresh();
    const first = ensure();
    const second = ensure();
    expect(second).toBe(first);
  });

  it("notifies init listeners when it creates the bridge", async () => {
    const { ensureKWinBridge: ensure, onKWinBridgeInit: onInit } =
      await loadFresh();
    const created: unknown[] = [];
    onInit((b) => created.push(b));
    const instance = ensure();
    expect(created).toEqual([instance]);
  });

  it("delivers to listeners registered after creation immediately", async () => {
    const { ensureKWinBridge: ensure, onKWinBridgeInit: onInit } =
      await loadFresh();
    const instance = ensure();
    const created: unknown[] = [];
    onInit((b) => created.push(b));
    expect(created).toEqual([instance]);
  });

  it("starts the bridge in the background exactly once", async () => {
    const {
      ensureKWinBridge: ensure,
      initKWinBridge: init,
      onKWinBridgeInit: _onInit,
    } = await loadFresh();
    const instance = ensure();
    ensure();
    init({ write: () => undefined }, tmpdir(), {
      gameTitle: "G",
      shortcuts: [],
      overlayTitle: "O",
      dbusServiceName: "io.example.X.KWin",
      windowClass: "wc",
    });
    await flushMicrotasks();
    // service bus + script loader bus, both established by the single start()
    expect(dbusMock.sessionBus).toHaveBeenCalledTimes(2);
    expect(instance.targetBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("applies the auto defaults: per-pid temp scripts dir and package DBus name", async () => {
    const { ensureKWinBridge: ensure } = await loadFresh();
    ensure();
    await vi.waitFor(() => {
      expect(fsMock.mkdirSync).toHaveBeenCalled();
      expect(mainScriptWrites()).toHaveLength(1);
    });
    const scriptDir = fsMock.mkdirSync.mock.calls[0][0] as string;
    expect(scriptDir.startsWith(tmpdir())).toBe(true);
    expect(scriptDir).toContain("electron-overlay-window-next");
    expect(scriptDir.endsWith(String(process.pid))).toBe(true);
    expect(mainScriptWrites()[0]).toContain(
      `"io.github.electron_overlay_window_next.KWin.pid${process.pid}"`,
    );
  });

  it("reports background start failures through the console error channel", async () => {
    const { ensureKWinBridge: ensure } = await loadFresh();
    dbusMock.sessionBus.mockReturnValue({
      call: vi.fn(async () => {
        throw new Error("dbus down");
      }),
      export: vi.fn(),
      unexport: vi.fn(),
      requestName: vi.fn(async () => 1),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ensure();
      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("KWin bridge auto-start failed"),
          expect.any(Error),
        ),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("KWinBridge config and layer rule", () => {
  const logger = { write: vi.fn() };

  it("installs a title-matched rule from the overlay title stored before start", async () => {
    const bridge = new KWinBridge(logger, "/tmp/scripts", {});
    await bridge.updateConfig({ gameTitle: "Game", overlayTitle: "Overlay" });
    await bridge.start();
    const rules = parse(kwinRulesWrites()[0]);
    const sections = Object.keys(rules).filter((k) => k !== "General");
    expect(rules[sections[0]]).toMatchObject({
      title: "Overlay",
      titlematch: "1",
      layer: "popup",
    });
    expect(rules[sections[0]].wmclass).toBeUndefined();
  });

  it("regenerates the script and re-upserts the rule when the overlay title changes after start", async () => {
    const bridge = new KWinBridge(logger, "/tmp/scripts", {});
    await bridge.start();
    expect(kwinRulesWrites()).toHaveLength(0); // no identity known yet
    await bridge.updateConfig({ overlayTitle: "New Title" });
    const scripts = mainScriptWrites();
    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain('"New Title"');
    const rules = parse(kwinRulesWrites()[0]);
    const sections = Object.keys(rules).filter((k) => k !== "General");
    expect(rules[sections[0]].title).toBe("New Title");
  });

  it("treats an unchanged overlay title as a no-op after start", async () => {
    const bridge = new KWinBridge(logger, "/tmp/scripts", {
      overlayTitle: "Same",
    });
    await bridge.start();
    const scriptsBefore = mainScriptWrites().length;
    await bridge.updateConfig({ overlayTitle: "Same" });
    expect(mainScriptWrites()).toHaveLength(scriptsBefore);
    expect(kwinRulesWrites()).toHaveLength(1); // only the start() install
  });

  it("keeps the WM_CLASS rule fixed in explicit mode while the script regenerates", async () => {
    const bridge = new KWinBridge(logger, "/tmp/scripts", {
      windowClass: "wc-overlay",
    });
    await bridge.start();
    const rulesBefore = kwinRulesWrites().length;
    await bridge.updateConfig({ overlayTitle: "Changed Title" });
    const scripts = mainScriptWrites();
    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain('"Changed Title"');
    expect(kwinRulesWrites()).toHaveLength(rulesBefore);
    const rules = parse(kwinRulesWrites()[0]);
    const sections = Object.keys(rules).filter((k) => k !== "General");
    expect(rules[sections[0]].wmclass).toBe("wc-overlay");
    expect(rules[sections[0]].title).toBeUndefined();
  });

  it("defers the rule install until a title is known in auto mode", async () => {
    const bridge = new KWinBridge(logger, "/tmp/scripts", {});
    await bridge.start();
    expect(kwinRulesWrites()).toHaveLength(0);
    await bridge.updateConfig({ overlayTitle: "Late Title" });
    expect(kwinRulesWrites()).toHaveLength(1);
  });
});
