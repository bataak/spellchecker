import { unwrapLog } from "./texmissing.ts";
import { decodeTexBytes } from "./texbytes.ts";

export interface EngineReply {
  readonly result?: string;
  readonly cmd?: string;
  readonly status?: number;
  readonly log?: string;
  readonly pdf?: ArrayBuffer;
}

const ERRORS_IGNORED = 1;

export function replyPdf(reply: EngineReply): ArrayBuffer | null {
  if (!reply.pdf) return null;
  if (reply.result === "ok") return reply.pdf;
  return reply.status === ERRORS_IGNORED && !/^!/m.test(reply.log ?? "")
    ? reply.pdf
    : null;
}

function errorPlace(log: string): string | null {
  const place = /^l\.\d+ (.*)\n(.*)$/m.exec(log);
  if (!place) return null;
  const before = decodeTexBytes(
    place[1]!.replace(/^\.\.\.(?:\^?[0-9a-f]{1,2}(?=\^\^)|\^(?=\^\^))?/, ""),
  ).slice(-40);
  const after = decodeTexBytes(place[2]!).trim().slice(0, 40);
  return (before + " " + after).trim();
}

export class PdfError extends Error {
  readonly log: string;

  constructor(raw: string) {
    const log = unwrapLog(raw);
    const reason =
      /^!(?: |pdfTeX error: +(?:\(file [^)]*\): )?)(?:LaTeX Error: )?(.+)$/m.exec(
        log,
      )?.[1];
    const at = raw.search(/^!/m);
    const place = at < 0 ? null : errorPlace(raw.slice(at));
    super(
      "PDF үүсгэж чадсангүй" +
        (reason ? ": " + reason : ".") +
        (place ? " — «" + place + "»" : ""),
    );
    this.name = "PdfError";
    this.log = log;
  }
}

const MISSING_FONT =
  /cannot open Type 1 font file|Metric \(TFM\) file not found|not loadable: Metric/;

export function missingFont(error: unknown): boolean {
  return error instanceof PdfError && MISSING_FONT.test(error.log);
}
