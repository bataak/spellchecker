import { readFile } from "node:fs/promises";

const ENV =
  "(globalThis.__VITE_ENV__ ?? " +
  JSON.stringify({ BASE_URL: "/", DEV: false, PROD: true, MODE: "test" }) +
  ")";

const VIRTUAL: Readonly<Record<string, string>> = {
  "virtual:stardict-index": "export default [];",
};

type Resolved = { url: string; format?: string; shortCircuit?: boolean };
type Loaded = { format: string; source?: string | Uint8Array };

export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (specifier: string, context: object) => Promise<Resolved>,
): Promise<Resolved> {
  if (specifier in VIRTUAL)
    return { url: "vite-virtual:" + specifier, shortCircuit: true };
  const query = /\?raw$/.exec(specifier);
  if (query && context.parentURL)
    return {
      url:
        new URL(specifier.slice(0, query.index), context.parentURL).href +
        "?raw",
      shortCircuit: true,
    };
  return nextResolve(specifier, context);
}

export async function load(
  url: string,
  context: object,
  nextLoad: (url: string, context: object) => Promise<Loaded>,
): Promise<Loaded & { shortCircuit?: boolean }> {
  if (url.startsWith("vite-virtual:"))
    return {
      format: "module",
      source: VIRTUAL[url.slice("vite-virtual:".length)],
      shortCircuit: true,
    };
  if (url.endsWith("?raw")) {
    const text = await readFile(new URL(url.slice(0, -4)), "utf8");
    return {
      format: "module",
      source: "export default " + JSON.stringify(text) + ";",
      shortCircuit: true,
    };
  }
  if (url.endsWith(".css"))
    return {
      format: "module",
      source: "export default {};",
      shortCircuit: true,
    };
  const result = await nextLoad(url, context);
  if (!url.includes("/src/") || result.source === undefined) return result;
  const source =
    typeof result.source === "string"
      ? result.source
      : new TextDecoder().decode(result.source);
  if (!source.includes("import.meta.env")) return result;
  return { ...result, source: source.replaceAll("import.meta.env", ENV) };
}
