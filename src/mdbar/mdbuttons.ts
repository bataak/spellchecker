import { escapeAttr } from "../htmlutil.ts";
import {
  cycleCase,
  insertPageBreak,
  insertSignature,
  insertTable,
  toggleAlign,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
  wrapLink,
  type AlignKind,
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

const ICON = {
  left: '<path d="M1.5 3h13M1.5 6.3h8.5M1.5 9.7h13M1.5 13h8.5"/>',
  center: '<path d="M1.5 3h13M4 6.3h8M1.5 9.7h13M4 13h8"/>',
  right: '<path d="M1.5 3h13M6 6.3h8.5M1.5 9.7h13M6 13h8.5"/>',
  signature:
    '<path d="M1.5 14h13M2.3 9.2l2.6 2.6M4.9 9.2l-2.6 2.6"/>' +
    '<path d="M8 11.5l.6-2.3 5.1-5.1a1.2 1.2 0 0 1 1.7 1.7l-5.1 5.1z"/>',
  bullet:
    '<circle cx="3" cy="4" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="3" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
    '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>',
  ordered:
    '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>' +
    '<text x="0.6" y="5.7" font-size="5.5" fill="currentColor" stroke="none">1</text>' +
    '<text x="0.6" y="9.7" font-size="5.5" fill="currentColor" stroke="none">2</text>' +
    '<text x="0.6" y="13.7" font-size="5.5" fill="currentColor" stroke="none">3</text>',
  quote:
    '<path fill="currentColor" stroke="none" d="M7.1 3.9c-2.1.9-3.6 2.8-3.6 5.1 0 1.8 1.2 3 2.8 3 1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.2-2.3-.2 0-.5 0-.7.1.3-1.1 1.1-2 2.2-2.5z"/>' +
    '<path fill="currentColor" stroke="none" d="M13.9 3.9c-2.1.9-3.6 2.8-3.6 5.1 0 1.8 1.2 3 2.8 3 1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.2-2.3-.2 0-.5 0-.7.1.3-1.1 1.1-2 2.2-2.5z"/>',
  table:
    '<rect x="3" y="3" width="10" height="10" rx="1.2"/>' +
    '<path d="M3 8h10M8 3v10"/>',
  pagebreak:
    '<path d="M3.5 1.5v4h9v-4M3.5 14.5v-4h9v4"/>' +
    '<path d="M1.5 8h2M5.5 8h2M9.5 8h2M13.5 8h1"/>',
  image:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>' +
    '<circle cx="5.5" cy="6.3" r="1.3"/>' +
    '<path d="M1.5 11.5l3.8-3.6 2.7 2.5 2.2-2 4.3 4"/>',
  link:
    '<path d="M6.9 9.1a3.1 3.1 0 0 0 4.4.3l1.9-1.9a3.1 3.1 0 0 0-4.4-4.4l-1 1"/>' +
    '<path d="M9.1 6.9a3.1 3.1 0 0 0-4.4-.3l-1.9 1.9a3.1 3.1 0 0 0 4.4 4.4l1-1"/>',
} as const;

function svg(body: string): string {
  return (
    '<svg viewBox="-0.8 -0.8 17.6 17.6" width="20" height="20" aria-hidden="true" ' +
    'fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    body +
    "</svg>"
  );
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
