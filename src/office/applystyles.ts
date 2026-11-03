import { type ParaStyle, STYLE, A4 } from "./docir.ts";

const PARA_GAP_PT = 6;

const SIGNATURE_GAP_PT = 22;

export const BASE: Readonly<Record<string, ParaStyle>> = {
  [STYLE.body]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.bodyFirst]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.runIn]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceBeforePt: 14,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.title]: {
    align: "center",
    bold: true,
    sizePt: 17,
    lineHeightPercent: 115,
    spaceAfterPt: 18,
    keepWithNext: true,
  },
  [STYLE.signature]: { align: "end", lineHeightPercent: 150 },
  [STYLE.signatureTop]: {
    align: "end",
    lineHeightPercent: 150,
    spaceBeforePt: SIGNATURE_GAP_PT,
  },
  [STYLE.right]: {
    align: "end",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.signatureGap]: {
    sizePt: 1,
    lineHeightPercent: 100,
    spaceBeforePt: SIGNATURE_GAP_PT - 1,
  },
  [STYLE.signCell]: { lineHeightPercent: 150, noHyphenation: true },
  [STYLE.center]: {
    align: "center",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.left]: {
    align: "start",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.meta]: { align: "center", lineHeightPercent: 115 },
  [STYLE.quote]: {
    align: "justify",
    marginLeftCm: 1.25,
    marginRightCm: 1.25,
    lineHeightPercent: 115,
    spaceBeforePt: 6,
    spaceAfterPt: 6,
  },
  [STYLE.code]: { mono: true, lineHeightPercent: 100 },
  [STYLE.figure]: {
    align: "center",
    lineHeightPercent: 100,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.listItem]: {
    align: "justify",
    lineHeightPercent: 115,
    spaceAfterPt: PARA_GAP_PT,
  },
  [STYLE.tableHead]: {
    bold: true,
    sizePt: 11,
    lineHeightPercent: 100,
    noHyphenation: true,
  },
  [STYLE.tableCell]: {
    sizePt: 11,
    lineHeightPercent: 100,
    noHyphenation: true,
  },
  [STYLE.tableGap]: { sizePt: 6, lineHeightPercent: 100 },
  Heading1: {
    align: "center",
    sizePt: 14,
    bold: true,
    spaceBeforePt: 28,
    spaceAfterPt: 14,
    keepWithNext: true,
    outlineLevel: 1,
  },
  Heading2: {
    sizePt: 13,
    bold: true,
    spaceBeforePt: 21,
    spaceAfterPt: 10,
    keepWithNext: true,
    outlineLevel: 2,
  },
  Heading3: {
    sizePt: 12,
    bold: true,
    spaceBeforePt: 14,
    spaceAfterPt: 7,
    keepWithNext: true,
    outlineLevel: 3,
  },
  Heading4: { sizePt: 12, bold: true, spaceBeforePt: 14, outlineLevel: 4 },
  Heading5: { sizePt: 12, italic: true, spaceBeforePt: 8, outlineLevel: 5 },
  Heading6: { sizePt: 12, italic: true, spaceBeforePt: 6, outlineLevel: 6 },
};

export const LETTER: Readonly<Record<string, ParaStyle>> = {
  [STYLE.title]: {
    align: "center",
    bold: true,
    sizePt: 14,
    lineHeightPercent: 130,
    spaceBeforePt: 18,
    spaceAfterPt: 20,
    keepWithNext: true,
  },
  [STYLE.signatureTop]: {
    align: "end",
    lineHeightPercent: 150,
    spaceBeforePt: SIGNATURE_GAP_PT,
    spaceAfterPt: 7,
  },
  [STYLE.signature]: {
    align: "end",
    lineHeightPercent: 150,
    spaceAfterPt: 7,
  },
};

export const PAGE = {
  widthCm: A4.widthCm,
  heightCm: A4.heightCm,
  marginTopCm: 2,
  marginBottomCm: 2,
  marginInnerCm: 3,
  marginOuterCm: 1.5,
  mirrored: false,
};
