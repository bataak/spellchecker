# Монгол үгийн алдаа шалгагч

Интернет хөтчид зориулсан, офлайн горимд ажилладаг монгол болон англи хэлний
үгийн алдаа шалгагч — <https://aldaa.bichig.dev>

Шалгах ажиллагаа зөвхөн таны төхөөрөмж дээр хийгддэг тул мэдээлэл гуравдагч
серверт илгээгдэхгүй, суулгах болон бүртгүүлэх шаардлагагүй, ашиглахад үнэ
төлбөргүй, нээлттэй эх болно.

## Хөгжүүлэлт

Эх код TypeScript дээр бичигдсэн (`src/`, `tests/`). Vite нь build хийхдээ
transpile хийдэг бол `tsc --noEmit` нь зөвхөн төрлийн шалгалт хийнэ.
Тестүүд Node-ийн type stripping ашиглан `.ts` файлыг шууд ажиллуулна.

Шаардлага: Node.js 22.18+.

```sh
npm ci             # шаардлагатай сангуудыг суулгах (эхний удаа)
npm test           # төрлийн шалгалт + бичил шалгалт хийх
npm run typecheck  # зөвхөн төрлийн шалгалт (tsc --noEmit)
npm run dev        # хөгжүүлэлтийн сервер (localhost)
npm run preview    # production build хийж урьдчилан үзэх
npm run build      # production build (dist/)
```

`dev`, `preview`, `build` командууд эхлэхийн өмнө төрлийн болон бичил
шалгалт хийгдэнэ (`predev`/`prepreview`/`prebuild` hook)

Service worker болон офлайн ажиллагааг шалгахдаа `npm run dev` биш
`npm run preview` ашиглана, учир нь dev сервер precache-ийг алгасдаг.

Гар утсан дээр туршихад `npm run test:mobile` ажиллуулаад, өөр терминалд
`cloudflared tunnel --url http://localhost:4173` асаана. Скрипт нь хувилбарыг
хэвлэж, service worker-гүй build хийж түгээнэ.

Толь бичгийн файлууд (`public/dict/`) build хийх үед `pack-dict.sh` файл
нь толинуудыг gzip болгон шахаж `dist/dict/` хавтсанд хуулна.

Commit төрөл нь release-please-ийн хувилбарыг тодорхойлно: `feat:` minor,
`fix:` patch, `style:`/`docs:`/`test:`/`chore:` хувилбар ахиулахгүй.
Push бүрд release PR автоматаар шинэчлэгдэнэ; хуримтлуулж байгаад PR-ыг
squash merge хийхэд release гарна.

## License

Copyright © 2026 Batmunkh Dorjgotov.

This application is licensed under the
[GNU Affero General Public License v3.0](LICENSE). If you run a modified
version of this software as a network service, you must make the complete
corresponding source code available to its users.

The bundled `mn_MN` spelling dictionary is licensed separately under
[MPL-2.0](https://github.com/bataak/dict-mn).

`vendor/hunspell-wasm/` is third-party code distributed under its own
license; see that directory for details.

### Explanatory dictionary data

No explanatory dictionary data is included in this repository. The
dictionary lookup feature reads a user-supplied StarDict file at runtime.

The deployment at https://aldaa.bichig.dev uses «Товч тайлбар толь» from
[toli.query.mn](https://toli.query.mn), under the terms published at
https://toli.query.mn/static/usage, which permit redistribution and
modification with attribution for non-commercial use. That data is not
covered by the AGPL-3.0 license above and is not redistributed here.

If you deploy this software yourself, you are responsible for the terms of
any dictionary data you supply.

For commercial licensing without the AGPL obligations, contact
bataak at gmail tseg com.
