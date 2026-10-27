import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitApi, githubHost } from "../src/project/git/github.ts";
import {
  fromBase64,
  parseRepo,
  toBase64,
  type GitHost,
} from "../src/project/git/githost.ts";
import {
  commitChanges,
  gitBlobSha,
  loadRepo,
  planChanges,
  type MergeItem,
} from "../src/project/git/gitsync.ts";
import { FakeRepo } from "./helpers/fakerepo.ts";
import { newState } from "../src/project/projectstate.ts";
import {
  dropEntries,
  moveEntries,
  putFile,
} from "../src/project/projectedit.ts";
import { Cancelled, ProjectError } from "../src/project/projecterror.ts";
import { hostFor } from "../src/project/git/gitsession.ts";
import { workingCopy } from "../src/project/workingcopy.ts";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n";

const open = async (repo: FakeRepo, dir = "") => {
  const loaded = await loadRepo(githubHost(repo), {
    provider: "github",
    host: "https://github.com",
    project: "o/r",
    branch: null,
    dir,
  });
  const s = newState(1, "git", loaded.name, null, loaded.files, loaded.dirs);
  return { s, remote: loaded.remote };
};

test("parseRepo: GitHub-ийн нэр болон хаягийг задална", () => {
  assert.deepEqual(parseRepo("github", "bataak/thesis"), {
    provider: "github",
    host: "https://github.com",
    project: "bataak/thesis",
    branch: null,
    dir: "",
  });
  assert.deepEqual(
    parseRepo(
      "github",
      "https://github.com/bataak/thesis/tree/dev/chapters/one/",
    ),
    {
      provider: "github",
      host: "https://github.com",
      project: "bataak/thesis",
      branch: "dev",
      dir: "chapters/one",
    },
  );
  assert.deepEqual(
    parseRepo("github", "github.com/a/b.git", { branch: "x", dir: "/d/" }),
    {
      provider: "github",
      host: "https://github.com",
      project: "a/b",
      branch: "x",
      dir: "d",
    },
  );
  assert.throws(() => parseRepo("github", "thesis"), ProjectError);
  assert.throws(() => parseRepo("github", "a/b/c"), ProjectError);
});

test("parseRepo: GitLab-ийн дэд бүлэг, өөрийн сервер болон хаягийг задална", () => {
  assert.deepEqual(parseRepo("gitlab", "group/sub/thesis"), {
    provider: "gitlab",
    host: "https://gitlab.com",
    project: "group/sub/thesis",
    branch: null,
    dir: "",
  });
  assert.deepEqual(
    parseRepo("gitlab", "https://gitlab.num.edu.mn/lab/thesis/-/tree/main/tex"),
    {
      provider: "gitlab",
      host: "https://gitlab.num.edu.mn",
      project: "lab/thesis",
      branch: "main",
      dir: "tex",
    },
  );
  assert.throws(() => parseRepo("gitlab", "thesis"), ProjectError);
});

test("base64: кирилл болон бинар өгөгдлийг алдагдуулахгүй", () => {
  const bytes = new Uint8Array([0, 255, ...encode("Өргөдөл")]);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test("gitBlobSha: git-ийн blob SHA-тай таарна", async () => {
  assert.equal(
    await gitBlobSha(encode("hello\n")),
    "ce013625030ba8dba906f756967f9e9ca394464a",
  );
});

test("loadRepo: дэд хавтсаар шүүж, алгасах файлыг оруулахгүй", async () => {
  const repo = await FakeRepo.create({
    "README.md": "readme",
    "thesis/main.tex": MAIN,
    "thesis/ch/one.tex": "Нэг",
    "thesis/.git/x": "no",
  });
  const { s, remote } = await open(repo, "thesis");
  assert.equal(s.name, "thesis");
  assert.deepEqual([...s.texts.keys()].sort(), ["ch/one.tex", "main.tex"]);
  assert.ok(s.dirs.has("ch"));
  assert.deepEqual(Object.keys(remote.files).sort(), [
    "ch/one.tex",
    "main.tex",
  ]);
  assert.equal(remote.branch, "main");
});

test("planChanges: зөвхөн өөрчлөгдсөн, нэмэгдсэн, нэр солигдсон, устгагдсан файлыг авна", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "А",
    "b.tex": "Б",
    "img.png": "PNG",
  });
  const { s, remote } = await open(repo);
  assert.deepEqual(await planChanges(workingCopy(s), remote), {
    writes: [],
    deletes: [],
    texts: new Map(),
  });
  s.texts.set("a.tex", "А засвар");
  putFile(s, "new.tex", encode("Шинэ"));
  moveEntries(s, "b.tex", "c.tex");
  s.binaries.delete("img.png");
  const plan = await planChanges(workingCopy(s), remote);
  assert.deepEqual(plan.writes.map(([path]) => path).sort(), [
    "a.tex",
    "c.tex",
    "new.tex",
  ]);
  assert.deepEqual([...plan.deletes].sort(), ["b.tex", "img.png"]);
});

