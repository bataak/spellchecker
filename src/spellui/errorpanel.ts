import type { Backdrop } from "../editor/backdrop.ts";
import { copyText } from "../ui/clipboard.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import { nf, reveal } from "../ui/status.ts";
import { buildErrorList, nextOccurrence } from "../spell/textcheck.ts";
import type { Token } from "../spell/textcheck.ts";
import { attemptAsync } from "../core/attempt.ts";

const LATIN = /\p{Script=Latin}/u;

export interface ErrorPanelDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly desktopMQ: MediaQueryList;
  readonly list: HTMLElement | null;
  readonly copy: HTMLButtonElement | null;
  readonly title: HTMLElement | null;
  readonly badTokens: () => Token[];
  readonly lastCaret: () => { start: number; end: number } | null;
  readonly setLastCaret: (caret: { start: number; end: number }) => void;
  readonly onPick: () => void;
  readonly syncScroll: () => void;
  readonly showPopoverFor: (token: Token) => void;
}

export interface ErrorPanel {
  readonly render: () => void;
  readonly clear: (calculating: boolean) => void;
}

type ErrorItem = ReturnType<typeof buildErrorList>[number];

function errorItemsHtml(items: readonly ErrorItem[]): string {
  return items
    .map((item) => {
      const repeatCountLabel = item.count > 99 ? "99+" : item.count;
      const badge =
        item.count >= 2
          ? '<span class="ew-count">' + repeatCountLabel + "</span>"
          : "";
      return (
        '<button class="ew" type="button" data-start="' +
        item.start +
        '">' +
        escapeHtml(item.word) +
        badge +
        "</button>"
      );
    })
    .join("");
}

function scrollToMark(editor: HTMLTextAreaElement, mark: HTMLElement): boolean {
  const editorRect = editor.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const pad = 24;
  if (
    markRect.top >= editorRect.top + pad &&
    markRect.bottom <= editorRect.bottom - pad
  )
    return false;
  const targetY =
    editorRect.top + Math.max(pad, Math.min(editorRect.height * 0.3, 160));
  const maxScroll = editor.scrollHeight - editor.clientHeight;
  editor.scrollTop = Math.max(
    0,
    Math.min(editor.scrollTop + (markRect.top - targetY), maxScroll),
  );
  return true;
}

function ancestorOf(node: HTMLElement, other: HTMLElement): HTMLElement {
  for (
    let current: HTMLElement | null = node;
    current;
    current = current.parentElement
  )
    if (current.contains(other)) return current;
  return node;
}

function bindCopy(copy: HTMLButtonElement, badTokens: () => Token[]): void {
  const copyIcon = copy.innerHTML;
  const checkIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  copy.addEventListener("click", async () => {
    const words = buildErrorList(badTokens()).map((token) => token.word);
    if (!words.length) return;
    const copied = await attemptAsync(
      () => copyText(words.join("\n")).then(() => true),
      false,
    );
    if (!copied) return;
    copy.classList.add("copied");
    copy.innerHTML = checkIcon;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copy.classList.remove("copied");
      copy.innerHTML = copyIcon;
    }, 1100);
  });
}

export function initErrorPanel(deps: ErrorPanelDeps): ErrorPanel {
  const { editor, backdrop, desktopMQ, list, copy, title } = deps;
  let settled = false;
  let picked: { start: number; end: number } | null = null;

  document.addEventListener("selectionchange", () => {
    if (
      picked &&
      (editor.selectionStart !== picked.start ||
        editor.selectionEnd !== picked.end)
    ) {
      picked = null;
      delete editor.dataset.pick;
    }
  });

  function setTitle(text: string, animate: boolean): void {
    if (!title || title.textContent === text) return;
    title.textContent = text;
    if (animate) reveal(title);
  }

  function render(): void {
    if (!list) return;
    if (!desktopMQ.matches) return;
    const animate = !settled;
    settled = true;
    const tokens = deps.badTokens();
    const items = buildErrorList(tokens);
    if (!items.length) {
      setTitle("Алдаагүй", animate);
      list.innerHTML = "";
      if (copy) copy.disabled = true;
      return;
    }
    setTitle("Нийт алдаатай үг: " + nf(tokens.length), animate);
    if (copy) copy.disabled = false;
    if (animate) reveal(list);
    list.innerHTML = errorItemsHtml(items);
  }

  function clear(calculating: boolean): void {
    if (list) list.innerHTML = "";
    if (copy) copy.disabled = true;
    if (calculating && desktopMQ.matches) {
      settled = false;
      setTitle("Тооцоолж байна…", true);
    }
  }

  function scrollMarkIntoView(start: number): void {
    const mark = backdrop.markAt(start);
    if (mark && scrollToMark(editor, mark)) deps.syncScroll();
  }

  if (list) {
    const panel = title ? ancestorOf(list, title) : list;

    panel.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest("#copyErrorsBtn")) return;
      const btn = target.closest(".ew");
      if (!btn) {
        editor.focus({ preventScroll: true });
        const lastCaret = deps.lastCaret();
        if (lastCaret) {
          editor.setSelectionRange(lastCaret.start, lastCaret.end, "forward");
        }
        return;
      }
      const start = Number(btn.getAttribute("data-start"));
      const clickedToken = nextOccurrence(deps.badTokens(), start, {
        start: editor.selectionStart,
        end: editor.selectionEnd,
      });
      if (!clickedToken) return;
      deps.onPick();
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(clickedToken.start, clickedToken.end, "forward");
      picked = { start: editor.selectionStart, end: editor.selectionEnd };
      editor.dataset.pick = LATIN.test(clickedToken.word) ? "latin" : "other";
      deps.setLastCaret({ start: clickedToken.end, end: clickedToken.end });
      scrollMarkIntoView(clickedToken.start);
      deps.showPopoverFor(clickedToken);
    });
  }

  if (copy) bindCopy(copy, deps.badTokens);

  return { render, clear };
}
