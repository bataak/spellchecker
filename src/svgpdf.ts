import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { genericCss, genericFamily, svgSize } from "./texsvg.ts";

const FONT_DIR = "fonts/svgpdf/";
const FAMILIES = [
  { id: "times", file: "serif", used: /./ },
  { id: "helvetica", file: "sans", used: /sans-serif/ },
  { id: "courier", file: "mono", used: /monospace/ },
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
const BEYOND_LATIN1 = /[^\u0000-\u00ff]/;

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
          style.weight +
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

function useGenericFamilies(svg: Element): void {
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    const family = element.getAttribute("font-family");
    if (family !== null)
      element.setAttribute("font-family", genericFamily(family));
    const style = element.getAttribute("style");
    if (style !== null) element.setAttribute("style", genericCss(style));
    if (element.localName === "style")
      element.textContent = genericCss(element.textContent ?? "");
  }
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
    useGenericFamilies(svg);
    if (BEYOND_LATIN1.test(svg.textContent ?? ""))
      await addUnicodeFonts(pdf, new XMLSerializer().serializeToString(svg));
    await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    return new Uint8Array(pdf.output("arraybuffer"));
  } catch {
    return null;
  }
}
