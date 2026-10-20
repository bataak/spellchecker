import { createHash } from "node:crypto";
import type { BrowserContext, Route } from "playwright";

interface Entry {
  readonly sha: string;
  readonly mode: string;
}

interface Commit {
  readonly tree: string;
  readonly parent: string | null;
  readonly message: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, accept, x-github-api-version",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
};

export class FakeGithub {
  readonly blobs = new Map<string, Buffer>();
  readonly trees = new Map<string, Map<string, Entry>>();
  readonly commits = new Map<string, Commit>();
  readonly branches = new Map<string, string>();
  readonly tokens: string[] = [];
  private next = 0;

  constructor(files: Record<string, string>) {
    const entries = new Map<string, Entry>();
    for (const [path, text] of Object.entries(files))
      entries.set(path, {
        sha: this.putBlob(Buffer.from(text)),
        mode: "100644",
      });
    const tree = this.id("t");
    this.trees.set(tree, entries);
    const commit = this.id("c");
    this.commits.set(commit, { tree, parent: null, message: "init" });
    this.branches.set("main", commit);
  }

  private id(prefix: string): string {
    return prefix + String(++this.next).padStart(39, "0");
  }

  private putBlob(bytes: Buffer): string {
    const sha = createHash("sha1")
      .update("blob " + bytes.length + "\u0000")
      .update(bytes)
      .digest("hex");
    this.blobs.set(sha, bytes);
    return sha;
  }

  headEntries(): Map<string, Entry> {
    const head = this.branches.get("main")!;
    return this.trees.get(this.commits.get(head)!.tree)!;
  }

  text(path: string): string | undefined {
    const entry = this.headEntries().get(path);
    return entry ? this.blobs.get(entry.sha)!.toString() : undefined;
  }

  lastMessage(): string {
    return this.commits.get(this.branches.get("main")!)!.message;
  }

  push(files: Record<string, string>): void {
    const head = this.branches.get("main")!;
    const entries = new Map(this.headEntries());
    for (const [path, text] of Object.entries(files))
      entries.set(path, {
        sha: this.putBlob(Buffer.from(text)),
        mode: "100644",
      });
    const tree = this.id("t");
    this.trees.set(tree, entries);
    const commit = this.id("c");
    this.commits.set(commit, { tree, parent: head, message: "other" });
    this.branches.set("main", commit);
  }

  private reply(route: Route, status: number, body: unknown): Promise<void> {
    return route.fulfill({
      status,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private treeBody(sha: string): unknown {
    const entries = [...this.trees.get(sha)!];
    const dirs = new Set<string>();
    for (const [path] of entries) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++)
        dirs.add(parts.slice(0, i).join("/"));
    }
    return {
      truncated: false,
      tree: [
        ...[...dirs].map((path) => ({
          path,
          type: "tree",
          mode: "040000",
          sha: "d",
        })),
        ...entries.map(([path, entry]) => ({
          path,
          type: "blob",
          size: this.blobs.get(entry.sha)!.length,
          ...entry,
        })),
      ],
    };
  }

  private handle(route: Route): Promise<void> {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: CORS, body: "" });
    this.tokens.push(request.headers().authorization ?? "");
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/repos\/o\/r/, "");
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    let match: RegExpExecArray | null;
    if (path === "") return this.reply(route, 200, { default_branch: "main" });
    if ((match = /^\/git\/ref\/heads\/(.+)$/.exec(path))) {
      const sha = this.branches.get(decodeURIComponent(match[1]!));
      return sha
        ? this.reply(route, 200, { object: { sha } })
        : this.reply(route, 404, {});
    }
    if ((match = /^\/git\/commits\/(\w+)$/.exec(path)))
      return this.reply(route, 200, {
        tree: { sha: this.commits.get(match[1]!)!.tree },
      });
    if ((match = /^\/git\/trees\/(\w+)$/.exec(path)))
      return this.reply(route, 200, this.treeBody(match[1]!));
    if ((match = /^\/git\/blobs\/(\w+)$/.exec(path)))
      return this.reply(route, 200, {
        content: this.blobs.get(match[1]!)!.toString("base64"),
        encoding: "base64",
      });
    if (path === "/git/blobs")
      return this.reply(route, 201, {
        sha: this.putBlob(Buffer.from(String(body.content), "base64")),
      });
    if (path === "/git/trees") {
      const entries = new Map(this.trees.get(String(body.base_tree))!);
      for (const change of body.tree as {
        path: string;
        mode: string;
        sha: string | null;
      }[]) {
        if (change.sha === null) entries.delete(change.path);
        else entries.set(change.path, { sha: change.sha, mode: change.mode });
      }
      const tree = this.id("t");
      this.trees.set(tree, entries);
      return this.reply(route, 201, { sha: tree });
    }
    if (path === "/git/commits") {
      const commit = this.id("c");
      this.commits.set(commit, {
        tree: String(body.tree),
        parent: (body.parents as string[])[0] ?? null,
        message: String(body.message),
      });
      return this.reply(route, 201, { sha: commit });
    }
    if ((match = /^\/git\/refs\/heads\/(.+)$/.exec(path))) {
      const branch = decodeURIComponent(match[1]!);
      const commit = this.commits.get(String(body.sha))!;
      if (commit.parent !== this.branches.get(branch))
        return this.reply(route, 422, {});
      this.branches.set(branch, String(body.sha));
      return this.reply(route, 200, {});
    }
    return this.reply(route, 404, {});
  }

  async attach(context: BrowserContext): Promise<void> {
    await context.route("https://api.github.com/repos/o/r**", (route) =>
      this.handle(route),
    );
  }
}
