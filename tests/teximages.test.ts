import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTexPath,
  rewriteIncludes,
  texImagePaths,
} from "../src/teximages.ts";

test("зургийн замыг ./-гүйгээр жигдлэнэ", () => {
  assert.equal(normalizeTexPath(" ./img/a.png "), "img/a.png");
  assert.equal(normalizeTexPath("././b.jpg"), "b.jpg");
  assert.equal(normalizeTexPath("../c.png"), "../c.png");
});

test("includegraphics бүрийн замыг давхардалгүй цуглуулна", () => {
  const text = String.raw`\includegraphics[width=250px]{./img/a.png}
\includegraphics {img/a.png}
\includegraphics[height=2cm]{b.jpg}`;
  assert.deepEqual(texImagePaths(text), ["img/a.png", "b.jpg"]);
});

test("олдсон зургийг engine-ийн нэрээр, олдоогүйг хүрээтэй замаар солино", () => {
  const text = String.raw`\includegraphics[width=250px]{./img/a.png} ба \includegraphics{x_y.png}`;
  assert.equal(
    rewriteIncludes(text, new Map([["img/a.png", "image1.png"]])),
    String.raw`\includegraphics[width=250px]{image1.png} ба \fbox{\ttfamily\detokenize{x_y.png}}`,
  );
});

test("макроор өгсөн зургийн замыг задалж олно", () => {
  const text = String.raw`\newcommand{\InstituteLogo}{img/logo.png}
\def\Dir{fig}
\includegraphics[height=1cm]{\InstituteLogo}
\includegraphics{\Dir/b.jpg}`;
  assert.deepEqual(texImagePaths(text), ["img/logo.png", "fig/b.jpg"]);
  assert.match(
    rewriteIncludes(text, new Map([["img/logo.png", "image1.png"]])),
    /\\includegraphics\[height=1cm\]\{image1\.png\}/,
  );
});
