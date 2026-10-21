import { gitBlobSha } from "../../src/project/git/gitsync.ts";
import type { GitApi, TreeChange } from "../../src/project/git/github.ts";
import type { TreeEntry } from "../../src/project/git/githost.ts";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

export class FakeRepo implements GitApi {
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
