import { sessionBus, interface as dbusInterface } from "dbus-next";
import type { MessageBus } from "dbus-next";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Events the generated KWin script pushes to the app over DBus.
 * Mirrors the tracking events of electron-overlay-window on X11.
 */
export interface KWinEventHandlers {
  onAttach: (isFullscreen: boolean, bounds: WindowBounds) => void;
  onBounds: (bounds: WindowBounds) => void;
  onFocus: () => void;
  onBlur: () => void;
  onFullscreen: (isFullscreen: boolean) => void;
  onDetach: () => void;
  onCursor: (x: number, y: number) => void;
  onShortcut: (id: string) => void;
}

class KWinEventsInterface extends dbusInterface.Interface {
  constructor(
    dbusInterfaceName: string,
    private handlers: KWinEventHandlers,
  ) {
    super(dbusInterfaceName);
  }

  Attach(isFullscreen: boolean, x: number, y: number, w: number, h: number) {
    this.handlers.onAttach(isFullscreen, { x, y, width: w, height: h });
  }

  Bounds(x: number, y: number, w: number, h: number) {
    this.handlers.onBounds({ x, y, width: w, height: h });
  }

  Focus() {
    this.handlers.onFocus();
  }

  Blur() {
    this.handlers.onBlur();
  }

  Fullscreen(isFullscreen: boolean) {
    this.handlers.onFullscreen(isFullscreen);
  }

  Detach() {
    this.handlers.onDetach();
  }

  Cursor(x: number, y: number) {
    this.handlers.onCursor(x, y);
  }

  Shortcut(id: string) {
    this.handlers.onShortcut(id);
  }
}

KWinEventsInterface.configureMembers({
  methods: {
    Attach: { inSignature: "biiii" },
    Bounds: { inSignature: "iiii" },
    Focus: { inSignature: "" },
    Blur: { inSignature: "" },
    Fullscreen: { inSignature: "b" },
    Detach: { inSignature: "" },
    Cursor: { inSignature: "ii" },
    Shortcut: { inSignature: "s" },
  },
});

/**
 * DBus service owned by the main process; the KWin script calls into it via
 * callDBus. The name is unique per app instance so two app copies never
 * steal each other's events.
 */
export class KWinDBusService {
  readonly serviceName: string;
  readonly dbusPath: string;
  readonly dbusInterface: string;
  private bus: MessageBus | undefined;
  private iface: KWinEventsInterface | undefined;

  constructor(
    dbusServiceName: string,
    private handlers: KWinEventHandlers,
  ) {
    this.dbusInterface = dbusServiceName;
    this.dbusPath = `/${dbusServiceName.replace(/\./g, "/")}`;
    this.serviceName = `${dbusServiceName}.pid${process.pid}`;
  }

  async start(): Promise<void> {
    if (this.bus) return;
    this.bus = sessionBus();
    this.iface = new KWinEventsInterface(this.dbusInterface, this.handlers);
    this.bus.export(this.dbusPath, this.iface);
    await this.bus.requestName(this.serviceName, 0);
  }

  stop(): void {
    if (this.bus && this.iface) {
      this.bus.unexport(this.dbusPath, this.iface);
    }
    this.bus = undefined;
    this.iface = undefined;
  }
}
