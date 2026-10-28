import type { CurrentFile } from "./fileports.ts";

export interface FileWatchDeps {
  readonly current: CurrentFile;
  readonly dirty: () => boolean;
  readonly reopen: (file: File, handle: FileSystemFileHandle) => Promise<void>;
  readonly notify: (message: string) => void;
  readonly onReturn: (listener: () => void) => void;
}

export function watchFile(d: FileWatchDeps): () => Promise<void> {
  let checking = false;
  const check = async (): Promise<void> => {
    const { handle, stamp } = d.current;
    if (checking || !handle || stamp === null) return;
    checking = true;
    try {
      const file = await handle.getFile();
      if (file.lastModified === stamp || d.current.handle !== handle) return;
      const clean = !d.dirty();
      d.current.stamp = file.lastModified;
      await d.reopen(file, handle);
      if (clean)
        d.notify("«" + file.name + "» дискэн дээр өөрчлөгдсөн тул шинэчиллээ");
    } catch {
      return;
    } finally {
      checking = false;
    }
  };
  d.onReturn(() => void check());
  return check;
}
