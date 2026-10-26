import { escapeAttr } from "../core/htmlutil.ts";
import { ICON, svg } from "../ui/baricons.ts";
import { insertSignature, toggleAlign, type AlignKind } from "./mdalign.ts";
import {
  cycleCase,
  insertPageBreak,
  insertTable,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
  wrapLink,
  type Edit,
} from "./mdedit.ts";

export type Role =
  | "bold"
  | "italic"
  | "code"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "case"
  | "left"
  | "center"
  | "right"
  | "signature"
  | "bullet"
  | "ordered"
  | "quote"
  | "table"
  | "pagebreak"
  | "image"
  | "link";

interface ButtonSpec {
  readonly role: Role;
  readonly label: string;
  readonly title: string;
}

export const BUTTONS: readonly ButtonSpec[] = [
  { role: "bold", label: "B", title: "Тод" },
  { role: "italic", label: "I", title: "Налуу" },
  { role: "h1", label: "H1", title: "Гарчиг" },
  { role: "h2", label: "H2", title: "Дэд гарчиг" },
  { role: "h3", label: "H3", title: "Дэдийн дэд гарчиг" },
  { role: "h4", label: "H4", title: "Догол доторх гарчиг" },
  { role: "case", label: "Aa", title: "Том, жижиг үсэг ээлжлэх" },
  { role: "left", label: svg(ICON.left), title: "Зүүн тийш зэрэгцүүлэх" },
  { role: "center", label: svg(ICON.center), title: "Голлуулах" },
  { role: "right", label: svg(ICON.right), title: "Баруун тийш зэрэгцүүлэх" },
  { role: "signature", label: svg(ICON.signature), title: "Гарын үсэг" },
  { role: "bullet", label: svg(ICON.bullet), title: "Зүйлчлэх" },
  { role: "ordered", label: svg(ICON.ordered), title: "Дугаарлах" },
  { role: "quote", label: svg(ICON.quote), title: "Ишлэл" },
  { role: "code", label: "&lt;&gt;", title: "Код" },
  { role: "table", label: svg(ICON.table), title: "Хүснэгт" },
  { role: "image", label: svg(ICON.image), title: "Зураг" },
  { role: "pagebreak", label: svg(ICON.pagebreak), title: "Хуудас таслах" },
  { role: "link", label: svg(ICON.link), title: "Холбоос" },
];

export const HEADING_DEPTH: Partial<Record<Role, 1 | 2 | 3 | 4>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
};

export const ALIGN_ROLE: Partial<Record<Role, AlignKind>> = {
  left: "left",
  center: "center",
  right: "right",
  signature: "signature",
};

export function buildButtons(): string {
  return BUTTONS.map(
    (spec) =>
      '<button type="button" class="tbtn md-btn" data-role="' +
      spec.role +
      '" title="' +
      escapeAttr(spec.title) +
      '" aria-label="' +
      escapeAttr(spec.title) +
      '">' +
      spec.label +
      "</button>",
  ).join("");
}

export function formatEdit(
  role: Exclude<Role, "image">,
  text: string,
  start: number,
  end: number,
  now: Date,
): Edit {
  const depth = HEADING_DEPTH[role];
  const kind = ALIGN_ROLE[role];
  if (depth !== undefined) return toggleHeading(text, start, end, depth);
  if (kind !== undefined)
    return (
      (kind === "signature" && start === end
        ? insertSignature(text, start, now)
        : null) ?? toggleAlign(text, start, end, kind)
    );
  if (role === "bold") return toggleWrap(text, start, end, "**");
  if (role === "italic") return toggleWrap(text, start, end, "*");
  if (role === "code") return toggleWrap(text, start, end, "`");
  if (role === "case") return cycleCase(text, start, end);
  if (role === "quote") return toggleQuote(text, start, end);
  if (role === "link") return wrapLink(text, start, end);
  if (role === "table") return insertTable(text, start);
  if (role === "pagebreak") return insertPageBreak(text, start);
  return toggleList(text, start, end, role === "ordered");
}
