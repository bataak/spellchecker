export const DICTIONARIES = [
  { id: 'mn_MN', label: 'Монгол' },
  { id: 'en_GB', label: 'English (UK)' },
  { id: 'en_US', label: 'English (US)' },
];

export class MultiSpellChecker {
  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.ready = false;
    this.loadedIds = [];
    this.mnVersion = null;
    this.source = null;
    this.fallbackReason = null;
    this._seq = 0;
    this._pending = new Map();
    this._initHandler = null;
    this._restResolve = null;
    this.restReady = new Promise((r) => (this._restResolve = r));
    this.worker.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    if (msg.type === 'check' || msg.type === 'suggest') {
      const p = this._pending.get(msg.id);
      if (p) {
        this._pending.delete(msg.id);
        p(msg);
      }
      return;
    }
    if (this._initHandler) this._initHandler(msg);
  }

  init(base) {
    return new Promise((resolve, reject) => {
      this._initHandler = (msg) => {
        if (msg.type === 'ready') {
          this.ready = true;
          this.loadedIds = msg.loaded.slice();
          this.mnVersion = msg.mnVersion;
          this.source = msg.source;
          this.fallbackReason = msg.fallbackReason;
          resolve({
            loaded: msg.loaded,
            failed: msg.failed,
            pending: msg.pending,
            mnVersion: msg.mnVersion,
            source: msg.source,
            fallbackReason: msg.fallbackReason,
          });
        } else if (msg.type === 'complete') {
          this.loadedIds = this.loadedIds.concat(msg.loaded);
          this._restResolve({ loaded: msg.loaded, failed: msg.failed });
        } else if (msg.type === 'error') {
          reject(new Error(msg.error));
        }
      };
      this.worker.postMessage({ type: 'init', base });
    });
  }

  whenComplete() {
    return this.restReady;
  }

  _rpc(type, payload) {
    const id = ++this._seq;
    return new Promise((resolve) => {
      this._pending.set(id, resolve);
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  async checkWords(words) {
    if (!this.ready || !words.length) {
      const r = {};
      for (const w of words) r[w] = true;
      return r;
    }
    const msg = await this._rpc('check', { words });
    return msg.results;
  }

  async suggest(word) {
    if (!this.ready) return [];
    const msg = await this._rpc('suggest', { word });
    return msg.suggestions;
  }
}

const WORD_RE = /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'\u2019\u2013\u2014\u00AD-]*/gu;
export function* tokenize(text) {
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    yield { word: m[0], index: m.index };
  }
}
