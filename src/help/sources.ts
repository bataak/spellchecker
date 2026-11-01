import { readFileSync, readdirSync } from "node:fs";
import { SECTIONS, type PageSource } from "./site.ts";

const MD = ".md";

export function readSources(dir: string): PageSource[] {
  return SECTIONS.flatMap((section) =>
    readdirSync(dir + "/" + section.id)
      .filter((file) => file.endsWith(MD))
      .map((file) => ({
        section: section.id,
        name: file.slice(0, -MD.length),
        text: readFileSync(dir + "/" + section.id + "/" + file, "utf-8"),
      })),
  );
}
