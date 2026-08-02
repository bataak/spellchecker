import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyRawEdits, narrowEdit, planParagraph } from '../src/office/docx/edit.ts';
import { buildIndex, locate, planDocument, renderText, rewriteParts } from '../src/office/docx/index.ts';
import { parsePart } from '../src/office/docx/parse.ts';
import { decodeXmlText, encodeXmlText } from '../src/office/docx/xml.ts';
import type { ParagraphEdit } from '../src/office/docx/edit.ts';

const HEAD =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const TAIL = '</w:body></w:document>';

function doc(inner: string): string {
  return HEAD + inner + TAIL;
}

function run(text: string, props?: string): string {
  return `<w:r>${props ?? ''}<w:t>${text}</w:t></w:r>`;
}

function edit(start: number, end: number, text: string): ParagraphEdit {
  return { start, end, text };
}

function rewrite(xml: string, edits: ParagraphEdit[], paragraph = 0): string {
  const part = parsePart('word/document.xml', xml);
  const plan = planParagraph(part.paragraphs[paragraph], edits);
  return applyRawEdits(xml, plan.raw);
}

function textOf(xml: string, paragraph = 0): string {
  return parsePart('word/document.xml', xml).paragraphs[paragraph].text;
}

test('reads paragraph text across fragmented runs', () => {
  const xml = doc(`<w:p>${run('мон')}${run('гол')}${run(' улс')}</w:p>`);
  assert.equal(textOf(xml), 'монгол улс');
});

test('decodes entities and keeps offsets usable', () => {
  const xml = doc(`<w:p>${run('&#1199;&amp;г')}</w:p>`);
  assert.equal(textOf(xml), 'ү&г');
});

test('skips drawings, text boxes, field results and deleted text', () => {
  const xml = doc(
    '<w:p>' +
      run('эхлэл') +
      '<w:r><w:drawing><wp:inline><w:txbxContent><w:p>' +
      run('хайрцаг') +
      '</w:p></w:txbxContent></wp:inline></w:drawing></w:r>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText>PAGE</w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      run('12') +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
      '<w:del><w:r><w:delText>устсан</w:delText></w:r></w:del>' +
      run(' төгсгөл') +
      '</w:p>',
  );
  assert.equal(textOf(xml), 'эхлэл төгсгөл');
});

test('treats break, tab and soft hyphen as separators', () => {
  const xml = doc(
    `<w:p>${run('нэг')}<w:r><w:br/></w:r>${run('хоёр')}<w:r><w:tab/></w:r>` +
      `${run('гу')}<w:r><w:softHyphen/></w:r>${run('рав')}</w:p>`,
  );
  assert.equal(textOf(xml), 'нэг\nхоёр\tгу\u00adрав');
});

test('narrows a replacement to the differing span', () => {
  const narrowed = narrowEdit('харъяалал', 'харъяллын', 10);
  assert.equal(narrowed.start, 15);
  assert.equal(narrowed.end, 19);
  assert.equal(narrowed.text, 'ллын');
});

test('replaces a word that lives in a single run', () => {
  const xml = doc(`<w:p>${run('монгол улс')}</w:p>`);
  const out = rewrite(xml, [edit(0, 6, 'Монгол')]);
  assert.equal(textOf(out), 'Монгол улс');
  assert.ok(out.includes('<w:t>Монгол улс</w:t>'));
});

test('replaces a word split across runs with identical formatting', () => {
  const bold = '<w:rPr><w:b/></w:rPr>';
  const xml = doc(`<w:p>${run('хар', bold)}${run('ъяалал', bold)}${run(' нь', bold)}</w:p>`);
  const out = rewrite(xml, [edit(0, 9, 'харъяллын')]);
  assert.equal(textOf(out), 'харъяллын нь');
});

test('refuses to merge runs whose formatting differs', () => {
  const xml = doc(
    `<w:p>${run('мон', '<w:rPr><w:b/></w:rPr>')}${run('гол', '<w:rPr><w:i/></w:rPr>')}</w:p>`,
  );
  const part = parsePart('word/document.xml', xml);
  const plan = planParagraph(part.paragraphs[0], [edit(0, 6, 'мангал')]);
  assert.equal(plan.raw.length, 0);
  assert.equal(plan.skipped[0].reason, 'mixed-format');
});

