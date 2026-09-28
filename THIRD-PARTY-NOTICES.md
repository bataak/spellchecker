# Third-party notices

The Mongolian spell checker (Монгол үгийн алдаа шалгагч) app
(`bataak/spellchecker`) is licensed under AGPL-3.0.
Copyright © 2026 Batmunkh Dorjgotov.

This file lists the third-party components bundled with the application or
used by the deployment, together with their licenses.

## Dictionaries

### mn_MN (dict-mn)

- Copyright: Batmunkh Dorjgotov
- License: MPL-2.0
- Source: https://github.com/bataak/dict-mn

### en_GB (Hunspell dictionary)

- Source: https://github.com/LibreOffice/dictionaries (`en/`)
- Based on Kevin Atkinson's English wordlist for Pspell/Aspell and extensively
  updated by David Bartlett, Brian Kelk, Andrew Brown and Marco A.G. Pinto; the
  affix file was written by David Bartlett and Andrew Brown
- License: LGPL
- Upstream: https://github.com/marcoagpinto/aoo-mozilla-en-dict
- See `public/dict/README_en_GB.txt` for the full notice

### en_US (Hunspell dictionary)

- Source: https://github.com/LibreOffice/dictionaries (`en/`)
- Derived from SCOWL (http://wordlist.aspell.net), copyright Kevin Atkinson;
  the affix file derives from Geoff Kuenning's Ispell
- License: BSD-style licenses of SCOWL and Ispell
- See `public/dict/README_en_US.txt` for the full notice

### Mongolian Language Concise Thesaurus (deployment only)

- Authors: Я. Цэвэл, Х. Лувсанбалдан (Ya. Tsevel, Kh. Luvsanbaldan)
- Source: https://toli.query.mn
- Terms: https://toli.query.mn/static/usage — redistribution and modification
  are permitted for non-commercial use with attribution
- This data is not included in this repository and is not covered by AGPL-3.0

## Libraries

### hunspell-wasm (bundles Hunspell)

- Source: https://github.com/bataak/hunspell-wasm — a fork of
  https://github.com/rotemdan/hunspell-wasm, built and vendored in
  `vendor/hunspell-wasm/`
- Hunspell: https://github.com/hunspell/hunspell
- License: LGPL-2.0 OR GPL-2.0 OR MPL-1.1 (tri-license)
- Full license texts: `vendor/hunspell-wasm/COPYING`, `COPYING.LESSER`,
  `COPYING.MPL`

### nspell

- Author: Titus Wormer
- Source: https://github.com/wooorm/nspell
- License: MIT

### SwiftLaTeX (PDF export engine)

- Source: https://github.com/SwiftLaTeX/SwiftLaTeX, release `v20022022`
  (pdfTeX 1.40.21 compiled to WebAssembly)
- License: AGPL-3.0; pdfTeX itself is GPL-2.0-or-later
- Shipped in `public/tex/<hash>/`; `swiftlatexpdftex.js` is modified by
  `tools/texlive/build.ts` so that it reads TeX files only from the bundle
  loaded in memory instead of fetching them from the SwiftLaTeX server

### TeX Live files (PDF export bundle)

- Source: TeX Live 2026, collected by `tools/texlive/build.ts` into
  `public/tex/texlive-<hash>.zip` (LaTeX kernel format, babel, amsmath,
  amsthm, eulervm, hyperref, beamer, paratype and their dependencies)
- License: each file keeps its own license, mostly the LaTeX Project Public
  License 1.3c; see the header of each file inside the archive
- Fonts: PT Serif / PT Sans / PT Mono (ParaType, SIL Open Font License 1.1),
  Computer Modern, AMS and Euler Type 1 fonts (American Mathematical Society,
  SIL Open Font License 1.1)

### pdfjs-dist (pdf.js)

- Copyright: Mozilla Foundation
- Source: https://github.com/mozilla/pdf.js
- License: Apache-2.0
- The NOTICE file is retained in the distribution

### Other production dependencies

All MIT licensed; see the `LICENSE` file inside each package.

| Package                                | Source                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| `@napi-rs/canvas`                      | https://github.com/Brooooooklyn/canvas                          |
| `fflate`                               | https://github.com/101arrowz/fflate                             |
| `is-buffer`                            | https://github.com/feross/is-buffer                             |
| `katex`                                | https://github.com/KaTeX/KaTeX                                  |
| `node-readable-to-web-readable-stream` | https://github.com/Borewit/node-readable-to-web-readable-stream |

## Fonts

### PT Serif

- Copyright: © 2010 ParaType Ltd.
- License: SIL Open Font License 1.1
- Full license text: `public/fonts/OFL.txt`
- The bundled files are a subset converted to `.woff2` and renamed to
  "Bichig Serif", so the modified version does not carry the original name

## Other

The list above covers the production dependencies reported by
`npx license-checker-rseidelsohn --production`. For anything added later, see
`npm ls --omit=dev` and the `LICENSE` file shipped with that package.
