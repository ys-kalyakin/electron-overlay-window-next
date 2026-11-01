import { describe, expect, it } from "vitest";
import {
  generateFocusGameScript,
  generateFocusOverlayScript,
  generateMainScript,
  generateRestoreLayerScript,
} from "../src/kwin/script";
import type { ShortcutBinding } from "../src/kwin/types";

const shortcuts: ShortcutBinding[] = [
  ["focusOverlay", "Meta+O"],
  ["focusGame", "Meta+G"],
];

describe("KWin script generators", () => {
  it("main script contains the configured title, hotkeys and DBus name", () => {
    const script = generateMainScript({
      serviceName: "io.example.TestApp.KWin.pid1234",
      dbusPath: "/io/example/TestApp/KWin",
      dbusInterface: "io.example.TestApp.KWin",
      gameTitle: "My Cool Game",
      overlayTitle: "My Overlay",
      shortcuts,
    });
    expect(script).toContain('"My Cool Game"');
    expect(script).toContain('"My Overlay"');
    expect(script).toContain('"io.example.TestApp.KWin.pid1234"');
    expect(script).toContain('["focusOverlay", "Meta+O"]');
    expect(script).toContain('["focusGame", "Meta+G"]');
    expect(script).toMatchSnapshot();
  });

  it("focus one-shot scripts target the requested window titles", () => {
    expect(generateFocusOverlayScript("My Overlay")).toContain('"My Overlay"');
    expect(generateFocusGameScript("My Cool Game")).toContain('"My Cool Game"');
  });

  it("restore script releases the game window's raised layer", () => {
    const script = generateRestoreLayerScript("My Cool Game");
    expect(script).toContain('"My Cool Game"');
    expect(script).toContain("keepAbove = false");
    expect(script).toContain("keepBelow = false");
  });
});
