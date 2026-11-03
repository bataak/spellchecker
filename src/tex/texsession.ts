interface EngineSession {
  starting: Promise<Worker> | null;
  live: Worker | null;
  queue: Promise<unknown>;
  running: { stop: (reason: string) => void; since: number } | null;
  packageNotice: ((message: string | null) => void) | null;
}

export const session: EngineSession = {
  starting: null,
  live: null,
  queue: Promise.resolve(),
  running: null,
  packageNotice: null,
};

export function onTexPackage(
  listener: ((message: string | null) => void) | null,
): void {
  session.packageNotice = listener;
}
