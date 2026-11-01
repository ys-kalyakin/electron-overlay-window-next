/** [action id, key sequence as accepted by KWin registerShortcut] */
export type ShortcutBinding = [id: string, keySequence: string];

/**
 * Structural logger the bridge writes human-readable lines to. Keeps the
 * package decoupled from any concrete logging implementation.
 */
export interface Logger {
  write(message: string): void;
}
