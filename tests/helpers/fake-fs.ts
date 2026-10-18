type Node = FakeDir | FakeFile;

function notFound(name: string): DOMException {
  return new DOMException(name, "NotFoundError");
}

export class FakeFile {
  readonly kind = "file";
  readonly name: string;
  bytes: Uint8Array;

  constructor(name: string, bytes: Uint8Array = new Uint8Array(0)) {
    this.name = name;
    this.bytes = bytes;
  }

  async getFile(): Promise<File> {
    return new File([this.bytes as Uint8Array<ArrayBuffer>], this.name, {
      lastModified: 1,
    });
  }

  async createWritable(): Promise<{
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
  }> {
    const parts: Uint8Array[] = [];
    return {
      write: async (data) => {
        parts.push(
          typeof data === "string"
            ? new TextEncoder().encode(data)
            : new Uint8Array(await data.arrayBuffer()),
        );
      },
      close: async () => {
        this.bytes = new Uint8Array(
          await new Blob(parts as BlobPart[]).arrayBuffer(),
        );
      },
    };
  }
}

export class FakeDir {
  readonly kind = "directory";
  readonly children = new Map<string, Node>();
  readonly name: string;
  readonly permission: PermissionState;

  constructor(name: string, permission: PermissionState = "granted") {
    this.name = name;
    this.permission = permission;
  }

  async requestPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async getDirectoryHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<FakeDir> {
    const found = this.children.get(name);
    if (found instanceof FakeDir) return found;
    if (found || !options.create) throw notFound(name);
    const dir = new FakeDir(name);
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<FakeFile> {
    const found = this.children.get(name);
    if (found instanceof FakeFile) return found;
    if (found || !options.create) throw notFound(name);
    const file = new FakeFile(name);
    this.children.set(name, file);
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.children.delete(name)) throw notFound(name);
  }

  async *values(): AsyncIterable<Node> {
    yield* [...this.children.values()];
  }

  put(path: string, content: string | Uint8Array): void {
    const parts = path.split("/");
    let dir: FakeDir = this;
    for (const part of parts.slice(0, -1)) {
      let next = dir.children.get(part);
      if (!(next instanceof FakeDir)) {
        next = new FakeDir(part);
        dir.children.set(part, next);
      }
      dir = next;
    }
    const name = parts[parts.length - 1]!;
    dir.children.set(
      name,
      new FakeFile(
        name,
        typeof content === "string"
          ? new TextEncoder().encode(content)
          : content,
      ),
    );
  }

  read(path: string): string | null {
    let node: Node | undefined = this;
    for (const part of path.split("/")) {
      if (!(node instanceof FakeDir)) return null;
      node = node.children.get(part);
    }
    return node instanceof FakeFile
      ? new TextDecoder().decode(node.bytes)
      : null;
  }

  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }
}
