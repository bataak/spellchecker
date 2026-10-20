import { escapeHtml } from "../core/htmlutil.ts";
import { askCommitMessage } from "./git/gitdialog.ts";
import { askMerge } from "./git/mergedialog.ts";
import {
  commitSuggestion,
  FILES_SAVED_NOTICE,
  saveMessage,
} from "./linkfiles.ts";
import type { Binding } from "./linkbind.ts";
import { Cancelled, failureMessage } from "./projecterror.ts";
import type { ProjectStore, SaveResult } from "./projectstore.ts";

const CANCELLED = "Цуцаллаа";
const COMMITTING = "Commit хийгдэж байна…";

export function createSave(
  store: ProjectStore,
  binding: Binding,
  notify: (message: string) => void,
): (diskOnly?: boolean) => Promise<string | null> {
  let committing = false;
  return async (diskOnly = false) => {
    if (!binding.bound() || !store.hasProject()) return null;
    if (diskOnly && store.project()?.kind !== "dir") return null;
    binding.pushText();
    const view = store.project();
    const git = view?.kind === "git";
    if (git) {
      if (committing) return COMMITTING;
      if (!view.unsaved) return saveMessage("clean");
      committing = true;
    }
    let result: SaveResult;
    try {
      let message = "";
      const provider = view?.provider ?? "github";
      if (git) {
        const asked = await askCommitMessage(
          commitSuggestion(view.dirty),
          provider,
        );
        if (asked === null) return CANCELLED;
        message = asked;
      }
      result = await store.saveProject(message, (items) =>
        askMerge(items, provider),
      );
    } catch (error) {
      if (error instanceof Cancelled) return CANCELLED;
      const text = failureMessage(error, "Хадгалж чадсангүй");
      if (text) notify(escapeHtml(text));
      throw error;
    } finally {
      if (git) committing = false;
    }
    if (result === "files") notify(FILES_SAVED_NOTICE);
    return saveMessage(result);
  };
}
