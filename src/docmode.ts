import { PROJECT_SLOT } from "./fileslots.ts";
import { looksLatex } from "./spell/codeskip.ts";
import { PLAIN } from "./templates.ts";

const TEX_TEMPLATE = "article";
const TEX_NAME = /\.(tex|ltx)$/i;
const CHECK_TEMPLATES: ReadonlySet<string> = new Set([PLAIN, "plain2"]);

export interface DocModeDeps {
  readonly officeActive: () => boolean;
  readonly projectBound: () => boolean;
  readonly fileName: () => string | null;
}

export interface DocMode {
  setTemplate(id: string): void;
  isLatex(text: string): boolean;
  checksLetters(): boolean;
}

export function createDocMode(deps: DocModeDeps): DocMode {
  let texTemplate = false;
  let inProject = false;
  let checkTemplate = false;

  return {
    setTemplate(id) {
      texTemplate = id === TEX_TEMPLATE;
      inProject = id === PROJECT_SLOT;
      checkTemplate = CHECK_TEMPLATES.has(id);
    },
    isLatex(text) {
      if (deps.officeActive()) return false;
      if (inProject || deps.projectBound()) return true;
      const name = deps.fileName();
      if (name) return TEX_NAME.test(name);
      return texTemplate || looksLatex(text);
    },
    checksLetters: () => checkTemplate,
  };
}
