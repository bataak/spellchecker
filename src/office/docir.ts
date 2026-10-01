export type Align = "start" | "center" | "end" | "justify";

export interface IrImage {
  readonly src: string;
  readonly widthPercent?: number;
  readonly rotate?: number;
}

export interface PreparedImage {
  readonly url: string;
  readonly blob: Blob | null;
  readonly widthPx: number;
  readonly heightPx: number;
}

export type ImageSet = ReadonlyMap<string, PreparedImage>;

export function imageKey(image: IrImage): string {
  return String(image.rotate ?? 0) + "|" + image.src;
}

export function docImages(doc: DocIr): IrImage[] {
  const out: IrImage[] = [];
  const take = (runs: readonly IrRun[]): void => {
    for (const run of runs) if (run.image) out.push(run.image);
  };
  for (const block of doc.blocks) {
    if (block.kind === "para") take(block.runs);
    else if (block.kind === "list") block.items.forEach(take);
    else if (block.kind === "table")
      for (const row of block.rows) row.forEach(take);
  }
  return out;
}

export interface IrRun {
  readonly text: string;
  readonly tab?: boolean;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly mono?: boolean;
  readonly strike?: boolean;
  readonly href?: string;
  readonly fill?: boolean;
  readonly image?: IrImage;
}

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
  readonly breakBefore?: boolean;
  readonly keepWithNext?: boolean;
  readonly outlineLevel?: number;
  readonly borderBottom?: boolean;
  readonly noHyphenation?: boolean;
}

export interface PageSpec {
  readonly widthCm: number;
  readonly heightCm: number;
  readonly marginTopCm: number;
  readonly marginBottomCm: number;
  readonly marginInnerCm: number;
  readonly marginOuterCm: number;
  readonly mirrored: boolean;
}

export type IrBlock =
  | {
      readonly kind: "para";
      readonly style: string;
      readonly runs: readonly IrRun[];
    }
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
      readonly header?: boolean;
      readonly placement?: Align;
      readonly cellStyle?: string;
    }
  | { readonly kind: "rule" }
  | { readonly kind: "break" };

export interface DocIr {
  readonly blocks: readonly IrBlock[];
  readonly styles: Readonly<Record<string, ParaStyle>>;
  readonly font: { readonly family: string; readonly sizePt: number };
  readonly page: PageSpec;
  readonly pageNumbers?: boolean;
  readonly title?: string;
}

export const STYLE = {
  body: "Body",
  bodyFirst: "BodyFirst",
  runIn: "RunIn",
  title: "Title",
  signature: "Signature",
  signatureTop: "SignatureTop",
  signatureGap: "SignatureGap",
  right: "Right",
  signCell: "SignCell",
  center: "Center",
  left: "Left",
  meta: "Meta",
  quote: "Quote",
  code: "Code",
  listItem: "ListItem",
  figure: "Figure",
  tableHead: "TableHead",
  tableCell: "TableCell",
  tableGap: "TableGap",
} as const;

export function headingStyle(depth: number): string {
  return "Heading" + String(Math.min(6, Math.max(1, depth)));
}

export const A4 = { widthCm: 21, heightCm: 29.7 } as const;
