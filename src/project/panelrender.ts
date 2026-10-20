import type { PanelParts } from "./panelmarkup.ts";
import {
  emptyMessage,
  exportTitle,
  folderLabel,
  projectTitle,
  treeStamp,
  type OpenedFile,
} from "./panelview.ts";
import type { ProjectView } from "./projectstore.ts";
import type { TreeState } from "./treecontrol.ts";
import { treeRows } from "./treerows.ts";

export function syncFoot(parts: PanelParts, exportedAt: number | null): void {
  parts.exportBtn.title = exportTitle(exportedAt, Date.now());
}

export function renderChrome(
  parts: PanelParts,
  view: ProjectView | null,
  file: OpenedFile | null,
): boolean {
  const pending = view?.pending ?? false;
  const ready = view !== null && !pending;
  parts.title.textContent = view ? view.label : "LaTeX төсөл";
  parts.title.title = projectTitle(view);
  parts.headIcon.hidden = view === null;
  parts.closeBtn.hidden = !ready;
  parts.refreshBtn.hidden = !ready || view.kind !== "dir";
  parts.exportBtn.hidden = !ready;
  parts.exportBtn.classList.toggle(
    "is-due",
    ready && view.kind === "memory" && view.unsaved,
  );
  parts.foot.hidden = !ready;
  if (ready) syncFoot(parts, view.exportedAt);
  parts.empty.hidden = ready;
  parts.tree.hidden = !ready;
  parts.folderBtn.textContent = folderLabel(file, !!window.showDirectoryPicker);
  parts.folderBtn.hidden = pending;
  parts.zipBtn.hidden = pending;
  parts.grantBtn.hidden = !pending;
  parts.forgetBtn.hidden = !pending;
  parts.emptyText.textContent = emptyMessage(
    pending ? view!.label : null,
    file,
  );
  return ready;
}

function focusedPath(tree: HTMLElement): string | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !tree.contains(active))
    return undefined;
  return active.closest<HTMLElement>(".project-row")?.dataset.path;
}

export function renderTree(
  tree: HTMLElement,
  state: TreeState,
  view: ProjectView,
): void {
  const stamp = treeStamp(view, state.collapsed, state.selected, state.focus);
  if (state.editing || stamp === state.shown) return;
  state.shown = stamp;
  const focusPath = focusedPath(tree);
  const rows = treeRows(view, state.collapsed, state.selected, state.focus);
  tree.replaceChildren(...rows);
  const first =
    rows.find((row) => row.dataset.path === focusPath) ??
    rows.find((row) => row.classList.contains("is-active")) ??
    rows[0];
  if (first) first.tabIndex = 0;
  if (focusPath !== undefined && first) first.focus({ preventScroll: true });
}
