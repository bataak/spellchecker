let held: string | null = null;

const plain = (text: string): string => text.replace(/\r\n?/g, "\n");

export const HELD_NOTE =
  "Холбоосоор нээсэн LaTeX файлыг автоматаар хөрвүүлсэнгүй. «Хөрвүүлэх» товч дарна уу";

export function holdTexCompile(text: string): void {
  held = plain(text);
}

export function releaseTexCompile(): void {
  held = null;
}

export function texCompileHeld(text: string): boolean {
  return held !== null && held === plain(text);
}
