import { Message, MessageType, sessionBus } from "dbus-next";
import type { MessageBus } from "dbus-next";

const KWIN_SERVICE = "org.kde.KWin";
const SCRIPTING_PATH = "/Scripting";
const SCRIPTING_IFACE = "org.kde.kwin.Scripting";

/**
 * Client for the compositor's scripting DBus API (kdotool pattern):
 * load generated script files into KWin, run them, unload them.
 */
export class KWinScriptLoader {
  private bus: MessageBus = sessionBus();

  private async call(
    member: string,
    signature: string,
    body: unknown[],
  ): Promise<unknown[]> {
    const reply = await this.bus.call(
      new Message({
        type: MessageType.METHOD_CALL,
        destination: KWIN_SERVICE,
        path: SCRIPTING_PATH,
        interface: SCRIPTING_IFACE,
        member,
        signature,
        body,
      }),
    );
    if (!reply || reply.type === MessageType.ERROR) {
      throw new Error(
        `KWin Scripting.${member} failed: ${reply?.body?.[0] ?? "unknown error"}`,
      );
    }
    return reply.body ?? [];
  }

  async isScriptLoaded(name: string): Promise<boolean> {
    const body = await this.call("isScriptLoaded", "s", [name]);
    return body[0] === true;
  }

  async loadScript(scriptPath: string, name: string): Promise<number> {
    const body = await this.call("loadScript", "ss", [scriptPath, name]);
    return Number(body[0] ?? -1);
  }

  async unloadScript(name: string): Promise<boolean> {
    const body = await this.call("unloadScript", "s", [name]);
    return body[0] === true;
  }

  /** Runs all scripts that are loaded but not yet running. */
  async start(): Promise<void> {
    await this.call("start", "", []);
  }
}
