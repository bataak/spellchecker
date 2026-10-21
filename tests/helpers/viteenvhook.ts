import { readFileSync } from "node:fs";
import type { LoadHookSync, ResolveHookSync } from "node:module";

const ENV =
  "(globalThis.__VITE_ENV__ ?? " +
  JSON.stringify({ BASE_URL: "/", DEV: false, PROD: true, MODE: "test" }) +
  ")";

const VIRTUAL: Readonly<Record<string, string>> = {
  "virtual:stardict-index":
    "export default globalThis.__STARDICT_INDEX__ ?? [];",
};

export const resolve: ResolveHookSync = (specifier, context, nextResolve) => {
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
};

export const load: LoadHookSync = (url, context, nextLoad) => {
  if (url.startsWith("vite-virtual:"))
    return {
      format: "module",
      source: VIRTUAL[url.slice("vite-virtual:".length)],
      shortCircuit: true,
    };
  if (url.endsWith("?raw")) {
    const text = readFileSync(new URL(url.slice(0, -4)), "utf8");
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
  const result = nextLoad(url, context);
  if (!url.includes("/src/") || result.source == null) return result;
  const source =
    typeof result.source === "string"
      ? result.source
      : new TextDecoder().decode(result.source as Uint8Array);
  if (!source.includes("import.meta.env")) return result;
  return { ...result, source: source.replaceAll("import.meta.env", ENV) };
};
