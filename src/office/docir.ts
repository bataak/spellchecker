/**
 * Баримтын завсрын дүрслэл (DocIr).
 *
 * `applyTemplate` болон бичигчдийн (`odt`, дараа нь `docx`) хоорондох гэрээ.
 * Форматаас хараат бус: энд ODF ч, OOXML ч тодорхой зүйл байхгүй.
 *
 * Гол зарчим — блок нь хэвийн **нэрийг** л заана, хэлбэрийн тоон утга
 * `styles`-д тусдаа сууна. Ингэснээр `content.xml` үүсгэгч нь хэмжээ,
 * зай, доголыг огт мэдэхгүй; бүх мэргэжлийн шийдвэр загварт төвлөрнө.
 * ODF, OOXML хоёулаа яг ийм загвартай тул хоёр дахь бичигч нэмэхэд энэ
 * төрөл өөрчлөгдөхгүй.
 */

export type Align = "start" | "center" | "end" | "justify";

/** Нэг ижил хэлбэртэй тасралтгүй бичвэр. Мод биш, хавтгай. */
export interface IrRun {
  readonly text: string;
  readonly tab?: boolean;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly mono?: boolean;
  readonly strike?: boolean;
  readonly href?: string;
}

/** Доголын хэв. Заагаагүй талбар нь баримтын анхдагчийг өвлөнө. */
export interface ParaStyle {
  readonly sizePt?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly mono?: boolean;
  readonly align?: Align;
  readonly lineHeightPercent?: number;
  readonly firstLineIndentCm?: number;
  readonly marginLeftCm?: number;
  readonly marginRightCm?: number;
  readonly spaceBeforePt?: number;
  readonly spaceAfterPt?: number;
  /** Шинэ хуудаснаас эхлэх. */
  readonly breakBefore?: boolean;
  /** Дараагийн доголоос салгаж хуудас таслахгүй. */
  readonly keepWithNext?: boolean;
  /** Агуулга үүсгэхэд оролцох гарчгийн түвшин (1–6). */
  readonly outlineLevel?: number;
  readonly borderBottom?: boolean;
  readonly leaderTabCm?: number;
  readonly rightTab?: boolean;
}

export interface PageSpec {
  readonly widthCm: number;
  readonly heightCm: number;
  readonly marginTopCm: number;
  readonly marginBottomCm: number;
  /** Хавтаслах тал. `mirrored` үнэн бол сондгой хуудсанд зүүн талд. */
  readonly marginInnerCm: number;
  readonly marginOuterCm: number;
  readonly mirrored: boolean;
}

export interface HeaderSpec {
  /** Хуудасны толгойн зүүн талын бичвэр. Хоосон бол баримтын нэр. */
  readonly left?: string;
  readonly pageNumberRight?: boolean;
  /** Толгойн доор нимгэн зураас. */
  readonly rule?: boolean;
}

export type IrBlock =
  | { readonly kind: "para"; readonly style: string; readonly runs: readonly IrRun[] }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly start: number;
      readonly style: string;
      readonly items: readonly (readonly IrRun[])[];
    }
  | {
      readonly kind: "table";
      readonly align: readonly (Align | null)[];
      readonly rows: readonly (readonly (readonly IrRun[])[])[];
    }
  | { readonly kind: "rule" }
  | { readonly kind: "break" };

export interface DocIr {
  readonly blocks: readonly IrBlock[];
  readonly styles: Readonly<Record<string, ParaStyle>>;
  readonly font: { readonly family: string; readonly sizePt: number };
  readonly page: PageSpec;
  readonly header?: HeaderSpec;
  /** Файлын мета өгөгдөл ба толгойн анхдагч бичвэр. */
  readonly title?: string;
}

/**
 * Хэвийн нэрс. Бичигч эдгээрийг мэдэх шаардлагагүй — зөвхөн `styles`-д
 * бүртгэлтэй эсэхийг л шалгана. Загвар бүр өөрийн утгыг оноож болно.
 */
export const STYLE = {
  /** Ердийн догол. */
  body: "Body",
  /** Гарчгийн дараах эхний догол — эхний мөрийн догол хийхгүй. */
  bodyFirst: "BodyFirst",
  /** Баримтын нэр (Өргөдөл, Тодорхойлолт). */
  title: "Title",
  /** Хаяглагч блок. */
  recipient: "Recipient",
  /** Огнооны мөр. */
  date: "Date",
  /** Гарын үсгийн мөр. */
  signature: "Signature",
  signatureTop: "SignatureTop",
  signRule: "SignRule",
  signLine: "SignLine",
  /** Төгсгөлийн хэвшмэл өгүүлбэр. */
  closing: "Closing",
  quote: "Quote",
  code: "Code",
  listItem: "ListItem",
  tableHead: "TableHead",
  tableCell: "TableCell",
} as const;

export function headingStyle(depth: number): string {
  return "Heading" + String(Math.min(6, Math.max(1, depth)));
}

/** A4, сантиметрээр. */
export const A4 = { widthCm: 21, heightCm: 29.7 } as const;
