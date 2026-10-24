export interface IdleWatch {
  stop(): void;
}

const ACTIVITY = ["keydown", "pointerdown", "wheel", "focus"] as const;

export function watchIdle(
  idleMs: number,
  onIdle: () => void,
  onActive: () => void,
): IdleWatch {
  let last = Date.now();
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = (): void => {
    timer = setTimeout(check, Math.max(0, last + idleMs - Date.now()));
  };
  function check(): void {
    timer = null;
    if (Date.now() - last < idleMs) return arm();
    idle = true;
    onIdle();
  }
  const touch = (): void => {
    last = Date.now();
    if (!idle) return;
    idle = false;
    onActive();
    arm();
  };
  const onVisible = (): void => {
    if (document.visibilityState === "visible") touch();
  };

  for (const type of ACTIVITY)
    window.addEventListener(type, touch, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisible);
  arm();

  return {
    stop() {
      if (timer) clearTimeout(timer);
      for (const type of ACTIVITY)
        window.removeEventListener(type, touch, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
