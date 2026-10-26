import { element } from "../ui/dom.ts";
import { actionButton } from "./dialogparts.ts";

export type ClearChoice = "keep" | "wipe" | null;

export const CLEAR_SHARED =
  "Энэ бичвэрийг хамтрагчидтай хуваалцаж байна. Цэвэрлэхэд хамтын засвар бүх хүнд зогсоно. Хамтрагчдын төхөөрөмж дээрх хуулбарыг устгах уу?";

export function askClearShared(): Promise<ClearChoice> {
  const dialog = element("dialog", "suggest-overlay collab-overlay");
  dialog.setAttribute("aria-labelledby", "clearSharedTitle");
  const card = element("div", "suggest-card");
  const title = element("h2", "suggest-title", "Хуваалцсан бичвэрийг цэвэрлэх");
  title.id = "clearSharedTitle";
  const text = element("p", "suggest-hint", CLEAR_SHARED);
  const row = element("div", "suggest-actions");
  const back = actionButton("Болих");
  const keep = actionButton("Хуулбарыг үлдээх");
  const wipe = actionButton("Бүрмөсөн устгах");
  wipe.classList.add("collab-wipe");
  row.append(back, keep, wipe);
  card.append(title, text, row);
  dialog.append(card);
  document.body.append(dialog);
  return new Promise((resolve) => {
    let choice: ClearChoice = null;
    const pick = (next: ClearChoice) => () => {
      choice = next;
      dialog.close();
    };
    back.addEventListener("click", pick(null));
    keep.addEventListener("click", pick("keep"));
    wipe.addEventListener("click", pick("wipe"));
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(choice);
    });
    dialog.showModal();
    back.focus();
  });
}
