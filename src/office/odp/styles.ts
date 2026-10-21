import { odfFont } from "../fonts.ts";

const FONT = odfFont("Arial");

export function fixedStyles(images: boolean): string {
  return (
    '<style:style style:name="dp1" style:family="drawing-page"/>' +
    (images
      ? '<style:style style:name="gr_img" style:family="graphic">' +
        '<style:graphic-properties draw:stroke="none" draw:fill="none"/>' +
        "</style:style>"
      : "") +
    '<style:style style:name="pr_title" style:family="presentation">' +
    '<style:graphic-properties draw:stroke="none" draw:fill="none" ' +
    'draw:auto-grow-height="false" draw:textarea-vertical-align="middle"/>' +
    "</style:style>" +
    '<style:style style:name="pr_body" style:family="presentation">' +
    '<style:graphic-properties draw:stroke="none" draw:fill="none" ' +
    'draw:auto-grow-height="false" draw:textarea-vertical-align="top" ' +
    'style:shrink-to-fit="true"/>' +
    "</style:style>" +
    '<style:style style:name="P_cover" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="36pt" fo:font-weight="bold"/>' +
    "</style:style>" +
    '<style:style style:name="P_title" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="start"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="30pt" fo:font-weight="bold"/>' +
    "</style:style>" +
    '<style:style style:name="P_sub" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="20pt"/>' +
    "</style:style>" +
    '<style:style style:name="P_body" style:family="paragraph">' +
    '<style:paragraph-properties fo:margin-bottom="0.2cm"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="20pt"/>' +
    "</style:style>" +
    '<style:style style:name="gr_table" style:family="graphic">' +
    '<style:graphic-properties draw:stroke="none" draw:fill="none"/>' +
    "</style:style>"
  );
}

export function listStyles(): string {
  const listLevel =
    '<style:list-level-properties text:space-before="0cm" text:min-label-width="0.9cm"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="100%"/>';
  return (
    '<text:list-style style:name="L_bullet">' +
    '<text:list-level-style-bullet text:level="1" text:bullet-char="•">' +
    listLevel +
    "</text:list-level-style-bullet></text:list-style>" +
    '<text:list-style style:name="L_number">' +
    '<text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">' +
    listLevel +
    "</text:list-level-style-number></text:list-style>"
  );
}
