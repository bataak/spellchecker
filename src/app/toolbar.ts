import { requireEl } from "../ui/dom.ts";
import { buildErrorList, type Token } from "../spell/textcheck.ts";
import { initWipeButton } from "../ui/wipe.ts";
import { copyText, flash } from "../ui/clipboard.ts";
import { isTouch } from "../editor/input.ts";
import type { EditorPort, StatusPort } from "../core/ports.ts";
import { KEYS, read, write } from "../core/store.ts";
import { standardLetters } from "../lang/letters.ts";

export interface OfficeSwitch {
  readonly active: () => boolean;
  readonly close: () => void;
}

export interface ToolbarDeps {
  readonly editor: EditorPort;
  readonly status: StatusPort;
  readonly statusEl: HTMLElement;
  readonly office: OfficeSwitch;
  readonly forgetFile: () => void;
  readonly afterClear: (cleared: boolean) => void;
  readonly confirmClear?: () => boolean | Promise<boolean>;
  readonly closeProject?: () => boolean;
  readonly lettersFixed: () => void;
  readonly hasOpenFile: () => boolean;
  readonly badTokens: () => Token[];
  readonly invite?: (text: string) => boolean;
}

const SCROLL_SAVE_MS = 250;

export function parseSavedScroll(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function readSavedScroll(): number | null {
  return parseSavedScroll(read(KEYS.toolbarScroll));
}

function initToolbarMemory(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  if (!bar) return;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  bar.addEventListener(
    "scroll",
    () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        write(KEYS.toolbarScroll, String(Math.round(bar.scrollLeft)));
      }, SCROLL_SAVE_MS);
    },
    { passive: true },
  );
}

export function initToolbar(deps: ToolbarDeps): void {
  initToolbarScroll();
  initToolbarWheel();
  initToolbarMemory();
  initToolbarSnap();
  initClippedReveal();
  initButtons(deps);
}

function initToolbarWheel(): void {
  const bar = document.querySelector<HTMLElement>(".toolbar");
  if (!bar) return;
  bar.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || bar.scrollWidth <= bar.clientWidth) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bar.clientWidth
            : 1;
      const max = bar.scrollWidth - bar.clientWidth;
      const next = Math.min(
        max,
        Math.max(0, bar.scrollLeft + event.deltaY * unit),
      );
      if (next === bar.scrollLeft) return;
      event.preventDefault();
      bar.scrollLeft = next;
    },
    { passive: false },
  );
}

function initToolbarScroll(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const clearBtn = document.querySelector<HTMLElement>("#clearBtn");
  if (!bar || !clearBtn) return;
  requestAnimationFrame(() => {
    if (bar.scrollWidth <= bar.clientWidth) return;
    const saved = readSavedScroll();
    if (saved != null) {
      bar.scrollLeft = saved;
      return;
    }
    bar.scrollLeft +=
      clearBtn.getBoundingClientRect().left - bar.getBoundingClientRect().left;
  });
}

function initToolbarSnap(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const clearBtn = document.querySelector<HTMLElement>("#clearBtn");
  const endBtn = document.querySelector<HTMLElement>("#openBtn");
  if (!bar || !clearBtn || !endBtn) return;
  const ZONE = 56;
  let snapTimer: ReturnType<typeof setTimeout> | undefined;
  bar.addEventListener(
    "scroll",
    () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        const barRect = bar.getBoundingClientRect();
        const dHome = clearBtn.getBoundingClientRect().left - barRect.left;
        const dSave = endBtn.getBoundingClientRect().right - barRect.right;
        const aHome = Math.abs(dHome);
        const aSave = Math.abs(dSave);
        if (Math.min(aHome, aSave) > ZONE) return;
        const snapDelta = aHome <= aSave ? dHome : dSave;
        if (Math.abs(snapDelta) > 1)
          bar.scrollBy({ left: snapDelta, behavior: "smooth" });
      }, 90);
    },
    { passive: true },
  );
}

function initClippedReveal(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const found = document.querySelector<HTMLElement>(".toolbar");
  if (!found) return;
  const bar = found;
  const TOL = 4;
  const PAD = 8;

  function clipDelta(target: EventTarget | null): number {
    const btn =
      target instanceof Element
        ? target.closest<HTMLElement>(".tbtn, .treload")
        : null;
    if (!btn || !bar.contains(btn)) return 0;
    const barRect = bar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const over = btnRect.right - barRect.right;
    if (over > TOL) return over + PAD;
    const under = barRect.left - btnRect.left;
    if (under > TOL) return -(under + PAD);
    return 0;
  }

  bar.addEventListener(
    "pointerdown",
    (e) => {
      if (clipDelta(e.target) !== 0) e.stopPropagation();
    },
    true,
  );

  bar.addEventListener(
    "click",
    (e) => {
      const delta = clipDelta(e.target);
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      bar.scrollBy({ left: delta, behavior: "smooth" });
    },
    true,
  );
}