test("commitChanges: өөрчлөлтийг нэг commit болгож салбарыг шилжүүлнэ", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await open(repo);
  s.texts.set("a.tex", "А шинэ");
  putFile(s, "b.tex", encode("Б"));
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "Засвар",
  );
  assert.ok(done);
  assert.equal(done.pulled, false);
  assert.equal(repo.text("a.tex"), "А шинэ");
  assert.equal(repo.text("b.tex"), "Б");
  assert.equal(repo.commits.get(repo.branches.get("main")!)!.message, "Засвар");
  assert.equal(done.remote.head, repo.branches.get("main"));
  assert.equal(s.dirty.size, 0);
  assert.equal(s.unsynced, false);
  assert.equal(
    await commitChanges(githubHost(repo), workingCopy(s), done.remote, "дахин"),
    null,
  );
});

test("commitChanges: repo дээрх давхцахгүй өөрчлөлтийг татаад дээр нь commit хийнэ", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "А",
    "b.tex": "Б",
  });
  const { s, remote } = await open(repo);
  await repo.push({ "b.tex": "Б бусдын", "c.tex": "В бусдын" });
  s.texts.set("a.tex", "А миний");
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "Миний засвар",
  );
  assert.ok(done);
  assert.equal(done.pulled, true);
  assert.equal(repo.text("a.tex"), "А миний");
  assert.equal(repo.text("b.tex"), "Б бусдын");
  assert.equal(s.texts.get("b.tex"), "Б бусдын");
  assert.equal(s.texts.get("c.tex"), "В бусдын");
  assert.equal(s.dirty.size, 0);
});

test("commitChanges: ижил файлыг хоёр талаас өөрчилсөн бол commit хийхгүй", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await open(repo);
  await repo.push({ "a.tex": "А бусдын" });
  const before = repo.branches.get("main");
  s.texts.set("a.tex", "А миний");
  await assert.rejects(
    commitChanges(githubHost(repo), workingCopy(s), remote, "x"),
    (error: unknown) =>
      error instanceof ProjectError && /a\.tex/.test(error.message),
  );
  assert.equal(repo.branches.get("main"), before);
  assert.equal(s.texts.get("a.tex"), "А миний");
});

test("commitChanges: салбар яг тэр мөчид шилжвэл алдаа өгч, өөрчлөлтийг хадгална", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await open(repo);
  s.texts.set("a.tex", "А миний");
  repo.race = true;
  await assert.rejects(
    commitChanges(githubHost(repo), workingCopy(s), remote, "x"),
    ProjectError,
  );
  assert.equal(s.saved.get("a.tex"), "А");
  assert.equal(s.texts.get("a.tex"), "А миний");
});

test("commitChanges: commit хийх зуур бичсэн засварыг хадгалсан гэж тооцохгүй", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await open(repo);
  s.texts.set("a.tex", "А шинэ");
  const host = githubHost(repo);
  const api = {
    ...host,
    commit: (input: Parameters<typeof host.commit>[0]) => {
      s.texts.set("a.tex", "А шинэ дараа");
      return host.commit(input);
    },
  };
  const done = await commitChanges(api, workingCopy(s), remote, "Засвар");
  assert.ok(done);
  assert.equal(repo.text("a.tex"), "А шинэ");
  assert.equal(s.saved.get("a.tex"), "А шинэ");
  assert.ok(s.dirty.has("a.tex"));
});

test("commitChanges: татсаны дараа commit бүтэлгүйдвэл дараагийн хадгалалт ажиллана", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "А",
    "b.tex": "Б",
  });
  const { s, remote } = await open(repo);
  s.remote = remote;
  await repo.push({ "b.tex": "Б бусдын", "c.png": "PNG" });
  s.texts.set("a.tex", "А миний");
  repo.race = true;
  await assert.rejects(
    commitChanges(githubHost(repo), workingCopy(s), remote, "x"),
    ProjectError,
  );
  assert.equal(s.remote.head, repo.branches.get("main"));
  repo.race = false;
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    s.remote,
    "дахин",
  );
  assert.ok(done);
  assert.equal(repo.text("a.tex"), "А миний");
  assert.equal(repo.text("b.tex"), "Б бусдын");
});

