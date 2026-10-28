import { askChoice, type AskOptions } from "../ui/ask.ts";
import { flash } from "../ui/clipboard.ts";
import type { FileIODeps } from "../files/fileio.ts";
import { FILE_LIMIT } from "../slots/fileslots.ts";
import type { MdToolbar } from "../mdbar/mdtoolbar.ts";

const LIMIT_HOLD_MS = 8000;

export type OpenSlots = Pick<
  MdToolbar,
  "findFile" | "findName" | "showFile" | "fileDirty" | "openFile"
>;

function changedAsk(name: string): AskOptions {
  return {
    title:
      "«" + name + "» файл дискэн дээр өөрчлөгджээ. Файлыг дахин дуудах уу?",
    text: "Таны өөрчлөлт устаж болзошгүй.",
    yes: "Дахин дуудах",
    no: "Болих",
  };
}

function reopenAsk(name: string): AskOptions {
  return {
    title:
      "«" +
      name +
      "» нээлттэй бөгөөд хадгалаагүй өөрчлөлттэй. Файлаас дахин нээх үү?",
    yes: "Дахин нээх",
    no: "Болих",
  };
}

export function createOpenPolicy(
  slots: () => OpenSlots,
  hold: (html: string, ms: number, animate: boolean) => void,
  openButton: HTMLElement | null = null,
  ask: (options: AskOptions) => Promise<boolean> = askChoice,
): FileIODeps["prepareOpen"] {
  return async (name, hash, text) => {
    const bar = slots();
    const same = bar.findFile(name, hash, text);
    const open = same ?? (text === null ? null : bar.findName(name));
    if (open !== null) {
      bar.showFile(open);
      if (text === null) return "open";
      const dirty = bar.fileDirty(open);
      const reload =
        same === null
          ? !dirty || (await ask(changedAsk(name)))
          : dirty && (await ask(reopenAsk(name)));
      return reload ? "reload" : "open";
    }
    if (bar.openFile(name, hash)) return "new";
    hold(
      "Нэг дор " +
        FILE_LIMIT +
        " хүртэл файл нээнэ — шинэ файл нээхийн тулд ядаж нэг хуучин файлыг хаана уу",
      LIMIT_HOLD_MS,
      false,
    );
    flash(openButton, "Хязгаар");
    return false;
  };
}
