import {
  buildTree,
  isEditablePath,
  viewableType,
  type TreeNode,
} from "../tex/texproject.ts";
import { ICON, icon } from "./panelicons.ts";
import type { ProjectView } from "./projectstore.ts";

export function rowSelector(path: string): string {
  return '.project-row[data-path="' + CSS.escape(path) + '"]';
}

export function rowOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>(".project-row")
    : null;
}

function badge(className: string, text: string, title: string): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  el.title = title;
  return el;
}

function treeRow(
  node: TreeNode,
  depth: number,
  view: ProjectView,
  collapsed: ReadonlySet<string>,
  selected: string | null,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "project-row";
  row.dataset.path = node.path;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(depth + 1));
  row.tabIndex = -1;
  row.draggable = true;
  row.style.setProperty("--depth", String(depth));
  if (node.dir) {
    row.classList.add("is-dir");
    row.setAttribute("aria-expanded", String(!collapsed.has(node.path)));
  } else if (!isEditablePath(node.path) && viewableType(node.path) === null)
    row.classList.add("is-binary");
  if (node.path === view.active) {
    row.classList.add("is-active");
    row.setAttribute("aria-current", "true");
  }
  if (node.path === selected) row.classList.add("is-selected");
  const caret = document.createElement("span");
  caret.className = "project-caret";
  const glyph = document.createElement("span");
  glyph.className = "project-icon";
  glyph.innerHTML = icon(node.dir ? ICON.folder : ICON.file, 15);
  const name = document.createElement("span");
  name.className = "project-name";
  name.textContent = node.name;
  row.append(caret, glyph, name);
  row.title = node.path;
  if (node.path === view.main)
    row.append(badge("project-main", "үндсэн", "Хөрвүүлэх үндсэн файл"));
  if (view.dirty.has(node.path))
    row.append(badge("project-dot", "", "Хадгалагдаагүй"));
  const more = document.createElement("button");
  more.type = "button";
  more.className = "project-more";
  more.tabIndex = -1;
  more.setAttribute("aria-label", "Үйлдлүүд");
  more.innerHTML = icon(ICON.more, 14);
  row.append(more);
  return row;
}

function skipRow(hidden: number, depth: number): HTMLElement {
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "project-skip";
  skip.style.setProperty("--depth", String(depth));
  skip.textContent = "…";
  skip.title = "Бусад " + hidden + " зүйлийг харуулах";
  skip.setAttribute("aria-label", skip.title);
  return skip;
}

export function treeRows(
  view: ProjectView,
  collapsed: ReadonlySet<string>,
  selected: string | null,
  focus: string | null = null,
): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const onPath = (node: TreeNode): boolean =>
    focus !== null &&
    node.dir &&
    (focus === node.path || focus.startsWith(node.path + "/"));
  const walk = (nodes: readonly TreeNode[], depth: number): void => {
    const shown = nodes.some(onPath) ? nodes.filter(onPath) : nodes;
    for (const node of shown) {
      rows.push(treeRow(node, depth, view, collapsed, selected));
      if (node.dir && !collapsed.has(node.path)) walk(node.children, depth + 1);
    }
    if (shown.length < nodes.length)
      rows.push(skipRow(nodes.length - shown.length, depth));
  };
  walk(buildTree(view.files, view.dirs), 0);
  return rows;
}
