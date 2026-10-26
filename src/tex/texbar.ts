import type { BarTools } from "../mdbar/toolhost.ts";
import type { Expansion } from "./texcompletion.ts";
import { listMenu, toolGroup } from "./texbarview.ts";
import { TEX_TOOLS, type BarTool } from "./texmenudata.ts";
import { menuEdit, type Insert } from "./texmenuedit.ts";
import { createPalette, type Palette } from "./texpalette.ts";
import { createPopover, type PopContent } from "./texpop.ts";
import { closestTarget } from "../ui/dom.ts";

export interface TexBarDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly insert: (edit: Expansion) => void;
  readonly tools?: readonly BarTool[];
}

type MenuTool = Exclude<BarTool, { kind: "action" }>;

export function createTexBar(deps: TexBarDeps): BarTools {
  const { editor } = deps;
  const tools = deps.tools ?? TEX_TOOLS;
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const group = toolGroup(tools);
  const pop = createPopover(editor, group);
  const palettes = new Map<string, Palette>();
  let inserts: Insert[] = [];

  function apply(insert: Insert): void {
    const { value, selectionStart, selectionEnd } = editor;
    const edit = menuEdit(value, selectionStart, selectionEnd, insert);
    pop.close(true);
    if (edit) deps.insert(edit);
  }

  function palette(tool: Extract<BarTool, { kind: "palette" }>): Palette {
    let found = palettes.get(tool.id);
    if (!found) {
      found = createPalette(tool.tabs, (symbol) =>
        apply({ kind: "cmd", snippet: symbol.command }),
      );
      palettes.set(tool.id, found);
    }
    return found;
  }

  function content(tool: MenuTool): PopContent {
    if (tool.kind === "palette") {
      const view = palette(tool);
      view.show();
      return {
        kind: "palette",
        label: tool.title,
        nodes: [view.element],
        focus: view.focus,
      };
    }
    inserts = [];
    return {
      kind: "list",
      label: tool.title,
      nodes: listMenu(tool.sections, inserts),
      focus: () => pop.element.querySelector<HTMLElement>(".tex-item")?.focus(),
    };
  }

  group.addEventListener("click", (event) => {
    const button = closestTarget(event, ".tex-btn");
    const tool = byId.get(button?.dataset.tool ?? "");
    if (!button || !tool) return;
    if (tool.kind === "action") apply(tool.insert);
    else if (pop.current() === tool.id) pop.close(true);
    else pop.open(tool.id, button, content(tool), event.detail === 0);
  });

  pop.element.addEventListener("click", (event) => {
    const item = closestTarget(event, ".tex-item");
    const insert = item && inserts[Number(item.dataset.insert)];
    if (insert) apply(insert);
  });

  return {
    group,
    active: deps.active,
    contains: (node) => pop.contains(node) || group.contains(node),
    isOpen: pop.isOpen,
    close: () => pop.close(false),
    destroy() {
      pop.destroy();
      group.remove();
    },
  };
}
