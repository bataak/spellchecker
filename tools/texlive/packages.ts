import { createHash } from "node:crypto";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { unxz } from "../../src/xz.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const OUT = join(ROOT, "public/tex");
const MODULE = join(ROOT, "src/texpackages.ts");
const TLPDB =
  process.env["TLPDB_URL"] ??
  "https://mirrors.ctan.org/systems/texlive/tlnet/tlpkg/texlive.tlpdb.xz";

const RUNTIME =
  /^(?:texmf-dist|RELOC)\/(?:tex\/(?:latex|generic|plain)\/|fonts\/(?:tfm|type1|vf|enc)\/|fonts\/map\/(?:dvips|pdftex)\/)/;
const SKIP =
  /(?:^README|^LICEN[CS]E|^CHANGES|\.(?:lua|md|txt|pdf|html?|png|jpe?g|ps|eps|pl|py|sh|bat|log|dtx|ins))$/i;
const MAP = /^add(?:Mixed)?Map\s+(\S+\.map)$/;
const KERNEL = new Set([
  "latex",
  "l3kernel",
  "l3backend",
  "latex-lab",
  "latex-firstaid",
  "latexconfig",
]);

interface Package {
  name: string;
  size: number;
  maps: string[];
  files: Set<string>;
}

function parseTlpdb(text: string): { year: number; packages: Package[] } {
  const packages: Package[] = [];
  let year = 0;
  let current: Package | null = null;
  let inRunfiles = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("name ")) {
      current = { name: line.slice(5), size: 0, maps: [], files: new Set() };
      packages.push(current);
      inRunfiles = false;
    } else if (!current) continue;
    else if (line.startsWith("containersize "))
      current.size = Number(line.slice(14));
    else if (line.startsWith("runfiles ")) inRunfiles = true;
    else if (/^(?:doc|src|bin)files /.test(line) || line === "")
      inRunfiles = false;
    else if (line.startsWith("execute ")) {
      const map = MAP.exec(line.slice(8).trim());
      if (map) current.maps.push(map[1]!);
    } else if (
      line.startsWith("depend release/") &&
      current.name === "00texlive.config"
    )
      year = Number(line.slice(15));
    else if (inRunfiles && line.startsWith(" ")) {
      const path = line.trim().split(" ")[0]!;
      const name = path.slice(path.lastIndexOf("/") + 1);
      if (RUNTIME.test(path) && !SKIP.test(name)) current.files.add(name);
    }
  }
  return { year, packages };
}

async function main(): Promise<void> {
  const response = await fetch(TLPDB);
  if (!response.ok) throw new Error("tlpdb: " + response.status);
  const text = new TextDecoder().decode(
    unxz(new Uint8Array(await response.arrayBuffer())),
  );
  const { year, packages } = parseTlpdb(text);
  if (!year) throw new Error("tlpdb: release year missing");

  const index: Record<string, [number, string[], string[]]> = {};
  for (const pkg of packages.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (pkg.name.includes(".") || pkg.files.size === 0 || KERNEL.has(pkg.name))
      continue;
    index[pkg.name] = [pkg.size, pkg.maps, [...pkg.files].sort()];
  }
  const json = JSON.stringify({ year, packages: index });
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);
  for (const name of readdirSync(OUT))
    if (/^packages-[0-9a-f]+\.json$/.test(name)) rmSync(join(OUT, name));
  writeFileSync(join(OUT, `packages-${hash}.json`), json);
  writeFileSync(
    MODULE,
    `export const TEX_PACKAGE_INDEX = "tex/packages-${hash}.json";\n` +
      `export const TEX_LIVE_YEAR = ${year};\n`,
  );
  const files = Object.values(index).reduce((n, [, , f]) => n + f.length, 0);
  console.log(
    `TeX Live ${year}: ${Object.keys(index).length} packages, ${files} files, ` +
      `${(json.length / 1048576).toFixed(2)} MB`,
  );
}

await main();
