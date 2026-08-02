import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeRanges, inRanges, mergeRanges, skipRanges } from '../src/codeskip.ts';

function skipped(text: string, word: string): boolean {
  return inRanges(codeRanges(text), text.indexOf(word));
}

test('returns nothing for plain prose', () => {
  assert.deepEqual(codeRanges('Энэ бол энгийн бичвэр.'), []);
});

test('skips a fenced block', () => {
  const text = 'Өмнөх мөр.\n```js\nconst foo = bar;\n```\nДараах мөр.';

  assert.ok(skipped(text, 'const'));
  assert.ok(skipped(text, 'foo'));
  assert.ok(!skipped(text, 'Өмнөх'));
  assert.ok(!skipped(text, 'Дараах'));
});

test('skips a tilde fence', () => {
  const text = 'Мөр.\n~~~\nnpm install\n~~~\nТөгсгөл.';

  assert.ok(skipped(text, 'install'));
  assert.ok(!skipped(text, 'Төгсгөл'));
});

test('closes an unterminated fence at the end of the text', () => {
  const text = 'Мөр.\n```\nnpm run build';

  assert.ok(skipped(text, 'build'));
  assert.ok(!skipped(text, 'Мөр'));
});

test('does not treat a longer fence as a different marker', () => {
  const text = 'a\n````\ncode here\n````\nb';
  assert.ok(skipped(text, 'code'));
  assert.ok(!skipped(text, 'b'));
});

test('skips inline code', () => {
  const text = 'Энд `npm install` гэж бичнэ.';

  assert.ok(skipped(text, 'npm'));
  assert.ok(skipped(text, 'install'));
  assert.ok(!skipped(text, 'Энд'));
  assert.ok(!skipped(text, 'бичнэ'));
});

test('matches double backtick delimiters', () => {
  const text = 'Тэмдэг ``a ` b`` дотор.';

  assert.ok(skipped(text, 'a `'));
  assert.ok(!skipped(text, 'дотор'));
});

test('leaves an unmatched backtick alone', () => {
  const text = 'Энэ ` ганц тэмдэг байна.';
  assert.ok(!skipped(text, 'ганц'));
});

test('does not let inline code cross a blank line', () => {
  const text = 'Эхлэл `нээсэн\n\nхоёрдугаар` мөр.';
  assert.ok(!skipped(text, 'хоёрдугаар'));
});

test('skips html code elements', () => {
  const text = 'Үзүүлбэр <code>getElementById</code> ба <pre>npm test</pre> дуусав.';

  assert.ok(skipped(text, 'getElementById'));
  assert.ok(skipped(text, 'npm'));
  assert.ok(!skipped(text, 'Үзүүлбэр'));
  assert.ok(!skipped(text, 'дуусав'));
});

test('merges touching ranges', () => {
  assert.deepEqual(
    mergeRanges([
      { start: 0, end: 5 },
      { start: 3, end: 9 },
      { start: 20, end: 25 },
    ]),
    [
      { start: 0, end: 9 },
      { start: 20, end: 25 },
    ],
  );
});

test('binary search reports membership correctly', () => {
  const ranges = [
    { start: 10, end: 20 },
    { start: 40, end: 45 },
  ];

  assert.ok(!inRanges(ranges, 9));
  assert.ok(inRanges(ranges, 10));
  assert.ok(inRanges(ranges, 19));
  assert.ok(!inRanges(ranges, 20));
  assert.ok(inRanges(ranges, 44));
  assert.ok(!inRanges(ranges, 100));
});

test('an indented paragraph is not treated as code', () => {
  const text = 'Энгийн мөр.\n    Догол мөр эхэлсэн бичвэр.';
  assert.ok(!skipped(text, 'Догол'));
});

test('skips a markdown link target but keeps the label', () => {
  const text = 'Толь нь [Hunspell](http://hunspell.github.io) дээр тулгуурлана.';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('hunspell.github')));
  assert.ok(!inRanges(ranges, text.indexOf('Hunspell')));
  assert.ok(!inRanges(ranges, text.indexOf('Толь')));
  assert.ok(!inRanges(ranges, text.indexOf('тулгуурлана')));
});

test('keeps label words that also appear in the url', () => {
  const text = '[LibreOffice extensions](https://extensions.libreoffice.org/en/show/1980)';
  const ranges = skipRanges(text);

  assert.ok(!inRanges(ranges, text.indexOf('extensions')));
  assert.ok(inRanges(ranges, text.indexOf('extensions.libreoffice')));
  assert.ok(inRanges(ranges, text.indexOf('libreoffice.org')));
});

