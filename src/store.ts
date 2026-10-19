import { attempt } from "./attempt.ts";
export type Scope = "shared" | "tab" | "session";

export interface StoreKey {
  readonly name: string;
  readonly scope: Scope;
}

const shared = (name: string): StoreKey => ({ name, scope: "shared" });
const tab = (name: string): StoreKey => ({ name, scope: "tab" });
const session = (name: string): StoreKey => ({ name, scope: "session" });

export const KEYS = {
  template: tab("mdTemplate"),
  example: tab("mdExample:"),
  draft: shared("mdDraft:"),
  caret: shared("mdCaret:"),
  fileRef: shared("mn-spell:file:"),
  slots: shared("mdFiles"),
  migrated: shared("mn-spell:slot-text"),
  legacyText: shared("mn-spell:text"),
  legacyTier: shared("mn-spell:tier"),
  legacyFile: shared("mn-spell:file"),
  legacyCaret: shared("mn-spell:caret"),
  lastCleared: shared("mn-spell:last-cleared"),
  ignored: shared("mn-spell:ignored"),
  submitted: shared("mn-spell:submitted"),
  enVariants: shared("mn-spell:en-variants"),
  projectSlot: shared("mn-spell:project-slot"),
  projectPanel: shared("mn-spell:project-panel"),
  theme: shared("theme"),
  fontScale: shared("mn-spell:scale"),
  metrics: shared("mn-spell:metrics"),
  toolbarScroll: shared("mn-spell:toolbar-scroll"),
  keyboardLayout: shared("keyboard-layout"),
  layout: shared("layout"),
  layoutTex: shared("layout-tex"),
  mdPreview: shared("md-preview"),
  mdPreviewTex: shared("md-preview-tex"),
  pdfInvert: shared("pdfInvert"),
  pdfZoom: shared("pdfZoom"),
  defPin: shared("def-pin"),
  defDock: shared("def-dock"),
  hintSeen: shared("hintSeen:"),
  tipInfo: shared("mn-spell:tip-info"),
  tipAction: shared("mn-spell:tip-action"),
  surveyDone: shared("mn-spell:survey-done:"),
  useDays: shared("mn-spell:use-days"),
  texMeta: shared("tex-packages:meta"),
  texOffline: shared("tex-offline:"),
  wipe: session("mn-spell:wipe"),
  hasText: session("mn-spell:has-text"),
  staleReload: session("staleReload:"),
} as const;

export function at(key: StoreKey, suffix: string): StoreKey {
  return { name: key.name + suffix, scope: key.scope };
}

function local(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function tabStore(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

function get(storage: Storage | null, name: string): string | null {
  return attempt(() => storage?.getItem(name) ?? null, null);
}

function set(storage: Storage | null, name: string, value: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(name, value);
    return true;
  } catch {
    return false;
  }
}

function drop(storage: Storage | null, name: string): void {
  attempt(() => storage?.removeItem(name), undefined);
}

export function read(key: StoreKey): string | null {
  if (key.scope === "session") return get(tabStore(), key.name);
  if (key.scope === "tab")
    return get(tabStore(), key.name) ?? get(local(), key.name);
  return get(local(), key.name);
}

export function readShared(key: StoreKey): string | null {
  return key.scope === "session" ? null : get(local(), key.name);
}

export function write(key: StoreKey, value: string): boolean {
  if (key.scope === "session") return set(tabStore(), key.name, value);
  if (key.scope === "tab") set(tabStore(), key.name, value);
  return set(local(), key.name, value);
}

export function remove(key: StoreKey): void {
  if (key.scope !== "shared") drop(tabStore(), key.name);
  if (key.scope !== "session") drop(local(), key.name);
}

export function readJson(key: StoreKey): unknown {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(key: StoreKey, value: unknown): boolean {
  return write(key, JSON.stringify(value));
}
