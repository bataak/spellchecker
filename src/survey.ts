import { escapeHtml } from "./htmlutil.ts";
import {
  SURVEY_ID,
  SURVEY_TITLE,
  SURVEY_INTRO,
  NOTES_TITLE,
  SURVEY_QUESTIONS,
} from "./survey-def.ts";

const ENDPOINT = "https://api.bichig.dev/survey";
const DONE_KEY = "mn-spell:survey-done:" + SURVEY_ID;
const TRIGGER_BUTTONS = "#copyBtn, #copyErrorsBtn, #saveBtn, #clearBtn";

let overlay: HTMLDivElement | null = null;
let busy = false;
let prevErrorCount = 0;

function isDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch (_) {
    return true;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch (_) {}
}

function detectUa(): { os: string; browser: string; device: string } {
  const ua = navigator.userAgent || "";
  const coarse =
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const device = coarse ? "гар утас/таблет" : "компьютер";
  let os = "бусад";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Mac/.test(ua) && navigator.maxTouchPoints > 1)
  )
    os = "iOS/iPadOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  let browser = "бусад";
  if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  return { os, browser, device };
}

function note(msg: string, kind?: string): void {
  const el = overlay!.querySelector<HTMLElement>(".survey-note")!;
  el.textContent = msg;
  el.dataset.kind = kind || "";
}

function collectAnswers(): {
  answers: Record<string, string | string[]>;
  notes: string;
} {
  const answers: Record<string, string | string[]> = {};
  for (const question of SURVEY_QUESTIONS) {
    const checked = [
      ...overlay!.querySelectorAll<HTMLInputElement>(
        'input[name="' + question.key + '"]:checked',
      ),
    ];
    if (!checked.length) continue;
    answers[question.key] = question.multi
      ? checked.map((input) => input.value)
      : checked[0].value;
  }
  const notes = overlay!
    .querySelector<HTMLTextAreaElement>("#surveyNotes")!
    .value.trim();
  return { answers, notes };
}

function syncSend(): void {
  const sendBtn = overlay!.querySelector<HTMLButtonElement>(".survey-send")!;
  sendBtn.disabled = busy;
}

function close(): void {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
}

function questionHtml(): string {
  return SURVEY_QUESTIONS.map((question) => {
    const type = question.multi ? "checkbox" : "radio";
    const options = question.options
      .map(
        (option) =>
          '<label class="survey-opt"><input type="' +
          type +
          '" name="' +
          question.key +
          '" value="' +
          escapeHtml(option) +
          '" /><span>' +
          escapeHtml(option) +
          "</span></label>",
      )
      .join("");
    return (
      '<fieldset class="survey-q" data-key="' +
      question.key +
      '"><legend class="suggest-label">' +
      escapeHtml(question.title) +
      "</legend>" +
      options +
      "</fieldset>"
    );
  }).join("");
}

function build(): void {
  overlay = document.createElement("div");
  overlay.className = "suggest-overlay survey-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="suggest-card survey-card" role="dialog" aria-modal="true" aria-labelledby="surveyTitle">' +
    '<h2 id="surveyTitle" class="suggest-title">' +
    escapeHtml(SURVEY_TITLE) +
    "</h2>" +
    '<p class="suggest-hint">' +
    escapeHtml(SURVEY_INTRO) +
    "</p>" +
    questionHtml() +
    '<label class="suggest-label" for="surveyNotes">' +
    escapeHtml(NOTES_TITLE) +
    "</label>" +
    '<textarea id="surveyNotes" class="suggest-input suggest-textarea" maxlength="1000" rows="3"></textarea>' +
    '<p class="suggest-note survey-note" aria-live="polite"></p>' +
    '<div class="suggest-actions">' +
    '<button type="button" class="tbtn survey-decline">Татгалзах</button>' +
    '<button type="button" class="tbtn survey-send">Илгээх</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(overlay);

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("change", (e) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && input.name) {
      const fieldset = input.closest(".survey-q");
      if (fieldset) fieldset.classList.remove("survey-q-missing");
    }
    const noteEl = overlay!.querySelector<HTMLElement>(".survey-note")!;
    if (noteEl.dataset.kind === "err") note("");
  });
  overlay.querySelector(".survey-decline")!.addEventListener("click", () => {
    markDone();
    close();
  });
  overlay.querySelector(".survey-send")!.addEventListener("click", submit);

  document.addEventListener("keydown", (e) => {
    if (!overlay || overlay.hidden) return;
    if (e.key === "Escape") close();
  });
}

function maybeOpen(): void {
  if (isDone()) return;
  if (!navigator.onLine) return;
  if (overlay && !overlay.hidden) return;
  if (!overlay) build();
  syncSend();
  overlay!.hidden = false;
}

async function submit(): Promise<void> {
  if (busy) return;
  const { answers, notes } = collectAnswers();
  const missing = SURVEY_QUESTIONS.filter(
    (question) => !(question.key in answers),
  );
  for (const question of SURVEY_QUESTIONS) {
    const fieldset = overlay!.querySelector(
      '.survey-q[data-key="' + question.key + '"]',
    );
    if (!fieldset) continue;
    fieldset.classList.toggle("survey-q-missing", !(question.key in answers));
  }
  if (missing.length) {
    note("Улаанаар тэмдэглэсэн асуултад хариулна уу", "err");
    overlay!
      .querySelector(".survey-q-missing")!
      .scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (!navigator.onLine) {
    note("Сүлжээгүй байна — холбогдсоны дараа дахин оролдоно уу", "err");
    return;
  }
  busy = true;
  syncSend();
  note("Илгээж байна…");
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        survey: SURVEY_ID,
        answers,
        notes,
        ua: detectUa(),
      }),
    });
    if (response.status === 201) {
      markDone();
      note("Илгээгдлээ, баярлалаа!", "ok");
      setTimeout(close, 1400);
    } else if (response.status === 429) {
      note("Цагийн хязгаарт хүрлээ — дараа дахин оролдоно уу", "err");
    } else {
      note("Илгээхэд алдаа гарлаа — дахин оролдоно уу", "err");
    }
  } catch (_) {
    note("Сүлжээний алдаа — дахин оролдоно уу", "err");
  } finally {
    busy = false;
    syncSend();
  }
}

export function surveyOnErrorCount(count: number, hasText: boolean): void {
  const prev = prevErrorCount;
  prevErrorCount = hasText ? count : 0;
  if (!hasText) return;
  if (prev > 0 && count === 0) maybeOpen();
}

export function initSurvey(): void {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLButtonElement>(TRIGGER_BUTTONS);
      if (!btn || btn.disabled) return;
      const editor = document.querySelector<HTMLTextAreaElement>("#editor");
      if (!editor || editor.value.trim() === "") return;
      maybeOpen();
    },
    true,
  );
}
