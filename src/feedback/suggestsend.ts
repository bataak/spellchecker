import { KEYS, read, write } from "../core/store.ts";

export const MAX_WORDS = 50;
export const OFFLINE = "Сүлжээгүй байна — холбогдсоны дараа дахин оролдоно уу";
export const SENT = "Илгээгдлээ, баярлалаа!";

const ENDPOINT = "https://api.bichig.dev/suggest";
const DEVICE_RE = /^[0-9a-f-]{36}$/;

export interface SuggestPayload {
  readonly words: readonly string[];
  readonly insisted: readonly string[];
  readonly note: string;
  readonly turnstileToken: string;
  readonly device: string;
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function deviceId(): string {
  const saved = read(KEYS.deviceId);
  if (saved && DEVICE_RE.test(saved)) return saved;
  const fresh = randomUuid();
  write(KEYS.deviceId, fresh);
  return fresh;
}

export function sendBlock(
  count: number,
  online: boolean,
  token: string,
): string | null {
  if (count === 0) return "Дор хаяж нэг үг оруулна уу";
  if (count > MAX_WORDS)
    return "Илгээх үгийн тоо хамгийн ихдээ " + MAX_WORDS + " байх ёстой.";
  if (!online) return OFFLINE;
  if (!token)
    return "Баталгаажуулалт дуусаагүй — хэсэг хүлээгээд дахин дарна уу";
  return null;
}

export function sendFailure(status: number | null): string {
  if (status === null) return "Сүлжээний алдаа — дахин оролдоно уу";
  if (status === 429) return "Цагийн хязгаарт хүрлээ — дараа дахин оролдоно уу";
  return "Илгээхэд алдаа гарлаа — дахин оролдоно уу";
}

export async function postSuggestion(
  payload: SuggestPayload,
  send: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const response = await send(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.status;
  } catch {
    return null;
  }
}