test("createGitApi: token-тойгоор зөв хаяг уруу хандаж, алдааг ойлгомжтой болгоно", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = createGitApi("tok", "o/r", (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/git/ref/heads/feature/x"))
      return Promise.resolve(Response.json({ object: { sha: "abc" } }));
    return Promise.resolve(new Response("", { status: 401 }));
  });
  assert.equal(await api.head("feature/x"), "abc");
  assert.equal(
    (calls[0]!.init!.headers as Record<string, string>).Authorization,
    "Bearer tok",
  );
  await assert.rejects(api.defaultBranch(), /token буруу/);
});

test("loadRepo: хэмжээг нь мэдэхгүй файлуудыг татахдаа 200 MB-аас хэтрэхэд зогсооно", async () => {
  const big = new Uint8Array(70 * 1024 * 1024);
  const host: GitHost = {
    defaultBranch: () => Promise.resolve("main"),
    head: () => Promise.resolve("h"),
    list: () =>
      Promise.resolve({
        tree: "h",
        entries: ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"].map((path) => ({
          path,
          mode: "100644",
          type: "blob",
          sha: path,
        })),
      }),
    blob: () => Promise.resolve(big),
    commit: () => Promise.reject(new Error("no")),
  };
  await assert.rejects(
    loadRepo(host, {
      provider: "gitlab",
      host: "https://gitlab.com",
      project: "o/r",
      branch: null,
      dir: "",
    }),
    /200 MB/,
  );
});

test("commitChanges: нэг файлын өөр мөрүүдийг хоёр талаас өөрчилбөл автоматаар нэгтгэнэ", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "нэг\nхоёр\nгурав",
  });
  const { s, remote } = await open(repo);
  await repo.push({ "a.tex": "нэг\nхоёр\nгурав бусдын" });
  s.texts.set("a.tex", "нэг миний\nхоёр\nгурав");
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "м",
  );
  assert.ok(done?.pulled);
  assert.equal(repo.text("a.tex"), "нэг миний\nхоёр\nгурав бусдын");
  assert.equal(s.texts.get("a.tex"), "нэг миний\nхоёр\nгурав бусдын");
  assert.equal(s.dirty.size, 0);
});

test("commitChanges: зөрчилтэй мөрийг сонголтоор шийдэж, цуцалбал юуг ч өөрчлөхгүй", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "нэг\nхоёр",
    "b.tex": "Б",
  });
  const { s, remote } = await open(repo);
  s.remote = remote;
  await repo.push({ "a.tex": "нэг\nхоёр бусдын", "b.tex": "Б бусдын" });
  s.texts.set("a.tex", "нэг\nхоёр миний");
  const asked: MergeItem[][] = [];
  await assert.rejects(
    commitChanges(githubHost(repo), workingCopy(s), remote, "x", (items) => {
      asked.push([...items]);
      return Promise.resolve(null);
    }),
    /цуцаллаа/,
  );
  assert.equal(asked[0]![0]!.path, "a.tex");
  assert.equal(s.texts.get("a.tex"), "нэг\nхоёр миний");
  assert.equal(s.texts.get("b.tex"), "Б");
  assert.equal(s.remote, remote);
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "м",
    () => Promise.resolve(new Map([["a.tex", ["both"] as const]])),
  );
  assert.ok(done);
  assert.equal(repo.text("a.tex"), "нэг\nхоёр миний\nхоёр бусдын");
  assert.equal(repo.text("b.tex"), "Б бусдын");
});

test("commitChanges: татаж байх зуур засварласан файлыг дарж бичихгүй, зөрчил гэж асууна", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "А",
    "b.tex": "Б",
  });
  const { s, remote } = await open(repo);
  await repo.push({ "b.tex": "Б бусдын" });
  s.texts.set("a.tex", "А миний");
  const host = githubHost(repo);
  const api: GitHost = {
    ...host,
    list: (commit, signal) => {
      s.texts.set("b.tex", "Б миний");
      return host.list(commit, signal);
    },
  };
  const asked: string[] = [];
  const done = await commitChanges(
    api,
    workingCopy(s),
    remote,
    "м",
    (items) => {
      asked.push(...items.map((item) => item.path));
      return Promise.resolve(new Map([["b.tex", ["ours"] as const]]));
    },
  );
  assert.deepEqual(asked, ["b.tex"]);
  assert.ok(done?.committed);
  assert.equal(repo.text("b.tex"), "Б миний");
});

