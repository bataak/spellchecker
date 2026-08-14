import { test } from "node:test";
import assert from "node:assert/strict";
import { countLines, markedHtml, plainHtml } from "../src/backdrop.ts";
import type { Token } from "../src/textcheck.ts";

function blocks(html: string): number {
  return (html.match(/<div class="bl">/g) ?? []).length;
}

function unwrap(html: string): string {
  return html
    .replace(/<div class="bl">/g, "")
    .replace(/<\/div>/g, "\n")
    .replace(/<mark data-start="\d+">/g, "")
    .replace(/<\/mark>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\u200B/g, "")
    .replace(/\n$/, "");
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomText(random: () => number, lines: number): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    if (random() < 0.3) {
      out.push("");
      continue;
    }
    const words: string[] = [];
    const count = 1 + Math.floor(random() * 14);
    for (let w = 0; w < count; w++) {
      const pick = random();
      if (pick < 0.1) words.push("<");
      else if (pick < 0.15) words.push("&");
      else words.push("үг".repeat(1 + Math.floor(random() * 12)));
    }
    out.push(words.join(" "));
  }
  return out.join("\n");
}

function randomMarks(random: () => number, text: string): Token[] {
  const marks: Token[] = [];
  const re = /[^\s]+/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (random() < 0.3) {
      marks.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return marks;
}

test("markedHtml нь plainHtml-тэй ижил тооны блок гаргана", () => {
  const random = lcg(23);
  for (let iteration = 0; iteration < 400; iteration++) {
    const raw = randomText(random, 1 + Math.floor(random() * 12));
    const marks = randomMarks(random, raw);
    if (!marks.length) continue;
    assert.equal(
      blocks(markedHtml(raw, 0, marks)),
      blocks(plainHtml(raw)),
      "давталт " + iteration,
    );
  }
});

test("тэмдэглэгээ эх текстийг өөрчлөхгүй", () => {
  const random = lcg(31);
  for (let iteration = 0; iteration < 400; iteration++) {
    const raw = randomText(random, 1 + Math.floor(random() * 30));
    const marks = randomMarks(random, raw);
    const body = raw.replace(/\n$/, "");
    assert.equal(unwrap(markedHtml(raw, 0, marks)), body, "давталт " + iteration);
    assert.equal(unwrap(plainHtml(raw)), body, "давталт " + iteration);
  }
});

test("хэсгийн төгсгөлийн \\n нэмэлт блок үүсгэхгүй", () => {
  const random = lcg(47);
  for (let iteration = 0; iteration < 200; iteration++) {
    const base = randomText(random, 1 + Math.floor(random() * 20)).replace(
      /\n+$/,
      "",
    );
    assert.equal(
      blocks(plainHtml(base + "\n")),
      blocks(plainHtml(base)),
      "давталт " + iteration,
    );
    assert.equal(countLines(base + "\n"), countLines(base));
  }
});

test("мөрийн эхэн ба төгсгөлийн тэмдэглэгээ", () => {
  const raw = "аав ээж\nахуй";
  const marks: Token[] = [
    { word: "аав", start: 0, end: 3 },
    { word: "ээж", start: 4, end: 7 },
    { word: "ахуй", start: 8, end: 12 },
  ];
  const html = markedHtml(raw, 0, marks);
  assert.equal(blocks(html), 2);
  assert.equal(unwrap(html), raw);
  assert.equal((html.match(/<mark /g) ?? []).length, 3);
});

test("хоосон мөрөнд тэмдэглэгээ орохгүй", () => {
  const raw = "аав\n\nээж";
  const marks: Token[] = [
    { word: "аав", start: 0, end: 3 },
    { word: "ээж", start: 5, end: 8 },
  ];
  const html = markedHtml(raw, 0, marks);
  assert.equal(blocks(html), 3);
  assert.ok(html.includes('<div class="bl"></div>'));
});

test("HTML тусгай тэмдэгтүүд escape хийгдэнэ", () => {
  const raw = "a < b & c";
  const marks: Token[] = [{ word: "c", start: 8, end: 9 }];
  const html = markedHtml(raw, 0, marks);
  assert.ok(html.includes("&lt;"));
  assert.ok(html.includes("&amp;"));
  assert.equal(unwrap(html), raw);
});

test("тэмдэглэгээ chunkStart-аар зөв шилжинэ", () => {
  const text = "нэг\nхоёр\nгурав";
  const chunkStart = 4;
  const raw = text.slice(chunkStart);
  const marks: Token[] = [{ word: "гурав", start: 9, end: 14 }];
  const html = markedHtml(raw, chunkStart, marks);
  assert.equal(unwrap(html), raw);
  assert.ok(html.includes('<mark data-start="9">гурав</mark>'));
});

test("олон мөрөнд тархсан тэмдэглэгээ", () => {
  const raw = "нэг хоёр\nгурав дөрөв\n\nтав";
  const marks: Token[] = [
    { word: "хоёр", start: 4, end: 8 },
    { word: "гурав", start: 9, end: 14 },
    { word: "тав", start: 22, end: 25 },
  ];
  const html = markedHtml(raw, 0, marks);
  assert.equal(blocks(html), 4);
  assert.equal(unwrap(html), raw);
  assert.equal((html.match(/<mark /g) ?? []).length, 3);
});

test("мөр давсан тэмдэглэгээ мөр бүрт тасарна", () => {
  const raw = "аав\nээж";
  const marks: Token[] = [{ word: "аав\nээж", start: 0, end: 7 }];
  const html = markedHtml(raw, 0, marks);
  assert.equal(blocks(html), 2);
  assert.equal(unwrap(html), raw);
  assert.equal((html.match(/<mark /g) ?? []).length, 2);
  assert.ok(!html.includes("\n</mark>"));
});

test("countLines нь хэсгийн төгсгөлийн \\n-ийг тоохгүй", () => {
  assert.equal(countLines(""), 1);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\n"), 1);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("\n"), 1);
  assert.equal(countLines("\n\n"), 2);
});
