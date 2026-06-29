import { gunzipSync } from "fflate";

const decoder = new TextDecoder("utf-8");

const DICTIONARIES = [
  { id: "mn_MN", label: "Монгол" },
  { id: "en_GB", label: "English (UK)" },
  { id: "en_US", label: "English (US)" },
];
const PRIMARY = "mn_MN";

let BASE = "/";
const asset = (p) => (BASE + p).replace(/([^:])\/{2,}/g, "$1/");

async function fetchGzText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " -> " + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const gz = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!gz) return decoder.decode(buf);
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([buf])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return decoder.decode(gunzipSync(buf));
}

async function loadManifest() {
  if (import.meta.env.DEV) {
    const out = {};
    for (const d of DICTIONARIES) {
      out[d.id] = {
        id: d.id,
        version: null,
        aff: d.id + ".aff",
        dic: d.id + ".dic",
      };
    }
    return out;
  }
  const res = await fetch(asset("dict/dict-manifest.json"));
  if (!res.ok) throw new Error("dict-manifest.json -> " + res.status);
  const data = await res.json();
  const out = {};
  for (const e of data.dicts || []) out[e.id] = e;
  return out;
}

async function loadHunspellWasm() {
  const mod = await import("hunspell-wasm");
  const create =
    mod.createHunspellFromStrings ||
    (mod.default && mod.default.createHunspellFromStrings);
  if (typeof create !== "function")
    throw new Error("createHunspellFromStrings алга");
  const probe = await create("SET UTF-8\n", "1\nhello\n");
  if (!probe || typeof probe.testSpelling !== "function")
    throw new Error("hunspell-wasm буруу");
  if (probe.dispose) probe.dispose();
  return {
    label: "hunspell-wasm",
    build: async (aff, dic) => {
      const h = await create(aff, dic);
      return {
        spell: (w) => h.testSpelling(w),
        suggest: (w) => h.getSpellingSuggestions(w),
      };
    },
  };
}

async function loadNspell() {
  const mod = await import("nspell");
  const nspell = mod.default || mod;
  const probe = nspell("SET UTF-8\n", "1\nhello\n");
  if (!probe || typeof probe.correct !== "function")
    throw new Error("nspell буруу");
  return {
    label: "nspell (хялбаршуулсан)",
    build: async (aff, dic) => {
      const s = nspell(aff, dic);
      return { spell: (w) => s.correct(w), suggest: (w) => s.suggest(w) };
    },
  };
}

async function resolveBackend() {
  try {
    return await loadHunspellWasm();
  } catch (e1) {
    const reason = e1 && e1.message ? e1.message : String(e1);
    const b = await loadNspell();
    b.fallbackReason = reason;
    return b;
  }
}

const instances = [];
let backend = null;
let manifest = null;
let mnVersion = null;

async function loadOne(id) {
  const entry = manifest[id];
  if (!entry) throw new Error(id + " manifest-д алга");
  const [aff, dic] = await Promise.all([
    fetchGzText(asset("dict/" + entry.aff)),
    fetchGzText(asset("dict/" + entry.dic)),
  ]);
  const inst = await backend.build(aff, dic, id);
  if (id === PRIMARY) {
    mnVersion =
      entry.version || aff.match(/^#?\s*Version:\s*(.+)$/m)?.[1].trim() || null;
  }
  instances.push({ id, inst });
  const order = (x) => DICTIONARIES.findIndex((d) => d.id === x.id);
  instances.sort((a, b) => order(a) - order(b));
  return id;
}

function isCorrect(word) {
  if (!instances.length) return true;
  const cyr = /[\u0400-\u04FF\u1800-\u18AF]/.test(word);
  const lat = /[A-Za-z]/.test(word);
  if (lat && !cyr && !instances.some((i) => i.id.startsWith("en"))) return true;
  return instances.some(({ inst }) => inst.spell(word));
}

function suggest(word) {
  const cyr = /[\u0400-\u04FF\u1800-\u18AF]/.test(word);
  const lat = /[A-Za-z]/.test(word);
  let list = instances;
  if (cyr && !lat) {
    list = instances.filter(({ id }) => id.startsWith("mn"));
  } else if (lat && !cyr) {
    list = instances.filter(({ id }) => id.startsWith("en"));
  }
  if (!list.length) list = instances;

  const seen = new Set();
  const out = [];
  for (const { inst } of list) {
    for (const s of inst.suggest(word) || []) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    BASE = msg.base || "/";
    try {
      backend = await resolveBackend();
      manifest = await loadManifest();
      const loaded = [];
      const failed = [];
      try {
        await loadOne(PRIMARY);
        loaded.push(PRIMARY);
      } catch (err) {
        failed.push({ id: PRIMARY, error: String(err) });
      }
      self.postMessage({
        type: "ready",
        loaded,
        failed,
        pending: DICTIONARIES.filter((d) => d.id !== PRIMARY).map((d) => d.id),
        source: backend.label,
        fallbackReason: backend.fallbackReason || null,
        mnVersion,
      });
      const rest = DICTIONARIES.filter((d) => d.id !== PRIMARY);
      const results = await Promise.all(
        rest.map((d) =>
          loadOne(d.id).then(
            (id) => ({ id }),
            (err) => ({ id: d.id, error: String(err) }),
          ),
        ),
      );
      self.postMessage({
        type: "complete",
        loaded: results.filter((r) => !r.error).map((r) => r.id),
        failed: results.filter((r) => r.error),
      });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
    return;
  }

  if (msg.type === "check") {
    const out = {};
    for (const w of msg.words) out[w] = isCorrect(w);
    self.postMessage({ type: "check", id: msg.id, results: out });
    return;
  }

  if (msg.type === "suggest") {
    self.postMessage({
      type: "suggest",
      id: msg.id,
      suggestions: suggest(msg.word),
    });
    return;
  }
};
