import { createEmitter } from "../core/emitter.ts";
import type { PortableThread } from "./commentmodel.ts";

export interface KeptComments {
  readonly slot: string | null;
  readonly threads: readonly PortableThread[];
}

export const keptComments = createEmitter<KeptComments>();

export interface ClearedComments {
  readonly slot: string;
  readonly leaving: boolean;
}

export const clearedComments = createEmitter<ClearedComments>();
