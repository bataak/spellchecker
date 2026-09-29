import "./hint.css";

const SEEN_PREFIX = "hintSeen:";
const SHOW_DELAY_MS = 600;
const HIDE_AFTER_MS = 12000;
const COOLDOWN_MS = 20000;
const QUIET_MS = 2500;
const GAP = 10;
const EDGE = 8;

export interface Hint {
  readonly id: string;
  readonly target: () => HTMLElement | null;
  readonly html: string;
}

function seen(id: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

function markSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_PREFIX + id, "1");
  } catch {}
}

function isMac(): boolean {
  const plat = navigator.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(plat);
}

function isTouch(): boolean {
  return !!window.matchMedia?.("(pointer: coarse)").matches;
}

function kbd(win: string, mac: string): string {
  return "<kbd>" + (isMac() ? mac : win) + "</kbd>";
}

function visible(el: HTMLElement | null): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function display(hint: Hint, button: HTMLElement, onHide: () => void): void {
  const tip = document.createElement("div");
  tip.className = "hint-bubble";
  tip.setAttribute("role", "status");
  tip.innerHTML = hint.html;

  const place = (): void => {
    if (!visible(button)) {
      hide();
      return;
    }
    const r = button.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - w / 2, EDGE), vw - w - EDGE);
    const above = r.top - GAP - h >= EDGE;
    tip.dataset.side = above ? "above" : "below";
    tip.style.left = `${left}px`;
    tip.style.top = `${above ? r.top - GAP - h : r.bottom + GAP}px`;
    tip.style.setProperty("--arrow-x", `${center - left}px`);
  };

  const hideTimer = setTimeout(() => hide(), HIDE_AFTER_MS);

  function hide(): void {
    clearTimeout(hideTimer);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("pointerdown", hide, true);
    document.removeEventListener("keydown", hide, true);
    tip.remove();
    delete button.dataset.hinted;
    onHide();
  }

  button.dataset.hinted = "";
  document.body.append(tip);
  place();
  markSeen(hint.id);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", hide, true);
}

export function initHints(source: () => readonly Hint[]): () => void {
  let showing = false;
  let readyAt = 0;
  let lastActive = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const activity = (): void => {
    lastActive = Date.now();
  };
  document.addEventListener("keydown", activity, true);
  document.addEventListener("input", activity, true);

  function schedule(delay: number): void {
    clearTimeout(timer);
    timer = setTimeout(tryShow, delay);
  }

  function tryShow(): void {
    if (showing) return;
    const now = Date.now();
    const wait = Math.max(readyAt - now, lastActive + QUIET_MS - now);
    if (wait > 0) {
      schedule(wait);
      return;
    }
    for (const hint of source()) {
      if (seen(hint.id)) continue;
      const button = hint.target();
      if (!visible(button)) continue;
      showing = true;
      display(hint, button, () => {
        showing = false;
        readyAt = Date.now() + COOLDOWN_MS;
        schedule(COOLDOWN_MS);
      });
      return;
    }
  }

  return () => {
    if (!showing) schedule(SHOW_DELAY_MS);
  };
}

export function layoutHint(target: () => HTMLElement | null): Hint {
  return {
    id: "layout",
    target,
    html: "Дэлгэцний горимыг энд дарж сонгоно.",
  };
}

export function exportHint(target: () => HTMLElement | null): Hint {
  return {
    id: "export",
    target,
    html: isTouch()
      ? "PDF, DOCX зэрэг файл болгох бол <b>Хадгалах</b> товчийг удаан дарна."
      : "PDF, DOCX зэрэг файл болгох бол " +
        kbd("Ctrl+Shift+Alt+S", "⌘⇧⌥S") +
        " эсвэл " +
        kbd("Shift", "⇧") +
        " дарж байгаад <b>Хадгалах</b> товчийг дарна.",
  };
}

export function openHint(target: () => HTMLElement | null): Hint {
  return {
    id: "open",
    target,
    html: isTouch()
      ? "txt, md, docx, pptx, odt, odp, pdf файлууд дахь бичвэрийн алдааг шалгана."
      : "txt, md, docx, pptx, odt, odp, pdf файлууд дахь бичвэрийн алдааг шалгана (" +
        kbd("Ctrl+O", "⌘O") +
        "). Файлаа бичвэрийн талбар уруу чирч оруулж болно.",
  };
}

export function defineHint(target: () => HTMLElement | null): Hint {
  return {
    id: "define",
    target,
    html: isTouch()
      ? "Үгэн дээр товшоод энэ товчийг дарвал үгийн тайлбар харагдана. " +
        "Удаан дарвал тайлбар толинуудыг удирдана."
      : "Үгэн дээр заагчаа байрлуулаад энэ товчийг дарвал үгийн тайлбар харагдана (" +
        kbd("Ctrl+Shift+Space", "⌘⇧Space") +
        "). " +
        kbd("Shift", "⇧") +
        " товчтой дарвал тайлбар толинуудыг удирдана.",
  };
}

export function spellDictHint(target: () => HTMLElement | null): Hint {
  return {
    id: "spelldict",
    target,
    html: isTouch()
      ? "Монгол, англи алдаа шалгах толинуудаа эндээс товшиж сонгоно."
      : "Монгол, англи алдаа шалгах толинуудаа эндээс сонгоно (" +
        kbd("Ctrl+Shift+L", "⌘⇧L") +
        ").",
  };
}

export function templateHint(target: () => HTMLElement | null): Hint {
  return {
    id: "template",
    target,
    html: "Албан бичиг, тайлан, илтгэл бичих бол эндээс жишээ загвар сонгоно.",
  };
}
