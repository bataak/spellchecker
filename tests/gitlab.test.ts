import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitlabHost } from "../src/project/git/gitlab.ts";
import type { GitHost } from "../src/project/git/githost.ts";
import { commitChanges, loadRepo } from "../src/project/git/gitsync.ts";
import { FakeGitlab, GITLAB_PROJECT } from "./helpers/fakegitlab.ts";
import { newState } from "../src/project/projectstate.ts";
import { moveEntries, putFile } from "../src/project/projectedit.ts";
import { ProjectError } from "../src/project/projecterror.ts";
import { workingCopy } from "../src/project/workingcopy.ts";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n";

const gitlab = (repo: FakeGitlab): GitHost =>
  createGitlabHost("glpat", repo.host, GITLAB_PROJECT, repo.fetch);

const openGitlab = async (repo: FakeGitlab, dir = "") => {
  const loaded = await loadRepo(gitlab(repo), {
    provider: "gitlab",
    host: repo.host,
    project: GITLAB_PROJECT,
    branch: null,
    dir,
  });
  const s = newState(1, "git", loaded.name, null, loaded.files, loaded.dirs);
  return { s, remote: loaded.remote };
};

test("GitLab: хуудаслагдсан модыг бүрэн уншиж, дэд хавтсаар шүүнэ", async () => {
  const repo = new FakeGitlab({
    "README.md": "readme",
    "tex/main.tex": MAIN,
    "tex/ch/one.tex": "Нэг",
    "tex/img.png": "PNG",
  });
  const { s, remote } = await openGitlab(repo, "tex");
  assert.ok(repo.pages.length > 2);
  assert.equal(s.name, "tex");
  assert.deepEqual([...s.texts.keys()].sort(), ["ch/one.tex", "main.tex"]);
  assert.deepEqual([...s.binaries.keys()], ["img.png"]);
  assert.equal(remote.provider, "gitlab");
  assert.equal(remote.tree, remote.head);
  assert.ok(repo.tokens.every((token) => token === "Bearer glpat"));
});

test("GitLab: засах, нэмэх, устгах, нэр солихыг нэг commit болгоно", async () => {
  const repo = new FakeGitlab({
    "tex/main.tex": MAIN,
    "tex/a.tex": "А",
    "tex/b.tex": "Б",
  });
  const { s, remote } = await openGitlab(repo, "tex");
  s.texts.set("a.tex", "А шинэ");
  putFile(s, "c.tex", encode("В"));
  moveEntries(s, "b.tex", "d.tex");
  const done = await commitChanges(
    gitlab(repo),
    workingCopy(s),
    remote,
    "GitLab засвар",
  );
  assert.ok(done);
  assert.equal(repo.text("tex/a.tex"), "А шинэ");
  assert.equal(repo.text("tex/c.tex"), "В");
  assert.equal(repo.text("tex/d.tex"), "Б");
  assert.equal(repo.text("tex/b.tex"), undefined);
  assert.equal(repo.lastMessage(), "GitLab засвар");
  assert.equal(done.remote.head, repo.branches.get("main"));
  assert.equal(
    await commitChanges(gitlab(repo), workingCopy(s), done.remote, "x"),
    null,
  );
});

test("GitLab: бусдын давхцахгүй өөрчлөлтийг татаж, давхцахыг зогсооно", async () => {
  const repo = new FakeGitlab({ "main.tex": MAIN, "a.tex": "А", "b.tex": "Б" });
  const first = await openGitlab(repo);
  repo.push({ "b.tex": "Б бусдын" });
  first.s.texts.set("a.tex", "А миний");
  const done = await commitChanges(
    gitlab(repo),
    workingCopy(first.s),
    first.remote,
    "м",
  );
  assert.ok(done?.pulled);
  assert.equal(first.s.texts.get("b.tex"), "Б бусдын");
  assert.equal(repo.text("a.tex"), "А миний");

  const second = await openGitlab(repo);
  repo.push({ "a.tex": "А бусдын дахин" });
  second.s.texts.set("a.tex", "А зөрчил");
  const before = repo.branches.get("main");
  await assert.rejects(
    commitChanges(gitlab(repo), workingCopy(second.s), second.remote, "x"),
    /a\.tex/,
  );
  assert.equal(repo.branches.get("main"), before);
});

test("GitLab: файлын сүүлийн commit-ийг уншиж чадаагүй бол хамгаалалтгүй commit хийхгүй", async () => {
  const repo = new FakeGitlab({ "main.tex": MAIN, "a.tex": "А" });
  const { s, remote } = await openGitlab(repo);
  repo.hideLastCommit = true;
  const before = repo.branches.get("main");
  s.texts.set("a.tex", "А миний");
  await assert.rejects(
    commitChanges(gitlab(repo), workingCopy(s), remote, "x"),
    /сүүлийн commit/,
  );
  assert.equal(repo.branches.get("main"), before);
});

test("GitLab: шалгалт ба commit-ийн хооронд орсон бусдын засварыг дарж бичихгүй", async () => {
  const repo = new FakeGitlab({ "main.tex": MAIN, "a.tex": "А" });
  repo.push({ "main.tex": MAIN + "%\n" });
  const synced = await openGitlab(repo);
  synced.s.texts.set("a.tex", "А миний");
  repo.beforeCommit = () => repo.push({ "a.tex": "А бусдын" });
  await assert.rejects(
    commitChanges(gitlab(repo), workingCopy(synced.s), synced.remote, "x"),
    ProjectError,
  );
  assert.equal(repo.text("a.tex"), "А бусдын");
});
