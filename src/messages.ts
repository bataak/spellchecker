export interface DictFailure {
  id: string;
  error: string;
}

export interface InitRequest {
  type: "init";
  base: string;
}

export interface CheckRequest {
  type: "check";
  id: number;
  words: string[];
}

export interface SuggestRequest {
  type: "suggest";
  id: number;
  word: string;
}

export interface SetActiveRequest {
  type: "setActive";
  ids: string[];
}

export type WorkerRequest =
  | InitRequest
  | CheckRequest
  | SuggestRequest
  | SetActiveRequest;

export interface ReadyResponse {
  type: "ready";
  loaded: string[];
  failed: DictFailure[];
  pending: string[];
  mnVersion: string | null;
  source: string | null;
  fallbackReason: string | null;
}

export interface CompleteResponse {
  type: "complete";
  loaded: string[];
  failed: DictFailure[];
}

export interface ErrorResponse {
  type: "error";
  error: string;
}

export interface CheckResponse {
  type: "check";
  id: number;
  results: Record<string, boolean>;
}

export interface SuggestResponse {
  type: "suggest";
  id: number;
  suggestions: string[];
}

export type WorkerResponse =
  | ReadyResponse
  | CompleteResponse
  | ErrorResponse
  | CheckResponse
  | SuggestResponse;

export type InitProgressMessage =
  | ReadyResponse
  | CompleteResponse
  | ErrorResponse;
