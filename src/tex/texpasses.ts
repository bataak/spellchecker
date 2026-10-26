import { uncommented } from "./texproject.ts";

export interface JobFiles {
  read(ext: string): Promise<string | null>;
  write(ext: string, src: string): void;
}

export interface AuxStep {
  readonly wanted: (body: string) => boolean;
  readonly passes: number;
  readonly run: (files: JobFiles) => Promise<void>;
}

const indexStep: AuxStep = {
  wanted: (body) => /\\makeindex\b/.test(body),
  passes: 1,
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

export function extraPasses(steps: readonly AuxStep[]): number {
  return Math.max(0, ...steps.map((step) => step.passes));
}

export async function runSteps(
  steps: readonly AuxStep[],
  files: JobFiles,
): Promise<void> {
  for (const step of steps) await step.run(files);
}
