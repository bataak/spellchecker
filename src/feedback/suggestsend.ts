export const MAX_WORDS = 50;

const ENDPOINT = "https://api.bichig.dev/suggest";

export interface SuggestPayload {
  readonly words: readonly string[];
  readonly note: string;
  readonly turnstileToken: string;
}

export function sendBlock(
  count: number,
  online: boolean,
  token: string,
): string | null {
  if (count === 0) return "Дор хаяж нэг үг оруулна уу";
  if (count > MAX_WORDS)
    return "Илгээх үгийн тоо хамгийн ихдээ " + MAX_WORDS + " байх ёстой.";
  if (!online) return "Сүлжээгүй байна — холбогдсоны дараа дахин оролдоно уу";
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
