import { SURVEY_ID } from "./survey-def.ts";
import { KEYS, at, read, readJson, write, writeJson } from "../core/store.ts";
import { createSurveyForm } from "./surveyform.ts";

const DONE_KEY = at(KEYS.surveyDone, SURVEY_ID);
const TRIGGER_BUTTONS = "#copyBtn, #copyErrorsBtn, #saveBtn, #clearBtn";

const OPEN_DELAY_MS = 30000;
const IDLE_GAP_MS = 8000;
const OFFLINE_RETRY_MS = 60000;
const MIN_USE_DAYS = 7;

function isDone(): boolean {
  return read(DONE_KEY) === "1";
}

function markDone(): void {
  write(DONE_KEY, "1");
}

function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

export interface Survey {
  readonly onErrorCount: (count: number, hasText: boolean) => void;
}

export function initSurvey(editor: HTMLTextAreaElement): Survey {
  const form = createSurveyForm(markDone);
  let usedDays = 0;
  let lastUsedDate = "";
  let prevErrorCount = 0;
  let idleTimer: number | null = null;
  let lastActivity = 0;

  function loadUseDays(): void {
    const parsed = readJson(KEYS.useDays);
    if (typeof parsed !== "object" || parsed === null) return;
    const record = parsed as { days?: unknown; last?: unknown };
    if (typeof record.days === "number" && Number.isFinite(record.days))
      usedDays = record.days;
    if (typeof record.last === "string") lastUsedDate = record.last;
  }

  function markUsedToday(): void {
    const today = localDate();
    if (today === lastUsedDate) return;
    lastUsedDate = today;
    usedDays += 1;
    writeJson(KEYS.useDays, { days: usedDays, last: today });
  }

  const isTooNew = (): boolean => usedDays < MIN_USE_DAYS;
  const settled = (): boolean =>
    isTooNew() || isDone() || form.sent() || form.isOpen();

  function maybeOpen(): void {
    if (settled() || !navigator.onLine) return;
    form.open();
  }

  function recordActivity(): void {
    lastActivity = Date.now();
  }

  function scheduleOpen(delay: number): void {
    if (idleTimer !== null) return;
    idleTimer = window.setTimeout(tryIdleOpen, delay);
  }

  function tryIdleOpen(): void {
    idleTimer = null;
    if (settled()) return;
    if (!navigator.onLine) {
      scheduleOpen(OFFLINE_RETRY_MS);
      return;
    }
    if (Date.now() - lastActivity < IDLE_GAP_MS) {
      scheduleOpen(IDLE_GAP_MS);
      return;
    }
    maybeOpen();
  }

  function onErrorCount(count: number, hasText: boolean): void {
    const prev = prevErrorCount;
    prevErrorCount = hasText ? count : 0;
    if (!hasText) return;
    markUsedToday();
    recordActivity();
    if (isTooNew()) return;
    if (!isDone()) scheduleOpen(OPEN_DELAY_MS);
    if (prev > 0 && count === 0) maybeOpen();
  }

  loadUseDays();

  window.addEventListener("scroll", recordActivity, {
    capture: true,
    passive: true,
  });
  window.addEventListener("touchmove", recordActivity, { passive: true });
  window.addEventListener("wheel", recordActivity, { passive: true });

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLButtonElement>(TRIGGER_BUTTONS);
      if (!btn || btn.disabled) return;
      if (editor.value.trim() === "") return;
      maybeOpen();
    },
    true,
  );

  return { onErrorCount };
}