test('ignores proofing language when comparing run formatting', () => {
  const mn = '<w:rPr><w:lang w:val="mn-MN"/></w:rPr>';
  const en = '<w:rPr><w:noProof/><w:lang w:val="en-US"/></w:rPr>';
  const xml = doc(`<w:p>${run('мон', mn)}${run('гол', en)}</w:p>`);
  const out = rewrite(xml, [edit(0, 6, 'Монгол')]);
  assert.equal(textOf(out), 'Монгол');
});

test('empties trailing runs instead of deleting the elements', () => {
  const xml = doc(`<w:p>${run('монг')}${run('оол')}</w:p>`);
  const out = rewrite(xml, [edit(0, 7, 'монгол')]);
  assert.equal(textOf(out), 'монгол');
  assert.equal(out.split('<w:r>').length, 3);
});

test('adds xml:space when the result gains edge whitespace', () => {
  const xml = doc(`<w:p>${run('монгол ')}${run('улс')}</w:p>`);
  const out = rewrite(xml, [edit(0, 6, 'мон')]);
  assert.ok(out.includes('xml:space="preserve"'));
  assert.equal(textOf(out), 'мон улс');
});

test('escapes replacement text', () => {
  const xml = doc(`<w:p>${run('AB')}</w:p>`);
  const out = rewrite(xml, [edit(0, 2, 'A&B<C')]);
  assert.ok(out.includes('A&amp;B&lt;C'));
  assert.equal(textOf(out), 'A&B<C');
});

test('drops stale proofErr and lastRenderedPageBreak in touched paragraphs', () => {
  const xml = doc(
    '<w:p><w:proofErr w:type="spellStart"/>' +
      run('монгол') +
      '<w:proofErr w:type="spellEnd"/><w:r><w:lastRenderedPageBreak/></w:r>' +
      run(' улс') +
      '</w:p>',
  );
  const out = rewrite(xml, [edit(0, 6, 'Монгол')]);
  assert.ok(!out.includes('w:proofErr'));
  assert.ok(!out.includes('lastRenderedPageBreak'));
  assert.equal(textOf(out), 'Монгол улс');
});

test('leaves untouched paragraphs byte identical', () => {
  const xml = doc(
    `<w:p><w:proofErr w:type="spellStart"/>${run('алдаа')}</w:p><w:p>${run('хоёр')}</w:p>`,
  );
  const out = rewrite(xml, [edit(0, 5, 'алдаагүй')]);
  assert.ok(out.includes(`<w:p>${run('хоёр')}</w:p>`));
});

test('rejects a span that crosses a line break', () => {
  const xml = doc(`<w:p>${run('нэг')}<w:r><w:br/></w:r>${run('хоёр')}</w:p>`);
  const part = parsePart('word/document.xml', xml);
  const plan = planParagraph(part.paragraphs[0], [edit(0, 8, 'нэгхоёр')]);
  assert.equal(plan.raw.length, 0);
  assert.equal(plan.skipped[0].reason, 'crosses-boundary');
});

test('applies several edits in one paragraph without shifting offsets', () => {
  const xml = doc(`<w:p>${run('нэг хоёр гурав')}</w:p>`);
  const out = rewrite(xml, [edit(0, 3, 'НЭГЭН'), edit(9, 14, 'ГУРВАН')]);
  assert.equal(textOf(out), 'НЭГЭН хоёр ГУРВАН');
});

test('reports overlapping edits instead of corrupting text', () => {
  const xml = doc(`<w:p>${run('монгол улс')}</w:p>`);
  const part = parsePart('word/document.xml', xml);
  const plan = planParagraph(part.paragraphs[0], [edit(0, 6, 'Монгол'), edit(3, 10, 'x')]);
  assert.equal(plan.skipped[0].reason, 'overlap');
  assert.equal(plan.applied.length, 1);
});

test('reads paragraphs inside table cells', () => {
  const xml = doc(`<w:tbl><w:tr><w:tc><w:p>${run('нүд')}</w:p></w:tc></w:tr></w:tbl>`);
  const part = parsePart('word/document.xml', xml);
  assert.equal(part.paragraphs.length, 1);
  assert.equal(part.paragraphs[0].text, 'нүд');
});

