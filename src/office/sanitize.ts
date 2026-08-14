const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g;

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}
