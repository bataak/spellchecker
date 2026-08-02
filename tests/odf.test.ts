import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planParagraph } from '../src/office/docx/edit.ts';
import { applyRawEdits } from '../src/office/docx/edit.ts';
import { parseOdfPart } from '../src/office/odf/parse.ts';

const HEAD =
  '<?xml version="1.0" encoding="UTF-8"?><office:document-content ' +
  'xmlns:office="urn:o" xmlns:text="urn:t" xmlns:draw="urn:d">' +
  '<office:body><office:text>';
const TAIL = '</office:text></office:body></office:document-content>';

function doc(inner: string): string {
  return HEAD + inner + TAIL;
}

function partOf(xml: string) {
  return parseOdfPart('content.xml', xml);
}

function rewrite(xml: string, start: number, end: number, text: string, index = 0): string {
  const part = partOf(xml);
  const plan = planParagraph(part.paragraphs[index], [{ start, end, text }]);
  return applyRawEdits(xml, plan.raw);
}

test('reads character data straight out of a paragraph', () => {
  const part = partOf(doc('<text:p>монгол улс</text:p>'));
  assert.equal(part.paragraphs.length, 1);
  assert.equal(part.paragraphs[0].text, 'монгол улс');
});

test('joins text across spans', () => {
  const part = partOf(
    doc('<text:p>мон<text:span text:style-name="T1">гол</text:span> улс</text:p>'),
  );
  assert.equal(part.paragraphs[0].text, 'монгол улс');
});

test('treats headings as paragraphs', () => {
  const part = partOf(doc('<text:h text:outline-level="1">Гарчиг</text:h>'));
  assert.equal(part.paragraphs[0].text, 'Гарчиг');
  assert.equal(part.paragraphs.length, 1);
});

test('expands text:s into spaces and text:tab into a tab', () => {
  const part = partOf(doc('<text:p>а<text:s text:c="3"/>б<text:tab/>в</text:p>'));
  assert.equal(part.paragraphs[0].text, 'а   б\tв');
});

test('treats a line break as a separator', () => {
  const part = partOf(doc('<text:p>нэг<text:line-break/>хоёр</text:p>'));
  assert.equal(part.paragraphs[0].text, 'нэг\nхоёр');
});

test('skips annotations and embedded images', () => {
  const part = partOf(
    doc(
      '<text:p>эхлэл<office:annotation><text:p>тайлбар</text:p></office:annotation>' +
        '<draw:image xlink:href="x.png"/> төгсгөл</text:p>',
    ),
  );
  assert.equal(part.paragraphs[0].text, 'эхлэл төгсгөл');
});

test('ignores a nested paragraph instead of corrupting the outer one', () => {
  const part = partOf(
    doc('<text:p>гадна<draw:frame><draw:text-box><text:p>дотор</text:p></draw:text-box></draw:frame> үг</text:p>'),
  );
  assert.equal(part.paragraphs.length, 1);
  assert.equal(part.paragraphs[0].text, 'гадна үг');
});

test('records the paragraph style', () => {
  const part = partOf(doc('<text:p text:style-name="P3">бичвэр</text:p>'));
  assert.equal(part.paragraphs[0].styleId, 'P3');
});

test('decodes entities', () => {
  const part = partOf(doc('<text:p>&quot;Чингис&quot; &amp; тэр</text:p>'));
  assert.equal(part.paragraphs[0].text, '"Чингис" & тэр');
});

test('replaces a word inside a single text node', () => {
  const xml = doc('<text:p>монгол улс</text:p>');
  const out = rewrite(xml, 0, 6, 'Монгол');
  assert.equal(partOf(out).paragraphs[0].text, 'Монгол улс');
});

test('replaces a word that spans a span boundary with the same style', () => {
  const xml = doc('<text:p>хар<text:span>ъяалал</text:span></text:p>');
  const part = partOf(xml);
  const plan = planParagraph(part.paragraphs[0], [{ start: 0, end: 9, text: 'харъяллын' }]);
  assert.equal(plan.skipped.length, 0);
});

test('refuses to merge across spans with different styles', () => {
  const xml = doc(
    '<text:p><text:span text:style-name="T1">мон</text:span>' +
      '<text:span text:style-name="T2">гол</text:span></text:p>',
  );
  const part = partOf(xml);
  const plan = planParagraph(part.paragraphs[0], [{ start: 0, end: 6, text: 'мангал' }]);
  assert.equal(plan.raw.length, 0);
  assert.equal(plan.skipped[0].reason, 'mixed-format');
});

test('escapes replacement text', () => {
  const xml = doc('<text:p>AB</text:p>');
  const out = rewrite(xml, 0, 2, 'A&B<C');
  assert.ok(out.includes('A&amp;B&lt;C'));
  assert.equal(partOf(out).paragraphs[0].text, 'A&B<C');
});

test('absorbs a spacer element when the replacement covers it', () => {
  const xml = doc('<text:p>а<text:s/>б</text:p>');
  assert.equal(partOf(xml).paragraphs[0].text, 'а б');
  const out = rewrite(xml, 0, 3, 'аб');
  assert.equal(partOf(out).paragraphs[0].text, 'аб');
  assert.ok(!out.includes('text:s'));
});

test('leaves untouched paragraphs byte identical', () => {
  const xml = doc('<text:p>нэг</text:p><text:p>хоёр</text:p>');
  const out = rewrite(xml, 0, 3, 'НЭГ');
  assert.ok(out.includes('<text:p>хоёр</text:p>'));
});
