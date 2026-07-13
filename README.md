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

Толь бичгийн файлууд (`public/dict/`) build хийх үед `pack-dict.sh` файл
нь толинуудыг gzip болгон шахаж `dist/dict/` хавтсанд хуулна.

Commit төрөл нь release-please-ийн хувилбарыг тодорхойлно: `feat:` minor,
`fix:` patch, `style:`/`docs:`/`test:`/`chore:` хувилбар ахиулахгүй.
Push бүрд release PR автоматаар шинэчлэгдэнэ; хуримтлуулж байгаад PR-ыг
squash merge хийхэд release гарна.
