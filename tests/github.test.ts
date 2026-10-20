import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGitApi,
  fromBase64,
  parseRepo,
  toBase64,
  type GitApi,
  type TreeChange,
  type TreeEntry,
} from "../src/project/github/gitapi.ts";
import {
  commitChanges,
  gitBlobSha,
  loadRepo,
  planChanges,
} from "../src/project/github/gitsync.ts";
import { newState } from "../src/project/projectstate.ts";
import { moveEntries, putFile } from "../src/project/projectedit.ts";
import { ProjectError } from "../src/project/projecterror.ts";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

class FakeRepo implements GitApi {
  blobs = new Map<string, Uint8Array>();
  trees = new Map<string, Map<string, { sha: string; mode: string }>>();
  commits = new Map<
    string,
    { tree: string; parent: string | null; message: string }
  >();
  branches = new Map<string, string>();
  race = false;
  private next = 0;

  static async create(files: Record<string, string>): Promise<FakeRepo> {
    const repo = new FakeRepo();
    const entries = new Map<string, { sha: string; mode: string }>();
    for (const [path, text] of Object.entries(files))
      entries.set(path, {
        sha: await repo.putBlob(encode(text)),
        mode: "100644",
      });
    const tree = repo.id("t");
    repo.trees.set(tree, entries);
    const commit = repo.id("c");
    repo.commits.set(commit, { tree, parent: null, message: "init" });
    repo.branches.set("main", commit);
    return repo;
  }

  id(prefix: string): string {
    return prefix + ++this.next;
  }

  async putBlob(bytes: Uint8Array): Promise<string> {
    const sha = await gitBlobSha(bytes);
    this.blobs.set(sha, bytes);
    return sha;
  }

  async push(files: Record<string, string | null>): Promise<void> {
    const head = this.branches.get("main")!;
    const entries = new Map(this.trees.get(this.commits.get(head)!.tree)!);
    for (const [path, text] of Object.entries(files)) {
      if (text === null) entries.delete(path);
      else
        entries.set(path, {
          sha: await this.putBlob(encode(text)),
          mode: "100644",
        });
    }
    const tree = this.id("t");
    this.trees.set(tree, entries);
    const commit = this.id("c");
    this.commits.set(commit, { tree, parent: head, message: "other" });
    this.branches.set("main", commit);
  }

  text(path: string): string | undefined {
    const head = this.branches.get("main")!;
    const entry = this.trees.get(this.commits.get(head)!.tree)!.get(path);
    return entry
      ? new TextDecoder().decode(this.blobs.get(entry.sha))
      : undefined;
  }

  defaultBranch = (): Promise<string> => Promise.resolve("main");
  head = (branch: string): Promise<string> =>
    Promise.resolve(this.branches.get(branch)!);
  commitTree = (commit: string): Promise<string> =>
    Promise.resolve(this.commits.get(commit)!.tree);
  tree = (sha: string): Promise<readonly TreeEntry[]> => {
    const entries = [...this.trees.get(sha)!].map(([path, entry]) => ({
      path,
      type: "blob",
      ...entry,
    }));
    const dirs = new Set(
      entries.flatMap(({ path }) =>
        path
          .split("/")
          .slice(0, -1)
          .map((_, i, all) => all.slice(0, i + 1).join("/")),
      ),
    );
    return Promise.resolve([
      ...[...dirs].map((path) => ({
        path,
        type: "tree",
        mode: "040000",
        sha: "d",
      })),
      ...entries,
    ]);
  };
  blob = (sha: string): Promise<Uint8Array> =>
    Promise.resolve(this.blobs.get(sha)!);
  createBlob = (bytes: Uint8Array): Promise<string> => this.putBlob(bytes);
  createTree = (
    base: string,
    changes: readonly TreeChange[],
  ): Promise<string> => {
    const entries = new Map(this.trees.get(base)!);
    for (const change of changes) {
      if (change.sha === null) entries.delete(change.path);
      else entries.set(change.path, { sha: change.sha, mode: change.mode });
    }
    const tree = this.id("t");
    this.trees.set(tree, entries);
    return Promise.resolve(tree);
  };
  createCommit = (
    message: string,
    tree: string,
    parent: string,
  ): Promise<string> => {
    const commit = this.id("c");
    this.commits.set(commit, { tree, parent, message });
    return Promise.resolve(commit);
  };
  moveBranch = (branch: string, commit: string): Promise<boolean> => {
    if (this.race) return Promise.resolve(false);
    if (this.commits.get(commit)!.parent !== this.branches.get(branch))
      return Promise.resolve(false);
    this.branches.set(branch, commit);
    return Promise.resolve(true);
  };
}

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n";

const open = async (repo: FakeRepo, dir = "") => {
  const loaded = await loadRepo(repo, {
    owner: "o",
    repo: "r",
    branch: null,
    dir,
  });
  const s = newState(1, "github", loaded.name, null, loaded.files, loaded.dirs);
  return { s, remote: loaded.remote };
};

test("parseRepo: эзэн/нэр болон GitHub хаягийг задлана", () => {
  assert.deepEqual(parseRepo("bataak/thesis"), {
    owner: "bataak",
    repo: "thesis",
    branch: null,
    dir: "",
  });
  assert.deepEqual(
    parseRepo("https://github.com/bataak/thesis/tree/dev/chapters/one/"),
    { owner: "bataak", repo: "thesis", branch: "dev", dir: "chapters/one" },
  );
  assert.deepEqual(parseRepo("github.com/a/b.git", "x", "/d/"), {
    owner: "a",
    repo: "b",
    branch: "x",
    dir: "d",
  });
  assert.throws(() => parseRepo("thesis"), ProjectError);
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
  assert.deepEqual(await planChanges(s, remote), { writes: [], deletes: [] });
  s.texts.set("a.tex", "А засвар");
  putFile(s, "new.tex", encode("Шинэ"));
  moveEntries(s, "b.tex", "c.tex");
  s.binaries.delete("img.png");
  const plan = await planChanges(s, remote);
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
  const done = await commitChanges(repo, s, remote, "Засвар");
  assert.ok(done);
  assert.equal(done.pulled, false);
  assert.equal(repo.text("a.tex"), "А шинэ");
  assert.equal(repo.text("b.tex"), "Б");
  assert.equal(repo.commits.get(repo.branches.get("main")!)!.message, "Засвар");
  assert.equal(done.remote.head, repo.branches.get("main"));
  assert.equal(s.dirty.size, 0);
  assert.equal(s.unsynced, false);
  assert.equal(await commitChanges(repo, s, done.remote, "дахин"), null);
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
  const done = await commitChanges(repo, s, remote, "Миний засвар");
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
    commitChanges(repo, s, remote, "x"),
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
  await assert.rejects(commitChanges(repo, s, remote, "x"), ProjectError);
  assert.equal(s.saved.get("a.tex"), "А");
  assert.equal(s.texts.get("a.tex"), "А миний");
});

test("createGitApi: token-тойгоор зөв хаяг руу хандаж, алдааг ойлгомжтой болгоно", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = createGitApi("tok", { owner: "o", repo: "r" }, (url, init) => {
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
