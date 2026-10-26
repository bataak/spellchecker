import type { App } from "./appparts.ts";
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

export const COMPOSERS: readonly ((app: App) => void)[] = [
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
];

export function composeApp(app: App): void {
  for (const compose of COMPOSERS) compose(app);
}
