import { initDictMenu } from "../dict/dictmenu.ts";
import { initIgnoreList } from "../ignorelist.ts";
import { onIgnoredChange } from "../spell/ignore.ts";
import { isDashSuffix } from "../spell/textcheck.ts";
import type { Token } from "../spell/textcheck.ts";
import { initSuggest } from "../suggest.ts";
import {
  createDictLife,
  type DictLife,
  type DictLifeDeps,
} from "./dictlife.ts";

export interface DictionariesDeps extends Omit<DictLifeDeps, "blank"> {
  readonly editor: HTMLTextAreaElement;
  readonly statusEl: HTMLElement;
  readonly badTokens: () => Token[];
  readonly render: () => Promise<void>;
}

export interface Dictionaries {
  readonly life: DictLife;
  readonly openMenu: () => void;
}

export function initDictionaries(deps: DictionariesDeps): Dictionaries {
  const { editor, checker } = deps;
  const life = createDictLife({
    ...deps,
    blank: () => editor.value.trim() === "",
  });

  initSuggest({
    getBadTokens: deps.badTokens,
    isDashSuffix: (token) => isDashSuffix(editor.value, token),
    checkKnown: (list) =>
      checker.ready && !checker.dead && checker.loadedIds.includes("mn_MN")
        ? checker.checkWords(list)
        : Promise.resolve(null),
  });

  initIgnoreList(() => void deps.render());
  onIgnoredChange(() => void deps.render());

  const openMenu = initDictMenu({
    statusEl: deps.statusEl,
    getEnabled: deps.dicts.english,
    onApply: life.setEnglish,
    onClose: () => editor.focus(),
  });

  return { life, openMenu };
}
