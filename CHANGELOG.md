# Changelog

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
