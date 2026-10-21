import { escapeAttr } from "../core/htmlutil.ts";

export const ISSUES_URL =
  "https://github.com/bataak/dict-mn/issues?q=is%3Aissue%20label%3Auser-submitted";

export const FORM_TITLE = "Шинэ буюу алдаатай үг мэдэгдэх";
const SUBMITTED_TITLE = "Мэдэгдсэн үгс";

export const SUGGEST_HTML =
  '<div class="suggest-card" role="dialog" aria-modal="true" aria-labelledby="suggestTitle">' +
  '<h2 id="suggestTitle" class="suggest-title">Шинэ буюу алдаатай үг мэдэгдэх</h2>' +
  '<p class="suggest-hint">Шинэ үгийг үгийн санд хувиллын хамт нэмүүлэх буюу алдаа мэдээлэх</p>' +
  '<label class="suggest-label" for="suggestWord">Мэдэгдэх үг <span class="suggest-count" aria-hidden="true"></span></label>' +
  '<div class="suggest-chips"></div>' +
  '<div class="suggest-input-row">' +
  '<input id="suggestWord" class="suggest-input" type="text" maxlength="50" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
  '<button type="button" class="suggest-clear-all" hidden title="Бүгдийг устгах" aria-label="Бүгдийг устгах">&times;</button>' +
  "</div>" +
  '<label class="suggest-label" for="suggestNote">Тайлбар (заавал биш)</label>' +
  '<textarea id="suggestNote" class="suggest-input suggest-textarea" maxlength="500" rows="3"></textarea>' +
  '<div class="suggest-turnstile"></div>' +
  '<div class="suggest-submitted">' +
  '<div class="suggest-chips suggest-submitted-chips"></div>' +
  "</div>" +
  '<p class="suggest-note" aria-live="polite"></p>' +
  '<div class="suggest-actions">' +
  '<a class="tbtn suggest-issues" href="' +
  ISSUES_URL +
  '" target="_blank" rel="noopener noreferrer" title="Нийт хэрэглэгчдийн мэдэгдсэн үгс">GitHub</a>' +
  '<button type="button" class="tbtn suggest-view-submitted" title="Миний мэдэгдсэн үгс">Мэдэгдсэн үгс</button>' +
  '<button type="button" class="tbtn suggest-cancel">Цуцлах</button>' +
  '<button type="button" class="tbtn suggest-send">Илгээх</button>' +
  "</div>" +
  "</div>";

export function submittedTitle(count: number): string {
  return count
    ? SUBMITTED_TITLE +
        ' <span class="suggest-count" aria-hidden="true">(' +
        count +
        ")</span>"
    : SUBMITTED_TITLE;
}

export function submittedChips(list: readonly string[]): string {
  return list.length
    ? list
        .map(
          (word) =>
            '<span class="suggest-chip">' + escapeAttr(word) + "</span>",
        )
        .join("")
    : '<span class="suggest-hint">Одоогоор мэдэгдсэн үг алга</span>';
}

export function wordChips(words: readonly string[]): string {
  return words
    .map(
      (word, index) =>
        '<span class="suggest-chip">' +
        escapeAttr(word) +
        '<button type="button" class="suggest-chip-x" data-i="' +
        index +
        '" aria-label="Устгах">&times;</button></span>',
    )
    .join("");
}
