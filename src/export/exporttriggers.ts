import type { SaveChain, SaveTrigger } from "../ui/savechain.ts";
import type { Printer } from "./exportprint.ts";

const LONG_PRESS_MS = 550;

export interface TriggerDeps {
  readonly open: () => void;
  readonly printer: Printer;
  readonly saveButton?: HTMLElement | null;
  readonly printButton?: HTMLElement | null;
  readonly saveChain?: SaveChain;
}

export interface Triggers {
  syncPrint(): void;
  destroy(): void;
}

function isPrintKey(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code === "KeyP" || event.key.toLowerCase() === "p")
  );
}

function isExportKey(event: KeyboardEvent): boolean {
  if (!event.altKey || !(event.ctrlKey || event.metaKey)) return false;
  return event.code === "KeyS" || event.key.toLowerCase() === "s";
}

function bindLongPress(
  button: HTMLElement | null | undefined,
  open: () => void,
  saveChain: SaveChain | undefined,
): () => void {
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let held = false;
  const cancelPress = (): void => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };
  const dropPress = (event: PointerEvent): void => {
    cancelPress();
    if (event.type === "pointercancel" || event.buttons) held = false;
  };
  const onPressStart = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    held = false;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      held = true;
      open();
    }, LONG_PRESS_MS);
  };
  const interceptSave = ({ shift }: SaveTrigger): boolean => {
    if (!held && !shift) return false;
    if (!held) open();
    held = false;
    return true;
  };
  const onContextMenu = (event: Event): void => event.preventDefault();
  const events: [string, EventListener][] = [
    ["pointerdown", onPressStart as EventListener],
    ["pointerup", cancelPress],
    ["pointerleave", dropPress as EventListener],
    ["pointercancel", dropPress as EventListener],
    ["contextmenu", onContextMenu],
  ];
  for (const [type, listener] of events)
    button?.addEventListener(type, listener);
  const releaseSave = saveChain?.intercept(interceptSave);
  return () => {
    cancelPress();
    for (const [type, listener] of events)
      button?.removeEventListener(type, listener);
    releaseSave?.();
  };
}

export function bindExportTriggers(d: TriggerDeps): Triggers {
  const { printer, printButton } = d;
  const syncPrint = (): void => {
    if (printButton) printButton.hidden = !printer.printable();
  };
  const onPrintClick = (): void => {
    if (printer.printable()) printer.start();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isPrintKey(event) && printer.printable()) {
      event.preventDefault();
      printer.start();
      return;
    }
    if (!isExportKey(event)) return;
    event.preventDefault();
    d.open();
  };
  document.addEventListener("keydown", onKeyDown);
  printButton?.addEventListener("click", onPrintClick);
  syncPrint();
  const releasePress = bindLongPress(d.saveButton, d.open, d.saveChain);
  return {
    syncPrint,
    destroy() {
      releasePress();
      printButton?.removeEventListener("click", onPrintClick);
      document.removeEventListener("keydown", onKeyDown);
    },
  };
}
