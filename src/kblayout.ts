import { replaceRange } from "./editortext.ts";

export type Layout = "mn" | "en";

type KeyMap = Readonly<Record<string, readonly [string, string]>>;

const MN: KeyMap = {
  Backquote: ["=", "+"],
  Digit1: ["1", "№"],
  Digit2: ["2", "-"],
  Digit3: ["3", '"'],
  Digit4: ["4", "₮"],
  Digit5: ["5", ":"],
  Digit6: ["6", "."],
  Digit7: ["7", "_"],
  Digit8: ["8", ","],
  Digit9: ["9", "%"],
  Digit0: ["0", "?"],
  Minus: ["е", "Е"],
  Equal: ["щ", "Щ"],
  KeyQ: ["ф", "Ф"],
  KeyW: ["ц", "Ц"],
  KeyE: ["у", "У"],
  KeyR: ["ж", "Ж"],
  KeyT: ["э", "Э"],
  KeyY: ["н", "Н"],
  KeyU: ["г", "Г"],
  KeyI: ["ш", "Ш"],
  KeyO: ["ү", "Ү"],
  KeyP: ["з", "З"],
  BracketLeft: ["к", "К"],
  BracketRight: ["ъ", "Ъ"],
  KeyA: ["й", "Й"],
  KeyS: ["ы", "Ы"],
  KeyD: ["б", "Б"],
  KeyF: ["ө", "Ө"],
  KeyG: ["а", "А"],
  KeyH: ["х", "Х"],
  KeyJ: ["р", "Р"],
  KeyK: ["о", "О"],
  KeyL: ["л", "Л"],
  Semicolon: ["д", "Д"],
  Quote: ["п", "П"],
  Backslash: ["!", "|"],
  IntlBackslash: ["(", ")"],
  KeyZ: ["я", "Я"],
  KeyX: ["ч", "Ч"],
  KeyC: ["ё", "Ё"],
  KeyV: ["с", "С"],
  KeyB: ["м", "М"],
  KeyN: ["и", "И"],
  KeyM: ["т", "Т"],
  Comma: ["ь", "Ь"],
  Period: ["в", "В"],
  Slash: ["ю", "Ю"],
};

