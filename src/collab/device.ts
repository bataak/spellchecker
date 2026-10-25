import { KEYS, read, write } from "../core/store.ts";
import { randomId } from "./collabkey.ts";
import { loadProfile, type Profile } from "./profile.ts";

const DEVICE = /^[A-Za-z0-9_-]{16}$/;

export function needsHomeScreen(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios =
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return (
    ios &&
    nav.standalone !== true &&
    !window.matchMedia?.("(display-mode: standalone)").matches
  );
}

export function deviceId(): string {
  const stored = read(KEYS.collabDevice);
  if (stored && DEVICE.test(stored)) return stored;
  const id = randomId(12);
  write(KEYS.collabDevice, id);
  return id;
}

export function myProfile(): Profile {
  return loadProfile(deviceId());
}
