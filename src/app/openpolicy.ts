import { askChoice, type AskOptions } from "../ui/ask.ts";
import { flash } from "../ui/clipboard.ts";
import type { FileIODeps } from "../files/fileio.ts";
import { FILE_LIMIT } from "../slots/fileslots.ts";
import type { MdToolbar } from "../mdbar/mdtoolbar.ts";

const LIMIT_HOLD_MS = 8000;

export type OpenSlots = Pick<
  MdToolbar,
  "findFiles" | "findNames" | "showFile" | "fileDirty" | "openFile"
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

export interface OpenPolicyDeps {
  readonly slots: () => OpenSlots;
  readonly hold: (html: string, ms: number, animate: boolean) => void;
  readonly openButton?: HTMLElement | null;
  readonly ask?: (options: AskOptions) => Promise<boolean>;
  readonly handleOf?: (slot: string) => FileSystemFileHandle | null;
}

async function sameEntry(
  known: FileSystemFileHandle | null,
  handle: FileSystemFileHandle | null,
): Promise<boolean> {
  if (!known || !handle) return true;
  return known.isSameEntry(handle).catch(() => true);
}

export function createOpenPolicy({
  slots,
  hold,
  openButton = null,
  ask = askChoice,
  handleOf = () => null,
}: OpenPolicyDeps): FileIODeps["prepareOpen"] {
  return async (name, hash, text, handle = null) => {
    const bar = slots();
    const pick = async (ids: readonly string[]): Promise<string | null> => {
      for (const id of ids)
        if (await sameEntry(handleOf(id), handle)) return id;
      return null;
    };
    const same = await pick(bar.findFiles(name, hash, text));
    const open =
      same ?? (text === null ? null : await pick(bar.findNames(name)));
    if (open !== null) {
      bar.showFile(open);
      if (text === null) return "open";
      const dirty = bar.fileDirty(open);
      if (same === null)
        return !dirty || (await ask(changedAsk(name))) ? "reload" : "keep";
      return dirty && (await ask(reopenAsk(name))) ? "reload" : "open";
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
