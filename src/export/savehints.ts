const CLEAR_TITLE = "Талбарыг цэвэрлэх";
const CLOSE_CLEAR_TITLE = "Файлыг хааж, талбарыг цэвэрлэх";

export function clearTitle(base: string, open: boolean): string {
  return open && base.startsWith(CLEAR_TITLE)
    ? CLOSE_CLEAR_TITLE + base.slice(CLEAR_TITLE.length)
    : base;
}

export function saveTitle(base: string, output: string | null): string {
  if (output === null) return base;
  const combo = base.includes(" · ") ? base.slice(base.lastIndexOf(" · ")) : "";
  return output + " болгож хадгална" + combo;
}

export interface SaveHintEls {
  readonly clear: HTMLElement | null;
  readonly save: HTMLElement | null;
}

export function initSaveHints({
  clear,
  save,
}: SaveHintEls): (output: string | null, open: boolean) => void {
  let saveBase: string | null = null;
  let clearBase: string | null = null;
  return (output, open) => {
    if (clear) {
      clearBase ??= clear.title;
      clear.title = clearTitle(clearBase, open);
    }
    if (!save) return;
    saveBase ??= save.title;
    save.title = saveTitle(saveBase, output);
  };
}
