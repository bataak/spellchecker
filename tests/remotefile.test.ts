import "./helpers/mock-storage.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REMOTE_MAX_BYTES,
  fetchRemote,
  parseRemote,
  type Fetcher,
} from "../src/files/remotefile.ts";
import { openRemote } from "../src/app/remoteopen.ts";
import { KEYS, writeJson } from "../src/core/store.ts";

function source(input: string) {
  const parsed = parseRemote(input);
  assert.ok(parsed.ok, input);
  return parsed.source;
}

test("GitHub-ын blob, raw, gist холбоосыг raw ба API хаяг болгоно", () => {
  const blob = source(
    "https://github.com/user/repo/blob/main/docs/%D0%B0.md?plain=1#L3",
  );
  assert.equal(blob.name, "а.md");
  assert.equal(blob.provider, "github");
  assert.equal(
    blob.open,
    "https://raw.githubusercontent.com/user/repo/main/docs/%D0%B0.md",
  );
  assert.deepEqual(blob.apis, [
    "https://api.github.com/repos/user/repo/contents/docs/%D0%B0.md?ref=main",
    "https://api.github.com/repos/user/repo/contents/%D0%B0.md?ref=main%2Fdocs",
  ]);
  assert.equal(
    blob.shown,
    "https://github.com/user/repo/blob/main/docs/а.md?plain=1#L3",
  );
  const raw = source(
    "https://raw.githubusercontent.com/user/repo/refs/heads/dev/a.tex",
  );
  assert.equal(
    raw.open,
    "https://raw.githubusercontent.com/user/repo/refs/heads/dev/a.tex",
  );
  assert.deepEqual(raw.apis, [
    "https://api.github.com/repos/user/repo/contents/a.tex?ref=refs%2Fheads%2Fdev",
  ]);
  const gist = source(
    "https://gist.githubusercontent.com/u/abc/raw/1f/note.txt",
  );
  assert.equal(gist.provider, null);
  assert.deepEqual(gist.apis, []);
  assert.equal(
    gist.open,
    "https://gist.githubusercontent.com/u/abc/raw/1f/note.txt",
  );
});

test("GitLab-ын blob, raw холбоосыг API хаяг болгоно", () => {
  for (const kind of ["blob", "raw"]) {
    const file = source(
      "https://gitlab.com/group/sub/proj/-/" + kind + "/main/dir/a.ltx",
    );
    assert.equal(file.provider, "gitlab");
    assert.equal(file.open, null);
    assert.deepEqual(file.apis, [
      "https://gitlab.com/api/v4/projects/group%2Fsub%2Fproj/repository/files/dir%2Fa.ltx/raw?ref=main",
      "https://gitlab.com/api/v4/projects/group%2Fsub%2Fproj/repository/files/a.ltx/raw?ref=main%2Fdir",
    ]);
  }
});

test("салбарын нэрэнд / байвал боломжит хуваалтыг дарааллаар оролдоно", async () => {
  const slash = source("https://github.com/me/r/blob/feature/new/docs/a.md");
  assert.equal(
    slash.open,
    "https://raw.githubusercontent.com/me/r/feature/new/docs/a.md",
  );
  assert.equal(slash.apis.length, 3);
  const net = fake((url) =>
    url.includes("ref=feature%2Fnew") ? reply("салбар") : reply("", 404),
  );
  writeJson(KEYS.gitTokens, {});
  const h = harness([true], net.fetcher);
  assert.equal(
    await openRemote(
      "https://gitlab.com/me/r/-/blob/feature/new/docs/a.md",
      h.deps,
    ),
    true,
  );
  assert.deepEqual(h.opened, [["a.md", "салбар"]]);
  assert.equal(net.calls.length, 2);
  const bidi = source("https://github.com/me/r/blob/main/%E2%80%AEdm.txt");
  assert.equal(bidi.shown, "https://github.com/me/r/blob/main/dm.txt");
});

test("хавтас, бусад хост, төрөл, хуурамч хаягийг татгалзана", () => {
  const cases: Record<string, string> = {
    "https://github.com/user/repo": "folder",
    "https://github.com/user/repo/tree/main/docs": "folder",
    "https://gitlab.com/group/proj": "folder",
    "https://gitlab.com/group/proj/-/tree/main/docs": "folder",
    "http://github.com/user/repo/blob/main/a.md": "host",
    "https://github.com.evil.com/user/repo/blob/main/a.md": "host",
    "https://evil.com/github.com/user/repo/blob/main/a.md": "host",
    "https://user:pw@github.com/user/repo/blob/main/a.md": "host",
    "https://github.com:8443/user/repo/blob/main/a.md": "host",
    "https://140.82.112.3/user/repo/blob/main/a.md": "host",
    "https://github.com./user/repo/blob/main/a.md": "host",
    "javascript:alert(1)": "host",
    "https://github.com/user/repo/blob/main/a.exe": "type",
    "https://github.com/user/repo/blob/main/a.md.html": "type",
    "https://github.com/user/repo/issues/1": "invalid",
    "https://github.com/user/repo/blob/main/%2E%2E/a.md": "invalid",
    "https://gist.githubusercontent.com/u/abc/note.txt": "invalid",
    "не холбоос": "invalid",
  };
  for (const [input, reason] of Object.entries(cases)) {
    const parsed = parseRemote(input);
    assert.equal(parsed.ok ? "ok" : parsed.reason, reason, input);
  }
});

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function fake(reply: (url: string) => Response | Promise<Response>): {
  fetcher: Fetcher;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return reply(url);
    },
  };
}

