const INFO_TIPS = [
  "Улаанаар зурагдсан үг бүрийг алдаанд тооцож болохгүй, энэ нь үгийн алдаа шалгах толинд хараахан бүртгэгдээгүй байж болно.",
  "Алдсан үгэн дээр заагчаар дарахад гарах үгийн зөв бичлэг нь оновчгүй байж болохыг мөн анхаарна уу!",
  "Бичвэр сервер уруу илгээгдэхгүй, зөвхөн таны төхөөрөмж дээр хадгалагдаж боловсруулагдана.",
  "Веб ап анх удаа ажиллахдаа интернет шаардана, бусад үед офлайн горимд ажиллана.",
  "Веб апыг утас болон компьютерт офлайн ап болгон суулгаж ашиглах боломжтой.",
  "Word, PowerPoint файлуудын үгийн алдааг шалгаж засварлах боломжтой.",
];

const ACTION_TIPS = [
  "Үг мэдэгдэх холбоосыг ашиглан шинэ болон алдаатай үгийг бидэнд илгээж, толийг баяжуулахад туслаарай.",
  "Ап ашиглах заавар: https://zuv.bichig.dev/online-app/",
  "Word, Excel файл шалгах заавар: https://zuv.bichig.dev/libreoffice/",
  "LaTeX файл шалгах заавар: https://zuv.bichig.dev/texstudio/",
  "Монгол үсгийн дүрмийн толь: https://zuv.bichig.dev/book/",
];

const KEY_INFO = "mn-spell:tip-info";
const KEY_ACTION = "mn-spell:tip-action";

let wasEmpty: boolean | null = null;
let swapTimer: ReturnType<typeof setTimeout> | null = null;

function pick(list: string[], key: string): string {
  let last = -1;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) last = parseInt(raw, 10);
  } catch (_) {}
  let tipIndex = Math.floor(Math.random() * list.length);
  if (list.length > 1 && tipIndex === last)
    tipIndex = (tipIndex + 1) % list.length;
  try {
    localStorage.setItem(key, String(tipIndex));
  } catch (_) {}
  return list[tipIndex]!;
}

function renderTip(el: HTMLElement, text: string): void {
  el.textContent = "";
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (!urlMatch || urlMatch.index == null) {
    el.textContent = text;
    return;
  }
  el.append(text.slice(0, urlMatch.index));
  const url = document.createElement("span");
  url.className = "empty-url";
  url.textContent = urlMatch[0];
  el.append(url);
  const rest = text.slice(urlMatch.index + urlMatch[0].length);
  if (rest) el.append(rest);
}

function apply(animate: boolean): void {
  const info = document.querySelector<HTMLElement>("#emptyNoteInfo");
  const action = document.querySelector<HTMLElement>("#emptyNoteAction");
  const els = [info, action].filter((el): el is HTMLElement => el !== null);
  if (els.length === 0) return;
  const write = () => {
    if (info) renderTip(info, pick(INFO_TIPS, KEY_INFO));
    if (action) renderTip(action, pick(ACTION_TIPS, KEY_ACTION));
  };
  if (!animate) {
    write();
    return;
  }
  for (const el of els) el.classList.add("tip-swap");
  if (swapTimer) clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    write();
    for (const el of els) el.classList.remove("tip-swap");
  }, 160);
}

export function rotateEmptyTips(): void {
  apply(true);
  wasEmpty = true;
}

export function syncEmptyTips(isEmpty: boolean): void {
  if (isEmpty && wasEmpty === false) apply(true);
  wasEmpty = isEmpty;
}

apply(false);
