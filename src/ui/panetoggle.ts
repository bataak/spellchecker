const SVG_NS = "http://www.w3.org/2000/svg";

const TO_PREVIEW = "Харагдац уруу шилжих";
const TO_EDITOR = "Бичвэр уруу буцах";
const OUT_ROOM = 28;

export interface PaneToggle {
  setAvailable(on: boolean): void;
  sync(): void;
}

function chevron(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "pane-toggle-glyph");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M8 3.5 3.5 8 8 12.5M12.5 3.5 8 8l4.5 4.5");
  svg.append(path);
  return svg;
}

export function initPaneToggle(
  workspace: HTMLElement,
  area: HTMLTextAreaElement,
  sideBySide: () => boolean,
  onChange: (preview: boolean) => void,
): PaneToggle {
  const root = document.documentElement;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pane-toggle";
  button.hidden = true;
  button.append(chevron());
  button.addEventListener("mousedown", (event) => event.preventDefault());
  const editorWrap = area.closest<HTMLElement>(".editor-wrap") ?? workspace;

  let available = false;
  let preview = root.dataset.pane === "preview";
  (preview ? workspace : editorWrap).append(button);
  const booting = (): boolean => root.classList.contains("booting");

  const paint = (): void => {
    const label = preview ? TO_EDITOR : TO_PREVIEW;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(preview));
  };

  const set = (next: boolean): void => {
    next = next && available && !sideBySide();
    if (next === preview) return;
    preview = next;
    const focused = document.activeElement === button;
    if (preview) {
      root.dataset.pane = "preview";
      area.blur();
    } else delete root.dataset.pane;
    (preview ? workspace : editorWrap).append(button);
    paint();
    place();
    onChange(preview);
    if (!focused) return;
    if (preview) button.focus();
    else area.focus();
  };

  const place = (): void => {
    const host = button.parentElement;
    if (button.hidden || !host) return;
    const box = host.getBoundingClientRect();
    const room = preview ? box.left : window.innerWidth - box.right;
    button.classList.toggle("is-out", room >= OUT_ROOM);
  };

  const sync = (): void => {
    button.hidden = !available || sideBySide();
    if (button.hidden && !booting()) set(false);
    requestAnimationFrame(place);
  };

  if (booting()) {
    const watch = new MutationObserver(() => {
      if (booting()) return;
      watch.disconnect();
      sync();
    });
    watch.observe(root, { attributes: true, attributeFilter: ["class"] });
  }

  button.addEventListener("click", () => set(!preview));
  window.addEventListener("resize", () => requestAnimationFrame(place));
  paint();

  return {
    setAvailable(on) {
      if (on === available) return;
      available = on;
      sync();
    },
    sync,
  };
}
