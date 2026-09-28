import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFICE_METRICS, columnWidths } from "../src/office/table.ts";

const cell = (text: string) => [{ text }];

test("оффисын хүснэгтийн толгой нэг мөрөнд багтах өргөнтэй", () => {
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
