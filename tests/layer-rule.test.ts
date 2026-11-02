import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse, encode } from "ini";
import {
  installOverlayLayerRule,
  removeOverlayLayerRule,
} from "../src/kwin/LayerRule";

const DESCRIPTION = "electron-overlay-window-next - Wayland overlay backend";
const WINDOW_CLASS = "test-overlay";

const { fsMock, execFileMock } = vi.hoisted(() => ({
  fsMock: {
    existsSync: vi.fn<() => boolean>(() => false),
    readFileSync: vi.fn<() => string>(() => ""),
    writeFileSync: vi.fn(),
  },
  execFileMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: fsMock,
  existsSync: fsMock.existsSync,
  readFileSync: fsMock.readFileSync,
  writeFileSync: fsMock.writeFileSync,
}));

vi.mock("node:child_process", () => ({
  default: { execFile: execFileMock },
  execFile: execFileMock,
}));

function writtenConfig(): Record<string, Record<string, string>> {
  expect(fsMock.writeFileSync).toHaveBeenCalled();
  const content = fsMock.writeFileSync.mock.lastCall![1] as string;
  return parse(content);
}

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.existsSync.mockReturnValue(false);
  fsMock.readFileSync.mockReturnValue("");
  execFileMock.mockImplementation(
    (_file: string, _args: string[], cb: (error: null) => void) => cb(null),
  );
});

describe("installOverlayLayerRule", () => {
  it("installs a popup layer rule for the configured window class", async () => {
    await installOverlayLayerRule({
      description: DESCRIPTION,
      windowClass: WINDOW_CLASS,
    });
    const config = writtenConfig();
    const sections = Object.keys(config).filter((key) => key !== "General");
    expect(sections).toHaveLength(1);
    expect(config[sections[0]]).toMatchObject({
      Description: DESCRIPTION,
      wmclass: WINDOW_CLASS,
      wmclassmatch: "1",
      layer: "popup",
      layerrule: "2",
    });
    expect(config.General.rules).toBe(sections[0]);
    expect(config.General.count).toBe("1");
    expect(execFileMock).toHaveBeenCalledWith(
      "busctl",
      [
        "--user",
        "call",
        "org.kde.KWin",
        "/KWin",
        "org.kde.KWin",
        "reconfigure",
      ],
      expect.any(Function),
    );
  });

  it("preserves unrelated user rules and appends itself to the list", async () => {
    const userRule = "11111111-2222-3333-4444-555555555555";
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(
      encode({
        General: { rules: userRule, count: "1" },
        [userRule]: { Description: "A user rule" },
      }),
    );
    await installOverlayLayerRule({
      description: DESCRIPTION,
      windowClass: WINDOW_CLASS,
    });
    const config = writtenConfig();
    const sections = Object.keys(config).filter((key) => key !== "General");
    expect(sections).toHaveLength(2);
    expect(config[userRule]).toMatchObject({ Description: "A user rule" });
    const own = sections.find((key) => key !== userRule)!;
    expect(config[own].wmclass).toBe(WINDOW_CLASS);
    expect(config.General.rules).toBe(`${userRule},${own}`);
    expect(config.General.count).toBe("2");
  });

  it("is idempotent when the installed rule already matches", async () => {
    await installOverlayLayerRule({
      description: DESCRIPTION,
      windowClass: WINDOW_CLASS,
    });
    const installed = fsMock.writeFileSync.mock.lastCall![1] as string;
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(installed);
    await installOverlayLayerRule({
      description: DESCRIPTION,
      windowClass: WINDOW_CLASS,
    });
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("installs a title-matched popup rule when no window class is given", async () => {
    await installOverlayLayerRule({
      description: DESCRIPTION,
      overlayTitle: "My Overlay",
    });
    const config = writtenConfig();
    const sections = Object.keys(config).filter((key) => key !== "General");
    expect(sections).toHaveLength(1);
    expect(config[sections[0]]).toMatchObject({
      Description: DESCRIPTION,
      title: "My Overlay",
      titlematch: "1",
      layer: "popup",
      layerrule: "2",
    });
    expect(config[sections[0]].wmclass).toBeUndefined();
  });

  it("updates the match in place when re-run with a new title", async () => {
    await installOverlayLayerRule({
      description: DESCRIPTION,
      overlayTitle: "Old Title",
    });
    const installed = fsMock.writeFileSync.mock.lastCall![1] as string;
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(installed);
    execFileMock.mockImplementation(
      (_file: string, _args: string[], cb: (error: null) => void) => cb(null),
    );
    await installOverlayLayerRule({
      description: DESCRIPTION,
      overlayTitle: "New Title",
    });
    const config = writtenConfig();
    const sections = Object.keys(config).filter((key) => key !== "General");
    expect(sections).toHaveLength(1);
    expect(config[sections[0]].title).toBe("New Title");
    expect(config.General.count).toBe("1");
  });

  it("rejects when neither a window class nor an overlay title is given", async () => {
    await expect(
      installOverlayLayerRule({ description: DESCRIPTION }),
    ).rejects.toThrow("window class or an overlay title");
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects when the KWin reconfigure call fails", async () => {
    execFileMock.mockImplementation(
      (_file: string, _args: string[], cb: (error: Error) => void) =>
        cb(new Error("busctl exploded")),
    );
    await expect(
      installOverlayLayerRule({
        description: DESCRIPTION,
        windowClass: WINDOW_CLASS,
      }),
    ).rejects.toThrow("KWin reconfigure failed");
  });
});

describe("removeOverlayLayerRule", () => {
  it("drops only the package's own rule", async () => {
    const userRule = "11111111-2222-3333-4444-555555555555";
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(
      encode({
        General: { rules: `${userRule},own-rule-uuid`, count: "2" },
        [userRule]: { Description: "A user rule" },
        "own-rule-uuid": { Description: DESCRIPTION },
      }),
    );
    await removeOverlayLayerRule({ description: DESCRIPTION });
    const config = writtenConfig();
    expect(Object.keys(config)).not.toContain("own-rule-uuid");
    expect(config[userRule]).toMatchObject({ Description: "A user rule" });
    expect(config.General.rules).toBe(userRule);
    expect(config.General.count).toBe("1");
  });

  it("is a no-op (no write, no reconfigure) when the rule is absent", async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(
      encode({
        General: { rules: "other", count: "1" },
        other: { Description: "Something else" },
      }),
    );
    await removeOverlayLayerRule({ description: DESCRIPTION });
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