const EN: KeyMap = {
  Backquote: ["`", "~"],
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Digit0: ["0", ")"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Backslash: ["\\", "|"],
  IntlBackslash: ["\\", "|"],
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
  ...Object.fromEntries(
    [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => [
      "Key" + letter.toUpperCase(),
      [letter, letter.toUpperCase()],
    ]),
  ),
};

const MAPS: Readonly<Record<Layout, KeyMap>> = { mn: MN, en: EN };
const LETTER = /\p{L}/u;
const STORAGE_KEY = "keyboard-layout";
const BADGE_MS = 1100;

export function mapKey(
  layout: Layout,
  code: string,
  shift: boolean,
  capsLock: boolean,
): string | null {
  const pair = MAPS[layout][code];
  if (!pair) return null;
  const [plain, shifted] = pair;
  const letter = LETTER.test(plain) && plain !== shifted;
  return shift !== (letter && capsLock) ? shifted : plain;
}

export function systemLayout(keyQ: string): Layout {
  return keyQ.toLowerCase() === MN.KeyQ![0] ? "mn" : "en";
}

export function otherLayout(system: Layout | null): Layout {
  return system === "mn" ? "en" : "mn";
}

function loadForced(): Layout | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "mn" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

function saveForced(layout: Layout | null): void {
  try {
    if (layout) localStorage.setItem(STORAGE_KEY, layout);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const MIRROR_STYLES = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "fontStretch",
  "fontKerning",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "tabSize",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
] as const;

function caretPoint(
  editor: HTMLTextAreaElement,
): { x: number; y: number; height: number } {
  const style = getComputedStyle(editor);
  const mirror = document.createElement("div");
  for (const name of MIRROR_STYLES) mirror.style[name] = style[name];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.boxSizing = "border-box";
  mirror.style.width = editor.clientWidth + editor.clientLeft * 2 + "px";
  mirror.style.overflow = "hidden";
  const offset = editor.selectionStart;
  mirror.textContent = editor.value.slice(0, offset);
  const marker = document.createElement("span");
  marker.textContent = editor.value.slice(offset, offset + 1) || ".";
  mirror.append(marker);
  document.body.append(mirror);
  const box = editor.getBoundingClientRect();
  const point = {
    x: box.left + marker.offsetLeft - editor.scrollLeft,
    y: box.top + marker.offsetTop - editor.scrollTop,
    height: marker.offsetHeight,
  };
  mirror.remove();
  return point;
}

export interface KeyboardLayoutDeps {
  readonly editor: HTMLTextAreaElement;
  readonly status: HTMLElement;
}

export function initKeyboardLayout(deps: KeyboardLayoutDeps): void {
  const { editor } = deps;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  let forced = loadForced();
  let system: Layout | null = null;

  const navKeyboard = (
    navigator as {
      keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
    }
  ).keyboard;
  void navKeyboard
    ?.getLayoutMap?.()
    .then((map) => {
      const q = map.get("KeyQ");
      if (q) system = systemLayout(q);
    })
    .catch(() => undefined);

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "layout-chip";
  chip.addEventListener("mousedown", (event) => event.preventDefault());
  chip.addEventListener("click", () => setForced(null));
  deps.status.after(chip);

  const badge = document.createElement("div");
  badge.className = "layout-badge";
  badge.setAttribute("aria-live", "polite");
  badge.hidden = true;
  document.body.append(badge);
  let badgeTimer = 0;

  const label = (layout: Layout): string => (layout === "mn" ? "MN" : "EN");
  const describe = (layout: Layout): string =>
    layout === "mn" ? "Монгол гарын байрлал" : "US keyboard layout";

  const sync = (): void => {
    chip.hidden = forced === null;
    chip.textContent = forced ? label(forced) : "";
    const hint = forced
      ? describe(forced) + ". Дарвал системийн гарын байрлал уруу буцна"
      : "";
    chip.title = hint;
    chip.setAttribute("aria-label", hint);
    editor.classList.toggle("layout-forced", forced !== null);
  };

  const showBadge = (layout: Layout): void => {
    const caret = caretPoint(editor);
    badge.textContent = label(layout);
    badge.style.left = caret.x + 4 + "px";
    badge.style.top = caret.y + caret.height + 2 + "px";
    badge.hidden = false;
    badge.classList.remove("layout-badge-out");
    clearTimeout(badgeTimer);
    badgeTimer = window.setTimeout(() => {
      badge.classList.add("layout-badge-out");
      badgeTimer = window.setTimeout(() => {
        badge.hidden = true;
      }, 200);
    }, BADGE_MS);
  };

  const setForced = (next: Layout | null): void => {
    forced = next;
    saveForced(forced);
    sync();
    if (forced) showBadge(forced);
    else {
      clearTimeout(badgeTimer);
      badge.hidden = true;
    }
    editor.focus({ preventScroll: true });
  };

  editor.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      if (
        event.code === "Backslash" &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        setForced(
          forced ? (forced === "mn" ? "en" : "mn") : otherLayout(system),
        );
        return;
      }
      if (!forced) {
        if (
          system === null &&
          event.code === "KeyQ" &&
          event.key.length === 1
        )
          system = systemLayout(event.key);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const text = mapKey(
        forced,
        event.code,
        event.shiftKey,
        event.getModifierState("CapsLock"),
      );
      if (text === null) return;
      event.preventDefault();
      if (!replaceRange(editor, editor.selectionStart, editor.selectionEnd, text))
        editor.dispatchEvent(new Event("input", { bubbles: true }));
    },
    true,
  );

  sync();
}
