export const PLAIN = "plain";

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly skeleton: string;
}

export const TEMPLATES: readonly Template[] = [
  { id: PLAIN, name: "Энгийн", skeleton: "" },

  {
    id: "letter",
    name: "Албан бичиг",
    skeleton: `# Албан бичгийн утга

Бичгийн зорилгыг эхний доголд тодорхой өгүүлнэ.

Дэлгэрэнгүй тайлбар, шаардлагатай тоо баримтыг дараагийн доголд бичнэ.

Хүлээгдэж буй хариу арга хэмжээг төгсгөлд дурдана.
`,
  },

  {
    id: "coursework",
    name: "Бие даалт",
    skeleton: `# Сэдэв

## Оршил

## Үндсэн хэсэг

## Дүгнэлт

## Ашигласан материал
`,
  },

  {
    id: "contract",
    name: "Гэрээ",
    skeleton: `# Гэрээ

## Нэг. Гэрээний зүйл

## Хоёр. Талуудын эрх, үүрэг

## Гурав. Төлбөр, тооцоо

## Дөрөв. Хариуцлага

## Тав. Бусад нөхцөл
`,
  },

  {
    id: "application",
    name: "Өргөдөл",
    skeleton: `# Өргөдөл

Тавьж буй хүсэлтээ товч, тодорхой бичнэ.

Хүсэлтийн үндэслэл, шаардлагатай нөхцөлийг тайлбарлана.
`,
  },

  {
    id: "research",
    name: "Судалгааны ажил",
    skeleton: `# Судалгааны сэдэв

## Удиртгал

## Судалгааны арга зүй

## Үр дүн

## Хэлэлцүүлэг

## Дүгнэлт

## Ном зүй
`,
  },

  {
    id: "report",
    name: "Тайлан",
    skeleton: `# Тайлангийн нэр

## Оршил

## Үндсэн хэсэг

## Дүгнэлт

## Ном зүй
`,
  },

  {
    id: "cv",
    name: "Товч танилцуулга",
    skeleton: `# Товч танилцуулга

## Боловсрол

## Ажлын туршлага

## Ур чадвар

## Хэлний мэдлэг
`,
  },

  {
    id: "reference",
    name: "Тодорхойлолт",
    skeleton: `# Тодорхойлолт

Тодорхойлж буй хүний албан тушаал, ажилласан хугацааг бичнэ.

Ажлын гүйцэтгэл, ур чадварын талаар тодорхойлно.
`,
  },

  {
    id: "minutes",
    name: "Хурлын тэмдэглэл",
    skeleton: `# Хурлын тэмдэглэл

## Хэлэлцсэн асуудал

## Гарсан санал

## Шийдвэр
`,
  },

  {
    id: "essay",
    name: "Эссе",
    skeleton: `# Эссений сэдэв

Санааныхаа товч тайлбараар уншигчийг сэдэвт оруулна.

Гол үндэслэлээ жишээ баримттай хамт өрнүүлнэ.

Хэлсэн зүйлээ нэгтгэн дүгнэнэ.
`,
  },
];

export interface TemplateGroup {
  readonly name: string;
  readonly ids: readonly string[];
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = [
  {
    name: "Албан бичиг",
    ids: ["letter", "contract", "application", "reference"],
  },
  {
    name: "Тайлан, тэмдэглэл",
    ids: ["report", "cv", "minutes"],
  },
  {
    name: "Хичээл, судалгаа",
    ids: ["coursework", "research", "essay"],
  },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((item) => item.id === id);
}
