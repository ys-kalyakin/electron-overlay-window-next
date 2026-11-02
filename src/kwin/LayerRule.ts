import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import * as ini from "ini";

const KWINRULES_PATH = path.join(homedir(), ".config", "kwinrulesrc");

type RuleConfig = Record<string, Record<string, string>>;

export interface OverlayLayerRuleOptions {
  /** Identifies the package's rule in kwinrulesrc; also the removal marker. */
  description: string;
  /** WM_CLASS of the overlay window the rule pins to the popup layer. */
  windowClass?: string;
  /**
   * Exact title of the overlay window. Used instead of WM_CLASS when no
   * window class is configured: auto-initialized bridges derive the overlay
   * title from the attached window and match the rule by it.
   */
  overlayTitle?: string;
}

/**
 * KWin stacks fullscreen windows (layer 5) above keep-above windows (layer
 * 3), which would hide the overlay over a fullscreen game. This installs a
 * window rule that pins the OVERLAY window to the "popup" layer (measured
 * as layer 6, above fullscreen), leaving the game's own stacking untouched
 * so panels don't float above it. Only rules with the given Description
 * marker are managed; other user rules are preserved. The rule matches by
 * exact WM_CLASS when a window class is given, otherwise by exact title.
 */
export async function installOverlayLayerRule(
  options: OverlayLayerRuleOptions,
): Promise<void> {
  const match: Record<string, string> | undefined = options.windowClass
    ? { wmclass: options.windowClass, wmclassmatch: "1" }
    : options.overlayTitle
      ? { title: options.overlayTitle, titlematch: "1" }
      : undefined;
  if (!match) {
    throw new Error(
      "The overlay layer rule needs a window class or an overlay title",
    );
  }
  await updateRulesFile((config) => {
    const existing = findOwnRule(config, options.description);
    const uuid = existing ?? randomUUID();
    config[uuid] = {
      Description: options.description,
      ...match,
      types: "1",
      layer: "popup",
      layerrule: "2",
    };
    setRuleList(config, (list) => (existing ? list : [...list, uuid]));
    return config;
  });
}

export async function removeOverlayLayerRule(options: {
  description: string;
}): Promise<void> {
  await updateRulesFile((config) => {
    const existing = findOwnRule(config, options.description);
    if (!existing) return config;
    const { [existing]: _removed, ...rest } = config;
    setRuleList(rest, (list) => list.filter((id) => id !== existing));
    return rest;
  });
}

function findOwnRule(
  config: RuleConfig,
  description: string,
): string | undefined {
  return Object.keys(config).find(
    (section) =>
      config[section]?.Description === description &&
      section !== "General",
  );
}

function setRuleList(
  config: RuleConfig,
  update: (list: string[]) => string[],
): void {
  const general = (config.General ??= {});
  const list = (general.rules ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id && id in config);
  const next = update(list);
  general.rules = next.join(",");
  general.count = String(next.length);
}

async function updateRulesFile(
  mutate: (config: RuleConfig) => RuleConfig,
): Promise<void> {
  let config: RuleConfig = {};
  try {
    if (fs.existsSync(KWINRULES_PATH)) {
      config = ini.parse(fs.readFileSync(KWINRULES_PATH, "utf8"));
    }
  } catch {
    config = {};
  }
  const before = fs.existsSync(KWINRULES_PATH)
    ? fs.readFileSync(KWINRULES_PATH, "utf8")
    : "";
  const after = ini.encode(mutate(config));
  if (after === before) return;
  fs.writeFileSync(KWINRULES_PATH, after);
  // make the running compositor pick up the new rules
  await new Promise<void>((resolve, reject) => {
    execFile(
      "busctl",
      [
        "--user",
        "call",
        "org.kde.KWin",
        "/KWin",
        "org.kde.KWin",
        "reconfigure",
      ],
      (error) => {
        if (error) {
          reject(new Error(`KWin reconfigure failed: ${error.message}`));
        } else {
          resolve();
        }
      },
    );
  });
}
