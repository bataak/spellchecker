const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g;

const CONTROL_SPACE = /[\u000B\u000C]/g;
const CONTROL_INVALID = /[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]/g;

export function dropControls(text: string): string {
  return text.replace(CONTROL_SPACE, " ").replace(CONTROL_INVALID, "");
}

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}
