import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const win = dom.window as unknown as Record<string, unknown>;
win.matchMedia = () => ({ matches: false });
const g = globalThis as Record<string, unknown>;
const posted: { survey: string; answers: Record<string, unknown> }[] = [];
g.fetch = async (_url: string, init: { body: string }) => {
  posted.push(JSON.parse(init.body));
  return { status: 201 };
};

const { initSurvey } = await import("../src/feedback/survey.ts");
const { SURVEY_QUESTIONS, SURVEY_ID } =
  await import("../src/feedback/survey-def.ts");

test.after(() => dom.close());

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const overlay = () => document.querySelector<HTMLElement>(".survey-overlay");

test("survey: шинэ хэрэглэгчид нээгдэхгүй", () => {
  resetStorage();
  const survey = initSurvey();
  survey.onErrorCount(2, true);
  survey.onErrorCount(0, true);
  assert.equal(overlay(), null);
});

test("survey: алдаа арилахад нээгдэж, дутуу бол тэмдэглэж, бүрэн бол илгээнэ", async () => {
  resetStorage();
  localStorage.setItem(
    "mn-spell:use-days",
    JSON.stringify({ days: 10, last: "2000-01-01" }),
  );
  const survey = initSurvey();
  survey.onErrorCount(3, true);
  survey.onErrorCount(0, true);
  const box = overlay()!;
  assert.equal(box.hidden, false);
  const send = box.querySelector<HTMLButtonElement>(".survey-send")!;
  send.click();
  await wait();
  assert.equal(
    box.querySelectorAll(".survey-q-missing").length,
    SURVEY_QUESTIONS.length,
  );
  assert.match(box.querySelector(".survey-note")!.textContent!, /Улаанаар/);
  for (const question of SURVEY_QUESTIONS) {
    const input = box.querySelector<HTMLInputElement>(
      'input[name="' + question.key + '"]',
    )!;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  assert.equal(box.querySelectorAll(".survey-q-missing").length, 0);
  assert.equal(box.querySelector(".survey-note")!.textContent, "");
  send.click();
  await wait(10);
  assert.equal(posted.length, 1);
  assert.equal(posted[0]!.survey, SURVEY_ID);
  assert.equal(Object.keys(posted[0]!.answers).length, SURVEY_QUESTIONS.length);
  assert.equal(send.disabled, true);
  assert.equal(localStorage.getItem("mn-spell:survey-done:" + SURVEY_ID), "1");
  await wait(1500);
  assert.equal(box.hidden, true);
});

test("survey: татгалзвал дахин нээгдэхгүй", () => {
  resetStorage();
  localStorage.setItem(
    "mn-spell:use-days",
    JSON.stringify({ days: 10, last: "2000-01-01" }),
  );
  const survey = initSurvey();
  survey.onErrorCount(1, true);
  survey.onErrorCount(0, true);
  const box = [...document.querySelectorAll<HTMLElement>(".survey-overlay")].at(
    -1,
  )!;
  box.querySelector<HTMLElement>(".survey-decline")!.click();
  assert.equal(box.hidden, true);
  survey.onErrorCount(1, true);
  survey.onErrorCount(0, true);
  assert.equal(box.hidden, true);
});
