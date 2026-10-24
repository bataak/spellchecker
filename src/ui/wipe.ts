import { KEYS, read, write } from "../core/store.ts";
import { attempt } from "../core/attempt.ts";
const DATABASES = [
  "mn-spell",
  "mn-spell-user-dicts",
  "stardict",
  "bichig-undo",
  "bichig-tex",
  "bichig-images",
  "bichig-collab",
];
const USER_CACHES = ["tex-preview", "tex-packages"];

function wipeNow(): void {
  attempt(() => localStorage.clear(), undefined);
  attempt(() => sessionStorage.clear(), undefined);
  attempt(() => {
    for (const name of DATABASES) indexedDB.deleteDatabase(name);
    void indexedDB
      .databases?.()
      .then((list) => {
        for (const db of list)
          if (db.name && !DATABASES.includes(db.name))
            indexedDB.deleteDatabase(db.name);
      })
      .catch(() => undefined);
  }, undefined);
  attempt(() => {
    for (const name of USER_CACHES) void caches.delete(name);
  }, undefined);
}

export function confirmWipe(): void {
  const ok = window.confirm(
    "Монгол үгийн алдаа шалгагч веб аптай холбоотой бүх өгөгдөл, жишээлбэл, " +
      "бичвэрүүд, зураг, түүх, толь зэрэг нь буцаах боломжгүйгээр устах болно. " +
      "Устгах уу?",
  );
  if (ok) requestWipe();
}

const LONG_PRESS_MS = 550;

export function initWipeButton(btn: HTMLElement): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armed = false;
  btn.addEventListener("pointerdown", () => {
    armed = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      armed = true;
    }, LONG_PRESS_MS);
  });
  btn.addEventListener("pointerup", () => clearTimeout(timer));
  for (const type of ["pointercancel", "pointerleave"])
    btn.addEventListener(type, (event) => {
      clearTimeout(timer);
      if (type === "pointercancel" || (event as PointerEvent).buttons)
        armed = false;
    });
  btn.addEventListener("contextmenu", (event) => event.preventDefault());
  btn.addEventListener(
    "click",
    (event) => {
      if (!armed && !event.shiftKey) return;
      armed = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmWipe();
    },
    true,
  );
}

export function requestWipe(): void {
  if (!write(KEYS.wipe, "1")) wipeNow();
  location.reload();
}

if (read(KEYS.wipe)) wipeNow();
