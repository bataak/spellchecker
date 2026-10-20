const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = 30;

export function onDoubleTap(
  body: HTMLElement,
  jump: (x: number, y: number, target: EventTarget | null) => void,
): () => void {
  let tappedAt = -Infinity;
  let press: { x: number; y: number; id: number } | null = null;
  let lastTap: { x: number; y: number; at: number } | null = null;
  const onJump = (event: MouseEvent): void => {
    if (event.button !== 0 || event.timeStamp - tappedAt < DOUBLE_TAP_MS)
      return;
    jump(event.clientX, event.clientY, event.target);
  };
  const onPress = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" || !event.isPrimary) {
      press = null;
      return;
    }
    press = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onRelease = (event: PointerEvent): void => {
    const start = press;
    press = null;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX;
    const y = event.clientY;
    if (Math.hypot(x - start.x, y - start.y) > TAP_SLOP) return;
    const now = event.timeStamp;
    const before = lastTap;
    if (
      before &&
      now - before.at < DOUBLE_TAP_MS &&
      Math.hypot(x - before.x, y - before.y) < DOUBLE_TAP_SLOP
    ) {
      lastTap = null;
      tappedAt = now;
      jump(x, y, event.target);
      return;
    }
    lastTap = { x, y, at: now };
  };
  const onCancel = (): void => {
    press = null;
  };
  body.addEventListener("dblclick", onJump);
  body.addEventListener("pointerdown", onPress);
  body.addEventListener("pointerup", onRelease);
  body.addEventListener("pointercancel", onCancel);
  return () => {
    body.removeEventListener("dblclick", onJump);
    body.removeEventListener("pointerdown", onPress);
    body.removeEventListener("pointerup", onRelease);
    body.removeEventListener("pointercancel", onCancel);
  };
}
