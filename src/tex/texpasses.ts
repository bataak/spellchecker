import { uncommented } from "./texproject.ts";

export interface JobFiles {
  read(name: string): Promise<string | null>;
  write(name: string, src: string): void;
}

export interface AuxStep {
  readonly wanted: (body: string) => boolean;
  readonly run: (files: JobFiles) => Promise<void>;
}

const READ_TIMEOUT_MS = 2000;

const indexStep: AuxStep = {
  wanted: (body) => /\\makeindex\b/.test(body),
  async run(files) {
    const idx = await files.read(".idx");
    if (idx === null) return;
    const { makeIndex } = await import("./makeindex.ts");
    files.write(".ind", makeIndex(idx));
  },
};

const STEPS: readonly AuxStep[] = [indexStep];

export function auxSteps(sources: Iterable<string>): AuxStep[] {
  const bodies = [...sources].map(uncommented);
  return STEPS.filter((step) => bodies.some((body) => step.wanted(body)));
}

export async function runSteps(
  steps: readonly AuxStep[],
  files: JobFiles,
): Promise<void> {
  for (const step of steps) await step.run(files);
}

export interface JobPlace {
  readonly workdir: string;
  readonly main: string;
}

function jobName(main: string): string {
  return main.replace(/\.[^./]+$/, "");
}

function readFrom(worker: Worker, url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
    worker.onmessage = (
      event: MessageEvent<{ cmd?: string; url?: string; src?: string | null }>,
    ) => {
      if (event.data.cmd !== "readfile" || event.data.url !== url) return;
      clearTimeout(timer);
      resolve(event.data.src ?? null);
    };
    worker.postMessage({ cmd: "readfile", url });
  });
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
