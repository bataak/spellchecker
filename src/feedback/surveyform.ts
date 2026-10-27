import { requireEl } from "../ui/dom.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import {
  SURVEY_ID,
  SURVEY_TITLE,
  SURVEY_INTRO,
  NOTES_TITLE,
  SURVEY_QUESTIONS,
} from "./survey-def.ts";
import { OFFLINE, SENT, sendFailure } from "./suggestsend.ts";

const ENDPOINT = "https://api.bichig.dev/survey";

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

const SURVEY_HTML = () =>
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

type Answers = Record<string, string | string[]>;

function collectAnswers(overlay: HTMLElement): {
  answers: Answers;
  notes: string;
} {
  const answers: Answers = {};
  for (const question of SURVEY_QUESTIONS) {
    const checked = [
      ...overlay.querySelectorAll<HTMLInputElement>(
        'input[name="' + question.key + '"]:checked',
      ),
    ];
    if (!checked.length) continue;
    answers[question.key] = question.multi
      ? checked.map((input) => input.value)
      : checked[0].value;
  }
  const notes = requireEl<HTMLTextAreaElement>(
    "#surveyNotes",
    overlay,
  ).value.trim();
  return { answers, notes };
}

function markMissing(overlay: HTMLElement, answers: Answers): boolean {
  let missing = false;
  for (const question of SURVEY_QUESTIONS) {
    const absent = !(question.key in answers);
    missing ||= absent;
    overlay
      .querySelector('.survey-q[data-key="' + question.key + '"]')
      ?.classList.toggle("survey-q-missing", absent);
  }
  return missing;
}

async function postSurvey(answers: Answers, notes: string): Promise<string> {
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
    return response.status === 201 ? "" : sendFailure(response.status);
  } catch {
    return sendFailure(null);
  }
}

export interface SurveyForm {
  open(): void;
  isOpen(): boolean;
  sent(): boolean;
}

export function createSurveyForm(onDone: () => void): SurveyForm {
  let overlay: HTMLDivElement | null = null;
  let busy = false;
  let sent = false;

  function note(msg: string, kind?: string): void {
    const el = requireEl<HTMLElement>(".survey-note", overlay!);
    el.textContent = msg;
    el.dataset.kind = kind || "";
  }

  function syncSend(): void {
    requireEl<HTMLButtonElement>(".survey-send", overlay!).disabled =
      busy || sent;
  }

  function close(): void {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
  }

  async function submit(): Promise<void> {
    if (busy || sent) return;
    const { answers, notes } = collectAnswers(overlay!);
    if (markMissing(overlay!, answers)) {
      note("Улаанаар тэмдэглэгдсэн асуултад хариулна уу", "err");
      requireEl(".survey-q-missing", overlay!).scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      return;
    }
    if (!navigator.onLine) {
      note(OFFLINE, "err");
      return;
    }
    busy = true;
    syncSend();
    note("Илгээж байна…");
    const failure = await postSurvey(answers, notes);
    if (failure) note(failure, "err");
    else {
      sent = true;
      onDone();
      note(SENT, "ok");
      setTimeout(close, 1400);
    }
    busy = false;
    syncSend();
  }

  function build(): HTMLDivElement {
    const box = document.createElement("div");
    box.className = "suggest-overlay survey-overlay";
    box.hidden = true;
    box.innerHTML = SURVEY_HTML();
    document.body.appendChild(box);
    box.addEventListener("pointerdown", (e) => {
      if (e.target === box) close();
    });
    box.addEventListener(
      "touchmove",
      (e) => {
        if (e.target === box) e.preventDefault();
      },
      { passive: false },
    );
    box.addEventListener("change", (e) => {
      const input = e.target;
      if (input instanceof HTMLInputElement && input.name)
        input.closest(".survey-q")?.classList.remove("survey-q-missing");
      const noteEl = requireEl<HTMLElement>(".survey-note", box);
      if (noteEl.dataset.kind === "err") note("");
    });
    requireEl(".survey-decline", box).addEventListener("click", () => {
      if (busy) return;
      onDone();
      close();
    });
    requireEl(".survey-send", box).addEventListener("click", submit);
    document.addEventListener("keydown", (e) => {
      if (!box.hidden && e.key === "Escape") close();
    });
    return box;
  }

  return {
    open() {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      overlay ??= build();
      syncSend();
      overlay.hidden = false;
    },
    isOpen: () => !!overlay && !overlay.hidden,
    sent: () => sent,
  };
}
