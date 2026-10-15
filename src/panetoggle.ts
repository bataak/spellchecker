const SVG_NS = "http://www.w3.org/2000/svg";

const TO_PREVIEW = "Харагдац руу шилжих";
const TO_EDITOR = "Бичвэр рүү буцах";

export interface PaneToggle {
  setAvailable(on: boolean): void;
  showsPreview(): boolean;
  destroy(): void;
}

function chevron(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "pane-toggle-glyph");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M10 3.5 5.5 8l4.5 4.5");
  svg.append(path);
  return svg;
}

export function initPaneToggle(
  workspace: HTMLElement,
  area: HTMLTextAreaElement,
  onChange: (preview: boolean) => void,
): PaneToggle {
  const wide = window.matchMedia("(min-width: 1024px)");
  const root = document.documentElement;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pane-toggle";
  button.hidden = true;
  button.append(chevron());
  button.addEventListener("mousedown", (event) => event.preventDefault());
  workspace.append(button);

  let available = false;
  let preview = false;

  const paint = (): void => {
    const label = preview ? TO_EDITOR : TO_PREVIEW;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(preview));
  };

  const set = (next: boolean): void => {
    next = next && available && !wide.matches;
    if (next === preview) return;
    preview = next;
    if (preview) {
      root.dataset.pane = "preview";
      area.blur();
    } else delete root.dataset.pane;
    paint();
    onChange(preview);
    if (!preview && document.activeElement === button) area.focus();
  };

  const sync = (): void => {
    button.hidden = !available || wide.matches;
    if (button.hidden) set(false);
  };

  button.addEventListener("click", () => set(!preview));
  const onWide = (): void => sync();
  wide.addEventListener("change", onWide);
  paint();

  return {
    setAvailable(on) {
      if (on === available) return;
      available = on;
      sync();
    },
    showsPreview: () => preview,
    destroy() {
      wide.removeEventListener("change", onWide);
      set(false);
      button.remove();
    },
  };
}
