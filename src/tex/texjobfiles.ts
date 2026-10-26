import { noteError } from "../core/errorlog.ts";
import type { JobFiles } from "./texpasses.ts";
import { queryWorker } from "./workerquery.ts";

export interface JobPlace {
  readonly workdir: string;
  readonly main: string;
}

interface FileReply {
  readonly cmd?: string;
  readonly url?: string;
  readonly src?: string | null;
}

const READ_TIMEOUT_MS = 2000;

function jobName(main: string): string {
  return main.replace(/\.[^./]+$/, "");
}

async function readFrom(worker: Worker, url: string): Promise<string | null> {
  try {
    return await queryWorker<FileReply, string | null>(
      worker,
      { cmd: "readfile", url },
      (reply) =>
        reply.cmd === "readfile" && reply.url === url
          ? (reply.src ?? null)
          : undefined,
      READ_TIMEOUT_MS,
    );
  } catch (error) {
    noteError(error);
    return null;
  }
}

export function workerFiles(worker: Worker, place: JobPlace): JobFiles {
  const job = jobName(place.main);
  const prefix = place.workdir ? place.workdir + "/" : "";
  return {
    read: (ext) => readFrom(worker, job + ext),
    write(ext, src) {
      worker.postMessage({ cmd: "writefile", url: prefix + job + ext, src });
    },
  };
}
