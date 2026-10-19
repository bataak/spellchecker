export interface SpellerInstance {
  spell: (word: string) => boolean;
  suggest: (word: string) => string[];
  stem?: (word: string) => string[];
  analyze?: (word: string) => string[];
  dispose?: () => void;
}

export interface SpellBackend {
  label: string;
  fallbackReason?: string;
  build: (
    aff: Uint8Array,
    dic: Uint8Array,
    id?: string,
  ) => Promise<SpellerInstance>;
}

const utf8 = new TextDecoder("utf-8");

async function loadHunspellWasm(): Promise<SpellBackend> {
  const mod = await import("hunspell-wasm");
  const create = mod.createHunspellFromStrings;
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
      const canStem = typeof hunspellInstance.stemWord === "function";
      const canAnalyze = typeof hunspellInstance.analyzeWord === "function";
      return {
        spell: (word) => hunspellInstance.testSpelling(word),
        suggest: (word) => hunspellInstance.getSpellingSuggestions(word),
        ...(canStem
          ? { stem: (word: string) => hunspellInstance.stemWord(word) }
          : {}),
        ...(canAnalyze
          ? { analyze: (word: string) => hunspellInstance.analyzeWord(word) }
          : {}),
        dispose: () => {
          if (hunspellInstance.dispose) hunspellInstance.dispose();
        },
      };
    },
  };
}

async function loadNspell(): Promise<SpellBackend> {
  const mod = await import("nspell");
  const nspell = mod.default || mod;
  const probe = nspell("SET UTF-8\n", "1\nhello\n");
  if (!probe || typeof probe.correct !== "function")
    throw new Error("nspell буруу");
  return {
    label: "nspell (хялбаршуулсан)",
    build: async (aff, dic) => {
      const nspellInstance = nspell(utf8.decode(aff), utf8.decode(dic));
      return {
        spell: (word) => nspellInstance.correct(word),
        suggest: (word) => nspellInstance.suggest(word),
      };
    },
  };
}

export async function resolveBackend(): Promise<SpellBackend> {
  try {
    return await loadHunspellWasm();
  } catch (wasmError) {
    const reason =
      wasmError instanceof Error ? wasmError.message : String(wasmError);
    const fallbackBackend = await loadNspell();
    fallbackBackend.fallbackReason = reason;
    return fallbackBackend;
  }
}
