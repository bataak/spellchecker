import type { BarTool, MenuSection } from "./texmenudata.ts";
import { TOOL_GLYPH, glyphSvg } from "./texglyphs.ts";
import { insertCode, type Insert } from "./texmenuedit.ts";

export const POP_ID = "texBarPop";

function toolButton(tool: BarTool): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tbtn md-btn tex-btn";
  button.dataset.tool = tool.id;
  button.title = tool.title;
  button.setAttribute("aria-label", tool.title);
  if (tool.gap) button.dataset.gap = "";
  if (tool.icon) button.innerHTML = tool.icon;
  else if (tool.tex) button.append(glyphSvg(tool.tex, TOOL_GLYPH));
  else button.textContent = tool.glyph;
  if (tool.kind !== "action") {
    button.classList.add("has-menu");
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", POP_ID);
  }
  return button;
}

export function toolGroup(tools: readonly BarTool[]): HTMLElement {
  const group = document.createElement("span");
  group.className = "md-group tex-group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "LaTeX");
  group.hidden = true;
  group.append(...tools.map(toolButton));
  return group;
}

function menuItem(label: string, insert: Insert, at: number): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-menu-item tex-item";
  button.setAttribute("role", "menuitem");
  button.dataset.insert = String(at);
  const name = document.createElement("span");
  name.className = "tex-name";
  name.textContent = label;
  const code = document.createElement("code");
  code.className = "tex-code";
  code.textContent = insertCode(insert);
  button.append(name, code);
  return button;
}

export function listMenu(
  sections: readonly MenuSection[],
  inserts: Insert[],
): HTMLElement[] {
  return sections.map((section) => {
    const block = document.createElement("div");
    block.className = "tex-section";
    block.setAttribute("role", "group");
    block.setAttribute("aria-label", section.title);
    const title = document.createElement("div");
    title.className = "md-menu-group";
    title.textContent = section.title;
    const items = section.items.map((item) =>
      menuItem(item.label, item.insert, inserts.push(item.insert) - 1),
    );
    block.append(title, ...items);
    return block;
  });
}
