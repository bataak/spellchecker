import type { DefDock } from "./defdock.ts";
import type { PauseToggle, TipWindow } from "./tipwindow.ts";

export interface PinDeps {
  readonly dock: DefDock;
  readonly win: TipWindow;
  readonly pause: PauseToggle;
  readonly showPinned: (content: Node[]) => void;
  readonly closePinned: () => void;
}

export function bindDockPin(d: PinDeps): void {
  const { dock, win } = d;
  dock.onDragOut((e, content) => {
    d.showPinned(content);
    win.move(e.clientX - 40, e.clientY - 12);
    win.startDrag(e.pointerId, 40, 12);
  });
  dock.addControl(d.pause.button("error-copy def-dock-pause"));
  dock.onShow((body) => {
    const tip = win.el();
    const tipBody = win.body();
    if (!win.pinned() || !tip || tip.hidden || !tipBody) return;
    const content = [...tipBody.childNodes].filter(
      (node) => !(node as Element).classList?.contains("def-empty"),
    );
    if (content.length) {
      body.replaceChildren(...content);
      body.scrollTop = 0;
    }
    d.closePinned();
  });
  const savedPin = win.savedPin();
  if (savedPin && window.matchMedia("(hover: hover)").matches) {
    requestAnimationFrame(() => {
      if (dock.body()) return;
      d.showPinned([]);
      win.move(savedPin.left, savedPin.top);
    });
  }
}
