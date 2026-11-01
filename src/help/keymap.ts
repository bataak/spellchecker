import { escapeHtml } from "../core/htmlutil.ts";

export type Key = "Mod" | "Shift" | "Alt" | "Ctrl" | (string & {});

export interface Shortcut {
  readonly keys: readonly (readonly Key[])[];
  readonly action: string;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly items: readonly Shortcut[];
}

export const KEYMAP: readonly ShortcutGroup[] = [
  {
    title: "Бичвэр ба файл",
    items: [
      { keys: [["Mod", "C"]], action: "Бичвэр хуулах" },
      {
        keys: [["Mod", "Shift", "C"]],
        action: "Энэ талбарын холбоосыг хуулах",
      },
      { keys: [["Mod", "E"]], action: "Алдаатай үгсийг хуулах" },
      { keys: [["Mod", "V"]], action: "Буулгах" },
      { keys: [["Mod", "O"]], action: "Файл нээх" },
      { keys: [["Mod", "S"]], action: "Бичвэрийг хадгалах" },
      {
        keys: [["Mod", "Alt", "S"]],
        action: "Өөр өргөтгөл сонгож хадгалах",
      },
      { keys: [["Mod", "P"]], action: "Хэвлэх" },
      {
        keys: [["Mod", "Shift", "Backspace"]],
        action: "Талбарыг цэвэрлэх",
      },
      {
        keys: [["Mod", "Shift", "Alt", "Backspace"]],
        action: "Бүх талбарын өгөгдлийг бүрмөсөн устгах",
      },
    ],
  },
  {
    title: "Засвар",
    items: [
      { keys: [["Mod", "Z"]], action: "Засварыг буцаах" },
      {
        keys: [
          ["Mod", "Shift", "Z"],
          ["Mod", "Y"],
        ],
        action: "Буцаасныг сэргээх",
      },
      { keys: [["Ctrl", "\\"]], action: "Монгол, англи гарын байрлал сэлгэх" },
      {
        keys: [["Mod", "Shift", "<"]],
        action: "Заагчаас дээших мөрүүдийг сонгох",
      },
      {
        keys: [["Mod", "Shift", ">"]],
        action: "Заагчаас дооших мөрүүдийг сонгох",
      },
    ],
  },
  {
    title: "Толь ба тайлбар толь",
    items: [
      { keys: [["Mod", "Shift", "L"]], action: "Ашиглах толийг сонгох" },
      {
        keys: [["Mod", "Shift", "Space"], ["F2"]],
        action: "Заагч байгаа үгийн тайлбарыг харах",
      },
      {
        keys: [["Mod", "Shift"]],
        action: "Дарсан чигтээ заагчийг үгэн дээр аваачихад тайлбар гарна",
      },
      {
        keys: [["Mod", "Shift", "Alt", "Space"]],
        action: "Тайлбар толь нэмэх",
      },
    ],
  },
  {
    title: "Харагдах байдал",
    items: [
      { keys: [["Mod", "+"]], action: "Үсэг томруулах" },
      { keys: [["Mod", "-"]], action: "Үсэг жижгэрүүлэх" },
      { keys: [["Mod", "0"]], action: "Үсгийн анхны хэмжээг сэргээх" },
      { keys: [["Mod", "Shift", "D"]], action: "Гэрэлтэй / бараан горим" },
    ],
  },
  {
    title: "LaTeX ба Markdown",
    items: [
      { keys: [["Mod", "Enter"]], action: "Баримтыг хөрвүүлэх" },
      {
        keys: [["Mod", "Shift", "Enter"]],
        action: "Автомат хөрвүүлэлтэд шилжих",
      },
      {
        keys: [["Alt", "Enter"]],
        action: "Жагсаалтад шинэ \\item нэмэх (LaTeX)",
      },
      {
        keys: [["Tab"]],
        action: "Нөхөж оруулсан командын дараагийн хэсэгт шилжих (LaTeX)",
      },
      {
        keys: [["Mod"]],
        action:
          "Дарсан чигтээ хулганы дугуйг эргүүлж урьдчилан харахыг томруулах",
      },
    ],
  },
];

export type System = "pc" | "mac";

const LABELS: Readonly<Record<System, Readonly<Record<string, string>>>> = {
  pc: { Mod: "Ctrl" },
  mac: {
    Mod: "⌘",
    Shift: "⇧",
    Alt: "⌥",
    Ctrl: "⌃",
    Backspace: "⌫",
    Enter: "↩",
  },
};

const SEPARATOR: Readonly<Record<System, string>> = { pc: "+", mac: "" };

export function comboLabel(keys: readonly Key[], system: System): string {
  return keys.map((key) => LABELS[system][key] ?? key).join(SEPARATOR[system]);
}

const kbd = (keys: readonly Key[], system: System): string =>
  "<kbd>" + escapeHtml(comboLabel(keys, system)) + "</kbd>";

const cell = (item: Shortcut, system: System): string =>
  "<td>" + item.keys.map((keys) => kbd(keys, system)).join(" эсвэл ") + "</td>";

function groupTable(group: ShortcutGroup): string {
  const rows = group.items
    .map(
      (item) =>
        "<tr><td>" +
        escapeHtml(item.action) +
        "</td>" +
        cell(item, "pc") +
        cell(item, "mac") +
        "</tr>",
    )
    .join("");
  return (
    "<h3>" +
    escapeHtml(group.title) +
    '</h3><div class="table"><table class="keys"><thead><tr><th>Үйлдэл</th>' +
    "<th>Windows, Linux</th><th>macOS</th></tr></thead><tbody>" +
    rows +
    "</tbody></table></div>"
  );
}

export function keymapHtml(groups: readonly ShortcutGroup[] = KEYMAP): string {
  return groups.map(groupTable).join("");
}