function initCopyButton(
  editor: HTMLTextAreaElement,
  setStatus: ToolbarDeps["status"]["set"],
  statusEl: HTMLElement,
  badTokens: ToolbarDeps["badTokens"],
): void {
  const btn = document.querySelector<HTMLElement>("#copyBtn");
  if (!btn) return;
  const HOLD = 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let armed = false;
  let revertTimer: ReturnType<typeof setTimeout> | null = null;
  const showStatus = (msg: string): void => {
    const prevStatus = statusEl.innerHTML;
    setStatus(msg, false);
    if (revertTimer) clearTimeout(revertTimer);
    revertTimer = setTimeout(() => {
      if (statusEl.innerHTML === msg) setStatus(prevStatus, false);
    }, 1600);
  };
  btn.addEventListener("pointerdown", () => {
    if (timer) clearTimeout(timer);
    armed = false;
    timer = setTimeout(() => {
      armed = true;
    }, HOLD);
  });
  const clear = () => {
    if (timer) clearTimeout(timer);
  };
  const drop = (event: PointerEvent) => {
    clear();
    if (event.type === "pointercancel" || event.buttons) armed = false;
  };
  btn.addEventListener("pointerup", clear);
  btn.addEventListener("pointercancel", drop);
  btn.addEventListener("pointerleave", drop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("click", async () => {
    if (armed) {
      armed = false;
      const words = buildErrorList(badTokens()).map((token) => token.word);
      if (!words.length) {
        showStatus("Алдаатай үг алга");
        return;
      }
      try {
        await copyText(words.join("\n"));
        showStatus("Алдаатай үгс хуулагдлаа");
      } catch {
        showStatus("Хуулах боломжгүй");
      }
      return;
    }
    if (!editor.value) return;
    try {
      await copyText(editor.value);
      flash(btn, "Хуулагдав");
    } catch {
      flash(btn, "Боломжгүй");
    }
  });
}

function pasteManually(
  editor: HTMLTextAreaElement,
  setStatus: ToolbarDeps["status"]["set"],
  pasteBtn: HTMLElement,
): void {
  editor.focus();
  if (isTouch()) {
    setStatus(
      "Талбар дотор удаан дарахад гарах <b>Paste</b> цэсийг ашиглан буулгана уу",
    );
    return;
  }
  const uaData = navigator.userAgentData;
  const isMac =
    /mac/i.test((uaData && uaData.platform) || "") ||
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
  flash(pasteBtn, isMac ? "⌘V" : "Ctrl+V");
}

function initButtons({
  editor: port,
  status,
  statusEl,
  office,
  forgetFile,
  hasOpenFile,
  badTokens,
  afterClear,
  confirmClear = () => true,
  closeProject = () => false,
  lettersFixed,
  invite = () => false,
}: ToolbarDeps): void {
  const editor = port.el;
  const setStatus = status.set;
  const clearBtn = requireEl<HTMLElement>("#clearBtn");
  initWipeButton(clearBtn);
  const wipeText = (): void => {
    if (editor.value) write(KEYS.lastCleared, editor.value);
    office.close();
    forgetFile();
    void port.replace("", 0);
    afterClear(true);
  };
  let confirming = false;
  clearBtn.addEventListener("click", () => {
    if (confirming || closeProject()) return;
    if (!editor.value && !hasOpenFile()) {
      afterClear(false);
      editor.focus();
      return;
    }
    const ok = confirmClear();
    if (ok === true) return wipeText();
    if (ok === false) return;
    confirming = true;
    void ok
      .catch(() => false)
      .then((sure) => {
        confirming = false;
        if (sure) wipeText();
        else editor.focus();
      });
  });

  function insertAtCaret(text: string): void {
    let start = editor.selectionStart;
    let end = editor.selectionEnd;
    if (start == null) {
      start = editor.value.length;
      end = start;
    }
    port.insert(text, start, end);
    void port.render();
    port.save();
  }

  const pasteBtn = requireEl<HTMLElement>("#pasteBtn");
  pasteBtn.addEventListener("click", async () => {
    if (office.active()) {
      flash(pasteBtn, "Боломжгүй");
      return;
    }
    if (!navigator.clipboard?.readText) {
      pasteManually(editor, setStatus, pasteBtn);
      return;
    }
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      pasteManually(editor, setStatus, pasteBtn);
      return;
    }
    if (!text) {
      editor.focus();
      return;
    }
    if (invite(text)) return;
    const fixed = standardLetters(text);
    insertAtCaret(fixed);
    if (fixed !== text) lettersFixed();
  });

  initCopyButton(editor, status.set, statusEl, badTokens);
}
