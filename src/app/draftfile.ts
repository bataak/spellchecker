import { loadDraftFile, type DraftFile } from "../core/storage.ts";

export interface DraftFileDeps {
  readonly slot: () => string;
  readonly restoreOffice: (name: string) => Promise<boolean>;
  readonly restoreText: (ref: DraftFile) => void;
  readonly targetName: () => string | null;
  readonly opened: (name: string | null) => void;
}

export async function restoreDraftFile(deps: DraftFileDeps): Promise<void> {
  const ref = loadDraftFile(deps.slot());
  if (!ref) return;
  if (ref.kind === "office" && (await deps.restoreOffice(ref.name))) {
    deps.opened(ref.name);
    return;
  }
  deps.restoreText(ref);
  deps.opened(deps.targetName());
}
