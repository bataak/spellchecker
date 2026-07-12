export const DICTIONARIES = [
  { id: "mn_MN", label: "Монгол" },
  { id: "en_GB", label: "English (UK)" },
  { id: "en_US", label: "English (US)" },
];

export class MultiSpellChecker {
  constructor() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    this.ready = false;
    this.loadedIds = [];
    this.mnVersion = null;
    this.source = null;
    this.fallbackReason = null;
    this._seq = 0;
    this._pending = new Map();
    this._initHandler = null;
    this._restResolve = null;
    this.restReady = new Promise((resolve) => (this._restResolve = resolve));
    this.dead = false;
    this.onFatal = null;
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) =>
      this._fatal((e && e.message) || "worker error");
    this.worker.onmessageerror = () => this._fatal("worker message error");
  }

  _deadResult(type, payload) {
    if (type === "check") {
      const results = {};
      for (const word of payload.words) results[word] = true;
      return { results };
    }
    return { suggestions: [] };
  }

  _fatal(reason) {
    if (this.dead) return;
    this.dead = true;
    const pendingList = [...this._pending.values()];
    this._pending.clear();
    for (const pending of pendingList)
      pending.resolve(this._deadResult(pending.type, pending.payload));
    if (!this.ready && this._initHandler) {
      this._initHandler({ type: "error", error: String(reason) });
    } else if (this.onFatal) {
      this.onFatal(String(reason));
    }
  }

  _onMessage(msg) {
    if (msg.type === "check" || msg.type === "suggest") {
      const pendingRequest = this._pending.get(msg.id);
      if (pendingRequest) {
        this._pending.delete(msg.id);
        pendingRequest.resolve(msg);
      }
      return;
    }
    if (this._initHandler) this._initHandler(msg);
  }

  init(base) {
    return new Promise((resolve, reject) => {
      this._initHandler = (msg) => {
        if (msg.type === "ready") {
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
        } else if (msg.type === "complete") {
          this.loadedIds = this.loadedIds.concat(msg.loaded);
          this._restResolve({ loaded: msg.loaded, failed: msg.failed });
        } else if (msg.type === "error") {
          if (this.ready) {
            if (this.onFatal) this.onFatal(String(msg.error));
          } else {
            reject(new Error(msg.error));
          }
        }
      };
      this.worker.postMessage({ type: "init", base });
    });
  }

  whenComplete() {
    return this.restReady;
  }

  _rpc(type, payload) {
    if (this.dead) return Promise.resolve(this._deadResult(type, payload));
    const id = ++this._seq;
    return new Promise((resolve) => {
      this._pending.set(id, { resolve, type, payload });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  async checkWords(words) {
    if (!this.ready || this.dead || !words.length) {
      const allCorrectResults = {};
      for (const word of words) allCorrectResults[word] = true;
      return allCorrectResults;
    }
    const msg = await this._rpc("check", { words });
    return msg.results;
  }

  async suggest(word) {
    if (!this.ready || this.dead) return [];
    const msg = await this._rpc("suggest", { word });
    return msg.suggestions || [];
  }
}

const WORD_RE =
  /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'\u2019\u2013\u2014\u00AD-]*/gu;
export function* tokenize(text) {
  WORD_RE.lastIndex = 0;
  let match;
  while ((match = WORD_RE.exec(text)) !== null) {
    yield { word: match[0], index: match.index };
  }
}
