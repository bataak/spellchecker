import { createHash } from "node:crypto";
import type { BrowserContext } from "playwright";

interface Commit {
  readonly files: Map<string, string>;
  readonly parent: string | null;
  readonly message: string;
}

interface Reply {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string | Buffer;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-expose-headers": "x-next-page, x-gitlab-last-commit-id",
};

export const GITLAB_PROJECT = "group/sub/thesis";

export class FakeGitlab {
  readonly blobs = new Map<string, Buffer>();
  readonly commits = new Map<string, Commit>();
  readonly branches = new Map<string, string>();
  readonly tokens: string[] = [];
  readonly pages: number[] = [];
  pageSize = 2;
  beforeCommit: (() => void) | null = null;
  private next = 0;

  readonly host: string;

  constructor(
    files: Record<string, string>,
    host = "https://gitlab.example.org",
  ) {
    this.host = host;
    const map = new Map<string, string>();
    for (const [path, text] of Object.entries(files))
      map.set(path, this.putBlob(Buffer.from(text)));
    const commit = this.id();
    this.commits.set(commit, { files: map, parent: null, message: "init" });
    this.branches.set("main", commit);
  }

  private id(): string {
    return String(++this.next).padStart(40, "c");
  }

  private putBlob(bytes: Buffer): string {
    const sha = createHash("sha1")
      .update("blob " + bytes.length + "\u0000")
      .update(bytes)
      .digest("hex");
    this.blobs.set(sha, bytes);
    return sha;
  }

  headFiles(): Map<string, string> {
    return this.commits.get(this.branches.get("main")!)!.files;
  }

  text(path: string): string | undefined {
    const sha = this.headFiles().get(path);
    return sha ? this.blobs.get(sha)!.toString() : undefined;
  }

  lastMessage(): string {
    return this.commits.get(this.branches.get("main")!)!.message;
  }

  push(files: Record<string, string | null>): void {
    const head = this.branches.get("main")!;
    const map = new Map(this.headFiles());
    for (const [path, text] of Object.entries(files)) {
      if (text === null) map.delete(path);
      else map.set(path, this.putBlob(Buffer.from(text)));
    }
    const commit = this.id();
    this.commits.set(commit, { files: map, parent: head, message: "other" });
    this.branches.set("main", commit);
  }

  lastCommitFor(ref: string, path: string): string | null {
    let id: string | null = ref;
    const sha = this.commits.get(ref)?.files.get(path);
    if (sha === undefined) return null;
    while (id) {
      const commit: Commit = this.commits.get(id)!;
      const parent = commit.parent ? this.commits.get(commit.parent) : null;
      if (!parent || parent.files.get(path) !== sha) return id;
      id = commit.parent;
    }
    return null;
  }

  private json(status: number, body: unknown, extra = {}): Reply {
    return {
      status,
      headers: { ...CORS, "content-type": "application/json", ...extra },
      body: JSON.stringify(body),
    };
  }

  private tree(ref: string, page: number): Reply {
    const files = this.commits.get(ref)!.files;
    const dirs = new Set<string>();
    for (const path of files.keys()) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++)
        dirs.add(parts.slice(0, i).join("/"));
    }
    const all = [
      ...[...dirs].map((path) => ({
        id: "d",
        path,
        type: "tree",
        mode: "040000",
      })),
      ...[...files].map(([path, id]) => ({
        id,
        path,
        type: "blob",
        mode: "100644",
      })),
    ];
    this.pages.push(page);
    const slice = all.slice((page - 1) * this.pageSize, page * this.pageSize);
    const more = page * this.pageSize < all.length;
    return this.json(200, slice, {
      "x-next-page": more ? String(page + 1) : "",
    });
  }

  handle(method: string, href: string, body: string | null): Reply {
    if (method === "OPTIONS") return { status: 204, headers: CORS, body: "" };
    const url = new URL(href);
    const prefix = "/api/v4/projects/" + encodeURIComponent(GITLAB_PROJECT);
    if (url.origin !== this.host || !url.pathname.startsWith(prefix))
      return this.json(404, {});
    const path = url.pathname.slice(prefix.length);
    let match: RegExpExecArray | null;
    if (path === "") return this.json(200, { default_branch: "main" });
    if ((match = /^\/repository\/branches\/(.+)$/.exec(path))) {
      const id = this.branches.get(decodeURIComponent(match[1]!));
      return id ? this.json(200, { commit: { id } }) : this.json(404, {});
    }
    if (path === "/repository/tree")
      return this.tree(
        url.searchParams.get("ref")!,
        Number(url.searchParams.get("page") ?? "1"),
      );
    if (
      (match = /^\/repository\/files\/(.+)$/.exec(path)) &&
      method === "HEAD"
    ) {
      const last = this.lastCommitFor(
        url.searchParams.get("ref")!,
        decodeURIComponent(match[1]!),
      );
      return last
        ? {
            status: 200,
            headers: { ...CORS, "x-gitlab-last-commit-id": last },
            body: "",
          }
        : this.json(404, {});
    }
    if ((match = /^\/repository\/blobs\/(\w+)\/raw$/.exec(path)))
      return { status: 200, headers: CORS, body: this.blobs.get(match[1]!)! };
    if (path === "/repository/commits" && method === "POST") {
      const input = JSON.parse(body ?? "{}") as {
        branch: string;
        commit_message: string;
        actions: {
          action: string;
          file_path: string;
          content?: string;
          last_commit_id?: string;
        }[];
      };
      this.beforeCommit?.();
      this.beforeCommit = null;
      const head = this.branches.get(input.branch)!;
      const map = new Map(this.commits.get(head)!.files);
      for (const action of input.actions) {
        const exists = map.has(action.file_path);
        if (action.action === "create" && exists)
          return this.json(400, { message: "exists" });
        if (action.action !== "create" && !exists)
          return this.json(400, { message: "missing" });
        if (
          action.last_commit_id &&
          this.lastCommitFor(head, action.file_path) !== action.last_commit_id
        )
          return this.json(400, { message: "changed since" });
        if (action.action === "delete") map.delete(action.file_path);
        else
          map.set(
            action.file_path,
            this.putBlob(Buffer.from(action.content ?? "", "base64")),
          );
      }
      const id = this.id();
      this.commits.set(id, {
        files: map,
        parent: head,
        message: input.commit_message,
      });
      this.branches.set(input.branch, id);
      return this.json(201, { id });
    }
    return this.json(404, {});
  }

  readonly fetch = (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    this.tokens.push(headers.get("authorization") ?? "");
    const reply = this.handle(
      init?.method ?? "GET",
      url,
      typeof init?.body === "string" ? init.body : null,
    );
    return Promise.resolve(
      new Response(
        reply.status === 204
          ? null
          : typeof reply.body === "string"
            ? reply.body
            : new Uint8Array(reply.body),
        {
          status: reply.status,
          headers: reply.headers,
        },
      ),
    );
  };

  async attach(context: BrowserContext): Promise<void> {
    await context.route(this.host + "/api/v4/**", (route) => {
      const request = route.request();
      if (request.method() !== "OPTIONS")
        this.tokens.push(request.headers().authorization ?? "");
      const reply = this.handle(
        request.method(),
        request.url(),
        request.postData(),
      );
      return route.fulfill(reply);
    });
  }
}
