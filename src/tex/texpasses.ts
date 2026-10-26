import { uncommented } from "./texproject.ts";

export interface JobFiles {
  read(ext: string): Promise<string | null>;
  write(ext: string, src: string): void;
}

interface PassRule {
  readonly wanted: (body: string) => boolean;
  readonly passes: number;
}

export interface AuxStep extends PassRule {
  readonly run: (files: JobFiles) => Promise<void>;
}

export interface PassPlan {
  readonly passes: number;
  readonly steps: readonly AuxStep[];
}

const CROSS_REF =
  /\\(?:tableofcontents|listof(?:figures|tables)|ref|eqref|pageref|autoref|cref|Cref|cite|label)\b/;
const BIBLIOGRAPHY = /\\(?:bibliography|addbibresource)\s*\{/;

const RULES: readonly PassRule[] = [
  { wanted: (body) => CROSS_REF.test(body), passes: 1 },
  { wanted: (body) => BIBLIOGRAPHY.test(body), passes: 2 },
];

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

export function planPasses(sources: Iterable<string>): PassPlan {
  const bodies = [...sources].map(uncommented);
  const matching = <Rule extends PassRule>(rules: readonly Rule[]): Rule[] =>
    rules.filter((rule) => bodies.some((body) => rule.wanted(body)));
  const settle = Math.max(0, ...matching(RULES).map((rule) => rule.passes));
  const steps = matching(STEPS);
  const generated = steps.reduce((sum, step) => sum + step.passes, 0);
  return { passes: 1 + settle + generated, steps };
}

export async function runSteps(
  steps: readonly AuxStep[],
  files: JobFiles,
): Promise<void> {
  for (const step of steps) await step.run(files);
}
