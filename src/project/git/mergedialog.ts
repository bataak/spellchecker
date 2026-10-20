import { PROVIDER_NAME, type Provider } from "./githost.ts";
import type { MergeAnswer, MergeItem } from "./gitsync.ts";
import type { Pick } from "./merge3.ts";
import { showForm, type Field } from "./form.ts";

function versions(
  ours: readonly string[],
  theirs: readonly string[],
  theirName: string,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "git-versions";
  for (const [title, lines] of [
    ["Минийх", ours],
    [theirName, theirs],
  ] as const) {
    const side = document.createElement("div");
    side.className = "git-version";
    const head = document.createElement("span");
    head.className = "git-version-title";
    head.textContent = title;
    const body = document.createElement("pre");
    body.className = "git-version-text";
    body.textContent = lines.length ? lines.join("\n") : "(хоосон)";
    side.append(head, body);
    box.append(side);
  }
  return box;
}

const STATE_TEXT = { changed: "өөрчилсөн", deleted: "устгасан" } as const;

export function askMerge(
  items: readonly MergeItem[],
  provider: Provider,
): Promise<MergeAnswer | null> {
  const theirName = PROVIDER_NAME[provider] + "-ийн";
  const fields: Field[] = [];
  for (const item of items) {
    if (item.kind === "file") {
      const detail = document.createElement("p");
      detail.className = "git-note";
      detail.textContent =
        "Минийх: " +
        STATE_TEXT[item.ours] +
        " · " +
        theirName +
        ": " +
        STATE_TEXT[item.theirs];
      fields.push({
        name: item.path,
        label: item.path,
        kind: "select",
        value: "ours",
        detail,
        options: [
          ["ours", "Миний хувилбар"],
          ["theirs", theirName + " хувилбар"],
        ],
      });
      continue;
    }
    item.conflicts.forEach((conflict, index) => {
      fields.push({
        name: item.path + "#" + index,
        label:
          item.conflicts.length > 1
            ? item.path + " — " + (index + 1) + "-р зөрчил"
            : item.path,
        kind: "select",
        value: "ours",
        detail: versions(conflict.ours, conflict.theirs, theirName),
        options: [
          ["ours", "Минийх"],
          ["theirs", theirName],
          ["both", "Хоёулаа (минийх, дараа нь " + theirName + ")"],
        ],
      });
    });
  }
  const note = document.createElement("p");
  note.className = "git-note";
  note.textContent =
    "Repo дээр эдгээр хэсгийг өөр газраас өөрчилсөн байна. Хэсэг бүрд аль хувилбарыг үлдээхийг сонгоно уу.";
  return showForm(
    {
      title: "Зөрчлийг шийдвэрлэх",
      confirm: "Нэгтгэж commit хийх",
      wide: true,
      note,
      fields,
    },
    (values) => {
      const answer = new Map<string, readonly Pick[] | "ours" | "theirs">();
      for (const item of items) {
        if (item.kind === "file") {
          answer.set(
            item.path,
            values[item.path] === "theirs" ? "theirs" : "ours",
          );
          continue;
        }
        answer.set(
          item.path,
          item.conflicts.map((_, index) => {
            const value = values[item.path + "#" + index];
            return value === "theirs" || value === "both" ? value : "ours";
          }),
        );
      }
      return answer;
    },
  );
}
