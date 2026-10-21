import { fflate } from "../archive/fflate.ts";
import {
  cleanPath,
  commonRoot,
  parentDirs,
  rootedPath,
  skippedPath,
} from "../tex/texproject.ts";
import { unpackedSize } from "../archive/archive.ts";
import { MAX_BYTES, budget } from "./projectdisk.ts";
import { ProjectError } from "./projecterror.ts";

export interface LoadedFiles {
  readonly name: string;
  readonly files: [string, Uint8Array][];
  readonly dirs: Set<string>;
}

export function pickDirectoryFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

export async function readFileList(
  list: readonly File[],
): Promise<LoadedFiles> {
  const limit = budget();
  const paths = list.map((file) => file.webkitRelativePath || file.name);
  const root = commonRoot(paths);
  const files: [string, Uint8Array][] = [];
  for (const [index, file] of list.entries()) {
    const path = cleanPath(rootedPath(paths[index]!, root));
    if (!path || skippedPath(path)) continue;
    limit.take(file.size);
    files.push([path, new Uint8Array(await file.arrayBuffer())]);
  }
  const dirs = new Set(files.flatMap(([path]) => parentDirs(path)));
  return { name: root || "төсөл", files, dirs };
}

export async function readZip(file: File): Promise<LoadedFiles> {
  let entries: Record<string, Uint8Array>;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let size: number;
  try {
    size = await unpackedSize(bytes);
  } catch {
    throw new ProjectError("Zip файлыг задалж чадсангүй");
  }
  if (size > MAX_BYTES)
    throw new ProjectError("Төсөл хэт том байна (200 MB-аас ихгүй)");
  try {
    entries = (await fflate()).unzipSync(bytes);
  } catch {
    throw new ProjectError("Zip файлыг задалж чадсангүй");
  }
  const names = Object.keys(entries);
  const root = commonRoot(names.filter((name) => !name.endsWith("/")));
  const limit = budget();
  const files: [string, Uint8Array][] = [];
  const dirs = new Set<string>();
  for (const name of names) {
    const path = cleanPath(rootedPath(name, root));
    if (!path || skippedPath(path)) continue;
    if (name.endsWith("/")) {
      dirs.add(path);
      continue;
    }
    const bytes = entries[name]!;
    limit.take(bytes.length);
    files.push([path, bytes]);
    for (const dir of parentDirs(path)) dirs.add(dir);
  }
  return { name: root || file.name.replace(/\.zip$/i, ""), files, dirs };
}
