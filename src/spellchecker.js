import { gunzipSync } from 'fflate';

const decoder = new TextDecoder('utf-8');

export const DICTIONARIES = [
  { id: 'mn_MN', label: 'Монгол' },
  { id: 'en_GB', label: 'English (UK)' },
  { id: 'en_US', label: 'English (US)' },
];

const PRIMARY = 'mn_MN';

const asset = (p) => `${import.meta.env.BASE_URL}${p}`.replace(/([^:])\/{2,}/g, '$1/');

async function fetchGzText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const gzipped = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!gzipped) return decoder.decode(buf);
  if (typeof DecompressionStream === 'function') {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return decoder.decode(gunzipSync(buf));
}

async function loadManifest() {
  const res = await fetch(asset('dict/dict-manifest.json'));
  if (!res.ok) throw new Error('dict-manifest.json -> ' + res.status);
  const data = await res.json();
  const out = {};
  for (const e of data.dicts || []) out[e.id] = e;
  return out;
}

async function loadHunspellWasm() {
  const mod = await import('hunspell-wasm');
  const create =
    mod.createHunspellFromStrings || (mod.default && mod.default.createHunspellFromStrings);
  if (typeof create !== 'function') throw new Error('createHunspellFromStrings алга');
  const probe = await create('SET UTF-8\n', '1\nhello\n');
  if (!probe || typeof probe.testSpelling !== 'function') throw new Error('hunspell-wasm буруу');
  if (probe.dispose) probe.dispose();
  return {
    label: 'hunspell-wasm',
    build: async (aff, dic) => {
      const h = await create(aff, dic);
      return { spell: (w) => h.testSpelling(w), suggest: (w) => h.getSpellingSuggestions(w) };
    },
  };
}

async function loadNspell() {
  const mod = await import('nspell');
  const nspell = mod.default || mod;
  const probe = nspell('SET UTF-8\n', '1\nhello\n');
  if (!probe || typeof probe.correct !== 'function') throw new Error('nspell буруу');
  return {
    label: 'nspell (хялбаршуулсан)',
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

export class MultiSpellChecker {
  constructor() {
    this.instances = [];
    this.source = null;
    this.fallbackReason = null;
    this.mnVersion = null;
    this.manifest = null;
    this.backend = null;
    this.restReady = null;
  }

  async _loadOne({ id, label }) {
    const entry = this.manifest[id];
    if (!entry) throw new Error(id + ' manifest-д алга');
    const [aff, dic] = await Promise.all([
      fetchGzText(asset('dict/' + entry.aff)),
      fetchGzText(asset('dict/' + entry.dic)),
    ]);
    const inst = await this.backend.build(aff, dic, id);
    if (id === PRIMARY) {
      this.mnVersion =
        entry.version || aff.match(/^#?\s*Version:\s*(.+)$/m)?.[1].trim() || null;
    }
    this.instances.push({ id, label, inst });
    const order = (x) => DICTIONARIES.findIndex((d) => d.id === x.id);
    this.instances.sort((a, b) => order(a) - order(b));
    return id;
  }

  async init() {
    this.backend = await resolveBackend();
    this.source = this.backend.label;
    this.fallbackReason = this.backend.fallbackReason || null;
    this.manifest = await loadManifest();

    const loaded = [];
    const failed = [];

    const primary = DICTIONARIES.find((d) => d.id === PRIMARY);
    try {
      await this._loadOne(primary);
      loaded.push(PRIMARY);
    } catch (e) {
      failed.push({ id: PRIMARY, error: String(e) });
    }

    const rest = DICTIONARIES.filter((d) => d.id !== PRIMARY);
    this.restReady = Promise.all(
      rest.map((d) =>
        this._loadOne(d).then(
          (id) => ({ id }),
          (e) => ({ id: d.id, error: String(e) })
        )
      )
    );

    return {
      loaded,
      failed,
      pending: rest.map((d) => d.id),
      source: this.source,
      fallbackReason: this.fallbackReason,
      mnVersion: this.mnVersion,
    };
  }

  async whenComplete() {
    const results = await (this.restReady || Promise.resolve([]));
    return {
      loaded: results.filter((r) => !r.error).map((r) => r.id),
      failed: results.filter((r) => r.error),
    };
  }

  isCorrect(word) {
    if (!this.instances.length) return true;
    const cyr = /[\u0400-\u04FF\u1800-\u18AF]/.test(word);
    const lat = /[A-Za-z]/.test(word);
    if (lat && !cyr && !this.instances.some(({ id }) => id.startsWith('en'))) return true;
    return this.instances.some(({ inst }) => inst.spell(word));
  }

  suggest(word) {
    const cyr = /[\u0400-\u04FF\u1800-\u18AF]/.test(word);
    const lat = /[A-Za-z]/.test(word);
    let list = this.instances;
    if (cyr && !lat) {
      list = this.instances.filter(({ id }) => id.startsWith('mn'));
    } else if (lat && !cyr) {
      list = this.instances.filter(({ id }) => id.startsWith('en'));
    }
    if (!list.length) list = this.instances;

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
}

const WORD_RE = /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'\u2019-]*/gu;
export function* tokenize(text) {
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    yield { word: m[0], index: m.index };
  }
}
