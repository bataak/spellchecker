import { KEYS, read, write } from "../core/store.ts";

export const NAMES = [
  "Чоно",
  "Буга",
  "Үнэг",
  "Тарвага",
  "Бүргэд",
  "Хулан",
  "Ирвэс",
  "Янгир",
  "Шонхор",
  "Тогоруу",
  "Янзага",
  "Суусар",
  "Тоорой",
  "Хонь",
  "Ямаа",
  "Тахь",
  "Гавар",
  "Гүрвэл",
  "Бамбар",
  "Хярс",
  "Тас",
  "Мазаалай",
  "Тэмээ",
  "Адуу",
  "Үхэр",
  "Согоо",
];
export interface Profile {
  readonly name: string;
  readonly color: number;
  readonly auto?: number;
}

const COLORS = 8;
export const MAX_NAME = 40;

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function profileFor(device: string, stored: string | null): Profile {
  const seed = hash(device);
  const name = stored?.trim().slice(0, MAX_NAME);
  const auto = seed % NAMES.length;
  return name
    ? { name, color: seed % COLORS }
    : { name: NAMES[auto]!, color: seed % COLORS, auto };
}

export function loadProfile(device: string): Profile {
  return profileFor(device, read(KEYS.collabName));
}

export function saveName(name: string): void {
  write(KEYS.collabName, name.trim().slice(0, MAX_NAME));
}
