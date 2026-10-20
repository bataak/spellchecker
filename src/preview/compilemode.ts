const HOLD_MS = 600;
export const AUTO_DELAY_MS = 2000;
export const AUTO_LIMIT_MS = 15000;

export function autoDelay(lastCompileMs: number): number {
  return Math.max(AUTO_DELAY_MS, lastCompileMs);
}

export function tooSlowForAuto(compileMs: number, fetched: boolean): boolean {
  return !fetched && compileMs > AUTO_LIMIT_MS;
}

export const MANUAL_TITLE =
  "Хөрвүүлэх (Ctrl+Enter). Удаан дарвал автомат горимд шилжинэ (Ctrl+Shift+Enter)";
export const AUTO_TITLE =
  "Автомат горим: бичиж зогсоход хөрвүүлнэ. Дарвал гар горимд шилжиж хөрвүүлнэ (Ctrl+Enter)";

export interface CompileButtonDeps {
  readonly button: HTMLButtonElement;
  readonly area: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly auto: () => boolean;
  readonly compile: () => void;
  readonly toAuto: () => void;
}

export interface CompileButton {
  paint(): void;
  destroy(): void;
}

export function initCompileButton(deps: CompileButtonDeps): CompileButton {
  const { button, area } = deps;
  let timer = 0;
  let held = false;

  const paint = (): void => {
    const auto = deps.auto();
    const label = auto ? AUTO_TITLE : MANUAL_TITLE;
    button.classList.toggle("is-auto", auto);
    button.title = label;
    button.setAttribute("aria-label", label);
  };

  const release = (): void => {
    clearTimeout(timer);
    timer = 0;
  };

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    held = false;
    release();
    timer = window.setTimeout(() => {
      timer = 0;
      held = true;
      deps.toAuto();
    }, HOLD_MS);
  };

  const onClick = (): void => {
    if (held) {
      held = false;
      return;
    }
    deps.compile();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (!deps.active()) return;
    event.preventDefault();
    if (event.shiftKey) deps.toAuto();
    else deps.compile();
  };

  const onMenu = (event: Event): void => event.preventDefault();

  const abandon = (): void => {
    release();
    held = false;
  };

  button.addEventListener("pointerdown", onDown);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", abandon);
  button.addEventListener("pointercancel", abandon);
  button.addEventListener("contextmenu", onMenu);
  button.addEventListener("click", onClick);
  area.addEventListener("keydown", onKey);
  paint();

  return {
    paint,
    destroy() {
      release();
      button.removeEventListener("pointerdown", onDown);
      button.removeEventListener("pointerup", release);
      button.removeEventListener("pointerleave", abandon);
      button.removeEventListener("pointercancel", abandon);
      button.removeEventListener("contextmenu", onMenu);
      button.removeEventListener("click", onClick);
      area.removeEventListener("keydown", onKey);
    },
  };
}
