import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { svgSize } from "./texsvg.ts";

export async function renderSvg(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const source = new TextDecoder().decode(bytes);
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    const svg = doc.documentElement;
    if (svg.localName !== "svg" || doc.getElementsByTagName("parsererror").length)
      return null;
    const { width, height } = svgSize(
      svg.getAttribute("width"),
      svg.getAttribute("height"),
      svg.getAttribute("viewBox"),
    );
    const pdf = new jsPDF({
      unit: "pt",
      format: [width, height],
      orientation: width > height ? "landscape" : "portrait",
    });
    await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    return new Uint8Array(pdf.output("arraybuffer"));
  } catch {
    return null;
  }
}
