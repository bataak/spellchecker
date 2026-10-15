import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { svgSize } from "./texsvg.ts";

const FONT_DIR = "fonts/svgpdf/";
const FAMILIES = [
  { id: "times", file: "serif", used: /./ },
  {
    id: "helvetica",
    file: "sans",
    used: /sans|arial|helvetica|verdana|tahoma|calibri|segoe|roboto/i,
  },
  { id: "courier", file: "mono", used: /mono|courier|consol|fixed|terminal/i },
];
const STYLES = [
  { style: "normal", weight: "400", used: /./ },
  { style: "bold", weight: "700", used: /bold|[6-9]00/i },
  { style: "italic", weight: "400i", used: /italic|oblique/i },
  {
    style: "bolditalic",
    weight: "700i",
    used: /(?=[\s\S]*(?:bold|[6-9]00))(?=[\s\S]*(?:italic|oblique))/i,
  },
];
const SINGLE_WEIGHT: ReadonlySet<string> = new Set(["mono"]);
const BEYOND_LATIN1 = /[^\u0000-ÿ]/;

const fonts = new Map<string, Promise<string | null>>();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

function fontData(name: string): Promise<string | null> {
  let data = fonts.get(name);
  if (!data) {
    data = fetch(import.meta.env.BASE_URL + FONT_DIR + name)
      .then(async (response) =>
        response.ok
          ? base64(new Uint8Array(await response.arrayBuffer()))
          : null,
      )
      .catch(() => null);
    fonts.set(name, data);
    void data.then((value) => {
      if (value === null) fonts.delete(name);
    });
  }
  return data;
}

async function addUnicodeFonts(pdf: jsPDF, source: string): Promise<void> {
  const wanted = FAMILIES.filter((family) => family.used.test(source)).flatMap(
    (family) =>
      STYLES.filter((style) => style.used.test(source)).map((style) => ({
        id: family.id,
        style: style.style,
        name:
          "bichig-print-" +
          family.file +
          "-mn-" +
          (SINGLE_WEIGHT.has(family.file) ? "400" : style.weight) +
          "-v1.ttf",
      })),
  );
  const loaded = await Promise.all(wanted.map((font) => fontData(font.name)));
  wanted.forEach((font, index) => {
    const data = loaded[index];
    if (!data) return;
    pdf.addFileToVFS(font.name, data);
    pdf.addFont(font.name, font.id, font.style, undefined, "Identity-H");
  });
}

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
    if (BEYOND_LATIN1.test(svg.textContent ?? ""))
      await addUnicodeFonts(pdf, source);
    await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    return new Uint8Array(pdf.output("arraybuffer"));
  } catch {
    return null;
  }
}
