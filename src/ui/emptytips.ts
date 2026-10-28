import { KEYS, read, type StoreKey, write as store } from "../core/store.ts";
const INFO_TIPS = [
  "Улаанаар зурагдсан үг бүрийг алдаанд тооцож болохгүй, энэ нь үгийн алдаа шалгах толинд хараахан бүртгэгдээгүй байж болно.",
  "Алдсан үгэн дээр заагчаар дарахад гарах үгийн зөв бичлэг нь оновчгүй байж болохыг мөн анхаарна уу!",
  "Бичвэр сервер уруу илгээгдэхгүй, зөвхөн таны төхөөрөмж дээр хадгалагдаж боловсруулагдана.",
  "Веб ап анх удаа ажиллахдаа интернет шаардана, бусад үед офлайн горимд ажиллана.",
  "Веб апыг утас болон компьютерт офлайн ап болгон суулгаж ашиглах боломжтой.",
  "Word, PowerPoint файлуудын үгийн алдааг шалгаж засварлах боломжтой.",
];

const MAC = /mac|iphone|ipad/i.test(navigator.platform);

const KEYBOARD_TIPS = [
  "Ctrl+\\ товчлуурын хослолоор монгол, англи гарын байрлалыг сэлгэн ашиглах боломжтой.",
  `${MAC ? "⌘⇧" : "Ctrl+Shift"} товчийг дарсан чигтээ заагчийг үгэн дээр аваачихад тухайн үгийн тайлбар гарч ирнэ.`,
];

if (matchMedia("(hover: hover) and (pointer: fine)").matches)
  INFO_TIPS.push(...KEYBOARD_TIPS);

const ACTION_TIPS = [
  "Үг мэдэгдэх холбоосыг ашиглан шинэ болон алдаатай үгийг бидэнд илгээж, толийг баяжуулахад туслаарай.",
  "Ап ашиглах заавар: https://zuv.bichig.dev/online-app/",
  "Word, Excel файл шалгах заавар: https://zuv.bichig.dev/libreoffice/",
  "LaTeX файл шалгах заавар: https://zuv.bichig.dev/texstudio/",
  "Монгол үсгийн дүрмийн толь: https://zuv.bichig.dev/book/",
];

function pick(list: string[], key: StoreKey): string {
  const raw = read(key);
  const last = raw === null ? -1 : parseInt(raw, 10);
  let tipIndex = Math.floor(Math.random() * list.length);
  if (list.length > 1 && tipIndex === last)
    tipIndex = (tipIndex + 1) % list.length;
  store(key, String(tipIndex));
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

export interface EmptyTipEls {
  readonly info: HTMLElement | null;
  readonly action: HTMLElement | null;
}

export interface EmptyTips {
  rotate(): void;
  sync(isEmpty: boolean): void;
}

export function createEmptyTips({ info, action }: EmptyTipEls): EmptyTips {
  const els = [info, action].filter((el): el is HTMLElement => el !== null);
  let wasEmpty: boolean | null = null;
  let swapTimer: ReturnType<typeof setTimeout> | null = null;

  const write = (): void => {
    if (info) renderTip(info, pick(INFO_TIPS, KEYS.tipInfo));
    if (action) renderTip(action, pick(ACTION_TIPS, KEYS.tipAction));
  };

  function apply(animate: boolean): void {
    if (els.length === 0) return;
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

  apply(false);
  return {
    rotate() {
      apply(true);
      wasEmpty = true;
    },
    sync(isEmpty) {
      if (isEmpty && wasEmpty === false) apply(true);
      wasEmpty = isEmpty;
    },
  };
}