test("commitChanges: хоёр тал ижил файлыг устгасан бол зөрчил гэж асуухгүй", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "А",
    "old.tex": "Х",
  });
  const { s, remote } = await open(repo);
  await repo.push({ "old.tex": null });
  dropEntries(s, "old.tex");
  s.texts.set("a.tex", "А миний");
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "м",
    () => Promise.reject(new Error("асуух ёсгүй")),
  );
  assert.ok(done?.committed);
  assert.equal(repo.text("old.tex"), undefined);
  assert.equal(repo.text("a.tex"), "А миний");
});

test("commitChanges: зөрчлийн цонхыг болиулбал Cancelled алдаа өгнө", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await open(repo);
  await repo.push({ "a.tex": "А бусдын" });
  s.texts.set("a.tex", "А миний");
  await assert.rejects(
    commitChanges(githubHost(repo), workingCopy(s), remote, "м", () =>
      Promise.resolve(null),
    ),
    Cancelled,
  );
});

test("hostFor: github.com, gitlab.com-оос өөр серверт хадгалсан төслийг холбохгүй", () => {
  assert.throws(
    () =>
      hostFor(
        { provider: "github", host: "https://ghe.corp", project: "o/r" },
        "tok",
      ),
    /github\.com, gitlab\.com/,
  );
  assert.ok(
    hostFor(
      { provider: "gitlab", host: "https://gitlab.com", project: "o/r" },
      "tok",
    ),
  );
});

test("commitChanges: нэг тал устгаж нөгөө тал өөрчилсөн файлыг бүтнээр нь сонгуулна", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await open(repo);
  await repo.push({ "a.tex": "А бусдын" });
  dropEntries(s, "a.tex");
  let seen: MergeItem | undefined;
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "м",
    (items) => {
      seen = items[0];
      return Promise.resolve(new Map([["a.tex", "theirs" as const]]));
    },
  );
  assert.deepEqual(seen, {
    path: "a.tex",
    kind: "file",
    ours: "deleted",
    theirs: "changed",
  });
  assert.equal(done?.committed, false);
  assert.equal(s.texts.get("a.tex"), "А бусдын");
  assert.equal(repo.text("a.tex"), "А бусдын");
});

test("commitChanges: татах явцад бичсэн засварыг нэгтгэлт дарж бичихгүй", async () => {
  const repo = await FakeRepo.create({
    "main.tex": MAIN,
    "a.tex": "А1\nА2\nА3",
    "b.tex": "Б",
  });
  const { s, remote } = await open(repo);
  await repo.push({ "a.tex": "А1\nА2\nА3 бусдын", "b.tex": "Б бусдын" });
  s.texts.set("b.tex", "Б миний");
  const done = await commitChanges(
    githubHost(repo),
    workingCopy(s),
    remote,
    "м",
    () => {
      s.texts.set("a.tex", "А1 хожуу\nА2\nА3");
      s.texts.set("b.tex", "Б миний хожуу");
      return Promise.resolve(new Map([["b.tex", ["ours"] as const]]));
    },
  );
  assert.ok(done?.committed);
  assert.equal(repo.text("a.tex"), "А1 хожуу\nА2\nА3 бусдын");
  assert.equal(repo.text("b.tex"), "Б миний хожуу");
});

test("commitChanges: constructor, __proto__ нэртэй файлыг шинэ файл гэж зөв илгээнэ", async () => {
  const repo = await FakeRepo.create({ "main.tex": MAIN });
  const { s, remote } = await open(repo);
  putFile(s, "constructor", encode("К"));
  putFile(s, "__proto__", encode("П"));
  const host = githubHost(repo);
  const sent: { path: string; exists: boolean }[] = [];
  const spy: GitHost = {
    ...host,
    commit: (input) => {
      sent.push(...input.writes.map(({ path, exists }) => ({ path, exists })));
      return host.commit(input);
    },
  };
  const done = await commitChanges(spy, workingCopy(s), remote, "Шинэ");
  assert.ok(done);
  assert.deepEqual(
    sent.sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: "__proto__", exists: false },
      { path: "constructor", exists: false },
    ],
  );
  assert.equal(repo.text("__proto__"), "П");
  assert.deepEqual(Object.keys(done.remote.files).sort(), [
    "__proto__",
    "constructor",
    "main.tex",
  ]);
  assert.equal(
    await commitChanges(spy, workingCopy(s), done.remote, "дахин"),
    null,
  );
});
