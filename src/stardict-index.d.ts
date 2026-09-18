declare module "virtual:stardict-index" {
  import type { DictListEntry } from "./dictindex.ts";
  const dicts: DictListEntry[];
  export default dicts;
}
