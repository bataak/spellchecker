import type { App, GivesOf, Part } from "./appparts.ts";
import {
  composeDocument,
  composeEditor,
  composeModes,
} from "./composeeditor.ts";
import { composeChecks, composeEditing } from "./composechecks.ts";
import {
  composePanes,
  composeProject,
  composeToolbar,
} from "./composefiles.ts";
import { composeSession, composeShell } from "./composeshell.ts";

const STEPS = [
  composeEditor,
  composeDocument,
  composeModes,
  composeChecks,
  composeEditing,
  composePanes,
  composeToolbar,
  composeProject,
  composeShell,
  composeSession,
] as const;

type Unwired = Exclude<Part, GivesOf<(typeof STEPS)[number]> | "entryUrl">;

export const EVERY_PART_WIRED: [Unwired] extends [never] ? true : Unwired =
  true;

export const COMPOSERS: readonly ((app: App) => void)[] = STEPS;

export function composeApp(app: App): void {
  for (const compose of COMPOSERS) compose(app);
}
