export interface JobFiles {
  read(name: string): Promise<string | null>;
  write(name: string, src: string): void;
}

export interface AuxStep {
  readonly wanted: (tex: string) => boolean;
  readonly run: (files: JobFiles) => Promise<void>;
}

const READ_TIMEOUT_MS = 2000;

const indexStep: AuxStep = {
  wanted: (tex) => /\\makeindex\b/.test(tex),
  async run(files) {
    const idx = await files.read(".idx");
    if (idx === null) return;
    const { makeIndex } = await import("./makeindex.ts");
    files.write(".ind", makeIndex(idx));
  },
};

const STEPS: readonly AuxStep[] = [indexStep];

export function auxSteps(tex: string): AuxStep[] {
  return STEPS.filter((step) => step.wanted(tex));
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
