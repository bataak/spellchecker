import { headButton } from "../project/panelicons.ts";
import type { Change } from "./changes.ts";
import type { Talk } from "./talk.ts";
import { changesView, chatView, type TalkView } from "./talkview.ts";

export type TalkMode = "chat" | "changes";

export interface RevealDeps {
  readonly editor: HTMLTextAreaElement;
  readonly openPath: (path: string) => void;
}

export const ICONS: Record<TalkMode, string> = {
  chat: '<path d="M2.5 3h11v7.5h-6.5l-3 2.5v-2.5h-1.5z"/><path d="M5 6h6M5 8h4"/>',
  changes: '<path d="M8 1.8v7.4M4.3 5.5h7.4M4.3 13h7.4"/>',
};
export const TALK_LABELS: Record<TalkMode, string> = {
  chat: "Хэлэлцүүлэг",
  changes: "Өөрчлөлт",
};

export interface Views {
  readonly talk: Talk;
  readonly views: Record<TalkMode, TalkView>;
  destroy(): void;
}

function selectChange(editor: HTMLTextAreaElement, change: Change): void {
  const to = Math.min(
    editor.value.length,
    change.from + change.inserted.length,
  );
  editor.focus();
  editor.setSelectionRange(Math.min(change.from, to), to);
}

export function buildViews(talk: Talk, deps: RevealDeps): Views {
  const reveal = (change: Change): void => {
    if (change.path === null) return selectChange(deps.editor, change);
    deps.openPath(change.path);
    requestAnimationFrame(() => selectChange(deps.editor, change));
  };
  const views = {
    chat: chatView(talk.chat),
    changes: changesView(talk.changes, reveal),
  };
  return {
    talk,
    views,
    destroy() {
      views.chat.destroy();
      views.changes.destroy();
    },
  };
}

export function badge(target: HTMLElement, count: number): void {
  let mark = target.querySelector<HTMLElement>(".talk-badge");
  if (!count) return void mark?.remove();
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "talk-badge";
    target.append(mark);
  }
  mark.textContent = count > 99 ? "99+" : String(count);
}

export interface Side {
  sync(views: Views | null): void;
}

export const MODES = ["chat", "changes"] as const;

export interface Holder {
  current(): Views | null;
  swap(views: Views | null): boolean;
}

export function holder(unread: () => void): Holder {
  let current: Views | null = null;
  let off = (): void => {};
  return {
    current: () => current,
    swap(views) {
      if (views === current) return false;
      current = views;
      off();
      off = views?.talk.chat.onChange(unread) ?? (() => {});
      return true;
    },
  };
}

export function unreadOf(held: Holder, reading: boolean): number {
  return reading ? 0 : (held.current()?.talk.chat.unread() ?? 0);
}

export function talkButton(mode: TalkMode): HTMLButtonElement {
  const node = headButton(TALK_LABELS[mode], ICONS[mode]);
  node.classList.add("talk-toggle");
  node.setAttribute("aria-pressed", "false");
  node.addEventListener("mousedown", (event) => event.preventDefault());
  return node;
}

export function refocus(box: HTMLElement, editor: HTMLTextAreaElement): void {
  if (box.contains(document.activeElement)) editor.focus();
}
