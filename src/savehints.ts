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

export function initSaveHints(): (
  output: string | null,
  open: boolean,
) => void {
  let saveBase: string | null = null;
  let clearBase: string | null = null;
  return (output, open) => {
    const clear = document.querySelector<HTMLElement>("#clearBtn");
    if (clear) {
      clearBase ??= clear.title;
      clear.title = clearTitle(clearBase, open);
    }
    const save = document.querySelector<HTMLElement>("#saveBtn");
    if (!save) return;
    saveBase ??= save.title;
    save.title = saveTitle(saveBase, output);
  };
}
