import { dropSlotText, loadSlotText, saveSlotText } from "../storage.ts";
import { PROJECT_SLOT, loadSlots } from "./fileslots.ts";
import {
  LEGACY_TEMPLATES,
  PLAIN,
  TEMPLATES,
  findTemplate,
} from "../templates.ts";
import { KEYS, at, read, readShared, remove, write } from "../store.ts";

export function sharedSlot(): string {
  return pickerValue(validTemplateId(readShared(KEYS.template)));
}

export function loadTemplateId(): string {
  return validTemplateId(read(KEYS.template));
}

function validTemplateId(stored: string | null): string {
  try {
    const raw = stored === null ? null : (LEGACY_TEMPLATES[stored] ?? stored);
    if (raw === null) return PLAIN;
    if (findTemplate(raw) !== undefined || raw === PROJECT_SLOT) return raw;
    return loadSlots().some((slot) => slot.id === raw) ? raw : PLAIN;
  } catch {
    return PLAIN;
  }
}

function loadExampleChoice(slot: string): string | null {
  return read(at(KEYS.example, slot));
}

export function saveExampleChoice(slot: string, example: string): void {
  write(at(KEYS.example, slot), example);
}

export function chosenExample(slot: string): string | undefined {
  const list = findTemplate(slot)?.examples ?? [];
  const saved = loadExampleChoice(slot);
  return list.find((item) => item.id === saved)?.id ?? list[0]?.id;
}

export function pickerValue(slot: string): string {
  const example = chosenExample(slot);
  return example === undefined ? slot : slot + ":" + example;
}

const DRAFT_MAX = 200000;
export const LARGE_DRAFT = "\u0000idb";

const slotOps = new Map<string, Promise<void>>();
let draftFailed: (() => void) | null = null;

export function onDraftError(handler: (() => void) | null): void {
  draftFailed = handler;
}

export function draftError(): void {
  draftFailed?.();
}

function onSlot(id: string, op: () => Promise<void>): void {
  const next = (slotOps.get(id) ?? Promise.resolve())
    .then(op)
    .catch(() => draftFailed?.());
  slotOps.set(id, next);
}

export function loadDraft(id: string): string | null {
  return read(at(KEYS.draft, id));
}

export function smallDraft(id: string): string | null {
  const text = loadDraft(id);
  return text === LARGE_DRAFT ? null : text;
}

export async function readDraft(id: string): Promise<string | null> {
  const text = loadDraft(id);
  if (text !== LARGE_DRAFT) return text;
  await slotOps.get(id);
  try {
    return await loadSlotText(id);
  } catch {
    return null;
  }
}

export function saveDraft(id: string, text: string): void {
  const large = text.trim() !== "" && text.length > DRAFT_MAX;
  const wasLarge = loadDraft(id) === LARGE_DRAFT;
  if (text.trim() === "") remove(at(KEYS.draft, id));
  else if (!write(at(KEYS.draft, id), large ? LARGE_DRAFT : text)) {
    draftFailed?.();
    return;
  }
  if (large) onSlot(id, () => saveSlotText(id, text));
  else if (wasLarge) onSlot(id, () => dropSlotText(id));
}

export function dropDraft(id: string): void {
  const wasLarge = loadDraft(id) === LARGE_DRAFT;
  remove(at(KEYS.draft, id));
  if (wasLarge) onSlot(id, () => dropSlotText(id));
}

export function migrateLegacyDrafts(active: string): string[] {
  const pending: string[] = [];
  for (const [legacy, target] of Object.entries(LEGACY_TEMPLATES)) {
    const text = smallDraft(legacy);
    if (text === null) continue;
    if (target === active) {
      pending.push(legacy);
      continue;
    }
    if (loadDraft(target) === LARGE_DRAFT) continue;
    const existing = smallDraft(target);
    saveDraft(target, existing === null ? text : existing + "\n\n" + text);
    dropDraft(legacy);
  }
  return pending;
}

export function migrateSlotDrafts(): void {
  for (const template of TEMPLATES) {
    if (!template.examples?.length) continue;
    const text = smallDraft(template.id);
    if (text === null) continue;
    const key = pickerValue(template.id);
    if (loadDraft(key) === null) saveDraft(key, text);
    dropDraft(template.id);
  }
}

export interface Caret {
  readonly start: number;
  readonly end: number;
  readonly scroll: number;
}

export function loadCaret(key: string): Caret | null {
  const raw = read(at(KEYS.caret, key));
  const [start, end, scroll] = (raw ?? "").split(",").map(Number);
  if (raw === null || [start, end, scroll].some((n) => !Number.isFinite(n)))
    return null;
  return { start: start!, end: end!, scroll: scroll! };
}

export function dropCaret(key: string): void {
  remove(at(KEYS.caret, key));
}

export function saveCaret(key: string, caret: Caret): void {
  write(
    at(KEYS.caret, key),
    caret.start + "," + caret.end + "," + caret.scroll,
  );
}

export function saveTemplateId(id: string): void {
  write(KEYS.template, id);
}
