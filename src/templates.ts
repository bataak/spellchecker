export const PLAIN = "plain";

export type Frame = "plain" | "letter" | "structured" | "slides";

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly frame: Frame;
  readonly skeleton: string;
}

export const TEMPLATES: readonly Template[] = [
  { id: PLAIN, name: "Бичвэр 1", frame: "plain", skeleton: "" },
  { id: "plain2", name: "Бичвэр 2", frame: "plain", skeleton: "" },

  {
    id: "letter",
    frame: "letter",
    name: "Албан бичиг",
    skeleton: `# Албан бичгийн утга

Бичгийн зорилгыг эхний доголд тодорхой өгүүлнэ.

Дэлгэрэнгүй тайлбар, шаардлагатай тоо баримтыг дараагийн доголд бичнэ.

Хүлээгдэж буй хариу арга хэмжээг төгсгөлд дурдана.
`,
  },

  {
    id: "report",
    frame: "structured",
    name: "Тайлан",
    skeleton: `# Тайлангийн нэр

## Оршил

## Үндсэн хэсэг

## Дүгнэлт

## Ном зүй
`,
  },

  {
    id: "slides",
    frame: "slides",
    name: "Илтгэл",
    skeleton: `# Илтгэлийн нэр

## Танилцуулга

- Гол санаа

## Үр дүн

## Дүгнэлт
`,
  },
];

export interface TemplateGroup {
  readonly name: string;
  readonly ids: readonly string[];
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = [
  { name: "Алдаа шалгах", ids: [PLAIN, "plain2"] },
  { name: "Баримт бичиг бэлтгэх", ids: ["letter", "report", "slides"] },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((item) => item.id === id);
}

export function isPlain(id: string): boolean {
  return (findTemplate(id)?.frame ?? "plain") === "plain";
}

export const LEGACY_TEMPLATES: Readonly<Record<string, string>> = {
  application: "letter",
  reference: "letter",
  contract: "letter",
  coursework: "report",
  research: "report",
  essay: "report",
  minutes: "report",
  cv: "report",
};

export function templateExamples(skeleton: string): string[] {
  const out: string[] = [];
  for (const block of skeleton.split(/\n\s*\n/)) {
    const text = block.trim().replace(/^#{1,6}[ \t]+/, "");
    if (text) out.push(text);
  }
  return out;
}
