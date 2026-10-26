import { test } from "node:test";
import assert from "node:assert/strict";
import { queryWorker, WorkerTimeout } from "../src/tex/workerquery.ts";
import { workerFiles } from "../src/tex/texjobfiles.ts";
import { recentErrors } from "../src/core/errorlog.ts";

type Reply = Record<string, unknown>;

class EchoWorker {
  onmessage: ((event: { data: Reply }) => void) | null = null;
  readonly sent: Reply[] = [];
  private readonly replies: Reply[];
  constructor(replies: Reply[]) {
    this.replies = replies;
  }
  postMessage(message: Reply): void {
    this.sent.push(message);
    for (const data of this.replies)
      queueMicrotask(() => this.onmessage?.({ data }));
  }
}

const asWorker = (fake: EchoWorker): Worker => fake as unknown as Worker;

test("queryWorker тохирох хариу ирэх хүртэл бусдыг алгасна", async () => {
  const fake = new EchoWorker([{ cmd: "other" }, { cmd: "misses", n: 3 }]);
  const n = await queryWorker<Reply, number>(
    asWorker(fake),
    { cmd: "misses" },
    (reply) => (reply.cmd === "misses" ? (reply.n as number) : undefined),
    1000,
  );
  assert.equal(n, 3);
  assert.deepEqual(fake.sent, [{ cmd: "misses" }]);
});

test("queryWorker хариу ирэхгүй бол WorkerTimeout-оор татгалзана", async () => {
  await assert.rejects(
    queryWorker(asWorker(new EchoWorker([])), { cmd: "x" }, () => 1, 1),
    WorkerTimeout,
  );
});

test("workerFiles ажлын нэрээр уншиж, ажлын хавтас руу бичнэ", async () => {
  const fake = new EchoWorker([
    { cmd: "readfile", url: "other.idx", src: "no" },
    { cmd: "readfile", url: "thesis.idx", src: "yes" },
  ]);
  const files = workerFiles(asWorker(fake), {
    workdir: "book",
    main: "thesis.tex",
  });
  assert.equal(await files.read(".idx"), "yes");
  files.write(".ind", "out");
  assert.deepEqual(fake.sent.at(-1), {
    cmd: "writefile",
    url: "book/thesis.ind",
    src: "out",
  });
});

test("workerFiles хариугүй үед null буцааж, алдааг тэмдэглэнэ", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const files = workerFiles(asWorker(new EchoWorker([])), {
    workdir: "",
    main: "main.tex",
  });
  const read = files.read(".idx");
  t.mock.timers.tick(2000);
  assert.equal(await read, null);
  assert.equal(recentErrors().at(-1)?.name, "WorkerTimeout");
});
