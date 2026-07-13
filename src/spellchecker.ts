import type {
  CheckResponse,
  DictFailure,
  InitProgressMessage,
  SuggestResponse,
  WorkerResponse,
} from "./messages.ts";

export interface DictionaryInfo {
  id: string;
  label: string;
}

export const DICTIONARIES: DictionaryInfo[] = [
  { id: "mn_MN", label: "Монгол" },
  { id: "en_GB", label: "English (UK)" },
  { id: "en_US", label: "English (US)" },
];

export interface InitResult {
  loaded: string[];
  failed: DictFailure[];
  pending: string[];
  mnVersion: string | null;
  source: string | null;
  fallbackReason: string | null;
}

export interface CompleteResult {
  loaded: string[];
  failed: DictFailure[];
}

type RpcType = "check" | "suggest";
type RpcPayload = { words: string[] } | { word: string };

interface PendingEntry {
  resolve: (msg: CheckResponse | SuggestResponse) => void;
  type: RpcType;
  payload: RpcPayload;
}

export class MultiSpellChecker {
  worker: Worker;
  ready: boolean;
  loadedIds: string[];
  mnVersion: string | null;
  source: string | null;
  fallbackReason: string | null;
  restReady: Promise<CompleteResult>;
  dead: boolean;
  onFatal: ((reason: string) => void) | null;
  private _seq: number;
  private _pending: Map<number, PendingEntry>;
  private _initHandler: ((msg: InitProgressMessage) => void) | null;
  private _restResolve: ((value: CompleteResult) => void) | null;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
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
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) =>
      this._onMessage(e.data);
    this.worker.onerror = (e) =>
      this._fatal((e && e.message) || "worker error");
    this.worker.onmessageerror = () => this._fatal("worker message error");
  }

  _deadResult(
    type: RpcType,
    payload: RpcPayload,
  ): CheckResponse | SuggestResponse {
    if (type === "check") {
      const results: Record<string, boolean> = {};
      const words = "words" in payload ? payload.words : [];
      for (const word of words) results[word] = true;
      return { type: "check", id: 0, results };
    }
    return { type: "suggest", id: 0, suggestions: [] };
  }

  _fatal(reason: unknown): void {
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

  _onMessage(msg: WorkerResponse): void {
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

  init(base: string): Promise<InitResult> {
    return new Promise((resolve, reject) => {
      this._initHandler = (msg: InitProgressMessage) => {
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
          this._restResolve!({ loaded: msg.loaded, failed: msg.failed });
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

  whenComplete(): Promise<CompleteResult> {
    return this.restReady;
  }

  _rpc(
    type: RpcType,
    payload: RpcPayload,
  ): Promise<CheckResponse | SuggestResponse> {
    if (this.dead) return Promise.resolve(this._deadResult(type, payload));
    const id = ++this._seq;
    return new Promise((resolve) => {
      this._pending.set(id, { resolve, type, payload });
      this.worker.postMessage({ type, id, ...payload });
    });
  }

  async checkWords(words: string[]): Promise<Record<string, boolean>> {
    if (!this.ready || this.dead || !words.length) {
      const allCorrectResults: Record<string, boolean> = {};
      for (const word of words) allCorrectResults[word] = true;
      return allCorrectResults;
    }
    const msg = await this._rpc("check", { words });
    return msg.type === "check" ? msg.results : {};
  }

  async suggest(word: string): Promise<string[]> {
    if (!this.ready || this.dead) return [];
    const msg = await this._rpc("suggest", { word });
    return msg.type === "suggest" ? msg.suggestions || [] : [];
  }
}

const WORD_RE =
  /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'\u2019\u2013\u2014\u00AD-]*/gu;

export interface RawToken {
  word: string;
  index: number;
}

export function* tokenize(text: string): Generator<RawToken> {
  WORD_RE.lastIndex = 0;
  let match;
  while ((match = WORD_RE.exec(text)) !== null) {
    yield { word: match[0], index: match.index };
  }
}
