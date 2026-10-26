import { safeFrame, toSafeError, type SafeError } from "./safeerror.ts";
import { attempt } from "./attempt.ts";

export const ERROR_LOG_SIZE = 5;

export interface ErrorRing {
  record(error: SafeError): void;
  list(): SafeError[];
}

export function createErrorRing(size = ERROR_LOG_SIZE): ErrorRing {
  const items: SafeError[] = [];
  return {
    record(error) {
      items.push(error);
      while (items.length > size) items.shift();
    },
    list() {
      return items.map((item) => ({ ...item, frames: [...item.frames] }));
    },
  };
}

function fromErrorEvent(ev: Event): SafeError {
  const event = ev as Partial<ErrorEvent>;
  if (event.error != null) return toSafeError(event.error);
  const frame = safeFrame(event.filename, event.lineno, event.colno);
  return { name: null, code: null, frames: frame ? [frame] : [] };
}

export function attachErrorLog(target: EventTarget, ring: ErrorRing): void {
  target.addEventListener("error", (ev) => {
    attempt(() => ring.record(fromErrorEvent(ev)), undefined);
  });
  target.addEventListener("unhandledrejection", (ev) => {
    attempt(
      () =>
        ring.record(toSafeError((ev as Partial<PromiseRejectionEvent>).reason)),
      undefined,
    );
  });
}

const globalRing = createErrorRing();

export function installErrorLog(): void {
  attachErrorLog(window, globalRing);
}

export function recentErrors(): SafeError[] {
  return globalRing.list();
}

const sameError = (a: SafeError, b: SafeError): boolean =>
  a.name === b.name &&
  a.code === b.code &&
  a.frames.join("\n") === b.frames.join("\n");

export function recordOnce(ring: ErrorRing, error: SafeError): void {
  if (ring.list().some((seen) => sameError(seen, error))) return;
  ring.record(error);
}

export const MAX_CAUSES = 3;

export function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  while (chain.length <= MAX_CAUSES && !chain.includes(current)) {
    chain.push(current);
    if (!(current instanceof Error) || current.cause === undefined) break;
    current = current.cause;
  }
  return chain;
}

export function noteError(error: unknown): void {
  for (const link of causeChain(error))
    recordOnce(globalRing, toSafeError(link));
}
