export interface WorkerLike {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export interface RegistrationLike {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  update(): Promise<unknown>;
}

export interface ContainerLike {
  addEventListener(
    type: "controllerchange",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
}

const SETTLED = ["installed", "activated", "redundant"];

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function settled(worker: WorkerLike): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = (): void => {
      if (!SETTLED.includes(worker.state)) return;
      worker.removeEventListener("statechange", check);
      resolve();
    };
    worker.addEventListener("statechange", check);
    check();
  });
}

const live = (worker: WorkerLike | null): worker is WorkerLike =>
  !!worker && worker.state !== "redundant";

export async function waitingReady(
  reg: RegistrationLike,
  serves: () => Promise<boolean>,
  deadline: number,
  pause = 5000,
): Promise<boolean> {
  while (Date.now() < deadline) {
    if (live(reg.waiting)) return true;
    if (live(reg.installing)) {
      await Promise.race([
        settled(reg.installing),
        wait(deadline - Date.now()),
      ]);
      continue;
    }
    if (await serves()) return true;
    await reg.update().catch(() => undefined);
    if (!live(reg.installing) && !live(reg.waiting)) await wait(pause);
  }
  return false;
}

export async function activateWaiting(
  reg: RegistrationLike | null | undefined,
  container: ContainerLike,
  limit = 10000,
): Promise<void> {
  const waiting = reg?.waiting ?? null;
  if (!live(waiting)) return;
  const claimed = new Promise<void>((resolve) =>
    container.addEventListener("controllerchange", () => resolve(), {
      once: true,
    }),
  );
  waiting.postMessage({ type: "SKIP_WAITING" });
  await Promise.race([claimed, wait(limit)]);
}
