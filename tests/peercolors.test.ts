import { test } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_COLORS, CURSOR_HUES } from "../src/collab/peercolors.ts";

const channels = (hex: string): number[] =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
};

const lab = (hex: string): [number, number, number] => {
  const [r, g, b] = channels(hex) as [number, number, number];
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

test("хамтрагчийн өнгө хоёр дэвсгэр дээр тод, цагаан бичиг уншигдана", () => {
  assert.equal(CURSOR_COLORS.length, 8);
  for (const color of CURSOR_COLORS) {
    assert.ok(contrast(color, "#f7f4ee") >= 3, color);
    assert.ok(contrast(color, "#17150f") >= 3, color);
    assert.ok(contrast(color, "#ffffff") >= 3, color);
  }
});

test("хамтрагчийн өнгө хоорондоо тод ялгагдана", () => {
  let least = Infinity;
  for (let i = 0; i < CURSOR_COLORS.length; i++)
    for (let j = i + 1; j < CURSOR_COLORS.length; j++) {
      const [a, b] = [lab(CURSOR_COLORS[i]!), lab(CURSOR_COLORS[j]!)];
      least = Math.min(
        least,
        Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
      );
    }
  assert.ok(least >= 25, String(least));
});

test("хамтрагчийн өнгө эсрэг хосуудаас бүрдэнэ", () => {
  assert.equal(CURSOR_HUES.length, CURSOR_COLORS.length);
  for (let i = 0; i < CURSOR_HUES.length; i += 2)
    assert.equal((CURSOR_HUES[i]! + 180) % 360, CURSOR_HUES[i + 1]);
});