test('skips a relative link target', () => {
  const text = 'Заавар [энд](./docs/hunspell-guide.md) байна.';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('docs')));
  assert.ok(!inRanges(ranges, text.indexOf('энд')));
  assert.ok(!inRanges(ranges, text.indexOf('байна')));
});

test('skips bare urls, www hosts and autolinks', () => {
  const text = 'Үз https://zuv.bichig.dev/core/ бас www.bichig.dev мөн <https://a.example.org/x>.';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('zuv')));
  assert.ok(inRanges(ranges, text.indexOf('www.bichig')));
  assert.ok(inRanges(ranges, text.indexOf('a.example')));
  assert.ok(!inRanges(ranges, text.indexOf('Үз')));
  assert.ok(!inRanges(ranges, text.indexOf('бас')));
  assert.ok(!inRanges(ranges, text.indexOf('мөн')));
});

test('skips an email address', () => {
  const text = 'Холбоо барих: bataa@example.com хаягаар.';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('bataa@')));
  assert.ok(!inRanges(ranges, text.indexOf('Холбоо')));
  assert.ok(!inRanges(ranges, text.indexOf('хаягаар')));
});

test('skips a reference definition target but keeps its title', () => {
  const text = '[toli]: https://zuv.bichig.dev/book/ "Монгол толь"';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('zuv')));
  assert.ok(!inRanges(ranges, text.indexOf('Монгол')));
});

test('leaves ordinary sentences with brackets alone', () => {
  const text = 'Тэр (2026 онд) ирсэн бөгөөд [тэмдэглэл] үлдээв.';
  assert.deepEqual(skipRanges(text), []);
});

test('links can be disabled independently of code', () => {
  const text = 'Үз https://a.example.org/x бас `npm run build` гэж.';

  const codeOnly = skipRanges(text, { links: false });
  assert.ok(!inRanges(codeOnly, text.indexOf('a.example')));
  assert.ok(inRanges(codeOnly, text.indexOf('npm')));

  const linksOnly = skipRanges(text, { code: false });
  assert.ok(inRanges(linksOnly, text.indexOf('a.example')));
  assert.ok(!inRanges(linksOnly, text.indexOf('npm')));
});

test('skips a bare domain written without a scheme', () => {
  const text = 'Дэлгэрэнгүйг aldaa.bichig.dev дээрээс үзнэ үү.';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('aldaa')));
  assert.ok(!inRanges(ranges, text.indexOf('Дэлгэрэнгүйг')));
  assert.ok(!inRanges(ranges, text.indexOf('дээрээс')));
});

test('skips a link label that is itself a domain', () => {
  const text = 'Хаяг: [zuv.bichig.dev](https://zuv.bichig.dev/) байна.';
  const ranges = skipRanges(text);

  assert.ok(inRanges(ranges, text.indexOf('zuv')));
  assert.ok(!inRanges(ranges, text.indexOf('Хаяг')));
  assert.ok(!inRanges(ranges, text.indexOf('байна')));
});

test('keeps an ordinary link label that only looks technical', () => {
  const text = '[Sublime Text](https://packagecontrol.io/packages/Dictionaries)';
  const ranges = skipRanges(text);

  assert.ok(!inRanges(ranges, text.indexOf('Sublime')));
  assert.ok(!inRanges(ranges, text.indexOf('Text')));
  assert.ok(inRanges(ranges, text.indexOf('packagecontrol')));
});

test('does not treat file names as domains', () => {
  for (const name of ['README.md', 'index.html', 'style.css', 'Node.js', 'mn_MN.aff']) {
    const text = 'Файл нь ' + name + ' нэртэй.';
    assert.deepEqual(skipRanges(text), [], name);
  }
});

test('does not treat a missing space after a full stop as a domain', () => {
  const text = 'Ажил дууслаа.Дараа нь шалгана.';
  assert.deepEqual(skipRanges(text), []);
});

test('does not treat decimal numbers as domains', () => {
  const text = 'Хувилбар 2.5 болон 1.3.3 гарсан.';
  assert.deepEqual(skipRanges(text), []);
});

test('inline code never crosses a line break', () => {
  const text = 'Тэр ` тэмдэгт хэрэглэв.\nДараа нь ` дахин бичив.';
  const ranges = skipRanges(text);

  assert.deepEqual(ranges, []);
  assert.ok(!inRanges(ranges, text.indexOf('тэмдэгт')));
  assert.ok(!inRanges(ranges, text.indexOf('дахин')));
});

test('inline code still works within one line', () => {
  const text = 'Эхлээд `npm test` дараа нь `npm run build` ажиллуулна.';
  const ranges = skipRanges(text);

  assert.equal(ranges.length, 2);
  assert.ok(inRanges(ranges, text.indexOf('npm')));
  assert.ok(!inRanges(ranges, text.indexOf('дараа')));
});
