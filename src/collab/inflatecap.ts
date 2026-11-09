import { Inflate } from "fflate";
import { decodeCapped } from "../archive/capped.ts";

export const MAX_PLAIN_STATE = 128 * 1024 * 1024;

export function inflateCapped(
  data: Uint8Array,
  limit: number,
): Uint8Array | null {
  return decodeCapped((sink) => new Inflate(sink), data, limit);
}
