import { createEmitter } from "../core/emitter.ts";

export type TalkPlacement = "column" | "swap" | "float";

interface SlotState {
  open: boolean;
  placement: TalkPlacement;
  yielded: boolean;
}

const state: SlotState = { open: false, placement: "column", yielded: false };
const changes = createEmitter();
let queued = false;

function paint(): void {
  const root = document.documentElement;
  root.toggleAttribute("data-talk", state.open);
  root.toggleAttribute("data-talk-float", talkFloats());
  root.toggleAttribute("data-talk-swap", swapped());
  root.toggleAttribute("data-talk-yield", talkYielded());
}

function update(next: Partial<SlotState>): void {
  const merged = { ...state, ...next };
  if (!merged.open || merged.placement !== "swap") merged.yielded = false;
  if (
    merged.open === state.open &&
    merged.placement === state.placement &&
    merged.yielded === state.yielded
  )
    return;
  Object.assign(state, merged);
  paint();
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    changes.emit();
  });
}

const swapped = (): boolean => state.open && state.placement === "swap";

export const talkOpen = (): boolean => state.open;

export const talkFloats = (): boolean =>
  state.open && state.placement === "float";

export const talkCovers = (): boolean => swapped() && !state.yielded;

export const talkYielded = (): boolean => swapped() && state.yielded;

export function setTalkOpen(open: boolean): void {
  update({ open });
}

export function placeTalkSlot(placement: TalkPlacement): void {
  update({ placement });
}

export function yieldTalk(on: boolean): void {
  update({ yielded: on });
}

export function onSlotChange(listener: () => void): () => void {
  return changes.on(listener);
}
