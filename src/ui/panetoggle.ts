const SVG_NS = "http://www.w3.org/2000/svg";

const TO_PREVIEW = "Харагдац уруу шилжих";
const TO_EDITOR = "Бичвэр уруу буцах";

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
  editorWrap.append(button);

  let available = false;
  let preview = false;

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
    onChange(preview);
    if (!focused) return;
    if (preview) button.focus();
    else area.focus();
  };

  const sync = (): void => {
    button.hidden = !available || sideBySide();
    if (button.hidden) set(false);
  };

  button.addEventListener("click", () => set(!preview));
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
