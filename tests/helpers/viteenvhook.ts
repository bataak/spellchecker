const ENV =
  "(globalThis.__VITE_ENV__ ?? " +
  JSON.stringify({ BASE_URL: "/", DEV: false, PROD: true, MODE: "test" }) +
  ")";

export async function load(
  url: string,
  context: object,
  nextLoad: (
    url: string,
    context: object,
  ) => Promise<{ format: string; source?: string | Uint8Array }>,
) {
  const result = await nextLoad(url, context);
  if (!url.includes("/src/") || result.source === undefined) return result;
  const source =
    typeof result.source === "string"
      ? result.source
      : new TextDecoder().decode(result.source);
  if (!source.includes("import.meta.env")) return result;
  return { ...result, source: source.replaceAll("import.meta.env", ENV) };
}
