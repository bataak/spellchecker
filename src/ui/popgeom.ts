export const MIN_POPOVER_H = 120;

export interface View {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly bottom: number;
}

export interface Fit {
  readonly top: number;
  readonly height: number;
  readonly capped: boolean;
}

let safeTopProbe: HTMLElement | null = null;

function safeAreaTop(): number {
  if (!safeTopProbe) {
    safeTopProbe = document.createElement("div");
    safeTopProbe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;" +
      "pointer-events:none;padding-top:env(safe-area-inset-top)";
    document.body.appendChild(safeTopProbe);
  }
  return parseFloat(getComputedStyle(safeTopProbe).paddingTop) || 0;
}

export function visibleView(): View {
  const vv = window.visualViewport;
  const safeTop = safeAreaTop();
  const top = (vv ? vv.offsetTop : 0) + safeTop;
  const height = (vv ? vv.height : window.innerHeight) - safeTop;
  return {
    top,
    left: vv ? vv.offsetLeft : 0,
    width: vv ? vv.width : window.innerWidth,
    bottom: top + height,
  };
}

export function fitVertically(
  anchor: { readonly top: number; readonly bottom: number },
  view: View,
  wanted: number,
  margin: number,
): Fit {
  const spaceBelow = view.bottom - anchor.bottom - margin * 2;
  const spaceAbove = anchor.top - view.top - margin * 2;
  const below = spaceBelow >= spaceAbove;
  const room = Math.max(MIN_POPOVER_H, below ? spaceBelow : spaceAbove);
  const height = Math.min(wanted, room);
  const top = below ? anchor.bottom + margin : anchor.top - height - margin;
  return {
    top: Math.max(
      view.top + margin,
      Math.min(top, view.bottom - height - margin),
    ),
    height,
    capped: height < wanted,
  };
}

export function wordScrollTarget(
  editor: HTMLTextAreaElement,
  markRect: DOMRect,
): number | null {
  const vv = window.visualViewport;
  const editorRect = editor.getBoundingClientRect();
  const vTop = vv ? vv.offsetTop : 0;
  const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const visTop = Math.max(editorRect.top, vTop);
  const visBottom = Math.min(editorRect.bottom, vBottom);
  const visH = visBottom - visTop;
  if (visH <= 60) return null;
  if (markRect.top >= visTop + 8 && markRect.bottom <= visBottom - 8)
    return null;
  const targetY = visTop + Math.max(60, Math.min(visH * 0.3, 150));
  const maxScroll = editor.scrollHeight - editor.clientHeight;
  const next = Math.max(
    0,
    Math.min(editor.scrollTop + (markRect.top - targetY), maxScroll),
  );
  return Math.abs(next - editor.scrollTop) > 2 ? next : null;
}
