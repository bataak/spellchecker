# Changelog

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