function reply(body: BodyInit, status = 200, url = ""): Response {
  const response = new Response(body, { status });
  if (url) Object.defineProperty(response, "url", { value: url });
  return response;
}

test("татахдаа хэмжээ, redirect, binary-г шалгаж, cookie илгээхгүй", async () => {
  const raw = "https://raw.githubusercontent.com/u/r/main/a.md";
  const ok = fake((url) => reply("Сайн\u202E", 200, url));
  assert.deepEqual(await fetchRemote(raw, null, ok.fetcher), {
    ok: true,
    text: "Сайн",
  });
  assert.equal(ok.calls[0]!.init.credentials, "omit");
  assert.equal(ok.calls[0]!.init.referrerPolicy, "no-referrer");
  assert.deepEqual(ok.calls[0]!.init.headers, {});
  const big = fake(() => reply(new Uint8Array(REMOTE_MAX_BYTES + 1).fill(65)));
  assert.deepEqual(await fetchRemote(raw, null, big.fetcher), {
    ok: false,
    reason: "size",
  });
  const moved = fake(() => reply("x", 200, "https://evil.com/a.md"));
  assert.deepEqual(await fetchRemote(raw, null, moved.fetcher), {
    ok: false,
    reason: "redirect",
  });
  const binary = fake(() => reply(new Uint8Array([1, 0, 2])));
  assert.deepEqual(await fetchRemote(raw, null, binary.fetcher), {
    ok: false,
    reason: "binary",
  });
  const gone = fake(() => reply("", 404));
  assert.deepEqual(await fetchRemote(raw, null, gone.fetcher), {
    ok: false,
    reason: "missing",
  });
});

test("token-ийг зөвхөн API хост уруу илгээнэ", async () => {
  const seen = fake(() => reply("a"));
  await fetchRemote(
    "https://raw.githubusercontent.com/u/r/m/a.md",
    "T",
    seen.fetcher,
  );
  await fetchRemote(
    "https://api.github.com/repos/u/r/contents/a.md?ref=m",
    "T",
    seen.fetcher,
  );
  await fetchRemote(
    "https://gitlab.com/api/v4/projects/a%2Fb/repository/files/a.md/raw?ref=m",
    "T",
    seen.fetcher,
  );
  assert.deepEqual(
    seen.calls.map((call) => call.init.headers),
    [
      {},
      { Accept: "application/vnd.github.raw", Authorization: "Bearer T" },
      { Authorization: "Bearer T" },
    ],
  );
});

function harness(answers: boolean[], fetcher: Fetcher) {
  const opened: [string, string][] = [];
  const notes: string[] = [];
  const asked: string[] = [];
  return {
    opened,
    notes,
    asked,
    deps: {
      openText: async (name: string, text: string) => {
        opened.push([name, text]);
      },
      notify: (message: string) => notes.push(message),
      confirm: (title: string, text?: string) => {
        asked.push(text ? title + "\n\n" + text : title);
        return answers.shift() ?? false;
      },
      fetcher,
    },
  };
}

const PRIVATE = "https://github.com/me/secret/blob/main/a.md";

test("зөвшөөрөөгүй бол юу ч татахгүй", async () => {
  const net = fake(() => reply("a"));
  const h = harness([false], net.fetcher);
  assert.equal(await openRemote(PRIVATE, h.deps), false);
  assert.equal(net.calls.length, 0);
  assert.match(h.asked[0]!, /github\.com\/me\/secret/);
  const folder = harness([], net.fetcher);
  await openRemote("https://github.com/me/secret/tree/main", folder.deps);
  assert.match(folder.notes[0]!, /хавтас/);
});

test("нууц repo-г нэвтрээгүй бол зөвлөж, нэвтэрсэн бол асууж байж token хэрэглэнэ", async () => {
  writeJson(KEYS.gitTokens, {});
  const net = fake((url) =>
    url.startsWith("https://api.github.com/") ? reply("нууц") : reply("", 404),
  );
  const anon = harness([true], net.fetcher);
  assert.equal(await openRemote(PRIVATE, anon.deps), false);
  assert.match(anon.notes[0]!, /нэвтэрсний дараа/);
  assert.equal(net.calls.length, 1);

  writeJson(KEYS.gitTokens, { "github https://github.com": "TOKEN" });
  net.calls.length = 0;
  const refused = harness([true, false], net.fetcher);
  assert.equal(await openRemote(PRIVATE, refused.deps), false);
  assert.equal(net.calls.length, 1);
  assert.deepEqual(net.calls[0]!.init.headers, {});

  net.calls.length = 0;
  const agreed = harness([true, true], net.fetcher);
  assert.equal(await openRemote(PRIVATE, agreed.deps), true);
  assert.match(agreed.asked[1]!, /api\.github\.com/);
  assert.deepEqual(agreed.opened, [["a.md", "нууц"]]);
  assert.equal(
    (net.calls[1]!.init.headers as Record<string, string>).Authorization,
    "Bearer TOKEN",
  );
  writeJson(KEYS.gitTokens, {});
});
