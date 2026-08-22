/**
 * Баримтын загварууд.
 *
 * Одоохондоо зөвхөн markdown араг яс. Экспортын хэлбэрийн тодорхойлолт
 * (хуудасны зах, гарчгийн хэмжээ, хүрээ) дараа нь энэ бүтцэд нэмэгдэнэ —
 * загварын нэр нь `DocIr`-ийн хэвүүдтэй холбогдоно.
 */

export const PLAIN = "plain";

export type Frame = "plain" | "letter" | "structured";

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly frame: Frame;
  /** Сонгоход засварлагчид орох markdown. Хоосон бол юу ч оруулахгүй. */
  readonly skeleton: string;
}

export const TEMPLATES: readonly Template[] = [
  { id: PLAIN, name: "Алдаа шалгах", frame: "plain", skeleton: "" },

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
    id: "coursework",
    frame: "structured",
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
    frame: "structured",
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
    frame: "letter",
    skeleton: `# "Хан Хурмаст Тэнгэр" ХХК-ийн захирал танаа өргөдөл гаргах нь:

Миний бие Боржигин овогт Боролдой нь тус байгууллагын Үүлэн Технологийн хэлтэст 2023 оны 05 сарын 10-ны өдрөөс эхлэн Программ хангамжийн хөгжүүлэгчээр ажиллаж байна.

Хөдөлмөрийн тухай хууль болон амралтын хуваарийн дагуу 2026 оны ээлжийн амралтаа 2026 оны 09 сарын 01-ний өдрөөс эхлэн ажлын 15 өдрийн хугацаатайгаар эдлэх хүсэлтэй байгаа бөгөөд амралтын хугацаанд өөрийн үүрэгт ажлаа хөгжүүлэгч Н. Хүлэгт хариуцуулах болно.

Иймд миний ээлжийн амралтыг дээрх хугацаанд олгож, амралтын цалинг холбогдох хууль, журмын дагуу тооцон олгож өгнө үү.

Өргөдөл гаргасан: Б. Боролдой

Утас: 99112233
`,
  },
  {
    id: "research",
    frame: "structured",
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
    id: "cv",
    frame: "structured",
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
    frame: "letter",
    name: "Тодорхойлолт",
    skeleton: `# Тодорхойлолт

Тодорхойлж буй хүний албан тушаал, ажилласан хугацааг бичнэ.

Ажлын гүйцэтгэл, ур чадварын талаар тодорхойлно.
`,
  },

  {
    id: "minutes",
    frame: "structured",
    name: "Хурлын тэмдэглэл",
    skeleton: `# Хурлын тэмдэглэл

## Хэлэлцсэн асуудал

## Гарсан санал

## Шийдвэр
`,
  },

  {
    id: "essay",
    frame: "structured",
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

/**
 * Сонгогчид харуулах бүлгүүд. Зөвхөн дэлгэцийн зохион байгуулалт —
 * загварын өгөгдөлд нөлөөлөхгүй. Энд байхгүй загвар жагсаалтын төгсгөлд
 * бүлэггүйгээр гарна.
 */
export const TEMPLATE_GROUPS: readonly TemplateGroup[] = [
  {
    name: "Албан бичиг бэлтгэх",
    ids: ["letter", "contract", "application", "reference"],
  },
  {
    name: "Тайлан, тэмдэглэл бэлтгэх",
    ids: ["report", "cv", "minutes"],
  },
  {
    name: "Хичээлийн ажил бэлтгэх",
    ids: ["coursework", "research", "essay"],
  },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((item) => item.id === id);
}

export function templateExamples(skeleton: string): string[] {
  const out: string[] = [];
  for (const block of skeleton.split(/\n\s*\n/)) {
    const text = block.trim().replace(/^#{1,6}[ \t]+/, "");
    if (text) out.push(text);
  }
  return out;
}
