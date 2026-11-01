import { describe, expect, it } from "vitest";
import { detectBackendFrom } from "../src/detect";

const session = {
  x11: { XDG_SESSION_TYPE: "x11" } as NodeJS.ProcessEnv,
  /** KDE Plasma Wayland: XDG_CURRENT_DESKTOP carries the KDE marker. */
  waylandKde: {
    XDG_SESSION_TYPE: "wayland",
    WAYLAND_DISPLAY: "wayland-0",
    XDG_CURRENT_DESKTOP: "KDE",
  } as NodeJS.ProcessEnv,
  /** Wayland without KDE (e.g. GNOME): must fall back to X11. */
  waylandGnome: {
    XDG_SESSION_TYPE: "wayland",
    WAYLAND_DISPLAY: "wayland-0",
    XDG_CURRENT_DESKTOP: "GNOME:GNOME-Flashback",
  } as NodeJS.ProcessEnv,
  /** Wayland, KDE detected via the fallback marker instead. */
  waylandKdeFullSession: {
    XDG_SESSION_TYPE: "wayland",
    WAYLAND_DISPLAY: "wayland-0",
    KDE_FULL_SESSION: "true",
  } as NodeJS.ProcessEnv,
};

describe("detectBackendFrom", () => {
  it("selects wayland on a KDE Wayland session", () => {
    expect(detectBackendFrom([], session.waylandKde)).toBe("wayland");
  });

  it("selects wayland via KDE_FULL_SESSION when XDG_CURRENT_DESKTOP is unset", () => {
    expect(detectBackendFrom([], session.waylandKdeFullSession)).toBe(
      "wayland",
    );
  });

  it("falls back to x11 on a Wayland session without KDE (GNOME)", () => {
    expect(detectBackendFrom([], session.waylandGnome)).toBe("x11");
  });

  it("selects x11 on an X11 session", () => {
    expect(detectBackendFrom([], session.x11)).toBe("x11");
  });

  it("selects x11 when session environment is missing", () => {
    expect(detectBackendFrom([], {})).toBe("x11");
  });

  it("--overlay-backend=x11 forces x11 on a KDE Wayland session", () => {
    expect(
      detectBackendFrom(["--overlay-backend=x11"], session.waylandKde),
    ).toBe("x11");
  });

  it("--overlay-backend=wayland forces wayland on an X11 session", () => {
    expect(detectBackendFrom(["--overlay-backend=wayland"], session.x11)).toBe(
      "wayland",
    );
  });

  it("--overlay-backend=wayland forces wayland without a Wayland session", () => {
    expect(detectBackendFrom(["--overlay-backend=wayland"], {})).toBe(
      "wayland",
    );
  });

  it("ignores an unknown --overlay-backend value and detects the session", () => {
    expect(
      detectBackendFrom(["--overlay-backend=gnome"], session.waylandGnome),
    ).toBe("x11");
    expect(
      detectBackendFrom(["--overlay-backend=gnome"], session.waylandKde),
    ).toBe("wayland");
  });
});
