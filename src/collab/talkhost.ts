import { headButton, icon } from "../project/panelicons.ts";
import type { Collab, TalkKind } from "./collab.ts";
import type { Change } from "./changes.ts";
import type { Talk } from "./roomdoc.ts";
import { changesView, chatView, type TalkView } from "./talkview.ts";

export type TalkMode = "chat" | "changes";

export interface TalkHostDeps {
  readonly collab: Pick<Collab, "talk" | "onTalk">;
  readonly editor: HTMLTextAreaElement;
  readonly openPath: (path: string) => void;
  readonly anchor: HTMLElement | null;
}

const ICONS: Record<TalkMode, string> = {
  chat: '<path d="M2.5 3h11v7.5h-6.5l-3 2.5v-2.5h-1.5z"/><path d="M5 6h6M5 8h4"/>',
  changes:
    '<path d="M2.5 4h6M2.5 7.5h4.5M2.5 11h3"/><path d="M9.5 12.8l.6-2.4 3.4-3.4 1.8 1.8-3.4 3.4z"/>',
};
export const TALK_LABELS: Record<TalkMode, string> = {
  chat: "Хэлэлцэх",
  changes: "Өөрчлөлт",
};

interface Views {
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

function buildViews(talk: Talk, deps: TalkHostDeps): Views {
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

function badge(target: HTMLElement, count: number): void {
  let mark = target.querySelector<HTMLElement>(".talk-badge");
  if (!count) return void mark?.remove();
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "talk-badge";
    target.append(mark);
  }
  mark.textContent = count > 99 ? "99+" : String(count);
}

interface Side {
  sync(views: Views | null): void;
}

function talkButton(mode: TalkMode): HTMLButtonElement {
  const node = headButton(TALK_LABELS[mode], ICONS[mode]);
  node.classList.add("talk-toggle");
  node.setAttribute("aria-pressed", "false");
  node.addEventListener("mousedown", (event) => event.preventDefault());
  return node;
}

function refocus(box: HTMLElement, editor: HTMLTextAreaElement): void {
  if (box.contains(document.activeElement)) editor.focus();
}

function projectSide(editor: HTMLTextAreaElement): Side | null {
  const panel = document.querySelector<HTMLElement>(".project-panel");
  const foot = panel?.querySelector<HTMLElement>(".project-foot");
  const head = panel?.querySelector<HTMLElement>(".project-head");
  if (!panel || !foot || !head) return null;
  const archive = foot.querySelector(".project-foot-btn");
  const buttons = { changes: talkButton("changes"), chat: talkButton("chat") };
  foot.insertBefore(buttons.changes, archive);
  foot.insertBefore(buttons.chat, archive);
  const side = document.createElement("section");
  side.className = "project-talk";
  side.hidden = true;
  const title = document.createElement("h2");
  title.className = "project-talk-title";
  side.append(title);
  head.after(side);
  let current: Views | null = null;
  let mode: TalkMode | null = null;
  let offUnread = (): void => {};

  const show = (next: TalkMode | null): void => {
    mode = current ? next : null;
    if (mode === null) refocus(side, editor);
    panel.classList.toggle("is-talk", mode !== null);
    side.hidden = mode === null;
    for (const key of ["chat", "changes"] as const) {
      buttons[key].setAttribute("aria-pressed", String(mode === key));
      current?.views[key].shown(mode === key);
    }
    if (!current || !mode) return;
    title.textContent = TALK_LABELS[mode];
    side.replaceChildren(title, current.views[mode].el);
  };
  for (const key of ["chat", "changes"] as const)
    buttons[key].addEventListener("click", () =>
      show(mode === key ? null : key),
    );
  const unread = (): void =>
    badge(
      buttons.chat,
      mode === "chat" ? 0 : (current?.talk.chat.unread() ?? 0),
    );
  return {
    sync(views) {
      if (views !== current) {
        current = views;
        offUnread();
        offUnread = views?.talk.chat.onChange(unread) ?? (() => {});
        show(views ? mode : null);
      }
      buttons.chat.hidden = buttons.changes.hidden = views === null;
      unread();
    },
  };
}

function fileWindow(
  anchor: HTMLElement | null,
  editor: HTMLTextAreaElement,
): Side {
  const win = document.createElement("aside");
  win.className = "talk-window";
  win.hidden = true;
  win.setAttribute("aria-label", "Хэлэлцэх ба өөрчлөлт");
  const head = document.createElement("div");
  head.className = "talk-window-head";
  head.setAttribute("role", "tablist");
  const tabs = {
    chat: document.createElement("button"),
    changes: document.createElement("button"),
  };
  for (const key of ["chat", "changes"] as const) {
    tabs[key].type = "button";
    tabs[key].className = "talk-tab";
    tabs[key].setAttribute("role", "tab");
    tabs[key].textContent = TALK_LABELS[key];
  }
  const close = headButton("Хаах", '<path d="M4 4l8 8M12 4l-8 8"/>');
  const gap = document.createElement("span");
  gap.className = "project-foot-gap";
  head.append(tabs.chat, tabs.changes, gap, close);
  const body = document.createElement("div");
  body.className = "talk-window-body";
  win.append(head, body);
  document.body.append(win);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tbtn talk-trigger";
  trigger.hidden = true;
  trigger.title = "Хамтрагчидтай ярилцах, өөрчлөлтийг харах";
  trigger.innerHTML = icon(ICONS.chat, 14);
  trigger.append(document.createTextNode(" " + TALK_LABELS.chat));
  trigger.setAttribute("aria-pressed", "false");
  anchor?.after(trigger);

  let current: Views | null = null;
  let mode: TalkMode = "chat";
  let offUnread = (): void => {};
  const unread = (): void =>
    badge(
      trigger,
      !win.hidden && mode === "chat" ? 0 : (current?.talk.chat.unread() ?? 0),
    );
  const render = (): void => {
    for (const key of ["chat", "changes"] as const) {
      tabs[key].setAttribute("aria-selected", String(mode === key));
      current?.views[key].shown(!win.hidden && mode === key);
    }
    if (current) body.replaceChildren(current.views[mode].el);
    trigger.setAttribute("aria-pressed", String(!win.hidden));
    unread();
  };
  const open = (on: boolean): void => {
    if (!on) refocus(win, editor);
    win.hidden = !on || !current;
    render();
  };
  for (const key of ["chat", "changes"] as const)
    tabs[key].addEventListener("click", () => {
      mode = key;
      render();
    });
  close.addEventListener("click", () => open(false));
  trigger.addEventListener("click", () => open(win.hidden !== false));
  win.addEventListener("keydown", (event) => {
    if (event.key === "Escape") open(false);
  });
  return {
    sync(views) {
      if (views !== current) {
        current = views;
        offUnread();
        offUnread = views?.talk.chat.onChange(unread) ?? (() => {});
        if (!views) win.hidden = true;
        render();
      }
      trigger.hidden = views === null;
      unread();
    },
  };
}

export function initTalk(deps: TalkHostDeps): void {
  const sides: Record<TalkKind, Side | null> = {
    project: projectSide(deps.editor),
    file: fileWindow(deps.anchor, deps.editor),
  };
  const built = new Map<Talk, Views>();
  const sync = (): void => {
    const live = new Set<Talk>();
    for (const kind of ["project", "file"] as const) {
      const talk = deps.collab.talk(kind);
      let views: Views | null = null;
      if (talk) {
        live.add(talk);
        views = built.get(talk) ?? buildViews(talk, deps);
        built.set(talk, views);
      }
      sides[kind]?.sync(views);
    }
    for (const [talk, views] of built)
      if (!live.has(talk)) {
        views.destroy();
        built.delete(talk);
      }
  };
  deps.collab.onTalk(sync);
  sync();
}
