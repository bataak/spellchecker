import { flash } from "../clipboard.ts";
import type { FileIODeps } from "../fileio.ts";
import { FILE_LIMIT } from "../fileslots.ts";
import type { MdToolbar } from "../mdtoolbar.ts";

const LIMIT_HOLD_MS = 8000;

export type OpenSlots = Pick<
  MdToolbar,
  "findFile" | "showFile" | "fileDirty" | "openFile"
>;

export function createOpenPolicy(
  slots: () => OpenSlots,
  hold: (html: string, ms: number, animate: boolean) => void,
): FileIODeps["prepareOpen"] {
  return (name, hash, text) => {
    const bar = slots();
    const open = bar.findFile(name, hash, text);
    if (open !== null) {
      bar.showFile(open);
      const reload =
        text !== null &&
        bar.fileDirty(open) &&
        window.confirm(
          "«" +
            name +
            "» нээлттэй бөгөөд хадгалаагүй өөрчлөлттэй. Файлаас дахин нээх үү?",
        );
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
    flash("#openBtn", "Хязгаар");
    return false;
  };
}
