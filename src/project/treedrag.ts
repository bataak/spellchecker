import { baseName, dirName, joinPath } from "../tex/texproject.ts";
import { rowOf, rowSelector } from "./treerows.ts";

export interface TreeDragDeps {
  readonly tree: HTMLElement;
  readonly active: () => boolean;
  readonly editing: () => boolean;
  readonly isDir: (path: string) => boolean;
  readonly closeMenu: () => void;
  readonly move: (from: string, dir: string) => void;
  readonly add: (dir: string, files: readonly File[]) => void;
}

export function canMoveInto(from: string, dir: string): boolean {
  return dir !== dirName(from) && dir !== from && !dir.startsWith(from + "/");
}

export function movedPath(from: string, dir: string): string {
  return joinPath(dir, baseName(from));
}

export function initTreeDrag(deps: TreeDragDeps): void {
  const { tree } = deps;
  let dragging: string | null = null;
  let dropRow: HTMLElement | null = null;

  const dropDir = (target: EventTarget | null): string => {
    const row = rowOf(target);
    const path = row?.dataset.path ?? "";
    return row ? (deps.isDir(path) ? path : dirName(path)) : "";
  };

  const markDrop = (dir: string | null): void => {
    const next =
      dir === null || dir === ""
        ? null
        : tree.querySelector<HTMLElement>(rowSelector(dir));
    if (next === dropRow) return;
    dropRow?.classList.remove("is-drop-target");
    dropRow = next;
    dropRow?.classList.add("is-drop-target");
  };

  const endDrag = (): void => {
    dragging = null;
    markDrop(null);
    tree.classList.remove("is-drop");
  };

  tree.addEventListener("dragstart", (event) => {
    const row = rowOf(event.target);
    if (!row || deps.editing() || !event.dataTransfer) return;
    dragging = row.dataset.path ?? null;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragging ?? "");
    deps.closeMenu();
  });
  tree.addEventListener("dragend", endDrag);

  tree.addEventListener("dragover", (event) => {
    if (!deps.active() || !event.dataTransfer) return;
    if (dragging !== null) {
      event.preventDefault();
      event.stopPropagation();
      const dir = dropDir(event.target);
      const allowed = canMoveInto(dragging, dir);
      event.dataTransfer.dropEffect = allowed ? "move" : "none";
      markDrop(allowed ? dir : null);
      tree.classList.toggle("is-drop", allowed && dir === "");
      return;
    }
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    markDrop(dropDir(event.target) || null);
    tree.classList.add("is-drop");
  });

  tree.addEventListener("dragleave", (event) => {
    if (
      event.relatedTarget instanceof Node &&
      tree.contains(event.relatedTarget)
    )
      return;
    markDrop(null);
    tree.classList.remove("is-drop");
  });

  tree.addEventListener("drop", (event) => {
    if (dragging !== null) {
      event.preventDefault();
      event.stopPropagation();
      const from = dragging;
      const dir = dropDir(event.target);
      endDrag();
      if (dir === dirName(from)) return;
      deps.move(from, dir);
      return;
    }
    markDrop(null);
    tree.classList.remove("is-drop");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!deps.active() || !files.length) return;
    event.preventDefault();
    event.stopPropagation();
    deps.add(dropDir(event.target), files);
  });
}
