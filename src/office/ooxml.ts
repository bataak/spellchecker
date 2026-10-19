import { xmlAttr } from "./sanitize.ts";

export const XML_HEAD =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

export interface Rel {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
}

export function relsXml(rels: readonly Rel[]): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="' +
    REL_PKG +
    '">' +
    rels
      .map(
        (rel) =>
          '<Relationship Id="' +
          rel.id +
          '" Type="' +
          rel.type +
          '" Target="' +
          xmlAttr(rel.target) +
          '"' +
          (rel.external ? ' TargetMode="External"' : "") +
          "/>",
      )
      .join("") +
    "</Relationships>"
  );
}
