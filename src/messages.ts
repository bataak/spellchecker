import type { DictEntry } from "./stardict.ts";

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

export interface LookupRequest {
  type: "lookup";
  id: number;
  words: string[];
}

export interface DefineRequest {
  type: "define";
  id: number;
  word: string;
}

export interface SetActiveRequest {
  type: "setActive";
  ids: string[];
}

export interface RefreshRequest {
  type: "refresh";
}

export type WorkerRequest =
  | InitRequest
  | CheckRequest
  | SuggestRequest
  | LookupRequest
  | DefineRequest
  | SetActiveRequest
  | RefreshRequest;

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

export interface DictUpdatedResponse {
  type: "dictUpdated";
  id: string;
  version: string | null;
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

export interface LookupResponse {
  type: "lookup";
  id: number;
  found: Record<string, string> | null;
}

export interface DefineResponse {
  type: "define";
  id: number;
  source: string;
  entries: DictEntry[];
}

export type RpcResponse =
  | CheckResponse
  | SuggestResponse
  | LookupResponse
  | DefineResponse;

export type WorkerResponse =
  | ReadyResponse
  | CompleteResponse
  | ErrorResponse
  | DictUpdatedResponse
  | RpcResponse;

export type InitProgressMessage =
  | ReadyResponse
  | CompleteResponse
  | ErrorResponse;
