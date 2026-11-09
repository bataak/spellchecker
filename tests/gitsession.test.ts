import { resetStorage } from "./helpers/mock-storage.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeGitlab, GITLAB_PROJECT } from "./helpers/fakegitlab.ts";
import {
  commitState,
  hostFor,
  lastRepo,
  openRepo,
  providerToken,
  savedToken,
} from "../src/project/git/gitsession.ts";
import { newState } from "../src/project/projectstate.ts";
import { AuthError, ProjectError } from "../src/core/projecterror.ts";
import type { RepoSpec } from "../src/project/git/githost.ts";

const HOST = "https://gitlab.com";
const MAIN =
  "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n";
const where = { provider: "gitlab", host: HOST } as const;
const spec: RepoSpec = {
  provider: "gitlab",
  host: HOST,
  project: GITLAB_PROJECT,
  branch: null,
  dir: "",
};

function serve(repo: FakeGitlab, good: string): void {
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    if (init?.method !== "OPTIONS" && auth !== "Bearer " + good)
      return Promise.resolve(new Response("{}", { status: 401 }));
    return repo.fetch(url, init);
  }) as typeof fetch;
}

test("openRepo: ачаалж, token болон сүүлийн repo-г санана", async () => {
  resetStorage();
  const repo = new FakeGitlab({ "main.tex": MAIN }, HOST);
  serve(repo, "tok");
  const loaded = await openRepo({ ...spec, dir: "" }, "tok");
  assert.deepEqual(
    loaded.files.map(([path]) => path),
    ["main.tex"],
  );
  assert.equal(savedToken(where), "tok");
  assert.deepEqual(lastRepo(), {
    provider: "gitlab",
    repo: GITLAB_PROJECT,
    branch: "",
    dir: "",
  });
});

test("openRepo: буруу token-ийг хадгалахгүй, хуучин зөв token-ийг устгахгүй", async () => {
  resetStorage();
  const repo = new FakeGitlab({ "main.tex": MAIN }, HOST);
  serve(repo, "good");
  await openRepo(spec, "good");
  await assert.rejects(openRepo(spec, "bad"), AuthError);
  assert.equal(savedToken(where), "good");
  serve(repo, "other");
  await assert.rejects(openRepo(spec, "good"), AuthError);
  assert.equal(savedToken(where), null);
});

test("commitState: хадгалсан token-оор commit хийж, repo-гүй бол алдаа өгнө", async () => {
  resetStorage();
  const repo = new FakeGitlab({ "main.tex": MAIN }, HOST);
  serve(repo, "tok");
  const loaded = await openRepo(spec, "tok");
  const s = newState(1, "git", loaded.name, null, loaded.files, loaded.dirs);
  s.remote = loaded.remote;
  s.texts.set("main.tex", MAIN.replace("Сайн", "Сайхан"));
  assert.equal(await commitState(s, "Засвар"), true);
  assert.equal(repo.lastMessage(), "Засвар");
  assert.match(repo.text("main.tex") ?? "", /Сайхан/);
  const bare = newState(2, "git", "x", null, new Map(), new Set());
  await assert.rejects(commitState(bare, "x"), ProjectError);
});

test("hostFor: зөвшөөрөгдөөгүй серверийг татгалзана", () => {
  assert.throws(
    () =>
      hostFor(
        { provider: "gitlab", host: "https://git.example.org", project: "a/b" },
        "t",
      ),
    /зөвхөн github.com, gitlab.com/,
  );
});

test("openRepo: хүчинтэй OAuth token-оор ачаалж, хугацаа дууссаныг хадгалахгүй", async () => {
  resetStorage();
  const repo = new FakeGitlab({ "main.tex": MAIN }, HOST);
  serve(repo, "oauth");
  const live = { access: "oauth", expires: Date.now() + 3_600_000 };
  await openRepo(spec, live);
  assert.deepEqual(savedToken(where), live);
  resetStorage();
  await assert.rejects(
    openRepo(spec, { access: "oauth", expires: Date.now() - 1 }),
    AuthError,
  );
  assert.equal(savedToken(where), null);
});

test("commitState: шинэчлэх боломжгүй болсон OAuth token-ийг мартаж AuthError өгнө", async () => {
  resetStorage();
  const repo = new FakeGitlab({ "main.tex": MAIN }, HOST);
  serve(repo, "oauth");
  const loaded = await openRepo(spec, {
    access: "oauth",
    expires: Date.now() + 120_000,
  });
  const s = newState(1, "git", loaded.name, null, loaded.files, loaded.dirs);
  s.remote = loaded.remote;
  s.texts.set("main.tex", MAIN.replace("Сайн", "Сайхан"));
  const realNow = Date.now;
  Date.now = () => realNow() + 3_600_000;
  try {
    await assert.rejects(commitState(s, "Засвар"), AuthError);
  } finally {
    Date.now = realNow;
  }
  assert.equal(savedToken(where), null);
});

function queuedLocks(): LockManager {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: (_name: string, run: () => Promise<unknown>) => {
      const result = tail.then(run);
      tail = result.catch(() => undefined);
      return result;
    },
  } as unknown as LockManager;
}

test("providerToken: зэрэг дуудахад GitLab token-ийг нэг л удаа шинэчилнэ", async () => {
  resetStorage();
  const repo = new FakeGitlab({ "main.tex": MAIN }, HOST);
  serve(repo, "old");
  await openRepo(spec, {
    access: "old",
    refresh: "r1",
    verifier: "v",
    expires: Date.now() + 120_000,
  });
  let refreshes = 0;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    assert.ok(url.endsWith("/oauth/token"));
    refreshes++;
    const used = (init?.body as URLSearchParams).get("refresh_token");
    return Promise.resolve(
      used === "r1" && refreshes === 1
        ? Response.json({
            access_token: "new",
            refresh_token: "r2",
            expires_in: 86_400,
          })
        : new Response("{}", { status: 400 }),
    );
  }) as typeof fetch;
  const realNow = Date.now;
  const realLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: queuedLocks(),
  });
  Date.now = () => realNow() + 3_600_000;
  try {
    assert.deepEqual(
      await Promise.all([providerToken("gitlab"), providerToken("gitlab")]),
      ["new", "new"],
    );
  } finally {
    Date.now = realNow;
    if (realLocks) Object.defineProperty(navigator, "locks", realLocks);
    else delete (navigator as { locks?: LockManager }).locks;
  }
  assert.equal(refreshes, 1);
});
