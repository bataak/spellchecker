import type { DictStatus } from "../spellui/dictstatus.ts";
import type { Layout } from "../ui/layout.ts";
import { initReportButton } from "../feedback/reportbtn.ts";
import { getIgnored } from "../spell/ignore.ts";
import type { SpellChecker } from "../spell/spellchecker.ts";

export interface AppReportDeps {
  readonly entryUrl: string;
  readonly editor: HTMLTextAreaElement;
  readonly checker: SpellChecker;
  readonly dicts: DictStatus;
  readonly officeActive: () => boolean;
  readonly markdownActive: () => boolean;
  readonly fileName: () => string | null;
  readonly layout: () => Layout;
  readonly errorWords: () => string[];
}

export function initAppReport(deps: AppReportDeps): void {
  const { checker } = deps;
  initReportButton(() => {
    const active = deps.dicts.active();
    return {
      entryUrl: deps.entryUrl,
      activeDicts: checker.loadedIds.filter((id) => active.includes(id)),
      officeActive: deps.officeActive(),
      markdownActive: deps.markdownActive(),
      fileName: deps.fileName(),
      layout: deps.layout(),
      text: deps.editor.value,
      errorWords: deps.errorWords(),
      personalDict: getIgnored(),
      listDicts: () =>
        checker.listDicts?.({ peek: true }) ?? Promise.resolve([]),
    };
  });
}
