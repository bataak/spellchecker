import {
  fromBase64Url,
  importKey,
  TOKEN,
  unseal,
  validName,
  type InviteLink,
  type ShortLink,
} from "./collabkey.ts";

const ROOM = /^[A-Za-z0-9_-]{22}$/;
const WAIT_MS = 8000;
const decoder = new TextDecoder("utf-8", { fatal: true });

export type Opener = (url: string) => WebSocket;

export function shortUrl(endpoint: string, code: string): string {
  return endpoint.replace(/^http/, "ws").replace(/\/+$/, "") + "/j/" + code;
}

async function openName(key: string, sealed: unknown): Promise<string | null> {
  if (typeof sealed !== "string" || !sealed) return null;
  try {
    const plain = await unseal(await importKey(key), fromBase64Url(sealed));
    const name = plain ? decoder.decode(plain) : "";
    return validName(name) ? name : null;
  } catch {
    return null;
  }
}

async function linkOf(
  short: ShortLink,
  data: unknown,
): Promise<InviteLink | null> {
  if (!data || typeof data !== "object") return null;
  const v = data as Record<string, unknown>;
  if (v.t !== "link" || typeof v.room !== "string" || !ROOM.test(v.room))
    return null;
  if (typeof v.invite !== "string" || !TOKEN.test(v.invite)) return null;
  const link = { room: v.room, key: short.key, invite: v.invite };
  const name = await openName(short.key, v.name);
  return name ? { ...link, name } : link;
}

export function resolveShort(
  endpoint: string,
  short: ShortLink,
  open: Opener = (url) => new WebSocket(url),
): Promise<InviteLink | null> {
  return new Promise((resolve) => {
    let done = false;
    const socket = open(shortUrl(endpoint, short.code));
    const finish = (link: InviteLink | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve(link);
    };
    const timer = setTimeout(() => finish(null), WAIT_MS);
    socket.onmessage = (event) => {
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return finish(null);
      }
      void linkOf(short, data).then(finish);
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => setTimeout(() => finish(null), 50);
  });
}
