# Changelog

## [1.64.4](https://github.com/bataak/spellchecker/compare/v1.64.3...v1.64.4) (2026-08-07)


### Bug Fixes

* convert Cyrillic letters encoded as non-letter symbols ([ceb33ff](https://github.com/bataak/spellchecker/commit/ceb33ff3b40983e0c9e9ffa6b08b6f98faba40ae))

## [1.64.3](https://github.com/bataak/spellchecker/compare/v1.64.2...v1.64.3) (2026-08-07)


### Bug Fixes

* read PDF text via the stream reader for Safari compatibility ([8af7d2e](https://github.com/bataak/spellchecker/commit/8af7d2ea80f840988fd80cc272675b3ba488f262))

## [1.64.2](https://github.com/bataak/spellchecker/compare/v1.64.1...v1.64.2) (2026-08-06)


### Bug Fixes

* repair mixed Unicode and mojibake text word by word ([ccf15de](https://github.com/bataak/spellchecker/commit/ccf15de2dd1971b296202292976013ce9f6f24d8))

## [1.64.1](https://github.com/bataak/spellchecker/compare/v1.64.0...v1.64.1) (2026-08-06)


### Bug Fixes

* use the pdfjs legacy build so PDF text extraction works in Safari ([4db7885](https://github.com/bataak/spellchecker/commit/4db7885674c2c3bc729a5620e4aae880023fdb0c))

## [1.64.0](https://github.com/bataak/spellchecker/compare/v1.63.0...v1.64.0) (2026-08-06)


### Features

* read text from PDF files with cp1251 and T2A encoding repair ([f8ca944](https://github.com/bataak/spellchecker/commit/f8ca944c6519e6ec85f107effb4107072eba6d29))

## [1.63.0](https://github.com/bataak/spellchecker/compare/v1.62.1...v1.63.0) (2026-08-06)


### Features

* show a reload control when the running bundle is out of date ([d6069d8](https://github.com/bataak/spellchecker/commit/d6069d865fd98c1876f51b750f75a87a6cba0597))

## [1.62.1](https://github.com/bataak/spellchecker/compare/v1.62.0...v1.62.1) (2026-08-06)


### Bug Fixes

* keep placeholder title larger than note on narrow screens ([066256a](https://github.com/bataak/spellchecker/commit/066256a653c4fedab0f433688889683b8ccf7d9d))

## [1.62.0](https://github.com/bataak/spellchecker/compare/v1.61.2...v1.62.0) (2026-08-05)


### Features

* refresh the Mongolian dictionary in the background when a newer version is published ([c46bf13](https://github.com/bataak/spellchecker/commit/c46bf1328d9b873a47d0f14cd724afc30eb4a7cc))

## [1.61.2](https://github.com/bataak/spellchecker/compare/v1.61.1...v1.61.2) (2026-08-03)


### Bug Fixes

* split words joined by long dashes or repeated hyphens ([79c8a54](https://github.com/bataak/spellchecker/commit/79c8a545d5dc592a01021e2b33e8760b3f5c1b24))

## [1.61.1](https://github.com/bataak/spellchecker/compare/v1.61.0...v1.61.1) (2026-08-03)


### Performance Improvements

* lazy-load office mode by extracting filename helper ([8a4c775](https://github.com/bataak/spellchecker/commit/8a4c7751dde091bb58421eff5113ae2ef3283b36))

## [1.61.0](https://github.com/bataak/spellchecker/compare/v1.60.0...v1.61.0) (2026-08-03)


### Features

* mention docx and pptx file checking in empty state tips ([34242cd](https://github.com/bataak/spellchecker/commit/34242cdd45bd202a6b060cac003224df97fe48c9))

## [1.60.0](https://github.com/bataak/spellchecker/compare/v1.59.0...v1.60.0) (2026-08-03)


### Features

* add bold weight to bundled editor serif ([6318f75](https://github.com/bataak/spellchecker/commit/6318f752c71620c9247612068c06c1e646640b38))


### Bug Fixes

* align backdrop and editor padding on narrow screens ([c9b70c0](https://github.com/bataak/spellchecker/commit/c9b70c03019226692bb9fa308b9c5743ae272439))

## [1.59.0](https://github.com/bataak/spellchecker/compare/v1.58.0...v1.59.0) (2026-08-03)


### Features

* bundle PT Serif Cyrillic subset for deterministic editor metrics ([9c44552](https://github.com/bataak/spellchecker/commit/9c44552ff3a8aaed7d2f7385fc18b4b4bbdc663b))
* preload and precache the editor webfont ([e302956](https://github.com/bataak/spellchecker/commit/e302956cd5c109ed6c8333bf18e9f9e3fe58d957))


### Bug Fixes

* pin editor font metrics and share line-height between editor and gutter ([cd82d97](https://github.com/bataak/spellchecker/commit/cd82d97562e8e37f0ed70d6fe83a22390f30275a))
* re-render backdrop after fonts finish loading ([6683348](https://github.com/bataak/spellchecker/commit/6683348fee7ce93e25d9d4a5cb51b48c7aecb8ce))

## [1.58.0](https://github.com/bataak/spellchecker/compare/v1.57.2...v1.58.0) (2026-08-03)


### Features

* show survey only on the seventh day of use ([74efff3](https://github.com/bataak/spellchecker/commit/74efff33b9396ed562fe831c0a5f2976df113f2e))

## [1.57.2](https://github.com/bataak/spellchecker/compare/v1.57.1...v1.57.2) (2026-08-02)


### Bug Fixes

* keep the visible result of word fields ([29ff360](https://github.com/bataak/spellchecker/commit/29ff3603d1489f076a1963e032794fa85f68d424))

## [1.57.1](https://github.com/bataak/spellchecker/compare/v1.57.0...v1.57.1) (2026-08-02)


### Bug Fixes

* keep trailing quotes and apostrophes out of words ([52c30eb](https://github.com/bataak/spellchecker/commit/52c30ebc704c24d4f7c04ef69c55d5acf01431e1))

## [1.57.0](https://github.com/bataak/spellchecker/compare/v1.56.1...v1.57.0) (2026-08-02)


### Features

* suggest inserting a space at a period inside a word ([209c522](https://github.com/bataak/spellchecker/commit/209c52282b11aee22cdb58fadbbab58f7f6e1446))

## [1.56.1](https://github.com/bataak/spellchecker/compare/v1.56.0...v1.56.1) (2026-08-02)


### Bug Fixes

* treat a period between letters as part of the word ([bcbd832](https://github.com/bataak/spellchecker/commit/bcbd8326d35f3ab24629431947fd97858f1b9ee4))

## [1.56.0](https://github.com/bataak/spellchecker/compare/v1.55.0...v1.56.0) (2026-08-02)


### Features

* support office documents, line numbers and code-aware checking ([0b85c45](https://github.com/bataak/spellchecker/commit/0b85c4548da4593ac71610afc3b1d37d2683b81a))

## [1.55.0](https://github.com/bataak/spellchecker/compare/v1.54.3...v1.55.0) (2026-07-31)


### Features

* add new stems and 40 REP pairs to mn_MN ([27af596](https://github.com/bataak/spellchecker/commit/27af596b3d5fa6457bf6aaef52da14fcff273857))

## [1.54.3](https://github.com/bataak/spellchecker/compare/v1.54.2...v1.54.3) (2026-07-31)


### Bug Fixes

* correct paste button tooltip wording ([4351de6](https://github.com/bataak/spellchecker/commit/4351de61e4fad26a239370b5811130cc13741dec))
* repaint error marks immediately after a selection delete ([dbd9505](https://github.com/bataak/spellchecker/commit/dbd950552ac0b42b729d5831dbcc9370c80a7f62))
* sync empty-state aria-hidden with visibility ([d7e096a](https://github.com/bataak/spellchecker/commit/d7e096af9e444cca8d79e6cc3e0ba1cf477ce7c5))

## [1.54.2](https://github.com/bataak/spellchecker/compare/v1.54.1...v1.54.2) (2026-07-27)


### Bug Fixes

* keep suggest submit button disabled from send until dialog closes ([c09fa2e](https://github.com/bataak/spellchecker/commit/c09fa2e3d73544b9027cb4b8c1b553e0f4002950))

## [1.54.1](https://github.com/bataak/spellchecker/compare/v1.54.0...v1.54.1) (2026-07-23)


### Bug Fixes

* prevent duplicate survey submission after success ([a364f5f](https://github.com/bataak/spellchecker/commit/a364f5f73a241349abd9ebf47adbc05684965c5d))

## [1.54.0](https://github.com/bataak/spellchecker/compare/v1.53.1...v1.54.0) (2026-07-23)


### Features

* add Толь link to toolbar ([68e1936](https://github.com/bataak/spellchecker/commit/68e1936a3bfd1c6ae330fee3da0f7a31f93854da))

## [1.53.1](https://github.com/bataak/spellchecker/compare/v1.53.0...v1.53.1) (2026-07-22)


### Bug Fixes

* return focus to editor when dictionary menu closes ([79b59c2](https://github.com/bataak/spellchecker/commit/79b59c23de9e54e11cab29d866f0ca6d5eee6711))

## [1.53.0](https://github.com/bataak/spellchecker/compare/v1.52.1...v1.53.0) (2026-07-22)


### Features

* choose active English dictionary (British / American) ([e9435ae](https://github.com/bataak/spellchecker/commit/e9435aef01eabb032dbe3eff4c3c7a19e1618c5c))

## [1.52.1](https://github.com/bataak/spellchecker/compare/v1.52.0...v1.52.1) (2026-07-20)


### Bug Fixes

* allow survey dialog scrolling on mobile ([4f3d9c3](https://github.com/bataak/spellchecker/commit/4f3d9c3239e38fb256a7b4d3ff48864cac9d06ab))
* correct survey validation message wording ([877a766](https://github.com/bataak/spellchecker/commit/877a76640fad31f98ad81279b22724ff5db053c0))

## [1.52.0](https://github.com/bataak/spellchecker/compare/v1.51.0...v1.52.0) (2026-07-20)


### Features

* open survey after idle delay in addition to finish signals ([f1cf12f](https://github.com/bataak/spellchecker/commit/f1cf12f471e56d50191553f20c3e08ddb243435e))

## [1.51.0](https://github.com/bataak/spellchecker/compare/v1.50.3...v1.51.0) (2026-07-18)


### Features

* add one-time satisfaction survey dialog ([9da04e7](https://github.com/bataak/spellchecker/commit/9da04e75f1fac7c653ec60572b5bc3772541cd44))

## [1.50.3](https://github.com/bataak/spellchecker/compare/v1.50.2...v1.50.3) (2026-07-15)


### Bug Fixes

* **suggest:** revert idle Turnstile prewarm (reload regression on iOS) ([1831eed](https://github.com/bataak/spellchecker/commit/1831eed8fcd1855db9108604727f697dbc88045c))

## [1.50.2](https://github.com/bataak/spellchecker/compare/v1.50.1...v1.50.2) (2026-07-15)


### Bug Fixes

* **suggest:** prewarm Turnstile challenge at idle to prevent iOS page kill ([854c9d4](https://github.com/bataak/spellchecker/commit/854c9d44dbe9590d79dd554cdfdc4317a3e8dea9))

## [1.50.1](https://github.com/bataak/spellchecker/compare/v1.50.0...v1.50.1) (2026-07-15)


### Bug Fixes

* **suggest:** prewarm Turnstile challenge at idle to prevent iOS page kill ([87209fd](https://github.com/bataak/spellchecker/commit/87209fd4c0c164ce5919fbc8ff9ae27caad72867))

## [1.50.0](https://github.com/bataak/spellchecker/compare/v1.49.2...v1.50.0) (2026-07-14)


### Features

* copy suggestion words via Ctrl+C and long-press ([caa1181](https://github.com/bataak/spellchecker/commit/caa118117360fe29d1788bda07b615d64c80ce2e))

## [1.49.2](https://github.com/bataak/spellchecker/compare/v1.49.1...v1.49.2) (2026-07-14)


### Bug Fixes

* scope Ctrl+C to suggestion words while dialog is open ([33ef1ab](https://github.com/bataak/spellchecker/commit/33ef1ab3deb34ed557008d8102d6508a9dec0961))

## [1.49.1](https://github.com/bataak/spellchecker/compare/v1.49.0...v1.49.1) (2026-07-13)


### Bug Fixes

* prevent backdrop mark drift when text ends with blank lines ([8248a9f](https://github.com/bataak/spellchecker/commit/8248a9f89dc60059d6c676e91f886ce2e148582f))

## [1.49.0](https://github.com/bataak/spellchecker/compare/v1.48.1...v1.49.0) (2026-07-11)


### Features

* rotate placeholder tips randomly ([d02e4e5](https://github.com/bataak/spellchecker/commit/d02e4e521051e15ea826beaf7a1ac0257b3cf8ab))

## [1.48.1](https://github.com/bataak/spellchecker/compare/v1.48.0...v1.48.1) (2026-07-10)


### Bug Fixes

* merge stems with a dropped vowel while keeping consonant-skip suffix handling ([b85356a](https://github.com/bataak/spellchecker/commit/b85356abcc983f350abba80a97661ce267d779b0))

## [1.48.0](https://github.com/bataak/spellchecker/compare/v1.47.0...v1.48.0) (2026-07-09)


### Features

* show font size controls on mobile toolbar ([d542081](https://github.com/bataak/spellchecker/commit/d5420818c22cceacbd594764e4a4a1d73760d49b))


### Bug Fixes

* prevent double-tap zoom on buttons and links ([c637ab9](https://github.com/bataak/spellchecker/commit/c637ab992639eb319a1fb868426e34028b149715))

## [1.47.0](https://github.com/bataak/spellchecker/compare/v1.46.2...v1.47.0) (2026-07-08)


### Features

* add morphology-based root dedup and extract testable helper modules ([2b26550](https://github.com/bataak/spellchecker/commit/2b26550ef686bd960bc2494b85fbc254aeb7b033))

## [1.46.2](https://github.com/bataak/spellchecker/compare/v1.46.1...v1.46.2) (2026-07-08)


### Bug Fixes

* cap consecutive single-char morphemes to prevent conflating distinct stems like Шилхинцэг/Шилгэнцэг ([2063267](https://github.com/bataak/spellchecker/commit/2063267d2b3053cd86b4ec34fb3551fcb0ebf7a2))

## [1.46.1](https://github.com/bataak/spellchecker/compare/v1.46.0...v1.46.1) (2026-07-08)


### Bug Fixes

* wrap submitted-words title count in muted count span ([2ab341a](https://github.com/bataak/spellchecker/commit/2ab341ac4060d0f937829f42bfbd8ebd2cde79b7))

## [1.46.0](https://github.com/bataak/spellchecker/compare/v1.45.0...v1.46.0) (2026-07-08)


### Features

* show word counts in suggest and ignore dialogs with consistent styling ([890f783](https://github.com/bataak/spellchecker/commit/890f7836ff46ade44b6b8375bcd0f8b67982e3f1))

## [1.45.0](https://github.com/bataak/spellchecker/compare/v1.44.0...v1.45.0) (2026-07-07)


### Features

* show word count in suggest label, red when over the limit ([cf61f6a](https://github.com/bataak/spellchecker/commit/cf61f6aba43e5bb56b7d604c9c11582eed50d9cb))

## [1.44.0](https://github.com/bataak/spellchecker/compare/v1.43.0...v1.44.0) (2026-07-07)


### Features

* add submitted-words view, morphology-based root dedup, and mobile long-press to suggest dialog ([063bfaf](https://github.com/bataak/spellchecker/commit/063bfafb5e9edebb648aa845bf2b54d516b3e814))
* style submitted-words view, clear-all button, and condensed mobile action row ([eb22f89](https://github.com/bataak/spellchecker/commit/eb22f898255640377deaa02233a934ad051ec548))


### Bug Fixes

* require letters in checkable tokens and pass isDashSuffix to suggest ([b76c34a](https://github.com/bataak/spellchecker/commit/b76c34a3bd4ae2bc243d359c22f3b7d15a31147d))

## [1.43.0](https://github.com/bataak/spellchecker/compare/v1.42.0...v1.43.0) (2026-07-06)


### Features

* **dict:** update mn_MN to 2026.07.06 (620149 stems, +14 REP rules) ([a5071fd](https://github.com/bataak/spellchecker/commit/a5071fdda0faeb25310d87f0a45b7407d0c3fbfc))
* prefill all error words and cap suggestions at 50 ([28d17ce](https://github.com/bataak/spellchecker/commit/28d17ce58147e6ac5e9d739d3711cd9c775b41cc))


### Bug Fixes

* keep suggest chip overflow cut at half a row on all devices ([a76e9e5](https://github.com/bataak/spellchecker/commit/a76e9e5713901e2656a054200f389cb66dc73a61))

## [1.42.0](https://github.com/bataak/spellchecker/compare/v1.41.0...v1.42.0) (2026-07-06)


### Features

* **dict:** update mn_MN to 2026.07.06 (620149 stems, +14 REP rules) ([a5071fd](https://github.com/bataak/spellchecker/commit/a5071fdda0faeb25310d87f0a45b7407d0c3fbfc))

## [1.41.0](https://github.com/bataak/spellchecker/compare/v1.40.0...v1.41.0) (2026-07-06)


### Features

* add help link and submitted-words link, refine suggest hint ([465af91](https://github.com/bataak/spellchecker/commit/465af91b66317a0bbb1094755f07a3d6c59b78f4))

## [1.40.0](https://github.com/bataak/spellchecker/compare/v1.39.1...v1.40.0) (2026-07-05)


### Features

* scrollable chip lists, unlimited prefill, and improved ignore dialog layout ([6cbafe7](https://github.com/bataak/spellchecker/commit/6cbafe74e9d31338150e59af4c123a0cf29372e3))

## [1.39.1](https://github.com/bataak/spellchecker/compare/v1.39.0...v1.39.1) (2026-07-05)


### Bug Fixes

* rename mobile toolbar ignore button to Үг алгасах ([7991fcf](https://github.com/bataak/spellchecker/commit/7991fcf64c0caad6c09b4d01e7a8fc10ba864f1a))

## [1.39.0](https://github.com/bataak/spellchecker/compare/v1.38.1...v1.39.0) (2026-07-05)


### Features

* add ignore-word feature with case-aware matching, management dialog, and import/export ([dd1a4ac](https://github.com/bataak/spellchecker/commit/dd1a4ac49b9cbf8910ebbabc28caf0cd5bc3e96f))

## [1.38.1](https://github.com/bataak/spellchecker/compare/v1.38.0...v1.38.1) (2026-07-05)


### Bug Fixes

* don't hijack keyboard shortcuts when form inputs are focused ([89ee404](https://github.com/bataak/spellchecker/commit/89ee4047968ceaf61c346079367fbc2da5abc548))

## [1.38.0](https://github.com/bataak/spellchecker/compare/v1.37.0...v1.38.0) (2026-07-05)


### Features

* refine suggestion form layout and Enter submission ([0df34af](https://github.com/bataak/spellchecker/commit/0df34aff00c930d43c7683d289353267b5c4687d))

## [1.37.0](https://github.com/bataak/spellchecker/compare/v1.36.0...v1.37.0) (2026-07-05)


### Features

* match suggestion input font size to editor on desktop ([920d24a](https://github.com/bataak/spellchecker/commit/920d24a2c6408f768dafe1fd7e885a0fa2df94f2))

## [1.36.0](https://github.com/bataak/spellchecker/compare/v1.35.0...v1.36.0) (2026-07-05)


### Features

* remove word input placeholder ([35b72c0](https://github.com/bataak/spellchecker/commit/35b72c036620e0c5a40a95413c2bdf71c3d35e56))

## [1.35.0](https://github.com/bataak/spellchecker/compare/v1.34.1...v1.35.0) (2026-07-05)


### Features

* restore placeholder in word input matching main editor style ([d837dc9](https://github.com/bataak/spellchecker/commit/d837dc937eae92cc88b3d1f0bf7ac48f546262f3))

## [1.34.1](https://github.com/bataak/spellchecker/compare/v1.34.0...v1.34.1) (2026-07-05)


### Bug Fixes

* resolve merge conflict markers in suggest.js ([9e73039](https://github.com/bataak/spellchecker/commit/9e73039684e792627817b8c7e60e855fbfd8ca1c))

## [1.34.0](https://github.com/bataak/spellchecker/compare/v1.33.0...v1.34.0) (2026-07-05)


### Features

* switch Turnstile to invisible mode ([0ce7103](https://github.com/bataak/spellchecker/commit/0ce71037f04d87039622a0203ddd92ce73f9aea1))

## [1.33.0](https://github.com/bataak/spellchecker/compare/v1.32.0...v1.33.0) (2026-07-04)


### Features

* prefill error words as chips, mobile fullscreen form ([1865525](https://github.com/bataak/spellchecker/commit/18655254dcafb7e5444c9095949a9a0f0d3c9cc1))

## [1.32.0](https://github.com/bataak/spellchecker/compare/v1.31.0...v1.32.0) (2026-07-04)


### Features

* support multiple word chips in suggestion form ([31bc41f](https://github.com/bataak/spellchecker/commit/31bc41f3fd8b9c6a2a600c8a2f78297eedb62836))

## [1.31.0](https://github.com/bataak/spellchecker/compare/v1.30.0...v1.31.0) (2026-07-04)


### Features

* add word suggestion form with Turnstile verification ([d6eccc8](https://github.com/bataak/spellchecker/commit/d6eccc85146a46c9fe495f1be579cb6348ed464e))
* add word suggestion links to error panel and toolbar ([1a54a83](https://github.com/bataak/spellchecker/commit/1a54a8384a8b6735a32c4df54da241c1953fd3a0))

## [1.30.0](https://github.com/bataak/spellchecker/compare/v1.29.0...v1.30.0) (2026-07-04)


### Features

* add word submission link to toolbar for mobile ([9d59d88](https://github.com/bataak/spellchecker/commit/9d59d8843a9989a7549d16480e2e5325b6d218f0))

## [1.29.0](https://github.com/bataak/spellchecker/compare/v1.28.2...v1.29.0) (2026-07-04)


### Features

* add new word submission link to error panel footer ([18bbc7c](https://github.com/bataak/spellchecker/commit/18bbc7c19b0cf7912e37b27c2c2a7a4c97efe5b8))

## [1.28.2](https://github.com/bataak/spellchecker/compare/v1.28.1...v1.28.2) (2026-07-04)


### Bug Fixes

* contain editor overscroll so touch scroll doesn't move the page on iOS ([4c97579](https://github.com/bataak/spellchecker/commit/4c975792780334094165011f95f7afdefee55a0c))

## [1.28.1](https://github.com/bataak/spellchecker/compare/v1.28.0...v1.28.1) (2026-07-04)


### Bug Fixes

* surface batch-check progress and format status counts ([5d29ac0](https://github.com/bataak/spellchecker/commit/5d29ac05536df99b3470789f17373f687fd1c370))

## [1.28.0](https://github.com/bataak/spellchecker/compare/v1.27.0...v1.28.0) (2026-07-03)


### Features

* two-tier draft storage, windowed rendering, revert status effect ([5d81cb0](https://github.com/bataak/spellchecker/commit/5d81cb0c735b7c224b660177b8e5b020f75061f0))


### Bug Fixes

* restore status reveal effect styles ([faf2d55](https://github.com/bataak/spellchecker/commit/faf2d5545eebbfb25daba522e3f23742faf6f324))

## [1.27.0](https://github.com/bataak/spellchecker/compare/v1.26.16...v1.27.0) (2026-07-03)


### Features

* move clear shortcut to Ctrl+Shift+Backspace and harden core logic ([9fcdc42](https://github.com/bataak/spellchecker/commit/9fcdc42ef1122a2a373f7bf4d4c999d3f551be27))

## [1.26.16](https://github.com/bataak/spellchecker/compare/v1.26.15...v1.26.16) (2026-07-03)


### Bug Fixes

* do not flag cyrillic words when the mn dictionary is unavailable ([ac6ef36](https://github.com/bataak/spellchecker/commit/ac6ef3634a4412cda5e94692b0f1b52a07c2f3e4))


### Performance Improvements

* start mongolian checking as soon as mn_MN loads ([4d0dea2](https://github.com/bataak/spellchecker/commit/4d0dea29bdcdb5fd9ad6e14ab273531f88ce50e6))

## [1.26.15](https://github.com/bataak/spellchecker/compare/v1.26.14...v1.26.15) (2026-07-03)


### Bug Fixes

* serve wasm from precache offline via cache-first fetch ([c00d4ba](https://github.com/bataak/spellchecker/commit/c00d4badbde8230b1a4316a5175033c7367bc073))

## [1.26.14](https://github.com/bataak/spellchecker/compare/v1.26.13...v1.26.14) (2026-07-02)


### Bug Fixes

* detect gzip by magic bytes, not filename ([7f0a987](https://github.com/bataak/spellchecker/commit/7f0a9873bbc4a1c49f3abf90182fd81dcc9a880f))
* fail safe when a gz dictionary is missing or malformed ([dbd72e9](https://github.com/bataak/spellchecker/commit/dbd72e9bfc9865d73918ffa10dde10a195ec23aa))

## [1.26.13](https://github.com/bataak/spellchecker/compare/v1.26.12...v1.26.13) (2026-07-02)


### Bug Fixes

* load dicts from precache with ignoreSearch offline ([b5df2d1](https://github.com/bataak/spellchecker/commit/b5df2d13a2fbda0574624233f58f9e4a730b6393))

## [1.26.12](https://github.com/bataak/spellchecker/compare/v1.26.11...v1.26.12) (2026-07-02)


### Bug Fixes

* remove redundant dict runtimeCaching route ([cd9e191](https://github.com/bataak/spellchecker/commit/cd9e1919771b9e6c5d20f9490b96c91b3c9f530f))

## [1.26.11](https://github.com/bataak/spellchecker/compare/v1.26.10...v1.26.11) (2026-07-02)


### Bug Fixes

* restore paste fallback hint on newer ios ([0c24ae3](https://github.com/bataak/spellchecker/commit/0c24ae34debfe104b94180010d855af7ceb35205))

## [1.26.10](https://github.com/bataak/spellchecker/compare/v1.26.9...v1.26.10) (2026-07-02)


### Bug Fixes

* restore native paste callout over paste button ([83bbe30](https://github.com/bataak/spellchecker/commit/83bbe30e0743348a070230b9faad084c169dd28c))

## [1.26.9](https://github.com/bataak/spellchecker/compare/v1.26.8...v1.26.9) (2026-07-01)


### Bug Fixes

* move placeholder out of editor-wrap so it fades in place without shifting when error panel opens ([025b378](https://github.com/bataak/spellchecker/commit/025b378d99782444911b436ae82335e709293601))

## [1.26.8](https://github.com/bataak/spellchecker/compare/v1.26.7...v1.26.8) (2026-07-01)


### Bug Fixes

* hide placeholder on first character instead of waiting for separator input ([7fbc0b8](https://github.com/bataak/spellchecker/commit/7fbc0b8b392579f04f88942c1d4c344ee13dfa72))

## [1.26.7](https://github.com/bataak/spellchecker/compare/v1.26.6...v1.26.7) (2026-07-01)


### Bug Fixes

* call file input click before decorative trigger to preserve user activation on Ctrl+O ([1442497](https://github.com/bataak/spellchecker/commit/1442497433eb51dc7fec55b2eea00abe54cda5d3))

## [1.26.6](https://github.com/bataak/spellchecker/compare/v1.26.5...v1.26.6) (2026-07-01)


### Bug Fixes

* defer booting class removal until after text restore to stop placeholder flash on refresh ([33ff248](https://github.com/bataak/spellchecker/commit/33ff248a2a9b54b20d44021f41c1e5709fdc58d3))

## [1.26.5](https://github.com/bataak/spellchecker/compare/v1.26.4...v1.26.5) (2026-07-01)


### Bug Fixes

* drive empty-state via value length instead of :placeholder-shown to stop flicker during IME composition ([d5462ff](https://github.com/bataak/spellchecker/commit/d5462ff63351413f1ccb117021949c780b543c2f))

## [1.26.4](https://github.com/bataak/spellchecker/compare/v1.26.3...v1.26.4) (2026-07-01)


### Bug Fixes

* remove booting class in main.js as fallback to restore placeholder ([c84fabc](https://github.com/bataak/spellchecker/commit/c84fabc4eaef00db830bf4975c44627185d442cc))

## [1.26.3](https://github.com/bataak/spellchecker/compare/v1.26.2...v1.26.3) (2026-07-01)


### Bug Fixes

* open file synchronously on Ctrl+O in Firefox to preserve user activation ([20e9c71](https://github.com/bataak/spellchecker/commit/20e9c7108d5405e55c466770b6567870164d6d63))

## [1.26.2](https://github.com/bataak/spellchecker/compare/v1.26.1...v1.26.2) (2026-07-01)


### Bug Fixes

* suppress empty-state placeholder flash on reload ([216b01f](https://github.com/bataak/spellchecker/commit/216b01f2b1a3acd4e07291e63e01c20ed3342701))

## [1.26.1](https://github.com/bataak/spellchecker/compare/v1.26.0...v1.26.1) (2026-07-01)


### Bug Fixes

* ignore soft hyphen (U+00AD) via IGNORE directive ([db184dc](https://github.com/bataak/spellchecker/commit/db184dca92c72e5952d95d6aacddd7ea97dd55a5))
* treat soft hyphen (U+00AD) as word-continuation in tokenizer ([b16ca1e](https://github.com/bataak/spellchecker/commit/b16ca1e3b9ec3de9cf85664e877b07384c460dd1))

## [1.26.0](https://github.com/bataak/spellchecker/compare/v1.25.0...v1.26.0) (2026-06-29)


### Features

* dash-suffix parity for en/em dash, scale suggestion count ([e59d572](https://github.com/bataak/spellchecker/commit/e59d572504c711a011fa83a316724af72417193c))

## [1.25.0](https://github.com/bataak/spellchecker/compare/v1.24.7...v1.25.0) (2026-06-29)


### Features

* coordinate clear/save toolbar snap, rename rule link ([5ef7f39](https://github.com/bataak/spellchecker/commit/5ef7f3921cc8002ed8df7594dcc6fa32a41825e3))

## [1.24.7](https://github.com/bataak/spellchecker/compare/v1.24.6...v1.24.7) (2026-06-28)


### Bug Fixes

* restore readText paste flow broken by pre-focus ([efe54c6](https://github.com/bataak/spellchecker/commit/efe54c6d44d1b7ba6c9b3821b84faa595ccd67fb))

## [1.24.6](https://github.com/bataak/spellchecker/compare/v1.24.5...v1.24.6) (2026-06-28)


### Bug Fixes

* guide native paste on touch when clipboard read is blocked ([13d57c0](https://github.com/bataak/spellchecker/commit/13d57c02834d128ff178c0585b1d3b437eea7481))

## [1.24.5](https://github.com/bataak/spellchecker/compare/v1.24.4...v1.24.5) (2026-06-28)


### Bug Fixes

* show paste guidance in status bar when clipboard read fails ([c9d2be9](https://github.com/bataak/spellchecker/commit/c9d2be91ce21bf4e8be34245508ba7b2983659cf))

## [1.24.4](https://github.com/bataak/spellchecker/compare/v1.24.3...v1.24.4) (2026-06-27)


### Bug Fixes

* route ios paste to native menu after clipboard read is blocked ([43f8f5d](https://github.com/bataak/spellchecker/commit/43f8f5deb9ff940aa34a824bfd77ce4493947383))

## [1.24.3](https://github.com/bataak/spellchecker/compare/v1.24.2...v1.24.3) (2026-06-27)


### Bug Fixes

* retry clipboard read after ios paste permission grant ([b315785](https://github.com/bataak/spellchecker/commit/b315785bc43e69bdee75d60de406ef32a12f573b))

## [1.24.2](https://github.com/bataak/spellchecker/compare/v1.24.1...v1.24.2) (2026-06-27)


### Bug Fixes

* graceful paste fallback when clipboard read is blocked ([c5ea370](https://github.com/bataak/spellchecker/commit/c5ea370235e38cb4d971526799354d18be67de49))

## [1.24.1](https://github.com/bataak/spellchecker/compare/v1.24.0...v1.24.1) (2026-06-27)


### Bug Fixes

* focus editor before clipboard read for ios 26 paste ([3e5e0ce](https://github.com/bataak/spellchecker/commit/3e5e0ce113deeb4437b322bc300a17b101d9e0e3))

## [1.24.0](https://github.com/bataak/spellchecker/compare/v1.23.3...v1.24.0) (2026-06-26)


### Features

* show repeat-count badge in error panel ([fbcd5eb](https://github.com/bataak/spellchecker/commit/fbcd5eb95ddb48e9f5e6c206af3c4f4cadc40485))

## [1.23.3](https://github.com/bataak/spellchecker/compare/v1.23.2...v1.23.3) (2026-06-25)


### Bug Fixes

* drop clear-button snap anchor in toolbar ([9c8a567](https://github.com/bataak/spellchecker/commit/9c8a5679995d9ee797cfbf005bd464b530f20ba4))

## [1.23.2](https://github.com/bataak/spellchecker/compare/v1.23.1...v1.23.2) (2026-06-25)


### Bug Fixes

* guard against iOS smart-delete merging adjacent words ([c7636fb](https://github.com/bataak/spellchecker/commit/c7636fb0b43f2b96126f8ce8522ba4640026ae54))

## [1.23.1](https://github.com/bataak/spellchecker/compare/v1.23.0...v1.23.1) (2026-06-25)


### Bug Fixes

* keep replace-all for whole hyphenated tokens ([38fcc41](https://github.com/bataak/spellchecker/commit/38fcc41de45330f831374cb89d1cf4b3652f1050))

## [1.23.0](https://github.com/bataak/spellchecker/compare/v1.22.0...v1.23.0) (2026-06-25)


### Features

* mobile toolbar snap and long-press error-word copy ([2084578](https://github.com/bataak/spellchecker/commit/208457820be6921afedda0210e232416bd3dd785))

## [1.22.0](https://github.com/bataak/spellchecker/compare/v1.21.0...v1.22.0) (2026-06-24)


### Features

* js proximity snap for mobile toolbar ([2705020](https://github.com/bataak/spellchecker/commit/2705020f4f3df9757f9cf6829662729175baaecc))

## [1.21.0](https://github.com/bataak/spellchecker/compare/v1.20.0...v1.21.0) (2026-06-24)


### Features

* soft snap mobile toolbar to clear button ([7d45138](https://github.com/bataak/spellchecker/commit/7d45138e750a5815252c99d12a281d1052012853))

## [1.20.0](https://github.com/bataak/spellchecker/compare/v1.19.1...v1.20.0) (2026-06-24)


### Features

* scroll mobile toolbar to clear button on load ([eef8f3b](https://github.com/bataak/spellchecker/commit/eef8f3bed4f4260da39974688e2e802e8cb57479))

## [1.19.1](https://github.com/bataak/spellchecker/compare/v1.19.0...v1.19.1) (2026-06-24)


### Bug Fixes

* show error count and list only after all dictionaries load ([e762610](https://github.com/bataak/spellchecker/commit/e7626103bed76dfc6a42b89bee25789cc479096c))

## [1.19.0](https://github.com/bataak/spellchecker/compare/v1.18.0...v1.19.0) (2026-06-24)


### Features

* refine status UI and error panel, fix copy and caret behavior ([3f60f20](https://github.com/bataak/spellchecker/commit/3f60f20fc564c963fe7ab6542f403d0bc040c7f8))

## [1.18.0](https://github.com/bataak/spellchecker/compare/v1.17.0...v1.18.0) (2026-06-24)


### Features

* move error count to panel on desktop, animate status messages ([752b419](https://github.com/bataak/spellchecker/commit/752b419a945fec834aeddc55fdc676a799173148))

## [1.17.0](https://github.com/bataak/spellchecker/compare/v1.16.0...v1.17.0) (2026-06-24)


### Features

* move error count to panel title and animate status messages ([099e02c](https://github.com/bataak/spellchecker/commit/099e02cc5451b180030a9f1ea6b7b764845d2f25))

## [1.16.0](https://github.com/bataak/spellchecker/compare/v1.15.1...v1.16.0) (2026-06-24)


### Features

* move error count to panel title and animate status messages ([fed7c73](https://github.com/bataak/spellchecker/commit/fed7c734a0395f1d7bfe891b42af9964068405e8))

## [1.15.1](https://github.com/bataak/spellchecker/compare/v1.15.0...v1.15.1) (2026-06-24)


### Performance Improvements

* move hunspell to web worker for non-blocking spell-check ([41f05b8](https://github.com/bataak/spellchecker/commit/41f05b88d751656b6feb11ea0de15cdab902817b))

## [1.15.0](https://github.com/bataak/spellchecker/compare/v1.14.0...v1.15.0) (2026-06-23)


### Features

* switch dictionaries to versioned gzip with native decompression ([6c8023f](https://github.com/bataak/spellchecker/commit/6c8023fd14cf850d717363ff7f10fb0eea396741))

## [1.14.0](https://github.com/bataak/spellchecker/compare/v1.13.0...v1.14.0) (2026-06-23)


### Features

* improve editor caret handling for paste, reload, and error panel ([28a4ebf](https://github.com/bataak/spellchecker/commit/28a4ebf74e61a64e7fa1900629cfb88a8f0a2dea))

## [1.13.0](https://github.com/bataak/spellchecker/compare/v1.12.1...v1.13.0) (2026-06-23)


### Features

* reflect clean state in error panel title ([4285966](https://github.com/bataak/spellchecker/commit/4285966578b0cd3671021691d3bba7213543dbd8))

## [1.12.1](https://github.com/bataak/spellchecker/compare/v1.12.0...v1.12.1) (2026-06-22)


### Bug Fixes

* downgrade hunspell engine to 1.7.2 for correct suggestions ([3273073](https://github.com/bataak/spellchecker/commit/327307338bc73793d62467977d3cdd04658c3d4a))

## [1.12.0](https://github.com/bataak/spellchecker/compare/v1.11.0...v1.12.0) (2026-06-22)


### Features

* add desktop error-word panel and related editor fixes ([d8b0aa0](https://github.com/bataak/spellchecker/commit/d8b0aa0fe963826696c880a45375dbccfdb921de))

## [1.11.0](https://github.com/bataak/spellchecker/compare/v1.10.0...v1.11.0) (2026-06-22)


### Features

* add desktop error-word panel with copy and jump-to-word ([9d16747](https://github.com/bataak/spellchecker/commit/9d16747039e2afcccd1ea755fcb7f002a2c0b63a))

## [1.10.0](https://github.com/bataak/spellchecker/compare/v1.9.5...v1.10.0) (2026-06-22)


### Features

* **suggest:** close popover on deliberate editor scroll ([bba1200](https://github.com/bataak/spellchecker/commit/bba120061511d96c3236455268f38106ba0eec5a))

## [1.9.5](https://github.com/bataak/spellchecker/compare/v1.9.4...v1.9.5) (2026-06-21)


### Bug Fixes

* **suggest:** switch to rotemdan prebuilt wasm for speed ([ae58a3f](https://github.com/bataak/spellchecker/commit/ae58a3f2dee3fa61e5ee2179d0bfc2ec24eaee76))

## [1.9.4](https://github.com/bataak/spellchecker/compare/v1.9.3...v1.9.4) (2026-06-21)


### Bug Fixes

* **suggest:** vendor -O0 hunspell build, drop case-fallback ([2fe420f](https://github.com/bataak/spellchecker/commit/2fe420f994aeea5906c4b232a952973201ac23a8))

## [1.9.3](https://github.com/bataak/spellchecker/compare/v1.9.2...v1.9.3) (2026-06-20)


### Bug Fixes

* **suggest:** fall back to lowercase for Cyrillic uppercase words ([4291f2b](https://github.com/bataak/spellchecker/commit/4291f2b20ab8964c74ae129beed2b00f13a84e45))

## [1.9.2](https://github.com/bataak/spellchecker/compare/v1.9.1...v1.9.2) (2026-06-20)


### Bug Fixes

* **pwa:** add standard mobile-web-app-capable meta tag ([73520c1](https://github.com/bataak/spellchecker/commit/73520c1ba1412efcc6798c5b163eaf8208699019))

## [1.9.1](https://github.com/bataak/spellchecker/compare/v1.9.0...v1.9.1) (2026-06-20)


### Bug Fixes

* **offline:** show readiness on first load + collapsible version ([efa01f8](https://github.com/bataak/spellchecker/commit/efa01f840cd6852e7059a7b776a4314013e88511))

## [1.9.0](https://github.com/bataak/spellchecker/compare/v1.8.1...v1.9.0) (2026-06-20)


### Features

* **ui:** collapsible version label in toolbar ([adf111e](https://github.com/bataak/spellchecker/commit/adf111ed041e6b1e988f5dd85ee470c2aba420c8))

## [1.8.1](https://github.com/bataak/spellchecker/compare/v1.8.0...v1.8.1) (2026-06-20)


### Bug Fixes

* **spell:** vendor rebuilt hunspell.wasm with full suggestions ([60c48a0](https://github.com/bataak/spellchecker/commit/60c48a04e185aee4f9caab1a14ece1be301a3937))

## [1.8.0](https://github.com/bataak/spellchecker/compare/v1.7.2...v1.8.0) (2026-06-19)


### Features

* show dictionary version in footer ([c6d88d0](https://github.com/bataak/spellchecker/commit/c6d88d06c4c1f26ea97570e2a627d74ef8c523e6))

## [1.7.2](https://github.com/bataak/spellchecker/compare/v1.7.1...v1.7.2) (2026-06-18)


### Bug Fixes

* drop offline network requests and reword readiness status ([a8f1d83](https://github.com/bataak/spellchecker/commit/a8f1d83261fcd60fe1b9a361d0f32d5908faabf6))

## [1.7.1](https://github.com/bataak/spellchecker/compare/v1.7.0...v1.7.1) (2026-06-18)


### Bug Fixes

* prevent blank offline launch and make readiness check accurate ([4c1f8cb](https://github.com/bataak/spellchecker/commit/4c1f8cb8d15c7096ed087e93b8dea8a3c4931a9f))

## [1.7.0](https://github.com/bataak/spellchecker/compare/v1.6.4...v1.7.0) (2026-06-18)


### Features

* add keyboard shortcuts with OS-aware hints ([7139f57](https://github.com/bataak/spellchecker/commit/7139f57b442e0cbdaf41a4ba6b9d54ee28ee477e))
* in-place save on Chrome, Open button everywhere, faster CI ([e1bbec0](https://github.com/bataak/spellchecker/commit/e1bbec0a72a10b94702b6086e6494afb94916c13))
* native undo/redo for programmatic edits ([d6b9621](https://github.com/bataak/spellchecker/commit/d6b96219d46e5884ae41f6f82c127fa9bd863462))
* offline support, iOS safe-area, Open button, renamed home label ([4b44a9f](https://github.com/bataak/spellchecker/commit/4b44a9f395910e54b2cc5d73cbb2555ab7b845a4))
* persistence, installable PWA, dictionary-driven hyphen checks, and UI polish ([cd3875f](https://github.com/bataak/spellchecker/commit/cd3875f49fdbbd2b3fa08b0fb21adfac5bc13a87))
* reliable offline PWA via durable storage and readiness indicator ([964d1b2](https://github.com/bataak/spellchecker/commit/964d1b294f8b0d2382292515325c967fdde56b10))
* remember opened file name for save, add drag-and-drop open ([428943a](https://github.com/bataak/spellchecker/commit/428943ad2e07ddace0b08d5eecb292aaf6527c63))
* show app version in toolbar from package.json ([d645a9a](https://github.com/bataak/spellchecker/commit/d645a9a80882a3743bce411e019c7b135bee8fc2))
* show hunspell version in app footer ([56963f1](https://github.com/bataak/spellchecker/commit/56963f182d5e0c6dc780f31b5a04a144f079a874))
* **ui:** desktop font-size controls + tooltip/label fixes ([29e06f9](https://github.com/bataak/spellchecker/commit/29e06f9001855ef5d7d4db83c0b105262690edc3))


### Bug Fixes

* **config:** resolve offline white-screen crash in PWA ([afd7007](https://github.com/bataak/spellchecker/commit/afd7007e0751f17afb090f4f33ccf28ad099fdea))
* guarantee the app renders offline regardless of the module script ([8d3845b](https://github.com/bataak/spellchecker/commit/8d3845ba9b3740273714231b65752a2bd28dda92))
* hyphen-suffix tokenizing, viewport-fit layout, keyboard-aware suggestion popover ([dc6c41e](https://github.com/bataak/spellchecker/commit/dc6c41e3d5427274ec71af4e441431992986719e))
* preserve each occurrence's own case when replacing words ([a4cb5b6](https://github.com/bataak/spellchecker/commit/a4cb5b67caea29918dd04cf3522b868893675dfd))
* prevent blank screen on offline launch ([3c571e9](https://github.com/bataak/spellchecker/commit/3c571e9ad587619cc7746cae6a33204dc9412b3d))
* **pwa:** optimize precaching for reliable first-time offline boot ([4e4df96](https://github.com/bataak/spellchecker/commit/4e4df96eaceae8afd75e222b984251ecedf0c6f3))
* swap copy/save buttons and shorten saved filename on mobile ([af9c89c](https://github.com/bataak/spellchecker/commit/af9c89cd11bd28e85ca8ca56ee70ccee5167a730))
* **ui:** make mobile status bar a single-line horizontal scroll (hidden scrollbar) ([816054e](https://github.com/bataak/spellchecker/commit/816054e2d48a55b5a2fcb7efbde9e7c94ddee39c))
* use a dark theme-color so iOS safe areas aren't red ([be2d6f0](https://github.com/bataak/spellchecker/commit/be2d6f0b8f140e2e9ce4913ff08ffb58dda715e0))

## [1.6.4](https://github.com/bataak/spellchecker/compare/v1.6.3...v1.6.4) (2026-06-18)


### Bug Fixes

* **pwa:** optimize precaching for reliable first-time offline boot ([4e4df96](https://github.com/bataak/spellchecker/commit/4e4df96eaceae8afd75e222b984251ecedf0c6f3))

## [1.6.3](https://github.com/bataak/spellchecker/compare/v1.6.2...v1.6.3) (2026-06-18)


### Bug Fixes

* **config:** resolve offline white-screen crash in PWA ([afd7007](https://github.com/bataak/spellchecker/commit/afd7007e0751f17afb090f4f33ccf28ad099fdea))

## [1.6.2](https://github.com/bataak/spellchecker/compare/v1.6.1...v1.6.2) (2026-06-18)


### Bug Fixes

* use a dark theme-color so iOS safe areas aren't red ([be2d6f0](https://github.com/bataak/spellchecker/commit/be2d6f0b8f140e2e9ce4913ff08ffb58dda715e0))

## [1.6.1](https://github.com/bataak/spellchecker/compare/v1.6.0...v1.6.1) (2026-06-18)


### Bug Fixes

* guarantee the app renders offline regardless of the module script ([8d3845b](https://github.com/bataak/spellchecker/commit/8d3845ba9b3740273714231b65752a2bd28dda92))

## [1.6.0](https://github.com/bataak/spellchecker/compare/v1.5.1...v1.6.0) (2026-06-18)


### Features

* add keyboard shortcuts with OS-aware hints ([7139f57](https://github.com/bataak/spellchecker/commit/7139f57b442e0cbdaf41a4ba6b9d54ee28ee477e))

## [1.5.1](https://github.com/bataak/spellchecker/compare/v1.5.0...v1.5.1) (2026-06-18)


### Bug Fixes

* prevent blank screen on offline launch ([3c571e9](https://github.com/bataak/spellchecker/commit/3c571e9ad587619cc7746cae6a33204dc9412b3d))

## [1.5.0](https://github.com/bataak/spellchecker/compare/v1.4.0...v1.5.0) (2026-06-18)


### Features

* in-place save on Chrome, Open button everywhere, faster CI ([e1bbec0](https://github.com/bataak/spellchecker/commit/e1bbec0a72a10b94702b6086e6494afb94916c13))

## [1.4.0](https://github.com/bataak/spellchecker/compare/v1.3.0...v1.4.0) (2026-06-17)


### Features

* remember opened file name for save, add drag-and-drop open ([428943a](https://github.com/bataak/spellchecker/commit/428943ad2e07ddace0b08d5eecb292aaf6527c63))

## [1.3.0](https://github.com/bataak/spellchecker/compare/v1.2.1...v1.3.0) (2026-06-17)


### Features

* offline support, iOS safe-area, Open button, renamed home label ([4b44a9f](https://github.com/bataak/spellchecker/commit/4b44a9f395910e54b2cc5d73cbb2555ab7b845a4))

## [1.2.1](https://github.com/bataak/spellchecker/compare/v1.2.0...v1.2.1) (2026-06-17)


### Bug Fixes

* swap copy/save buttons and shorten saved filename on mobile ([af9c89c](https://github.com/bataak/spellchecker/commit/af9c89cd11bd28e85ca8ca56ee70ccee5167a730))

## [1.2.0](https://github.com/bataak/spellchecker/compare/v1.1.1...v1.2.0) (2026-06-17)


### Features

* native undo/redo for programmatic edits ([d6b9621](https://github.com/bataak/spellchecker/commit/d6b96219d46e5884ae41f6f82c127fa9bd863462))

## [1.1.1](https://github.com/bataak/spellchecker/compare/v1.1.0...v1.1.1) (2026-06-17)


### Bug Fixes

* preserve each occurrence's own case when replacing words ([a4cb5b6](https://github.com/bataak/spellchecker/commit/a4cb5b67caea29918dd04cf3522b868893675dfd))

## [1.1.0](https://github.com/bataak/spellchecker/compare/v1.0.0...v1.1.0) (2026-06-17)


### Features

* show hunspell version in app footer ([56963f1](https://github.com/bataak/spellchecker/commit/56963f182d5e0c6dc780f31b5a04a144f079a874))

## 1.0.0 (2026-06-16)


### Features

* persistence, installable PWA, dictionary-driven hyphen checks, and UI polish ([cd3875f](https://github.com/bataak/spellchecker/commit/cd3875f49fdbbd2b3fa08b0fb21adfac5bc13a87))
* show app version in toolbar from package.json ([d645a9a](https://github.com/bataak/spellchecker/commit/d645a9a80882a3743bce411e019c7b135bee8fc2))
* **ui:** desktop font-size controls + tooltip/label fixes ([29e06f9](https://github.com/bataak/spellchecker/commit/29e06f9001855ef5d7d4db83c0b105262690edc3))


### Bug Fixes

* hyphen-suffix tokenizing, viewport-fit layout, keyboard-aware suggestion popover ([dc6c41e](https://github.com/bataak/spellchecker/commit/dc6c41e3d5427274ec71af4e441431992986719e))
* **ui:** make mobile status bar a single-line horizontal scroll (hidden scrollbar) ([816054e](https://github.com/bataak/spellchecker/commit/816054e2d48a55b5a2fcb7efbde9e7c94ddee39c))
