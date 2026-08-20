export type Align = "start" | "center" | "end" | "justify";

export interface IrRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly mono?: boolean;
  readonly strike?: boolean;
  readonly href?: string;
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

export interface HeaderSpec {
  readonly left?: string;
  readonly pageNumberRight?: boolean;
  readonly rule?: boolean;
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
    }
  | { readonly kind: "rule" }
  | { readonly kind: "break" };

export interface DocIr {
  readonly blocks: readonly IrBlock[];
  readonly styles: Readonly<Record<string, ParaStyle>>;
  readonly font: { readonly family: string; readonly sizePt: number };
  readonly page: PageSpec;
  readonly header?: HeaderSpec;
  readonly title?: string;
}

export const STYLE = {
  body: "Body",
  bodyFirst: "BodyFirst",
  title: "Title",
  recipient: "Recipient",
  date: "Date",
  signature: "Signature",
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

export const A4 = { widthCm: 21, heightCm: 29.7 } as const;
