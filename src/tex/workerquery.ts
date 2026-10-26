export class WorkerTimeout extends Error {
  override readonly name = "WorkerTimeout";

  constructor(cmd: unknown) {
    super("TeX хөдөлгүүр «" + String(cmd) + "» хүсэлтэд хариу өгсөнгүй");
  }
}

export function queryWorker<Reply, Answer>(
  worker: Worker,
  message: { readonly cmd: string } & Record<string, unknown>,
  answer: (reply: Reply) => Answer | undefined,
  timeoutMs: number,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new WorkerTimeout(message.cmd)),
      timeoutMs,
    );
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const value = answer(event.data);
      if (value === undefined) return;
      clearTimeout(timer);
      resolve(value);
    };
    worker.postMessage(message);
  });
}
