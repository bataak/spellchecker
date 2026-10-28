import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFICE_METRICS, columnWidths } from "../src/office/table.ts";

const cell = (text: string) => [{ text }];

test("офисын хүснэгтийн толгой нэг мөрөнд багтах өргөнтэй", () => {
  const rows = [
    [cell("Машин"), cell("Ажилласан өдөр"), cell("Ашиглалт")],
    [cell("№1"), cell("54"), cell("90%")],
  ];
  const widths = columnWidths(rows, true, 16.5, OFFICE_METRICS);
  const head = rows[0]!.map((runs) =>
    OFFICE_METRICS.width(runs[0]!.text, true),
  );
  widths.forEach((width, i) => assert.ok(width > head[i]! + 0.2, String(i)));
});

test("тод үсэг энгийнээс өргөн хэмжигдэнэ", () => {
  assert.ok(
    OFFICE_METRICS.width("Машин", true) > OFFICE_METRICS.width("Машин", false),
  );
});

test("зай хүрэлцвэл урт нүдийг мөр таслахгүй", () => {
  const long = "Захирлын зөвлөлийн хурал, 2026.09.28 (№ 06)";
  const rows = [[cell("Танилцуулсан:"), cell(long)]];
  const widths = columnWidths(rows, false, 16.5, OFFICE_METRICS);
  assert.ok(widths[1]! > OFFICE_METRICS.width(long, false));
});

test("tableShare ба stretchWidths: хувиар заасан өргөнд багануудыг харьцаагаар сунгана", async () => {
  const { stretchWidths, tableShare } = await import("../src/office/table.ts");
  assert.equal(tableShare("100%"), 1);
  assert.equal(tableShare("62.5%"), 0.625);
  assert.equal(tableShare("150%"), 1);
  for (const bad of [undefined, "", "100", "0%", "wide"])
    assert.equal(tableShare(bad), null, String(bad));
  assert.deepEqual(stretchWidths([1, 3], 8), [2, 6]);
  assert.deepEqual(stretchWidths([4, 6], 8), [4, 6]);
  assert.deepEqual(stretchWidths([1, 3], 0), [1, 3]);
});
