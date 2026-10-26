import { createEmitter } from "../core/emitter.ts";
import {
  fromBase64Url,
  newToken,
  seal,
  toBase64Url,
  unseal,
} from "./collabkey.ts";
import type { RosterEntry, SignalEvent } from "./signalwire.ts";

export interface Member {
  readonly dev: string;
  readonly name: string;
  readonly online: boolean;
  readonly owner: boolean;
  readonly color?: number | null;
}

export interface Admin {
  invite(): Promise<string | null>;
  members(): Promise<Member[] | null>;
  remove(dev: string, wipe: boolean): Promise<Member[] | null>;
  end(wipe: boolean): Promise<boolean>;
  label(name: string): void;
  receive(event: SignalEvent): boolean;
}

type Command = (message: Record<string, unknown>) => boolean;

const REPLY_MS = 8000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function reply<T>(
  add: (done: (value: T) => void) => () => void,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    let remove = (): void => {};
    const timer = setTimeout(() => {
      remove();
      resolve(fallback);
    }, REPLY_MS);
    remove = add((value) => {
      clearTimeout(timer);
      remove();
      resolve(value);
    });
  });
}

async function readLabel(key: CryptoKey, label: string): Promise<string> {
  if (!label) return "";
  try {
    const plain = await unseal(key, fromBase64Url(label));
    return plain ? decoder.decode(plain) : "";
  } catch {
    return "";
  }
}

export function decodeRoster(
  key: CryptoKey,
  list: readonly RosterEntry[],
): Promise<Member[]> {
  return Promise.all(
    list.map(async (entry) => ({
      dev: entry.dev,
      name: await readLabel(key, entry.label),
      online: entry.online,
      owner: entry.owner,
    })),
  );
}

export function createAdmin(key: CryptoKey, command: Command): Admin {
  const invites = new Map<string, (ok: boolean) => void>();
  const rosters = createEmitter<RosterEntry[] | null>();
  const endings = createEmitter<boolean>();

  const roster = (
    message: Record<string, unknown>,
  ): Promise<Member[] | null> => {
    if (!command(message)) return Promise.resolve(null);
    return reply<RosterEntry[] | null>(rosters.on, null).then((list) =>
      list ? decodeRoster(key, list) : null,
    );
  };

  return {
    async invite() {
      const token = newToken();
      if (!command({ t: "invite", i: token })) return null;
      const ok = await reply<boolean>((done) => {
        invites.set(token, done);
        return () => invites.delete(token);
      }, false);
      return ok ? token : null;
    },
    members: () => roster({ t: "members" }),
    remove: (dev, wipe) => roster({ t: "remove", dev, wipe }),
    end(wipe) {
      if (!command({ t: "close", wipe })) return Promise.resolve(false);
      return reply<boolean>(endings.on, false);
    },
    label(name) {
      void seal(key, encoder.encode(name)).then((sealed) =>
        command({ t: "label", l: toBase64Url(sealed) }),
      );
    },
    receive(event) {
      if (event.t === "invited") {
        invites.get(event.i)?.(true);
        return true;
      }
      if (event.t === "ended") {
        endings.emit(true);
        return true;
      }
      if (event.t === "members") {
        rosters.emit(event.list);
        return true;
      }
      return false;
    },
  };
}
