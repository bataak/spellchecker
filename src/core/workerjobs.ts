export interface WorkerReply<Value> {
  readonly id: number;
  readonly value?: Value;
  readonly error?: string;
}

interface Job<Value> {
  readonly resolve: (value: Value) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export type WorkerRun<Request, Value> = (
  request: Request,
  transfer?: Transferable[],
) => Promise<Value>;

export function workerJobs<Request extends object, Value>(
  create: () => Worker,
  label: string,
  timeoutMs: number,
): WorkerRun<Request, Value> {
  const jobs = new Map<number, Job<Value>>();
  let worker: Worker | null = null;
  let next = 0;
  const settle = (id: number): Job<Value> | undefined => {
    const job = jobs.get(id);
    if (!job) return undefined;
    jobs.delete(id);
    clearTimeout(job.timer);
    return job;
  };
  const reset = (error: Error): void => {
    for (const id of [...jobs.keys()]) settle(id)?.reject(error);
    worker?.terminate();
    worker = null;
  };
  const started = (): Worker => {
    if (worker) return worker;
    const made = create();
    made.onmessage = (event: MessageEvent<WorkerReply<Value>>) => {
      const job = settle(event.data.id);
      if (!job) return;
      if (event.data.value !== undefined) job.resolve(event.data.value);
      else job.reject(new Error(event.data.error ?? label));
    };
    made.onerror = () => {
      if (worker === made) reset(new Error(label));
    };
    worker = made;
    return made;
  };
  return (request, transfer = []) =>
    new Promise((resolve, reject) => {
      const id = (next += 1);
      const timer = setTimeout(
        () => reset(new Error(label + " timeout")),
        timeoutMs,
      );
      jobs.set(id, { resolve, reject, timer });
      started().postMessage({ ...request, id }, transfer);
    });
}
