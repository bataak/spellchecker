import type { OfficeMode } from "./office/mode.ts";
import { isPlain } from "./templates.ts";

const MD_NAME_RE = /\.(md|markdown|mdown)$/i;

export interface DocumentSessionDeps {
  readonly office: () => Pick<OfficeMode, "fileName" | "outputName"> | null;
  readonly targetName: () => string | null;
  readonly template: () => string;
  readonly isTex: () => boolean;
  readonly setSaveTitles: (output: string | null, open: boolean) => void;
  readonly refreshBar: () => void;
  readonly enterMode: (markdown: boolean) => void;
}

export interface DocumentSession {
  name(): string | null;
  baseName(): string | null;
  fileName(): string | null;
  isMarkdownFile(): boolean;
  markdownActive(): boolean;
  syncSaveHint(): void;
  setName(name: string | null): void;
  open(name: string | null): void;
  entered(): void;
}

export function createDocumentSession(
  deps: DocumentSessionDeps,
): DocumentSession {
  let name: string | null = null;

  const baseName = (): string | null => deps.targetName() ?? name;
  const fileName = (): string | null => deps.office()?.fileName() ?? name;

  const isMarkdownFile = (): boolean => {
    if (deps.office()) return false;
    const base = baseName();
    return !!base && MD_NAME_RE.test(base);
  };

  const markdownActive = (): boolean => {
    if (deps.isTex()) return false;
    return fileName() ? isMarkdownFile() : !isPlain(deps.template());
  };

  const syncSaveHint = (): void => {
    const target = deps.targetName();
    const office = deps.office();
    deps.setSaveTitles(
      office ? office.outputName() : target || null,
      !!(office || target || name),
    );
  };

  const setName = (next: string | null): void => {
    name = next;
    syncSaveHint();
    deps.refreshBar();
  };

  const entered = (): void => {
    syncSaveHint();
    deps.refreshBar();
    deps.enterMode(markdownActive());
  };

  return {
    name: () => name,
    baseName,
    fileName,
    isMarkdownFile,
    markdownActive,
    syncSaveHint,
    setName,
    open(next) {
      name = next;
      entered();
    },
    entered,
  };
}
