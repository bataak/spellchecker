import { COPY_FAILED, copiedNote, ISSUES_URL } from "./suggestmarkup.ts";

const LONG_PRESS_MS = 550;
const VERIFY_MS = 400;
const RELEASE_WINDOW_MS = 700;

export interface HoldCopyDeps {
  readonly enabled: () => boolean;
  readonly count: () => number;
  readonly copy: () => Promise<void>;
  readonly note: (msg: string, kind?: string) => void;
}

export function attachHoldToCopy(el: HTMLElement, d: HoldCopyDeps): void {
  let pressStart = 0;
  let pressDuration = 0;
  let releasedAt = 0;
  let armTimer: ReturnType<typeof setTimeout> | null = null;
  let verifyTimer: ReturnType<typeof setTimeout> | null = null;
  const disarm = () => {
    if (armTimer) clearTimeout(armTimer);
    armTimer = null;
  };
  const clearVerify = () => {
    if (verifyTimer) clearTimeout(verifyTimer);
    verifyTimer = null;
  };
  el.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      pressStart = performance.now();
      pressDuration = 0;
      disarm();
      clearVerify();
      armTimer = setTimeout(() => {
        armTimer = null;
        if (!d.enabled()) return;
        const count = d.count();
        if (count) d.note(copiedNote(count), "ok");
        else d.note("Хуулах үг алга");
      }, LONG_PRESS_MS);
    },
    { passive: true },
  );
  el.addEventListener("touchend", () => {
    disarm();
    if (pressStart) {
      pressDuration = performance.now() - pressStart;
      releasedAt = performance.now();
      if (pressDuration >= LONG_PRESS_MS) {
        clearVerify();
        verifyTimer = setTimeout(() => {
          verifyTimer = null;
          if (d.enabled() && d.count()) d.note(COPY_FAILED, "err");
        }, VERIFY_MS);
      }
    }
    pressStart = 0;
  });
  el.addEventListener("touchcancel", () => {
    disarm();
    clearVerify();
    pressStart = 0;
    pressDuration = 0;
    d.note("");
  });
  el.addEventListener("contextmenu", (e) => {
    if (pressStart) e.preventDefault();
  });
  el.addEventListener("click", () => {
    clearVerify();
    const held =
      pressDuration >= LONG_PRESS_MS &&
      performance.now() - releasedAt < RELEASE_WINDOW_MS;
    pressDuration = 0;
    if (held && d.enabled()) void d.copy();
  });
}

export function attachIssuesPress(
  button: Element,
  issuesHidden: () => boolean,
): void {
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  const startPress = () => {
    if (!issuesHidden()) return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      window.open(ISSUES_URL, "_blank", "noopener,noreferrer");
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };
  const dropPress = (e: Event) => {
    cancelPress();
    if (e.type === "pointercancel" || (e as PointerEvent).buttons)
      longPressed = false;
  };
  button.addEventListener("pointerdown", startPress);
  button.addEventListener("pointerup", cancelPress);
  button.addEventListener("pointerleave", dropPress);
  button.addEventListener("pointercancel", dropPress);
  button.addEventListener("contextmenu", (e) => {
    if (issuesHidden()) e.preventDefault();
  });
  button.addEventListener(
    "click",
    (e) => {
      if (longPressed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        longPressed = false;
      }
    },
    true,
  );
}
