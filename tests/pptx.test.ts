import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyRawEdits, planParagraph } from '../src/office/docx/edit.ts';
import { parsePart, SLIDE_VOCAB } from '../src/office/docx/parse.ts';

const HEAD =
  '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="urn:a" xmlns:p="urn:p">' +
  '<p:cSld><p:spTree>';
const TAIL = '</p:spTree></p:cSld></p:sld>';

function slide(inner: string): string {
  return HEAD + inner + TAIL;
}

function run(text: string, props = ''): string {
  return `<a:r>${props}<a:t>${text}</a:t></a:r>`;
}

function partOf(xml: string) {
  return parsePart('ppt/slides/slide1.xml', xml, SLIDE_VOCAB);
}

test('reads slide paragraphs', () => {
  const part = partOf(slide(`<a:p>${run('Монгол')}${run(' бичиг')}</a:p>`));
  assert.equal(part.paragraphs.length, 1);
  assert.equal(part.paragraphs[0].text, 'Монгол бичиг');
});

test('keeps each paragraph separate', () => {
  const part = partOf(slide(`<a:p>${run('нэг')}</a:p><a:p>${run('хоёр')}</a:p>`));
  assert.deepEqual(
    part.paragraphs.map((p) => p.text),
    ['нэг', 'хоёр'],
  );
});

test('treats a:br as a line break', () => {
  const part = partOf(slide(`<a:p>${run('нэг')}<a:br/>${run('хоёр')}</a:p>`));
  assert.equal(part.paragraphs[0].text, 'нэг\nхоёр');
});

test('skips field text', () => {
  const part = partOf(
    slide(`<a:p>${run('хуудас ')}<a:fld id="1" type="slidenum"><a:t>7</a:t></a:fld></a:p>`),
  );
  assert.equal(part.paragraphs[0].text, 'хуудас ');
});

test('replaces a word split across runs with identical formatting', () => {
  const props = '<a:rPr b="1"/>';
  const xml = slide(`<a:p>${run('хар', props)}${run('ъяалал', props)}</a:p>`);
  const part = partOf(xml);
  const plan = planParagraph(part.paragraphs[0], [{ start: 0, end: 9, text: 'харъяллын' }]);
  const out = applyRawEdits(xml, plan.raw);

  assert.equal(plan.skipped.length, 0);
  assert.equal(partOf(out).paragraphs[0].text, 'харъяллын');
});

test('refuses runs whose formatting differs', () => {
  const xml = slide(
    `<a:p>${run('мон', '<a:rPr b="1"/>')}${run('гол', '<a:rPr i="1"/>')}</a:p>`,
  );
  const plan = planParagraph(partOf(xml).paragraphs[0], [
    { start: 0, end: 6, text: 'мангал' },
  ]);

  assert.equal(plan.raw.length, 0);
  assert.equal(plan.skipped[0].reason, 'mixed-format');
});

test('rewrites a:t and leaves the rest untouched', () => {
  const xml = slide(`<a:p>${run('монгол улс')}</a:p>`);
  const plan = planParagraph(partOf(xml).paragraphs[0], [
    { start: 0, end: 6, text: 'Монгол' },
  ]);
  const out = applyRawEdits(xml, plan.raw);

  assert.ok(out.includes('<a:t>Монгол улс</a:t>'));
  assert.ok(out.includes('<p:cSld><p:spTree>'));
});
