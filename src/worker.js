import { gunzipSync } from "fflate";

const decoder = new TextDecoder("utf-8");

if (!self.__cacheFirstFetch) {
  self.__cacheFirstFetch = true;
  const origFetch = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url && (!init || init.method == null || init.method === "GET")) {
      try {
        const cached = await caches.match(url, { ignoreSearch: true });
        if (cached) return cached;
      } catch {}
    }
    return origFetch(input, init);
  };
}

const DICTIONARIES = [
  { id: "mn_MN", label: "Монгол" },
  { id: "en_GB", label: "English (UK)" },
  { id: "en_US", label: "English (US)" },
];
const PRIMARY = "mn_MN";

let BASE = "/";
const asset = (path) => (BASE + path).replace(/([^:])\/{2,}/g, "$1/");

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
    for (const dict of DICTIONARIES) {
      out[dict.id] = {
        id: dict.id,
        version: null,
        aff: dict.id + ".aff",
        dic: dict.id + ".dic",
      };
    }
    return out;
  }
  const res = await fetch(asset("dict/dict-manifest.json"));
  if (!res.ok) throw new Error("dict-manifest.json -> " + res.status);
  const data = await res.json();
  const out = {};
  for (const entry of data.dicts || []) out[entry.id] = entry;
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
      const hunspellInstance = await create(aff, dic);
      return {
        spell: (word) => hunspellInstance.testSpelling(word),
        suggest: (word) => hunspellInstance.getSpellingSuggestions(word),
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
      const nspellInstance = nspell(aff, dic);
      return {
        spell: (word) => nspellInstance.correct(word),
        suggest: (word) => nspellInstance.suggest(word),
      };
    },
  };
}

async function resolveBackend() {
  try {
    return await loadHunspellWasm();
  } catch (wasmError) {
    const reason =
      wasmError && wasmError.message ? wasmError.message : String(wasmError);
    const fallbackBackend = await loadNspell();
    fallbackBackend.fallbackReason = reason;
    return fallbackBackend;
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
  const order = (item) => DICTIONARIES.findIndex((dict) => dict.id === item.id);
  instances.sort((a, b) => order(a) - order(b));
  return id;
}

function isCorrect(word) {
  if (!instances.length) return true;
  const cyr = /[\u0400-\u04FF\u1800-\u18AF]/.test(word);
  const lat = /[A-Za-z]/.test(word);
  if (lat && !cyr && !instances.some((item) => item.id.startsWith("en")))
    return true;
  if (cyr && !lat && !instances.some((item) => item.id.startsWith("mn")))
    return true;
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
    for (const suggestion of inst.suggest(word) || []) {
      if (!seen.has(suggestion)) {
        seen.add(suggestion);
        out.push(suggestion);
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
        pending: DICTIONARIES.filter((dict) => dict.id !== PRIMARY).map(
          (dict) => dict.id,
        ),
        source: backend.label,
        fallbackReason: backend.fallbackReason || null,
        mnVersion,
      });
      const rest = DICTIONARIES.filter((dict) => dict.id !== PRIMARY);
      const results = await Promise.all(
        rest.map((dict) =>
          loadOne(dict.id).then(
            (id) => ({ id }),
            (err) => ({ id: dict.id, error: String(err) }),
          ),
        ),
      );
      self.postMessage({
        type: "complete",
        loaded: results
          .filter((result) => !result.error)
          .map((result) => result.id),
        failed: results.filter((result) => result.error),
      });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
    return;
  }

  if (msg.type === "check") {
    const out = {};
    for (const word of msg.words) {
      try {
        out[word] = isCorrect(word);
      } catch (_) {
        out[word] = true;
      }
    }
    self.postMessage({ type: "check", id: msg.id, results: out });
    return;
  }

  if (msg.type === "suggest") {
    let suggestions = [];
    try {
      suggestions = suggest(msg.word) || [];
    } catch (_) {
      suggestions = [];
    }
    self.postMessage({ type: "suggest", id: msg.id, suggestions });
    return;
  }
};