test('keeps hyperlink and insertion text in the flow', () => {
  const xml = doc(
    `<w:p><w:hyperlink r:id="rId4">${run('холбоос')}</w:hyperlink><w:ins>${run(' нэмсэн')}</w:ins></w:p>`,
  );
  assert.equal(textOf(xml), 'холбоос нэмсэн');
});

test('records the paragraph style', () => {
  const xml = doc(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Гарчиг')}</w:p>`);
  const part = parsePart('word/document.xml', xml);
  assert.equal(part.paragraphs[0].styleId, 'Heading1');
});

test('round trips text with no edits', () => {
  const xml = doc(`<w:p>${run('монгол')}</w:p>`);
  assert.equal(applyRawEdits(xml, []), xml);
});

test('encodes and decodes symmetrically', () => {
  const value = 'a & b < c > d';
  assert.equal(decodeXmlText(encodeXmlText(value)), value);
});

test('indexes paragraphs across parts with one newline between them', () => {
  const body = parsePart('word/document.xml', doc(`<w:p>${run('нэг')}</w:p><w:p>${run('хоёр')}</w:p>`));
  const header = parsePart('word/header1.xml', doc(`<w:p>${run('толгой')}</w:p>`));
  const index = buildIndex([body, header]);

  assert.equal(index.text, 'нэг\nхоёр\nтолгой');
  assert.deepEqual(index.starts, [0, 4, 9]);
  assert.equal(locate(index, 9)?.paragraph.part, 'word/header1.xml');
  assert.equal(locate(index, 4)?.local, 0);
});

test('routes edits to the part that owns the offset', () => {
  const body = parsePart('word/document.xml', doc(`<w:p>${run('нэг')}</w:p>`));
  const header = parsePart('word/header1.xml', doc(`<w:p>${run('толгой')}</w:p>`));
  const index = buildIndex([body, header]);
  const plan = planDocument(index, [{ start: 4, end: 10, text: 'ТОЛГОЙ' }]);
  const rewritten = rewriteParts([body, header], plan);

  assert.equal(plan.applied.length, 1);
  assert.equal(Object.keys(rewritten).length, 1);
  assert.ok(rewritten['word/header1.xml'].includes('ТОЛГОЙ'));
});

test('rejects an edit that spans a paragraph break', () => {
  const body = parsePart('word/document.xml', doc(`<w:p>${run('нэг')}</w:p><w:p>${run('хоёр')}</w:p>`));
  const index = buildIndex([body]);
  const plan = planDocument(index, [{ start: 0, end: 8, text: 'нэгхоёр' }]);

  assert.equal(plan.applied.length, 0);
  assert.equal(plan.skipped[0].reason, 'crosses-boundary');
});

test('renders pending edits onto the flat text', () => {
  const body = parsePart('word/document.xml', doc(`<w:p>${run('монгол улс')}</w:p>`));
  const index = buildIndex([body]);

  assert.equal(renderText(index, [{ start: 0, end: 6, text: 'Монгол' }]), 'Монгол улс');
});

test('absorbs a soft hyphen inside a replaced word', () => {
  const xml = doc(
    `<w:p>${run('симу')}<w:r><w:softHyphen/></w:r>${run('ляци')}</w:p>`,
  );
  assert.equal(textOf(xml), 'симу\u00adляци');

  const out = rewrite(xml, [edit(0, 9, 'загварчлал')]);
  assert.equal(textOf(out), 'загварчлал');
  assert.ok(!out.includes('softHyphen'));
});

test('leaves a soft hyphen alone when the edit does not reach it', () => {
  const xml = doc(`<w:p>${run('симу')}<w:r><w:softHyphen/></w:r>${run('ляци нь')}</w:p>`);
  const out = rewrite(xml, [edit(10, 12, 'бол')]);

  assert.ok(out.includes('<w:softHyphen/>'));
  assert.equal(textOf(out), 'симу\u00adляци бол');
});

test('still treats a line break as a hard boundary', () => {
  const xml = doc(`<w:p>${run('нэг')}<w:r><w:br/></w:r>${run('хоёр')}</w:p>`);
  const part = parsePart('word/document.xml', xml);
  const plan = planParagraph(part.paragraphs[0], [edit(0, 8, 'нэгхоёр')]);

  assert.equal(plan.skipped[0].reason, 'crosses-boundary');
});
