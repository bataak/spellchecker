const FLAG = "mn-spell:wipe";
const DATABASES = [
  "mn-spell",
  "mn-spell-user-dicts",
  "stardict",
  "bichig-undo",
  "bichig-tex",
  "bichig-images",
];
const USER_CACHES = ["tex-preview", "tex-packages"];

function wipeNow(): void {
  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  try {
    for (const name of DATABASES) indexedDB.deleteDatabase(name);
    void indexedDB
      .databases?.()
      .then((list) => {
        for (const db of list)
          if (db.name && !DATABASES.includes(db.name))
            indexedDB.deleteDatabase(db.name);
      })
      .catch(() => undefined);
  } catch {}
  try {
    for (const name of USER_CACHES) void caches.delete(name);
  } catch {}
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
  for (const type of ["pointerup", "pointercancel", "pointerleave"])
    btn.addEventListener(type, () => clearTimeout(timer));
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
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    wipeNow();
  }
  location.reload();
}

try {
  if (sessionStorage.getItem(FLAG)) wipeNow();
} catch {}
