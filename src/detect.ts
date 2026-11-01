export type OverlayBackendKind = "x11" | "wayland";

const OVERLAY_BACKEND_FLAG = "--overlay-backend=";

/**
 * Core detection, parameterized for unit testing. Order (design D4): the
 * `--overlay-backend=x11|wayland` flag wins; otherwise the Wayland backend is
 * used iff this is a Wayland session with a KDE marker present (KWin assumed
 * available); every other session — including Wayland without KWin, e.g.
 * GNOME — falls back to the X11 backend (XWayland).
 */
export function detectBackendFrom(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): OverlayBackendKind {
  const flag = argv.find((arg) => arg.startsWith(OVERLAY_BACKEND_FLAG));
  if (flag) {
    const value = flag.slice(OVERLAY_BACKEND_FLAG.length);
    if (value === "x11" || value === "wayland") return value;
  }
  if (env.XDG_SESSION_TYPE === "wayland" && env.WAYLAND_DISPLAY) {
    const desktop = env.XDG_CURRENT_DESKTOP ?? "";
    if (desktop.includes("KDE") || env.KDE_FULL_SESSION) return "wayland";
  }
  return "x11";
}

/**
 * The overlay backend this process will use. Synchronous on purpose: the app
 * calls it at module scope to set ozone switches before `app.ready` (design
 * D4). One source of truth — no other module may implement its own detection.
 */
export function detectBackend(): OverlayBackendKind {
  return detectBackendFrom(process.argv, process.env);
}

export function isWaylandBackend(): boolean {
  return detectBackend() === "wayland";
}
