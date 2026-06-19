import { unzipSync } from 'fflate';

const ZIP_NAME = 'dictionaries.zip';
const decoder = new TextDecoder('utf-8');
const toText = (b) => decoder.decode(b);

export const DICTIONARIES = [
  { id: 'mn_MN', label: 'Монгол' },
  { id: 'en_GB', label: 'English (UK)' },
  { id: 'en_US', label: 'English (US)' },
];

const asset = (p) => `${import.meta.env.BASE_URL}${p}`.replace(/([^:])\/{2,}/g, '$1/');

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadZipEntries() {
  let res;
  try {
    res = await fetch(asset('dict/' + ZIP_NAME));
  } catch (_) {
    return {};
  }
  if (!res || !res.ok) return {};
  const raw = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const out = {};
  for (const path in raw) {
    const base = path.split('/').pop();
    if (base) out[base] = raw[path];
  }
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
    this.zipUsed = false;
    this.fallbackReason = null;
    this.mnVersion = null;
  }

  async init() {
    const backend = await resolveBackend();
    this.source = backend.label;
    this.fallbackReason = backend.fallbackReason || null;

    const zip = await loadZipEntries();
    this.zipUsed = Object.keys(zip).length > 0;

    const loaded = [];
    const failed = [];

    await Promise.all(
      DICTIONARIES.map(async ({ id, label }) => {
        try {
          const affName = id + '.aff';
          const dicName = id + '.dic';
          let aff = zip[affName];
          let dic = zip[dicName];
          if (!aff || !dic) {
            const [a, d] = await Promise.all([
              aff || fetchBytes(asset('dict/' + affName)),
              dic || fetchBytes(asset('dict/' + dicName)),
            ]);
            aff = a;
            dic = d;
          }
          const affText = toText(aff);
          const inst = await backend.build(affText, toText(dic), id);
          if (id === 'mn_MN') {
            this.mnVersion = affText.match(/^#?\s*Version:\s*(.+)$/m)?.[1].trim() || null;
          }
          this.instances.push({ id, label, inst });
          loaded.push(id);
        } catch (e) {
          failed.push({ id, error: String(e) });
        }
      })
    );

    const order = (x) => DICTIONARIES.findIndex((d) => d.id === x.id);
    this.instances.sort((a, b) => order(a) - order(b));

    return {
      loaded,
      failed,
      source: this.source,
      zip: this.zipUsed,
      fallbackReason: this.fallbackReason,
      mnVersion: this.mnVersion,
    };
  }

  isCorrect(word) {
    if (!this.instances.length) return true;
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
