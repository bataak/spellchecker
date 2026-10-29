import {
  badge,
  holder,
  MODES,
  refocus,
  shownMode,
  TALK_LABELS,
  talkButton,
  unreadChat,
  unreadComments,
  type Side,
  type TalkMode,
} from "./talkparts.ts";

export interface ProjectSide extends Side {
  docked(): boolean;
}

export function projectSide(
  editor: HTMLTextAreaElement,
  toggled: () => void,
): ProjectSide | null {
  const panel = document.querySelector<HTMLElement>(".project-panel");
  const foot = panel?.querySelector<HTMLElement>(".project-foot");
  const head = panel?.querySelector<HTMLElement>(".project-head");
  if (!panel || !foot || !head) return null;
  const archive = foot.querySelector(".project-foot-btn");
  const buttons = {
    changes: talkButton("changes"),
    chat: talkButton("chat"),
    comments: talkButton("comments"),
  };
  const pair = document.createElement("span");
  pair.className = "talk-pair";
  pair.append(buttons.changes, buttons.chat, buttons.comments);
  foot.insertBefore(pair, archive);
  const side = document.createElement("section");
  side.className = "project-talk";
  side.hidden = true;
  const title = document.createElement("h2");
  title.className = "project-talk-title";
  side.append(title);
  head.after(side);
  let mode: TalkMode | null = null;
  const unread = (): void => {
    badge(buttons.chat, unreadChat(held, mode));
    badge(buttons.comments, unreadComments(held, mode));
  };
  const held = holder(unread);

  const show = (next: TalkMode | null): void => {
    const current = held.current();
    mode = current && next ? shownMode(current, next) : null;
    if (mode === null) refocus(side, editor);
    panel.classList.toggle("is-talk", mode !== null);
    side.hidden = mode === null;
    const view = mode && current?.views[mode];
    if (view && mode) {
      title.textContent = TALK_LABELS[mode];
      side.replaceChildren(title, view.el);
    }
    for (const key of MODES) {
      buttons[key].hidden = !current?.views[key];
      buttons[key].setAttribute("aria-pressed", String(mode === key));
      current?.views[key]?.shown(mode === key);
    }
  };
  new MutationObserver(toggled).observe(panel, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  for (const key of MODES)
    buttons[key].addEventListener("click", () =>
      show(mode === key ? null : key),
    );
  return {
    sync(views) {
      if (held.swap(views)) show(views ? mode : null);
      pair.hidden = views === null;
      unread();
    },
    open: show,
    docked: () => !panel.hidden,
  };
}
